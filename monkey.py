# monkey.py — Shakespeare, the monkey tester. Works on any web page, no hooks needed.
#
# Opens the page in headless Chromium and mashes it for a while: clicks visible buttons / links / inputs,
# clicks random points (canvas games), presses arrows, WASD, Space, Enter, sometimes Esc.
# Collects uncaught page errors and console errors. It does not understand the rules, so it only answers
# "did anything break?", not "can the game be finished?" (that is shakespeare.js, with hooks).
#
# It also runs the fake-button probe (fake-button.js): things that look like buttons but do nothing when
# pressed, and <button>s that stayed disabled the whole session. Those are warnings and do not affect "ok".
#
#   python monkey.py <url> [--secs 60] [--shot out.png] [--width 2560 --height 1440] [--ignore substring ...]
#
# Prints one JSON line: {"ok": bool, "actions": N, "errors": [...], "fake": [...], "deadButtons": [...]}
# Exit code 1 if there were errors.
import argparse, json, os, random, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(description='Random-click monkey test for a web page.')
ap.add_argument('url')
ap.add_argument('--secs', type=float, default=60)
ap.add_argument('--shot', help='save a screenshot at the end')
ap.add_argument('--width', type=int, default=2560)
ap.add_argument('--height', type=int, default=1440)
ap.add_argument('--ignore', nargs='*', default=[], help='console errors whose text or source URL contains any of these are ignored')
ap.add_argument('--seed', type=int, default=1)
a = ap.parse_args()
sys.stdout.reconfigure(encoding='utf-8')   # Windows consoles default to a legacy codepage; button text can contain emoji

IGNORE = ('fonts.g', 'favicon', *a.ignore)   # font CDNs and a missing favicon are not the page's fault
KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', ' ', 'Enter'] * 3 + ['Escape']
errors, actions = [], 0
random.seed(a.seed)
with sync_playwright() as p:
    # Headless Chromium renders in software by default; 3D pages can drop to a few fps and hang under the monkey.
    # Ask for the GPU (falls back to software on machines without one).
    gpu = ['--enable-gpu', '--ignore-gpu-blocklist'] + (['--use-angle=d3d11'] if sys.platform == 'win32' else [])
    b = p.chromium.launch(args=gpu)
    pg = b.new_page(viewport={'width': a.width, 'height': a.height})
    pg.add_init_script(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fake-button.js'))
    fk = {'text': {}, 'tries': {}, 'oks': {}, 'on': set(), 'off': {}}
    def probe(full=True):   # one probe round; tallies live here because a page reload wipes the page-side record
        try:
            if full:
                rd = pg.evaluate('__fakeProbe()') or {'tried': {}, 'ok': []}
                for k, t in rd['tried'].items():
                    fk['text'][k] = t; fk['tries'][k] = fk['tries'].get(k, 0) + 1; fk['oks'][k] = fk['oks'].get(k, 0) + (k in rd['ok'])
            else: pg.evaluate('__fakeButtons()')
            r = pg.evaluate('__fakeReport()')
            fk['on'].update(r['btnOn']); fk['off'].update(r['btnOff'])
        except Exception:
            pass
    def ignored(m):
        src = (m.location or {}).get('url') or ''   # "Failed to load resource" carries the URL only in its location
        return any(s in m.text or s in src for s in IGNORE)
    pg.on('pageerror', lambda e: errors.append(str(e)[:300]))
    pg.on('console', lambda m: m.type == 'error' and not ignored(m) and errors.append(m.text[:300]))
    pg.on('dialog', lambda d: d.accept() if random.random() < .5 else d.dismiss())
    pg.on('popup', lambda pop: pop.close())
    crashed = []
    pg.on('crash', lambda *_: (crashed.append(1), errors.append('page crashed (Target crashed)')))   # report and stop instead of waiting
    pg.goto(a.url, wait_until='load'); pg.wait_for_timeout(1000)
    probe()   # round 1: the opening screen
    secs = a.secs
    # Wall-clock timing: reading the page clock right as it navigates away throws "Execution context was destroyed".
    t_end = time.time() + secs; probes = [secs / 3, secs * 2 / 3]   # two more rounds mid-run; probe time is not counted
    while not crashed and time.time() < t_end and len(errors) < 20:
        if probes and time.time() > t_end - secs + probes[0]:
            probes.pop(0); t0 = time.time(); probe(); t_end += time.time() - t0
        try:
            r = random.random()
            if r < 0.5:
                els = pg.locator('button:visible, a:visible, [role=button]:visible, input:visible, select:visible, [onclick]:visible')
                n = els.count()
                if n:
                    el = els.nth(random.randrange(n))
                    href = el.get_attribute('href') or ''
                    if href.startswith('http') or href.startswith('mailto:') or href == '/':   # stay on this page
                        continue
                    el.click(timeout=800, force=True)
            elif r < 0.75:
                pg.mouse.click(random.randint(50, a.width - 50), random.randint(50, a.height - 50))
            else:
                pg.keyboard.press(random.choice(KEYS))
            actions += 1
            if actions % 10 == 0: probe(False)
            pg.wait_for_timeout(random.choice([30, 60, 120, 250]))
            if not pg.url.startswith(a.url.split('#')[0].rsplit('/', 1)[0]):   # wandered off: come back
                pg.goto(a.url, wait_until='load')
        except Exception:
            pass   # elements vanish or get covered all the time; the monkey keeps going
    if not crashed: probe()   # closing round
    if a.shot: pg.screenshot(path=a.shot)
    try: b.close()
    except Exception: pass   # after a crash the browser connection is gone; still print the result
fake = [{'sel': k, 'text': t} for k, t in fk['text'].items() if fk['oks'][k] * 2 < fk['tries'][k]]   # responded in fewer than half the rounds
dead = [{'sel': k, 'text': t} for k, t in fk['off'].items() if k not in fk['on']]
print(json.dumps({'ok': not errors, 'actions': actions, 'errors': list(dict.fromkeys(errors))[:8], 'fake': fake, 'deadButtons': dead}, ensure_ascii=False))
sys.stdout.flush(); os._exit(0 if not errors else 1)   # Playwright teardown can hang after a crash; exit directly

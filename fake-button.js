/* fake-button.js — "If it looks like a button, it must press."
   A random-click monkey only catches script errors. It cannot catch a UI that lies: tiles, badges and avatar
   circles that look pressable but do nothing. This probe does.

   monkey.py injects it and calls __fakeProbe() a few times (before play, mid-run, at the end):
     candidates = visible elements that are not button / a / input / select / textarea / [role=button] / [onclick],
                  not inside one and not containing one, at least 16×16 (very large ones are panels),
                  border-radius ≥ 4px, with a background or a border.
                  <kbd> and elements whose class/id say they are labels (hint/tag/badge/label/chip/pill/key/tip) are skipped.
     method     = watch quietly for 1 s and remember nodes that change on their own (clocks, animations);
                  then send pointerdown→click. It "responds" if, within 300 ms, a node that was quiet changes,
                  a sound starts, or the URL changes — AND a 300 ms control window without pressing shows no change
                  (real-time games spawn new cards all the time; that must not be credited to the button).
                  Two presses in a row must both respond. Every round re-probes; responding in fewer than half
                  the rounds = fake button.
   It also records every <button> that stayed disabled the whole session (a button that is always grey also lies).
   It does not read game state, so a response that only repaints a <canvas> is reported as fake — review by hand. */
(() => {
  if (window.__fakeProbe) return;
  window.__snd = 0;
  const bump = f => function () { window.__snd++; return f.apply(this, arguments); };
  for (const C of [window.AudioScheduledSourceNode, window.HTMLMediaElement]) {
    if (!C) continue; const k = C === window.HTMLMediaElement ? 'play' : 'start';
    C.prototype[k] = bump(C.prototype[k]);
  }
  let recs = [];
  const mo = new MutationObserver(r => { recs.push(...r); if (recs.length > 5000) recs = recs.slice(-1000); });
  const watch = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  document.documentElement ? watch() : addEventListener('DOMContentLoaded', watch);

  const INTERACTIVE = 'button,a,input,select,textarea,label,summary,[role=button],[onclick],[contenteditable=""],[contenteditable=true]';
  const sel = el => { const p = []; for (let e = el; e && e !== document.body && p.length < 4; e = e.parentElement) {
      if (e.id) { p.unshift('#' + e.id); break; }
      const c = [...e.classList].filter(x => !/^(on|active|sel|hover|hl|lit)$/.test(x)).slice(0, 2).map(x => '.' + x).join('');
      const sib = e.parentElement ? [...e.parentElement.children].filter(x => x.tagName === e.tagName) : [];
      p.unshift(e.tagName.toLowerCase() + c + (sib.length > 1 ? `:nth-of-type(${sib.indexOf(e) + 1})` : ''));
    } return p.join(' > '); };
  const looksLikeButton = el => {
    if (el.matches(INTERACTIVE) || el.closest(INTERACTIVE) || el.querySelector(INTERACTIVE)) return false;
    if (el.matches('kbd,canvas,svg *,img,video') || /hint|tag|badge|label|chip|pill|key|tip/i.test(el.id + ' ' + el.className)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 16 || r.width > 360 || r.height > 160) return false;   // size cap skips panels; large card-buttons are missed
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const s = getComputedStyle(el);
    if (s.visibility !== 'visible' || +s.opacity < 0.1 || s.display === 'none') return false;
    if (parseFloat(s.borderTopLeftRadius) < 4) return false;
    const bg = !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) || s.backgroundImage !== 'none';
    const bd = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(s.borderTopColor);
    if (!bg && !bd) return false;
    return (el.innerText || '').trim().length <= 30;   // a box of long text is an info panel, not a button
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const st = { btnOn: new Set(), btnOff: {} };

  window.__fakeButtons = () => {   // cheap; monkey.py calls it every few actions
    for (const b of document.querySelectorAll('button')) {
      if (!b.offsetParent) continue; const k = sel(b);
      if (b.disabled) st.btnOff[k] = (b.innerText || b.title || b.getAttribute('aria-label') || '').trim().slice(0, 30); else st.btnOn.add(k);
    }
  };
  window.__fakeProbe = async (max = 40) => {
    window.__fakeButtons();
    const outer = [...document.body.querySelectorAll('*')].filter(looksLikeButton);
    const cands = outer.filter(el => !outer.some(o => o !== el && o.contains(el)));   // outermost only
    recs = []; const snd0 = window.__snd; await sleep(1000);   // one second, so once-a-second counters count as "already moving"
    const noisy = new Set(recs.map(r => r.target)), sndNoisy = window.__snd !== snd0;
    let n = 0; const round = { tried: {}, ok: [] };   // this round only; monkey.py keeps the tally (a reload resets the page)
    for (let el of cands) {
      const k = sel(el); if (k in round.tried || n >= max) continue;
      if (!document.contains(el)) el = document.querySelector(k);   // re-rendered lists: find the new node by selector
      if (!el) continue; n++;
      round.tried[k] = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      const quiet = m => noisy.has(m.target) || (m.target.parentNode && noisy.has(m.target.parentNode));
      let hits = 0;
      for (let t = 0; t < 2; t++) {   // both presses must respond; one could coincide with an unrelated change
        if (!document.contains(el)) el = document.querySelector(k); if (!el) break;
        const href = location.href, r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true, button: 0 };
        recs = []; const s0 = window.__snd;
        el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new MouseEvent('mousedown', o));
        el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('mouseup', o)); el.dispatchEvent(new MouseEvent('click', o));
        await sleep(300);
        if (location.href !== href) { round.ok.push(k); return round; }   // navigated away; the rest waits for next round
        if (!recs.some(m => !quiet(m)) && (sndNoisy || window.__snd === s0)) break;
        recs = []; await sleep(300);   // control window: if things change without pressing, don't credit the button
        if (recs.some(m => !quiet(m))) break;
        hits++;
      }
      if (hits === 2) round.ok.push(k);
    }
    return round;
  };
  window.__fakeReport = () => ({ btnOn: [...st.btnOn], btnOff: st.btnOff });
})();

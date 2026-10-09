/* shakespeare.js — Shakespeare, the in-page monkey. The infinite monkey theorem, applied to QA:
   press things at random long enough and the bugs you were going to hit, you hit.

   monkey.py answers "does it crash?". This one answers "can a run be FINISHED?" — it plays whole rounds
   and reports where each one got stuck. A dead end (the "next" button stays grey forever, two stages bounce
   back and forth) is more common than a script error, and more worth looking at.

   Usage (browser console, or any automation that can evaluate JS, page already loaded):
     await shakespeare({ runs: 3, maxClicks: 3000, hooks: {
       isOver: () => game.over,                     // required: has this run ended?
       begin:  async () => startNewGame(),          // optional: get from the title screen into play
       title:  () => document.querySelector('h2')?.textContent,   // optional: current stage name, used to detect "stuck"
       total:  () => document.querySelector('.score')?.textContent // optional: final score to report
     }})
   Returns, per run: clicks, finished?, total, lastStage, the path of stages visited, and errors caught.

   It will: click any visible enabled <button> (20% double-click, 30% prefer the page's main ".go" button),
   pour formula/quote/newline/emoji text into a <textarea> (CSV injection check), drag range inputs to the extremes,
   and stub out prompt/alert/confirm (confirm answers yes or no at random).
   It won't: understand the rules. Stuck isn't automatically a bug — check whether that stage needs a specific
   order first. The test is: would a real player walk into the same corner? */
window.shakespeare = async function (opt = {}) {
  const runs = opt.runs || 1, maxClicks = opt.maxClicks || 3000, exclude = opt.exclude || '[data-monkey-skip]', stuckMax = opt.stuckMax || 300;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hooks = Object.assign({
    isOver: () => false,
    begin: async () => {   // default: press the first button that looks like "start", else the main .go button
      const b = [...document.querySelectorAll('button')].find(b => /start|play|begin|開始|進入/i.test(b.textContent)) || document.querySelector('.go');
      if (b) b.click(); await sleep(120);
    },
    title: () => (document.querySelector('h2')?.textContent || '') + '/' + (document.querySelector('h3')?.textContent || ''),   // h2 alone misreads multi-step stages as dead ends
    total: () => null,
  }, opt.hooks || {});
  window.__errs = window.__errs || [];
  if (!window.__shkHooked) {
    window.__shkHooked = 1;
    addEventListener('error', e => __errs.push(e.message + ' @' + e.lineno));
    addEventListener('unhandledrejection', e => __errs.push('rej:' + e.reason));
    window.prompt = () => 'Shakespeare'; window.alert = () => {}; window.confirm = () => Math.random() < 0.5;
  }
  const out = [];
  for (let run = 1; run <= runs; run++) {
    let clicks = 0, stuck = 0, last = ''; const stages = [];
    await hooks.begin();
    while (clicks < maxClicks && !hooks.isOver()) {
      const btns = [...document.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent && !b.closest(exclude));
      if (!btns.length) { if (++stuck > 20) break; await sleep(20); continue; }
      const pick = () => btns[Math.random() * btns.length | 0];
      const b = Math.random() < 0.3 ? (btns.find(x => x.classList.contains('go')) || pick()) : pick();
      b.click(); if (Math.random() < 0.2) b.click(); clicks++;
      const ta = document.querySelector('textarea');
      if (ta && Math.random() < 0.5) { ta.value = '=1+1,"quote"\nnewline 😀 '.repeat(8); ta.dispatchEvent(new Event('input')); }
      const rng = document.querySelector('input[type=range]');
      if (rng && Math.random() < 0.3) { rng.value = Math.random() < 0.5 ? rng.min : rng.max; rng.dispatchEvent(new Event('input')); }
      const t = hooks.title(); if (t && stages[stages.length - 1] !== t) stages.push(t);
      stuck = t === last ? stuck + 1 : 0; last = t; if (stuck > stuckMax) break;
      // Give the page's own timers a chance to run: a monkey too fast to wait for a 600 ms stage transition
      // reports a pass as a dead end.
      if (clicks % 10 === 0) await sleep(opt.breath ?? 700);
    }
    out.push({ run, clicks, finished: !!hooks.isOver(), total: hooks.total(), lastStage: last, path: stages, errors: [...new Set(__errs.splice(0))] });
  }
  return out;
};

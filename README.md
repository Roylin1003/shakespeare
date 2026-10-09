*A collaborative project by roylin1003 and Claude.*

# Shakespeare 🐒

**A monkey tester for web games and interactive pages.** The infinite monkey theorem, applied to QA: press things at random long enough and the bugs you were going to hit, you hit.

Shakespeare is the tester in the **[Protonia](https://roynexus.com)** game lab. Every game there is mashed by this monkey before it ships.

Three pieces, one job each:

| file | answers | needs |
|---|---|---|
| `monkey.py` | **Does it crash?** Clicks, taps and keys at random for N seconds and collects page and console errors. Works on any page, no hooks. | Python + Playwright |
| `fake-button.js` | **Does the UI lie?** Finds things that *look* like buttons but do nothing, and buttons that stay disabled all session. Injected by `monkey.py`. | — |
| `shakespeare.js` | **Can a run be finished?** Plays whole rounds inside the page and reports where each one got stuck. Dead ends are more common than crashes. | a few hooks from your page |

## Try it

```bash
pip install -r requirements.txt
python -m playwright install chromium
python -m http.server 8000
python monkey.py http://localhost:8000/example/buggy.html --secs 15
```

`example/buggy.html` has three planted bugs. Expected output (one JSON line, exit code 1):

```json
{"ok": false, "actions": 93, "errors": ["inventory is not defined"], "fake": [{"sel": "span.tile", "text": "Power ⚡"}], "deadButtons": []}
```

That's the crash and the fake button. For the third bug (a dead end at Stage 3), load `shakespeare.js` in the page and run:

```js
await shakespeare({ runs: 1, hooks: {
  isOver: () => game.over,
  title:  () => document.getElementById('stage').textContent,
}})
// → [{ run: 1, finished: false, lastStage: "Stage 3", errors: [...] }]
```

`finished: false` with a `lastStage` is the dead end.

## monkey.py options

```
python monkey.py <url> [--secs 60] [--shot out.png] [--width 2560 --height 1440] [--ignore substring ...] [--seed 1]
```

- Default viewport is 2560×1440. Test the size your players actually use.
- `--ignore`: console errors whose text or source URL contains one of these substrings are not counted (analytics beacons, a missing local API).
- It never follows `http…`, `mailto:` or `/` links, and comes back if the page navigates elsewhere.
- Dialogs get yes or no at random. Pop-ups are closed.

## Reading the results

- **errors**: real bugs. Fix them.
- **fake**: elements that look pressable but didn't respond in most probe rounds. If the press only repaints a `<canvas>`, the probe can't see that, so check those by hand.
- **deadButtons**: `<button>`s that were disabled for the whole session.
- **finished: false** (from `shakespeare.js`): check whether that stage needs a specific order first. The monkey doesn't know the rules. The question is whether a real player could walk into the same corner.

## About this project

Directed by Yen-Ting R. Lin. The code was written mostly by AI (Anthropic Claude) under his direction, then tested and reviewed by hand. The monkey has found real dead ends and crashes in production games.

## License

Code: [MIT](LICENSE). See [CREDITS](CREDITS.md).

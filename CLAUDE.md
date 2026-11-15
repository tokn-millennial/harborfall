# Harborfall: instructions for an AI helper

Harborfall is a small Anno-style city builder for desktop browsers. The owner is new to game development and does not read code. Read `docs/HANDOFF.md` before your first change, and `docs/ROADMAP.md` before proposing work.

## Working rules (from the owner's brief, `docs/BRIEF.md`)

- **Plan first.** Show the plan and wait for approval before writing code.
- **Phases and gates.** Work in phases. At the end of each, stop and report in five parts: 1. What you built. 2. Test results with pass and fail counts. 3. How to try it, as three steps in the browser. 4. Known issues. 5. Decisions the owner needs to make.
- **Small scope.** Do not add features the owner did not ask for. If a request needs judgment (for example "polish" or "art"), name every unlisted extra in `docs/DECISIONS.md` and in the gate report.
- **Ask questions only at the start of a phase.** After that, make a reasonable choice and record it in `docs/DECISIONS.md` as the next D number, with the reason and how to change it.
- **Find and diagnose bugs yourself.** Test the game yourself, then report results. Do not ask the owner to read code or to debug.
- **Plain words.** Short sentences, no jargon without an explanation.
- **Be honest.** Say what is weak, unfinished or untested. If a result looks too good, check it before reporting it.
- **Commit once per approved phase, after approval. Push only when the owner says so.**

## Technical rules

- Plain JavaScript ES modules and Canvas 2D. No framework, no build step, no runtime dependencies, no image files. Ask before adding any dependency, even one used only for testing.
- Three layers, one direction. `src/sim/` is the game: no browser APIs, no Node APIs, no clock, no `Math.random`, no imports from outside the folder. `tests/boundaries.test.js` enforces this. `src/render/` reads state and never changes it. `src/ui/` changes the game only through `execute(game, command)`.
- The simulation changes only through commands and ticks. It must stay deterministic: the same commands give the same state.
- All game rules and numbers live in `data/*.json`, never in code. Keys starting with `_` are notes.
- Keep pure logic separate from page code so it can be tested in Node (see `src/ui/text.js`, `tools.js`, `panelModel.js`, `advice.js`).
- The walkers, carts and boats (`src/render/life.js`) are decoration. They read the game and must never change it or be read by it. `tests/life.test.js` checks that a game with them ends identical to one without.
- Sounds are recipes in `src/audio/sounds.js`, worked out as numbers by `src/audio/synth.js`. You cannot hear them. Say so plainly whenever you add or change one, and keep the measurable checks in `tests/sound.test.js` passing: short, not too loud, silent at both ends.
- A look is worked out from what the game already holds. Do not add a field to the game state for an effect: compare with the last frame (`src/render/effects.js`) or work it out from the clock (`src/render/daylight.js`).
- Anything the player reads (numbers over houses, marks, outlines, the placement preview) is drawn after the night tint, so it is never dimmed. Keep it that way.
- Art is code in `src/render/art/`. A stored building picture must look the same for the same inputs. Anything that moves every frame goes in `LIVE_ART`.

## Commands

- `node --test` runs all tests (588 at the end of Phase 23). They must all pass before a gate.
- `node tools/bot.mjs` plays a full headless game (also `careless`, `bread-first`, `--seed N`, `--pace typical`, `--steps`, `--map`). The standard order must still win inside 25 to 40 minutes. It is the balance gate, and `tests/bot.test.js` checks it.
- `node tools/tune.mjs` compares balance variants. `node tools/pace.mjs` estimates a person's time. `node tools/print-map.mjs` prints the island.
- `node serve.mjs` serves the game at `http://localhost:5173`, which opens on the title screen and saves the game in the browser. `?demo` shows a finished town. `?fresh` opens a new game with no title screen. Neither of those two ever saves.
- Do all browser testing on `?fresh` or `?demo`, so the owner's saved game is never overwritten. Test the title screen and saving on the plain address only when that is what you are testing, and say so.
- Browser checks, run from the page console after any UI or drawing change:
  - `const { playThroughUi } = await import('/tools/ui-playthrough.js'); await playThroughUi(window.harborfall);` on a freshly loaded `?fresh` page. The final state must be identical to the headless bot's.
  - `const { monkey } = await import('/tools/ui-monkey.js'); monkey(window.harborfall, { actions: 2500, seed: 1 });` must report no errors. Run it on `?fresh` and on `?demo`.

## Documents to keep current

Update these in the same phase as the change, before the gate:

- `docs/SPEC.md` when a rule, control or screen changes.
- `docs/ARCHITECTURE.md` when a file is added or the structure changes.
- `docs/DECISIONS.md` for every choice you make.
- `docs/TESTLOG.md` with one entry per phase: turns used, what was built, test counts, browser checks, bugs found and fixed, decisions made, what is weak, what you would change.
- `docs/ROADMAP.md` and `docs/HANDOFF.md` when an item is finished or the state of the project changes.
- `docs/screenshots/` with a few pictures named `phaseN-what-it-shows.jpg`.

## Things learned the hard way

- A game server may already be running on port 5173, started by the owner. Use it. Never stop a server you did not start.
- On this Windows machine, shell commands containing apostrophes or nested quotes get mangled. Write a script file and run it.
- An embedded or hidden test browser may draw about one frame a second. Do not judge smoothness there, and do not trust timings unless you force the browser to finish drawing (draw the game canvas into a tiny canvas and read a pixel back). Unforced timings measure almost nothing.
- Compare drawing speeds by running the old way and the new way in turns, many times, and subtracting the cost of the measuring itself. Runs taken one after another drift by more than most differences.
- Never show a stored picture with `imageSmoothingQuality` above `'low'`. Shrinking with `'medium'` was measured at over twenty times the cost.
- When you add a good, a building, a tier or a new setting, add a round naming it at the end of `addedLater` in `data/config.json`, so games saved before it can still be continued (`ARCHITECTURE.md` sections 15, 18 and 21). A setting added to every building is `buildingSettings`, to every good `goodSettings`. `tests/staff.test.js` names the stamps that real saved games carry; if it fails, you have changed a rule those games were played under. Do not change an existing number in the same phase unless the owner asks: that makes every older save refuse to load.
- Normal difficulty must change no number, so it stays the game that was balanced and that existing saved games were played under. `tests/difficulty.test.js` checks it. Before choosing numbers for a harder or easier mode, decide what it must never do (for example, trap a player), and test that with every build order.
- `node tools/bot.mjs artisans` plays past the win. The goal after the win must come 15 to 30 minutes later, and `tests/artisans.test.js` checks it.
- A new or renamed key in a `data/` file changes the rules stamp, and every saved game then refuses to load. Before and after any change to the data files, print the stamp (`rulesStamp(loadData())` from `src/sim/rules.js`) and compare. A key that cannot make a saved game impossible goes in `LOOKS_ONLY` there, with a test.
- Undo must leave the game exactly as it was. If you add a command, give it an undo note in `src/sim/undo.js` and add it to the random test in `tests/undo.test.js`.
- If you change the shape of the game state, bump `SAVE_FORMAT` in `src/sim/save.js` and decide what happens to older saves. A change to the data files already makes older saves refuse to load, by design.
- Drawing thousands of small shapes per frame is too slow. Prepare pictures once and reuse them, as `src/render/renderer.js` does.
- The repository is private and its documents and history contain personal details. Do not make it public, and do not publish its contents elsewhere, without the owner's say-so.
- The GitHub command-line tool is not installed. Plain `git push` works. Do not read saved sign-ins or tokens from the system.
- The game's word for the workforce is "staff". "Workers" is a kind of resident. Do not mix them in anything the player reads.
- With enough staff the game must play tick for tick as it does with the staff rule taken out (`tests/staff.test.js` compares the two). Keep that true when changing production.
- Check that a new tip, warning or panel line actually reaches the screen, in the browser, in the part of the game where it matters. In Phases 12 to 14 the tip line was switched off after the win and nobody noticed.
- The embedded test browser may redraw the page only when you take a screenshot. Words read from the page straight after a click can be the old ones. Take a screenshot first, then read. The same quirk means the game's own clock may or may not run during a scripted playthrough, so compare the final state with the headless bot's at the same tick, as `TESTLOG.md` Phase 16 describes, and do not rely on the minute count alone.
- The info panel is rebuilt many times a second, so a handle to one of its buttons goes stale at once. Click it from a script by its class (`#info button.closeBuilding`), in the same call that finds it.
- A producer the player has closed carries `closed: true`; an open one has no such entry. Keep it that way, so a game with nothing closed is byte for byte a game from before closing existed.
- A scenario, like a difficulty, is written into the data before the rules are made (`withScenario` in `src/sim/rules.js`). Never add an "if this scenario" to the simulation. The standard game must play the same with or without the scenarios in the data, and `tests/scenarios.test.js` checks it.
- Before setting a scenario's numbers or medal times, let the bot play it at an instant, a typical and a slow pace (`--pace`). A set-up that wins at one pace and sticks at another is too fragile to ship.
- `?fresh&scenario=<id>` opens a scenario on the test page. A bot build order may carry `"scenario": "<id>"`.
- When you teach the bot something new about build orders, teach `tools/ui-playthrough.js` the same thing in the same change. In Phases 12 to 16 it ignored `"to"` on an upgrade step and nobody noticed, because no order depended on it.
- Trade must stay a help, not a money machine. `tests/trade.test.js` checks on paper that no building earns more by selling all it makes than its staff would pay in taxes. Run it after changing any price, staff number or production time.
- A game with no harbour must play exactly as it did before trade existed. Keep `stepTrade` returning early when there is none.
- When you wait in the browser for something in the game, give the loop a limit. A loop waiting for a moment that never comes hangs the page, and the only way out is to close the tab.
- `testGame` and `richGame` in `tests/helpers.js` switch carts off unless you pass `{ carts: true }`. A test of another rule sees goods arrive at once. Games made with `createGame(loadData())` have carts. A test game saved and loaded must be loaded against the same data: `loadGame(withoutCarts(loadData()), save)`.
- A cart must never be able to get stuck. Before changing `stepCarts`, read `DECISIONS.md` D260: the first version starved the bot's town.
- After any change to production or carts, run every bot order and scenario with carts on and off (see `SPEC.md` section 20 for the last figures), not just the standard one.
- The bot builds warehouses on its own where carts struggle, and before placing far from every warehouse (`ARCHITECTURE.md` section 23). `tools/ui-playthrough.js` must make exactly the same choices at the same ticks, or the UI-against-bot check will fail. Change both together.
- Before tuning anything that affects carts or materials, run the second act (`artisans`, `pastWin`) on islands 42, 7 and 2025 as well as the standard one. In Phase 20 the standard island hid a failure the others showed.
- The browser pane's first screenshot after a change is often an old frame, which can look cropped. Take two in a row and trust the second. Check words by reading the page.
- Edit files with a script file written by the Write tool, never with `node -e` or a heredoc holding backticks or `${}`: in Phase 23 the shell silently turned a line of the bot into a bare `return`.
- When the browser pane is hidden it draws no frames, so frame rates cannot be measured there. Time the drawing functions in the page instead.

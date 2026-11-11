# Harborfall: Test Log

A running record, one entry per phase. A "turn" is one message from Colin plus Fable 5.2's work in reply.

## Phase 0: Spec

Date: 2026-11-10. Status: approved by Colin with no changes.

**Turns used:** 2 to produce, plus 1 approval message.
1. Plan and five scoping questions.
2. Wrote the spec, architecture, decision log, this log, and five data files.

**What was produced**
- `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TESTLOG.md`
- `data/config.json`, `data/goods.json`, `data/buildings.json`, `data/population.json`, `data/map.json`
- An empty git repository. Nothing is committed yet.

**Checks run**
- All five data files load as valid JSON: 5 of 5 pass.
- Cross-reference check, 5 of 5 pass: every good named in a cost, input, output or need exists in `goods.json`; every tier named exists; the win tier exists; the free starting building exists; every terrain named in a placement rule exists.
- Balance arithmetic in `SPEC.md` section 10 recomputed from the data files by script: fisherman feeds 20 residents, net income at 104 Workers is +40 per minute. Both match.

No game code exists yet, so there are no automated tests to run.

**Bugs found:** 0. **Bugs fixed:** 0. There is no code to have bugs yet.

**Decisions made:** 5 by Colin (Q1 to Q5) and 21 by Fable 5.2 (D1 to D21). All are in `DECISIONS.md`. Thirteen of the 21 change how the game plays and are marked **(rule)**.

**Weak or unfinished**
- The balance numbers are hand estimates. They hit the targets on paper only. The time-to-win estimate of 28 to 32 minutes is the least certain number in the spec.
- `map.json` describes the island by targets and guarantees. The generator that must meet them does not exist yet, so the field names under `generation` may change in Phase 1.
- The brief did not define how goods reach houses when stock is short. I chose "older houses buy first". It is simple but unfair, and it may feel odd in play.
- Thirteen game rules were my reading of gaps in the brief. That is a lot of rules for one person to approve at a glance.

**What I would change**
- I would have asked about base income (D1) and the pre-placed warehouse (D2) as scoping questions if the limit were higher than five. They are the two choices most likely to surprise you.

## Phase 1: Simulation core

Date: 2026-11-10. Status: approved by Colin with no changes.

**Turns used:** 1 (the approval of Phase 0 started it). Inside that turn there were 8 build-and-test cycles.

**What was built**
- The whole simulation in `src/sim/`: 17 files, no browser code, no Node code.
- A data loader for Node in `src/platform/`.
- `tools/print-map.mjs`, which prints the island as text.
- 13 test files and 2 helper files in `tests/`.

**Test results: 145 pass, 0 fail.** Run with `node --test`. The full suite takes about 1.4 seconds.

| Test file | Tests | Covers |
|---|---|---|
| data | 22 | Loading, validation, 17 kinds of bad data rejected with a clear message |
| mapgen | 11 | Size, repeatability, guarantees, coast, one island, 20 extra seeds |
| placement | 21 | Terrain, overlap, map edge, forest, coast and fertile rules, cost, demolish, storage |
| roads | 12 | Connection through road chains, no diagonals, cutting a road, the road command |
| production | 10 | Cycle timing, inputs, missing input, full storage, nothing created or lost, a new producer from data alone |
| population | 12 | Market coverage, moving in and out, eating rate, shortages, Worker bread need |
| upgrade | 8 | Each condition and each refusal reason, exact cost |
| economy | 10 | Taxes, upkeep, base income, zero floor, no rounding drift over an hour |
| win | 5 | 99 is not a win, 100 is, Farmers do not count, recorded once |
| integration | 4 | Full chain from real starting stock; real island has reachable sites; 40 idle minutes |
| determinism | 5 | Same commands give the same game; state survives a JSON copy; failed commands leave no trace |
| boundaries | 18 | Every simulation file is free of browser, Node, clock and random calls |
| balance | 7 | The targets from the brief, on paper and in play |

**Build-and-test cycles**

| Cycle | Built | Tests after |
|---|---|---|
| 1 | Data loading, validation, rules | 22 pass |
| 2 | Island generator | 33 pass |
| 3 | Buildings, placement, roads, demolish | 66 pass |
| 4 | Production | 76 pass |
| 5 | Population and upgrades | 96 pass |
| 6 | Income, win check, summary | 111 pass |
| 7 | Full chain, repeatability, layer rule, balance targets | 140 pass, 5 fail |
| 8 | Fixed the failing test helper | 145 pass |

**Bugs found: 4. Bugs fixed: 4.** All four were in my own tests or scripts. The tests found no bug in the simulation code itself, which means either the code is right or the tests share my blind spots. Phase 2 is the real check, because the bot plays the game in ways the tests do not.

| # | Bug | Where | Fix |
|---|---|---|---|
| 1 | A placement test expected forest at a tile that is grass. | `placement.test.js` | Corrected the coordinate before the first run. |
| 2 | Production tests set the wood stock before building a sawmill, which costs wood, so the starting count was wrong. | `production.test.js` | Stock is now set after building. Caught by reading the test before running it. |
| 3 | The scripted mini-city sent each "place" command once per existing building, so the second copy failed as "blocked". This caused all 5 failures in cycle 7. | `scenario.js` | The command is now sent once. Found by reproducing it in a 10-line script. |
| 4 | Twice, a shell command with long quoted text was rejected and wrote nothing. | My tooling, not the project | Switched to writing those files directly. No project file was affected. |

**Design problems found (not code bugs)**
- **One lumberjack cannot feed one sawmill.** The sawmill takes 10 wood a minute and the lumberjack cuts 7.5, so wood stays at 0 or 1 and nothing that costs wood can be built. Measured over 25 game minutes. A second lumberjack fixes it. A new player will hit this. It goes to Phase 2 as the first tuning item.
- **The first island was poor.** Two giant forests, one giant field, and a start site far from everything. Fixed with smaller patches and a tighter start rule (D22, D23).
- **A small town with the bread chain loses money.** About 8 coins a minute with one Worker house. This is expected until more houses are upgraded, but the dip may alarm a new player.

**Measurements**
- 40 game minutes with 13 buildings simulate in about 46 milliseconds.
- One fisherman keeps exactly 20 Farmers fed for 30 game minutes. With 24 Farmers the town settles at 21.
- The scripted mini-city fills its first Worker house 3.7 game minutes after the start.

**Decisions made:** 11 (D22 to D32). Four change how the game plays and are marked **(rule)**.

**Weak or unfinished**
- I wrote the tests and the code, so they can share the same wrong idea of a rule. No one else has checked the rules against your intent.
- No test plays a whole game to 100 Workers. That is Phase 2.
- The island was checked by eye from a text printout, by me. You have not seen it.
- "Older houses eat first" works as designed, but the effect is stark: with a shortage, the newest house sits at 1 resident while the rest stay full.
- Nothing has been run in a browser. The simulation is built not to care, and a test guards that, but it is unproven until Phase 3.

**What I would change**
- I would write the scripted mini-city earlier. It found the wood problem, which no single-system test could.
- I would make the lumberjack and sawmill rates a Phase 0 paper check. The arithmetic was available on day one and I did not do it.

## Phase 2: Bot and balance

Date: 2026-11-10. Status: approved by Colin with no changes.

**Turns used:** 1 (the approval of Phase 1 started it). Inside that turn the bot played about 500 full games across 12 tuning comparisons.

**What was built**
- A bot in `tools/bot/`: a planner that picks sites and road routes, and a runner that follows a build order.
- Three build orders: standard, careless and bread-first.
- `tools/bot.mjs`, which plays one game and prints a report, and `tools/tune.mjs`, which compares changed numbers.
- `tests/bot.test.js`, 10 tests that are the gate for this phase.

**Test results: 155 pass, 0 fail.** That is the 145 from Phase 1 plus 10 bot tests. The suite takes about 2 seconds. One full bot game takes about 0.15 seconds.

**Gate result: the bot wins in 28.6 minutes on the shipped island.** The target is 25 to 40.

| Check | Result |
|---|---|
| Standard order, shipped island | Won at 28.6 minutes |
| Standard order, 12 islands | Won on 12 of 12, in 25.9 to 28.6 minutes |
| Net income at the win | +42.2 a minute (target about +40) |
| Lowest income after minute 5 | +18.8 a minute |
| Time at zero coins | 0.0 minutes |
| Longest wait on one step | Under 5 minutes |
| Careless order, 12 islands | Won on 12 of 12, in 27.8 to 30.4 minutes |
| Bread-first order, 12 islands | Won on 12 of 12, in 25.3 to 52.9 minutes |
| Start from nothing (zero coins, no goods) | Won at 54.9 minutes |

**Tuning steps, standard order on the shipped island**

| Step | Change | Time to win | What the run showed |
|---|---|---|---|
| 0 | Phase 0 numbers | 28.7 min | Inside the target by luck. 24:48 of waiting was for wood. Planks piled up to 70 unused. |
| 1 | Lumberjack 5 s, sawmill 15 s | 29.4 min | Coins now set the pace. The careless order dropped from 65 minutes to 31. |
| 2 | Bot improved, so farms need shorter roads | 43.3 min | The better layout needed a second market, and that alone added 14 minutes. Income sat at +5 a minute from minute 14 to 18. The economy was on a knife edge. |
| 3 | Farmer tax 0.9, Worker tax 0.95, farm upkeep 4, bakery upkeep 6, sawmill 18 s | 31.6 min | Lowest income up to +14. |
| 4 | Sawmill 16 s | 28.8 min | Timing back in range on every island. |
| 5 | Base income 20, Farmer tax 0.8, Worker tax 0.85 | 28.6 min | Lowest income +18.8. The bread-first dead end is gone. |

**Dead ends found: 2. Both fixed.**

| # | Dead end | How it was found | Fix |
|---|---|---|---|
| 1 | Bread chain before any house: zero coins and -10 a minute, for good. 0 wins on 12 islands. | The bread-first order. | Base income 20. Now 12 wins on 12 islands. |
| 2 | Starting from nothing: base income of 10 paid for only two or three production buildings, then income hit zero with no houses. | A one-off run with zero coins and no goods. | Base income 20. Income now stays at +4 or better on the way up. |

**Design problems found: 2. Both fixed.**
- **Wood starvation.** One sawmill out-ate one lumberjack. Already seen in Phase 1, confirmed and measured here.
- **A fragile mid-game.** 56 Farmers barely paid for the buildings needed to feed them. One extra market turned a 29 minute win into 43.

**Bugs found: 3. Bugs fixed: 3.** All in the new bot and tools. None in the simulation.

| # | Bug | Fix |
|---|---|---|
| 1 | The bot forced farms onto its grid, so on one island the second farm was built 26 road tiles away. | Buildings tied to terrain may now go anywhere. |
| 2 | After the bot added a market by itself, the step log named the wrong step. The game was unaffected. | The inserted step is now logged under its own name. |
| 3 | The tuning tool read its command-line options when another script imported it, and crashed. | Options are read only when it is run directly. |

**Decisions made:** 10 (D33 to D42). Four change how the game plays and are marked **(rule)**.

**Weak or unfinished**
- **The bot is not a person.** It acts instantly and never misplaces anything. The 25 to 40 minute target is proven for the bot only. My guess for a first-time player is 30 to 40 minutes.
- **The first result was right for the wrong reason.** The untuned game already won in 28.7 minutes. If I had stopped at the gate, the wood problem and both dead ends would have shipped.
- **The late game waits on planks.** The bot spends about 8 minutes in total waiting for planks. A second sawmill fixes it, and the bot's order has only one.
- **Bad openings recover slowly.** Bread-first and from-nothing both take over 50 minutes.
- **Base income is now large.** At the start it is all of your income. It may feel like free money.
- **Workers pay barely more than Farmers per head**, 0.85 against 0.8. The reward for upgrading is mostly the doubled capacity.
- **Income at the win is +47 on islands that need only one market**, a little above the target.
- **Only three bad openings were tried.** I chose them. A real new player will find others.

**What I would change**
- I would build a second, clumsier bot that pauses, overbuilds roads and misplaces a few buildings. It would estimate a person's time far better than a perfect one.
- I would have run the bad openings before tuning the timing. I tuned to 28.8 minutes first and then had to retune when the dead end showed up.

## Phase 3: Renderer

Date: 2026-11-10. Status: approved by Colin, who confirmed the island is visible and movable.

**Turns used:** 1 (the approval of Phase 2 started it). Inside that turn there were 3 automated test runs and 6 rounds of checks in a real browser.

**What was built**
- `serve.mjs` and two double-click start files, one for Windows and one for Mac.
- `index.html`, the page.
- Render layer in `src/render/`: isometric math, camera, picking, building visuals, and the canvas renderer.
- `src/ui/cameraControls.js`: drag, wheel, keys.
- `src/platform/loop.js`: the fixed-tick loop, and `src/platform/loadData.browser.js`.
- `src/main.js`, which wires the layers together.

**Automated tests: 180 pass, 0 fail.** That is 155 from before plus 19 for the isometric math, camera and picking, and 6 for the tick loop.

**Browser checks, done by me in the built-in browser**

| Check | Result |
|---|---|
| Page loads with no errors in the console | Pass |
| Island draws: water, coast, grass, fertile land, forest with trees | Pass |
| Starting warehouse is drawn and centred | Pass |
| Hover over ground shows "Tile 51, 47 · Grass" and highlights the tile | Pass |
| Hover over the warehouse shows its name and outlines the box | Pass |
| Mouse wheel zooms in and out, centred on the cursor | Pass, 0.64x to 1.57x measured |
| Dragging moves the view by exactly the distance dragged | Pass |
| W A S D and arrow keys move the view | Pass after a fix |
| + and - zoom | Pass after a fix |
| Home and C return to the start | Pass |
| Demo town: 32 buildings of all 8 kinds drawn, nearer ones in front | Pass |
| Window resize keeps the picture sharp and correctly sized | Pass at 1280 by 720 |
| Whole island visible at the furthest zoom | Pass |
| Server refuses `.git`, hidden files and paths outside the folder | Pass, 403 each |
| Starting a second server gives a clear message | Pass |

**Drawing speed**, measured in the browser with the 32-building demo town on a 1920 by 1080 canvas:

| Zoom | Time to draw one frame |
|---|---|
| 0.35x, whole island | 9.5 ms |
| 1x | 4.2 ms |
| 3x | 0.8 ms |

A screen that refreshes 60 times a second allows 16.7 ms per frame, so all three fit.

**Bugs found: 4. Bugs fixed: 4.**

| # | Bug | How it was found | Fix |
|---|---|---|---|
| 1 | A quick tap on W A S D or an arrow key moved nothing. The view only moved if a frame was drawn while the key was down. | Pressing keys in the browser and reading the camera position. | The view now moves at once on key down, then continues while held. |
| 2 | + and - did nothing when the key press carried no key position. They were matched by position, which also breaks on keyboards where + sits elsewhere. | Same test. | They are now matched by the typed character. |
| 3 | At a very low frame rate the game ran slower than real time, because each frame could count for at most a quarter of a second. | The test browser draws about 1 frame a second, and the clock advanced 5 ticks in 2 seconds, not 20. | A frame may now count for up to 1 second. |
| 4 | Roof labels clashed: W meant Warehouse and Worker, F meant Farm, Fisherman and Farmer. | Looking at the demo town screenshot. | Houses show their residents. Other buildings show two letters. |

Once more, no bug was found in the simulation. It ran in the browser unchanged, which is the first real evidence for the layer rule.

**Decisions made:** 8 (D43 to D50). None changes the game rules.

**Weak or unfinished**
- **I could not watch it at full speed.** The built-in browser pane was hidden on your screen, so it drew about 1 frame a second. Positions, picking and drawing are verified. Smoothness at 60 frames a second is not. You are the first to see it move.
- **The two start files are untested.** Running them would have opened a browser window on your desktop. The server they start is tested.
- **Mac is untested.** Nothing in the code is Windows-only, but nothing was run on a Mac.
- **Trackpads are a guess.** Two-finger scroll will zoom. There is no pinch handling and no trackpad-friendly way to pan other than the keys or dragging.
- **The renderer itself has no automated test.** Four of its five files are pure math and are tested. The canvas drawing is checked by eye only.
- **Small buildings hide behind tall ones.** In the demo town the two lumberjacks are mostly hidden behind the warehouse. There is no way to rotate the view or see through buildings.
- **The whole-island view takes 9.5 ms a frame.** That is fine on this machine and may not be on a slow one. Caching the ground as an image would fix it.
- **The help panel covers the top-left corner of the island.**

**What I would change**
- I would test input with real, short key taps from the first minute. Both key bugs came from assuming a key is held for several frames.

## Phase 4: UI and play

Date: 2026-11-10. Status: approved by Colin. The gate was that he could play from start to win.

**Turns used:** 1 (the approval of Phase 3 started it). Inside that turn there were 5 automated test runs and about 20 rounds of checks in a real browser.

**What was built**
- Top bar: coins, income, goods, population, goal bar, clock.
- Build menu with a hint strip, and a note that follows the pointer.
- Placement preview: a see-through building outlined green or red, with the reach of markets and lumberjacks shown.
- Road tool: click for one tile, drag for a line.
- Demolish tool.
- Info panel with Upgrade and Demolish buttons.
- Pause and speed controls, with keys.
- Win screen.
- Warning marks on buildings, and a "losing money" line.
- A ? panel listing the controls.

**Automated tests: 202 pass, 0 fail.** That is 180 from before plus 22 for the logic behind the UI.

**Browser checks with real clicks and keys: 22 of 22 pass**, five of them after fixes.

| Check | Result |
|---|---|
| Page loads with the full UI and no console errors | Pass |
| Pick Lumberjack, hover: see-through copy and forest in reach are shown | Pass |
| Click places it at the pointed tile and charges 20 coins | Pass |
| A building with no road gets a red ! | Pass |
| Drag a two-tile road: both tiles laid, lumberjack connects and starts work | Pass |
| Drag an L-shaped road of 7 tiles | Pass |
| Place fisherman, market and house from the menu | Pass |
| Click once with the Road tool: one tile laid | Pass |
| Demolish tool removes a road tile | Pass |
| Placing on forest is refused with "You cannot build on water or forest." | Pass |
| Esc puts the tool away | Pass |
| Clicking a house roof opens its panel with the right residents, needs and taxes | Pass |
| Key 3 sets 4x and the 4x button lights up | Pass |
| Residents move in once the market is connected | Pass |
| Win screen appears at 100 Workers, pauses the game and states the time | Pass |
| Keep playing closes it and the game resumes | Pass |
| Upgrade button turns a full Farmer house into a Worker house | Pass |
| Space pauses (0 ticks in 2.5 seconds) and resumes at the earlier speed | Pass |
| Right-click puts the tool away | Pass |
| "You are losing money" appears when income is negative | Pass after a layout fix |
| ? opens and closes the controls panel | Pass after a layout fix |
| Preview of a market: green outline where valid, red where not | Pass after a fix |

**A full game through the UI.** A test tool played the standard build order using only UI actions: 34 menu clicks, 50 clicks on the map, 13 road drags and 13 presses of Upgrade.

| Measure | UI playthrough | Headless bot |
|---|---|---|
| Result | Won | Won |
| Time to win | 28.55 minutes | 28.55 minutes |
| Final game state | Identical, all 55,844 characters of it | |

Every action sent through the UI did exactly what the matching command does.

**Bugs found: 7. Bugs fixed: 7.**

| # | Bug | How it was found | Fix |
|---|---|---|---|
| 1 | Text said "1 planks". I had even written a test expecting it. | Reading my own test output. | `goods.json` gained a singular word, and the text uses it. |
| 2 | An inline edit of mine left `goods.json` invalid for about a minute. | The edit script stopped with an error. | Rewrote the file at once. Nothing was committed in that state, and I stopped making edits that way. |
| 3 | Warning marks were drawn over the roof labels. | Screenshot. | Moved to the back corner of the roof. |
| 4 | The "losing money" line covered the second row of the top bar. | Screenshot at 1280 by 720. | It is now its own row inside the bar. |
| 5 | The ? panel and the info panel overlapped the top bar when it wrapped to two rows. | Same screenshot. | Panels now flow below the bar, whatever its height. |
| 6 | A valid market preview was pink, close to the red used for "cannot build here". | Screenshot. | Every preview now has a green or red outline. |
| 7 | A drag could fail to start if the browser refused to capture the pointer. | The UI playthrough, which uses scripted pointer events. | The capture is now optional. The drag works without it. |

No bug was found in the simulation, for the fourth phase running.

**Decisions made:** 12 (D51 to D62). None changes the game rules.

**Weak or unfinished**
- **Nobody has played it by hand from start to win.** I did about 20 real clicks for the first few buildings. The full game was played by a script that sends pointer events. The script never misclicks, never hesitates, and always centres the view before clicking. The gate is you playing it.
- **I still have not seen it at full speed.** My browser pane draws about 1 frame a second.
- **Upgrades are one house at a time.** A win takes at least 13 select-and-upgrade pairs.
- **The build menu has no shortcut keys.**
- **Demolish has no undo and no confirmation.**
- **Roads can only be dragged as an L shape.**
- **The top bar wraps to two or three rows on a narrow window** and then covers more of the map.
- **A market's panel counts houses served by all markets, not by that one.**
- **Mac, trackpads and touch are untested.**
- **How long a person takes to win is still unknown.**

**What I would change**
- I would write the UI playthrough before the panels, not after. It found the pointer capture bug in seconds and would have guarded every later change.
- I would never again assert awkward output in a test just because the code produced it. Bug 1 passed its test.

## Phase 5: Review

Date: 2026-11-10. Status: complete. This phase ends with a summary, not an approval gate.

**Turns used:** 1 (the approval of Phase 4 started it).

**What was done**
- A 73-item playtest checklist, recorded in `PLAYTEST.md`.
- A random-input test tool, `tools/ui-monkey.js`.
- The UI playthrough repeated at the nearest and furthest zoom.
- Two checks of the "tune without code" promise, with the data files restored afterward.
- The top 5 problems fixed, plus one small sixth.
- The final report, `FINAL_REPORT.md`.

**Automated tests: 204 pass, 0 fail.** That is 202 from before plus 2 for the new tool logic.

**Playtest checklist: 61 pass, 6 pass after a fix, 6 not tested, 0 fail.**

| Stress check | Result |
|---|---|
| Random input: about 39,000 actions over 8 runs, state checked after each | No crash, no corrupted state. One display slip found. |
| UI playthrough at 1x zoom | Won at 28.58 minutes. Final state identical to the headless bot. |
| UI playthrough at 0.35x zoom | Same |
| UI playthrough at 3x zoom | Same |
| A typo in a data file | Clear message on screen naming both mistakes |
| A new good and building added in data alone | Appeared in the menu, placed by click, produced goods |

**The top 5 problems, and the fixes**

| # | Problem | Fix | Checked by |
|---|---|---|---|
| 1 | Fertile land and coast could not be told from other ground | Picking Farm or Fisherman lights up the ground it can use. A key to the ground colors is in the ? panel. | Screenshot, 2 new tests |
| 2 | No sign of which houses could be upgraded, and two clicks each | Green ▲ marks, and an Upgrade tool | Real clicks, screenshot |
| 3 | Whole-island view drew slowly | Ground and trees painted once and reused | Timed side by side: 6.3 ms down to 0.2 ms |
| 4 | Small buildings hidden behind tall ones | Lower boxes, see-through while placing | Screenshot |
| 5 | Top bar wrapped to several rows | Shorter labels on narrow windows | Measured: 70 pixels down to 44 at 1280 wide |

After the fixes, all 204 tests pass, the UI playthrough still matches the headless bot exactly, and 18,000 more random actions found nothing.

**Bugs found: 7. Bugs fixed: 6.** The seventh is a wrong number I reported, which I can correct but not undo.

| # | Bug | Fix |
|---|---|---|
| 1 to 5 | The five problems above | As above |
| 6 | For one frame after picking a tool, the info panel stayed open with nothing selected. Found by the random-input test. | Clearing the selection now closes the panel in the same instant. |
| 7 | My Phase 3 figure of 9.5 ms to draw the whole island was too optimistic. The same view later took 27 to 80 ms in the same pane, with the Phase 3 code. | The drawing is now fast enough that the question is moot. The Phase 3 entry above is left as written, so the record is honest. |

No bug was found in the simulation in any phase.

**Decisions made:** 6 (D63 to D68). None changes the game rules.

**Weak or unfinished**
- **Every "playtest" here was a machine.** Tests, a bot, scripted clicks and random input. They show the game does not break. They cannot show whether it is clear or fun.
- **"I can win by hand" rests on your approval of Phase 4**, not on anything I saw.
- **The Upgrade tool and the green marks are additions you did not ask for.**
- **The ground picture uses about 34 MB of memory** and makes trees slightly less exact when zoomed out.
- **Seven problems from the checklist are still open.** They are listed in `PLAYTEST.md`.
- **Six checklist items could not be tested**: the two start files, opening the page as a file, smoothness at full speed, trackpads, and a person winning.

**What I would change**
- I would run the random-input test from the first day the UI existed. It costs seconds and found a slip that 22 hand checks missed.
- I would ask you for ten minutes of play notes at the Phase 4 gate. An approval tells me it works. It does not tell me what confused you.

## Totals across the project

| Phase | Turns | Tests at the end | Bugs found | Decisions |
|---|---|---|---|---|
| 0. Spec | 2 | 0 (data checks only) | 0 | 5 yours, 21 mine |
| 1. Simulation | 1 | 145 | 4 | 11 |
| 2. Bot and balance | 1 | 155 | 3, plus 2 dead ends and 2 design problems | 10 |
| 3. Renderer | 1 | 180 | 4 | 8 |
| 4. UI and play | 1 | 202 | 7 | 12 |
| 5. Review | 1 | 204 | 7 | 6 |
| **Total** | **7** | **204** | **25 bugs, 5 design problems** | **73** |

## Phase 6: Polish

Date: 2026-11-11. Status: approved by Colin with no changes.

**Turns used:** 1 (your message "push it to GitHub and keep building").

**What was asked, and what happened**
- **Push to GitHub: not done.** The GitHub command-line tool is not installed, so I could not create a repository. Git itself can push with your saved sign-in once a repository exists.
- **Keep building: done**, within the problems Phase 5 left open.

**What was built**
- Demolish takes two clicks on a building, from the tool or from the info panel.
- Shortcut keys for all 12 tools, shown on the buttons.
- Shift flips the corner of a dragged road.
- A tip line that names a lasting shortage and what to build, traced to its root.
- A Start a new game button, pressed twice.
- A market's panel counts the houses in its own range.
- A slow-player mode for the bot, and `tools/pace.mjs` to report on it.

**Automated tests: 220 pass, 0 fail.** That is 204 from before plus 16: 3 for shortcut keys in the data, 10 for the new UI logic (7 of them for the tip line), and 3 for the paced bot.

**Browser checks**

| Check | How | Result |
|---|---|---|
| A full game through the UI still matches the headless bot | UI playthrough | Pass. Won at 28.55 minutes, identical final state. |
| Random input, with the new keys included | 12,000 actions over 2 runs | Pass. No errors. |
| R, M, H and Q pick Road, Market, House and Select | Real key presses, then real clicks to build with them | Pass |
| All 12 buttons show their key | Read from the page | Pass |
| Demolish tool: first click arms, second click removes | Real clicks on a house | Pass. The note read "Click again to demolish the Farmer house." |
| Panel Demolish: first press changes the label, second removes | Scripted presses | Pass |
| Shift flips the road corner | Scripted drags with and without Shift | Pass |
| Tip line appears for hungry houses with no fisherman | Built a market and a house by hand, ran at 4x | Pass. "Tip: Nobody is making fish. Build a fisherman." |
| Market panel shows houses in its own range | Read after demolishing the only house | Pass. It showed 0. |
| Start a new game: first press asks, second reloads a fresh game | Real clicks | Pass. 500 coins, 1 building, no roads. |

**A person's pace** (20 games per row, shipped island)

| Build order | Pace | Thinking time added | Fastest | Median | Slowest |
|---|---|---|---|---|---|
| Standard | Brisk | 3.4 min | 29.1 | 29.1 | 29.6 |
| Standard | Typical | 7.7 min | 29.5 | 30.2 | 31.3 |
| Standard | Slow | 17.8 min | 30.9 | 32.5 | 34.8 |
| Careless | Brisk | 3.3 min | 30.4 | 30.5 | 30.7 |
| Careless | Typical | 7.6 min | 30.6 | 30.8 | 31.2 |
| Careless | Slow | 17.5 min | 30.6 | 31.2 | 32.0 |

All 120 games won inside 25 to 40 minutes. Thinking time barely matters, because most of it overlaps with waiting for coins and planks.

**Bugs found: 0.** No test or browser check failed in this phase. After five phases that each found several, that is more likely thin testing of the new parts than perfect code. The tip line in particular was checked in seven situations and a real game has many more.

**Decisions made:** 9 (D69 to D77). None changes the game rules.

**Weak or unfinished**
- **GitHub is not done.**
- **The pace numbers rest on guessed delays**, and they assume the player knows what to build. A lost, hesitant first-timer is not modelled.
- **The tip line is simple.** One tip at a time, shortages only. It says nothing about a missing market, idle coins, or what to do first.
- **Some shortcut letters are arbitrary**, because W A S D and C were taken: I for Sawmill, E for Warehouse, G for Farm.
- **Shift to flip a road corner is easy to miss.** It is mentioned in the Road hint and the ? panel only.
- **Two clicks to demolish may annoy** when clearing several buildings. There is still no undo.
- **A game server was already running on the port when I tested**, so I used it. I take it to be yours from `start-game.bat`. It was serving the same folder.

**What I would change**
- I would have checked for the GitHub tool before promising a push in my plan.

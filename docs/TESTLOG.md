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

**After the gate:** you created an empty private repository and gave me its address, and Phases 0 to 6 were pushed to it.

## Phase 7: Art and style

Date: 2026-11-11. Status: approved by Colin with no changes (his reply to the gate was "Push").

**Turns used:** 1 (your message "lets add real art and style to this thing"). It was a long one.

**What was built**
- A drawing for every building and both house tiers, all in code: warehouse, lumberjack, sawmill, fisherman, farm, bakery, cottage, townhouse, market.
- New ground: a raised shoreline with shallows, grass in four shades, ploughed fertile land, sand, flowers, and two kinds of tree.
- Roads that join up with each other and with the buildings beside them.
- Water with drifting glints.
- Looks that follow the game: ripening crops, bakery smoke, sawdust, lit windows.
- A navy and brass theme for every panel, small building pictures on the build menu, and icons in the top bar.
- A new way of drawing a frame, in which almost everything is prepared once and reused.

**Automated tests: 236 pass, 0 fail.** That is 220 from before plus 16 for the art. The art tests run without a browser, using a stand-in canvas that records what was drawn. They prove a drawing runs, uses valid colors and stays inside its plot. They cannot prove it looks good.

**Browser checks**

| Check | How | Result |
|---|---|---|
| A full game through the UI still matches the headless bot | UI playthrough, after the last change | Pass. Won at 28.55 minutes, identical final state. |
| Random input on a finished town | 2,500 actions, seed 21 | Pass. No errors. 10 stored building pictures at the end. |
| Random input on a fresh game with plenty of coins | 2,500 actions, seed 22 | Pass. No errors. |
| The error console after all of the above | Read it | Empty. |
| Each building looks right at normal zoom, far out and close in | Screenshots of the demo town | Pass by my eye. See `docs/screenshots/phase7-*.jpg`. |
| The placement ghost is green where allowed and red where not | Screenshot | Pass |
| The win screen, the ? panel and the build menu under the new theme | Screenshots | Pass |

The random-input run was 5,000 actions, not the 12,000 of Phase 6. A single run of 6,000 timed out in my test browser, so I split it and did not repeat it further.

**Drawing speed**

Milliseconds to draw one frame of the finished demo town on a 1920 x 1080 canvas, old boxes against new art, two runs each. Under 16 is smooth.

| Zoom | Phase 6 boxes | Phase 7 art |
|---|---|---|
| 0.35 (whole island) | 37 and 34 | 15 and 14 |
| 0.7 | 5.8 and 5.7 | 18.5 and 17 |
| 1 (normal) | 29 and 29 | 12 and 11 |
| 2 | 24 and 31 | 14 and 16 |

- The new art is faster than the old boxes at three of the four zooms and **slower at 0.7**, where it shrinks the large ground picture on every frame.
- **These numbers are from my test browser, which is slow and likely draws without the graphics card.** They are good for comparing old with new. They do not tell you how smooth it is on your screen. I have not seen the game in motion at full speed.

**Bugs found: 3, all fixed. One speed problem, fixed. One mistake of mine in measuring.**
1. Crop rows were drawn black. The color mixer returned a color in a form the shading tool could not read. Fixed, with a test.
2. Dark outlines swamped thin shapes such as fence rails and crop rows. Those shapes are now drawn without an outline.
3. The farm's barn was drawn after the rows in front of it and covered them. Reordered.
4. **Speed.** My first version drew every tile, tree and building from scratch on every frame. Measured properly it took over 100 milliseconds a frame. Rebuilt around prepared pictures, as described in `ARCHITECTURE.md` section 7.
5. **Measuring.** My first timings said a frame took 0.4 milliseconds. That figure only measured the browser writing down what to draw, not drawing it. I caught it because it was too good to be true. The same mistake is likely in my Phase 3 and Phase 5 speed figures, which I already marked as unreliable.

**Decisions made:** 15 (D78 to D92). None changes a game rule. Colors and heights in the data files changed.

**Weak or unfinished**
- **It is code-drawn art.** It is clean and consistent, and it looks like tidy vector shapes. It is not painted art, and a real artist would do better.
- **I judged the look myself from still screenshots.** Taste is yours to judge.
- **Nothing walks or sails.** The town is alive only in smoke, sawdust, crops and water glints.
- **Zoom 0.7 draws slower than before** in my test browser.
- **The ground looks a little soft when zoomed far in**, because it is a stretched picture.
- **Memory use went up** by roughly 90 MB for the two ground pictures on a sharp screen.
- **Trees more than two tiles from a building are never drawn in front of it.** No drawing reaches that far today. A much taller building added later could show the flaw.
- **Titles use Georgia**, which will look slightly different on a Mac. Mac is still untested.
- **The top bar's icons are small** and some may be hard to tell apart at a glance. Names still show on wide windows and on hover.

**What I would change**
- I would measure drawing speed the right way before writing any art. I rebuilt the drawing code twice because the first measurements were wrong.

**After the gate:** committed as `ddebd54` and pushed at your request.

## Handoff (after Phase 7)

Date: 2026-11-11. Your request: "Give me a roadmap and all the handoff materials so I can continue building. Make sure any reference material is pushed to GitHub as well."

**Turns used:** 1.

**What was written.** No code changed.
- `docs/ROADMAP.md`: 18 possible next steps in five stages, each with a size and what it needs from you, and a recommended order.
- `docs/HANDOFF.md`: how to run, check and tune the game, how we worked, a prompt for starting a new session, what is proven and what is not, every open issue in one list, and a word list.
- `docs/BRIEF.md`: your original brief, word for word.
- `README.md`: the repository's front page.
- `CLAUDE.md`: standing rules for an AI helper.
- Notes added to `FINAL_REPORT.md`, `ARCHITECTURE.md` and `DECISIONS.md` (D93 to D97).

**Checks**
- Every command named in the handoff guide was run and its result copied from the output: `node --test` (236 pass), the bot on three build orders and a second island, `pace.mjs`, `tune.mjs` and `print-map.mjs`.
- Every file the documents point to exists.
- The two browser checks named in the guide were last run during Phase 7. No code has changed since.

**Weak or unfinished**
- **The sizes in the roadmap are estimates** from how long earlier phases took. The large items in particular could be off.
- **The roadmap is my view of what matters.** You have not yet played a full game and told me what you think is missing.
- **The start-of-session prompt is untested.** I wrote it and have not tried it on a fresh helper.

## Phase 8: Save, title screen, drawing speed

Date: 2026-11-11. Status: approved by Colin with no changes.

**Turns used:** 1 (your message "Just keep building"). No plan was shown first, at your word (D98).

**What was built**
- **Save and load.** The game saves itself and offers Continue when you come back. One saved game, kept in the browser.
- **A title screen**, with the island behind it: Continue, New game, New game on a random island, and a link to a finished town.
- **A choice of island.** A random island is one of a million, and its number shows in the ? panel.
- **A drawing speed fix** at the zoom levels where buildings are shown smaller than they were drawn.
- A test page, `?fresh`, so the test tools never touch a saved game.

**Automated tests: 271 pass, 0 fail.** That is 236 from before plus 35: 20 for saving and loading, 14 for the save slot and the title screen, and 1 more from the guard that keeps browser code out of the simulation, which now also covers `save.js`.

**Browser checks**

| Check | How | Result |
|---|---|---|
| The title screen appears, with two new-game buttons and no Continue when nothing is saved | First load, read from the page and seen | Pass |
| New game starts a game and saves it at once | Real click, then read the stored save | Pass |
| A refresh keeps the game | Built a house, ran 2 minutes, reloaded the page | Pass. Continue read "2:08 played, 0 of 100 Workers, 525 coins". |
| Continue restores the game exactly | Real click, compared clock and buildings | Pass |
| Leaving the page saves | Ran 777 ticks and left at once, before the 10 second save | Pass. The stored clock went from 42 to 819. |
| New game over a saved one needs two presses, and the first press wears off | Real clicks. Waited 5 seconds after the first. | Pass. The saved game was untouched. |
| A random island is a different island, drawn correctly, and saved as that island | Two real clicks | Pass. Island 621985. |
| Continue brings back a random island, and the view | Moved and zoomed the view, went to the title, continued | Pass. Same island, same spot, same zoom. |
| A save made under changed rules is refused with an explanation | Changed the stamp in the stored save | Pass. No Continue button. The save was left in place. |
| Unreadable text in the save slot, and a damaged save | Stored garbage, then a save with a building moved off the island | Pass, both. No error. Each gets its own sentence. |
| `?fresh` and `?demo` never touch the saved game | Compared the stored save before and after each test below | Pass |
| A full game through the UI still matches the headless bot | UI playthrough on `?fresh` | Pass. Won at 28.55 minutes, identical final state. |
| Random input | 7,000 actions over 3 runs, on `?fresh` and `?demo` | Pass. No errors. |
| A game left by the random-input test still saves and loads | Saved and loaded the games from two of the three runs | Pass, both |
| The ? panel at 1280 by 720 | Screenshot | Failed at first, then fixed. See bug 1. |
| The error console after all of the above | Read it | Three warnings, one for each refused save, as intended. No errors. |

**Drawing speed**

Milliseconds to draw one frame of the demo town (32 buildings) in my test browser. Each zoom was drawn the old way and the new way in turns, 20 times each, and the cost of measuring (2.9 ms) was taken away.

| Zoom | Before | After |
|---|---|---|
| 0.35 (whole island) | 39 | 20 |
| 0.5 | 24 | 22 |
| 0.7 | 45 | 23 |
| 0.9 | 48 | 25 |
| 1 | 26 | 24 |
| 1.5 | 28 | 28 |
| 2 | 21 | 20 |
| 3 | 21 | 21 |

- The fix halves the frame time at the three zoom levels that were slow and leaves the rest alone. Frame time is now about the same at every zoom.
- **About 20 to 28 ms a frame is still not smooth in my test browser.** Smooth is under 16. That browser is slow and I do not know how it compares with yours. This is still the thing I most need you to look at.
- Where the time goes at zoom 0.7, measured piece by piece: water and ground 4 ms, roads 3.5 ms, buildings and everything on them the rest. The buildings' share grows with the number on screen.

**Bugs found: 1 in this phase's work, fixed. 2 mistakes of mine from Phase 7, corrected.**
1. **The ? panel ran under the build menu** on a 1280 by 720 window once two lines about saving were added, hiding the new button. The button and the save note now come first in the panel, and the panel scrolls on a short window.
2. **My Phase 7 explanation of the slow zoom was wrong.** I blamed shrinking the large ground picture and proposed a middle-sized one. Measured properly, showing the ground costs about 1 ms at any size. The real cost was the smoothing setting on the building pictures. The middle picture was not built.
3. **My Phase 7 speed table cannot be trusted in its details.** The runs were taken one after another with the measuring cost left in, and that cost drifts by more than the differences I reported. Its broad claim (the art is not slower than the old boxes) may still hold. Its "slower at 0.7" finding was real but for the wrong reason.

**Decisions made:** 16 (D98 to D113). No game rule changed. The bot's result is identical.

**Weak or unfinished**
- **The saved game lives in one browser.** Another browser or computer does not have it, and clearing the browser's stored data deletes it. There is no file to back up.
- **Tuning a number in the data files makes a saved game unusable** until the number is changed back. This is on purpose, and it will get in your way when you tune.
- **Two tabs open on the game overwrite each other's save.**
- **The speed setting, the picked tool and the tip line's memory are not saved.** A continued game starts at 1x.
- **Random islands are not balance-tested one by one.** The bot wins on every other island I have tried, about a dozen, in 26 to 29 minutes. Some island out of a million may be harder.
- **The title screen was checked at one window size**, 1280 by 720.
- **Speed is still unproven on a real screen**, as above.
- **The ground still looks a little soft when zoomed far in.** Not touched in this phase.
- **Not done from the roadmap's Phase 8:** your hand-played game (A1) and a Mac test (A3).

**What I would change**
- I would have measured the slow zoom before writing a cause into the Phase 7 documents and the roadmap. The guess read as a finding.

**After the gate:** committed as `2e549a8` and pushed at your request.

## Phase 9: Life on the map

Date: 2026-11-12. Status: approved by Colin with no changes.

**Turns used:** 1 (your message "keep going"). No plan was shown first, as in Phase 8 (D114).

**What was built**
- **Walkers** on the roads, one for every five residents up to 40, dressed by the kind of house they came from.
- **Carts** that set out for the nearest warehouse when a producer finishes a batch, carrying a load in the color of the good.
- **A boat for every fisherman** that rows out, fishes and rows home in step with his work, and sits empty at home when he is not working.
- All of it is decoration. No rule changed, and the bot's result is identical.

**Automated tests: 290 pass, 0 fail.** That is 271 from before plus 19: 18 for where the figures are and how they behave, and 1 for how they are drawn. The whole suite now takes about 3 seconds, up from 1.5, because these tests play long stretches of real games.

**Browser checks**

| Check | How | Result |
|---|---|---|
| People, carts and boats appear in a town | Demo town, counted and seen | Pass. 21 walkers, 5 carts and 6 boats after 30 game seconds. |
| A person behind a house is hidden by it, and one in front is not | Screenshots at two zoom levels | Pass by my eye |
| Boats sit on the water, off the shore by their huts | Screenshot | Pass |
| A full game through the UI still matches the headless bot | UI playthrough on `?fresh` | Pass. Won at 28.58 minutes, identical final state. |
| Random input | 5,000 actions over 2 runs, on `?fresh` and `?demo` | Pass. No errors. After the run every walker and cart was still on a road. |
| The error console | Read it | Empty. |

**Drawing speed.** Milliseconds a frame for the demo town with 32 figures, with and without them, drawn in turns 25 times each, measuring cost (2.1 ms) taken away.

| Zoom | Without figures | With figures |
|---|---|---|
| 0.5 | 18.4 | 20.1 |
| 0.7 | 21.3 | 22.3 |
| 1 | 22.7 | 24.0 |
| 1.5 | 25.4 | 26.7 |
| 2 | 19.2 | 19.5 |

The figures cost about 1 ms a frame, around 5 percent. The frame as a whole is still 20 to 27 ms in my test browser, which is not smooth there, as reported in Phase 8.

**Bugs found: 3, all by the new tests, all fixed.**
1. **A town was filled with one walker too few.** A walker placed on a lone road tile with nowhere to go was dropped and not replaced.
2. **A large town never reached its full number of walkers.** New ones arrived no faster than old ones left, so it hovered around 37 of 40. New walkers now arrive faster while the town is short.
3. **Some new walkers appeared in the middle of nowhere.** A walker meant to step out of a house with no road at its door was put on a random road. It now looks for a house that has a road.

**Decisions made:** 12 (D114 to D125). No game rule changed.

**Weak or unfinished**
- **I have still only seen it in stills.** I checked positions over thousands of ticks by test, but I have not watched anyone walk. Whether the movement looks natural is yours to judge. I would look first at walkers turning corners and at carts overtaking.
- **Walkers wander with no purpose.** Watch one for a minute and it shows.
- **The figures are very simple**: a few rectangles, no faces, legs that swap. They read as people at normal zoom and as blocks when zoomed far in.
- **Carts are a picture of a delivery that has already happened.** The goods are in the stockpile before the cart sets out. If you sell or use them at once, the cart still drives.
- **A cart shows only where goods go, never where inputs come from.** Nothing carries wood to the sawmill.
- **Figures pass through each other**, and a cart can drive through a walker.
- **On the title screen the figures stand still**, because the game behind it is not running.
- **They vanish when zoomed out past 0.5.**
- **Not done:** your hand-played game and a Mac test.

**What I would change**
- I would write the tests for a piece like this before looking at it in the browser. All three bugs were invisible in screenshots and obvious to a test that counted.

**After the gate:** committed as `41be6f2` and pushed at your request.

## Phase 10: Sound

Date: 2026-11-12. Status: approved by Colin with no changes. He has not yet said how it sounds.

**Turns used:** 1 (your message "keep going"). No plan was shown first (D126). You had not chosen where the sounds should come from, so I chose (D127).

**What was built**
- **Seven sounds made by code:** pick, place, road, demolish, upgrade, refuse and win.
- **A quiet sea** in the background, looping with no join.
- **A speaker button** in the top bar and **a volume slider** in the ? panel, both remembered.
- No rule changed. The bot's result is identical.

**The limit that matters most: I cannot hear.** Nobody has listened to these sounds. Everything below is measurement.

**Automated tests: 317 pass, 0 fail.** That is 290 from before plus 27 for sound.

**What the sounds measure as**

| Sound | Length | Peak (1.0 is the most a speaker can take) | What it is made of |
|---|---|---|---|
| pick | 0.05 s | 0.28 | One falling tone, 880 to 660 hertz |
| place | 0.20 s | 0.67 | A low thud falling from 150 to 70 hertz, a knock, a puff of noise |
| road | 0.11 s | 0.52 | A scrape of noise and a short low tone |
| demolish | 0.40 s | 0.70 | Noise that grows more muffled, over a falling low tone |
| upgrade | 0.44 s | 0.33 | Two notes, C then the G above |
| refuse | 0.25 s | 0.28 | Two low notes going down |
| win | 1.17 s | 0.51 | C, E, G, then the C above, held as a chord |
| sea | 14 s loop | 0.50, played at three tenths | Muffled noise in two swells |

Every sound starts at exactly zero and has died away by its end, so none can click. None peaks above 0.9. The loudest is under six times the quietest.

**Browser checks**

| Check | How | Result |
|---|---|---|
| Nothing plays before the first click | Asked for a sound on a freshly loaded page | Pass |
| The very first click makes its sound | A real click on a tool button | Failed at first, then fixed. See bug 1. |
| Each action asks for the right sound | Picked tools, placed on water and on grass, laid and removed road, demolished a house in two clicks, upgraded nothing | Pass. In order: pick, refuse, place, pick, road, pick, demolish, pick, demolish, pick, refuse, pick. |
| Actions spaced like a person's all sound | Six actions, 0.4 seconds apart | Pass. All six started. |
| A burst cannot pile up | The same tool picked 20 times in one instant | Pass. One sound started. |
| The speaker button mutes, unmutes and is remembered | Real clicks, then read the stored setting | Pass |
| The slider sets the volume, and zero shows as off | Moved it to 80, 0 and 50 | Pass |
| The test page is silent | Loaded `?fresh` | Pass |
| A full game through the UI still matches the headless bot | UI playthrough on `?fresh` | Pass. Won at 28.55 minutes, identical final state. |
| Random input | 5,000 actions over 2 runs, one with sound on | Pass. No errors. |
| The error console | Read it | Empty. |

I checked that the browser was asked to play each sound. I could not check that sound came out of a speaker.

**Bugs found: 1, fixed. 1 test of mine corrected.**
1. **The very first click was silent.** A browser's sound system takes a moment to start after the first click, and I refused to play until it reported ready. A sound asked for in that moment is now started anyway and is heard as soon as the system is ready. At most two may wait, so they cannot all go off together.
2. **One of my tests measured the wrong stretch of a sound.** It compared the first and second half of the upgrade sound, where the two notes overlap. It now compares the first moments with the last. The sound was right. The test was wrong.

**Decisions made:** 12 (D126 to D137).

**Weak or unfinished**
- **Nobody has heard any of it.** This is the weakest gate so far. A sound can pass every test here and still be ugly.
- **The low sounds may be faint on small speakers.** The thud of a building and the tumble of a demolish sit between 50 and 150 hertz, which laptop speakers barely play. Each has a higher part on top for that reason, but I could not check that it is enough.
- **The sea is a guess.** Muffled noise with a swell is the usual way to suggest waves. It could as easily sound like wind or a hiss.
- **No music.**
- **Most of the game is silent.** Half an hour of play has sounds only when you act. The town itself makes none.
- **The sounds are simple tones.** They will sound like an old computer game, not like a recording.
- **Safari and Firefox are untested.** The sound code uses the common, long-standing parts of the browser's sound system, but I ran it only in a Chromium browser.
- **Not done:** your hand-played game and a Mac test.

**What I would change**
- I would have said at the start of this phase, not at the end, that I would be building something I cannot check. You may have preferred to pick the sound source yourself.

**After the gate:** committed as `09978b7` and pushed at your request.

## What you told me after playing (2026-11-13)

You played for about 40 minutes on the evening of 2026-11-12 and reported:
- **The game runs smoothly.** This settles the question open since Phase 7. My test browser draws at 20 to 28 ms a frame, which says nothing about your screen.
- **The characters' movement looks fairly smooth.** This settles the Phase 9 question. I had only seen stills.

What you did not say, and I still do not know:
- Whether you won, and how long it took. "I can win by hand" is still passed on your word from Phase 4 only.
- How the sounds are. Nobody has yet told me.
- Whether anything confused or annoyed you.

## Phase 11: Undo and the first-game guide

Date: 2026-11-13. Status: approved by Colin with no changes.

**Turns used:** 1 (your message "Let's keep going, keep building"). No plan was shown first (D138).

**What was built**
- **Undo.** Z, Ctrl+Z or the Undo button takes back your last build, road, upgrade or demolish, for 30 seconds of game time, and gives back everything.
- **A first-game guide.** A small panel with the step you are on, ten steps from the first lumberjack to the win.
- No rule of the economy changed. The bot's result is identical.

**Automated tests: 352 pass, 0 fail.** That is 317 from before plus 35: 22 for undo, 12 for the guide, and 1 more from the guard that keeps browser code out of the simulation.

**Your saved game.** The data files gained a setting and a guide in this phase, and a changed data file normally makes a saved game refuse to load. I made sure it does not here. The rules stamp read `6fe08f1bee9bb754` before the phase and reads the same after it. In the browser, a save with no undo record in it (the shape yours has) was offered for Continue and loaded.

**Browser checks**

| Check | How | Result |
|---|---|---|
| A save from before this phase still loads | Removed the new field from a stored save, reloaded, continued | Pass |
| The guide starts on step 1 and moves on when the step is done | Placed a lumberjack | Pass. "1 of 10" became "2 of 10: Join the Lumberjack to your warehouse with Road". |
| The Undo button says what it would take back, and does it | Placed a lumberjack, pressed the button | Pass. It read "Lumberjack". The building went and the coins returned to 500. |
| Z and Ctrl+Z do the same | Placed and undid twice more | Pass, both |
| Undo with nothing to take back | Pressed the button again | Pass. "There is nothing to undo." Nothing changed. |
| The guide hides while the ? panel is open, and can be hidden and brought back | Opened the panel, used its button | Pass. The choice was stored. |
| "All steps" shows the list with ticks | Pressed it | Pass. One done, one current, eight to come. |
| All 13 tools fit one row at 1280 wide | Measured | Failed at first, then fixed. See bug 3. |
| No guide on the demo town or the test page | Looked | Pass |
| A full game through the UI still matches the headless bot | UI playthrough on `?fresh` | Pass. Won at 28.55 minutes, identical final state. |
| Random input, now including the undo key | 6,000 actions over 2 runs | Pass. No errors. Both games still saved and loaded afterwards. |
| The error console | Read it | Empty. |

**Bugs found: 3, all fixed. 8 mistakes in my own tests, corrected.**
1. **Undo did not put one thing back.** After a demolish that cut a producer off from the warehouse was undone, that producer's status read "working" where it had read "storage full". The game corrects the word on its next tick, so nothing went wrong in play, but the promise was "exactly as it was". Found by the test that undoes 600 random actions. Undo now restores it.
2. **The guide skipped steps.** My first rule moved the guide past any step that came before one already done. Building a sawmill early then skipped "build 4 houses" and "grow to 16 residents". Found by running the guide over a scripted game. The rule is now: tick each step when it is true, show the first one not ticked.
3. **The tool row wrapped onto two lines** at 1280 wide once Undo made 13 buttons, pushing the menu off the bottom. The buttons are now slightly narrower under 1420 pixels.

Eight of my new tests were wrong when first written, not the game: a road that I thought would hit a building and did not, a bot I tried to pause and resume when it cannot be, and the like. Each failed, I read why, and I fixed the test. None was loosened to let a real fault through.

**Decisions made:** 13 (D138 to D150).

**Weak or unfinished**
- **The guide is my guess at what a new player needs.** You gave no notes on what confused you, and nobody new to the game has tried it. Its wording has never been read by a first-time player.
- **The guide does not adapt.** It is the same ten steps whatever you do. It does not notice that you are out of wood or that your market is in the wrong place. The tip line still covers shortages.
- **Undo is one step.** Two mistakes in a row, and only the second can be taken back.
- **30 game seconds is 7.5 real seconds at 4x speed.** That may feel short. It is one number in `config.json`.
- **Undo then reload can confuse the guide.** If you undo the building a step asked for, the step stays ticked for that visit. After a reload the guide works out its place afresh.
- **Below about 1200 pixels wide I did not check the tool row** beyond one measurement at 1100, which fitted.
- **Still unknown from your play:** whether you won, how long it took, and how the sounds are.
- **Not done:** a Mac test.

**What I would change**
- I would run every new piece over a whole scripted game before trusting its rule. Both real bugs in the logic came from that, and neither showed in a single hand-built case.

**After the gate:** committed as `2612622` and pushed at your request.

## Phase 12: Artisans and a goal after the win

Date: 2026-11-13. Status: approved by Colin. His reply was "Moved and please proceed", which I read as "Approved".


**Turns used:** 1 (your message "just keep going"). No plan was shown first. The roadmap asked you for three choices before this item, and with no answer I made them (D151 to D155).

**What was built**
- **Two new goods and two new buildings:** a Sheep farm makes wool, and a Weaver turns wool into cloth.
- **A third kind of resident:** Artisans, 12 to a house, who need fish, bread and cloth and pay the most tax.
- **A goal after the win:** 100 Artisans, with its own screen.
- **Older saved games still load.**
- The game up to the win is unchanged.

**Automated tests: 373 pass, 0 fail.** That is 352 from before plus 21 new ones. Ten older tests were also brought up to date, because they stated things that are no longer so: that there are five goods, that a Worker house cannot be upgraded, that the guide ends at the win. Each was changed to state the new fact, and none was weakened.

**Balance, by the bot**

| | First numbers | Final numbers |
|---|---|---|
| Artisan tax per resident a minute | 0.9 | 1.2 |
| Upgrade to Artisan | 40 coins, 8 planks | 30 coins, 8 planks |
| Bot's build order for the second act | one sawmill | a second sawmill first |
| Win | 28.6 min | 28.6 min |
| 100 Artisans | 67.8 min, 39 after the win | 49.8 min, 21 after the win |
| Income at the end | +30.6 a minute | +58.8 a minute |
| Lowest income after the win | +15.2 | +29.2 |

- With the first numbers the second act made the town poorer than it was at the win. That is a tier not worth building.
- **Planks are the bottleneck.** The second act needs about 140 planks, and one sawmill makes under 4 a minute. The bot now builds a second sawmill first, and the guide says so.
- On two other islands the second act took 20.3 minutes.
- The three original build orders give exactly the results they gave before: 28.6, 30.4 and 52.9 minutes.

**Your saved game**
- The rules stamp was `6fe08f1bee9bb754` before this phase and is `b16fd0a9142282c9` now. A changed stamp normally means a saved game is refused.
- The rules now also work out the stamp they would have without the new content. It comes to exactly `6fe08f1bee9bb754`, so a save from before is recognised and carried forward.
- I made a save in the browser under the old data files. It carried the old stamp. The title screen offered Continue, and it loaded with wool and cloth at zero, the new buildings on offer, and the guide on step 10 of 13.

**Browser checks**

| Check | How | Result |
|---|---|---|
| A save made under the old rules is offered for Continue and loads | As above | Pass |
| The new buildings and the Artisan house are drawn | A town played to 45 minutes by the bot, then zoomed in | Pass by my eye. See `docs/screenshots/phase12-*.jpg`. |
| The win screen mentions the next goal | Read it | Pass. "There is more, if you want it. Next goal: 100 Artisans." |
| The goal screen appears at 100 Artisans, after the win screen, and pauses the game | Played to the end by the bot | Pass. "A city of Artisans ... That was the last goal. The island is yours." |
| The goal bar switches from the win to the next goal | Read it | Pass. "Goal 100", then "100 Artisans". |
| Fifteen tools fit one row at 1280 wide | Measured | Failed at first, then fixed. See bug 1. |
| The top bar fits one row at 1280 wide, early and late in a game | Measured | Failed at first, then fixed. See bug 2. |
| A full game through the UI still matches the headless bot | UI playthrough on `?fresh` | Pass. Won at 28.55 minutes, identical final state. The same game then went on to 100 Artisans at 51.4 minutes. |
| Random input, which now also places the new buildings | 6,000 actions over 2 runs | Pass. No errors. A sheep farm and a weaver were among the buildings it placed. |
| The error console | Read it | Empty. |

**Bugs found: 3, all fixed. One design problem, fixed by tuning.**
1. **The tool row wrapped onto two lines** at 1280 wide with 15 buttons. The buttons now slim down in two steps.
2. **The top bar wrapped onto two and three lines** with seven goods and three kinds of resident. Under 1460 pixels the storage limit is left out, and the goal label is shorter.
3. **A save with an empty list of goals was refused as damaged** when carried forward. Your real save has no such list at all, so it would have loaded, but the test built its save a slightly different way and caught the gap.
4. **Design problem:** the second act as first tuned took 39 minutes and lost money. See the table above.

**Decisions made:** 14 (D151 to D164).

**Weak or unfinished**
- **Every choice here was mine.** The names, the chain, the goal, and that the win stays put. You may want none of it, or something else.
- **The second act is the first act again with one more need.** There is no new idea in it: no new kind of placement, no trade-off. It is more game, not different game.
- **After 100 Artisans there is nothing.**
- **Balance was checked by one build order on four islands.** A player who does not build a second sawmill will wait a long time for planks. The guide mentions it. The tip line will say "Planks keep running out. Build another sawmill."
- **Cloth is only used by Artisans.** Wool is only used for cloth. Neither matters until after the win.
- **The top bar no longer shows the storage limit at 1280 wide.** You learn a good is full by its color, or by hovering.
- **"Sheep farm" wraps onto two lines on its button** at 1280 wide.
- **The drawings are in the same simple style**, and I judged them from stills.
- **No new sounds.**
- **Not done:** your notes from playing, and a Mac test.

**What I would change**
- I would have asked you the three questions as one short message before starting. I had asked for other things three gates running and got "keep going", so I did not. A phase this size deserved one more try.

**After the gate:** committed as `89035d0` and pushed at your request.

## Phase 13: Small polish

Date: 2026-11-13. Status: taken as approved. Colin's reply to the gate was "Keep going".


**Turns used:** 1 (your message "Small polish", chosen from the options I gave at the Phase 12 gate). No separate plan was shown: the three items were the plan.

**What was built**
- **Difficulty.** Easy, Normal and Hard, picked on the title screen for a new game.
- **Three looks for each kind of house.**
- **A sharp ground when zoomed far in,** once the view stops moving.
- On Normal, nothing about the rules changed.

**Automated tests: 389 pass, 0 fail.** That is 373 from before plus 16: 14 for difficulty, 1 for house looks and 1 for drawing part of the ground.

**Your saved game.** The rules stamp for Normal is `b16fd0a9142282c9`, the same as before this phase, and the older stamp is still recognised. A test also checks that a game with no difficulty recorded in it loads as Normal.

**Balance, by the bot** (minutes to the win)

| Build order | Easy | Normal | Hard |
|---|---|---|---|
| Standard | 28.6 | 28.6 | 36.9 |
| Careless | 30.4 | 30.4 | 30.8 |
| Reckless (bread first) | 33.4 | 52.9 | stuck |
| Standard, then 100 Artisans | 48.8 | 49.8 | 69.6 |

I tried thirteen versions of Hard. In twelve the reckless opening never won, including two that kept all 500 starting coins and only cut tax. In one (450 coins, 22 a minute, 15% less tax) it won, after 114 minutes. So I found no Hard that is both harder and safe from that opening. The version shipped keeps Normal's safety-net income, and the stuck town is shown by a test to be rescued by demolishing.

**Browser checks**

| Check | How | Result |
|---|---|---|
| The title screen offers Easy, Normal and Hard, starting on Normal | Read and seen | Pass |
| Picking Hard and starting a game gives a Hard game | Real clicks | Pass. 350 coins, Farmer tax 0.72, and the ? panel reads "Island 1407, the standard island. Hard." |
| The Hard game is saved as Hard, and Continue says so | Reloaded the page | Pass. "0:02 played, 0 of 100 Workers, 350 coins, Hard". |
| A Normal game saved before this phase is still offered | It was in the save slot from Phase 12's checks | Pass |
| The ground is sharp when zoomed in and still, and not while moving | Read the renderer's own flag at zoom 1, 2 and 3 | Pass. Off at zoom 1. At 2 and 3: off while moving, on when still. |
| It looks sharper | Two screenshots of the same spot, before and after stopping | Pass by my eye. Tile edges and grass are crisp in the second. |
| Houses in a town differ | Screenshot at zoom 3 | Pass by my eye. Chimneys on different sides, roofs of slightly different shades. |
| A full game through the UI still matches the headless bot | UI playthrough on `?fresh` | Pass. Won at 28.55 minutes, identical final state. |
| Random input | 6,000 actions over 2 runs | Pass. No errors. |
| The error console | Read it | Empty. |

**Drawing speed with the sharp ground** (my test browser, 1920 by 1080, milliseconds a frame, not adjusted for the cost of measuring)

| Zoom | While moving | The one frame that makes the sharp copy | When still |
|---|---|---|---|
| 2 | 29 | 78 | 22 |
| 3 | 31 | 79 | 23 |

- The sharp copy costs one slow frame each time you stop, about 50 ms more than usual in my browser.
- After that, a still view draws a little faster than before, because the copy goes on pixel for pixel.
- These numbers are from my slow test browser. You have told me the game runs smoothly on your screen. I do not know whether the one slow frame shows there.

**Bugs found: 1 design problem, 2 small faults, all dealt with.**
1. **Design problem: my first Hard could trap a player for good.** With the safety-net income cut, a reckless opening ended at zero coins, losing money, with no way to recover but demolishing, and several versions were worse still. Hard now keeps that income. One opening still needs a demolish to recover, which is recorded as a decision (D168) and tested.
2. A broken list of difficulties in the data gave an unhelpful error from the wrong place. It now reaches the data check, which names the mistake.
3. One of my tests tried to rescue the stranded town with a build order that made things worse. I looked at the town, saw it had no market or houses, and wrote the rescue a person would do.

One reading that looked like a bug and was not: after the random-input run, the sharp ground did not appear. My test browser had stopped drawing frames. Drawn by hand, it appeared.

**Decisions made:** 11 (D165 to D175).

**Weak or unfinished**
- **Easy does not speed up a good player.** It only forgives a bad start. Someone who picks Easy expecting a shorter game will not get one.
- **Hard is mostly "slower", not "different".** Eight more minutes to the win, twenty more to 100 Artisans. Nothing new to think about.
- **On Hard, one bad opening needs a demolish to recover.** The game says so in a line of text, and nothing more.
- **The house looks are subtle.** At normal zoom you may not notice them.
- **The sharp ground pops in** a moment after you stop. It is a visible change, like a map sharpening.
- **One slow frame each time you stop while zoomed in.** Unmeasured on your screen.
- **Still unknown from your play:** whether you won, how the sounds are, whether the guide and the second act make sense.

**What I would change**
- I would have decided what Hard must never do before choosing its numbers. I started from "make it harsher" and only then found the trap.

**After the gate:** committed as `86f9ac2`, and pushed together with Phase 14 when you approved both.

## Phase 14: Dust, smoke, and day and night

Date: 2026-11-13. Status: approved by Colin with no changes ("Approve and push both").


**Turns used:** 1 (your message "Keep going", after your usage limit reset). I took it as approval of Phase 13 and as a request to carry on (D176, D177).

**What was built**
- **Dust** when a building appears, is demolished, or is taken back with Undo, and a quick settle to full size for a new one.
- **A wisp of smoke** from every house with people in it.
- **Day and night**, 8 game minutes to a day, with a switch in the ? panel.
- No rule changed, and nothing was added to the game state.

**Automated tests: 404 pass, 0 fail.** That is 389 from before plus 15: 13 for when dust appears and how night comes and goes, and 2 for how dust and house smoke are drawn.

**Browser checks**

| Check | How | Result |
|---|---|---|
| Night dims the picture and lights the houses, and the numbers and marks stay bright | Ran the demo town on to full night, at two zoom levels | Pass by my eye. See `docs/screenshots/phase14-night.jpg`. |
| The "Day and night" box switches it off and is remembered | Clicked it, read the renderer and the stored choice | Pass |
| A new building raises dust | Placed a house and drew a frame a quarter of a second later | Pass. Pale puffs around the new house. |
| Lived-in houses smoke, the empty new one does not | Same screenshot, zoomed in | Pass by my eye. See `docs/screenshots/phase14-dust-and-chimney-smoke.jpg`. |
| A full game through the UI still matches the headless bot | UI playthrough on `?fresh` | Pass. Won at 28.55 minutes, identical final state. |
| Random input | 6,000 actions over 2 runs | Pass. No errors. |
| The error console | Read it | Empty. |

**Drawing speed.** Milliseconds a frame for the demo town at full night against the same frame with night switched off, drawn in turns 25 times each, cost of measuring taken away.

| Zoom | Day | Night |
|---|---|---|
| 0.7 | 8.9 | 11.1 |
| 1 | 7.4 | 9.1 |
| 2 | about 0 | 2.5 |

Night costs 2 to 3.5 ms a frame in my test browser. I did not measure the smoke and dust separately: the smoke is two small dots a house, and dust is on screen for under a second.

**Bugs found: 0.** No test or check failed in this phase. As I said in Phase 6, after many phases that each found several, that is more likely thin testing than perfect code. What I could not test is the part that matters most here: how the effects look in motion.

One adjustment by eye: the night light sat on each roof like a spotlight. I moved it toward the windows on the near wall.

**Decisions made:** 10 (D176 to D185).

**Weak or unfinished**
- **I have seen all three only in stills.** Dust lasts under a second and I caught it in one frame. I have not seen it play, nor smoke rise, nor dusk fall. Tell me if any of it looks wrong in motion.
- **Night is a tint, not lighting.** Roads, trees and water all dim by the same amount. The house light is a soft blob, not light from the windows.
- **Night may be tiring or may make the game harder to read for you.** I kept it mild and made it switchable, but I cannot judge comfort.
- **Dust is the same for every building**, large or small apart from how far it spreads.
- **Windows are lit day and night alike.** They do not come on at dusk.
- **Not done:** your notes from playing, and a Mac test.

**What I would change**
- Nothing in how this phase was built. But this is the fourth phase in a row whose result only you can judge by eye or ear, and I have had no notes on the earlier three. The list of things I cannot verify is growing faster than the list I can.

**After the gate:** committed as `e8d49c8` and pushed, on your "Approve and push both".

## Phase 15: Staff for buildings

Date: 2026-11-13. Status: approved by Colin with no changes (he asked for the commit).

**Turns used:** 2. Your "Workers for buildings", and one message to carry on after your usage limit reset in the middle of the work. No plan approval was asked for (D186).

**What was built**
- **The rule:** producing buildings need staff, staff come from residents, and a town that is short works slower, every producer by the same share (`src/sim/staff.js`, `SPEC.md` section 16).
- **On screen:** a staff count in the top bar, a line in each producer's panel, a line in the build menu, a tip when short, two sentences in the ? panel.
- **Older saved games still load,** now from two generations back.
- **The bot** reports time spent short of staff.

**Automated tests: 435 pass, 0 fail.** That is 404 from before, plus 30 new ones in `tests/staff.test.js`, plus 1 because the check that simulation files use no browser code runs once per file and there is a new file. 7 older tests were edited to follow two changes: the list of later additions became a list of rounds, and a producer's panel has one more line. None was loosened.

**Did the tests mean anything?** I broke the rule on purpose in three ways and ran the new tests each time.

| Break | Tests that failed |
|---|---|
| A shortage no longer slows anything | 4 |
| Residents add no staff | 8 |
| Producers with no road count as needing staff | 1 |

The first break showed that one of my tests was too weak: its lumberjacks filled the storage either way, so it passed with the rule broken. I rewrote it to count logs before storage fills.

**Balance, by the bot.** Seven sets of numbers were tried on all four build orders and all three difficulties (84 games). Chosen: the set in D189 and D190.

| Build order | No staff rule | With it | Short of staff |
|---|---|---|---|
| Standard, Normal | 28.6 min | 28.6 min | never |
| Careless, Normal | 30.4 | 30.4 | never |
| Bread first, Normal | 52.9 | 58.7 | 7.8 min, slowest 46% |
| Bread first, Easy | 33.4 | 36.0 | 5.5 min, slowest 46% |
| Artisans, Normal (goal after the win) | 49.8 | 50.5 | 14.1 min, slowest 78% |
| Artisans, Hard | 69.6 | 69.6 | 18.7 min, slowest 78% |
| Standard and careless, Easy and Hard | unchanged | unchanged | never |

Bread first on Hard did not win before this phase (the trap written up in Phase 13) and does not win now.

**Rules stamps.** Before: `b16fd0a9142282c9` (Normal). After: `10d0dc80671f7e66`. Taking the staff numbers out of today's data gives back `b16fd0a9142282c9` exactly, and taking Phase 12's additions out as well gives `6fe08f1bee9bb754`. A Hard game of Phases 12 to 14 carried `d002f8878cb41b57`, which is also reproduced.

**Browser checks** (on the test page, which never saves)

| Check | How | Result |
|---|---|---|
| A full game through the real UI | UI playthrough | Pass. Won at 28.8 minutes, 32 buildings, staff 51 needed and 64 in town, "13 spare" in the top bar. |
| A town short of staff | Ran the Artisans order to minute 45 | Pass. "10 short" in amber; hover text gives the sum and "88% speed". See `docs/screenshots/phase15-short-of-staff.jpg`. |
| The tip | Let 45 game seconds pass | Pass. "Your buildings are short of staff and work at 88% speed. Build more houses." It showed after the win, which it could not have before D199. |
| A producer's panel | Clicked the weaver | Pass. "Needs 5. Town is short: 88% speed". See `docs/screenshots/phase15-staff-panel.jpg`. |
| The build menu | Hovered Bakery | Pass. "Needs 5 staff." |
| The top bar stays on one row at 1280 px | Measured each part | Pass after a fix (bug 4). |
| A real older save | The Hard game left in my test browser by Phase 13, read without changing it | Pass. Stamp `d002f8878cb41b57`, loaded as a Hard game under today's rules. |
| The demo town | Opened `?demo` | Pass. 51 needed, 64 in town. |
| Random input | 20,000 actions | Pass. No errors. |
| The error console | Read it | Empty. |

**Bugs found: 4, and 3 mistakes in my own new tests.**

1. **Tips stopped at the win.** Since Phase 12 the tip line was switched off once you had won, so its wool and cloth tips could never appear in a real game, though their test passed. Found because the staff tip did not show where I expected. Fixed (D199). This was a hole in Phase 12's testing: I tested the tip-maker, not whether the screen showed its tips.
2. **Carrying a save forward wiped its goals after the win.** Harmless while only one older generation existed. With two, a save from Phases 12 to 14 would have lost its "100 Artisans" record. Fixed before it could happen, and tested.
3. **Undo no longer restored the state byte for byte.** The new counter was written after the undo note, and undo rewrites the note last, so the order of entries changed. An existing undo test caught it at once. Fixed by where the counter sits.
4. **The top bar wrapped to two rows at 1280 px** once the staff count was in it. Fixed with tighter spacing under 1380 px.

Test mistakes: my row of lumberjacks stood too far from the forest; a helper emptied the wood store that later steps needed; and the weak test named above.

One slip caught on the spot: a note I wrote in `buildings.json` had quotation marks inside it, which broke the file. The game refused to start and said where.

**Decisions made:** 19 (D186 to D204).

**Weak or unfinished**
- **The rule may be too gentle to notice.** A sensible first game never meets it. That was the aim, but it means you may play 30 minutes and only see "13 spare". It is felt in the second act and in a town that builds workshops first.
- **The second-act shortage barely slows the bot:** 14 minutes short and the goal arrives 0.7 minutes later, because its workshops made more than the town used. For a person the cost will depend on how tightly they built.
- **Nobody has played it.** The numbers come from one bot with four build orders. Whether "10 short" and the tip are understood, and whether building houses feels like the right answer, I cannot tell.
- **Your saved game may load short of staff** if the town has many workshops for its size. It will say so.
- **Staff are a number.** No one is seen going to work, and a building cannot be closed to lend its staff elsewhere.
- **A waiting building still holds its staff** (D191). A player might expect a farm with nothing to do to free its people.
- **The Staff line in a panel is terse** when short: "Needs 5. Town is short: 88% speed". A longer sentence wrapped badly.
- **The build menu's description line now wraps to two lines** for the longest buildings at 1280 px.
- **The top bar has little room left** at 1280 px. One more item there will need a different layout.
- **Not done:** your notes from playing, and a Mac test.

**What I would change**
- I would have tested in Phase 12 that a tip reaches the screen after the win. A whole phase's tips were invisible for three phases and no test or check of mine noticed.
- The roadmap promised idle buildings and I built a slowdown. I think it is the better rule, but it is a different one, and I chose it without asking (D188).

**After the gate:** committed as `b8e7a04` when you asked for the commit, and pushed when you said "Push".

**A correction, found in Phase 16.** The table above says the game through the real UI "won at 28.8 minutes". The true figure is 28.55, the same as every phase before. In that one run my test browser happened to be drawing, so the game's own clock ran alongside the script for about 17 seconds. I did not compare the final state with the bot's in Phase 15, as earlier phases did. Phase 16 did, and they are identical.

## Phase 16: Closing a building for now

Date: 2026-11-13. Status: approved by Colin with no changes (he asked for the commit).

**Turns used:** 1 (your "Keep going!"). No plan approval was asked for (D205).

**What was built**
- **Close for now and Reopen** on every building that makes something. A closed building makes nothing, needs no staff, and still costs its upkeep (`SPEC.md` section 17).
- **Undo** for both.
- **On screen:** the two buttons, a grey mark on the map, new words in the panel, the top bar's hover text and the tips.
- **No data file changed.** The rules stamp is still `10d0dc80671f7e66`, so every game saved in Phase 15 loads as it is.

**Automated tests: 457 pass, 0 fail.** That is 435 from before plus 22 new ones in `tests/closing.test.js`. 4 older tests were edited: three for new wording, and the random undo test, which now also closes and reopens buildings (800 random actions, was 600) and requires every kind of action to have been undone at least 5 times.

**Did the tests mean anything?** I broke closing on purpose in five ways.

| Break | Tests that failed |
|---|---|
| A closed building goes on working | 12 |
| A closed building still needs staff | 5 |
| Undo forgets the status word the building had | 2 |
| A change to the roads forgets that a building is closed | 7 |
| Loading accepts any closed mark | 1 |

**The bot.** Unchanged, as it never closes anything: standard order wins at 28.6 minutes, Artisans goal at 50.5.

**Browser checks** (on the test page, which never saves)

| Check | How | Result |
|---|---|---|
| Close a building in a town short of staff | Ran the Artisans order to minute 45, selected the weaver, pressed Close for now | Pass. Top bar went from "10 short" to "5 short". Panel: "Closed. It makes nothing.", "None while closed (5 when open)", a Reopen button. Grey mark on the weaver. See `docs/screenshots/phase16-closed-weaver.jpg`. |
| The hover text | Read it | Pass. "...94% speed. Build more houses, or close a building you can spare. 1 building is closed and needs none." |
| Reopen | Pressed Reopen | Pass. Back to "10 short", status "Working.", Undo button reads "Reopening". |
| Undo with the Z key | Pressed Z after a reopen | Pass. The weaver was closed again and the Undo button read "Nothing yet". |
| A full game through the real UI matches the headless bot | UI playthrough, then the bot's game stepped to the same tick | Pass. Both won at tick 17131 (28.55 minutes) and the two games are identical. |
| Random input, which also presses the new buttons | 20,000 actions on the demo town | Pass. No errors. |
| The error console | Read it | Empty. |

**Bugs found: 0 in the game. 3 mistakes in my own new tests,** all caught on first run: a wrong count of logs after reopening a sawmill, and twice a helper that emptied the wood a later house needed.

**Something I learned about my test browser.** Its page only redraws when I take a screenshot. Twice I read the screen's words straight after a click and got the old ones, which looked like a bug and was not. I now take a screenshot before reading. This also explains the wrong "28.8 minutes" in Phase 15, corrected above.

**Decisions made:** 13 (D205 to D217).

**Weak or unfinished**
- **Nobody has played it.** Whether "Close for now" is found, and whether the grey mark is noticed, I cannot tell.
- **I pressed the buttons from a script, not with the pointer.** The panel redraws many times a second, and my test tool lost hold of the button between finding it and clicking it. The script's click goes through the same code as a real one. The random-input test does click the real buttons.
- **Closing saves no coins.** A player may expect it to. The button says "still costs its upkeep".
- **One building at a time.** A town with six farms to close needs six selections.
- **The mark is small** and sits above the building's back corner, where the top bar can cover it for buildings near the top of the screen.
- **A closed fisherman's boat** stays at its hut, as for any idle fisherman. Nothing else shows a closed building apart from the mark.
- **Still open from Phase 15:** whether staff should bite before the win (D206).
- **Not done:** your notes from playing, and a Mac test.

**What I would change**
- Nothing in the code. In the checking: I should have compared the UI game with the bot's in Phase 15, as I had in every phase before it. Dropping that step let a wrong figure into the log.

**After the gate:** committed as `ee25329` when you asked for the commit, and pushed when you said "Push".

## Phase 17: Scenarios

Date: 2026-11-14. Status: approved by Colin with no changes ("Proceed, do an amazing job!").

**Turns used:** 1 (your "Keep going"). No plan approval was asked for (D218).

**What was built**
- **Scenarios:** a new game with its own island, start and goal, chosen on the title screen (`SPEC.md` section 18).
- **Three of them:** Fishing village (120 Farmers), The weavers' guild (60 Artisans from a well-off start), and Short-handed (100 Workers with a tighter staff rule).
- **Medals:** gold, silver or bronze by the time of the win, shown on the win screen. The title screen keeps your best time in each.
- **The standard game did not change.** Its rules stamp is still `10d0dc80671f7e66`, and a test proves it plays the same with or without the scenarios in the data.

**Automated tests: 480 pass, 0 fail.** That is 457 from before plus 23 new ones in `tests/scenarios.test.js`. 3 older tests were edited: two to expect the new medal entry (empty in the standard game), and the helper that rebuilds "the data files as they were" now also takes the scenarios out.

**Did the tests mean anything?** All 23 new tests passed the first time they ran, which proves little. So I broke scenarios on purpose in six ways.

| Break | Tests that failed |
|---|---|
| A scenario's goal is ignored | 8 |
| A save forgets its scenario | 3 |
| Gold needs a time under the limit, not within it | 1 |
| A slower win replaces the best time | 1 |
| The scenarios count as rules of the standard game | 10 |
| A scenario's island is ignored | 2 |

**Choosing the scenarios, by the bot.** 26 candidate set-ups were played, each at an instant pace and at a person's typical pace.

| What I tried | What the bot did | What I chose |
|---|---|---|
| Fishing village at 60 and 80 Farmers | 3.1 and 6.2 minutes | 120 Farmers: 10.5 minutes |
| Short-handed with first crews of 8, 10, 12, 14, 16 and 1 in 4 or 1 in 5 working | Smaller crews left one build order or the other stuck on bread for ever, or winning at one pace and not at another | 16 and 1 in 4: 29.6 minutes, short of staff for 17.7 |
| The weavers' guild from the standard start, 1000 coins, 1500 coins | 59, 20 and 9.5 minutes | 1000 coins: 20.0 minutes |
| The weavers' guild with only the six houses it upgrades | Never won: stalled at 49 of 60 Artisans, short of staff | Kept as the scenario's lesson. Four Farmer houses fix it, and a test plays both. |

| Scenario | Instant bot | Typical pace | Slow pace | Gold, silver |
|---|---|---|---|---|
| Fishing village | 10.5, gold | 10.9, gold | 19.3, silver | 13, 20 |
| The weavers' guild | 20.0, gold | 21.9, gold | 27.1, silver | 24, 32 |
| Short-handed | 29.6, gold | 31.3, gold | 35.4, silver | 35, 45 |

The standard game: the bot still wins at 28.6 minutes.

**Browser checks.** My test browser's own storage was empty at the start, so this time I could use the real title screen. I removed what the test left there afterwards.

| Check | How | Result |
|---|---|---|
| The title screen lists the scenarios and fits | Opened it at 1280 by 800 | Pass. See `docs/screenshots/phase17-title-scenarios.jpg`. |
| Starting a scenario from the title screen | Pressed Fishing village | Pass. Goal 120 in the top bar, the game saved with its scenario, no guide shown. |
| A whole scenario through the real buttons matches the bot | UI playthrough of Fishing village and of The weavers' guild, then the bot's game stepped to the same tick | Pass. Both identical: won at 10:44 and 19:58. |
| The win screen shows the medal | Read it after each | Pass. "Gold medal. Gold within 13 minutes, silver within 20." See `docs/screenshots/phase17-gold-medal.jpg`. |
| The best time is kept and shown | Went back to the title screen | Pass. "Your best: 10:44, gold." Continue read "Fishing village, 10:44 played, won with 120 Farmers, 73 coins". |
| Starting another scenario over a saved game needs two presses | Pressed Short-handed once | Pass. The button turned red: "Press again. This replaces your saved game." Nothing started. |
| The ? panel and the clock name the scenario and its times | Read them | Pass. |
| The standard game through the real buttons | UI playthrough | Pass. Won at 28.55 minutes, identical to the bot, and no medal line. |
| Random input in a scenario | 20,000 actions in Short-handed | Pass. No errors. |
| A scenario that does not exist | Opened the test page asking for one | Pass. "Harborfall could not start. There is no scenario called..." |
| The error console | Read it | Empty, apart from that one deliberate error. |

**Bugs found: 1, in a test tool, and 1 in a test helper.**

1. **The through-the-buttons test tool ignored which upgrade a build order asked for.** It upgraded whichever house was ready. No build order had depended on that until The weavers' guild, where it upgraded the wrong houses and never won. The headless bot was right all along. Fixed in the tool. This had been wrong since Phase 12.
2. **The test helper that rebuilds older data files** left the scenarios in, and one of them needs Artisans, which the older data does not have. Fixed in the helper. Real older saved games were never affected.

**Decisions made:** 17 (D218 to D234).

**Weak or unfinished**
- **Nobody has played a scenario.** The medal times come from a bot. Gold may be too easy or out of reach for a person, and I cannot tell which.
- **Short-handed may be the least fun of the three.** It is a long game spent mostly at 70 to 85% speed. I kept it because it answers a question you left open.
- **The weavers' guild can leave a player stuck** until they work out that the workshops need more hands. The tip line says so, but nobody has tried it.
- **One save slot.** Trying a scenario replaces your saved standard game, after a warning.
- **The title box is taller.** It fits a window 800 high. On a shorter one it scrolls inside the box, which I have not looked at.
- **No scenario has a goal after the win,** and none can be played on another island or difficulty.
- **A best time is only kept in the browser it was set in,** and only for games begun from the title screen.
- **Not done:** your notes from playing, and a Mac test.

**What I would change**
- When Phase 12 let a build order name its upgrade, I taught the bot and not the test tool that mirrors it. The two should have been changed together. A tool that silently does something else is worse than one that refuses.

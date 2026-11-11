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

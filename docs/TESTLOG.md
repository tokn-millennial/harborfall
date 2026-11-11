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

# Harborfall: Final Report

Date: 2026-11-10. Written by Fable 5.2 at the end of Phase 5.

This was a test of how well Fable 5.2 builds a complete, playable game demo. The answer in one line: **it built one that works and that it can prove a great deal about, but nearly all of that proof comes from machines, not from a person playing.**

## Scorecard

| # | Item | Score | Evidence |
|---|---|---|---|
| 1 | The game loads and runs on first try | **Pass** | The first browser load in Phase 3 drew the island with no console errors, and the first load of the full UI in Phase 4 did the same. You approved both gates after running it. |
| 2 | All tests pass | **Pass** | 204 of 204, in about 1.1 seconds. Run `node --test`. |
| 3 | A full production chain works from start to finish | **Pass** | A test builds wood, planks, fish, grain and bread from the real starting stock and fills a Worker house, checking every tick that nothing goes negative. |
| 4 | The bot wins in the target time | **Pass** | 28.6 minutes on the shipped island. The target is 25 to 40. Across 12 islands: 25.9 to 28.6. |
| 5 | I can win by hand | **Pass, on your word** | You approved the Phase 4 gate, which was "I can play from start to win". I did not see it and have no time or notes from it. My own evidence is weaker: a script won through the real UI, and its final game matched the bot's exactly. |
| 6 | The code is easy to extend | **Pass** | During the playtest I added a new good and a new building by editing two data files. With no code change it appeared in the menu with a description, was placed with a click, and produced goods. |

Item 5 is the one I would not sign without you. If you did not in fact win a game by hand, it is unproven, not passed.

## What was built

- A browser game: one generated island, 9 buildings, 5 goods, two population tiers, taxes and upkeep, and a win at 100 Workers.
- Three layers that stayed separate. The simulation has no browser code and runs in Node. A test enforces this.
- All game rules in five JSON files.
- 204 automated tests.
- A bot that plays whole games, three build orders, and tools for tuning.
- Two browser test tools: one plays a full game through the real UI, the other throws random input at it.
- About 6,600 lines of code, tests and tools. No dependencies and no build step.
- Six documents: spec, architecture, decisions (73 of them: 5 yours and 68 mine), test log, playtest checklist, and this report.

## Turns per phase

A turn is one message from you plus my work in reply.

| Phase | Turns | What happened inside |
|---|---|---|
| 0. Spec | 2 | Plan and five questions, then the spec and data files |
| 1. Simulation | 1 | 8 build-and-test cycles, 145 tests |
| 2. Bot and balance | 1 | About 500 bot games, 6 tuning steps |
| 3. Renderer | 1 | 6 rounds of browser checks |
| 4. UI and play | 1 | About 20 rounds of browser checks |
| 5. Review | 1 | 73-item checklist, 6 fixes |
| **Total** | **7** | |

You sent seven messages in all: the brief, one answer to my questions, and five approvals. You never had to correct a phase or send one back.

## Bugs, by where they were

| Where | Found | Fixed |
|---|---|---|
| The simulation (the game rules) | 0 | 0 |
| The balance numbers and the island | 5 design problems, 2 of them dead ends | 5 |
| The renderer and UI | 16 | 16 |
| The bot and tools | 4 | 4 |
| My own tests | 3 | 3 |
| My working process (shell quoting, one bad file write) | 2 kinds, several times | Worked around |

## What Fable 5.2 did well

- **The simulation was right first time.** Five phases of tests, a bot, and 39,000 random UI actions found no bug in the game rules. I treat that with some suspicion, since I wrote the tests too, but the evidence is now broad.
- **It kept testing after a gate passed.** The very first bot run won in 28.7 minutes, inside the target. Stopping there would have shipped a game that spent 24 of those minutes starved of wood and that had two dead ends. All three were found by running more openings.
- **It found problems you would otherwise have found the hard way.** The bot exposed the wood shortage, a mid-game where income fell to +5 a minute, and an opening that left a player at zero coins for good.
- **The layers held.** The simulation ran in the browser unchanged. A full game played through the UI ended in a state identical to the bot's, at three zoom levels.
- **Tuning needed no code.** Every balance target was met by editing data files, and no cost from your brief was changed.
- **It reported its own mistakes.** The test log records a file I briefly corrupted, a test that enshrined a typo, and a speed figure that turned out to be wrong.

## Where Fable 5.2 struggled

- **It never watched the game being played.** My browser pane drew about one frame a second. I verified positions, states and screenshots, never motion or feel. No part of this report can tell you whether the game is pleasant to play.
- **Its paper balance was wrong in ways that mattered.** The Phase 0 numbers hit all three targets on paper and were still broken. One lumberjack could not feed one sawmill, and that was simple arithmetic I did not do.
- **It gave you a number it could not stand behind.** In Phase 3 I reported 9.5 ms to draw the whole island. In Phase 5 the same view took 27 to 80 ms in the same pane. The fix was real, but the first figure should have come with a warning.
- **It broke something and did not notice for a phase.** Phase 3 had a line naming the ground under the pointer. Phase 4 dropped it, which left no way to tell fertile land from grass. It took the Phase 5 review to see that.
- **Its tools tripped it up repeatedly.** Shell commands with long quoted text failed four times. One left a data file invalid for about a minute.
- **It made many decisions for you.** 68 are recorded, and 13 of them in Phase 0 changed the game rules. Each is defensible, and it is still a lot for someone new to games to approve at a glance.
- **It added small things you did not ask for.** Warning marks on buildings, a "losing money" line, a demo town link, and an Upgrade tool. Each is recorded with a way to remove it.
- **One long turn per phase left you few chances to steer.** You saw each phase only when it was finished.

## What is still open

- Whether a first-time player wins in 25 to 40 minutes. My guess is 30 to 40.
- Demolish has no undo or confirmation.
- No shortcut keys for the build menu, and no new-game button.
- Roads drag only as an L shape.
- The late game waits on planks, and nothing tells the player to build a second sawmill.
- A reckless opening still wins, but takes over 50 minutes.
- Mac, trackpads and the two start files have not been tested by me.

## If this moved to a real game engine

- **Keep as they are:** everything in `src/sim/`, the five data files, and the tests. Together they are the game.
- **Rebuild:** the renderer and the UI. The pure math in `src/render/` and the logic in `src/ui/text.js`, `tools.js` and `panelModel.js` can be ported line by line.
- **Keep as a safety net:** the bot. Run it after every change to the rules. It turns "does the game still work?" into a ten-second question.

# Harborfall: Playtest Checklist (Phase 5)

Date: 2026-11-10. Run by Fable 5.2.

This is the full checklist, with what was checked, how, and the result. "How" matters here: almost none of this was a person at a mouse. It was automated tests, a bot, scripts that send clicks to the real page, and a few dozen real clicks and key presses made through a browser tool.

## Summary

| Result | Count |
|---|---|
| Pass | 61 |
| Pass after a fix made in this phase | 6 |
| Not tested | 6 |
| Fail | 0 |

## 1. Starting the game

| # | Check | How | Result |
|---|---|---|---|
| 1 | The page loads with no errors | Browser, console read | Pass |
| 2 | The island, warehouse, top bar and build menu appear | Browser screenshot | Pass |
| 3 | Opening the page as a double-clicked file shows instructions, not a blank page | Could not be run in my browser tool | Not tested |
| 4 | `start-game.bat` starts the server and opens the browser | It would open a window on your desktop | Not tested by me. You have used it since Phase 3. |
| 5 | `start-game.command` on a Mac | No Mac | Not tested |
| 6 | The server refuses `.git`, hidden files and paths outside the folder | 3 requests, each got 403 | Pass |
| 7 | Starting a second server gives a clear message | Ran it twice | Pass |
| 8 | A typo in a data file gives a clear message on screen | Put text where a number belongs and named a good that does not exist | Pass. Both mistakes were listed by name. |

## 2. Building

| # | Check | How | Result |
|---|---|---|---|
| 9 | Each of the 9 buildings can be placed from the menu | UI playthrough, and real clicks for 5 of them | Pass |
| 10 | A building lands exactly where the see-through copy was | UI playthrough at three zoom levels | Pass |
| 11 | The cost is charged exactly | Tests | Pass |
| 12 | Water, forest, the map edge and occupied tiles are refused, each with its own message | Tests, and a real click on forest | Pass |
| 13 | Lumberjack needs forest, fisherman needs coast, farm needs fertile land | Tests | Pass |
| 14 | It is clear where a farm or fisherman can go | Screenshot with the Farm tool picked | Pass after fix 1 |
| 15 | Not enough coins or goods is refused and says what is missing | Tests | Pass |
| 16 | A refused action changes nothing | Tests | Pass |
| 17 | The tool stays picked for placing several | Real clicks | Pass |
| 18 | Right-click, Esc, or the same button again puts the tool away | Real clicks and keys | Pass |
| 19 | Clicks on panels do not reach the map behind them | 39,000 random actions, state checked after each | Pass |

## 3. Roads

| # | Check | How | Result |
|---|---|---|---|
| 20 | One click lays one tile | Real click | Pass |
| 21 | A drag lays an unbroken L-shaped line | Real drags of 2 and 7 tiles, 13 scripted drags | Pass |
| 22 | Existing road is skipped for free | Tests | Pass |
| 23 | A drag that runs out of coins lays what it can and says so | Tests | Pass |
| 24 | A drag over forest or water lays the good tiles and reports the rest | Tests | Pass |
| 25 | A building connects only through a road chain to a warehouse | Tests | Pass |
| 26 | Cutting a road disconnects what is behind it, at once, even while paused | Tests | Pass |

## 4. Production and the full chain

| # | Check | How | Result |
|---|---|---|---|
| 27 | Wood, planks, fish, grain and bread are all produced | Integration test from the real starting stock | Pass |
| 28 | Each producer makes exactly its rate | Tests | Pass |
| 29 | No road, missing input and full storage each stop production and show a mark | Tests, and a real screenshot of the red mark | Pass |
| 30 | Nothing is created or lost in the chain | Tests count every log | Pass |
| 31 | Goods never go negative or above the storage limit | Checked every tick of the integration test | Pass |

## 5. Population, upgrades and winning

| # | Check | How | Result |
|---|---|---|---|
| 32 | Houses fill only with a market in range and fish in stock | Tests, and a real click test | Pass |
| 33 | One fisherman feeds 20 residents | 30 game minutes in a test | Pass |
| 34 | Residents leave during a shortage, stop at 1, and return | Tests | Pass |
| 35 | Upgrade needs a full, fed house and bread in stock | Tests for each condition | Pass |
| 36 | The Upgrade button in the panel works | Real click, and 13 scripted presses per playthrough | Pass |
| 37 | It is clear which houses can be upgraded | Screenshot with green marks | Pass after fix 2 |
| 38 | Upgrading many houses is quick | New Upgrade tool, real clicks | Pass after fix 2 |
| 39 | 99 Workers is not a win and 100 is | Tests | Pass |
| 40 | The win screen appears, pauses the game and states the time | Browser | Pass |
| 41 | Keep playing resumes the game | Real click | Pass |

## 6. Money

| # | Check | How | Result |
|---|---|---|---|
| 42 | Taxes, base income and upkeep match the data to a thousandth of a coin | Tests | Pass |
| 43 | Coins never go below zero | Tests, and every random action | Pass |
| 44 | An hour of income has no rounding drift | Tests | Pass |
| 45 | Negative income is flagged in the top bar | Browser | Pass |
| 46 | Demolish refunds half and the last warehouse is protected | Tests | Pass |

## 7. Speed and time

| # | Check | How | Result |
|---|---|---|---|
| 47 | Pause stops the clock | 0 ticks in 2.5 real seconds | Pass |
| 48 | 1x, 2x and 4x run 10, 20 and 40 ticks a second | Tests on the tick loop | Pass |
| 49 | Space and the 1, 2, 3 keys work | Real key presses | Pass |
| 50 | The game behaves the same at every speed | Same commands give the same state, in tests | Pass |
| 51 | A stalled or hidden tab does not cause a jump on return | Tests on the tick loop | Pass |
| 52 | The game looks smooth at 60 frames a second | My browser pane draws about 1 frame a second | Not tested |

## 8. View and controls

| # | Check | How | Result |
|---|---|---|---|
| 53 | Drag, wheel, keys, + and -, Home all move the view correctly | Real input, positions read back | Pass |
| 54 | The view cannot be lost off the island | Tests, and random actions | Pass |
| 55 | Picking is exact at the nearest and furthest zoom | Full UI playthrough at 0.35x and at 3x | Pass |
| 56 | Pointing at a roof selects that building | Tests, and a real click | Pass |
| 57 | Small buildings are not lost behind tall ones | Screenshot | Pass after fix 4 |
| 58 | The whole-island view draws quickly | Timed old against new on one page | Pass after fix 3 |
| 59 | The top bar and menu fit one row each at 1280 pixels wide | Measured | Pass after fix 5 |
| 60 | The window can be resized | Browser, and random actions | Pass |
| 61 | Trackpad gestures | No trackpad | Not tested |

## 9. Whole games

| # | Check | How | Result |
|---|---|---|---|
| 62 | The bot wins on the shipped island in 25 to 40 minutes | Bot: 28.6 minutes | Pass |
| 63 | The bot wins on 12 different islands | Bot: 25.9 to 28.6 minutes | Pass |
| 64 | A careless build order still wins | Bot: 30.4 minutes | Pass |
| 65 | A reckless build order still wins, with no demolishing | Bot: 52.9 minutes | Pass |
| 66 | A start with zero coins and no goods can still win | Bot: 54.9 minutes | Pass |
| 67 | A full game through the real UI ends exactly like the bot's | UI playthrough, compared character by character | Pass |
| 68 | A person wins by hand | You approved the Phase 4 gate. I did not see it. | Not tested by me |

## 10. Robustness

| # | Check | How | Result |
|---|---|---|---|
| 69 | Random input does not crash the game or corrupt its state | About 39,000 random clicks, drags, scrolls and keys over 8 runs | Pass. One small display slip found and fixed. |
| 70 | The same inputs always give the same game | Tests, and the UI playthrough | Pass |
| 71 | The game state survives being copied through plain text | Tests | Pass |

## 11. Tuning without code

| # | Check | How | Result |
|---|---|---|---|
| 72 | A changed number in a data file takes effect with no code change | Start coins 500 to 900, house cost 10 to 7 | Pass. Both showed in the game. |
| 73 | A new good and a new building can be added in the data files alone | Added "Stone" and a "Quarry" | Pass. The quarry appeared in the menu with a generated description, was placed with a click, and made stone. |

## Problems found, ranked

Ranking is by how much each would hurt a first-time player. The top five were fixed.

| Rank | Problem | Evidence | Status |
|---|---|---|---|
| 1 | You could not tell which ground is fertile or coast. Placing a farm or a fisherman was trial and error. | Phase 4 removed the Phase 3 readout that named the ground under the pointer. | **Fixed.** Picking Farm or Fisherman lights up every tile it can use. The ? panel has a key to the ground colors. |
| 2 | Nothing showed which houses were ready to upgrade, and each upgrade took two clicks. A win needs at least 13. | Counted in the UI playthrough: 13 select-and-press pairs. | **Fixed.** A green ▲ marks ready houses. A new Upgrade tool upgrades with one click per house. |
| 3 | The whole-island view drew slowly. | 27 to 80 ms a frame in my browser pane. My Phase 3 figure of 9.5 ms was too optimistic. | **Fixed.** The ground and trees are painted once and reused: 6.3 ms down to 0.2 ms in a side-by-side timing. |
| 4 | Small buildings vanished behind tall ones. | The two lumberjacks behind the warehouse in the Phase 3 demo town. | **Fixed.** Boxes are about a quarter lower, and buildings turn see-through while you are placing something. |
| 5 | The top bar wrapped to two or three rows and covered the map. | Measured: 70 pixels tall at 1280 wide. | **Fixed.** One row at 1280 wide (44 pixels). The build menu also fits one row. |
| 6 | For one frame after picking a tool, the info panel stayed open with nothing selected. | Random-input test, 2 hits in 6,000 actions. | **Fixed** as well. It was a three-line change. |
| 7 | Demolish has no undo and no confirmation. | Design review. | **Fixed in Phase 6.** A building takes two clicks. There is still no undo. |
| 8 | No shortcut keys for the build menu. | Design review. | **Fixed in Phase 6.** |
| 9 | Roads can only be dragged as an L shape. | Design review. | **Eased in Phase 6.** Shift flips the corner. Still one bend per drag. |
| 10 | A market's panel counts houses served by all markets, not by that one. | Reading the panel. | **Fixed in Phase 6.** |
| 11 | In the last third of a game the bot waits about 8 minutes for planks. A second sawmill fixes it, but nothing tells the player. | Bot report. | **Fixed in Phase 6.** A tip line names the shortage and what to build. |
| 12 | No new-game button. | Design review. | **Fixed in Phase 6.** |
| 13 | Bad openings recover slowly: over 50 minutes to win. | Bot runs. | Open |

## What this playtest cannot tell you

- **Whether it is fun, clear or frustrating.** Scripts do not get confused.
- **How long a person takes to win.**
- **How it looks in motion.** I saw about one frame a second throughout.
- **Anything about a Mac, a trackpad or a touch screen.**

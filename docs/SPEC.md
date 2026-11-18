# Harborfall: Game Spec (Version 1 slice)

Status: approved (Phase 0 gate, 2026-11-10). Updated in Phase 1 where the build filled in a detail, and in Phase 2 with the tuned balance numbers. Each change is listed in `DECISIONS.md`.

This document says what the game does. It is written so you can check the rules without reading code. Every number in it lives in a JSON file in `data/`, and the file is named next to each rule so you know where to tune it.

## 1. The game in one paragraph

You run one island. You build roads, production buildings and houses. Houses fill with Farmers when a market supplies them with fish. Farmer houses can be upgraded to Worker houses, which hold twice as many people and also need bread. Residents pay taxes, buildings cost upkeep. You win when 100 Workers live on the island. You cannot lose.

## 2. Time

- The simulation advances in fixed steps called **ticks**, 10 per second (`config.json` → `ticksPerSecond`).
- Speed 1x, 2x and 4x run 10, 20 and 40 ticks per second of real time. Pause runs none. The game behaves identically at every speed.
- All durations in the data files are in seconds. All rates are per minute.

## 3. The map

File: `data/map.json`.

- One island on a 64 x 64 tile grid, surrounded by water.
- The island is generated from a seed number. The same seed always gives the same island.
- Every tile has one terrain type:

| Terrain | Can build on it? | Used for |
|---|---|---|
| Water | No | Nothing in V1 |
| Coast | Yes | Sandy land tiles that touch water. Fishermen must be next to one. |
| Grass | Yes | General building land |
| Fertile land | Yes | Farms need it. Other buildings may also use it, which wastes it. |
| Forest | No | Lumberjacks need it nearby. Forest never runs out and cannot be cleared. |

- The generator must guarantee enough forest, coast and fertile land to win (`guarantees` in `map.json`). A test checks this.
- The game starts with **one free warehouse already placed** on open grass, with coast, forest and fertile land each within 7 tiles by road. Among the spots that qualify, the generator picks the one with the most open grass around it, so there is room for a town.
- If a seed cannot meet the guarantees, the generator tries the next seed number, up to 50 times, then stops with a clear error. The shipped seed needs no retry.

## 4. Goods and storage

Files: `data/goods.json`, `data/buildings.json`.

- Goods: Wood, Planks, Fish, Grain, Bread. Coins are the currency and are not stored in warehouses.
- There is **one shared island stockpile**. Nothing is carried around on screen.
- The stockpile holds up to 100 of each good per warehouse. Two warehouses means 200 of each.
- Goods are always whole numbers.
- Starting stock: 500 coins, 40 wood, 20 planks.

## 5. Roads and connection

- Roads cost 1 coin per tile. They connect along tile edges, not diagonally.
- A building is **connected** when a road tile touches one of its edges, and that road leads, tile by tile, to a road tile touching a warehouse.
- Producers and markets do nothing unless connected. Houses do not need roads.
- Road length does not matter. Only the connection matters.
- All warehouses share the one stockpile, even if their road networks are separate.

## 6. Buildings

File: `data/buildings.json`. These are the values after Phase 2 tuning. No cost from the brief was changed.

| Building | Size | Cost | Upkeep /min | Placement rule | What it does |
|---|---|---|---|---|---|
| Road | 1x1 | 1 coin | 0 | Buildable land | Connects buildings |
| Warehouse | 2x2 | 50 coins, 20 wood | 3 | Buildable land | +100 storage per good. Anchor for roads. |
| Lumberjack | 1x1 | 20 coins | 2 | 8 or more forest tiles within radius 4 | 1 wood every 5 s (12 /min) |
| Sawmill | 2x2 | 40 coins, 5 wood | 3 | Buildable land | 2 wood into 1 plank every 16 s (3.75 planks /min) |
| Fisherman | 1x1 | 30 coins, 10 wood | 3 | Shares an edge with a coast tile | 1 fish every 15 s (4 /min) |
| Farm | 2x2 | 50 coins, 10 wood, 5 planks | 4 | All 4 tiles on fertile land | 1 grain every 30 s (2 /min) |
| Bakery | 2x2 | 80 coins, 10 planks | 6 | Buildable land | 1 grain into 1 bread every 15 s (4 /min) |
| House | 2x2 | 10 coins, 5 wood | 0 | Buildable land | Holds 4 Farmers. Can be upgraded. |
| Market | 2x2 | 60 coins, 10 planks | 5 | Buildable land | Supplies houses within radius 8 |

General placement rules:
- Every tile under a building must be buildable land with nothing on it.
- You must be able to afford the full cost. If you cannot, nothing is placed.
- Radius is measured as straight-line distance from the centre of the building to the centre of a tile.
- There is no rotation in V1.

### How a producer works

Each producer repeats a cycle:
1. If it is not connected, it waits. Status: **No road**.
2. It takes its inputs from the stockpile. If they are not there, it waits. Status: **Missing input**.
3. It works for its cycle time. Status: **Working**.
4. It puts its output in the stockpile. If the stockpile is full for that good, it waits with the finished goods. Status: **Storage full**.

### Demolish

- Any building or road can be demolished.
- You get back 50% of its cost in coins and goods, rounded down (`config.json` → `demolishRefundRatio`). A road returns nothing.
- Residents of a demolished house are removed.
- The last remaining warehouse cannot be demolished.
- The free starting warehouse cost nothing, so it returns nothing.
- Demolishing a warehouse lowers the storage limit. Goods already above the new limit are kept, but nothing more of that good is produced until stock drops below the limit.
- Refunded goods that do not fit in storage are lost.

## 7. Population

File: `data/population.json`.

| Tier | House capacity | Needs (per resident per minute) | Tax (per resident per minute) |
|---|---|---|---|
| Farmer | 4 | 0.2 fish | 0.8 coins |
| Worker | 8 | 0.2 fish, 0.075 bread | 0.85 coins |

### Supply

- A house is **served** when at least one of its tiles is within radius 8 of a connected market.
- A served house buys goods from the stockpile one whole unit at a time. A full Farmer house eats one fish every 75 seconds. A full Worker house eats one fish every 37.5 seconds and one bread every 100 seconds.
- A brand-new house buys its first unit of each need right away. That first purchase is what lets people move in.
- A need is **met** if the house's most recent purchase of that good succeeded. If the stockpile is empty when the house tries to buy, the need is **unmet** and the house retries until it succeeds.
- A house that is not served has all needs unmet.
- When stock runs short, older houses buy first. Newer houses go hungry first.

### Residents moving in and out

- All needs met: the house gains 1 resident every 6 seconds, up to its capacity.
- Any need unmet: the house loses 1 resident every 12 seconds, down to a floor of 1.
- Houses never downgrade to a lower tier.

### Upgrading a house

You upgrade a Farmer house by clicking it and paying 5 planks and 20 coins. The upgrade is allowed only when all of these are true:
- The house is full (4 of 4 Farmers).
- It is served by a market.
- Its fish need is met.
- There is at least 1 bread in the stockpile.

If an upgrade is refused, the game says which of these failed.

After the upgrade the house holds 8 Workers. The 4 existing residents stay and 4 more move in over time while fish and bread are both met.

## 8. Money

File: `data/config.json` → `economy`.

- Every 6 seconds the game settles income: **taxes + base income - upkeep**.
- **Taxes** come from every resident, at the rate for their tier.
- **Base income** is 20 coins per minute, always. It exists so a player with no residents can still recover. Phase 2 raised it from 10, because at 10 a reckless opening left the town stuck for good.
- **Upkeep** is charged for every building that exists, whether or not it is working.
- Coins never go below zero. If upkeep would take you below zero, you stay at zero and buildings keep running.
- With too few coins you cannot build, upgrade or place roads until income recovers. Nothing else stops.

### Why a player cannot get permanently stuck

- Base income is always positive.
- Demolishing is free, returns half the cost, and removes the upkeep.
- A lumberjack costs coins only, so wood is always reachable. A sawmill needs only coins and wood, so planks are always reachable.
- The last warehouse cannot be demolished, so there is always storage and a road anchor.
- The map guarantees forest, coast and fertile land near the start.

The worst case is slow recovery, not a dead end. Phase 2 tested this with the bot. See section 10.

## 9. Winning

- You win when 100 residents live in Worker houses or better (`config.json` → `win`). Farmers do not count. Artisans do, so upgrading a Worker house never moves the win away.
- That takes at least 13 full Worker houses (13 x 8 = 104).
- After the win screen you can keep playing, and there is one more goal: 100 Artisans. See section 13.

## 10. Balance, as measured by the bot

Phase 2 replaced the paper estimates with measurements. A bot played about 500 full games while the numbers were tuned. Run it yourself with `node tools/bot.mjs`.

### Targets and results

| Target from the brief | Result | Evidence |
|---|---|---|
| One fisherman feeds about 20 residents | Exactly 20 | A fisherman makes 4 fish a minute and a resident eats 0.2. In play, 20 Farmers stayed fed for 30 minutes. |
| A healthy 100-resident city earns about +40 a minute | +42.2 | Measured at the moment the bot won, with 100 Workers and 4 Farmers. |
| A full win takes 25 to 40 minutes at 1x | 28.9 minutes since materials travel (Phase 20); 29.3 in Phase 19; 28.6 before carts | Standard build order on the shipped island. On 12 different islands, before carts: 25.9 to 28.6. |
| A new player should not get stuck | No dead end found | Three bad openings all still win. See below. |

### The winning town

14 houses, 6 fishermen, 4 farms, 2 bakeries, 2 lumberjacks, 1 sawmill, 2 markets, 1 warehouse and 56 road tiles.

### Income over a standard game

| Minute | Coins | Net income /min | Farmers | Workers |
|---|---|---|---|---|
| 0 | 500 | +17 | 0 | 0 |
| 4 | 134 | +33 | 53 | 0 |
| 8 | 11 | +19 | 56 | 0 |
| 12 | 36 | +33 | 40 | 32 |
| 16 | 48 | +33 | 32 | 48 |
| 20 | 25 | +23 | 32 | 48 |
| 24 | 31 | +31 | 20 | 72 |
| 28 | 116 | +42 | 8 | 96 |

Income dips twice, at minutes 8 and 20, when a bread chain is built and its upkeep arrives before the Workers it will feed. The lowest point after minute 5 is +18.8. The town is never at zero coins and never loses money.

### Bad openings

| Opening | What goes wrong | Result |
|---|---|---|
| Careless: one lumberjack, fishermen added late | Wood is short for most of the game | Wins at 30.4 minutes |
| Bread first: the whole bread chain before any house | Heavy upkeep and no taxes. Income drops to -7 a minute for a while. | Wins at 52.9 minutes, with no demolishing |
| From nothing: zero coins and an empty stockpile | Only base income to start with | Wins at 54.9 minutes. Income never drops below +4. |

Before tuning, the bread-first opening left the bot at zero coins and -10 a minute for good, on all 12 islands tested.

### What tuning changed

| Number | Before | After | Why |
|---|---|---|---|
| Lumberjack cycle | 8 s | 5 s | One lumberjack could not supply one sawmill. Wood sat at zero. |
| Sawmill cycle | 12 s | 16 s | Same problem from the other side. It also sets a steady pace for the late game. |
| Base income | 10 /min | 20 /min | Removes the dead end and thickens the thin mid-game. |
| Worker tax | 1.0 | 0.85 | Keeps the winning city near +40 after base income went up. |
| Farm upkeep | 5 | 4 | Makes the dip when a bread chain is built shallower. |
| Bakery upkeep | 8 | 6 | Same. |

### A person's pace

The bot above acts the instant it can afford something. To estimate a person, Phase 6 added delays: a few seconds of thought after each action, time for each road tile, and the odd long pause. The delays are guesses, held in `tools/bot/paces.json`. Each row is 20 games.

| Build order | Pace | Thinking time added | Fastest | Median | Slowest |
|---|---|---|---|---|---|
| Standard | Instant | 0 min | 28.6 | 28.6 | 28.6 |
| Standard | Brisk | 3.4 min | 29.1 | 29.1 | 29.6 |
| Standard | Typical | 7.7 min | 29.5 | 30.2 | 31.3 |
| Standard | Slow | 17.8 min | 30.9 | 32.5 | 34.8 |
| Careless | Typical | 7.6 min | 30.6 | 30.8 | 31.2 |
| Careless | Slow | 17.5 min | 30.6 | 31.2 | 32.0 |

All 120 paced games finished inside the 25 to 40 minute target. A slow player with nearly 18 minutes of added thinking finishes only about 4 minutes later, because the game is paced by coins and planks, and most thinking happens while waiting for those anyway. What this does not model is a player who does not know what to build next.

### What the bot does not prove

- The bot is not a person. It acts the instant it can afford something and never misplaces a building. A person will be slower. My estimate for a first-time player is 30 to 40 minutes, and that is still a guess until you play in Phase 4.
- In the last third of the game the bot waits about 8 minutes in total for planks. A player who builds a second sawmill will finish sooner.
- On islands where one market is enough, the winning city earns +47 rather than +42.

## 11. Screen and controls

**Starting and saving**
- The game opens on a title screen, with the island behind it. It offers Continue (if there is a saved game), New game on the standard island, and New game on a random island. A link shows a finished town built by the bot.
- Continue shows the time played, the Workers so far and the coins. It puts you back where you were, looking at the same spot.
- Below the usual buttons the title screen offers four scenarios, each with its own goal and medal times. See sections 18 and 27.
- A new game can be Easy, Normal or Hard, picked on the title screen. Normal is what it starts on. See section 14.
- The game saves itself. It saves about every 10 seconds, whenever the page is hidden or closed, and when you go back to the title screen. There is no save button and nothing to remember.
- There is one saved game, kept in the browser you played in. It is not shared with other browsers or computers, and clearing the browser's stored data removes it.
- Starting a new game replaces the saved one, so the button must be pressed twice.
- A saved game cannot be continued if a rule in the data files has changed since it was saved. The title screen says so. (Things added to the game in later phases do not count: see sections 13 and 16.) Changing the rule back brings the game back. Changes to names, colors, shortcut keys and notes do not matter.
- A random island is one of a million. The ? panel shows the island's number. The balance was tuned on the standard island.
- The ? panel has a "Save and go to the title screen" button.

**View**
- Isometric view in a warm storybook style. All of the art is drawn by the game's own code. There are no image files.
- Each building has its own look: a long timber warehouse with crates outside, a log cabin with a log pile for the lumberjack, an open-sided sawmill with a stack of planks, a fishing hut with a boat and a net rack, a farm with a barn and crop rows, a brick bakery with a tall chimney, a thatched cottage for Farmers, a taller timber-framed townhouse with a tiled roof for Workers, and a paved market square with three striped stalls.
- The town is lived in. People walk the roads, more of them as the town grows, in straw hats for Farmers and dark caps for Workers. A cart sets out for the warehouse when a producer finishes a batch, loaded in the color of what it made. Every fisherman has a boat that rows out, fishes and rows home in step with his work. All of this is decoration: goods still arrive the instant they are made, and nothing in the game depends on a walker, a cart or a boat. They stop when the game is paused.
- Some looks follow the game: a farm's crop grows through each cycle, a bakery smokes while it bakes, a sawmill throws sawdust while it saws, and a house's windows are lit once someone lives in it.
- The ground has a raised shoreline with shallows around it, grass in several shades, ploughed fertile land, sand, and trees. Roads join up with each other and with the buildings beside them. The water has drifting glints.
- Houses show their number of residents on a small plate above the roof.
- The panels are navy with a brass edge. The build menu shows a small picture of each building, and the top bar shows an icon for each good.
- A red ! above a building means it has no road or no market. An amber ! means it is waiting for something. A green ▲ means a house is ready to upgrade.
- While you are placing a building or a road, existing buildings are drawn see-through, so nothing hides behind them.

**Moving the view**
- Drag with the left, middle or right mouse button. With the Road tool picked, a left drag lays road instead.
- W A S D or arrow keys.
- Mouse wheel zooms on the cursor. + and - zoom on the centre. Zoom runs from 0.35x, which shows the whole island, to 3x.
- Home or C returns to the start site. The view cannot be dragged away from the island.

**Building**
- Pick a building in the menu along the bottom. A strip above the menu says what it does and what it costs.
- Move the pointer over the map. A see-through copy of the building follows it, centred on the pointer, outlined in green where it can go and red where it cannot. A note at the pointer gives the reason.
- Markets and lumberjacks show the area they reach.
- Picking Farm or Fisherman lights up every tile of the ground it needs. The ? panel has a key to the ground colors.
- Click to place. The tool stays picked, so you can place several.
- Road: click for one tile, or drag to lay a road along the way you drag (since Phase 35; see section 36). Hold Shift while dragging for a straight line with one bend. The note shows the tile count and cost.
- Upgrade: pick it, then click any house marked with a green ▲. One click per house.
- Demolish: pick it, then click a road once or a building twice. The second click must come within 4 seconds. The note shows what you get back.
- Undo: press Z, Ctrl+Z or the Undo button to take back your last build, road, upgrade or demolish. Everything it cost comes back, and a demolished building returns exactly as it was, residents and all. Since Phase 36 it goes back up to 10 actions, newest first, and what was undone can be redone (section 37). Each action can be undone for 30 seconds of game time after it (`undoSeconds` in `config.json`). The time does not run out while the game is paused. The button shows what it would take back.
- Every tool has a shortcut key, shown in the corner of its button. Building keys are set in `buildings.json`.
- Right-click, Esc, or the same menu button again puts the tool away.

**Selecting**
- With no tool picked, click a building to open its panel on the right: status, what it makes, and for a house its residents, needs and taxes.
- The panel has an Upgrade button for Farmer houses and a Demolish button, which must be pressed twice. A button that cannot be used says why.
- A market's panel shows how many houses are in its own range.

**Top bar**
- Coins and net income per minute. Income turns red when negative, with a line saying what to do.
- Each good with its storage limit. On windows narrower than 1640 pixels a good shows as its icon and number, with the name on hover. Under 1460 pixels the limit is left out too, and a good at its limit turns amber.
- After the win, the goal bar shows the next goal by name, for example "100 Artisans".
- Farmers and Workers, each with housing capacity, and a bar toward the goal of 100 Workers.
- Game time, Pause, 1x, 2x, 4x, and a ? button for the controls. The ? panel also shows when the game was last saved and has the button back to the title screen.
- A tip line appears when something has been short for 30 game seconds, for example "Fish keeps running out. Build another fisherman." It names the root of the shortage: if bread is out because the bakery has no grain, it talks about grain.

**The first-game guide**
- A small panel at the top left shows the step you are on, why it matters, and how far along you are: "First steps, 2 of 10".
- The ten steps go from the first lumberjack to the win. They are in `data/guide.json`, and each has a test the game checks, such as "one sawmill joined by road".
- A step is ticked the moment its test is true, and stays ticked. Doing a later step early ticks it, but the guide still asks for the earlier one.
- "All steps" opens the whole list. The × hides the guide, and the ? panel brings it back. The choice is remembered.
- The guide only reads the game. It changes nothing, is not saved with the game, and is not shown on the demo town.
- A game picked up part-way starts just past the furthest step that is true.

**Sound**
- The game makes its own sounds. There are no sound files.
- Seven short sounds: a tick when you pick a tool, a thud when a building goes up, a scrape when road is laid, a tumble when something is demolished, two rising notes for an upgrade, two low falling notes when the game says no, and a short fanfare for the win.
- A quiet sea plays in the background.
- A speaker button in the top bar turns sound off and on. The ? panel has a volume slider. Both are remembered in the browser.
- Sound starts with your first click or key press, because browsers allow none before that. A hidden tab is silent.

**Keys**
- Space pauses and resumes. 1, 2 and 3 set speed 1x, 2x and 4x.

**Winning**
- At 100 Workers the game pauses and shows the time taken. Keep playing closes it and resumes at 1x.

## 12. Not in Version 1

More than one saved game, save files to download or share, undoing more than your last action, music, more islands, ships and trade, combat, carriers that really carry goods (the carts are for show), workforce requirements for buildings, building rotation, a tutorial, touch controls, and painted art from image files.

## 13. After the win: wool, cloth and Artisans

Added in Phase 12. Nothing in sections 1 to 10 changed: the game up to the win plays exactly as before.

**Two new goods:** Wool and Cloth.

**Two new buildings** (`buildings.json`)

| Building | Cost | Upkeep a minute | What it does | Needs |
|---|---|---|---|---|
| Sheep farm | 60 coins, 10 wood, 5 planks | 4 | Makes 1 wool every 20 seconds | Pasture: 16 or more grass tiles within 3 tiles |
| Weaver | 90 coins, 15 planks | 6 | Turns 2 wool into 1 cloth every 20 seconds | Nothing special |

One weaver keeps two sheep farms busy and clothes about 60 Artisans.

**A third kind of resident** (`population.json`)

| | Farmer | Worker | Artisan |
|---|---|---|---|
| A house holds | 4 | 8 | 12 |
| Tax per resident a minute | 0.8 | 0.85 | 1.2 |
| Needs | fish | fish, bread | fish, bread, cloth |
| Upgrade to the next | 20 coins, 5 planks | 30 coins, 8 planks | none |

- A full, fed Worker house can be upgraded to an Artisan house, once there is cloth in storage. The Workers stay and four more people move in.
- Each Artisan uses 0.05 cloth a minute.
- Without cloth, Artisans leave one by one, as any resident does when a need is unmet. A house never moves back down.

**The goal after the win** (`config.json` → `milestones`)
- 100 Artisans. That takes at least 9 full Artisan houses (9 x 12 = 108).
- It is reached like the win, recorded once, and never taken back.
- A screen marks it, as the win screen marks the win. After it there are no more goals.

**How long it takes.** The bot wins at 28.6 minutes and reaches 100 Artisans at 49.8, which is 21 minutes later. On two other islands it took 20 minutes. It builds a second sawmill first, because the second act needs about 140 planks.

**Saved games.** A game saved before Phase 12 can still be continued. It has no wool or cloth and has not reached the new goal, and the new buildings are there to build.

## 14. Difficulty, and two changes to the look

Added in Phase 13. On Normal the game is exactly as it was.

**Difficulty** (`config.json` → `difficulties`)

| | Easy | Normal | Hard |
|---|---|---|---|
| Starting coins | 800 | 500 | 350 |
| Income with no residents, a minute | 30 | 20 | 20 |
| Tax | 15% more | as balanced | 10% less |

- It is chosen on the title screen for a new game and cannot be changed during one. Continue and the ? panel say which a game is on when it is not Normal.
- A difficulty can change three things: starting coins, the income the island earns with no residents, and every resident's tax. Nothing else. Costs, speeds and needs are the same on all three.
- **Hard keeps the 20 a minute with no residents.** That income is what stops a new town from sinking, and lowering it made one bad opening impossible to recover from.

What the bot found, in minutes to the win:

| Build order | Easy | Normal | Hard |
|---|---|---|---|
| Standard | 28.6 | 28.6 | 36.9 |
| Careless | 30.4 | 30.4 | 30.8 |
| Reckless (bread first) | 33.4 | 52.9 | does not recover by itself |
| Standard, then on to 100 Artisans | 48.8 | 49.8 | 69.6 |

- **Easy does not make a good player faster.** With a sensible order, planks and people set the pace, not coins. What Easy does is forgive a bad start: the reckless opening wins in 33 minutes, not 53.
- **Hard punishes a bad start.** The reckless opening builds farms and a bakery before any house, runs out of coins, and then loses 7 coins a minute with nothing coming in. It does not recover unless something is demolished. The game says "You are losing money. Build houses, or demolish something", and a test shows that demolishing the farms and bakery and then building a market and houses leads to a win.

**Houses come in four looks** (three until Phase 29; see section 30). Each cottage, townhouse and Artisan house has a roof of the usual red, dark brown, warm terracotta or weathered grey, walls to match, a chimney on one side or the other, and for some a flower bed, firewood, flower boxes, green shutters or a banner. Which look a house has follows from when it was built, so it is the same every time the game is opened. It changes nothing about the house.

**The ground is sharp when zoomed in.** Zoomed past about 1.4 times the ground picture's own size, the ground on screen is redrawn at exactly the size shown, a fifth of a second after the view stops moving. While the view moves, the stretched picture is used as before.

## 15. Dust, chimney smoke, and day and night

Added in Phase 14. All three are looks only. No rule changed, and nothing in the game depends on them.

- **Dust.** A new building lands with a puff of dust and a quick settle to full size. A demolished building, or one taken back with Undo, leaves a larger puff where it stood. Roads raise none. It lasts under a second and plays even while the game is paused.
- **Chimney smoke.** Any house with people in it gives off a thin wisp of smoke, each house a little out of step with the next. An empty house gives none. Below zoom 0.5 the smoke is not drawn.
- **Day and night.** A day lasts 8 game minutes: about 5 of daylight, then dusk, a night of about a minute and a half, and dawn. A new game starts at sunrise.
  - At night the picture turns dim and blue, and every lived-in house shows a warm light.
  - The numbers over houses, the warning marks, the outlines and the building you are placing stay at full brightness, so the game reads the same at night.
  - It follows game time, so it stops when the game is paused and runs faster at 4x.
  - The ? panel has a "Day and night" box to switch it off. The choice is remembered.

## 16. Staff

Added in Phase 15. This is the first rule that makes residents matter for more than taxes.

**The rule**
- Every building that makes something needs staff to run it. The number is set per building in `data/buildings.json` (`staff`).
- The town's staff are its people. It has 12 to begin with, and every 2 residents add 1 more, whatever kind of resident they are. Both numbers are in `data/config.json` (`workforce`).
- If the town has as many staff as its buildings need, nothing changes: everything works at full speed.
- If it has fewer, **every producing building works slower, by the same share.** A town with 30 staff where 40 are needed makes everything at 75% speed.
- Nothing ever stands idle because of staff, and nothing stops. So a town that is short can always get out of it.

| Building | Staff |
|---|---|
| Lumberjack | 2 |
| Sawmill | 3 |
| Fisherman | 3 |
| Farm | 4 |
| Sheep farm | 4 |
| Bakery | 5 |
| Weaver | 5 |
| House, market, warehouse, road | 0 |

**What counts**
- Only a producer that is linked to a warehouse by road needs staff. One with no road needs none: it is not working.
- A producer that is waiting, for grain or for room in the stockpile, still holds its staff.
- Demolishing a producer frees its staff at once.
- Half a person does not count: 7 residents add 3 staff.
- Only making things is slowed. Houses eat at their usual pace, upkeep is paid in full, and taxes are unchanged.

**The way out of a shortage** is more residents: build houses, or upgrade them so they hold more. Since Phase 16 you can also close a building for now (section 17). Demolishing one you do not need works too.

**What you see**
- The top bar shows a staff count beside the residents: "13 spare", or "10 short" in amber. Hover over it for the full sum and the speed your buildings are working at.
- After 30 game seconds short of staff, the tip line says: "Your buildings are short of staff and work at 88% speed. Build more houses, or close a building you can spare." This comes before any tip about a good running out, because a good running out may only be a sign of it, and another workshop would make it worse.
- The build menu says how many staff each producer needs. A producer's panel says the same, and when the town is short it adds the speed.
- The ? panel explains the rule in two sentences.
- Tips are now also shown after the win, for as long as a goal is still ahead. Before this phase they stopped at the win, so the tips about wool and cloth from Phase 12 could never be seen.

**How it plays, measured by the bot** (Normal; Easy and Hard give the same staff figures)

| Town | With no staff rule | With it | Short of staff |
|---|---|---|---|
| Standard build order | wins at 28.6 min | 28.6 min | never. 51 needed, 64 in town at the win. |
| Careless order | 30.4 min | 30.4 min | never. 49 needed, 64 in town. |
| Bread first (workshops before houses) | 52.9 min | 58.7 min | 7.8 minutes, down to 46% speed |
| Second act, to 100 Artisans | goal at 49.8 min | 50.5 min | about 14 minutes after the win, down to 78% speed |

- A sensible first game never meets the rule. A town that builds workshops before houses is held back by it.
- In the second act the rule is felt: the bot's town ends needing 102 staff with 84. The bot does not react, and still reaches the goal. A person would build houses.

**Saved games.** A game saved before this phase can still be continued. It is played under the staff rule from then on. A large town from before may find itself short of staff the moment it loads: it is told so, and it keeps working.

**Not in this phase:** staff are not people you can see walking to work, the kinds of resident do not differ as staff, and no difficulty changes the staff numbers. (Closing a building to free its staff came in Phase 16: section 17.)

## 17. Closing a building for now

Added in Phase 16. It is the second way out of a staff shortage, and a way to stop a workshop using up goods you want to keep.

**The rule**
- Any building that makes something can be closed. Select it and press **Close for now**. Press **Reopen** to put it back to work.
- A closed building makes nothing, takes nothing from the stockpile, and needs no staff. Its staff go to the other buildings at once.
- It still costs its full upkeep. Closing is a way to cope, not a way to save coins. Demolishing is still the way to stop paying.
- Work in hand waits inside. A bakery closed halfway through a loaf finishes that loaf when it reopens. The grain already taken for it is not handed back.
- Closing and reopening are free and happen at once.
- Houses, markets, warehouses and roads cannot be closed.
- A building can be closed before it has a road. It stays closed when the road arrives.

**Undo.** A close or a reopen can be taken back with Undo for 30 game seconds, like any other action.

**What you see**
- A closed building carries a small grey mark with two bars, like a pause sign. It is not a warning: the building is as you want it.
- Its panel says "Closed. It makes nothing." and "Staff: None while closed (5 when open)".
- The staff count in the top bar changes at once. Its hover text says how many buildings are closed.
- When the town is short of staff the tip now ends "Build more houses, or close a building you can spare."
- If a good runs out and every building that makes it is closed, the tip says "Your fisherman is closed. Reopen it." and not "Build another fisherman."

**Saved games.** No number in the data files changed, so every game saved in Phase 15 loads exactly as it was. A closed building is saved as closed.

**Not in this phase:** closing several buildings at once, a shortcut key, lower upkeep while closed, and a bot that closes buildings.

## 18. Scenarios

Added in Phase 17. A scenario is a new game with its own island, its own start and its own goal. The standard game is exactly as it was, and its saved games are untouched.

**The three scenarios**

| Scenario | Island | Start | Goal | Gold | Silver | The bot |
|---|---|---|---|---|---|---|
| Fishing village | The standard one | As the standard game | 120 Farmers | within 13 min | within 20 | 10.5 min |
| The weavers' guild | 42 | 1000 coins, 60 wood, 60 planks | 60 Artisans | within 24 min | within 32 | 20.0 min |
| Short-handed | 2024 | As the standard game, but 16 staff to begin with and only 1 resident in 4 works | 100 Workers | within 35 min | within 45 | 29.6 min |

- **Fishing village** is the gentle one. It needs no upgrades and no bread: houses, fish, markets, and wood enough for thirty houses.
- **The weavers' guild** goes straight for Artisans. Six houses taken all the way up are enough, but a town of only those cannot staff its own workshops: it needs plain Farmer houses beside them. The bot's first attempt, with no extra houses, stalled at 49 Artisans. Four more houses set it going again.
- **Short-handed** is the standard game with the staff rule turned up. The bot is short of staff for 18 of its 30 minutes, down to 70% speed. If you wondered what the game is like when staff matter before the win, this is it.

**Medals**
- A scenario cannot be lost. It has a clock and two times.
- Finish within the gold time for gold, within the silver time for silver. Any later finish is bronze.
- The win screen says which medal you earned. Hovering over the clock in the top bar shows the two times while you play, and the ? panel shows them too.
- The title screen remembers your best time in each scenario, in the browser you played in.
- The times were set from the bot: gold is about a fifth longer than the bot takes when it never hesitates. A bot with a person's typical pauses still earns gold in all three, and one with slow hands earns silver.

**How a scenario differs from a normal new game**
- It is not played on a difficulty, and its island is fixed.
- There is no goal after the win.
- The first-game guide is not shown: its steps were written for the standard game.
- It uses the same single save slot. Starting a scenario replaces your saved game, so the button must be pressed twice, like New game.
- The Continue button names the scenario: "Fishing village, 5:03 played, 52 of 120 Farmers, 140 coins".

**Making your own.** A scenario is an entry under `scenarios` in `data/config.json`. It may set the island (`seed`), `startCoins`, `startGoods`, `baseIncomePerMinute`, the goal (`win`), goals after the win (`milestones`), the staff numbers (`workforce`) and the medal times (`medals`, in game minutes). Anything left out stays as in the standard game. A name, a description or a medal time can be changed without affecting a saved game of that scenario. Changing anything else makes saved games of that scenario, and only that scenario, refuse to load.

**Not in this phase:** losing, a scenario on a random island or a chosen difficulty, a best time for the standard game, more than one saved game, and scenarios with rules of their own beyond the settings listed.

## 19. The harbour and the trade ship

Added in Phase 18. A way to sell what the island has too much of and to buy what it lacks, at a price.

**The harbour**
- A new building, key **T**. 120 coins, 20 wood and 10 planks. Upkeep 5 coins a minute. 2 by 2.
- It must touch a coast tile, like a fisherman, and needs a road to a warehouse.
- It needs no staff.

**The ship**
- While the island has a harbour linked to a warehouse, a trade ship calls every 2 game minutes.
- On each call it carries at most 30 goods for each such harbour, sold and bought together.
- It sells first, then buys with whatever coins there are by then, including the coins from the sales.
- Goods are taken in the order the top bar lists them: wood, planks, fish, grain, bread, wool, cloth.
- A harbour cut off by road brings no ship. The two-minute wait starts again when it is joined.
- You can see it: it sails in over the last 20 seconds before it calls, ties up at the harbour with its sails furled, and sails away.
- When it has traded, a green line under the map says what it did: "The trade ship sold 30 wood for 12 coins."

**Standing orders.** Select the harbour. Its panel lists every good with its prices and an order:
- **Off**: the ship leaves it alone.
- **Sell above 60**: it sells everything above 60 in stock.
- **Buy up to 20**: it buys until there are 20 in stock, as far as the coins and the storage room allow. The coins never go below zero.
- Click the order to go round Off, Sell, Buy. The − and + buttons move the level by 10.
- Orders belong to the island, not to one harbour. They stay if the harbour is demolished, and work again with a new one.
- An order change can be taken back with Undo.

**Prices**, in coins for one. Buying always costs more than selling earns, three to five times as much.

| Good | The ship pays | The ship charges |
|---|---|---|
| Wood | 0.4 | 2 |
| Planks | 2 | 6 |
| Fish | 1.2 | 4 |
| Grain | 2 | 6 |
| Bread | 4 | 12 |
| Wool | 1.5 | 5 |
| Cloth | 6 | 18 |

**What it is for, measured by the bot**
- It is a help, not a way to get rich. No building, selling all it makes, earns more than the residents who staff it would pay in taxes. A test checks this for every building.
- The standard build order with a harbour after the first sawmill, selling wood and fish above 60, wins in 31.0 minutes. Without it: 28.6. The harbour costs more than it earns before the win.
- A town that buys its bread instead of baking it wins later, or not at all on the bot's fixed build order.
- Where it helps: wood that would otherwise be thrown away when the store is full, a good you are short of right now, and spare goods in a large town after the win.

**Saved games.** A game saved before this phase still loads, with no orders and no ship on its way, and plays on exactly as before until you build a harbour.

**Not in this phase:** prices that change with supply, more than one ship, buying goods the island cannot make, ships you send yourself, and a second island.

## 20. Carts: goods travel by road

Added in Phase 19. Until now, what a building made appeared in the stockpile the moment it was made. Now it has to be fetched.

**The rule**
- When a building makes something, it goes into the building's own **yard**, which holds 6.
- Every warehouse keeps **3 carts**. A cart drives along the roads to a building with goods waiting, loads up to 4, drives back, and unloads into the stockpile. Only then can anything use them.
- Carts drive 2 road tiles a second at 1x. A building 6 tiles from its warehouse by road gets its goods to the stockpile 6 seconds after they are made.
- Each building is served by its **nearest warehouse by road**. A warehouse's carts serve only the buildings it is nearest to.
- Carts go **30 road tiles at most**. A building farther than that from every warehouse is never collected. It is marked with a red !, and its panel and the tip line say so.
- When a yard is full, the building stops and waits for a cart.
- Idle carts set out for the building with the most goods waiting; if two have the same, the nearer one.
- A cart never goes out for goods the stockpile has no room for. Such goods wait in the yard, and the building says "Storage is full", as before. If the store fills while a cart is on the road anyway (the trade ship bought some, say), the cart unloads what fits and the rest is lost. A cart is never stuck.

**What does not travel**
- Materials a workshop uses still came straight from the stockpile in this phase. Since Phase 20 they travel too: section 21.
- Houses still buy from markets as before. The trade ship still buys and sells from the stockpile.

**Where you build now matters**

| Three lumberjacks, two minutes | Wood that reached the stockpile |
|---|---|
| 4 to 6 road tiles from the warehouse | 72 of 72 |
| 27 to 29 road tiles away | 56 of 72 |
| 27 to 29 road tiles away, with a warehouse built beside them | 72 of 72 |

A second warehouse helps twice: three more carts, and shorter trips for the buildings nearest to it.

**What you see**
- The carts on the map are now the real ones. Each cart you see is on its way to fetch goods, or bringing them back, loaded in the colour of the good. An empty cart on its way out carries nothing. Before this phase the carts were only for show.
- A building's panel says what waits in its yard, "3 wood (room for 6)", and how far its warehouse is: "7 road tiles · 3.5 s by cart".
- A warehouse's panel says how many carts it has and how many are out, and how far they reach.
- A building waiting for a cart has an amber !. One beyond reach has a red !.
- After 30 game seconds, the tip line says "Your carts cannot keep up. Build another warehouse near your workshops.", or names a building no cart can reach.

**How it plays, measured by the bot.** A sensible, compact town barely notices; the bot builds close to its warehouse.

| Build order | Without carts | With carts | Producer-minutes waiting for a cart |
|---|---|---|---|
| Standard | 28.6 | 29.3 | 3.2 |
| Careless | 30.4 | 30.6 | 0 |
| Bread first | 58.7 | 58.7 | 14.9 |
| Merchant | 31.0 | 31.2 | 0 |
| Second act, to 100 Artisans | 50.5 | 51.7 | 3.5 |
| Standard, Hard | 36.9 | 37.0 | 4.8 |
| Fishing village | 10.5 | 10.7 (gold) | 0 |
| The weavers' guild | 20.0 | 20.7 (gold) | 2.7 |
| Short-handed | 29.6 | 29.8 (gold) | 3.7 |

Times quoted in earlier sections of this spec were measured before carts.

**Saved games.** A game saved before this phase still loads: every warehouse gets its carts at home and every yard starts empty, and from then on it plays under the cart rule.

**Not in this phase:** materials carried to workshops, carts that can be told where to go, more carts for a warehouse, roads of different speeds, and a way to see the 30-tile reach on the map.

## 21. Materials travel too

Added in Phase 20. This finishes "goods carried along roads".

**The rule**
- A **workshop** is a building that turns one good into another: the sawmill (wood), the bakery (grain) and the weaver (wool).
- Each workshop keeps its own **store of materials**, with room for 6 of each. It works only from that store, never straight from the stockpile.
- A cart going to a workshop **takes materials with it** from the stockpile, enough to fill the store (up to the 4 a cart carries), and **comes back with what the workshop made**. One trip does both jobs.
- **A workshop that has run out is served first**, before any other building, as long as the stockpile has the materials.
- The materials leave the stockpile when the cart sets out. If the workshop is demolished on the way, the cart turns back and returns them.
- A closed workshop is sent nothing.
- Houses still buy from markets, building costs still come straight from the stockpile, and the trade ship still sells and buys from it.

**What you see**
- A workshop's panel shows "Materials: 4 wood (room for 6)".
- A workshop waiting for its materials says "Waiting for a cart to bring wood." if the stockpile has wood, and "Waiting for wood." if it does not.
- A cart on its way to a workshop now carries a load on the way out too, in the colour of the material.
- The tip "Your carts cannot keep up. Build another warehouse near your workshops." now also counts workshops waiting for materials the stockpile has.

**A bigger town needs more warehouses.** Each warehouse's 3 carts now do twice the work. A compact first act still manages with one warehouse, or two near the end. A second-act town needs two or three. The tip line says when.

**How it plays, measured by the bot.** The bot now does what the tip asks: when 3 or more buildings are waiting on carts, it builds a warehouse beside the worst served of them, if it can pay for one at once, at most every 3 minutes. It also avoids building a workshop more than 24 tiles from every warehouse without building a warehouse near it first.

| Build order | Phase 19 | Phase 20 |
|---|---|---|
| Standard | 29.3 | 28.9 |
| Careless | 30.6 | 31.9 |
| Bread first | 58.7 | 58.7 |
| Merchant | 31.2 | 31.9 |
| Second act: 100 Artisans after the win | +22.4 | +26.3 |
| Standard, Hard | 37.0 | 37.0 |
| Second act, Hard | +35.9 | +41.3 |
| Standard, Easy | 29.1 | 28.5 |
| Second act on islands 42, 7 and 2025 | +24.8, +25.1, +21.6 (no materials) | +22.4, +22.5, +23.4 |
| Fishing village, guild, short-handed | gold, gold, gold | gold, gold, gold |

**Saved games.** A game saved before this phase loads with every workshop's store empty. The first cart to each fills it. A big town from before carts, especially one with workshops out of reach, will need another warehouse or two: left alone it slowly loses residents, and the tip line says what to do.

**Not in this phase:** carts that serve another warehouse's buildings, a choice of which materials a workshop is sent, and stores of different sizes for different workshops.

## 22. The look

Added in Phase 21, an art and design pass. **No rule, number or balance changed.** A saved game loads exactly as before.

**The ground**
- The grass, sand and fields are shaded in **broad soft patches**, lighter and darker over several tiles, instead of every tile picking its own shade. The old way read as a checkerboard.
- The **tile grid shows only while placing** a road or a building. The rest of the time the ground is plain.
- The meadow has **flowers in drifts** (cream, yellow and pink), light and dark grass tufts, and now and then a low bush or a stone. They are only looks: you can build on them.

**The shore**
- **Foam on every side** of the island, not only the two sides facing you, and a soft line of white a little further out.
- **Wet sand**, a darker strip along the water's edge of every beach.
- The low cliff on the near sides has a darker foot and a light top edge.

**Buildings**
- **Shadows** fall to the lower right, away from the sun, longer for taller buildings, with a soft edge.
- **Roofs** are lit at the ridge and darker toward the eaves, laid in rows of tiles, with a dark eave edge.
- **Walls** darken a little toward the ground.
- **At night** the light from windows falls on the ground in front of a house, not on its roof.
- The **number above a house** is smaller and see-through.

**Figures**
- People swing their arms, have a shaded side and a round shadow.
- Carts have round wheels, and their load catches the light.
- Fishing boats and the trade ship cast a shadow on the water. The ship has a row of small windows and its sails are shaded on the far half.

**The screens around the map**
- The **tools** at the bottom come in groups, with a small gap and a faint line between: Select; Road and Warehouse; the buildings that make things; House and Market; Upgrade, Demolish, Undo and Redo.
- The **top bar** comes in groups with faint lines between: coins; goods; people and the goal; the clock.
- The names of goods on the top bar ("Wood") show only on screens wider than 2300 pixels. Since staff and cloth joined the bar it no longer fitted one line at 1920 with the names.
- The title screen, the building panel and the win screen were not redesigned. They pick up the new ground behind them.

## 23. The second island and your ship

Added in Phase 22. The new good grown there comes in Phase 23.

**Where it is.** Across the water to the east of the home island, about 15 tiles of sea away. It is made from the same seed, after the home island, so the home island is exactly as it was. The map grows to hold it (`map.json`, "second").

**When.** It opens when you win. Before that, anything you try to build there says "The second island opens when you reach the goal." The win screen says it is open.

**Its own goods.** Each island keeps its own goods in its own warehouses, and the top bar shows the goods of the island in the middle of your screen. On the second island the goods are outlined in gold, with "The second island's goods" below them. Coins are shared.
- Building on the second island takes goods from the second island's warehouses.
- **Except at first:** until the second island has both a warehouse and a harbour, whatever you build there is paid from home. The settlers bring it with them.
- Carts, workshops and houses there use the second island's goods. A market serves houses on its own island only.
- Staff are shared: residents on either island work anywhere.
- The trade ship calls at the home island only.
- The last warehouse on the home island cannot be demolished. Those on the second island can.

**Your ship.** Once each island has a harbour linked to a warehouse by road, your own ship sails between them (`config.json`, "fleet").
- It carries 30 goods a trip, takes 0.8 seconds per tile of sea (about 14 seconds a crossing on the standard map), and spends 10 seconds in each harbour.
- In the second island's harbour panel, each good has a button that goes round: **Stays**, **Takes over** (home to the second island) and **Brings home**. Each row shows the stock on both islands.
- In each harbour it first unloads everything that fits, then, as it leaves, loads what is ordered to leave that island, taking turns between the goods one at a time until it is full. What does not fit when unloading stays aboard.
- Both harbour panels say where the ship is and what is on board. It is drawn sailing between the harbours, with a red stripe on its sails.
- A tip after the win says how to get it going, until it sails.

**Saved games.** A game saved before this phase loads with the second island added and the map widened. Every building and road on the home island stays where it was, and the home island plays on exactly as before.

**Not in this phase:** a level to keep at home before the ship takes a good, more than one ship, and the trade ship calling at the second island. The new good came in Phase 23 (section 24).

## 24. Grapes and wine

Added in Phase 23. This gives the second island its purpose.

**The chain**
- A **Vineyard** grows grapes, 1 every 15 seconds. It stands only on **fertile land on the second island**. Costs 60 coins, 10 wood, 5 planks; upkeep 1 a minute; 2 staff.
- A **Winery** turns 2 grapes into 1 wine every 15 seconds. It can stand on either island. Costs 90 coins, 15 planks; upkeep 2 a minute; 3 staff.
- So a town either ships grapes home to a winery there, or makes wine on the second island and ships the wine. Grapes and wine cannot be traded: the trade ship brings nothing the home island cannot make.

**What wine is for**
- **Once the second island is open, an Artisan house holds 12 only with wine. Without it, it holds 8,** as many as a Worker house. Artisans drink 0.04 wine each a minute.
- Wine does not stop a house becoming an Artisan house, and Artisans do not leave altogether for want of it: they go down to 8, and fill up again when wine comes.
- Before the second island opens, Artisans do not miss wine. So the first game, the scenarios and anything before the win are as they were.
- In practice the goal of 100 Artisans needs the island: the bot's town without it stays far short after two hours (a test checks this). A player who upgraded 13 houses or more could get there without wine.

**Help to settle** (`config.json`, "settlers")
- The win brings **700 coins** to settle the second island.
- Once the second island has a warehouse and a harbour, it adds **10 coins a minute** to the base income.

**On screen**
- A house's panel: "Residents 8 of 8 (12 with wine)", and "Wine: None in stock. Holds 8 without it". Before the island opens: "Wanted once the second island opens".
- The upgrade button: "Holds 12, 8 without wine."
- Picking the Vineyard lights the fertile land of the second island only.
- The tip line: "Nobody is making grapes. Build a vineyard on the second island.", and "You make grapes only on the second island. Set your ship to bring grapes home, in the panel of the harbour there."
- The top bar shows nine goods. To fit at 1280 wide, it shows the storage limit only on screens wider than 2300 pixels; hover over a good to see it. The tools slimmed so eighteen fit one row.

**How it plays, measured by the bot.** The Artisans build order now builds a second sawmill straight after the win, settles the second island, plants two vineyards, has the ship bring the grapes home to a winery, and sells surplus fish and wood to the trade ship. Then cloth and upgrades as before. It also builds a house when short of staff with coins to spare, as the tip asks.

| | Phase 22 | Phase 23 |
|---|---|---|
| Standard game, the win | 28.9 | 28.9 |
| 100 Artisans, after the win | +26.3 | +30.5 |
| On islands 42, 7 and 2025 | +22.4, +22.5, +23.4 | +31.6, +30.6, +32.5 |
| Easy, after the win | | +29.9 |
| Hard, after the win | +41.3 | +42.3 |
| Every scenario | gold | gold |

**Saved games.** A game saved before this phase loads with no grapes or wine. In a game already won, Artisan houses start wanting wine: they go down to 8 each until the second island sends it. Games saved in Phase 22 load.

## 25. What your ship leaves behind

Added in Phase 24.

- Every good your ship carries has a **level to keep back** on the island it loads from: at home for a good it takes over, on the second island for a good it brings home. It never takes a good below that level. With no level set it takes all it can, as before.
- In the second island's harbour panel, a good that is carried shows "keeps 20" beside its name, with − and + in steps of 10, up to that island's storage room. Hovering over − or + says where it is kept: "Leave more at home".
- The level stays when the order changes direction, and setting it can be undone.
- A game saved before this phase keeps nothing back.

## 26. How far carts reach, on the map

Added in Phase 25. Nothing in the rules changed.

- While you place a **producer, a warehouse or a road**, every road is tinted: **green** where a cart from a warehouse comes that far (30 road tiles), **red** where it is too far, or joined to no warehouse at all.
- Placing a producer beside a road, the tip beside the pointer says how far it would be: "Sawmill: 40 coins, 5 wood. 20 road tiles from a warehouse." Too far, it says "Too far for carts: 41 road tiles. They come 30." in the warning colour.
- The distance counts the roads as they are. Road you lay afterwards can shorten it.

## 27. The vintners: a fourth scenario

Added in Phase 26.

- **The second island is open from the start**, and so Artisans want wine from the start: without it an Artisan house holds only 8.
- **Goal: 60 Artisans.** A well-off start: 1500 coins, 80 wood, 80 planks. The standard island.
- **Medals:** gold within 45 minutes, silver within 58.
- With wine, 60 Artisans need 5 Artisan houses; without, 8. The bot's town without the island's wine does not get there in an hour.
- The bot wins in 40.1 minutes, 38.6 at a typical person's pace and 43.7 at a slow one. It keeps 30 wood and 20 planks back from the ship (`SPEC.md` section 25); shipping everything cost it 4 to 7 minutes.
- A scenario may now say `"secondIslandOpen": true` in `config.json`. The other scenarios and the standard game keep the island shut until their win.

## 28. Prices that move

Added in Phase 27 (`config.json`, "tradePrices").

- Every good the trade ship deals in has a price factor, normally 1. **Each unit you sell lowers it by 0.005, and each unit you buy raises it by as much.** It never goes below 0.6 or above 1.4. Both the selling and the buying price of the good follow it.
- **At every call the pull on the price is first halved**, so prices drift back to normal when you stop trading. Selling 30 a call, a good settles at about 0.7 of its price.
- A call trades at the prices it starts with, and those are the prices the harbour panel shows beforehand, with ↓ when below normal and ↑ when above.
- However far prices move, buying a good back always costs more than selling it earned: at the lowest price, buying is still dearer than selling at the highest. The data checks refuse settings that would break this.
- A game saved before this phase loads with every price at normal.

## 29. Your best time, and an island by number

Added in Phase 28. Both are on the title screen. Neither changes the rules.

- **Your best time on the standard island** is kept for each difficulty. When you win a game there, its time is kept if it beats the one before, and New game shows it: "The standard island. Your best: 28:55." Picking Easy, Normal or Hard on the title screen shows that difficulty's best.
- Only games begun from the title screen set a record, as with scenarios. The time is the game time at the win, as on the win screen. A game already won when it was saved does not count again.
- Random islands keep no record, because their times say nothing about each other. The standard island chosen by its number (1407) counts as the standard island.
- **"Or island number"** under the difficulty buttons: type a whole number from 1 to 999999 and press Play or Enter, for a new game on that island at the difficulty picked above. The same number always makes the same island, so an island you liked can be played again or shared. Anything else is answered with "Type a whole number from 1 to 999999." Like any new game it must be pressed twice when it would replace a saved game.
- A saved game on an island other than the standard one says which on the Continue button: "…, 351 coins, Hard, island 42". The ? panel in the game already names the island.

## 30. A second art pass: rounded ground, smooth roads, houses that differ

Added in Phase 29. Only the look changed. No rule, number or data file changed, and saved games are untouched.

- **The edges of the ground are rounded.** The coast, the beach against the grass, fields and forest floors used to show every tile as a step. Now, wherever a kind of ground ends, the corner of its last tile is rounded off, and where it wraps round a corner a small curve fills in. A coast laid in steps of one tile reads as a gentle wave. The tiles are exactly where they were: the rounding never reaches the middle of a tile, so what looks like land is land, and what can be built where is unchanged.
- **The shallows follow the coast** in five soft bands of paler water, out to about two tiles, instead of tile-shaped patches. Foam runs unbroken round the curves.
- **Roads bend.** Where a road turns a corner it curves instead, so a road laid in steps reads as a smooth bend and a winding country road looks like one. Four road tiles in a square still make a square of road. A road that runs past a building no longer sends a short arm into it; a road that ends at a building still has a short straight drive to it.
- **Houses come in four looks**, chosen from the house's building number in a shuffled way, so neighbours built one after another do not repeat in order. Houses in a saved game may change look once, since there are now four looks, not three. That is all.
- Speed is unchanged when playing. Building the picture of the ground when a game opens takes about 0.1 of a second instead of 0.03.

## 31. A third art pass: forests and meadows

Added in Phase 30. Only the look changed. No rule, number or data file changed, and saved games are untouched.

- **Forests look like woods.** Each forest tile has two or three trees at loose places instead of one in the middle, so the trees no longer stand in rows. They come in mixed sizes and in three shades of pine and three of leafy tree, with about one leafy tree in five. At the forest's edge the trees are fewer, smaller and more often leafy, so a wood thins out into the meadow. Low dark undergrowth lies on the forest floor between them.
- **Meadows have warm and cool patches**: broad sunny yellow-green rises and cool blue-green hollows, about twenty tiles across, changing so gradually that no tile's edge shows.
- **The sea deepens further out**: a sixth, faint band of shallows reaches about three and a half tiles from the shore.
- A forest tile is still one tile of forest: what can be built, and where a lumberjack works, are as before.

## 32. A fourth art pass: the buildings

Added in Phase 31. Only the look changed. No rule, number or data file changed, and saved games are untouched.

- **Every building** stands on a low stone footing. Windows have pale frames, glazing bars and a sill; doors have a frame and a latch. Roofs cast a soft shadow on the walls under their eaves, and the visible gable end has a darker trim.
- **Houses.** Farmers' cottages have a small porch over the door and a woodshed against the side. Workers' houses have dormer windows in the roof: two, or for some one in the middle. Artisans' houses have a tall gable over the door, rising from the wall, with a window.
- **Workshops.** The warehouse has a loft door in a gable over its big doors, with a hoist and a sack on its rope. The bakery has a domed bread oven against its side, whose mouth glows while it bakes, and loaves on a bench by the door. The winery has an arched cellar door, a gable with a round window, a vine up the wall and barrels stacked by the wall. The weaver has a lean-to where the wool is kept. The farm's crop grows as rows of stalks that carry ears once half grown. The lumberjack has a chopping block with an axe in it; the sawmill has windows and sawdust by its door.
- **Barrels** everywhere are round and stand upright.

## 33. A fifth art pass: people, and the rest of the buildings

Added in Phase 32. Only the look changed. No rule, number or data file changed, and saved games are untouched.

- **People** have round heads, hair, shaped bodies with a belt, and arms with hands. Each kind of resident wears its own hat: a wide straw hat for Farmers, a flat cap for Workers, a tall hat for Artisans. About half wear a long skirt and a headscarf instead. Carters and fishermen are drawn the same way; a fisherman's rod now bends out over the side, and cart wheels have spokes.
- **The market** has striped awnings, baskets of goods along each counter, paving stones and a well in its open corner.
- **The harbour** has a paved quay, a wooden jetty along the water with round bollards and a coiled rope, a crane with a jib, a brace and a pulley, and a lantern by the harbourmaster's house.
- **The sheep farm**'s sheep have woolly bodies, heads and legs, and the pasture has a hay rack and a water trough.
- **The fisherman** hangs fish to dry beside the net and keeps a barrel for the catch. **The vineyard**'s rows are leafy along the top, with grapes in bunches.

## 34. Windows that light up at dusk, and light at night

Added in Phase 33. Only the look changed. No rule, number or data file changed, and saved games are untouched.

- **By day, windows are dark glass.** Before, a lived-in house showed bright yellow windows at noon.
- **From dusk** (once it is about a third of the way to night) the lamps are lit: lived-in houses light their windows, and the weaver and winery light theirs while they work. At dawn they go out at the same point. The bakery's oven glows while it bakes, day or night.
- **At night the lights shine through the dark**: lit windows, the oven's mouth, the harbour's lantern and a new lantern at each market stall stay bright while the rest of the town goes blue and dim, and warm light spills onto the ground in front of every lit building, workshops and markets included, not only houses.
- **With day and night switched off** (the box in the ? panel), the lamps are always lit, so the town looks as it did before.

## 35. Errands, and street lamps

Added in Phase 34. Only the look changed: walkers and lamps are decoration, and nothing in the game depends on them. No rule, number or data file changed, and saved games are untouched.

- **Errands.** About half the people who step out of a house now have somewhere to go: a workshop or the market. They walk the shortest way there by road and go in. The rest stroll the streets as before. A town that has just been opened starts with some already on their way.
- **Street lamps** stand along the streets: on every third road tile with a building beside it, at the edge of the road on the building's side. Roads across open country have none. By day the glass is pale; from dusk it is lit, and at night each lamp shines with a halo and a pool of light on the road. A lamp behind a nearer building is hidden by it, light and all. With day and night switched off the lamps are lit, like the windows.

## 36. Roads that follow the pointer

Added in Phase 35. Only how roads are laid changed: the cost and rules of a road tile are as before.

- **Dragging with Road picked lays the road along the tiles the pointer crosses**, in order, so a winding road, an S or a road round a hill is one drag. Before, a drag made one straight line with a single bend.
- **Going back over the road takes it back** to that point while still dragging, so a wobble can be undone without letting go.
- **A quick move that skips tiles** is joined with one bend, so the road never has a gap and never runs corner to corner.
- **Holding Shift** gives a straight line with one bend from where the drag began to the pointer, the old way, for long straight roads. (The old "Shift flips the corner" is gone; the same road can be drawn by dragging that way.)
- As before, tiles that cannot take a road (forest, water, a building) are skipped and the note says how many were built.

## 37. Undo several steps, and Redo

Added in Phase 36.

- **Undo goes back one action at a time**, newest first, up to 10 actions (`undoSteps` in `config.json`). Each action can still only be undone within 30 seconds of game time of when you did it (`undoSeconds`), so older ones run out first. The Undo button names the next action it would take back, and from the second on how many are waiting: "Road, 5 tiles (3)".
- **Redo** (the button beside Undo, or Ctrl+Y, or Ctrl+Shift+Z) does again what Undo took back, newest undone first, at its full cost, as if you had done it again. It names what it would do: "House", "Road, 1 tile", "Remove Sawmill". A redone action can be undone like any other.
- **Doing anything new forgets what could be redone.**
- A redo that cannot be done now (the money or goods are not there, or something is in the way) does nothing, says why, and stays waiting.
- What can be undone and redone is saved with the game. A game saved before this phase loads with its last action undoable as before and nothing to redo.
- `undoSteps` of 1 gives the old behaviour: only the last action. Neither setting is part of the rules stamp, so changing them never stops a saved game loading.

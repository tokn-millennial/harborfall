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
| A full win takes 25 to 40 minutes at 1x | 28.6 minutes | Standard build order on the shipped island. On 12 different islands: 25.9 to 28.6. |
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
- A new game can be Easy, Normal or Hard, picked on the title screen. Normal is what it starts on. See section 14.
- The game saves itself. It saves about every 10 seconds, whenever the page is hidden or closed, and when you go back to the title screen. There is no save button and nothing to remember.
- There is one saved game, kept in the browser you played in. It is not shared with other browsers or computers, and clearing the browser's stored data removes it.
- Starting a new game replaces the saved one, so the button must be pressed twice.
- A saved game cannot be continued if a rule in the data files has changed since it was saved. The title screen says so. Changing the rule back brings the game back. Changes to names, colors, shortcut keys and notes do not matter.
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
- Road: click for one tile, or drag for an L-shaped line. Hold Shift while dragging to put the corner on the other side. The note shows the tile count and cost.
- Upgrade: pick it, then click any house marked with a green ▲. One click per house.
- Demolish: pick it, then click a road once or a building twice. The second click must come within 4 seconds. The note shows what you get back.
- Undo: press Z, Ctrl+Z or the Undo button to take back your last build, road, upgrade or demolish. Everything it cost comes back, and a demolished building returns exactly as it was, residents and all. It works on your last action only, and for 30 seconds of game time after it (`undoSeconds` in `config.json`). The time does not run out while the game is paused. An undo cannot itself be undone. The button shows what it would take back.
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

**Houses come in three looks.** Each cottage, townhouse and Artisan house has a roof a shade darker or lighter, a chimney on one side or the other, and for some a flower bed, flower boxes or a banner. Which look a house has follows from when it was built, so it is the same every time the game is opened. It changes nothing about the house.

**The ground is sharp when zoomed in.** Zoomed past about 1.4 times the ground picture's own size, the ground on screen is redrawn at exactly the size shown, a fifth of a second after the view stops moving. While the view moves, the stretched picture is used as before.

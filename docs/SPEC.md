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

- You win when the number of residents living in Worker houses reaches 100 (`config.json` → `win`). Farmers do not count.
- That takes at least 13 full Worker houses (13 x 8 = 104).
- After the win screen you can keep playing.

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

### What the bot does not prove

- The bot is not a person. It acts the instant it can afford something and never misplaces a building. A person will be slower. My estimate for a first-time player is 30 to 40 minutes, and that is still a guess until you play in Phase 4.
- In the last third of the game the bot waits about 8 minutes in total for planks. A player who builds a second sawmill will finish sooner.
- On islands where one market is enough, the winning city earns +47 rather than +42.

## 11. Screen and controls (Phases 3 and 4)

- Isometric view with flat-color placeholder shapes. No final art.
- Pan: W A S D or arrow keys, or drag with the mouse. In Phase 3 any mouse button drags. Phase 4 keeps the middle and right buttons for dragging and gives the left button to the build tools.
- Zoom: mouse wheel, centred on the cursor. The + and - keys also zoom, centred on the screen. Zoom runs from 0.35x, which shows the whole island, to 3x.
- Home or C: back to the start site.
- The view cannot be dragged away from the island.
- Houses show their number of residents on the roof. Other buildings show the first two letters of their name.
- Left click: place the selected building, or select a building to see its info.
- Drag with the Road tool: lays an L-shaped line of road.
- Right click or Esc: cancel the current tool.
- Space: pause. Keys 1, 2, 3: speed 1x, 2x, 4x.
- Placement preview: green when valid, red when not, with the reason shown.
- HUD: coins and net income per minute, each good with its storage limit, Farmers, Workers, and progress to 100.
- Info panel: building name, status, what it makes, and for houses the residents, needs and upgrade button.
- Win screen with the time taken.

## 12. Not in Version 1

Save and load, sound, more islands, ships and trade, combat, visible carriers, workforce requirements for buildings, building rotation, a tutorial, touch controls, and final art.

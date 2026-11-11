# Harborfall: Game Spec (Version 1 slice)

Status: approved (Phase 0 gate, 2026-11-10). Updated in Phase 1 where the build filled in a detail. Each change is listed in `DECISIONS.md`.

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

File: `data/buildings.json`. These are starting values and will be tuned in Phase 2.

| Building | Size | Cost | Upkeep /min | Placement rule | What it does |
|---|---|---|---|---|---|
| Road | 1x1 | 1 coin | 0 | Buildable land | Connects buildings |
| Warehouse | 2x2 | 50 coins, 20 wood | 3 | Buildable land | +100 storage per good. Anchor for roads. |
| Lumberjack | 1x1 | 20 coins | 2 | 8 or more forest tiles within radius 4 | 1 wood every 8 s (7.5 /min) |
| Sawmill | 2x2 | 40 coins, 5 wood | 3 | Buildable land | 2 wood into 1 plank every 12 s (5 planks /min) |
| Fisherman | 1x1 | 30 coins, 10 wood | 3 | Shares an edge with a coast tile | 1 fish every 15 s (4 /min) |
| Farm | 2x2 | 50 coins, 10 wood, 5 planks | 5 | All 4 tiles on fertile land | 1 grain every 30 s (2 /min) |
| Bakery | 2x2 | 80 coins, 10 planks | 8 | Buildable land | 1 grain into 1 bread every 15 s (4 /min) |
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
| Worker | 8 | 0.2 fish, 0.075 bread | 1.0 coins |

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
- **Base income** is 10 coins per minute, always. It exists so a player with no residents can still recover.
- **Upkeep** is charged for every building that exists, whether or not it is working.
- Coins never go below zero. If upkeep would take you below zero, you stay at zero and buildings keep running.
- With too few coins you cannot build, upgrade or place roads until income recovers. Nothing else stops.

### Why a player cannot get permanently stuck

- Base income is always positive.
- Demolishing is free, returns half the cost, and removes the upkeep.
- A lumberjack costs coins only, so wood is always reachable. A sawmill needs only coins and wood, so planks are always reachable.
- The last warehouse cannot be demolished, so there is always storage and a road anchor.
- The map guarantees forest, coast and fertile land near the start.

The worst case is slow recovery, not a dead end. Phase 2 will test this with the bot.

## 9. Winning

- You win when the number of residents living in Worker houses reaches 100 (`config.json` → `win`). Farmers do not count.
- That takes at least 13 full Worker houses (13 x 8 = 104).
- After the win screen you can keep playing.

## 10. Balance on paper

These are estimates done by hand. Phase 2 replaces them with measured bot results. Expect the numbers to move.

**Target city at the win: 13 Worker houses, 104 Workers.**

| Need | Demand /min | Supplied by |
|---|---|---|
| Fish | 20.8 | 6 fishermen (24 /min). One fisherman feeds 20 residents. |
| Bread | 7.8 | 2 bakeries (8 /min), fed by 4 farms (8 grain /min) |
| Wood and planks | varies | 2 lumberjacks (15 wood /min), 1 sawmill (5 planks /min) |

**Income at the win:**

| Line | Coins /min |
|---|---|
| Taxes, 104 Workers x 1.0 | +104 |
| Base income | +10 |
| Upkeep: 2 lumberjacks, 1 sawmill, 6 fishermen, 4 farms, 2 bakeries, 2 markets, 1 warehouse | -74 |
| **Net** | **+40** |

**Total cost of that city:** about 1,230 coins (roads about 100, production 620, houses 130, upgrades 260, markets 120). You start with 500, so about 730 must come from income.

**Estimated time to win for an efficient player:** about 28 to 32 minutes at 1x. This sits inside the 25 to 40 minute target, but a slow first-time player may run over 40. That is the main balance risk and Phase 2 will measure it.

**Measured in Phase 1:**
- One fisherman keeps exactly 20 Farmers fed for 30 game minutes with none leaving. With 24 Farmers the town settles at 21.
- One sawmill uses 10 wood a minute and one lumberjack cuts 7.5. With one of each, wood stays at 0 or 1 for over 25 minutes and nothing that costs wood can be built. Two lumberjacks fix it. This is a trap for a new player and is the first thing to tune in Phase 2.
- A small town with the full bread chain and one Worker house loses about 8 coins a minute. The bread chain only pays for itself once several houses are upgraded.

## 11. Screen and controls (Phases 3 and 4)

- Isometric view with flat-color placeholder shapes. No final art.
- Pan: W A S D or arrow keys, or drag with the middle or right mouse button.
- Zoom: mouse wheel, centred on the cursor.
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

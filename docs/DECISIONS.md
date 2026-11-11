# Harborfall: Decision Log

Every choice that was not spelled out in the brief is recorded here, with the reason and how to change it. "You" means Colin. "I" means Fable 5.2.

## Decisions you made (Phase 0 questions)

| # | Decision | Answer |
|---|---|---|
| Q1 | Project location | `C:\Users\colin\Documents\Harborfall`, with git. One commit per approved phase. |
| Q2 | How goods move | No carriers. Road connection to a warehouse gives access to one shared stockpile. |
| Q3 | Win condition | 100 residents of the Worker tier. Farmers do not count. |
| Q4 | Unlisted features | Demolish with partial refund is added. Save and load is not. |
| Q5 | Map | One island generated from a fixed seed stored in `data/map.json`. |

## Decisions I made (Phase 0)

You can veto any of these. Items marked **(rule)** change how the game plays and are the ones most worth a look.

| # | Decision | Why | How to change |
|---|---|---|---|
| D1 | **(rule)** Base income of 10 coins per minute, always. | Your brief says a new player must not get stuck. Without this, a player at zero coins with no residents has no way back. | `config.json` → `baseIncomePerMinute`. Set to 0 to remove. |
| D2 | **(rule)** The free starting warehouse is placed for you at a good spot. | A new player could place it somewhere with no forest or coast in reach and be stuck from the first click. | Needs a code change to let the player place it. |
| D3 | **(rule)** A house upgrade needs bread in stock, as well as a full house and fish. | The brief says "when all needs are met". I read that as including the Worker needs. Otherwise a player can upgrade into a house that starts starving at once. | Needs a small code change. |
| D4 | **(rule)** Forest tiles cannot be built on or cleared, and never run out. | Keeps lumberjacks simple and stops a player destroying their own wood supply. | `map.json` → `terrain.forest.buildable`. Depletion would need code. |
| D5 | **(rule)** Buildings do not need workers to run. Residents only pay tax and count toward the win. | Keeps scope small. This is how the early Anno games work. | Needs code. |
| D6 | **(rule)** When a need is unmet, residents leave one at a time down to 1. Houses never downgrade. | Shortages hurt income but never destroy progress. Matches "no lose state". | `population.json` → `minResidents`, `declineIntervalSeconds`. |
| D7 | **(rule)** Coins stop at zero. Unpaid upkeep is forgiven and buildings keep running. | The brief says building stops when coins run out, and nothing else. Debt would create a lose state by the back door. | Needs code. |
| D8 | **(rule)** Upkeep is charged for every building, working or not. | Simple, and it makes idle buildings a real cost the player can see. | Needs a small code change. |
| D9 | **(rule)** When stock is short, older houses buy first. | Simple and predictable. The result is easy to read on screen: the newest houses empty first. | Needs code. |
| D10 | **(rule)** Houses do not need a road. They need only a market in range. | The brief lists producers, markets and warehouses as needing roads, and does not list houses. | Needs a small code change. |
| D11 | **(rule)** Demolish refunds 50% of coins and goods. The last warehouse cannot be demolished. | A refund makes demolish a recovery tool. Protecting the last warehouse keeps the game winnable. | `config.json` → `demolishRefundRatio`. |
| D12 | **(rule)** A fisherman must share an edge with a coast tile. Coast is the ring of sandy land tiles that touch water. | A literal reading of "needs an adjacent coast tile". | `buildings.json` → `fisherman.placement`. |
| D13 | **(rule)** A lumberjack needs 8 or more forest tiles within radius 4. | The brief gives the radius but not how much forest. One tree should not be enough. | `buildings.json` → `lumberjack.placement.minTiles`. |
| D14 | Building sizes: lumberjack and fisherman 1x1, everything else 2x2, road 1x1. | The brief fixes only the farm at 2x2. Small huts and larger main buildings read well as placeholder shapes. | `buildings.json` → `size`. |
| D15 | 10 simulation ticks per second. | Fine enough for smooth production timing, cheap enough that a 40 minute game simulates in seconds. | `config.json` → `ticksPerSecond`. |
| D16 | Coins are stored in whole thousandths. Goods are whole numbers. | Avoids rounding drift, where 500 coins slowly becomes 499.9999 and a purchase fails for no visible reason. | Internal. No reason to change. |
| D17 | Radius is straight-line distance from the building's centre. | Gives round coverage areas, which are easier to read on screen than squares. | Needs a small code change. |
| D18 | The UI uses ordinary page elements over the canvas. | Much less work than drawing menus in the canvas, and clearer text. The UI would be rebuilt in a game engine either way. | Not worth changing in this project. |
| D19 | No building rotation. | Not listed, and not needed with square footprints. | Needs code. |
| D20 | All starting balance numbers: production times, upkeep, taxes, need rates. | Chosen by hand to hit your three balance targets on paper. See `SPEC.md` section 10. | The data files. Phase 2 will retune them from bot results. |
| D21 | "Turns" in the test log means exchanges: one message from you plus my work in reply. | The log needs one consistent count. | Tell me if you want a different measure. |

## Later phases

Decisions made after Phase 0 are added below, with the phase they belong to.

### Phase 1: Simulation core

| # | Decision | Why | How to change |
|---|---|---|---|
| D22 | **(rule)** The start site must have coast, forest and fertile land within 7 tiles by road, down from 10. The generator picks the qualifying spot with the most open grass. | At 10 the first island put the warehouse a long walk from everything. 7 gives a tighter, friendlier start. | `map.json` → `startMaxDistance`. |
| D23 | Two new map settings: `coastRoughness` (0.5) and `patchSize` (7). | The first island had two huge forests and one huge field. Smaller patches look better and spread resources around. I warned in Phase 0 that these field names might change. | `map.json` → `generation`. |
| D24 | If a seed fails the guarantees, the generator tries the next seed, up to 50 times, then stops with an error. | A bad seed should never produce a broken or unwinnable island. | The retry limit is in `mapgen.js`. |
| D25 | **(rule)** The free starting warehouse gives no refund when demolished. | It cost nothing. A refund would be free coins. | `commands.js`, one line. |
| D26 | **(rule)** Demolishing a warehouse does not destroy goods above the new storage limit. | Losing goods for tidying up would feel like a punishment. | `economy.js`. |
| D27 | **(rule)** Goods refunded by a demolish are lost if storage is full. | Otherwise demolish could push stock over the limit. | `economy.js`. |
| D28 | An upgrade refused for lack of a market says `no_market`, separate from `needs_unmet`. | The player can fix the two problems in different ways, so the game should tell them apart. | `population.js`. |
| D29 | Commands use the shape `{ action, building, x, y }`. Phase 0 wrote `type` for both the command and the building, which clashed. | A naming fix found while writing the code. | Internal. |
| D30 | Road connections, storage and market coverage are recalculated when something is built or removed, not every tick. The planned per-tick event list was dropped. | The values are then correct even while paused, and nothing needed the event list. | Internal. |
| D31 | A game is `{ rules, state }`. Rules are locked after loading. State is plain data. | Keeps tunable rules and changing state apart, which makes saving and porting simpler. | Internal. |
| D32 | Tests read expected numbers from the data files, not from fixed values. Only `balance.test.js` holds the targets from the brief. | You can retune the data without breaking the rule tests. If a balance target drifts, exactly one file tells you. | Edit the targets in `balance.test.js`. |


### Phase 2: Bot and balance

| # | Decision | Why | How to change |
|---|---|---|---|
| D33 | **(rule)** Lumberjack cycle 8 s to 5 s. Sawmill cycle 12 s to 16 s. | With the old numbers a sawmill used wood faster than a lumberjack cut it. The first bot run spent 24 of its 28 minutes waiting for wood while planks piled up unused. | `buildings.json` → `cycleSeconds`. |
| D34 | **(rule)** Base income 10 to 20 coins a minute. | At 10, building the bread chain before any house left the bot at zero coins and -10 a minute for good, on 12 of 12 islands. At 20 the same opening recovers by itself. | `config.json` → `baseIncomePerMinute`. |
| D35 | **(rule)** Worker tax 1.0 to 0.85. Farmer tax stays 0.8. | Offsets the higher base income, so the winning city still earns about +40. | `population.json`. |
| D36 | **(rule)** Farm upkeep 5 to 4. Bakery upkeep 8 to 6. | A bread chain's upkeep lands before the Workers it feeds. This makes that dip shallower. | `buildings.json` → `upkeepPerMinute`. |
| D37 | No cost listed in the brief was changed. | Every target could be met with numbers the brief left to me: production times, taxes, upkeep and base income. | Not applicable. |
| D38 | I aimed the bot at 26 to 29 minutes, not the middle of the 25 to 40 window. | A person plays slower than the bot. Aiming low leaves them room to stay under 40. | Retune and re-run `node tools/bot.mjs`. |
| D39 | The bot follows a fixed build order from a JSON file and never demolishes. | The brief asked for a simple build order. A rigid bot also exposes dead ends that a clever one would dodge. | Edit or add files in `tools/bot/orders/`. |
| D40 | The bot lays towns out on a grid with road lanes, and adds a market when houses run out of room. | Without lanes it could wall itself in. Without the market reflex, a full town stopped the order on an obstacle that any player would walk around. | `tools/bot/planner.js`, `tools/bot/bot.js`. |
| D41 | The bot tests are part of the normal test run. | They are the Phase 2 gate. If later tuning breaks the timing or brings back a dead end, a test fails and says so. | Change the targets at the top of `tests/bot.test.js`. |
| D42 | I did not add a new rule to rescue a broke player. | I considered one. Raising base income fixed the dead ends with data alone, which keeps the scope small. | See the Phase 2 gate report if you want it reconsidered. |

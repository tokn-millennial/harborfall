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

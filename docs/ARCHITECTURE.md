# Harborfall: Architecture

Status: approved (Phase 0 gate, 2026-11-10).

This document says how the game is put together: the layers, the folders, the shape of the data, and how it will be tested. `SPEC.md` says what the rules are.

## 1. The big idea

The game is three layers that only talk in one direction.

```
   UI  (menus, HUD, mouse and keyboard)
    |  sends commands: "place a sawmill at 12,30"
    v
   Simulation  (all the rules, no screen, no browser)
    ^
    |  reads the game state, never changes it
   Renderer  (draws the island on the canvas)
```

- The **simulation** is the game. It can run with no screen at all, which is how the tests and the bot use it.
- The **renderer** looks at the simulation's state and draws it. It never changes anything.
- The **UI** turns your clicks into commands and shows numbers from the state. It never changes the state directly.

If you later move to a real engine, you keep the simulation and the data files and rebuild only the renderer and UI.

## 2. Rules that keep the layers honest

1. Files in `src/sim/` may not use anything from the browser (no `window`, `document`, canvas, `fetch`) and nothing from Node (no file access). They receive the data files as plain objects. A test scans the folder to enforce this.
2. The simulation changes only through **commands** and **ticks**. There is no other way in.
3. The same data, the same seed and the same commands always give the same result. The simulation never uses the clock or the built-in random function.
4. No game number is written in code. Costs, times, rates, sizes and limits come from `data/`.
5. No frameworks, no build step, no runtime dependencies. The only tool needed is Node, for tests, the bot and a tiny local web server.

## 3. Folder structure

```
Harborfall/
  index.html              The page. Holds the canvas and the HUD.
  package.json            Names the commands: test, start, bot. No dependencies.
  serve.mjs               Tiny local web server so the browser can load the game.

  data/                   ALL game rules. Edit these to tune the game.
    config.json           Tick rate, start resources, economy, win target.
    goods.json            The goods.
    buildings.json        Every building: cost, upkeep, size, rules, production.
    population.json       Tiers: capacity, needs, taxes, upgrade.
    map.json              Map size, seed, terrain types, generation targets.

  src/
    sim/                  The simulation. No browser code, no Node code.
      index.js            The public face: createGame, step, execute, queries.
      rules.js            Turns the data files into the rules the game runs on.
      validate.js         Checks the data files for mistakes at startup.
      state.js            Builds the starting game state.
      rng.js              Seeded random numbers.
      mapgen.js           Generates the island from the seed.
      grid.js             Tile helpers: neighbours, distance, footprints.
      buildings.js        Adds, removes and finds buildings.
      placement.js        Can this building go here? Returns yes or a reason.
      roads.js            Works out which buildings connect to a warehouse.
      refresh.js          Recalculates connections, storage and coverage after a change.
      production.js       Producer cycles: take inputs, work, deliver.
      population.js       Market coverage, buying goods, moving in and out, upgrades.
      economy.js          Taxes, base income, upkeep, paying costs, refunds.
      commands.js         Applies a command: place, road, demolish, upgrade.
      win.js              The win check.
      summary.js          The numbers the HUD, bot and reports read.

    render/               Drawing. Reads state, never changes it.
      iso.js              Tile to screen math and back. Pure math, tested in Node.
      camera.js           Pan and zoom.
      renderer.js         Draws terrain, roads, buildings, previews.

    ui/                   Input and panels.
      input.js            Mouse and keyboard to tool actions.
      tools.js            Build, road-drag, demolish and select tools.
      hud.js              Coins, goods, population.
      buildMenu.js        The list of buildings.
      infoPanel.js        Details for the selected building.
      speedControls.js    Pause, 1x, 2x, 4x.
      winScreen.js        The win message.

    platform/             The only place that touches the outside world.
      loadData.browser.js Loads the JSON files in the browser.
      loadData.node.js    Loads the JSON files in Node.
      loop.js             Fixed-tick loop and speed control.

    main.js               Browser start-up: load data, create game, wire layers.

  tools/
    print-map.mjs         Prints the island as text, to check it without a browser.
    bot.mjs               Plays the game headless with a build order (Phase 2).
    report.mjs            Prints time to win and the coin curve (Phase 2).

  tests/                  One file per system. Run with: node --test
    helpers.js            A small hand-drawn test island and shortcuts.
    scenario.js           A scripted mini-city that runs the whole chain.

  docs/
    SPEC.md  ARCHITECTURE.md  DECISIONS.md  TESTLOG.md
```

The UI is built from ordinary page elements placed over the canvas, not drawn inside the canvas. This is far less work and reads better. The cost is that the UI does not carry over to a game engine. It would be rebuilt there in any case.

## 4. The simulation's public face

Everything outside `src/sim/` uses only these.

| Function | What it does |
|---|---|
| `createGame(data, options)` | Takes the five data files as objects. Returns a game, `{ rules, state }`, with the map generated and the free warehouse placed. `options.map` supplies a hand-made map instead of a generated one. |
| `step(game)` | Advances the game by exactly one tick. |
| `execute(game, command)` | Applies one command right away. Returns `{ ok: true }` or `{ ok: false, reason }`. |
| `canPlace(game, building, x, y)` | Checks a placement, site and cost, without doing it. Used for the green and red preview. |
| `siteReason(game, building, x, y)` | Checks the site only, ignoring cost. |
| `canUpgrade(game, buildingId)` | Checks an upgrade without doing it. |
| `getSummary(game)` | Totals for the HUD: coins, income per minute, goods, storage limit, Farmers, Workers, win progress. |
| `buildingAt(game, x, y)`, `buildingById(game, id)` | Look up a building, for the info panel. |

A game has two parts. `game.rules` is built from the data files and is locked, so nothing can change it. `game.state` is everything that changes during play.

### Commands

| Command | Fields |
|---|---|
| `place` | `building`, `x`, `y` (top-left tile of the building) |
| `road` | `tiles` (a list of `[x, y]`). Places as many as valid and affordable, in order. Tiles that are already road are skipped for free. |
| `demolish` | `x`, `y` |
| `upgrade` | `id` (a house) |

A command looks like `{ action: "place", building: "sawmill", x: 12, y: 30 }`. A failed command changes nothing.

Failure reasons are short fixed codes. The UI turns each code into a sentence.

| Where | Codes |
|---|---|
| Placing | `out_of_bounds`, `not_buildable`, `blocked`, `needs_forest`, `needs_coast`, `needs_fertile`, `unknown_building` |
| Paying | `not_enough_coins`, `not_enough_goods` |
| Demolishing | `nothing_here`, `last_warehouse`, `out_of_bounds` |
| Upgrading | `not_a_house`, `max_tier`, `house_not_full`, `no_market`, `needs_unmet`, `no_bread` |
| Any | `unknown_command`, `bad_command` |

The `needs_...` and `no_...` codes are built from the terrain or good named in the data files, so a new placement rule or need gets its own code with no code change.

### What happens in one tick, in order

1. The tick counter goes up by one.
2. Producers advance their cycles, oldest building first.
3. Houses buy goods, then residents move in or out, oldest house first.
4. Income is settled, when the 6 second interval is due.
5. The win check runs.

The order is fixed so results are repeatable.

Road connections, storage room and market coverage are not recalculated every tick. They are recalculated at once whenever a command adds or removes a building or road, so they are always correct, even while the game is paused.

## 5. The data model

### Game state

`game.state` is one plain object. It holds only numbers, text, lists and simple objects, so it can be saved, copied or moved to another engine later. A test proves this: a copy made through JSON carries on exactly like the original.

| Field | Meaning |
|---|---|
| `tick` | Ticks since the start |
| `coinsMilli` | Coins, stored in whole thousandths so rounding never drifts. 500 coins is 500000. |
| `goods` | Amount of each good in the stockpile, whole numbers |
| `storageCap` | Current limit per good (100 x number of warehouses) |
| `map.width`, `map.height` | 64, 64 |
| `map.terrain` | One terrain code per tile, row by row |
| `map.start` | Where the free warehouse was placed |
| `roads` | One flag per tile: road or not |
| `occupancy` | One number per tile: the id of the building on it, or 0 |
| `buildings` | List of buildings, in the order they were built |
| `nextId` | The id the next building will get |
| `incomeTimer` | Ticks since the last income settlement |
| `lastIncome` | The breakdown of the last settlement, for the HUD |
| `won`, `wonAtTick` | Win flag and when it happened |

### A building

| Field | Meaning |
|---|---|
| `id` | Unique number, never reused |
| `type` | Key into `buildings.json`, for example `sawmill` |
| `x`, `y` | Top-left tile |
| `connected` | Linked by road to a warehouse |
| `free` | True only for the free starting building. It gives no refund. |
| `production` | Producers only: `status`, `active` (a cycle is under way), `progress` in ticks |
| `house` | Houses only: `tier`, `residents`, `served`, per-need `hunger` counter and `met` flag, `growTimer` and `declineTimer` for moving in and out |

### The data files

Each file is described by the notes inside it (keys starting with `_`). In short:

| File | Shape |
|---|---|
| `config.json` | `ticksPerSecond`, `speeds`, `start` (coins, goods, free buildings), `economy` (income interval, base income, refund ratio), `win` (tier, residents) |
| `goods.json` | One entry per good: `name`, `color` |
| `buildings.json` | One entry per building: `name`, `category`, `size`, `cost` (coins, goods), `upkeepPerMinute`, `requiresRoad`, then optional `placement`, `production`, `storagePerGood`, `housing`, `market`, `visual` |
| `population.json` | Growth and decline intervals, `minResidents`, and `tiers`, each with `capacity`, `taxPerResidentPerMinute`, `needs`, optional `upgrade` (to, cost) |
| `map.json` | `width`, `height`, `seed`, `terrain` types, `generation` settings (land, forest and fertile shares, coast roughness, patch size), `guarantees` |

Adding a new producer, such as a second kind of farm, needs only a new entry in `buildings.json` and a new good in `goods.json`. A test proves this by adding a quarry that makes stone, using data alone. Adding a new kind of rule, such as a building that needs workers, needs code.

`validate.js` checks the files when the game starts: every good named in a cost, input, output or need must exist, every tier named must exist, and numbers must be in a sensible range. A typo gives a clear message instead of a strange bug.

## 6. Time and the frame loop

- The simulation moves only in ticks of 1/10 second.
- The browser draws as fast as the screen refreshes. Each frame, the loop measures how much real time passed, multiplies by the speed (0, 1, 2 or 4), and runs that many ticks.
- If the browser tab stalls, the loop runs at most a fixed number of catch-up ticks per frame, so the game never freezes trying to catch up.
- Headless runs call `step` in a plain loop as fast as the computer allows. A 40 minute game is 24,000 ticks and should take well under a few seconds.

## 7. Rendering approach

- Classic 2:1 isometric diamonds. A tile is 64 x 32 pixels at zoom 1.
- Tiles and buildings are drawn back to front so nearer things cover farther things.
- Terrain is a flat colored diamond. A building is a colored box whose color and height come from the data files.
- Tile picking converts the mouse position back to a tile on the ground. Known limit: clicking the roof of a tall box picks the tile behind it. This is acceptable for flat placeholders and is listed as a known issue.

## 8. Test plan

All tests run with `node --test` and need no browser.

| Test file | What it proves |
|---|---|
| `data.test.js` | All five data files load, pass validation, and cross-reference correctly. Bad data is rejected with a clear message. |
| `mapgen.test.js` | The map is 64 x 64. The same seed gives the same map. A different seed gives a different map. All guarantees hold. Coast tiles all touch water. The start site is valid. |
| `placement.test.js` | Each placement rule accepts and rejects correctly: water, forest, overlap, map edge, lumberjack forest count, fisherman coast edge, farm on full fertile block. Costs are checked. A failed placement changes nothing. |
| `roads.test.js` | A building is connected only through a road chain to a warehouse. Diagonals do not connect. Removing one road tile disconnects what is behind it. Demolishing a warehouse disconnects its network. |
| `production.test.js` | A lumberjack makes exactly the expected wood over time. A sawmill consumes 2 wood per plank. Missing input, no road and full storage each stop production with the right status and resume correctly. No goods are created or lost. |
| `population.test.js` | Houses fill only when served and fed. One fisherman sustains 20 residents and not 24. Residents leave when unmet and stop at the floor. Older houses are fed first. Worker houses need bread to grow past 4. |
| `upgrade.test.js` | Upgrade succeeds only when the house is full, fed, and bread is available. It charges 5 planks and 20 coins. Each failure reason is reported. |
| `economy.test.js` | Taxes, base income and upkeep match the data to the thousandth of a coin. Coins stop at zero. Building is refused at zero and works again after income. Demolish refunds half and removes upkeep. The last warehouse cannot be demolished. |
| `win.test.js` | The game is not won at 99 Workers and is won at 100. Farmers do not count. The win tick is recorded once. |
| `determinism.test.js` | Two games given the same commands end in exactly the same state. |
| `integration.test.js` | A scripted mini-city runs the full chain from the real starting resources: wood, planks, fish, grain, bread, a Worker house. Also checks that the real generated island has reachable sites for every building. |
| `boundaries.test.js` | No file in `src/sim/` uses browser or Node features, the clock, or the built-in random function, and none imports from outside the folder. |
| `balance.test.js` | The balance targets from the brief, checked against the shipped data: starting stock, one fisherman per 20 residents (on paper and in play), about +40 coins a minute for the winning city, and no dead ends. |
| `iso.test.js` (Phase 3) | Tile to screen and back returns the same tile, at several zoom and pan settings. |

Later phases add:
- **Phase 2:** the bot run is the balance test. It reports time to win, the coin curve, and any point where the bot waited more than a set time with nothing it could afford.
- **Phases 3 and 4:** I open the game in a browser, drive it with mouse and keyboard, and check the screen and the error console. These checks are manual and are recorded in `TESTLOG.md`.

## 9. Honest limits of this design

- **No carriers** means the map layout matters less than in a real Anno game. Roads are a yes or no connection.
- **One shared stockpile** means a second warehouse is only extra storage.
- **Older houses eat first** is simple and predictable but not fair. A smarter sharing rule can come later.
- **Forest never runs out**, so several lumberjacks can share one patch of trees.
- **The balance numbers are untested estimates** until the bot runs in Phase 2.
- **Mac is supported by design but not tested.** I only have a Windows machine here.

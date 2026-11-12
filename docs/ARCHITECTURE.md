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
  index.html              The page. Holds the canvas and the panels.
  ui.css                  How the panels look.
  package.json            Names the commands: test, start, bot, map. No dependencies.
  serve.mjs               Tiny local web server so the browser can load the game.
  start-game.bat          Double-click on Windows to start the server and open the game.
  start-game.command      The same for a Mac.

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
      save.js             Turns a game into plain data and back, and refuses a save that cannot be trusted.

    render/               Drawing. Reads state, never changes it.
      iso.js              Tile to world math and back, box outlines, draw order. Pure math.
      camera.js           Pan, zoom, world to screen and back, what is visible. Pure math.
      pick.js             What is under a screen point: ground tile and building. Pure math.
      visuals.js          Each building's color, height and label, from the data files.
      renderer.js         Puts a frame together: water, ground, roads, buildings, outlines, marks.
      art/                The drawings. Every one is code. There are no image files.
        kit.js            Drawing tools in "building space": walls, pitched roofs, posts, color mixing.
        buildings.js      One drawing per building look, picked by the `art` name in the data.
        terrain.js        Ground, shoreline, trees, water glints and joined-up roads.
        box.js            The plain box used when a building has no drawing.
        icon.js           The small building pictures on the build menu.
        sprites.js        Keeps each building look as a ready-made picture.

    ui/                   Input and panels.
      gameUi.js           The controller: active tool, selection, clicks into commands.
      cameraControls.js   Mouse and keyboard control of the camera. Passes pointer events on.
      tools.js            What a build, road or demolish click would do. Pure, tested in Node.
      text.js             Every sentence the player reads, built from the data. Pure.
      panelModel.js       What the info panel says about a building. Pure.
      advice.js           The tip line: what is short, traced to its root. Pure.
      titleModel.js       What the title screen says and offers. Pure.
      titleScreen.js      Shows the title screen and reports the choice.
      hud.js              Coins and income, goods, population, clock.
      buildMenu.js        The tool buttons and the hint strip above them.
      infoPanel.js        Shows a panel model, reports button presses.
      speedControls.js    Pause, 1x, 2x, 4x, and their keys.
      winScreen.js        The win message.
      dom.js              Two small helpers for making page elements.
      icons.js            The small icons for goods, people, coins and tools.

    platform/             The only place that touches the outside world.
      loadData.browser.js Loads the JSON files in the browser.
      loadData.node.js    Loads the JSON files in Node.
      loop.js             Fixed-tick loop and speed control.
      saveStore.js        Keeps one saved game in a storage box that is handed to it.

    main.js               Browser start-up: load data, title screen, pick the game, wire layers, autosave.

  tools/
    print-map.mjs         Prints the island as text, to check it without a browser.
    bot.mjs               Plays a full game headless and prints a report.
    tune.mjs              Plays several games with changed numbers, to compare them.
    pace.mjs              Estimates a person's time to win by adding human delays to the bot.
    ui-playthrough.js     Plays a whole game through the real UI, in the browser.
    ui-monkey.js          Throws thousands of random clicks, drags and keys at the UI.
    bot/
      bot.js              Follows a build order, waits when it cannot afford a step.
      planner.js          Picks building sites and road routes.
      orders/             Build orders as JSON: standard, careless, bread-first.
      paces.json          How fast a person acts: brisk, typical, slow. These are guesses.

  tests/                  One file per system. Run with: node --test
    helpers.js            A small hand-drawn test island and shortcuts.
    scenario.js           A scripted mini-city that runs the whole chain.

  docs/
    HANDOFF.md            Start here when picking the project up.
    ROADMAP.md            What could come next.
    BRIEF.md              The original brief.
    SPEC.md  ARCHITECTURE.md  DECISIONS.md  TESTLOG.md  PLAYTEST.md  FINAL_REPORT.md
    screenshots/          Pictures from each phase.

  README.md               The front page.
  CLAUDE.md               Standing instructions for an AI helper.
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
- Each building's data names a drawing (`visual.art`), a main color and a height. The drawing is a small piece of code in `src/render/art/buildings.js` that builds the shape from walls and roofs. A building with no drawing, or an unknown name, is shown as a plain colored box, so a new building in the data works before it has art.
- The drawings are tested without a browser: `tests/art.test.js` gives them a stand-in canvas that records what was drawn.
- Tile picking gives two answers for a screen point: the ground tile under it, and the building the pointer is over. A point on a drawn box counts as that building, even though the ground tile behind the box is a different one. Where two boxes overlap on screen, the nearer one wins. Phase 0 planned to accept wrong picks on roofs. That turned out to be easy to do properly, so it was.
- `iso.js`, `camera.js`, `pick.js` and `visuals.js` are pure math with no canvas, so they are tested in Node. `renderer.js` is checked by eye in the browser.
- The renderer draws in world pixels and lets the canvas apply pan and zoom.
- Almost everything is prepared once and reused, because drawing thousands of small shapes on every frame was measured as far too slow:
  - The ground and the forest never change, so they are painted once into a large hidden picture, and each frame shows that picture. A second, small copy is used when zoomed far out. The large picture uses about 80 MB of memory on a sharp screen and the small one about 9 MB.
  - Each look of each building is drawn once into its own small picture. A farm has six looks, one per stage of its crop. A finished town needs about ten pictures in all. They are redrawn sharper when the player zooms in.
  - Road shapes are rebuilt only when something is built or removed.
  - The water's color is the page background behind the canvas. Only the glints are drawn each frame.
  - Smoke and sawdust are the only building parts drawn fresh each frame.
  - Pictures are shown with the browser's cheapest smoothing. The next level up was measured at over twenty times the cost whenever a building's picture is shown smaller than it was drawn. Building pictures come in five sizes, so one is never shown at less than half its size.
- Buildings are drawn far to near. Trees within two tiles of a building are drawn in order with the buildings, so a tree in front of a house covers it. All other trees are part of the ground picture.
- While a building or road is being placed, buildings are drawn see-through.
- `http://localhost:5173/?demo` shows a finished town built by the bot, so the building shapes can be checked before the build menu exists.

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
| `bot.test.js` | The Phase 2 gate. The bot wins on the shipped island in 25 to 40 minutes, with no long waits, income near +40 at the win and never below +10 after minute 5. It also wins on five other islands and from three bad openings. |
| `iso.test.js` | Tile to screen and back returns the same tile for every tile, at several zooms and pans. Zoom keeps the point under the cursor fixed. Picking finds roofs, and the nearer of two overlapping boxes. |
| `ui.test.js` | The logic behind the UI: every reason code has a sentence, previews agree with what a click then does, road lines are unbroken, the info panel says the right thing for each kind of building. |
| `loop.test.js` | Real time becomes whole ticks. Speeds 2x and 4x, pause, and a stalled tab all behave. |
| `save.test.js` | A game that is saved, turned into text, read back and played on ends exactly where it would have without saving. Tested on real bot games at several moments, on a won game, on another island and on a hand-made one. Twenty kinds of damaged save, a changed rule and a newer version are each refused. Changes to looks and names are not. |
| `title.test.js` | The save slot, with a stand-in for the browser's storage: reading, writing, failing storage, unreadable text. What the title screen offers in each case, and that a new game never replaces a saved one without a second press. |
| `art.test.js` | Every building and house tier has a drawing. Every drawing runs in every state, uses only valid colors and stays inside its own plot. A building with no drawing falls back to a box. Stored pictures change only when the look changes. Drawing never changes the game. |

Later phases add:
- **Phase 2:** the bot run is the balance test. It reports time to win, the coin curve, and any step that waited more than 5 minutes.
- **Phases 3 and 4:** I open the game in a browser, drive it with mouse and keyboard, and check the screen and the error console. These checks are manual and are recorded in `TESTLOG.md`.

## 9. Honest limits of this design

- **No carriers** means the map layout matters less than in a real Anno game. Roads are a yes or no connection.
- **One shared stockpile** means a second warehouse is only extra storage.
- **Older houses eat first** is simple and predictable but not fair. A smarter sharing rule can come later.
- **Forest never runs out**, so several lumberjacks can share one patch of trees.
- **The balance numbers are untested estimates** until the bot runs in Phase 2.
- **Mac is supported by design but not tested.** I only have a Windows machine here.

## 10. The bot

The bot lives in `tools/bot/`, outside the simulation. It uses only the simulation's public face, the same checks and commands the UI will use, so it cannot cheat.

- **Build order.** A JSON list such as "build 2 lumberjacks, build a market, upgrade 6 houses". The bot does the steps in order and waits when it cannot afford one. It records what it waited for.
- **Layout.** Houses, markets, sawmills and bakeries go on a pattern of 2x2 cells with every third row and column kept clear for roads, so the town never walls itself in. Lumberjacks, fishermen and farms go wherever the terrain allows.
- **Roads.** For each building the bot finds the cheapest route from the existing road network and pays for it.
- **One reflex.** If there is no room left for a house near any market, the bot builds another market first. Apart from that it never deviates from the order and never demolishes.
- **A person's pace, optionally.** Given a pace from `paces.json`, the bot waits a random few seconds after each action, as a person would. The waits are seeded, so a run can be repeated.

A fixed order is deliberate. When a game goes badly, the cause is the order or the balance numbers, not a clever bot hiding a problem.

Limits: the bot cannot place buildings larger than 2x2, and it plays far more cleanly than a person.

## 11. The UI

The UI is split so that as much as possible can be tested without a browser.

- **Pure logic, tested in Node:** `text.js`, `tools.js` and `panelModel.js`. They answer questions such as "what would a click here do?" and "what should the panel say?" using the same checks the simulation's commands use. A preview can therefore never disagree with the click that follows.
- **Page code, checked in the browser:** `gameUi.js` and the panel files. They only show what the pure logic returns and send commands.
- **One way in.** The UI changes the game only by calling `execute`. It never edits the state.

Two queries were added to the simulation's public face for the UI: `buildingIssue` (the one thing most wrong with a building) and `inMarketRange` (would a house here be served).

### The UI playthrough

`tools/ui-playthrough.js` plays the standard build order through the real UI. It clicks menu buttons, clicks and drags on the canvas, selects houses by their roofs and presses Upgrade. Only the passing of time is done directly. It is run from the browser console and takes about a fifth of a second.

It ends in exactly the same game state as the headless bot. That is strong evidence that every UI action does what the matching command does. It is not evidence about how the game feels to a person.

### The random-input test

`tools/ui-monkey.js` sends thousands of seeded random clicks, drags, scrolls and key presses to the page. After every action it checks that the game still makes sense: coins not negative, goods whole numbers, no house over capacity, every building on exactly the tiles it claims, the camera within its limits. A failure can be repeated exactly by using the same seed. It runs from the browser console.

Both tools are run on `http://localhost:5173/?fresh`, a test page that opens a new game on the standard island with no title screen and never saves. The random-input test is also run on `?demo`.

## 12. Saving

Saving is split across three places, so that the part that matters would survive a move to a game engine.

- **`src/sim/save.js`, the what.** `saveGame(game)` returns plain data: the whole state, the island seed that was asked for, a format number, and a stamp of the rules. `loadGame(data, save)` turns it back into a game, or says why not: `not_a_save`, `newer_version`, `rules_changed` or `damaged`. It has no browser code and never fails with an error on bad input.
- **`src/platform/saveStore.js`, the where.** One slot in a storage box that is handed to it. In the browser the box is the page's own storage. In the tests it is a stand-in. Every failure of the box is caught, because a browser may block or fill its storage at any time.
- **`src/main.js`, the when.** It saves every 10 seconds, when the page is hidden or closed, and before going to the title screen. It also stores where the player is looking, which is not part of the game state.

**The rules stamp.** A save made under one set of numbers may be nonsense under another, for example a house holding more residents than its new limit. So each save carries a short stamp worked out from every rule in the data files, and loading refuses a save whose stamp differs. The island seed, the notes, and names, colors and shortcut keys are left out of the stamp, because they cannot break a game.

**The damage check.** A save is checked in about twenty ways: whole numbers where they belong, buildings of known types that sit on the tiles the map says they do, residents within a house's limit. Then everything worked out from what is built where (road connections, storage, market coverage) is calculated afresh and must match what the save says.

**Limits.** One slot, one browser. Two tabs open on the game overwrite each other, and the last to save wins. The speed setting, the picked tool and the tip line's memory of shortages are not saved.

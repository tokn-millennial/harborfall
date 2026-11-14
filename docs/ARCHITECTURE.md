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
      commands.js         Applies a command: place, road, demolish, upgrade, close, reopen.
      win.js              The win check.
      summary.js          The numbers the HUD, bot and reports read.
      save.js             Turns a game into plain data and back, and refuses a save that cannot be trusted.
      undo.js             Remembers how to take back the last command, and does it.

    render/               Drawing. Reads state, never changes it.
      iso.js              Tile to world math and back, box outlines, draw order. Pure math.
      camera.js           Pan, zoom, world to screen and back, what is visible. Pure math.
      pick.js             What is under a screen point: ground tile and building. Pure math.
      visuals.js          Each building's color, height and label, from the data files.
      renderer.js         Puts a frame together: water, ground, roads, buildings, people, outlines, marks.
      life.js             Where the walkers, carts and boats are. Decoration that follows the game. Pure.
      effects.js          Notices buildings appearing and going, for the dust. Pure.
      daylight.js         How much night there is at a moment of game time. Pure.
      art/                The drawings. Every one is code. There are no image files.
        kit.js            Drawing tools in "building space": walls, pitched roofs, posts, color mixing.
        buildings.js      One drawing per building look, picked by the `art` name in the data.
        terrain.js        Ground, shoreline, trees, water glints and joined-up roads.
        box.js            The plain box used when a building has no drawing.
        icon.js           The small building pictures on the build menu.
        sprites.js        Keeps each building look as a ready-made picture.
        actors.js         Draws the walkers, carts and boats.
        dust.js           Draws the puffs of dust.

    ui/                   Input and panels.
      gameUi.js           The controller: active tool, selection, clicks into commands.
      cameraControls.js   Mouse and keyboard control of the camera. Passes pointer events on.
      tools.js            What a build, road or demolish click would do. Pure, tested in Node.
      text.js             Every sentence the player reads, built from the data. Pure.
      panelModel.js       What the info panel says about a building. Pure.
      advice.js           The tip line: what is short, traced to its root. Pure.
      titleModel.js       What the title screen says and offers. Pure.
      titleScreen.js      Shows the title screen and reports the choice.
      soundControls.js    The speaker button and the volume slider.
      guide.js            Which step of the first-game guide the player is on. Pure.
      guidePanel.js       The guide's small panel.
      hud.js              Coins and income, goods, population, clock.
      buildMenu.js        The tool buttons and the hint strip above them.
      infoPanel.js        Shows a panel model, reports button presses.
      speedControls.js    Pause, 1x, 2x, 4x, and their keys.
      winScreen.js        The win message.
      dom.js              Two small helpers for making page elements.
      icons.js            The small icons for goods, people, coins and tools.

    audio/                The sounds, made from numbers. No browser code.
      synth.js            Turns a recipe into a list of samples. Also makes the looping sea.
      sounds.js           The recipes: which tones and noise make up each sound.

    platform/             The only place that touches the outside world.
      loadData.browser.js Loads the JSON files in the browser.
      loadData.node.js    Loads the JSON files in Node.
      loop.js             Fixed-tick loop and speed control.
      saveStore.js        Keeps one saved game in a storage box that is handed to it.
      audio.js            Plays sounds through a sound system that is handed to it.
      soundSettings.js    Remembers the volume and whether sound is off.
      flagStore.js        Remembers one yes-or-no choice, such as "the guide is hidden".

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
| `close`, `reopen` | `id` (a producer). Added in Phase 16: section 19. |
| `undo` | none. Added in Phase 11: section 14. |

A command looks like `{ action: "place", building: "sawmill", x: 12, y: 30 }`. A failed command changes nothing.

Failure reasons are short fixed codes. The UI turns each code into a sentence.

| Where | Codes |
|---|---|
| Placing | `out_of_bounds`, `not_buildable`, `blocked`, `needs_forest`, `needs_coast`, `needs_fertile`, `unknown_building` |
| Paying | `not_enough_coins`, `not_enough_goods` |
| Demolishing | `nothing_here`, `last_warehouse`, `out_of_bounds` |
| Upgrading | `not_a_house`, `max_tier`, `house_not_full`, `no_market`, `needs_unmet`, `no_bread` |
| Closing | `not_a_producer`, `already_closed`, `not_closed` |
| Any | `unknown_command`, `bad_command` |

The `needs_...` and `no_...` codes are built from the terrain or good named in the data files, so a new placement rule or need gets its own code with no code change.

### What happens in one tick, in order

1. The tick counter goes up by one.
2. Producers advance their cycles, oldest building first. If the town is short of staff, this step is skipped on some ticks (section 18).
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
- Walkers, carts and boats are worked out by `life.js` from the game's state and clock, and drawn in the same far-to-near order as the buildings and trees, so a person behind a house is hidden by it. `life.js` has no canvas code and imports nothing. It reads the game and never changes it. It has its own repeatable random source, so the same game always shows the same life. A test runs a game with it and a game without and requires them to end identical.
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
| `atmosphere.test.js` | Dust appears only for a building that is new or gone since the last frame, never for a game just opened, and at most twelve at once. Night is 0 through the day, rises and falls smoothly, repeats every 8 game minutes, and stands still while the game is paused. Neither changes the game. |
| `difficulty.test.js` | Normal is exactly the game as it was, with the same rules stamp. Easy and Hard change only coins, base income and tax. Each has its own stamp, so a save cannot load as another difficulty. The sensible build orders win on all three. On Hard a reckless opening strands the town, and demolishing is shown to be the way out. |
| `artisans.test.js` | The wool and cloth chain creates and loses nothing. Artisan houses need cloth and empty without it. The win counts Workers or better. The goal after the win is recorded once. The bot reaches it 15 to 30 minutes after the win, on four islands, with the first act unchanged. A game saved before Artisans existed loads and plays on as it would have. |
| `undo.test.js` | Undoing an action at once leaves the game exactly as it was, for buildings, road, demolishing and upgrading, and for 600 random actions. Undo gives back the whole cost. It is refused after 30 seconds, when there is nothing to undo, and when a demolish's refund has been used. The undo record is saved with the game, and a save from before undo existed still loads. |
| `guide.test.js` | The shipped guide has no mistakes, and 23 kinds of mistake are each refused with a sentence. Each kind of test counts the right thing. Steps are ticked and never unticked. A full winning game finishes the guide. The guide never changes the game and is not one of the rules. |
| `sound.test.js` | Every sound is short, not too loud, and starts and ends in silence so it cannot click. Good news rises and bad news falls. The sea loops with no join. With a stand-in for the browser: nothing plays before the first click, the same sound cannot pile up, muting silences everything, and a browser with no sound causes no error. |
| `life.test.js` | Walkers and carts only ever stand on roads, and boats only on water. A cart carries what its producer made and ends beside a warehouse. A boat goes out and comes home with the fisherman's work. Nothing moves while paused. A game with life ends identical to one without. Removing roads, loading another game and a jump in time cause no error. |
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

## 13. Sound

Sound follows the same split as saving.

- **`src/audio/`, the what.** A sound is a recipe: a few voices, each a tone or a burst of noise with a pitch, a length and a loudness. `synth.js` works a recipe out sample by sample into a plain list of numbers. Nothing here touches the browser, so every sound is made and measured in the tests, and the same code would feed a game engine's sound system.
- **`src/platform/audio.js`, the how.** It hands those numbers to the browser's sound system, which is passed in. It sets nothing up until the first click or key press, never starts the same sound twice within 60 milliseconds, plays at most six at once, and does nothing at all if the browser has no sound.
- **`src/ui/gameUi.js`, the when.** The UI reports seven kinds of moment through one callback, `onSound`. It does not know whether anything is listening. The simulation knows nothing about sound.

Why make sounds from numbers and not use the browser's built-in tone makers: a list of numbers can be checked in a test (how long, how loud, silent at both ends), is the same in every browser, and is not tied to browsers at all.

**Limit.** A test can measure a sound. It cannot hear one. Whether these sounds are pleasant has not been checked by anyone.

## 14. Undo and the guide

**Undo is a command.** The UI may only change the game through commands, so undo is one: `{ action: 'undo' }`. Every command that works leaves a note in the state (`state.undo`) saying how to take it back, and the next command replaces the note. Because the note is part of the state, it is saved with the game, and two games given the same commands still match exactly.

- A building just placed: remove it and return its whole cost. Its number is handed back too.
- Road just laid: lift those tiles and return their cost.
- A building just demolished: put its record back in the same place in the list (older houses are fed first), and take back what the demolish gave. If that has been used, the undo is refused.
- A house just upgraded: put its old record back and return the cost.

**The promise that is tested.** Undoing an action in the same instant leaves the state identical to what it was before the action, to the last number. A test does this for 600 random actions. It found one thing that did not come back: the one-word status of a producer that had been cut off and reconnected read "working" where it had read "storage full". The game corrects that word on its next tick, but the undo now restores it exactly.

**The guide is not a rule.** Its steps are in `data/guide.json`, loaded with the other data files, but only the UI reads it. `src/ui/guide.js` has the tests a step can use and the rule for which step is shown. It has no page code and is tested in Node.

**Saved games and the data files.** A saved game is refused when the rules it was played under have changed. Two things added in this phase live in the data files and are not rules in that sense: how long undo lasts, and the guide. Both are left out of the rules stamp, so adding them did not make existing saved games unusable. The stamp was checked before and after and is unchanged.

## 15. Adding content, and games saved before it

Phase 12 added two goods, two buildings and a tier by editing data files, with three small changes to the rules code. This section is for whoever adds the next thing.

**What was already general.** Goods, buildings, tiers, needs, upgrade paths, the tip line and the info panel all read the data. A new good or producer needs no code.

**What had to be written.**
- **Goals count a tier "or better".** Each tier knows itself and every tier above it (`andAbove`, worked out from the upgrade paths). The win is 100 Workers or better. Without this, upgrading Workers to Artisans would have pushed the win further away.
- **Milestones.** `config.json` may list goals for after the win. The state records the tick each was reached, the same way it records the win.
- **Drawings.** Each new building and tier needs a drawing in `src/render/art/buildings.js`, or it shows as a plain box.

**Older saved games.** A saved game is normally refused once the rules change, because old numbers under new rules can describe an impossible game. Adding things is the exception: a game saved before wool existed is still a possible game, with no wool in it.

- `config.json` has an entry, `addedLater`, naming everything added since saved games began. Since Phase 15 it is a list of rounds, oldest first (section 18).
- The rules work out an older stamp for each round, `olderStamps`: what the stamp would be without that round and every round after it.
- A save whose stamp matches one of them is carried forward: the new goods are added at zero, and, if the goals after the win are new to it, none counts as reached. Then it is checked like any other save.
- If one of the old numbers has changed as well, the older stamp no longer matches, and the save is refused as before. Changing one of the new numbers does not affect it.

To add a good, building or tier of your own and keep older saves working, add a round naming it at the end of `addedLater`. The stamp before Phase 12 was `6fe08f1bee9bb754`. A save made in the browser under the old data carried exactly that stamp and was continued under the new data.

**The bot.** A build order may carry `"pastWin": true` to play on after the win until its steps are done and every milestone is reached. An upgrade step may say which upgrade: `{ "upgrade": 3, "to": "artisan" }`.

## 16. Difficulty, and the sharp close-up

**Difficulty is applied to the data before the rules are made.** `withDifficulty(data, id)` in `src/sim/rules.js` returns a copy of the data files with one difficulty's numbers written in. The rules are then compiled from that copy, exactly as from any data. So the simulation has no "if hard" anywhere: it only ever sees numbers.

- A saved game records its difficulty, as it records its island seed, and loading rebuilds the same rules.
- Each difficulty gives a different rules stamp, because the numbers differ. A saved Easy game is refused if someone edits what Easy means, and a save cannot be loaded as another difficulty.
- The list of difficulties itself is left out of the stamp, and Normal changes no number. So adding difficulties did not disturb any existing saved game. The stamp was checked before and after and is unchanged.

**The sharp close-up.** The ground is normally one large picture, stretched or shrunk to the zoom. Zoomed far in, stretching makes it soft. Drawing the ground shape by shape every frame was measured in Phase 7 as far too slow. The answer is in between:

- When the picture would be stretched by more than about 1.4 times, and the view has not moved for a fifth of a second, the renderer draws only the tiles on screen into a hidden canvas the size of the screen, and shows that.
- It is drawn once and reused for as long as the view is still. The moment the view moves, the stretched picture is used again.
- `createTerrainPainter` and `createForestPainter` take a range of tiles for this, so only what is in view is worked out.

In my test browser the one frame that makes the sharp copy took about 50 ms longer than a normal frame. After that, frames with the sharp copy were a little faster than frames with the stretched picture, because the copy goes on pixel for pixel.

**House looks.** A house's look is its building number divided by three, remainder taken. The drawings take it as one more input, like "is anyone living here", and the stored pictures are keyed by it.

## 17. Looks that are worked out, not stored

Phase 14 added three effects. Like the walkers and the house looks before them, they follow one rule: **a look is worked out from what the game already holds, and nothing is added to the game for it.**

- **Dust** needs to know a building is new. The renderer does not ask the game. It remembers which building numbers it saw last frame and compares (`src/render/effects.js`). A game that has just been opened shows none, because everything in it was already there.
- **Day and night** is a function of the game clock (`src/render/daylight.js`): give it the game time in seconds and it returns how much night there is. Nothing is stored, so a loaded game is at the right time of day by itself.
- **Chimney smoke** is drawn fresh each frame on top of a house's stored picture, the same way as the bakery's smoke, when the house has residents.

Because none of this is in the game state, saved games are unaffected, and the check that a full game through the UI ends identical to the headless bot still holds.

**Night is drawn in the middle of a frame on purpose.** The order is: water, ground, roads, buildings and figures, dust, then the night tint and house lights, and only then the numbers over houses, the outlines, the placement preview and the warning marks. So everything the player reads is drawn after the tint and is never dimmed.

## 18. Staff, and several rounds of additions

**The staff rule is one small file,** `src/sim/staff.js`, with two functions.

- `staffing(game)` only reads. It adds up the `staff` of every producer linked to a warehouse, counts the residents, and returns how many are needed, how many the town has, and the speed production runs at in thousandths (`ratioMilli`, 1000 is full speed). The top bar, the panels, the tip line and the bot all use it.
- `staffWorksThisTick(game)` is called once a tick, at the top of the production step. It adds `ratioMilli` to a counter in the state, `staffClock`. If the counter has not reached 1000, the producers do not work this tick. Otherwise 1000 is taken off and they do. At 75% staffing, three ticks in every four are worked.

Why it is done by skipping whole ticks:
- **Production itself did not change.** A cycle is still a whole number of ticks. With enough staff the counter never moves, and the game plays tick for tick as it did before the rule. The tests check that against a game with the rule taken out.
- **It is all whole numbers,** so the same game always plays the same, on any machine.
- **Every producer is slowed alike,** so there is no question of who gets the staff first.

`staffClock` is the only thing the rule adds to the game state. It is a whole number from 0 to 999, it is saved with the game, and loading refuses anything else. Commands never touch it, so undo is unaffected.

**Switching it off.** Remove `workforce` from `config.json` and the rule is gone: `staffing` reports full speed, and the top bar, menu and panels stop mentioning staff. The `staff` numbers on the buildings are then ignored.

**Several rounds of additions.** Until now one older rules stamp was recognised: the game before wool, cloth and Artisans. With staff there are two generations of saved games out in the world, so `addedLater` became a list:

```
"addedLater": [
  { "goods": [...], "buildings": [...], "tiers": [...], "upgradesFrom": [...], "config": ["milestones"] },
  { "buildingSettings": ["staff"], "config": ["workforce"] }
]
```

- `buildingSettings` is new: it names a setting that was added to buildings.
- For each round, the rules work out the stamp the data would have without that round and all later ones. On Normal these are `6fe08f1bee9bb754` (before Phase 12) and `b16fd0a9142282c9` (Phases 12 to 14). Both are checked by name in `tests/staff.test.js`. If that test fails, a rule those games were played under has changed and every game saved back then will be refused.
- A save is carried forward by what it lacks. A save from Phases 12 to 14 already has its goals after the win, so they are kept. Before this phase they were always wiped, which would have cost such a save its "100 Artisans" record.
- A single round written as one object, the old form, is still read.

**The bot** now reports the minutes it spent short of staff and the slowest speed it fell to. Its build orders were not changed.

## 19. Closing a building

Two commands, `{ action: 'close', id }` and `{ action: 'reopen', id }`, both in `src/sim/commands.js`.

- **What is stored.** A closed producer carries `closed: true` in its production record. An open one has no such entry at all. So a game in which nothing was ever closed is, byte for byte, a game from before closing existed, and no older save needed carrying forward. A test checks that a bot game holds no trace of the word.
- **No data file changed,** so the rules stamp is the same as in Phase 15 (`10d0dc80671f7e66` on Normal).
- **The status word.** A producer's one-word status gains `closed`. It is worked out, like the others: no road beats closed, closed beats everything else. `syncProductionStatus` sets it whenever roads change, so a closed building that is cut off and joined again is still closed.
- **The production step** skips a closed producer before it can take inputs or advance. Its progress is left where it was.
- **Staff.** `staffing` leaves closed producers out of the count.
- **Undo.** Each command leaves a note with the building's number and the status word it had, so undoing puts back that exact word. The random undo test now throws closes and reopens in with placing, roads and demolishing, and requires each kind to have been undone at least five times.
- **Loading** refuses a closed mark that is anything but `true`, a status word that disagrees with the mark, and an undo note that does not match the building.
- **The UI** adds the two buttons through `panelModel.js` like any other panel action. Their ids are `closeBuilding` and `reopenBuilding`, because `close` already means the panel's own × button.
- **The renderer** draws a grey mark on a closed producer, after the checks for a problem or a ready upgrade, so a real problem is never hidden by it.

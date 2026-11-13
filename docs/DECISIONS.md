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

### Phase 3: Renderer

| # | Decision | Why | How to change |
|---|---|---|---|
| D43 | The game is started by double-clicking `start-game.bat` (Windows) or `start-game.command` (Mac). Each runs a small server included in the project and opens the browser. | Browsers will not load this kind of code from a double-clicked HTML file. You asked not to be handed technical steps. | `serve.mjs`. |
| D44 | The server only answers this computer, and refuses hidden files such as `.git`. | It is a development convenience and should not expose the folder to the network. | `serve.mjs`. |
| D45 | Picking a roof selects the building. Phase 0 planned to accept a wrong pick there. | It took about 20 lines to do properly, and wrong picks would have made Phase 4 selection feel broken. | `src/render/pick.js`. |
| D46 | `?demo` in the address shows a town built by the bot. | Without it Phase 3 would show one warehouse, and the building shapes could not be judged. It is a viewing aid, not a game feature. | `src/main.js`. Remove the link in `index.html` to hide it. |
| D47 | Labels on roofs: residents for houses, two letters for other buildings. | Single letters clashed: W for Warehouse and Worker, F for Farm, Fisherman and Farmer. | `src/render/visuals.js`. |
| D48 | A pan key moves the view at once when pressed, then keeps moving while held. + and - are read as typed characters, not key positions. | In testing, a quick tap moved nothing, and + failed where the key sits elsewhere on the keyboard. | `src/ui/cameraControls.js`. |
| D49 | One frame may account for at most 1 second of real time. | Game time then stays correct down to one frame a second, and returning to a hidden tab causes no jump. | `MAX_FRAME_SECONDS` in `src/main.js`. |
| D50 | Tile size (64 by 32 pixels) and zoom limits are constants in the render code, not data files. | They are drawing settings, not game rules. | `src/render/iso.js`, `src/render/camera.js`. |

### Phase 4: UI and play

| # | Decision | Why | How to change |
|---|---|---|---|
| D51 | A left drag moves the view, except with the Road tool, where it lays road. | Laptops often have no middle button. Phase 3 said the left button would belong to the tools alone. That would have left trackpad users with only the keys. | `shouldPan` in `src/ui/gameUi.js`. |
| D52 | A tool stays picked after placing. | Placing 14 houses should not take 28 clicks. | `src/ui/gameUi.js`. |
| D53 | A building is placed centred on the pointer. | The copy that follows the pointer then sits under it, not off to one side. | `anchorFor` in `src/ui/tools.js`. |
| D54 | Warning marks on buildings: red ! for no road or no market, amber ! for a wait. | You did not list these. A new player otherwise has to click every building to find the one that is idle. I count it as part of "building info". | Remove the marker block in `src/render/renderer.js`. |
| D55 | The top bar says "You are losing money" when income is negative. | Phase 2 found that negative income is the main way a new player gets into trouble. | `src/ui/hud.js`. |
| D56 | A house may be placed out of market range, but the note at the pointer warns that nobody will move in. | The simulation allows it, and a player may place houses before the market. | `previewBuild` in `src/ui/tools.js`. |
| D57 | Winning pauses the game. Keep playing resumes at 1x. | The brief has no lose state and says nothing about what follows a win. | `src/ui/gameUi.js`. |
| D58 | All on-screen text is built from the data files. `goods.json` gained an optional `singular` word ("plank"). | Retuning the data then updates the text by itself. | `src/ui/text.js`. |
| D59 | No new-game button. Refresh the page. | Not listed. | Would need a small addition to `src/main.js`. |
| D60 | Demolish has no confirmation. | A misclick costs half a building, which is recoverable. A prompt on every demolish would be tiresome. | `src/ui/gameUi.js`. |
| D61 | The demo town link from Phase 3 now lives in the ? panel. | It stays useful for looking at a finished town, and it is out of the way. | Remove the link in `index.html`. |
| D62 | A test tool plays a full game through the real UI. | It is the closest I can get to "play from start to win" without a person at the mouse. | `tools/ui-playthrough.js`. |

### Phase 5: Review

| # | Decision | Why | How to change |
|---|---|---|---|
| D63 | Picking Farm or Fisherman lights up the ground it can use. The ? panel gained a key to the ground colors. | Phase 4 removed the line that named the ground under the pointer, so fertile land and grass could not be told apart. | `requiredTerrain` in `src/ui/tools.js`. |
| D64 | A green ▲ marks houses that can be upgraded, and a new Upgrade tool upgrades with one click per house. | You did not list either. A win needs at least 13 upgrades, and each took two clicks with no sign of which houses were ready. The Upgrade button in the info panel still works. | Remove the Upgrade entry in `src/ui/buildMenu.js`. |
| D65 | The ground and trees are painted once and reused. When zoomed out, trees are part of that picture and are not sorted among the buildings. | The whole-island view took 27 to 80 ms a frame in my test pane. A tree directly in front of a building can now overlap it by a few pixels less than it should. | `CACHE_MAX_SCALE` in `src/render/renderer.js`. Set it to 0 to always draw directly. |
| D66 | Building boxes are about a quarter lower, and buildings are see-through while placing. | Small buildings disappeared behind tall ones. | `HEIGHT_UNIT` in `src/render/iso.js`. |
| D67 | The top bar shortens itself on narrower windows, and income reads "+42.2 / min". | It wrapped to two or three rows and covered the map. | The media queries at the end of `ui.css`. |
| D68 | "I can win by hand" is scored as a pass on your approval of the Phase 4 gate, and is marked as not seen by me. | I cannot play at human speed, and I will not claim to have watched something I did not. | Tell me if you did not win a game, and I will change the score. |

### Phase 6: Polish

| # | Decision | Why | How to change |
|---|---|---|---|
| D69 | "Keep building" was taken to mean the problems Phase 5 left open, not new content. | You named no features, and your rule is not to add what you did not list. New buildings, save and load, or art need your direction. | Tell me what to build. |
| D70 | Demolishing a building takes two clicks on it within 4 seconds. A road takes one. | A misclick cost half a building with no way back. A full undo would be a much bigger change. | `CONFIRM_SECONDS` and `demolishBuilding` in `src/ui/gameUi.js`. |
| D71 | Every tool has a shortcut key. Building keys are in `buildings.json` (`key`). Select is Q, Upgrade is U, Demolish is X. | Listed as open in Phase 5. Keys that already mean something (W A S D, C, the numbers) cannot be taken, which is why Sawmill is I and Warehouse is E. | `buildings.json`, and `TOOL_KEYS` in `src/ui/buildMenu.js`. |
| D72 | Holding Shift while dragging a road flips its corner. | Roads could only bend one way. | `roadLine` in `src/ui/tools.js`. |
| D73 | A tip line names what has been short for 30 game seconds and what to build. | You did not list it. Phase 5 found that nothing told the player to build a second sawmill. It shows one tip at a time and only covers shortages. | `src/ui/advice.js`. Pass `null` to `hud.update` to switch it off. |
| D74 | A Start a new game button in the ? panel, pressed twice. | Listed as open in Phase 5. | `src/main.js`. |
| D75 | A market's panel counts the houses in its own range. | It used to count houses served by any market, which misled. | `housesInRangeOf` in `src/sim/population.js`. |
| D76 | The bot can play at a person's pace. The three paces are my guesses. | The biggest open question was how long a person takes. This is an estimate until you play. | `tools/bot/paces.json`. |
| D77 | The project was not pushed to GitHub in this phase. | The GitHub command-line tool is not installed, so I could not create a repository. I chose not to read your saved GitHub sign-in out of Windows to do it another way. | Create an empty repository and give me its address. It was pushed after you did. |

### Phase 7: Art and style

You asked for "real art and style" and gave no direction, so every choice below is mine.

| # | Decision | Why | How to change |
|---|---|---|---|
| D78 | All art is drawn by code. There are no image files. | I cannot paint pictures. Code-drawn art keeps the game free of downloads and outside tools, stays sharp at every zoom, and takes its colors from the data files. The cost is a simple, clean look, not a painted one. | An artist's pictures can replace the drawings one building at a time in `src/render/art/buildings.js`. |
| D79 | The look is a warm storybook harbor: pitched roofs, timber, thatch and tile, soft greens, a sandy shore. | It suits a calm building game and reads clearly at small sizes. This is taste, and you may want another. | Colors are in `buildings.json`, `population.json` and `map.json`. Shapes are in `src/render/art/`. |
| D80 | The panels are navy with a brass edge, with parchment cards for the tools and a serif face for titles. | To match the harbor theme. | The named colors at the top of `ui.css`. |
| D81 | The fonts are ones the computer already has (Georgia for titles). | No font files to load. Titles will look slightly different on a Mac. | `--display` in `ui.css`. |
| D82 | Each building names its drawing in the data (`visual.art`). One with no drawing is shown as a plain box. | Rules stay in the data, and a building added there still works before it has art. | `buildings.json` and `population.json`. |
| D83 | Colors and heights in the data changed to suit the drawings. No game rule changed. | A roof color and a box color are different jobs. The bot still wins in the same 28.6 minutes with the same final state. | The `visual` entries in the data files. |
| D84 | Farmer houses and Worker houses look different: a thatched cottage and a taller tiled townhouse. | You should be able to see your progress toward 100 Workers on the map. | `visual` under each tier in `population.json`. |
| D85 | Some drawings follow the game: crops ripen, the bakery smokes, the sawmill throws sawdust, house windows light up. | You did not list these. They are part of making the art feel alive, they show only what the game already tracks, and they add no rules. | `ART_USES` and `LIVE_ART` in `src/render/art/buildings.js`. |
| D86 | The two-letter labels are gone from drawn buildings. Houses keep their resident count, on a small plate. | The drawings say what a building is. The count is still needed. | `drawBuilding` in `src/render/renderer.js`. |
| D87 | The build menu shows a small picture of each building, and the top bar shows icons for goods, people and coins. | Pictures are faster to find than words. The names stay under the pictures. | `src/render/art/icon.js` and `src/ui/icons.js`. |
| D88 | The ground is painted once into two hidden pictures, and each building look once into its own picture. | Drawing every shape on every frame took over 100 milliseconds a frame, which is under 10 frames a second. | The constants at the top of `src/render/renderer.js`. |
| D89 | The large ground picture is up to 1.5 times finer than the screen needs at normal zoom. It uses about 80 MB of memory. | Finer looks crisper when zoomed in. Zoomed in past about 1.5x the ground still looks a little soft. | `PICTURE_MAX_DETAIL` in `src/render/renderer.js`. |
| D90 | Only trees within two tiles of a building are drawn in order with the buildings. | Sorting every tree every frame was too slow. A drawing never reaches further than two tiles from its plot. | `TREE_REACH` in `src/render/renderer.js`. |
| D91 | Nothing moves on the map except water glints, smoke and sawdust. No people, carts or boats. | Moving people are a feature of their own, and you did not ask for them. | Tell me if you want them. |
| D92 | No sound, no title screen, no new buildings. | Outside "art and style" as I read it. | Tell me if you want them. |

### Handoff (after Phase 7)

| # | Decision | Why | How to change |
|---|---|---|---|
| D93 | The roadmap is a list of proposals in a recommended order, not a plan. | Your rule is that nothing is built that you did not ask for. | Pick, reorder or strike items in `ROADMAP.md`. |
| D94 | The roadmap puts "play it by hand" first. | It is the cheapest step and the one thing no script can do. | Your call. |
| D95 | Your original brief is kept word for word in `docs/BRIEF.md`. | It is the source of the working rules, and it was only in the chat until now. It holds nothing personal beyond saying you are new to game development. | Delete the file. |
| D96 | A `CLAUDE.md` file in the top folder gives an AI helper the standing rules. | So you do not have to repeat them at the start of every session. | Edit or delete the file. |
| D97 | A `README.md` was added as the repository's front page. | GitHub shows it first, and there was none. | Edit the file. |

### Phase 8: Save, title screen, drawing speed

| # | Decision | Why | How to change |
|---|---|---|---|
| D98 | "Just keep building" was taken to mean: go ahead with the roadmap in the order I recommended, without waiting for you to approve a plan, and stop at the gate as usual. This phase is B1, B2 and A2. | You asked me not to stop. Playing by hand (A1) and a Mac test (A3) need you, so they were left. | Tell me if you want plans shown first again. |
| D99 | The game saves itself. There is no save button, no list of saves and no file to download. | The least to learn, and nothing to forget. A refresh or a closed tab no longer loses a game. | `AUTOSAVE_SECONDS` and `saveNow` in `src/main.js`. |
| D100 | One saved game, kept in the browser. | Simple. The cost is that it does not follow you to another browser or computer. | `src/platform/saveStore.js` already takes a slot name, so more slots are a small step. |
| D101 | A save is refused once a rule in the data files has changed. Names, colors, shortcut keys and notes do not count. | Old numbers under new rules can describe an impossible game. Refusing is safer than guessing a repair. The cost falls on you when you tune numbers: change one mid-game and that game cannot be continued until you change it back. | `LOOKS_ONLY` and `rulesStamp` in `src/sim/rules.js`. |
| D102 | A damaged save is refused, not repaired. | A repaired game may be subtly wrong forever. | `stateProblem` in `src/sim/save.js`. |
| D103 | Starting a new game over a saved one takes two presses, even when the saved game cannot be used. | An unusable save may become usable again if a data file is changed back. | `titleModel` in `src/ui/titleModel.js`. |
| D104 | The ? panel's "Start a new game" became "Save and go to the title screen", one press. | Nothing is lost by it any more, so it needs no guard. Starting over is now done from the title screen. | `src/main.js` and `index.html`. |
| D105 | A random island takes a number from 1 to 999,999. The ? panel shows it. There is no box to type a number into. | You did not ask for one. Showing the number lets you tell me which island a problem happened on. | `LARGEST_RANDOM_SEED` in `src/main.js`. |
| D106 | The view is saved along with the game: where you were looking and how far in. The speed and the picked tool are not. | Coming back to a large town with the view reset to the start felt broken. The others are one click to restore. | `saveNow` in `src/main.js`. |
| D107 | The title screen shows your saved town behind it, or the empty island, moved to one side of the box. | So the title is the game, not a blank page. | `TITLE_VIEW_SHIFT` in `src/main.js`. |
| D108 | A test page, `?fresh`, opens a new standard game with no title screen and never saves. `?demo` never saves either. | The test tools throw thousands of random actions at the game. They must not be able to wreck your saved game. | `src/main.js`. |
| D109 | Saving is split in three: what a save is (simulation), where it is kept (platform), when it happens (start-up). | The first part has no browser code and would move to a game engine unchanged. | See `ARCHITECTURE.md` section 12. |
| D110 | The extra, middle-sized ground picture proposed in the roadmap was not built. | I measured first. It made no difference. The slow zoom levels were caused by something else: the smoothing setting used when a building's picture is shown smaller than it was drawn. | Nothing to change. |
| D111 | Pictures are shown with the browser's cheapest smoothing, and building pictures gained a fifth, smaller size for far-out zoom. | This is the real fix. It halved the frame time at the slow zoom levels in my test browser. The smaller size keeps far-out buildings from looking grainy. | `imageSmoothingQuality` in `src/render/renderer.js`, `sharpnessFor` in `src/render/art/sprites.js`. |
| D112 | Speed is now measured by drawing the old way and the new way in turns, many times, and taking away the cost of the measuring itself. | My Phase 7 numbers were taken one after another, with the measuring cost left in. That cost drifts between 2 and 13 milliseconds, enough to hide or invent a difference. | The method is in `TESTLOG.md`, Phase 8. |
| D113 | `.obsidian/` was added to `.gitignore`. | A folder of that name appeared in the project during this phase. It looks as if the project was opened in Obsidian. It holds that app's settings, not project files. I did not touch the folder itself. | Remove the line from `.gitignore`. |

### Phase 9: Life on the map

| # | Decision | Why | How to change |
|---|---|---|---|
| D114 | "Keep going" was taken as before (D98): the next roadmap item I can do without you, which is C1, life on the map. Playing by hand and the Mac test are still yours. | You asked me not to stop. | Name a roadmap item if you want a different one. |
| D115 | Walkers, carts and boats are decoration only. Goods still arrive the instant they are made. | The roadmap item says so, and making carriers real is a much larger change to the rules (roadmap D3). | Roadmap item D3. |
| D116 | The figures show what the game already knows. Walkers follow the number of residents, a cart leaves when a producer delivers, and a boat's trip follows the fisherman's work timer. | So what you see is never at odds with what is happening. A boat sitting at home means that fisherman is not working. | `src/render/life.js`. |
| D117 | One walker for every 5 residents, at most 40. At most 14 carts, and one producer sends a cart no more than once in 10 seconds. | Enough to feel busy, few enough to stay cheap and not crowd the roads. A lumberjack delivers every 5 seconds, so every delivery would be a traffic jam. | The named numbers at the top of `src/render/life.js`. |
| D118 | These numbers live in the code, not in the data files. | They are looks, not rules. Putting them in the data files would also make saved games refuse to load whenever you changed one. | Could be moved into a data file that is left out of the rules stamp. |
| D119 | Walkers wander. They step out beside a house, take roads at random, and after 30 to 110 seconds go indoors at the next building they pass. They are not going anywhere in particular. | A walker with a real errand needs path-finding and a reason, for no gain you would notice at this size. | `moveWalker` in `src/render/life.js`. |
| D120 | Carts take the shortest way by road to a warehouse. Trips under 3 road tiles are not shown. | The route is the one thing about a cart that should look purposeful. | `routeToStorage` and `CART_MIN_TILES`. |
| D121 | Any producer that must stand by the coast gets a boat. Today that is only the fisherman. | Tied to the data, not to the name "fisherman". | `hasBoat` in `src/render/life.js`. |
| D122 | The figures are a few small rectangles each, drawn fresh every frame. They are hidden when zoomed out past 0.5. | They are about 10 pixels tall. Rectangles are the cheapest thing a canvas draws, and smaller than that they are specks. | `src/render/art/actors.js`, `ACTOR_MIN_ZOOM` in the renderer. |
| D123 | Life moves with game time, not real time. | It stops when you pause and hurries at 4x, like everything else. | `update` in `src/render/life.js`. |
| D124 | The figures cannot be clicked and have no panel. | They are not things in the game. | Would come with real carriers. |
| D125 | No switch to turn the figures off. | You did not ask for one, and the cost measured at about 1 ms a frame. | Set `MAX_WALKERS` and `MAX_CARTS` to 0, or ask for a setting. |

### Phase 10: Sound

| # | Decision | Why | How to change |
|---|---|---|---|
| D126 | "Keep going" was taken as before: the next roadmap item I can do alone, which is sound (C2). | You asked me not to stop. | Name a roadmap item. |
| D127 | The sounds are made by code. There are no sound files. | The roadmap asked you to choose, and I asked twice. With no answer, your own rule is that I make a reasonable choice and record it. Code-made sound adds no files and no downloads, matches the rest of the project, and is the easier choice to undo. Its cost is that the sounds are simple. | Replace a recipe in `src/audio/sounds.js`, or have `src/platform/audio.js` load files instead. |
| D128 | **I cannot hear.** Every sound was designed from numbers and has never been listened to. | An honest limit, not a choice. The tests prove the sounds exist, are short, are not too loud and cannot click. They cannot prove they are pleasant. | Listen, and tell me which ones are wrong. |
| D129 | Because of D128 the sounds are few, short and soft, and the starting volume is half. | The safest design when nobody has heard it. | `DEFAULT_VOLUME` and the recipes in `src/audio/sounds.js`. |
| D130 | Sound is on to begin with, with a speaker button always in view. | A sound you have to find and switch on is one you may never hear. One click turns it off, and that is remembered. | `createSoundSettings` in `src/platform/soundSettings.js`. |
| D131 | Seven sounds: pick, place, road, demolish, upgrade, refuse, win. Nothing for income, deliveries, residents arriving or the clock. | Those happen every few seconds for half an hour. Sounds on them would wear on the ear fast. | Add a recipe and one `onSound` call. |
| D132 | The sea is the only background sound. No music, no birds, no town noise. | Muffled noise that swells is the one background sound I can make with confidence from numbers. Music and birdsong made the same way are far more likely to sound bad. | `SEA` and `SEA_SHARE` in `src/audio/sounds.js`. Set the share to 0 for none. |
| D133 | The sounds are worked out as lists of numbers by the game's own code, not by the browser's built-in tone makers. | So they can be measured in tests and are the same everywhere. | `src/audio/synth.js`. |
| D134 | The recipes live in code, not in the data files. | They are not rules. A file in `data/` would also make saved games refuse to load whenever a sound was changed. | Could move to a file outside the rules stamp. |
| D135 | The same sound cannot start twice within 60 milliseconds, and at most six play together. | A dragged road or a fast run of clicks would otherwise stack into a roar. | `MIN_GAP_SECONDS` and `MAX_AT_ONCE` in `src/platform/audio.js`. |
| D136 | The test page `?fresh` is silent. | The test tools send thousands of actions in a few seconds. | `silent` in `src/main.js`. |
| D137 | No key for sound, only the button. | The letter keys are nearly used up, and M is Market. | Add one in `src/ui/soundControls.js`. |

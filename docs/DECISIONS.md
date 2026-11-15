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
| Q6 | Where the second island is (Phase 22) | On the same map, across the water. |
| Q7 | How goods cross (Phase 22) | Your own ship, with each island keeping its own goods. |
| Q8 | What the second island offers (Phase 22) | A new good the home island cannot make, which Artisans want. |
| Q9 | When it opens (Phase 22) | After the win, so the first game stays as it is. |
| Q10 | Wine strict, or filling houses (Phase 23, D317) | Keep it as it is: wine fills Artisan houses, 12 with it and 8 without. |
| Q11 | What to build next (Phase 25) | Show how far carts reach, while placing. |

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

### Phase 11: Undo and the first-game guide

| # | Decision | Why | How to change |
|---|---|---|---|
| D138 | "Keep building" was taken as before: the next roadmap item I can do alone, which is undo and a guided first game (B3, B4). | You asked me to keep going. | Name a roadmap item. |
| D139 | Undo takes back your last action only. There is no history and no redo. | It covers the misclick, which is what hurts. A full history would need every action to be reversible forever, including ones whose refund has since been spent. | A list of notes in place of one, in `src/sim/undo.js`. |
| D140 | Undo works for 30 seconds of game time after the action, and the time stands still while paused. | Long enough to notice a mistake, short enough that a building cannot be used for ten minutes and then returned for a full refund. At 4x speed it is 7.5 real seconds, which may feel short. | `undoSeconds` in `config.json`. 0 switches undo off. |
| D141 | Undo gives back everything. Demolish still gives back half. | Undo is for mistakes. Demolish is for changing your mind later. | `demolishRefundRatio` in `config.json` for demolish. |
| D142 | A demolish cannot be undone once what it gave back has been used. | The alternative is a building back for free. The game says why. | `takeBack` in `src/sim/undo.js`. |
| D143 | Undo is a command in the simulation, and what it needs is kept in the game's state. | Your rule that the UI changes the game only through commands. It also means undo is saved with the game and stays repeatable. | See `ARCHITECTURE.md` section 14. |
| D144 | Undo is the 13th button on the tool row, with the keys Z and Ctrl+Z. The buttons are a little narrower on windows under 1420 pixels wide so all 13 fit one row at 1280. | It belongs with the tools it reverses. Z is the usual key and was free. | `src/ui/buildMenu.js`, and the media query in `ui.css`. |
| D145 | The guide is ten fixed steps in a data file, from the first lumberjack to the win. | The roadmap said to wait for notes from a first-time player before writing it. You have now played, but gave no notes on what confused you, so the steps are my best guess at the order that works. It is the bot's winning order, slowed down. | `data/guide.json`. |
| D146 | A step is ticked the first time its test is true and stays ticked. The guide shows the first step not ticked. | My first rule let any later step carry the guide forward. A test showed that building a sawmill early then skipped "build 4 houses". | `createGuideTracker` in `src/ui/guide.js`. |
| D147 | I dropped a step that said "wait until there are 5 bread in storage". | It depends on an amount that goes up and down. In a busy town it might never pass, and the guide would wait on it for good. The upgrade step now mentions bread. | Add it back in `data/guide.json`. The note at the top of that file warns about such tests. |
| D148 | Nothing about the guide is saved. A game picked up later starts just past the furthest step that is true. | Simpler, and a saved game stays the same shape. The cost: if you undo or demolish the thing a step asked for and then reload, the guide may ask for it again or skip it. | Would need the guide's place stored beside the save. |
| D149 | The guide can be hidden, and that is remembered. It is not shown on the demo town, or for a game picked up after every step was done. | Someone on their third game does not want it. | The × on the panel, and the ? panel. |
| D150 | How long undo lasts and the guide's steps are in the data files but left out of the rules stamp. | Otherwise adding them would have made your saved game refuse to load, and so would every later edit to the guide. Neither can make a saved game impossible. I checked the stamp before and after: it is unchanged. | `LOOKS_ONLY` in `src/sim/rules.js`. |

### Phase 12: Artisans and a goal after the win

The roadmap asked you to choose the names, the needs, and whether the win moves. You said to keep going, so the choices below are mine.

| # | Decision | Why | How to change |
|---|---|---|---|
| D151 | "Just keep going" was taken as before: the next item in the roadmap's order, which is more game after the win (D1). It was done as one phase, not the two or three the roadmap guessed. | You asked me not to stop. The data files already allowed new goods, buildings and tiers, so it was smaller than I had feared. | Name a roadmap item. |
| D152 | The third kind of resident is the Artisan. The new goods are wool and cloth, from a Sheep farm and a Weaver. | Plain words that fit a harbor town, and a chain of the same shape as grain and bread, so it needs no new idea to learn. | Names are in `goods.json`, `buildings.json` and `population.json`. |
| D153 | The win stays at 100 Workers, exactly as in your brief. | It is your win condition, and every balance number was tuned to it. | `config.json` → `win`. |
| D154 | The win counts Workers or better. | Otherwise turning a Worker house into an Artisan house would move the win further away, which would punish the player for doing well. With no Artisans the count is the same as before. | `countAtLeast` in `src/sim/population.js`. |
| D155 | There is one goal after the win: 100 Artisans, called "A city of Artisans". After it there is nothing more. | A third tier with nothing to aim for is just more of the same. One goal gives the second act an end. | `config.json` → `milestones`. More can be listed. |
| D156 | The new numbers: sheep farm 60 coins, 10 wood, 5 planks, upkeep 4, wool every 20 seconds. Weaver 90 coins, 15 planks, upkeep 6, 2 wool into 1 cloth every 20 seconds. Artisan house holds 12, tax 1.2, cloth 0.05 a resident a minute. Upgrade to Artisan 30 coins, 8 planks. | Tuned with the bot until the second act took about 20 minutes and left the town richer. My first numbers (tax 0.9, upgrade 40 coins) made it take 39 minutes and left the town poorer than at the win. | The data files. `node tools/bot.mjs artisans` shows the effect. |
| D157 | No number from before this phase was changed. | The first act is the game you approved. A test checks that the win comes at the same moment with or without the second act. | Nothing to change. |
| D158 | A sheep farm needs pasture: 16 grass tiles within 3 tiles. | It gives the building a place it belongs, like the lumberjack and the farm. Grass is common, so it rarely gets in the way. | `placement` on the sheep farm in `buildings.json`. |
| D159 | A game saved before this phase can still be continued. What was added is listed in `config.json` under `addedLater`. | Your 40-minute game should not be thrown away because I added wool. A save from before simply has none of the new things. | `addedLater` in `config.json`. See `ARCHITECTURE.md` section 15. |
| D160 | The top bar leaves out the storage limit on windows under 1460 pixels wide, and the tools are narrower under 1600 and again under 1420. | Seven goods, three kinds of resident and fifteen tools did not fit one row at 1280. A good at its limit still turns amber, and hovering shows the full numbers. | The media queries at the end of `ui.css`. |
| D161 | The first-game guide grew from 10 steps to 13: a sheep farm and a weaver, the first Artisan house, and 100 Artisans. | Nothing else tells a player that there is more after the win, apart from one line on the win screen. | `data/guide.json`. |
| D162 | The Upgrade button shows the cost of the first step, Farmer to Worker. Its hint says later steps cost more. The cost for a given house shows at the pointer and in the house's panel. | One button, two prices. Showing both made the button too wide. | `src/ui/buildMenu.js`. |
| D163 | Three new drawings: a fenced pasture with sheep, a weaver's workshop with cloth hung out, and a tall slate-roofed house on a stone ground floor. Artisans walking the roads wear their own colors. | Every building has a drawing. These are my designs in the same style. | `src/render/art/buildings.js`. |
| D164 | No new sounds, no new music, and nothing new for the bot's other build orders. | Out of scope for one phase. Upgrading to Artisans makes the same sound as any upgrade. | Ask. |

### Phase 13: Small polish

You chose this phase ("Small polish") from the options I gave: difficulty settings, variety in how houses look, and a sharper ground when zoomed far in.

| # | Decision | Why | How to change |
|---|---|---|---|
| D165 | Three difficulties: Easy, Normal and Hard, picked on the title screen for a new game. Normal is the default and changes nothing. | Normal has to stay the game that was balanced and that your saved game was played under. | `config.json` → `difficulties` and `defaultDifficulty`. |
| D166 | A difficulty can change only three things: starting coins, the income with no residents, and tax. | Three knobs are enough to make the game kinder or harsher, and few enough to understand. Costs and speeds stay the same, so what you learn on one difficulty holds on another. | `withDifficulty` in `src/sim/rules.js` would need a new knob. |
| D167 | Easy: 800 coins, 30 a minute with no residents, 15% more tax. Hard: 350 coins, 10% less tax, and the same 20 a minute as Normal. | Tuned with the bot. My first Hard also cut the 20 a minute to 12. Every version that cut it left the reckless opening stuck for good, losing money with no coins. That income is the safety net from your brief ("a new player should not get stuck"), so Hard keeps it. | The numbers in `config.json`. |
| D168 | On Hard a reckless opening still strands the town, and the way out is to demolish. I left it so. | I tried thirteen versions and found none that is both harder than Normal and lets the bot's worst opening recover in a sensible time. The best took 114 minutes. Normal itself only just survives that opening. A person can demolish, the game tells them to, and a test shows it works. Easy and Normal are unaffected. | No single number fixes it. The versions tried are in `TESTLOG.md`, Phase 13. |
| D169 | Difficulty cannot be changed during a game. | It sets the starting coins, which have already been spent. | Would need a rule for what changing it means. |
| D170 | A saved game records its difficulty. Each difficulty has its own rules stamp. The list of difficulties is left out of the stamp. | So a save loads under the rules it was played with, cannot be loaded as another difficulty, and existing saved games were not disturbed by adding the list. | See `ARCHITECTURE.md` section 16. |
| D171 | Houses come in three looks, decided by the building's number. | A street of identical houses was the plainest thing in the town. Using the number means a house looks the same every time, with nothing extra to save. | `HOUSE_LOOKS` in `src/render/renderer.js`, and the drawings in `src/render/art/buildings.js`. |
| D172 | The differences between looks are small: roof shade, chimney side, and one detail. | Bigger differences would make houses hard to tell from other buildings at a glance. | The drawings. |
| D173 | The sharp ground appears a fifth of a second after the view stops, not while it moves. | Drawing it costs one slow frame. Paying that only when you have stopped means moving the view is exactly as smooth as it was. | `CLOSE_UP_SETTLE_SECONDS` and `CLOSE_UP_FROM` in `src/render/renderer.js`. Set `CLOSE_UP_FROM` very high to switch it off. |
| D174 | The sharp copy is one hidden canvas the size of the screen. | About 18 MB on a large sharp screen, against several times that for sharper copies of the whole island. | Nothing to change. |
| D175 | Not done from the roadmap's polish ideas: a building-site look, smoke from house chimneys, a day and night tint, and scenarios. | You asked for three things and I listed three. | Ask. |

### Phase 14: Dust, smoke, and day and night

| # | Decision | Why | How to change |
|---|---|---|---|
| D176 | "Keep going" at the Phase 13 gate was taken as approval of Phase 13, which was then committed, and as a request for the next thing I can do without you. | The same reading as before. | Say "not approved" and I will undo the commit. |
| D177 | This phase is the rest of the roadmap's art pass (C3): a building-site look, smoke from house chimneys, and day and night. I did not start workers, carriers or trade. | Those change how the game plays, and I said I would wait for your choice. These three change only how it looks. | Name one of the three larger items. |
| D178 | The "building-site look" became a puff of dust and a quick settle to full size, lasting under a second. Demolishing and Undo raise dust too. | Buildings appear at once in this game. A scaffold that lingers would suggest a building time the rules do not have. | `src/render/effects.js` and `src/render/art/dust.js`. |
| D179 | Dust plays on real time, even while paused. | You can build while paused, and the feedback should still come. | `update` in `src/render/effects.js`. |
| D180 | Every lived-in house smokes a little, all the time. | It shows at a glance which houses have people. An empty house has a cold chimney. | The house entries in `LIVE_ART`, `src/render/art/buildings.js`. |
| D181 | A day is 8 game minutes, about 5 of them daylight, and a new game starts at sunrise. | Long enough that night is an event, short enough to see three or four in a game. Starting at sunrise keeps the first minutes, when a new player is learning, in daylight. | The numbers at the top of `src/render/daylight.js`. |
| D182 | Night is a blue tint of at most 36% and a warm light at each lived-in house. Anything the player reads is drawn after it. | Darker looked better and was harder to play. The game must read the same at night. | `NIGHT_TINT_STRENGTH` in `src/render/renderer.js`. |
| D183 | Day and night can be switched off in the ? panel, and it is on to begin with. | It is a matter of taste, and some will find a dimmer screen tiring. | The box in the ? panel. |
| D184 | Night changes nothing in the game: no slower work, no different needs. | You did not ask for that, and it would be a new rule. | Would be a rule change. |
| D185 | None of the three is stored in the game. | So saved games are unaffected and the look is always worked out afresh. | See `ARCHITECTURE.md` section 17. |
| D186 | Your "Workers for buildings" was taken as the go-ahead to build the roadmap's workforce item. I gave the plan in a few lines and built it, stopping at the gate. | You have approved every plan so far without changes and asked me to keep going. | Say "show me the plan and wait" and I will. |
| D187 | The game calls them "staff", not "workers". | "Workers" is already a kind of resident. "You need more workers" would read as "upgrade houses to Workers". | The words are in `src/ui/text.js`, `advice.js`, `panelModel.js` and `index.html`. |
| D188 | A town short of staff works slower, every producer by the same share. Nothing stands idle. The roadmap had said "a sawmill with no free workers stands idle". | Idle buildings need a rule for who gets staff first, and can stop a town dead: no fish, so no residents, so no staff. A shared slowdown is one sentence to explain and always recoverable. | `src/sim/staff.js`. Idling by priority would be a new design. |
| D189 | The town has 12 staff to begin with, and 1 more for every 2 residents of any kind. | The first workshops must run before anyone lives on the island. "One in two residents works" is easy to say. Kinds of resident do not differ, to keep one number. | `workforce` in `data/config.json`. |
| D190 | Staff per building: lumberjack 2, sawmill 3, fisherman 3, farm 4, sheep farm 4, bakery 5, weaver 5. | Chosen with the bot from seven sets. With these a sensible first act is never short and ends with 13 spare, a workshops-first town is held back, and the second act runs short. | `staff` on each building in `data/buildings.json`. |
| D191 | Only producers linked to a warehouse need staff. One that is waiting for grain or for storage room still holds its staff. | The simplest rule that can be read off the map. Releasing staff from waiting buildings would make the number flicker. | `staffing` in `src/sim/staff.js`. |
| D192 | Houses, markets, warehouses and roads need no staff. | Houses are where staff come from. Markets and warehouses stopping would starve the houses, which is the dead end D188 avoids. | Give one a `staff` number; the data check must then allow it. |
| D193 | Only making things is slowed. Upkeep is still paid in full, and eating and taxes are unchanged. | A building you cannot staff should still cost you: that is the pressure to fix it. | Would be a rule change. |
| D194 | Easy and Hard do not change the staff numbers. | Difficulty changes coins, income and tax. A second lever was not asked for. | `difficulties` in `config.json` would need a new setting. |
| D195 | Games saved before this phase still load, and are played under the staff rule from then on. | Your saved game should not be lost to a new feature. | `addedLater` in `config.json` (`ARCHITECTURE.md` section 18). |
| D196 | A game carried forward may be short of staff the moment it loads. It is told so and keeps working. | The other choices were to refuse the save or to exempt old towns for ever. | Would need a per-game switch in the state. |
| D197 | The top bar shows "13 spare" or "10 short", not two numbers. | "102 / 84" has to be worked out. "18 short" does not. The full sum is in the hover text. | `staffText` in `src/ui/text.js`. |
| D198 | A staff shortage is told before any shortage of goods. | A good running out may be caused by it, and the usual advice, "build another fisherman", would make it worse. | `src/ui/advice.js`. |
| D199 | Tips are now shown after the win too, while a goal is still ahead. | They used to stop at the win. That hid the wool and cloth tips of Phase 12, and would have hidden the staff tip exactly where staff matters. I count that as a bug from Phase 12. | One line in `src/ui/gameUi.js`. |
| D200 | No warning mark is drawn on buildings for a staff shortage. | It would put a mark on every workshop at once. The top bar and the tip say it once. | `buildingIssue` in `src/sim/summary.js`. |
| D201 | The first-game guide does not mention staff. | In a sensible first act the rule never bites, and the guide is already 13 steps. | `data/guide.json`. |
| D202 | The bot's build orders were not changed. The Artisans order runs short of staff and does not react. | It shows the rule at work, and still reaches the goal in time. A bot that adds houses when short would be new bot logic. | `tools/bot/orders/`. |
| D203 | A test names the two rules stamps that saved games in the world carry. | So that a change which would refuse every older saved game fails a test and is made on purpose. | `tests/staff.test.js`. |
| D204 | On windows narrower than 1380 px the top bar's spacing is a little tighter. | The staff count made the bar wrap to a second row at 1280 px. | `ui.css`. |
| D205 | Your "Keep going!" after Phase 15 was taken as: build the next thing that needs no choice from you. I chose closing a building, the first leftover of the staff rule. | It finishes what you asked for last, and answers two of that phase's known issues. The larger items on the roadmap each need your say. | Name another item and I will do that instead. |
| D206 | Staff were left as tuned. You did not press "Make staff bite sooner". | No answer is not a yes. | Say so and I will tighten the numbers with the bot. |
| D207 | A closed building makes nothing and needs no staff. Closing and reopening are free and instant. | The point is to let you move staff where you want them. A cost or a delay would punish using it. | `setClosed` in `src/sim/commands.js`. |
| D208 | A closed building still costs its full upkeep. | Otherwise closing would be a free way to dodge upkeep, and demolishing would lose its point. It also needs no new number, so saved games are untouched. | A lower rate would be a new number in `config.json`, listed in `addedLater`. |
| D209 | Work in hand waits inside a closed building. Inputs already taken are not handed back. | Simple, and nothing is lost: the batch finishes on reopening. | `stepProduction` in `src/sim/production.js`. |
| D210 | Only buildings that make things can be closed. | A closed market or warehouse would starve the houses, the dead end that D188 and D192 avoid. | `setClosed`. |
| D211 | The closed mark is stored only on closed buildings, and no data file changed. | So every game saved in Phase 15 loads with no carrying forward, and the rules stamp is unchanged. | `ARCHITECTURE.md` section 19. |
| D212 | The button says "Close for now", and its opposite "Reopen". | "Close" alone reads like closing the panel, which has an × for that. "For now" says it can be undone. | `src/ui/panelModel.js`. |
| D213 | A closed building shows a grey mark with two bars. It is not counted as a problem. | You closed it on purpose. Amber would cry wolf; no mark at all would let you forget it. | `MARK.closed` in `src/render/renderer.js`. |
| D214 | Closing has no shortcut key and no tool in the bottom row. | The row is full at 15 tools, and closing is rare. | `src/ui/buildMenu.js`. |
| D215 | Closing and reopening play the plain click that Undo uses. | I cannot hear, so I did not make a new sound I could not judge. | `QUIET_ACTIONS` in `src/ui/gameUi.js`. |
| D216 | When every building that makes a good is closed, the tip says to reopen it, not to build another. | "Build another fisherman" beside a closed fisherman would be bad advice. | `src/ui/advice.js`. |
| D217 | The bot never closes a building. | Its build orders are fixed lists. It still shows the game can be won without closing anything. | Would be new bot logic. |
| D218 | Your "Keep going" after Phase 16 was taken as: build scenarios. | Everything left on the roadmap needs your say. I had twice named scenarios as the smallest of the three, and you said to carry on. | Name another item and I will do that instead. |
| D219 | A scenario is settings in a data file, applied before the rules are made, like a difficulty. | So the game itself has no special cases, and you can make a scenario by editing one file. | `scenarios` in `data/config.json`. |
| D220 | A scenario cannot be lost. It has medal times instead. | The game has never had a way to lose, and adding one is a new rule you did not ask for. A clock gives a reason to play again. | Losing would be a new rule in `src/sim/win.js`. |
| D221 | Three scenarios: a short gentle one, one about Artisans, and one about staff. | One for each thing the game has that the standard game does not push: a quick win, the second act as the whole game, and staff that matter early. | Add or remove entries under `scenarios`. |
| D222 | Fishing village asks for 120 Farmers. I first tried 60 and 80. | The bot reached 60 in 3 minutes and 80 in 6. 120 takes it 10.5 and needs four markets and a sawmill, so there is something to plan. | `win` in that scenario. |
| D223 | Short-handed has 16 staff to begin with and 1 more for every 4 residents. | Of nine sets tried, smaller first crews left the bot stuck or made the result swing wildly with small changes of timing. With 16 both of the bot's sensible orders win. | `workforce` in that scenario. |
| D224 | Short-handed is my answer to "should staff bite sooner", left open since Phase 15. The standard game was not changed. | You can try a tighter staff rule without it being forced on the game you have been playing. | If you like it, the same numbers can go into the standard game. That would refuse older saved games. |
| D225 | The weavers' guild starts with 1000 coins, 60 wood and 60 planks. | With the standard start the bot took an hour. With 1500 coins it took under ten minutes. This gives about twenty. | `startCoins` and `startGoods` in that scenario. |
| D226 | The weavers' guild can stall if you build only the houses you mean to upgrade. This was left in. | It is the point of the scenario, the staff tip explains it, and four Farmer houses fix it. A test plays the stall and the rescue. | Raise `workforce.base` in that scenario to soften it. |
| D227 | Medal times come from the bot: gold is about a fifth longer than its time. | I cannot know how fast a person plays. The bot with typical human pauses earns gold in all three, and with slow hands earns silver. | `medals` in each scenario. Changing them never affects a saved game. |
| D228 | Scenarios are not played on a difficulty, cannot use a random island, and have no goal after the win. | A medal time only means something if everyone plays the same game. | Would need the title screen to offer the choice. |
| D229 | The best time in each scenario is kept in the browser, apart from any saved game. Only games begun from the title screen count. | It belongs to you, not to one game. The test page and the demo must not write records. | `src/platform/records.js`. |
| D230 | The standard game has no medal and no best time. | You did not ask for it, and the brief's target for it is a range, not a race. | Give the standard game `medals` in the rules. |
| D231 | The first-game guide is not shown in a scenario. | Its thirteen steps follow the standard game and would mislead in the others. | `src/main.js`. |
| D232 | A scenario uses the one save slot, so starting one replaces your saved game after a second press. | One slot has been the rule since Phase 8. | More than one slot is a roadmap item. |
| D233 | A scenario may only set the things listed in the spec. Tax, building costs and the like are not on the list. | A short list is easier to check and to explain. Anything on it is already tested by the bot. | `ALLOWED` in `src/sim/validate.js`, and `withScenario`. |
| D234 | The two new islands are 42 and 2024. | The bot had already won on both in earlier phases. | `seed` in each scenario. |
| D235 | Your "Proceed, do an amazing job!" was taken as approval of Phase 17 and as the go-ahead for the next phase. I chose ships and trade. | Only carriers and trade were left, both needing your say. Trade is the smaller, adds something new to look at, and leaves the rest of the economy as it is. Carriers would rewrite how goods move. | Name the other and I will do that next. |
| D236 | One harbour building and one ship that calls on a fixed clock, with standing orders. Not a ship you send. | Standing orders suit a game you leave running at 4x. A ship to send by hand would need a new kind of screen. | `src/sim/trade.js`. |
| D237 | Fixed prices per good, with buying three to five times dearer than selling. | Prices that move with supply are a second system to learn. The gap keeps the ship a help rather than a money machine. | `trade` on each good in `data/goods.json`. |
| D238 | Prices were set so that no building, selling all it makes, earns more than its staff would pay in taxes as residents. | Otherwise the best play would be to sell rather than to grow, which is not this game. A test checks it for every building. The first prices failed it for wood, now 0.4. | `tests/trade.test.js`. |
| D239 | The ship calls every 2 minutes and carries 30 goods per harbour. | Often enough to matter, rare enough to be an event. 30 a call is about 15 a minute: the output of three or four buildings. | `trade` in `data/config.json`. |
| D240 | The harbour costs 120 coins, 20 wood and 10 planks, with an upkeep of 5. | The first try, 150 coins and 8 upkeep, made a harbour after the first sawmill cost the bot ten minutes. This costs it about two and a half. | `harbor` in `data/buildings.json`. |
| D241 | On each call sales come first, then purchases, and both share the ship's room. | Selling first means a town short of coins can still buy with what it sells. Shared room means a second harbour is worth building. | `stepTrade`. |
| D242 | Goods are traded in the order the top bar lists them. | Simple and visible. A priority you could set would be another control. | `data/goods.json` order. |
| D243 | Orders belong to the island and stay when the last harbour goes. | There is one stockpile. Losing your orders to a misplaced demolish would be annoying. | `setTradeOrder`. |
| D244 | Every good can be traded, including cloth and bread. | Selling cloth or bread after the win is the main use of a harbour in a large town. | Remove `trade` from a good. |
| D245 | The ship cannot bring goods the island cannot make. | Only goods that already exist. A new good would need new needs to mean anything. | Would need new goods and tiers. |
| D246 | The ship is shown: it sails in, ties up and sails away, worked out from the game's own clock. | You liked the figures. A ship you can watch makes the two-minute clock visible without another number. | `src/render/life.js`. |
| D247 | A green line says what each call did, but only when it traded something. | Silent trade is hard to trust. A line every two minutes saying "nothing" would be noise. | `src/ui/gameUi.js`. |
| D248 | The ship makes no sound of its own. | I cannot hear, and did not want to add a sound nobody has checked. | `src/audio/sounds.js`. |
| D249 | The order button goes round Off, Sell, Buy. − and + move the level by 10, up to the storage room. | Three buttons a row fit a narrow panel. A typed number would need a text box. | `tradeRows` in `src/ui/panelModel.js`. |
| D250 | The prices are written short in the panel: "sells 0.4 · buys 2". | The long form, "Sells for 0.4 coins, buys for 2 coins", wrapped and pushed Demolish off the bottom at 800 pixels high. | `tradeRows`. |
| D251 | The tools in the bottom row slimmed again so sixteen fit one row from 1280 to 1920 wide. | The harbour made sixteen, and Undo fell to a second row. | `ui.css`. |
| D252 | The bot's own build orders were not changed. A new order, merchant, builds a harbour. | The standard order is the measure of the game, and it does not need a harbour to win. | `tools/bot/orders/merchant.json`. |
| D253 | Scenarios get the harbour too. | They are the same game with other goals, and nothing in them is harmed by it. | A scenario setting to switch trade off would need adding. |
| D254 | Your "Let's do goods carried along roads by workers" was taken as approval of Phase 18 and as the choice of the next phase. | You chose the next thing without asking for changes, as at earlier gates. | Say so and I will reopen Phase 18. |
| D255 | The game calls them carts. | "Workers" is a kind of resident and "staff" already work inside buildings. | The words are in `src/ui/`. |
| D256 | Only finished goods travel. Materials a workshop uses still come straight from the stockpile, and houses still buy from markets. | The roadmap warned this item could take three sessions. Carrying outputs gives most of the effect, "where you build matters", in one. | Carrying inputs is the obvious next step: a cart from the warehouse to the workshop. |
| D257 | A producer's yard holds 6, a cart carries 4, carts go 2 road tiles a second, and reach 30 road tiles. Each warehouse keeps 3 carts. | With these a sensible town wins within a minute of its time without carts, and workshops 27 tiles away lose about a fifth of their output. | `carts` in `data/config.json` and on the warehouse in `data/buildings.json`. |
| D258 | Each producer is served by its nearest warehouse by road only, not by whichever warehouse has an idle cart. | It makes "build a warehouse near your workshops" true and easy to see. Lending carts between warehouses would hide it. | `stepCarts` in `src/sim/carts.js`. |
| D259 | Idle carts fetch whatever is waiting, the fullest yard first, then the nearest. | I also tried waiting for a full cartload unless a good was running out. It made no difference to most games and cost the bread-first town 7 minutes. | `stepCarts`. |
| D260 | A cart never sets out for goods the stockpile has no room for. If the store fills while it is on the road, it unloads what fits and the rest is lost. | My first version let carts wait at a full warehouse. With wood full, all three carts ended up waiting there with wood, nobody fetched fish, and the bot's town starved. A player could have hit the same trap. Losing a few goods in a rare case is better than a stuck cart. | `stepCarts`. |
| D261 | A building beyond reach still works until its yard is full, then waits. It is marked red, like a building with no road. | Stopping it at once would hide what is wrong; a full yard shows it. | `buildingIssue` in `src/sim/summary.js`. |
| D262 | When a building waits only because the store is full, it says "Storage is full", not "Waiting for a cart". | A second warehouse would not help, and the tip should not suggest one. | `buildingIssue`. |
| D263 | The carts on the map are now the real ones. The carts for show are kept only for data with the cart rule switched off. | A cart you can see should be a cart that exists. | `src/render/life.js`. |
| D264 | The tip for carts that cannot keep up comes after the staff tip and before tips about goods. A building out of reach is named. | Slow carts can be why a good runs short, and the usual "build another fisherman" would not help. | `src/ui/advice.js`. |
| D265 | Goods in a demolished building's yard are lost, as are loads on a demolished warehouse's carts. | Simple, and undo puts them back if it was a mistake. | `removeBuilding` and `cartsLose`. |
| D266 | The test helpers switch carts off unless a test asks for them. | Over 30 tests of other rules count goods the moment they are made. Keeping them as they were keeps each rule tested on its own. Every whole-game test, and 24 new ones, have carts. | `testGame` in `tests/helpers.js`. |
| D267 | One test was loosened: the second act may now sit at zero coins for under half a minute, where it had to be exactly never. | With carts the bot once spends its last coin and waits six seconds for income, while earning over +29 a minute. Never losing money is still checked exactly. | `tests/artisans.test.js`. |
| D268 | The bot's build orders were not changed, and it never builds a second warehouse. | It shows a sensible compact town needs none. That a second warehouse helps a spread-out town is shown by a test on a hand-made island instead. | `tools/bot/orders/`. |
| D269 | The reach of a warehouse is not drawn on the map. | It is a distance by road, not a circle, and drawing it needs a new overlay. The panel says how far each building is. | `src/render/renderer.js`. |
| D270 | Your "Approved and proceed" was taken as approval of Phase 19 and as a go-ahead for the follow-on I had recommended: materials carried too. | It finishes the roadmap item you chose, and it was the first decision I put to you at the gate. | Name another item and I will do that instead. |
| D271 | A workshop keeps a store of 6 of each material and works only from it. | It makes distance matter for workshops as well as producers. A store of 4 was tried: no better overall, and the merchant order lost a minute. | `materials` in `data/config.json`. |
| D272 | One trip does both jobs: materials out, finished goods back. | Separate delivery trips would double the cart traffic for no gain. | `stepCarts` in `src/sim/carts.js`. |
| D273 | A workshop that has run out is served before any other building. | An idle workshop costs more than a fuller yard waiting a little. A test checks the order. | The sort in `stepCarts`. |
| D274 | Materials leave the stockpile when the cart sets out, not when it arrives. | So two carts cannot be promised the same wood. If the workshop is demolished on the way, the cart brings them back. | `stepCarts`, `cartsLose`. |
| D275 | A closed workshop is sent nothing. | It could not use it. | `runOut`. |
| D276 | Carts now load at a producer only what the stockpile has room for, counting carts already on their way home. | It replaces Phase 19's rare loss of goods at a full warehouse with goods simply waiting in the yard. It also helped the weavers' guild's stripped-down town win, slowly (D281). | `spareRoom` in `src/sim/carts.js`. |
| D277 | Cart numbers were not raised (3 carts, carrying 4). | Raising them to 4 carrying 6 rescued the bot's big towns, but then far workshops lost almost nothing and distance stopped mattering. A bigger town should need more warehouses. | `carts` in `data/config.json` and `buildings.json`. |
| D278 | The bot now builds a warehouse where 3 or more buildings wait on carts, beside the worst served, if it can pay at once, at most every 3 minutes. | That is what the tip asks a player to do. Two waiting buildings made it build warehouses all through the first act and broke the bread-first town; waiting to save up for one cost Hard 5 minutes. | `cartsStruggling` in `tools/bot/planner.js`. |
| D279 | The bot builds a warehouse first before placing a workshop more than 24 tiles from every warehouse. | Its second-act towns put farms and fishermen up to 56 road tiles away, beyond reach, which a player would see marked red. 12 to 20 tiles made it build warehouses the first act did not need. | `farFromWarehouses` in `tools/bot/planner.js`. |
| D280 | Four tests were loosened, and the reasons written beside them. | Carts within two minutes of no carts, not one (careless is 1.5 slower), and up to 10 producer-minutes waiting, not 6 (Hard waits 7.5). Hard's second act within 45 minutes of the win, not 40 (it takes 41.3). Buying bread only has to be slower than baking, not 3 minutes slower (it is 1.2 slower). | The tests named, in `tests/`. |
| D281 | The weavers' guild test changed: without Farmer houses the town now wins, short of staff most of the game and too slow for gold, where before it never won. | That is what now happens, and the lesson of the scenario still holds. | `tests/scenarios.test.js`. |
| D282 | The test that a big finished town from before staff keeps its Artisans now lets the bot answer the tips. | Left alone under today's rules it slowly loses Artisans (108 to 99 in 10 minutes). A player who builds the warehouse the tip asks for keeps them all, and gains more. | `tests/staff.test.js`. |
| D283 | Easy may be up to half a minute slower than Normal for the bot, where it had to be no slower. | Found while tuning: in a plank-limited finish, when deliveries land decides a few seconds. With the final numbers Easy is faster again, 28.5 against 28.9, so this was not needed in the end and the test was left as it was. | `tests/difficulty.test.js`. |
| D284 | Your "Let's keep going. Before we start with the second island let's make all the art and design better" became Phase 21, an art and design pass, with no change to rules or balance. | You asked for the look first, and keeping rules out of it means nothing you have already tested changes. | The second island is next. |
| D285 | The ground is shaded in soft patches from smooth noise (9 and 4 tiles across, 13 steps from 0.94 to 1.06), not a random shade per tile. | The random shade made a checkerboard. With 7 coarser steps the patch edges showed as blocks when zoomed in; 13 finer steps hide them. Under 1% of neighbouring tiles now differ by a step the eye picks out, against over 30% before. | `groundShade` in `src/render/art/terrain.js`. |
| D286 | The tile grid shows only while placing a road or a building. | Tiles need counting only then. The rest of the time the grid was clutter. | `grid` in the overlay, set in `src/ui/gameUi.js`. |
| D287 | The grid is drawn as long lines, one per stretch of land along each row of tile edges. | An outline round every tile cost about 14 ms a frame on the whole island, enough to make placing stutter when zoomed out. The lines cost about 1 ms. | `gridLines`. |
| D288 | Foam on all four sides of the shore, a wash line further out, and wet sand on beaches. | Only the two near sides had foam, so half the coast had a hard edge against the water. | `createTerrainPainter`. |
| D289 | Flowers grow in drifts in three colours, with rare bushes and stones on grass. They are only looks and do not stop building. | Even scatter looked like noise; drifts look like a meadow. Blocking building with them would be a rule change. | `createTerrainPainter`. |
| D290 | Building shadows fall to the lower right, longer for taller buildings, with a soft edge round a darker middle. | The old shadow was a faint square under each building and hardly showed. The lower right is away from the light the walls are drawn with. | `renderer.js`. |
| D291 | Every pitched roof is lit at the ridge, laid in rows of tiles with offset joints, and has a dark eave. Walls darken toward the ground. | Flat-coloured roofs were the weakest part of the buildings. It is one function, so every building with a pitched roof gets it, including the warehouse and the workshops. | `gable` and `box` in `src/render/art/kit.js`. |
| D292 | People, carts and boats stay small rectangles, now with arms, a shaded side, round shadows and round wheels. | There can be dozens on screen, so they must stay cheap to draw. | `src/render/art/actors.js`. |
| D293 | The number above a house is smaller and see-through. | A street of houses was a street of dark labels. | `residentsPlate` in `renderer.js`. |
| D294 | At night the light falls on the ground in front of a house, not on the roof. | A glow on the roof looked like the roof was on fire. | `renderer.js`. |
| D295 | The tools come in five groups with a small gap, and the top bar in four with faint lines. | Sixteen tools in an even row were hard to scan. Groups by job make each easier to find. They still fit one row from 1280 to 1920 wide. | `src/ui/buildMenu.js`, `ui.css`. |
| D296 | The names of goods on the top bar show only above 2300 pixels wide, where it was 1640. | At 1920 wide the bar wrapped onto two lines, and had since staff and cloth were added. The icons and numbers stay, and each name shows on hover. | `ui.css`. |
| D297 | The title screen, the building panel and the win screen were left as they were. | They were already tidy. Changing them for the sake of it would cost your familiarity for little gain. | `src/ui/`. |
| D298 | Your "Approve and proceed" approved Phase 21 and started the second island. Your four answers are Q6 to Q9 above. | They were the choices the roadmap said needed your say. | |
| D299 | The second island comes in two phases: the island, its own goods and your ship now (22), the new good in 23. | The new good needs the island, the separate goods and the ship to exist first, and each half is a large change to test on its own. | Say so and Phase 23 is next. |
| D300 | The second island is 44 by 44 tiles, about half the home island's land, and 15 to 20 tiles of sea to the east. | Room for a second town, far enough that it is plainly another island and the crossing takes a while. | `second` in `data/map.json`. |
| D301 | The home island is generated first and never changes because of the second. | So the first game, its balance and every older save stay exactly as they were. A test checks tile for tile. | `withSecondIsland` in `src/sim/mapgen.js`. |
| D302 | Until the second island has a warehouse and a harbour, building there is paid from home. | Otherwise nothing could be built: the ship needs a harbour there, and a harbour needs goods there. | `paysFrom` in `src/sim/islands.js`. |
| D303 | Staff are shared between the islands. | Separate staff would mean the second island needs houses, a market and food before anything works there, before it has any reason to exist. Phase 23 may revisit this. | `src/sim/staff.js` counts every building. |
| D304 | The trade ship calls at the home island only. | One trading stockpile is simpler to understand. The second island's harbour is for your ship. | `countHarbors` in `src/sim/trade.js`. |
| D305 | One ship, which comes with the harbours and costs nothing. | Buying and naming ships is more screens for little gain at this size. | `src/sim/ship.js`. |
| D306 | It carries 30 goods a trip, 0.8 seconds a tile of sea, and waits 10 seconds in each harbour. About 14 seconds a crossing and 50 seconds a round trip. | Close to what a trade ship call carries, and slow enough to watch it sail. I first had 0.4 seconds a tile: a 7-second crossing looked like a ferry. | `fleet` in `data/config.json`. |
| D307 | Orders are per good: stays, takes over, brings home. The ship takes all it can carry, turn about between the goods, and keeps nothing back at home. | Simple to set with one button a good. Keeping a level back is the obvious next step if it empties home of something. | `shipRows` in `src/ui/panelModel.js`. |
| D308 | The orders are set in the second island's harbour panel only. The home harbour panel shows where the ship is. | The home harbour panel already lists the trade orders; two lists of seven goods would not fit 800 pixels high. | `panelModel`. |
| D309 | Goods that do not fit when unloading stay aboard, and come back on the next trip. | Nothing is lost, and the cargo line in the panel shows it. | `arrive` in `src/sim/ship.js`. |
| D310 | A harbour's berth includes the water across one beach tile. | Found in the browser: a harbour need only touch the beach, so one set a tile back had no water beside it and no route. Changing where harbours may go would have changed Phase 18's rules. | `waterBeside` in `src/sim/ship.js`. |
| D311 | The top bar shows the goods of the island in the middle of the screen, outlined in gold with a label below on the second island. | A label inside the bar pushed it onto two lines at 1280 wide. | `src/ui/hud.js`, `ui.css`. |
| D312 | The bot keeps to the home island unless told otherwise. No build order settles the second island yet. | Its planner picked a second-island site for a home harbour when I first tried it. The island has nothing to win yet, so there is no balance to measure until Phase 23. | `createPlanner` in `tools/bot/planner.js`. |
| D313 | Scenarios have the second island too. Their win screens do not mention it. | They are the same map rules. Their goals end at the win, so the island is only there for whoever plays on. | `winMessage` in `src/ui/text.js`. |
| D314 | Your "Ok great, keep going" started Phase 23, the second half of your Q8. | It was the next item on the roadmap, and "keep going" means take the next item. | |
| D315 | The good is wine, from grapes. Vineyards stand only on the second island's fertile land; a winery can stand anywhere. | Like Anno's island fertilities: the island grows what home cannot. A winery anywhere leaves the player a choice of shipping grapes or wine. | `vineyard` and `winery` in `data/buildings.json`. |
| D316 | Grapes and wine cannot be traded. | The trade ship brings nothing the home island cannot make (D245). Otherwise buying wine would skip the island. | Add a `trade` entry in `goods.json`. |
| D317 | **Wine fills Artisan houses rather than being a strict need:** with it a house holds 12, without it 8. | A strict need, with Artisans unable to exist without wine, sank the town's money in every setting I measured: the upgrades that pay for the second act had to wait for the island, and income went below zero. Upgrades now come first, and wine fills the houses. The bot's town cannot reach 100 Artisans without the island (a test checks it), but a player with 13 upgraded houses could. **This softens your Q8 answer; say if you want it strict.** | `capacityWithout` in `data/population.json`. |
| D318 | Wine is wanted only once the second island is open. | So the first game, the scenarios (the weavers' guild goal is Artisans before any win) and older saves before the win are unchanged. A finished town loaded from before goes down to 8 a house until it has wine. | `neededOnceSecondIslandOpens` in `goods.json`. |
| D319 | A house can become Artisan without wine in stock. | It is not needed to live there. | `upgradeReason` in `src/sim/population.js`. |
| D320 | The win brings 700 coins to settle, and a settled second island adds 10 coins a minute. | Without them the second act ran out of money: by minute 60 upkeep was 106 a minute against income of 115. Raising Artisan tax would also have helped, but it would change a number older saves were played under, and they would be refused. These are new settings, so every older save still loads. | `settlers` in `data/config.json`. |
| D321 | Vineyards: a grape every 15 seconds, upkeep 1, staff 2. Winery: upkeep 2, staff 3. Two vineyards keep one winery busy. | The first numbers (upkeep 4 and 6, staff 4 and 5) left the town short of staff, so bread ran out and residents left. | `data/buildings.json`. |
| D322 | The Artisans build order builds a second sawmill, then settles the island at once after the win, ships grapes home, and sells surplus fish and wood. | Planks were the bottleneck for settling: the founding waited 5 minutes for them until the sawmill came first. Settling later left the town paying upkeep with nothing to show. | `tools/bot/orders/artisans.json`. |
| D323 | The bot builds a house when it is under 90% staff with 300 coins to spare, at most every 2 minutes, after the win only. | That is what the tip line asks a player to do. Island 2025 stalled for 48 minutes without it. The first game never meets the condition, so it is unchanged. | `tools/bot/bot.js`. |
| D324 | Four tests' time windows moved: 100 Artisans 25 to 45 minutes after the win, where it was 15 to 30. One income floor went from 10 to 3 a minute. | The second act now includes settling an island, and the income dips while it is settled. | `tests/artisans.test.js`, `carts.test.js`, `materials.test.js`. |
| D325 | The top bar hides the storage limits below 2300 pixels, and the tools slimmed again. | Nine goods and eighteen tools did not fit one row at 1280 wide. | `ui.css`. |
| D326 | The tip line names the second island for vineyards, and tells you to set the ship when a good made only there runs short at home. | The old tip would have said "Build a vineyard" without saying where. | `src/ui/advice.js`. |
| D327 | Your "keep building" became Phase 24: a level your ship keeps back. | It was the known weakness from Phase 22 (the ship could empty home of a good), and the only item left on the roadmap that did not need your say. | |
| D328 | The levels are kept apart from the orders. | Orders saved in Phases 22 and 23 load unchanged; a save without levels keeps nothing back. | `state.ship.keep` in `src/sim/ship.js`. |
| D329 | One level per good, on the island the ship loads it from, in steps of 10 up to that island's storage room. It stays when the order changes direction. | One number a good is easy to read, and the island it applies to follows from the order. | `shipRows` in `src/ui/panelModel.js`. |
| D330 | The bot's Artisans order sets no levels. | Measured: keeping 10 or 20 planks and 40 wood at home changed the second act by under a minute either way on four islands and three difficulties. The bot ships wood and planks only briefly. | `tools/bot/orders/artisans.json`. A build order can now set one: `{ "ship": "wood", "way": "out", "keep": 30 }`. |
| D331 | "keeps 20" sits beside the good's name; where it is kept is said on hover. | Under the stocks it made each row three lines, and the panel scrolled 95 pixels at 800 high. Now 36. | `src/ui/infoPanel.js`. |
| D332 | A test page that starts paused, `?fresh&paused`, and the click-through test stops the clock and says the tick it began at. | Two runs won at 29.52 and 29.35 instead of 28.92: the page's own clock had run a second or so before the script started. Nothing in the rules was wrong. | `src/main.js`, `tools/ui-playthrough.js`. |
| D333 | You chose cart reach on the map for Phase 25 (Q11). | | |
| D334 | Reach is shown on the roads, green or red, only while placing a producer, a warehouse or a road. | Carts follow roads, so a circle on the ground would mislead. Shown all the time it would clutter the map. | `showReach` in `src/ui/gameUi.js`. |
| D335 | The tip gives the distance by the roads already built. | It cannot know the road you will lay next. It is exact for a building placed beside an existing road (a test checks it against the real haul). | `haulIfPlaced` in `src/ui/tools.js`. |
| D336 | The top bar's text is a size smaller below 1460 pixels wide, and half a size more below 1380. | Measured on the demo town, the clock wrapped onto a second line at 1280. In Phase 23 I had measured the bar while it was still empty, because the hidden pane had not drawn yet, so my "fits at 1280" was wrong. | `ui.css`. |
| D337 | When your server on port 5173 stopped, I ran my own on 5174 for my checks, and stopped it after. | Yours was not mine to start or stop. The app's preview launcher would only read its settings from inside your vault's `.obsidian` folder, where I must not write. | |
| D338 | Your "Commit and proceed" started Phase 26 with the wine scenario. | It was the next of the options I offered (Q11), and the one the roadmap named. | Say so and I will take another. |
| D339 | A scenario can open the second island from the start. | Its win is its goal, and the island normally opens only after a win, so a wine scenario could not use the island otherwise. | `secondIslandOpen` in a scenario in `data/config.json`. |
| D340 | The vintners: the standard island, 1500 coins, 80 wood, 80 planks, 60 Artisans to win. | Like the weavers' guild, which players may know, but with the island as the point. | `data/config.json`. |
| D341 | Medals: gold within 45 minutes, silver within 58. | The bot wins in 40.1 at once, 38.6 at a typical pace and 43.7 at a slow one. Gold has 5 minutes to spare for a brisk player; silver has 14 for a slow one. Gold is not too easy by the rule the other scenarios follow. | The medals in the scenario. |
| D342 | The bot's vintners order keeps 30 wood and 20 planks back from the ship. | Shipping everything left home short of planks: 44.5 minutes against 40.1. It shows the keep-back level earning its place. | `tools/bot/orders/vintners.json`. |
| D343 | Your "Keep building" started Phase 27: prices that move. | The next of the options offered at Q11. A way to lose would need your answers first. | Say so and I will take another. |
| D344 | One factor per good moves both its selling and its buying price: 0.005 a unit, between 0.6 and 1.4, the pull halved at each call. | Selling 30 a call settles near 0.7, enough to feel. Moving both prices together, inside those bounds, means buying back always costs more than selling earned: no good can be traded in a circle for profit. A data check enforces it. | `tradePrices` in `data/config.json`. |
| D345 | A call trades at the price it starts with, and the panel shows that price ahead. | My first version showed the pull as it stood, but the call halves it first, so the panel said 0.28 for wood that then sold at 0.34. Found in the browser. | `currentPrice` in `src/sim/trade.js`. |
| D346 | The settings are a new entry, not part of "trade". | Changing "trade" would have made every older save unloadable. | `addedLater` in `data/config.json`. |

# Harborfall: Handoff Guide

Written 2026-11-11 at the end of Phase 7, and brought up to date at the end of Phase 14, by Fable 5.2.

This is the one document to read when you come back to the project, or when you hand it to a new helper, human or AI. It says what exists, how to run and check it, how we worked, and what is still unproven. `ROADMAP.md` says what could come next.

## 1. The project in a minute

- **What it is:** a small Anno-style city builder that runs in a desktop browser. One island, 11 buildings, 7 goods, three kinds of resident. You win at 100 Workers, in about 30 minutes, and can play on to 100 Artisans in about 20 more. The game saves itself.
- **How it is made:** plain JavaScript, with no framework, no build step and nothing to install except Node. All game rules are in five data files. All art is drawn by code.
- **Size:** about 14,400 lines of code, tests and tools. The whole project is 159 files, counting documents and screenshots.
- **State:** Phases 0 to 14 are done. 404 automated tests pass.
- **Where:** the folder `Harborfall` in your Documents, and the private GitHub repository `tokn-millennial/harborfall`, branch `main`.

## 2. What to read, in order

| Document | What it is for | Read it when |
|---|---|---|
| `README.md` (top folder) | The front page: what it is and how to start it. | First. |
| `docs/HANDOFF.md` | This guide. | Coming back, or handing over. |
| `docs/ROADMAP.md` | What could come next, with sizes and the order I recommend. | Choosing the next phase. |
| `docs/BRIEF.md` | Your original brief, word for word. The working rules come from here. | A helper is new to the project. |
| `docs/SPEC.md` | Every rule of the game in plain words, with the data file each number lives in. | You want to know how something works, or tune it. |
| `docs/ARCHITECTURE.md` | How the code is put together, folder by folder, and the test plan. | A helper is about to change code. |
| `docs/DECISIONS.md` | Every choice made, numbered Q1 to Q5 (yours) and D1 to D185 (mine), with the reason and how to change it. | You wonder "why is it like this?" |
| `docs/TESTLOG.md` | Per phase: what was built, tested, broken and fixed, and what is weak. | You want the honest history. |
| `docs/PLAYTEST.md` | The 73-point checklist from Phase 5 and the ranked problem list. | Planning a playtest. |
| `docs/FINAL_REPORT.md` | The scorecard for the original test, as written at the end of Phase 5, with short notes for Phases 6 and 7. | You want the verdict on the original brief. |
| `CLAUDE.md` (top folder) | Standing instructions that an AI helper reads on its own at the start of a session. | You never need to. It is for the helper. |
| `docs/screenshots/` | Pictures from Phases 3 to 14. | You want to see how it looked at each stage. |

## 3. How to run it

1. **Start the game:** double-click `start-game.bat` in the project folder. A black window opens and your browser shows the title screen at `http://localhost:5173`. Pick New game, or Continue if you have played before. Leave the black window open while you play. Close it to stop. Your game is saved in the browser, so closing either window loses nothing.
2. **See a finished town:** open `http://localhost:5173/?demo`.
3. **On a Mac:** double-click `start-game.command`. This has never been tested.

The game needs Node installed (it was built and tested with version 24). It does not work by double-clicking `index.html`, because browsers refuse to load this kind of code straight from a file.

## 4. How to check it still works

These are typed in a terminal opened in the project folder. A helper runs them for you. You do not need to.

| Command | What it does | A good result |
|---|---|---|
| `node --test` | Runs all 404 automated tests. A few seconds. | `pass 404`, `fail 0` |
| `node tools/bot.mjs` | A bot plays a whole game with no screen and prints a report. | Wins in 28.6 minutes, no long waits. |
| `node tools/bot.mjs careless` | The same, with a sloppier build order. | Wins in 30.4 minutes. |
| `node tools/bot.mjs bread-first` | The same, with a reckless opening. | Wins in 52.9 minutes. Slower than the target, which is a known open issue. The point is that it recovers. |
| `node tools/bot.mjs standard --seed 42` | The standard order on a different island. | Wins in 25.9 minutes. |
| `node tools/bot.mjs artisans` | Plays past the win to the goal after it. | Wins at 28.6 minutes, then 100 Artisans at 49.8. |
| `node tools/bot.mjs standard --difficulty hard` | The standard order on Hard. Also `easy`. | Wins in 36.9 minutes. |
| `node tools/pace.mjs` | Estimates how long a person takes, by adding human delays. | All games inside 25 to 40 minutes. |
| `node tools/tune.mjs` | Tries changed numbers side by side without editing the data files. | A table to compare. |
| `node tools/print-map.mjs` | Prints the island as text. | A map. |

Two more checks run inside the browser. Open the test page `http://localhost:5173/?fresh`, which starts a new game with no title screen and never saves, so the checks cannot harm your saved game. Press F12, click Console, and paste:

- **A whole game through the real buttons and clicks.** Reload the test page first. The result should show `won: true` at about 28.6 minutes.

  `const { playThroughUi } = await import('/tools/ui-playthrough.js'); await playThroughUi(window.harborfall);`

- **Thousands of random clicks and keys.** It should report no errors.

  `const { monkey } = await import('/tools/ui-monkey.js'); monkey(window.harborfall, { actions: 5000, seed: 1 });`

**The rule we kept:** after any change, the tests pass and the bot still wins before anything is called done. After any change to a screen, the two browser checks are run again.

## 5. Changing the game without touching code

Every number is in a file in the `data` folder. Open one in any text editor, change a number, save, and refresh the browser. Lines whose name starts with `_` are notes.

| To change | File | Look for |
|---|---|---|
| Starting coins and goods | `config.json` | `start` |
| How many Workers win the game | `config.json` | `win` → `residents` |
| The income you get with no residents | `config.json` | `baseIncomePerMinute` |
| What a building costs | `buildings.json` | that building's `cost` |
| A building's running cost | `buildings.json` | `upkeepPerMinute` |
| How fast a building works | `buildings.json` | `production` → `cycleSeconds` |
| What a building uses and makes | `buildings.json` | `production` → `inputs` and `outputs` |
| How far a market reaches | `buildings.json` | the market's `market` entry |
| A building's shortcut key | `buildings.json` | `key` |
| Taxes, house sizes, what residents eat | `population.json` | each tier's `taxPerResidentPerMinute`, `capacity`, `needs` |
| The cost of upgrading a house | `population.json` | `upgrade` → `cost` |
| The island's shape | `map.json` | `seed`. Any whole number gives a different island. |
| How long Undo works | `config.json` | `undoSeconds`. Safe to change with a game saved. |
| The goal after the win | `config.json` | `milestones` |
| What Easy and Hard change | `config.json` | `difficulties`. Changing Easy or Hard affects only saved games on that difficulty. Normal changes nothing by design: leave it empty. |
| What a house needs to become an Artisan house | `population.json` | the Worker tier's `upgrade`, and the Artisan tier's `needs` |
| The steps of the first-game guide | `guide.json` | `steps`. Safe to change with a game saved. A mistake here hides the guide and is reported in the browser's console. |
| Colors of ground, roofs and goods | `map.json`, `buildings.json`, `population.json`, `goods.json` | `color` |

**A saved game stops working when you change a rule.** Change a cost or a speed while a game is saved, and the title screen will say that game cannot be continued. Change the number back and it can. Names, colors, shortcut keys and notes are safe to change.

**After changing numbers, run `node --test` and `node tools/bot.mjs`**, or ask a helper to. Some tests check the balance targets from the brief (for example "one fisherman feeds about 20 residents"), so a big change can fail a test on purpose. That is the test doing its job. Decide whether the number or the target should move.

**Adding a building or a good** can be done in the data files alone. In Phase 5 a "Stone" good and a "Quarry" were added to `goods.json` and `buildings.json` with no code change, and the quarry appeared in the menu and worked. A building with no drawing shows as a plain colored box until someone adds one in `src/render/art/buildings.js`.

**If the game shows an error after an edit,** the data file probably has a typo, most often a missing comma or quote. The game shows a box that says it could not start and why. Undo the edit to recover.

## 6. How we worked

These rules came from your brief (`BRIEF.md`) and held for seven phases. A new helper should keep them unless you say otherwise.

1. **Plan first.** The helper shows a plan before writing code.
2. **One feature at a time,** tested after every change.
3. **Small scope.** Nothing is added that you did not ask for. Where "art" or "polish" needed judgment, each unlisted extra was named in `DECISIONS.md` and in the gate report.
4. **The helper finds its own bugs,** using the tests and the bot, and tests the game itself before reporting.
5. **Questions only at the start of a phase.** After that the helper makes a reasonable choice and records it in `DECISIONS.md` with the reason and how to change it.
6. **Rules live in data files,** not in code.
7. **A log entry per phase** in `TESTLOG.md`: turns used, bugs found and fixed, decisions made, what is weak, what the helper would change.
8. **Plain words.** You are not asked to read code.
9. **Honesty.** What is weak, unfinished or untested is said plainly. A result that looks too good is checked before it is reported.

**Phases and gates.** Work goes in phases. At the end of each one the helper stops and gives a report in five parts, then waits:

1. What you built.
2. Test results, with pass and fail counts.
3. How to try it: three steps in the browser.
4. Known issues.
5. Decisions I need to make.

**Saving the work.** One commit per approved phase, made only after you approve. Pushed to GitHub only when you say "push". (In the last two phases you said "push" at the gate, which was taken as approval.)

## 7. Starting a new session with an AI helper

Open the helper in the `Harborfall` folder, so it can see the files. The file `CLAUDE.md` in that folder gives it the standing rules without you repeating them. Then paste something like this, with the last line changed to what you want:

> This is Harborfall, a small city builder I am building with AI help. I am new to game development and I do not read code.
>
> Before doing anything, read `docs/HANDOFF.md`, `docs/ROADMAP.md` and `docs/BRIEF.md`, then run `node --test` and `node tools/bot.mjs` and tell me whether the project is in the state the handoff describes.
>
> Follow the working rules in `docs/HANDOFF.md` section 6. Show me a plan first and wait for my approval. Stop at the end of the phase with the five-part report.
>
> This phase: (for example) build B1 and B2 from the roadmap.

If the helper starts in a different folder, tell it the project is in `Documents\Harborfall` and that it must not write project files anywhere else.

## 8. What is proven and what is not

| Claim | Status | Evidence |
|---|---|---|
| The rules work as the spec says | **Proven** | 404 automated tests. |
| A saved game comes back exactly | **Proven** | Saved, loaded and played-on games end identical to never-saved ones, in tests and in the browser. |
| The game cannot leave you permanently stuck | **Proven** for the cases tested | Tests for zero coins, and bot wins from three bad openings. |
| A win takes 25 to 40 minutes | **Proven for a bot,** estimated for a person | Bot: 28.6 minutes. With guessed human delays: 29 to 35. |
| Every button and click does what it should | **Strong evidence** | A script won through the real UI and ended in exactly the bot's game. Random input found no errors. |
| A person can play it by hand | **Confirmed by you** | You played for about 40 minutes on 2026-11-12. You have not said whether you won or how long a win took. |
| It is fun and clear | **Unknown** | No script can tell. |
| It runs smoothly on your screen | **Confirmed by you** | You said so on 2026-11-13, after 40 minutes of play. I cannot measure it: my test browser draws slowly. |
| The figures move naturally | **Confirmed by you** | "Fairly smooth", 2026-11-13. I have only seen stills. |
| The second act (to 100 Artisans) is balanced | **Proven for a bot** | About 21 minutes after the win, on four islands, by one build order. No person has played it. |
| A game saved before Phase 12 still loads | **Proven** | In tests, and in the browser with a save carrying the old rules stamp. |
| Every difficulty can be won | **Proven for a bot** | Two sensible build orders win on all three. On Hard a reckless opening needs a demolish to recover. |
| Dust, smoke and night look right in motion | **Unknown** | I have seen them only in still screenshots. |
| The first-game guide helps a new player | **Unknown** | The steps are my guess. Nobody new to the game has tried it. |
| It works on a Mac, a trackpad, a touch screen | **Unknown** | Never tried. |
| The art looks good | **My opinion only** | Judged from still screenshots. |
| The sounds are pleasant | **Unknown** | I cannot hear. The sounds were designed from numbers and measured, never listened to. |

**A note sheet for a hand-played game** (roadmap item A1). Copy it, fill it in, and give it to the helper:

> - Time to win, as shown on the win screen:
> - Speed I mostly played at (1x, 2x, 4x):
> - The first thing that confused me:
> - Times I did not know what to do next:
> - Times I waited with nothing to do, and roughly how long:
> - Anything that looked wrong or ugly:
> - Did it stutter or feel slow? At what zoom?
> - What I wanted to do and could not:
> - Browser and computer:

## 9. Known issues, all in one place

Open today. Fixed problems are in `TESTLOG.md` and `PLAYTEST.md`.

**Play**
- One saved game, in one browser. It does not follow you to another browser or computer, and there is no file to back up.
- Changing a rule in the data files makes a saved game unusable until it is changed back.
- Two tabs open on the game overwrite each other's save.
- A continued game starts at 1x with no tool picked.
- Undo takes back only your last action, and only for 30 seconds of game time.
- After 100 Artisans there are no more goals.
- The second act is the first act with one more need. It adds length, not a new idea.
- A reckless opening still wins, but takes over 50 minutes.
- Roads bend once per drag. Shift flips the corner.
- The first-game guide is ten fixed steps. It does not adapt to how you play, and no first-time player has tried it.
- Some shortcut letters are arbitrary (I for Sawmill, E for Warehouse, G for Farm), because W A S D and C move the view.
- Nobody has listened to the sounds. They are simple tones made by code, with a sea in the background and no music.
- The town itself is silent. Sounds come only when you act.

**Look and speed**
- The art is drawn by code. It is clean and consistent, and it is not painted art.
- Night is a plain tint with a soft light at each house. It can be switched off in the ? panel.
- The people, carts and boats are for show. Walkers wander with no errand, figures pass through each other, and a cart is a picture of a delivery that has already happened.
- A frame takes 20 to 28 ms in my test browser, which is not smooth. The cost grows with the number of buildings on screen.
- Zoomed far in, the ground sharpens a moment after you stop moving the view. That costs one slow frame each time.
- On Hard, a reckless opening (farms and a bakery before any house) strands the town until something is demolished.
- Easy does not make a good build order faster. It forgives a bad one.
- The game uses about 90 MB more memory than before the art.
- Top bar icons are small. Names show on wide windows and on hover. Under 1460 pixels wide the storage limit is not shown: a good at its limit turns amber.

**Design limits chosen on purpose** (`ARCHITECTURE.md` section 9)
- Goods move instantly. Roads are a yes-or-no connection.
- All warehouses share one stockpile.
- Older houses are fed first.
- Forest never runs out.

**Testing**
- The two browser checks are run by hand from the console.
- Desktop browsers only. No touch support.

## 10. Things a helper should know about this computer

- **Test on `?fresh` and `?demo`,** which never save. A helper that tests on the plain address will overwrite the saved game.
- **A game server is often already running** on port 5173, started by you from `start-game.bat`. A helper should use it and never stop it.
- **Windows shell quoting is fragile.** Commands with apostrophes or nested quotes get mangled. Write a small script file and run that.
- **An AI helper's built-in test browser may be slow or hidden,** drawing about one frame a second. Timing and smoothness cannot be judged there. Speed must be measured by forcing the browser to finish drawing. A timing that looks too good is probably measuring nothing (`TESTLOG.md`, Phase 7).
- **The GitHub command-line tool is not installed.** Ordinary `git push` works, using the sign-in Windows has saved.
- **The repository is private, and should stay so until cleaned.** The documents contain your first name and folder paths, and the commit history carries the name and email your Git uses. See roadmap item E1 before publishing anything.

## 11. Words used in these documents

| Word | Meaning |
|---|---|
| Simulation | The part of the code that is the game's rules. It has no screen. |
| Renderer | The part that draws the island. It only looks at the game and never changes it. |
| UI | Menus, the top bar, mouse and keyboard. |
| Headless | Running the game with no screen, as the tests and the bot do. |
| Tick | One step of game time. There are 10 a second. |
| Bot | A script that plays a whole game by following a fixed build order. |
| Build order | The bot's to-do list, such as "2 lumberjacks, a market, 6 houses". |
| Seed | The number an island is grown from. The same seed always gives the same island. |
| Data files | The files in `data/`. Five hold every rule and number. A sixth, `guide.json`, holds the steps of the first-game guide. |
| Gate | The end of a phase, where the helper stops, reports and waits for you. |
| Commit | A saved snapshot of the whole project, with a note. One per phase. |
| Push | Sending commits to GitHub. |
| Repository | The project folder together with its saved history. |
| Dependency | Someone else's code that a project needs. This game has none. |

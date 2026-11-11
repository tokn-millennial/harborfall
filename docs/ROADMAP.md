# Harborfall: Roadmap

Written 2026-11-11, at the end of Phase 7, by Fable 5.2.

This is a list of what could come next, in the order I would do it. **Nothing here is decided.** Every item is a proposal, and you choose. The working rule from the brief still stands: nothing gets built that you did not ask for.

Read `HANDOFF.md` first if you are picking the project up after a break.

## Where the project stands

- **Done:** the whole Version 1 slice from the brief (Phases 0 to 5), a polish pass (Phase 6), and drawn art with a new theme (Phase 7).
- **Proven by machines:** 236 automated tests pass. A bot wins in 28.6 minutes. A script wins through the real UI and ends in exactly the bot's game.
- **Not proven by a person:** nobody has told me how a hand-played game went, how smooth it is on a real screen, or how it works on a Mac.

That last line shapes the order below. The cheapest and most useful next step is an hour of your own play.

## How to read the sizes

Each phase so far took one long working session. The sizes compare with that.

| Size | Meaning |
|---|---|
| Small | Part of one session. Could be bundled with another small item. |
| Medium | One full session, like Phase 6. |
| Large | Two or three sessions, with a gate between them. It changes rules, so the bot and the balance must be redone. |

## My recommended order

| Phase | What | Size | Why here |
|---|---|---|---|
| 8 | Play it and fix what you find (A1, A2, A3) | Small to medium | Everything after this builds on a game nobody has played by hand. |
| 9 | Save and load, title screen, new-island choice (B1, B2) | Medium | A 30 minute game that is lost on a refresh is hard to enjoy or to test. |
| 10 | Life on the map (C1) | Medium | The biggest gain in feel for no change in rules. |
| 11 | Sound (C2) | Medium | Same reason. Needs a decision from you first. |
| 12 | A guided first game and undo (B3, B4) | Medium | Best done after you have watched someone new play. |
| 13 onward | More game: a third tier, then workforce or carriers (Stage D) | Large each | Only worth doing once the small game feels good. |
| Any time | Put it online (E1) | Small | Independent of the rest. Read the privacy note there first. |

---

## Stage A: Close the open questions

### A1. Play a full game by hand and tell me how it went
- **What you do:** play from a fresh start to the win, once. Note the time, and anything that confused, bored or annoyed you. `HANDOFF.md` section 8 has a short note sheet.
- **What I do:** turn your notes into a ranked fix list, as in Phase 5, and fix the top ones.
- **Why:** the one item on the final scorecard that is passed "on your word" is "I can win by hand". All of my time estimates are guesses.
- **Size:** small for you, small to medium for the fixes.

### A2. Check drawing speed on your screen, and fix the two known soft spots
- **Known:** at zoom 0.7 a frame takes longer than it did with the old boxes, in my test browser. Zoomed far in, the ground looks a little soft.
- **Unknown:** whether either matters on a real graphics card. My test browser is slow and I never saw the game move at full speed.
- **Likely fixes:** a third, middle-sized ground picture for the 0.6 to 0.9 zoom range, and a finer large picture or direct drawing of only the tiles in view when zoomed far in.
- **Size:** small.

### A3. Try it on a Mac
- The game is written to work on a Mac and has never been run on one. `start-game.command` is untested. Titles will use a slightly different font.
- **Needs:** a Mac. If you do not have one, this stays open.
- **Size:** small.

---

## Stage B: Make it a game you can come back to

### B1. Save and load
- **What you get:** the game saves itself in the browser every minute or so, and offers "Continue" when you come back. Optionally a file you can download and load.
- **Why it is cheap:** the whole game state is already plain data that can be written out as text. That was a design goal from Phase 0.
- **Design notes:** a save needs a version stamp and the island seed. If the data files change after a save, the save may no longer make sense, so loading must check and refuse cleanly. The simulation must not touch browser storage. Saving belongs in `src/platform/`.
- **Tests:** save, load, and play on must end in the same game as never saving at all.
- **Size:** small to medium.

### B2. Title screen and island choice
- **What you get:** a start screen with New game, Continue and the demo town. New game can keep the standard island or roll a random one.
- **Why it is cheap:** the island already comes from one seed number in `data/map.json`, and the bot already wins on a dozen other seeds.
- **Risk:** a random island may be harder or easier. The map generator guarantees enough forest, fertile land and coast, and a test checks it, but balance was tuned on seed 1407.
- **Size:** small.

### B3. Undo
- **What you get:** undo the last build or demolish, with a full refund, for a short time.
- **Design notes:** the simple version keeps a copy of the state from before the last command and restores it, with the clock kept running. Decide whether undo is allowed after time has passed.
- **Size:** small to medium.

### B4. A guided first game
- **What you get:** a short list of goals in a corner, ticked off as you go: build a lumberjack, connect it by road, build a fisherman, a market, four houses, and so on.
- **Why wait:** the tip line already covers shortages. A guide should be written from what a real new player gets stuck on, which is what A1 finds out.
- **Design notes:** the goal list belongs in a data file. The checks read the game's summary and change nothing.
- **Size:** medium.

---

## Stage C: Make it feel alive

### C1. People, carts and boats on the map
- **What you get:** small figures walking the roads, carts between producers and the warehouse, a fishing boat off each fisherman's hut.
- **Important:** this is decoration only. Goods would still move instantly, as they do now. The figures would be drawn by the renderer from what the simulation already reports, and the rules, the bot and the balance would not change.
- **Do not confuse with D3**, which makes carriers real and changes the game.
- **Size:** medium.

### C2. Sound
- **What you get:** clicks and a thump when you build, a chime on an upgrade, waves and birds in the background, perhaps music.
- **Decision you must make first:** where the sounds come from.
  - *Made by code:* simple tones and noise shaped in the browser. No files, fits the "no dependencies" rule, sounds basic.
  - *Sound files:* far better, but someone must make or license them, and they add downloads to the game.
- **Also needs:** a mute button and a volume setting that are remembered.
- **Size:** medium.

### C3. A second art pass
- Ideas, none of them urgent: two or three variants of each house so a town looks less uniform, a building-site look for the first seconds after placing, smoke from house chimneys, a day and night tint.
- **Bigger decision:** whether to keep code-drawn art or bring in painted pictures. The drawings are swappable one building at a time (decision D78).
- **Size:** small to medium for the ideas. Painted art depends on who makes it.

---

## Stage D: More game

Every item here changes the rules. Each one needs new data, new tests, a new bot build order, and a fresh balance pass with the bot. That is why they are large.

### D1. A third population tier and one or two new production chains
- **What you get:** a reason to keep playing past 100 Workers. For example a third tier that needs a new good made from a new farm and a new workshop.
- **Why it is the cheapest "more game":** tiers, needs, goods and buildings are all data. In Phase 5 a new good and a new building were added by editing two data files with no code change. The upgrade path, the win target and the drawings would need work.
- **Decisions you must make:** what the tier is called, what it needs, and whether the win moves.
- **Known limit:** the bot cannot place buildings larger than 2 by 2.
- **Size:** large.

### D2. Workforce
- **What you get:** buildings need workers, so population matters for more than taxes. A sawmill with no free workers stands idle.
- **Effect:** changes the whole economy curve. The balance targets from the brief would need restating.
- **Size:** medium to large.

### D3. Real logistics: carriers and warehouse range
- **What you get:** goods are carried along roads, warehouses serve an area, and where you build starts to matter the way it does in the Anno games.
- **Honest warning:** this is the largest change on the list. Today roads are a yes-or-no connection and all goods sit in one shared stockpile (`ARCHITECTURE.md` section 9). Carriers replace both ideas. Expect most production and storage tests to be rewritten.
- **Size:** large, probably three sessions.

### D4. Ships, trade and a second island
- **What you get:** sell surplus, buy what the island lacks, settle a second island with different land.
- **Depends on:** D3 in spirit, and save and load in practice, because games get long.
- **Size:** large.

### D5. Difficulty settings and scenarios
- **What you get:** Easy, Normal and Hard as different starting coins and tax rates, or scenarios with their own goals.
- **Why it is cheap:** it is almost all data. The bot can check that each setting is winnable.
- **Size:** small for difficulty, medium for scenarios.

---

## Stage E: Share it

### E1. Put it online
- **Why it is easy:** the game is plain files with no build step. Any ordinary web host can serve the folder as it is.
- **Options:** GitHub Pages, itch.io (upload a zip of the folder), Netlify, Cloudflare Pages.
- **Privacy note, read before making anything public:** the repository is private today. The documents contain your first name and folder paths from your computer, and the commit history carries the name and email your Git is set up with. GitHub Pages on a free account needs a public repository. If you want the game public and the history private, upload only the game files to itch.io, or publish from a separate clean copy.
- **Size:** small.

### E2. Touch and tablet controls
- Pinch to zoom, drag to pan, tap to build, and bigger buttons. The brief targeted desktop only.
- **Size:** medium.

### E3. Move to a real game engine
- **Keep:** the rules, the data files and the tests, as the definition of the game.
- **Rebuild:** drawing and menus.
- **Honest warning:** the simulation is JavaScript. Most engines use another language (Godot uses GDScript or C#, Unity uses C#). The simulation would be rewritten line by line, with the 236 tests as the checklist. It was written with no browser features to make that possible, but it is still real work.
- **Size:** large.

---

## Upkeep to do along the way

These are not features. They are debts and loose ends, smallest first.

| Item | Detail |
|---|---|
| Bad openings recover slowly | A reckless start still wins but takes over 50 minutes. Open since Phase 5. A larger safety-net income early on would ease it. Data only. |
| Roads bend once per drag | Shift flips the corner. A drag that follows the pointer's path would be nicer. |
| Older houses eat first | Simple and predictable, not fair. Matters more once there are more needs. |
| Browser checks are run by hand | The UI playthrough and the random-input test are pasted into the browser console. Running them automatically needs a browser-driving tool such as Playwright. That would be the project's first dependency, used for testing only and never shipped with the game. Your call. |
| The bot plays one fixed style | Good for finding balance problems, weak at finding confusing design. A second bot that plays badly on purpose would widen the net. |
| Memory use of the ground pictures | About 90 MB on a sharp screen. Fine on a desktop, worth a look before any tablet work. |

## How to ask for the next phase

One line is enough. For example:

> Phase 8: I played a full game. It took 41 minutes. Notes: (your notes). Plan the fixes and show me the plan first.

or

> Phase 9: build B1 and B2 from the roadmap. Show me the plan first.

The helper should then follow the working rules in `HANDOFF.md` section 6: plan first, one feature at a time, test everything itself, stop at the gate with the five-part report, and commit only after you approve.

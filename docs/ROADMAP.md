# Harborfall: Roadmap

Written 2026-11-11 at the end of Phase 7, and brought up to date at the end of Phase 30. Phases 0 to 17 by Claude Fable 5.2; Phases 18 to 30 by Claude Opus 5.5.

This is a list of what could come next, in the order I would do it. **Nothing here is decided.** Every item is a proposal, and you choose. The working rule from the brief still stands: nothing gets built that you did not ask for.

Read `HANDOFF.md` first if you are picking the project up after a break.

## Where the project stands

- **Done:** the whole Version 1 slice from the brief (Phases 0 to 5), a polish pass (Phase 6), drawn art with a new theme (Phase 7), saving, a title screen and a choice of island (Phase 8), people, carts and boats on the map (Phase 9), sound (Phase 10), undo with a first-game guide (Phase 11), a third kind of resident with a goal after the win (Phase 12), difficulty settings with two touches to the look (Phase 13), dust, chimney smoke and day and night (Phase 14), staff for buildings (Phase 15), closing a building for now (Phase 16), three scenarios with medals (Phase 17), a harbour with a trade ship (Phase 18), carts that carry goods by road (Phase 19), materials carried to workshops (Phase 20), an art and design pass (Phase 21), a second island with your own ship (Phase 22), grapes and wine from that island (Phase 23), a level your ship keeps back (Phase 24), cart reach shown while placing (Phase 25), a fourth scenario, the vintners (Phase 26), trade prices that move (Phase 27), a best time with an island number box (Phase 28), rounded ground, smooth roads and varied houses (Phase 29), and natural forests and meadows (Phase 30).
- **Proven by machines:** 619 automated tests pass. A bot wins in 28.9 minutes. A script wins through the real UI and ends in exactly the bot's game.
- **Checked by you:** you played for about 40 minutes on 2026-11-12. The game runs smoothly and the figures move well.
- **Still not known:** whether you won and how long it took, how the sounds are, whether the guide helps someone new, and how any of it works on a Mac.

A few notes from your play would now help more than any single feature: what confused you, what you waited for, and what the sounds are like.

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
| 8 | **Done.** Save and load, title screen, island choice (B1, B2), and the drawing speed fix from A2 | Medium | A 30 minute game that was lost on a refresh was hard to enjoy or to test. |
| Next | Your notes from playing (A1), and a Mac test (A3) | Small | You have played. What I am missing is what you thought: the time to win, what confused you, how it sounds. |
| 9 | **Done.** Life on the map (C1) | Medium | The biggest gain in feel for no change in rules. |
| 10 | **Done, unheard.** Sound (C2) | Medium | Made by code, because you had not chosen. Nobody has listened to it yet. |
| 11 | **Done.** Undo and a guided first game (B3, B4) | Medium | The guide is my best guess at what a new player needs. Nobody new has tried it. |
| 12 | **Done.** A third kind of resident and a goal after the win (D1) | Large | It turned out smaller than feared, because the data files already allowed it. |
| 13 | **Done.** Small polish: difficulty, house variety, a sharp ground up close (D5, part of C3, the rest of A2) | Small | You chose it. |
| 14 | **Done.** Dust, chimney smoke, day and night (the rest of C3) | Small | The last of the changes that touch only how the game looks. |
| 15 | **Done, unplayed.** Staff for buildings (D2) | Medium | You chose it. Buildings need staff, staff come from residents, and a town that is short works slower. |
| 16 | **Done, unplayed.** Close a building for now, to free its staff (a leftover of D2) | Small | The next thing that needed no choice from you. |
| 17 | **Done, unplayed.** Three scenarios with medal times (the rest of D5) | Medium | The smallest of what was left. |
| 18 | **Done, unplayed.** A harbour and a trade ship (most of D4) | Large | You said to proceed. The smaller of the two left. |
| 19 | **Done, unplayed.** Carts carry finished goods by road to the warehouses (most of D3) | Large | You chose it. |
| 20 | **Done, unplayed.** Materials carried to workshops (the rest of D3) | Large | The follow-on I recommended. |
| 21 | **Done, unplayed.** An art and design pass | Medium | You asked for it before the second island. |
| 22 | **Done, unplayed.** A second island, each island's own goods, and your own ship (most of the rest of D4) | Large | You chose it, and answered four questions about it (Q6 to Q9). |
| 23 | **Done, unplayed.** Grapes and wine from the second island, which fill Artisan houses | Large | The second half of your Q8. |
| 24 | **Done, unplayed.** A level your ship keeps back | Small | The known weakness from Phase 22. |
| 25 | **Done, unplayed.** Cart reach shown while placing (the rest of D3) | Small | You chose it (Q11). |
| 26 | **Done, unplayed.** The vintners, a fourth scenario (part of D5) | Small | The next of the options offered at Q11. |
| 27 | **Done, unplayed.** Trade prices that move (part of D4) | Medium | The next of the options offered at Q11. |
| 28 | **Done, unplayed.** Your best time on the standard island, and a box for an island number (leftovers of B2 and D5) | Small | Needed no choice from you. |
| 29 | **Done, unplayed.** A second art pass: rounded ground, smooth roads, four house looks | Medium | You asked: "Improve the art more". |
| 30 | **Done, unplayed.** A third art pass: forests and meadows | Small | You asked: "Make the art even better". |
| 31 onward | Your notes from playing, or the rest of the list below | | What is left needs your say, and the game most needs a person to play it. |
| Any time | Put it online (E1) | Small | Independent of the rest. Read the privacy note there first. |

---

## Stage A: Close the open questions

### A1. Play a full game by hand and tell me how it went (partly done)
- **Done:** you played for about 40 minutes on 2026-11-12 and said it runs smoothly and the figures move well.
- **Still wanted:** whether you won, the time on the win screen, anything that confused or annoyed you, and how the sounds are.
- **What you do:** play from a fresh start to the win, once. Note the time, and anything that confused, bored or annoyed you. `HANDOFF.md` section 8 has a short note sheet.
- **What I do:** turn your notes into a ranked fix list, as in Phase 5, and fix the top ones.
- **Why:** the one item on the final scorecard that is passed "on your word" is "I can win by hand". All of my time estimates are guesses.
- **Size:** small for you, small to medium for the fixes.

### A2. Check drawing speed on your screen (partly done in Phase 8)
- **Done:** the slow zoom levels were traced to a smoothing setting and fixed. Frame time there halved in my test browser and is now even across all zoom levels. The middle-sized ground picture I proposed here was measured first, made no difference, and was not built.
- **Confirmed by you on 2026-11-13:** the game runs smoothly on your screen.
- **Done in Phase 13:** the ground is redrawn sharp when zoomed far in, once the view stops.
- **If speed is ever a problem on your screen, the next places to look are the roads (drawn shape by shape every frame, about 3.5 ms) and the trees beside buildings (about 3 ms).
- **Size:** small.

### A3. Try it on a Mac
- The game is written to work on a Mac and has never been run on one. `start-game.command` is untested. Titles will use a slightly different font.
- **Needs:** a Mac. If you do not have one, this stays open.
- **Size:** small.

---

## Stage B: Make it a game you can come back to

### B1. Save and load (done in Phase 8)
- **Left over:** more than one saved game, a save file to download, and saves that survive a change to the data files. None is planned.
- **What you got:** the game saves itself in the browser every minute or so, and offers "Continue" when you come back. Optionally a file you can download and load.
- **Why it is cheap:** the whole game state is already plain data that can be written out as text. That was a design goal from Phase 0.
- **Design notes:** a save needs a version stamp and the island seed. If the data files change after a save, the save may no longer make sense, so loading must check and refuse cleanly. The simulation must not touch browser storage. Saving belongs in `src/platform/`.
- **Tests:** save, load, and play on must end in the same game as never saving at all.
- **Size:** small to medium.

### B2. Title screen and island choice (done in Phase 8)
- **Done since:** a box to type an island number into (Phase 28).
- **What you got:** a start screen with New game, Continue and the demo town. New game can keep the standard island or roll a random one.
- **Why it is cheap:** the island already comes from one seed number in `data/map.json`, and the bot already wins on a dozen other seeds.
- **Risk:** a random island may be harder or easier. The map generator guarantees enough forest, fertile land and coast, and a test checks it, but balance was tuned on seed 1407.
- **Size:** small.

### B3. Undo (done in Phase 11)
- **Left over:** undoing more than the last action, and redo. Neither is planned.
- **What you get:** undo the last build or demolish, with a full refund, for a short time.
- **Design notes:** the simple version keeps a copy of the state from before the last command and restores it, with the clock kept running. Decide whether undo is allowed after time has passed.
- **Size:** small to medium.

### B4. A guided first game (done in Phase 11)
- **Left over:** a guide that adapts to what you are doing, arrows that point at the map, and a try-out with someone who has never played.
- **What you get:** a short list of goals in a corner, ticked off as you go: build a lumberjack, connect it by road, build a fisherman, a market, four houses, and so on.
- **Why wait:** the tip line already covers shortages. A guide should be written from what a real new player gets stuck on, which is what A1 finds out.
- **Design notes:** the goal list belongs in a data file. The checks read the game's summary and change nothing.
- **Size:** medium.

---

## Stage C: Make it feel alive

### C1. People, carts and boats on the map (done in Phase 9)
- **Left over:** walkers with real errands, carts that bring inputs as well as take goods away, figures that avoid each other, and better-drawn figures. None is planned.
- **What you get:** small figures walking the roads, carts between producers and the warehouse, a fishing boat off each fisherman's hut.
- **Important:** this is decoration only. Goods would still move instantly, as they do now. The figures would be drawn by the renderer from what the simulation already reports, and the rules, the bot and the balance would not change.
- **Do not confuse with D3**, which makes carriers real and changes the game.
- **Size:** medium.

### C2. Sound (done in Phase 10, but never listened to)
- **Needs you:** listen, and tell me which sounds are wrong. I cannot hear them.
- **Left over:** music, sounds from the town itself, and recorded sounds in place of the code-made ones.
- **What you get:** clicks and a thump when you build, a chime on an upgrade, waves and birds in the background, perhaps music.
- **Decision you must make first:** where the sounds come from.
  - *Made by code:* simple tones and noise shaped in the browser. No files, fits the "no dependencies" rule, sounds basic.
  - *Sound files:* far better, but someone must make or license them, and they add downloads to the game.
- **Also needs:** a mute button and a volume setting that are remembered.
- **Size:** medium.

### C3. A second art pass (done in Phases 13 and 14)
- **Done:** three looks for each kind of house, four since Phase 29, with rounded ground and smooth roads (Phase 29).
- **Done in Phase 14:** dust when something is built or removed, smoke from lived-in houses, and day and night.
- **Left over:** windows that come on at dusk, and real lighting at night.
- Ideas, none of them urgent: two or three variants of each house so a town looks less uniform, a building-site look for the first seconds after placing, smoke from house chimneys, a day and night tint.
- **Bigger decision:** whether to keep code-drawn art or bring in painted pictures. The drawings are swappable one building at a time (decision D78).
- **Size:** small to medium for the ideas. Painted art depends on who makes it.

---

## Stage D: More game

Every item here changes the rules. Each one needs new data, new tests, a new bot build order, and a fresh balance pass with the bot. That is why they are large.

### D1. A third population tier and one or two new production chains (done in Phase 12)
- **What was built:** Artisans, wool and cloth, a Sheep farm and a Weaver, and a goal of 100 Artisans after the win. The win itself did not move.
- **Left over:** a fourth tier, a second new chain, and anything that makes the second act play differently from the first.
- **What you get:** a reason to keep playing past 100 Workers. For example a third tier that needs a new good made from a new farm and a new workshop.
- **Why it is the cheapest "more game":** tiers, needs, goods and buildings are all data. In Phase 5 a new good and a new building were added by editing two data files with no code change. The upgrade path, the win target and the drawings would need work.
- **Decisions you must make:** what the tier is called, what it needs, and whether the win moves.
- **Known limit:** the bot cannot place buildings larger than 2 by 2.
- **Size:** large.

### D2. Workforce (done in Phase 15, as "staff")
- **What was built:** every producing building needs staff, the town's staff come from its residents, and a town that is short works slower, every producer by the same share. See `SPEC.md` section 16.
- **Different from what this page promised:** it said a sawmill with no free workers would stand idle. Nothing stands idle. Everything slows together, so a town can always recover (`DECISIONS.md` D188).
- **Effect on balance:** none on a sensible first game, by design. The targets from the brief still hold.
- **Done in Phase 16:** closing a building for now, which frees its staff (`SPEC.md` section 17).
- **Left over:** kinds of resident that differ as staff, staff you can see walking to work, a harder setting where the rule bites in the first act, closing several buildings at once, and lower upkeep while closed.
- **Size:** it took one session.

### D3. Real logistics: carriers and warehouse range (done in Phases 19 and 20)
- **Done:** finished goods wait in a yard until a cart from the nearest warehouse fetches them, within 30 road tiles (`SPEC.md` section 20). Workshops work from their own store of materials, which carts fill (section 21).
- **Left over:** carts shared between warehouses. Reach is shown while placing since Phase 25.
- **What you get:** goods are carried along roads, warehouses serve an area, and where you build starts to matter the way it does in the Anno games.
- **Honest warning:** this is the largest change on the list. Today roads are a yes-or-no connection and all goods sit in one shared stockpile (`ARCHITECTURE.md` section 9). Carriers replace both ideas. Expect most production and storage tests to be rewritten.
- **Size:** large, probably three sessions.

### D4. Ships, trade and a second island (ships and trade done in Phase 18)
- **Done:** a harbour, a trade ship every two minutes, standing orders to sell and buy at fixed prices (`SPEC.md` section 19).
- **Left over:** more than one ship. Prices move with supply since Phase 27.
- **What you get:** sell surplus, buy what the island lacks, settle a second island with different land.
- **Depends on:** D3 in spirit, and save and load in practice, because games get long.
- **Size:** large.

### D5. Difficulty settings and scenarios (done in Phases 13 and 17)
- **Done:** Easy, Normal and Hard. Four scenarios, each with its own island, start, goal and medal times (`SPEC.md` sections 18 and 27).
- **Left over:** more scenarios (each is a few lines in `data/config.json`), a way to lose, and scenarios with rules of their own. A best time for the standard game came in Phase 28.
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

> Phase 31: I played a full game. It took 41 minutes. Notes: (your notes). Plan the fixes and show me the plan first.

or

> Phase 31: a way to lose (D5). Ask me what you need first.

The helper should then follow the working rules in `HANDOFF.md` section 6: plan first, one feature at a time, test everything itself, stop at the gate with the five-part report, and commit only after you approve.

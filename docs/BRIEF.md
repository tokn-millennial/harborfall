# Harborfall: The Original Brief

This is the brief that started the project on 2026-11-10, word for word. It is kept as a reference. The working rules, the tech constraints and the gate report format in it still apply (see `HANDOFF.md` section 6).

Things that have changed since:
- All six phases in it are done. Phases 6 (polish) and 7 (art and style) were added afterwards.
- "Flat-color placeholder shapes. No final art." was replaced in Phase 7, at the owner's request, by art drawn in code.
- The starting values and balance numbers were tuned in Phase 2. The current ones are in `SPEC.md` and the `data/` files.

---

## Project: Harborfall (working title)
A small Anno-style city builder and resource management demo that runs in a browser.

### Purpose of this session
This is a test. I want to learn how well Fable 5.2 builds a complete, playable game demo. Work in phases. Stop at the end of each phase and wait for my approval. Be honest about what is weak or unfinished. Do not hide problems.

### About me
I am new to game development. I do not know game engines. Explain decisions in plain words. Do not ask me to read code. Test the game yourself, then tell me the results.

### Working rules
1. Plan before you code. Show the plan first.
2. Build one feature at a time. Test after every change.
3. Keep the scope small. Do not add features I did not list.
4. Find bugs yourself. Use the headless simulation to diagnose them. Do not ask me for more detail unless you are blocked.
5. Ask clarifying questions only in Phase 0. After that, make a reasonable choice and record it in docs/DECISIONS.md.
6. Keep all game rules in data files (JSON), not in code. I want to tune the economy without editing code.
7. Keep a running log in docs/TESTLOG.md. After each phase, record: turns used, bugs found, bugs fixed, decisions made, and what you would change.

### Tech constraints
- Plain JavaScript (ES modules) and HTML5 Canvas 2D. No framework. No build step. No runtime dependencies.
- Separate three layers: simulation (no rendering code), renderer, and UI.
- The simulation must run headless in Node. Use Node's built-in test runner (node --test).
- Use a fixed tick rate for the simulation. Rendering runs on its own frame loop.
- Target: desktop browser, mouse and keyboard, Mac and PC.
- Write the code so I can move it to a real game engine later. Keep game logic free of browser APIs.

### Game design (Version 1 slice)
**Map:** One island, 64x64 tiles. It has forest tiles, fertile land, and a coast.
**Look:** Isometric view. Use flat-color placeholder shapes. No final art. Support pan and zoom.
**Win:** Reach 100 Workers. There is no lose state. If coins run out, building stops until income recovers.
**Speed:** 1x, 2x, 4x, and pause. A full win run should take 25 to 40 minutes at 1x.

**Goods:** Wood, Planks, Fish, Grain, Bread. Coins are the currency.

**Buildings (starting values, tune later):**
- Road: 1 coin. Producers, markets, and warehouses must connect to a warehouse by road.
- Warehouse: 50 coins, 20 wood. Stores up to 100 of each good. I start with one free.
- Lumberjack: 20 coins. Needs forest tiles in radius 4. Makes wood.
- Sawmill: 40 coins, 5 wood. Turns 2 wood into 1 plank.
- Fisherman: 30 coins, 10 wood. Needs an adjacent coast tile. Makes fish.
- Farm: 50 coins, 10 wood, 5 planks. Needs 2x2 fertile land. Makes grain.
- Bakery: 80 coins, 10 planks. Turns grain into bread.
- House: 10 coins, 5 wood. Holds 4 Farmers.
- Market: 60 coins, 10 planks. Radius 8. It delivers goods to houses in range.

**Population tiers:**
- Farmers need fish.
- Workers need fish and bread. A house upgrades to a Worker house (holds 8) when all needs are met and I pay 5 planks and 20 coins.
- Residents pay taxes. Buildings have upkeep.

**Balance targets (you choose the exact numbers):**
- One fisherman feeds about 20 residents.
- A healthy 100-resident city earns about +40 coins per minute net.
- A new player should not get stuck with no way to recover.

**Starting resources:** 500 coins, 40 wood, 20 planks.

### Phases

**Phase 0: Spec (no code).**
Ask me up to 5 scoping questions. Then write docs/SPEC.md, docs/ARCHITECTURE.md, and the data files. Include the folder structure, the data model, and the test plan. Gate: I approve the spec.

**Phase 1: Simulation core, headless.**
Build the grid, buildings, road network, production, consumption, population, taxes, upgrades, and the win check. Write tests for each system. Gate: all tests pass.

**Phase 2: Bot and balance.**
Write a bot script that plays the game headless with a simple build order. Run it. Report the time to win, the coin curve, and any dead ends. Tune the data files until the targets are met. Gate: the bot wins in the target time.

**Phase 3: Renderer.**
Isometric tiles, buildings as placeholder shapes, camera pan and zoom, tile picking. Gate: I can see the island and move around.

**Phase 4: UI and play.**
Build menu, placement preview with valid and invalid colors, roads by drag, HUD (coins, goods, population), building info panel, speed controls, win screen. Gate: I can play from start to win.

**Phase 5: Review.**
Run a full playtest checklist. Fix the top 5 problems. Write the final report. Gate: you give me a summary of results.

### Report format at each gate
1. What you built.
2. Test results (pass and fail counts).
3. How to try it: three steps I can follow in the browser.
4. Known issues.
5. Decisions I need to make.

### Final report (Phase 5)
Score each item pass or fail, with one line of evidence:
- The game loads and runs on first try.
- All tests pass.
- A full production chain works from start to finish.
- The bot wins in the target time.
- I can win by hand.
- The code is easy to extend.
Then list what Fable 5.2 did well, where it struggled, and how many turns each phase took.

Start with Phase 0. Show me your plan first.

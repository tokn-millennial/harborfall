# Harborfall: Test Log

A running record, one entry per phase. A "turn" is one message from Colin plus Fable 5.2's work in reply.

## Phase 0: Spec

Date: 2026-11-10. Status: approved by Colin with no changes.

**Turns used:** 2 to produce, plus 1 approval message.
1. Plan and five scoping questions.
2. Wrote the spec, architecture, decision log, this log, and five data files.

**What was produced**
- `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TESTLOG.md`
- `data/config.json`, `data/goods.json`, `data/buildings.json`, `data/population.json`, `data/map.json`
- An empty git repository. Nothing is committed yet.

**Checks run**
- All five data files load as valid JSON: 5 of 5 pass.
- Cross-reference check, 5 of 5 pass: every good named in a cost, input, output or need exists in `goods.json`; every tier named exists; the win tier exists; the free starting building exists; every terrain named in a placement rule exists.
- Balance arithmetic in `SPEC.md` section 10 recomputed from the data files by script: fisherman feeds 20 residents, net income at 104 Workers is +40 per minute. Both match.

No game code exists yet, so there are no automated tests to run.

**Bugs found:** 0. **Bugs fixed:** 0. There is no code to have bugs yet.

**Decisions made:** 5 by Colin (Q1 to Q5) and 21 by Fable 5.2 (D1 to D21). All are in `DECISIONS.md`. Thirteen of the 21 change how the game plays and are marked **(rule)**.

**Weak or unfinished**
- The balance numbers are hand estimates. They hit the targets on paper only. The time-to-win estimate of 28 to 32 minutes is the least certain number in the spec.
- `map.json` describes the island by targets and guarantees. The generator that must meet them does not exist yet, so the field names under `generation` may change in Phase 1.
- The brief did not define how goods reach houses when stock is short. I chose "older houses buy first". It is simple but unfair, and it may feel odd in play.
- Thirteen game rules were my reading of gaps in the brief. That is a lot of rules for one person to approve at a glance.

**What I would change**
- I would have asked about base income (D1) and the pre-placed warehouse (D2) as scoping questions if the limit were higher than five. They are the two choices most likely to surprise you.

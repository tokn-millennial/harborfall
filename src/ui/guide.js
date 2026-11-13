// The first-game guide: which step the player is on. No page code here.
//
// The steps and their "done" tests come from data/guide.json. The guide only
// reads the game. It never changes it, and the game does not know it exists.

// Is one "done" test true right now? A list means all of them.
export function conditionMet(game, condition) {
  if (Array.isArray(condition)) return condition.every((c) => conditionMet(game, c));
  const { state } = game;
  if (condition.buildings !== undefined) {
    let n = 0;
    for (const b of state.buildings) if (b.type === condition.buildings && (!condition.connected || b.connected)) n++;
    return n >= condition.atLeast;
  }
  if (condition.housesServed !== undefined) {
    let n = 0;
    for (const b of state.buildings) if (b.house?.served) n++;
    return n >= condition.housesServed;
  }
  if (condition.people !== undefined) {
    let n = 0;
    for (const b of state.buildings) if (b.house) n += b.house.residents;
    return n >= condition.people;
  }
  if (condition.houses !== undefined) {
    let n = 0;
    for (const b of state.buildings) if (b.house?.tier === condition.houses) n++;
    return n >= condition.atLeast;
  }
  if (condition.stock !== undefined) return (state.goods[condition.stock] ?? 0) >= condition.atLeast;
  if (condition.won !== undefined) return state.won === condition.won;
  return false;
}

// Everything wrong with a guide, as a list of sentences. Empty means it is fine.
export function guideProblems(rules, guide) {
  const problems = [];
  if (guide === null || typeof guide !== 'object' || !Array.isArray(guide.steps)) return ['guide.json needs a list called "steps"'];
  if (guide.steps.length === 0 || guide.steps.length > 20) problems.push(`guide.json has ${guide.steps.length} steps. It needs between 1 and 20.`);
  const whole = (n) => Number.isInteger(n) && n >= 1;

  const check = (condition, where) => {
    if (Array.isArray(condition)) {
      if (condition.length === 0) problems.push(`${where} has an empty list of tests`);
      condition.forEach((c, i) => check(c, `${where}, test ${i + 1}`));
      return;
    }
    if (condition === null || typeof condition !== 'object') {
      problems.push(`${where} has no "done" test`);
      return;
    }
    const kinds = ['buildings', 'housesServed', 'people', 'houses', 'stock', 'won'].filter((k) => condition[k] !== undefined);
    if (kinds.length !== 1) {
      problems.push(`${where} must use exactly one kind of test, and uses ${kinds.length}`);
      return;
    }
    const kind = kinds[0];
    if (kind === 'buildings') {
      const def = Object.hasOwn(rules.buildings, condition.buildings) ? rules.buildings[condition.buildings] : null;
      if (!def || def.category === 'road') problems.push(`${where} names an unknown building "${condition.buildings}"`);
      if (!whole(condition.atLeast)) problems.push(`${where} needs "atLeast" as a whole number`);
      if (condition.connected !== undefined && condition.connected !== true) problems.push(`${where}: "connected" can only be true`);
    } else if (kind === 'houses') {
      if (!Object.hasOwn(rules.tiers, condition.houses)) problems.push(`${where} names an unknown kind of resident "${condition.houses}"`);
      if (!whole(condition.atLeast)) problems.push(`${where} needs "atLeast" as a whole number`);
    } else if (kind === 'stock') {
      if (!rules.goodIds.includes(condition.stock)) problems.push(`${where} names an unknown good "${condition.stock}"`);
      if (!whole(condition.atLeast)) problems.push(`${where} needs "atLeast" as a whole number`);
    } else if (kind === 'won') {
      if (condition.won !== true) problems.push(`${where}: "won" can only be true`);
    } else if (!whole(condition[kind])) {
      problems.push(`${where}: "${kind}" must be a whole number`);
    }
  };

  guide.steps.forEach((step, i) => {
    const where = `guide.json step ${i + 1}`;
    if (step === null || typeof step !== 'object') {
      problems.push(`${where} is not a step`);
      return;
    }
    if (typeof step.text !== 'string' || step.text.trim() === '' || step.text.length > 90) problems.push(`${where} needs "text" of 1 to 90 characters`);
    if (step.why !== undefined && (typeof step.why !== 'string' || step.why.length > 160)) problems.push(`${where}: "why" must be text of at most 160 characters`);
    check(step.done, where);
  });
  return problems;
}

// Follows one game through the guide. `update()` returns what to show:
//   { total, done, at, finished, current: { text, why } | null, steps: [{ text, done }] }
//   done   how many steps are ticked
//   at     the step being asked for: the first one not ticked
//
// The rules:
//   - A step is ticked the moment its test is true, and stays ticked. If the
//     thing is later lost (a building demolished), it is not asked for again.
//   - The step shown is the first one not ticked. Doing a later step early
//     ticks that step, but the guide still asks for the earlier one.
//   - When a game is picked up part-way (Continue), everything before the
//     furthest step that is true counts as ticked. Nothing about the guide is
//     saved, so this is how it finds its place again.
export function createGuideTracker(game, guide) {
  const steps = Array.isArray(guide?.steps) ? guide.steps : [];
  const ticked = steps.map(() => false);
  for (let i = steps.length - 1; i >= 0; i--) {
    if (conditionMet(game, steps[i].done)) {
      ticked.fill(true, 0, i + 1);
      break;
    }
  }

  function update() {
    steps.forEach((step, i) => {
      if (!ticked[i] && conditionMet(game, step.done)) ticked[i] = true;
    });
    const first = ticked.indexOf(false);
    const at = first === -1 ? steps.length : first;
    const current = steps[at] ?? null;
    return {
      total: steps.length,
      done: ticked.filter(Boolean).length,
      at,
      finished: at >= steps.length,
      current: current ? { text: current.text, why: current.why ?? '' } : null,
      steps: steps.map((step, i) => ({ text: step.text, done: ticked[i] })),
    };
  }

  return { update };
}

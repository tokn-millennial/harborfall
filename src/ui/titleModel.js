// What the title screen says and offers. No page code here, so it is tested in Node.
//
// titleModel({ saved, canSave, rules }) where
//   saved    null when there is no saved game, otherwise what loading it gave:
//            { ok: true, game } or { ok: false, reason }
//   canSave  whether this browser lets the game save at all
//   rules    any game's rules, for the difficulties and scenarios to offer (optional)
//   records  the player's best times (optional; see platform/records.js)

import { getSummary } from '../sim/index.js';
import { clock, medalName, medalTimesText, scenarioGoalText } from './text.js';

// The record of the standard island on one difficulty.
export const standardRecordId = (difficulty) => `standard:${difficulty ?? 'normal'}`;

// Which best time a game counts toward, or null for none: a scenario's own, or
// the standard island's on the game's difficulty. Other islands keep no record,
// because their times say nothing about each other. `standardSeed` is the
// standard island's number (data/map.json).
export function recordIdFor(game, standardSeed) {
  if (game.rules.scenario) return game.rules.scenario;
  return game.rules.map.seed === standardSeed ? standardRecordId(game.rules.difficulty) : null;
}

// Island numbers that can be typed on the title screen.
export const ISLAND_NUMBERS = { min: 1, max: 999999 };

// What was typed in the island box: the island number, or null if it is not a
// whole number in range. Spaces around it are allowed.
export function islandNumberFrom(text) {
  const trimmed = String(text ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seed = Number(trimmed);
  return seed >= ISLAND_NUMBERS.min && seed <= ISLAND_NUMBERS.max ? seed : null;
}

const SAVE_PROBLEM = {
  rules_changed: 'The rules of the game have changed since your game was saved, so it cannot be continued. If you changed a data file, changing it back brings your game back.',
  newer_version: 'Your saved game was made by a newer version of Harborfall, so this one cannot continue it.',
  damaged: 'Your saved game is damaged and cannot be continued.',
  not_a_save: 'Your saved game could not be read and cannot be continued.',
};
const REPLACE_WARNING = 'Press again. This replaces your saved game.';

// One line about a game in progress: "28:34 played, 64 of 100 Workers, 312 coins".
// `standardSeed` is the standard island's number: a game on another island
// says which, so it can be found again.
export function savedGameLine(game, standardSeed = null) {
  const summary = getSummary(game);
  const tierName = game.rules.tiers[summary.win.tier].name;
  const parts = [
    `${clock(summary.seconds)} played`,
    summary.win.won ? `won with ${summary.win.current} ${tierName}s` : `${summary.win.current} of ${summary.win.target} ${tierName}s`,
    `${summary.coins} coins`,
  ];
  // A scenario is named. The standard game needs no name.
  const scenario = game.rules.scenarios.find((s) => s.id === game.rules.scenario);
  if (scenario) parts.unshift(scenario.name);
  // The difficulty is only worth saying when it is not the usual one.
  const { difficulty, defaultDifficulty, difficulties } = game.rules;
  if (difficulty && difficulty !== defaultDifficulty) parts.push(difficulties.find((d) => d.id === difficulty)?.name ?? difficulty);
  if (!scenario && standardSeed !== null && game.rules.map.seed !== standardSeed) parts.push(`island ${game.rules.map.seed}`);
  return parts.join(', ');
}

export function titleModel({ saved, canSave, rules = null, records = null }) {
  const usable = Boolean(saved?.ok);
  // Anything in the save slot, readable or not, is lost when a new game begins.
  const confirm = saved ? REPLACE_WARNING : null;

  const notices = [];
  if (saved && !saved.ok) notices.push(SAVE_PROBLEM[saved.reason] ?? SAVE_PROBLEM.not_a_save);
  if (!canSave) notices.push('This browser is not letting the game save. A game will be lost when you close or refresh the page.');

  const buttons = [];
  if (usable) buttons.push({ id: 'continue', label: 'Continue', detail: savedGameLine(saved.game, rules?.map.seed ?? null), confirm: null });
  buttons.push({ id: 'new', label: 'New game', detail: 'The standard island', confirm });
  buttons.push({ id: 'random', label: 'New game on a random island', detail: 'A different island every time', confirm });

  return {
    notices,
    buttons,
    primary: buttons[0].id,
    // The difficulties a new game can be started on, and the one picked to begin with.
    // With only one there is nothing to choose, so none are listed.
    difficulties: rules && rules.difficulties.length > 1 ? rules.difficulties.map((d) => ({ id: d.id, name: d.name, about: d.about })) : [],
    difficulty: rules?.defaultDifficulty ?? null,
    // Games with their own island, start and goal. Each replaces the saved game, like any new game.
    scenarios: (rules?.scenarios ?? []).map((s) => {
      const best = records?.best(s.id) ?? null;
      return {
        id: s.id,
        name: s.name,
        about: s.about,
        goal: `Goal: ${scenarioGoalText(rules, s)}.`,
        medals: medalTimesText(rules, s.medals),
        best: best ? `Your best: ${clock(best.ticks / rules.ticksPerSecond)}${medalName(best.medal) ? `, ${medalName(best.medal).toLowerCase()}` : ''}.` : null,
        confirm,
      };
    }),
    // The best time on the standard island, per difficulty: shown under New game.
    standardBest: Object.fromEntries((rules?.difficulties.length ? rules.difficulties.map((d) => d.id) : [rules?.defaultDifficulty ?? null]).map((id) => {
      const best = records?.best(standardRecordId(id)) ?? null;
      return [id ?? 'normal', best ? `Your best: ${clock(best.ticks / rules.ticksPerSecond)}.` : null];
    })),
    // A new game on an island chosen by its number.
    island: { ...ISLAND_NUMBERS, confirm },
    footnote: canSave ? 'Your game saves itself in this browser as you play.' : null,
  };
}

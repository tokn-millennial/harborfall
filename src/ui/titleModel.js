// What the title screen says and offers. No page code here, so it is tested in Node.
//
// titleModel({ saved, canSave }) where
//   saved    null when there is no saved game, otherwise what loading it gave:
//            { ok: true, game } or { ok: false, reason }
//   canSave  whether this browser lets the game save at all

import { getSummary } from '../sim/index.js';
import { clock } from './text.js';

const SAVE_PROBLEM = {
  rules_changed: 'The rules of the game have changed since your game was saved, so it cannot be continued. If you changed a data file, changing it back brings your game back.',
  newer_version: 'Your saved game was made by a newer version of Harborfall, so this one cannot continue it.',
  damaged: 'Your saved game is damaged and cannot be continued.',
  not_a_save: 'Your saved game could not be read and cannot be continued.',
};
const REPLACE_WARNING = 'Press again. This replaces your saved game.';

// One line about a game in progress: "28:34 played, 64 of 100 Workers, 312 coins".
export function savedGameLine(game) {
  const summary = getSummary(game);
  const tierName = game.rules.tiers[summary.win.tier].name;
  const parts = [
    `${clock(summary.seconds)} played`,
    summary.win.won ? `won with ${summary.win.current} ${tierName}s` : `${summary.win.current} of ${summary.win.target} ${tierName}s`,
    `${summary.coins} coins`,
  ];
  return parts.join(', ');
}

export function titleModel({ saved, canSave }) {
  const usable = Boolean(saved?.ok);
  // Anything in the save slot, readable or not, is lost when a new game begins.
  const confirm = saved ? REPLACE_WARNING : null;

  const notices = [];
  if (saved && !saved.ok) notices.push(SAVE_PROBLEM[saved.reason] ?? SAVE_PROBLEM.not_a_save);
  if (!canSave) notices.push('This browser is not letting the game save. A game will be lost when you close or refresh the page.');

  const buttons = [];
  if (usable) buttons.push({ id: 'continue', label: 'Continue', detail: savedGameLine(saved.game), confirm: null });
  buttons.push({ id: 'new', label: 'New game', detail: 'The standard island', confirm });
  buttons.push({ id: 'random', label: 'New game on a random island', detail: 'A different island every time', confirm });

  return {
    notices,
    buttons,
    primary: buttons[0].id,
    footnote: canSave ? 'Your game saves itself in this browser as you play.' : null,
  };
}

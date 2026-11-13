// Loads the data files from disk. Node only (tests, bot, tools).
// The simulation never imports this: it is handed the result as a plain object.
import { readFileSync } from 'node:fs';

// The first five are the rules of the game. The guide is only read by the UI.
export const DATA_FILES = ['config', 'goods', 'buildings', 'population', 'map', 'guide'];

const DEFAULT_DIR = new URL('../../data/', import.meta.url);

export function loadData(dir = DEFAULT_DIR) {
  const data = {};
  for (const name of DATA_FILES) {
    data[name] = JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8'));
  }
  return data;
}

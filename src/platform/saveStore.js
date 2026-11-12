// Keeps one saved game in a storage box. The box is handed in, so this file
// has no browser code: in the browser it is the page's own storage, and in the
// tests it is a stand-in.
//
// The box needs three functions: getItem(key), setItem(key, text) and
// removeItem(key). Any of them may fail (a full or blocked storage throws),
// and none of those failures may stop the game.

export const SAVE_KEY = 'harborfall.save';

// `storage` may be null, meaning there is nowhere to save.
export function createSaveStore(storage, key = SAVE_KEY) {
  let working = Boolean(storage);

  return {
    // False when there is nowhere to save, or the last write failed.
    get working() {
      return working;
    },

    // What is in the box: { found: false }, or { found: true, save, savedAt, view }.
    // `save` is null when something is there but cannot be read. `view` is
    // where the player was looking, { x, y, zoom }, or null.
    read() {
      if (!storage) return { found: false };
      let text;
      try {
        text = storage.getItem(key);
      } catch {
        return { found: false };
      }
      if (text === null || text === undefined) return { found: false };
      try {
        const box = JSON.parse(text);
        if (box === null || typeof box !== 'object' || !('save' in box)) return { found: true, save: null, savedAt: null, view: null };
        const v = box.view;
        const view = v && [v.x, v.y, v.zoom].every(Number.isFinite) && v.zoom > 0 ? { x: v.x, y: v.y, zoom: v.zoom } : null;
        return { found: true, save: box.save, savedAt: Number.isFinite(box.savedAt) ? box.savedAt : null, view };
      } catch {
        return { found: true, save: null, savedAt: null, view: null };
      }
    },

    // Puts a save in the box. `savedAt` is the real time, for showing later.
    // `view` is where the player is looking. Returns whether it worked.
    write(save, savedAt = null, view = null) {
      if (!storage) return false;
      try {
        storage.setItem(key, JSON.stringify({ savedAt, view, save }));
        working = true;
      } catch {
        working = false;
      }
      return working;
    },

    clear() {
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        // Nothing to do: a box that cannot be emptied cannot be read either.
      }
    },
  };
}

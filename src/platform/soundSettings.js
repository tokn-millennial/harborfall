// Remembers the player's sound settings: how loud, and whether muted.
// Like the save slot, it is handed a storage box and never fails if the box does.

export const SOUND_KEY = 'harborfall.sound';

const clampVolume = (value, fallback) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);

// `storage` may be null: the settings then last only until the page is closed.
export function createSoundSettings(storage, defaultVolume = 0.5, key = SOUND_KEY) {
  let volume = defaultVolume;
  let muted = false;
  try {
    const stored = JSON.parse(storage?.getItem(key) ?? 'null');
    if (stored && typeof stored === 'object') {
      volume = clampVolume(stored.volume, defaultVolume);
      muted = stored.muted === true;
    }
  } catch {
    // Unreadable settings: start from the defaults.
  }

  return {
    get volume() {
      return volume;
    },
    get muted() {
      return muted;
    },
    set(change) {
      if ('volume' in change) volume = clampVolume(change.volume, volume);
      if ('muted' in change) muted = change.muted === true;
      try {
        storage?.setItem(key, JSON.stringify({ volume, muted }));
      } catch {
        // The setting still holds for this visit.
      }
    },
  };
}

// Remembers one yes-or-no choice, such as "the guide is hidden". Like the save
// slot, it is handed a storage box and never fails if the box does.

// `storage` may be null: the choice then lasts only until the page is closed.
export function createFlag(storage, key, initial = false) {
  let value = initial;
  try {
    const stored = storage?.getItem(key);
    if (stored === 'yes') value = true;
    else if (stored === 'no') value = false;
  } catch {
    // Unreadable: start from the default.
  }
  return {
    get() {
      return value;
    },
    set(next) {
      value = next === true;
      try {
        storage?.setItem(key, value ? 'yes' : 'no');
      } catch {
        // The choice still holds for this visit.
      }
    },
  };
}

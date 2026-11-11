// Loads the data files in the browser. The simulation never imports this:
// it is handed the result as a plain object.

export const DATA_FILES = ['config', 'goods', 'buildings', 'population', 'map'];

export async function loadData(baseUrl = new URL('../../data/', import.meta.url)) {
  const entries = await Promise.all(
    DATA_FILES.map(async (name) => {
      const response = await fetch(new URL(`${name}.json`, baseUrl));
      if (!response.ok) throw new Error(`Could not load data/${name}.json (${response.status})`);
      return [name, await response.json()];
    }),
  );
  return Object.fromEntries(entries);
}

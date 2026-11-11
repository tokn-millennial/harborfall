// Guards the layer rule: the simulation must not touch the browser, Node, the
// clock or the built-in random function, and must only import its own files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const SIM_DIR = new URL('../src/sim/', import.meta.url);
const files = readdirSync(SIM_DIR).filter((name) => name.endsWith('.js'));

// Comments may mention these words, so strip comments before looking.
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const FORBIDDEN = [
  [/\bwindow\b/, 'window (browser)'],
  [/\bdocument\b/, 'document (browser)'],
  [/\bnavigator\b/, 'navigator (browser)'],
  [/\blocalStorage\b/, 'localStorage (browser)'],
  [/\bfetch\s*\(/, 'fetch (browser)'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame (browser)'],
  [/\brequire\s*\(/, 'require (Node)'],
  [/\bprocess\./, 'process (Node)'],
  [/['"`]node:/, 'a node: import'],
  [/\bMath\.random\b/, 'Math.random (not repeatable)'],
  [/\bDate\b/, 'Date (the real clock)'],
  [/\bperformance\./, 'performance (the real clock)'],
  [/\bset(Timeout|Interval)\b/, 'timers'],
  [/\bconsole\./, 'console output'],
];

test('the simulation folder has the files this test expects to guard', () => {
  assert.ok(files.length >= 10, `found only ${files.length} files in src/sim`);
  assert.ok(files.includes('index.js'));
});

for (const name of files) {
  test(`src/sim/${name} uses nothing from the browser, Node or the clock`, () => {
    const code = stripComments(readFileSync(new URL(name, SIM_DIR), 'utf8'));
    for (const [pattern, label] of FORBIDDEN) {
      assert.equal(pattern.test(code), false, `${name} uses ${label}`);
    }
    for (const match of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      assert.match(match[1], /^\.\/[\w-]+\.js$/, `${name} imports "${match[1]}", which is outside src/sim`);
    }
    assert.equal(/\bimport\s*\(/.test(code), false, `${name} uses a dynamic import`);
  });
}

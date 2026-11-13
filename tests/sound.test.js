// Sound. Nobody can hear in a test, so these check what can be measured: that
// every sound exists, is short, is not too loud, starts and ends in silence so
// it cannot click, and has the shape it is meant to (a rise, a fall). Whether
// the sounds are pleasant is for a person to judge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lengthOf, render, renderSea, SAMPLE_RATE } from '../src/audio/synth.js';
import { DEFAULT_VOLUME, SEA, SEA_SHARE, SOUNDS } from '../src/audio/sounds.js';
import { createAudio } from '../src/platform/audio.js';
import { createSoundSettings, SOUND_KEY } from '../src/platform/soundSettings.js';
import { soundLabels } from '../src/ui/soundControls.js';

const peakOf = (samples) => samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const meanOf = (samples) => samples.reduce((s, v) => s + v, 0) / samples.length;
const rms = (samples, from = 0, to = samples.length) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
};
// How often the wave crosses zero, per second: a rough measure of how high a sound is.
const crossingsPerSecond = (samples, from = 0, to = samples.length) => {
  let n = 0;
  for (let i = from + 1; i < to; i++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) n++;
  return (n * SAMPLE_RATE) / Math.max(1, to - from);
};
const halves = (samples) => {
  const mid = samples.length >> 1;
  return [crossingsPerSecond(samples, 0, mid), crossingsPerSecond(samples, mid)];
};
// How high a sound is in its first moments and in its last, leaving out the
// stretch in the middle where one note overlaps the next.
const startAndEnd = (samples) => {
  const first = Math.round(SAMPLE_RATE * 0.08);
  const last = Math.round(SAMPLE_RATE * 0.08);
  const quietTail = Math.round(SAMPLE_RATE * 0.02); // the very end is too faint to measure
  return [crossingsPerSecond(samples, 0, first), crossingsPerSecond(samples, samples.length - last - quietTail, samples.length - quietTail)];
};

const NAMES = Object.keys(SOUNDS);

// ---- the recipes ---------------------------------------------------------------

test('the game has a sound for each thing the UI reports', () => {
  assert.deepEqual(NAMES.sort(), ['demolish', 'pick', 'place', 'refuse', 'road', 'upgrade', 'win']);
});

test('every recipe is made of sensible voices', () => {
  for (const [name, recipe] of Object.entries(SOUNDS)) {
    assert.ok(recipe.voices.length >= 1 && recipe.voices.length <= 8, name);
    for (const v of recipe.voices) {
      assert.ok(['sine', 'triangle', 'noise'].includes(v.wave), `${name}: unknown wave ${v.wave}`);
      assert.ok(v.for > 0.01 && v.for <= 1, `${name}: a voice lasts ${v.for} seconds`);
      assert.ok((v.at ?? 0) >= 0, name);
      assert.ok(v.level > 0 && v.level <= 1, `${name}: level ${v.level}`);
      assert.ok((v.attack ?? 0.005) < v.for, `${name}: the attack is longer than the voice`);
      if (v.wave !== 'noise') {
        for (const pitch of [v.from, v.to ?? v.from]) assert.ok(pitch >= 40 && pitch <= 4000, `${name}: a pitch of ${pitch} hertz`);
      }
    }
  }
});

// ---- the sounds themselves -----------------------------------------------------

for (const name of NAMES) {
  test(`"${name}" is short, not too loud, and starts and ends in silence`, () => {
    const samples = render(SOUNDS[name]);
    const seconds = samples.length / SAMPLE_RATE;
    assert.ok(Math.abs(seconds - lengthOf(SOUNDS[name])) < 0.001);
    assert.ok(seconds >= 0.04 && seconds <= 1.3, `${seconds.toFixed(2)} seconds long`);
    assert.ok(samples.every(Number.isFinite), 'it contains something that is not a number');

    const peak = peakOf(samples);
    assert.ok(peak <= 0.9, `it peaks at ${peak.toFixed(2)}, which risks distortion`);
    assert.ok(peak >= 0.15, `it peaks at only ${peak.toFixed(2)}, which is too quiet to hear`);

    // No click: it begins at nothing and has died away by its end.
    assert.equal(samples[0], 0);
    const tail = Math.round(SAMPLE_RATE * 0.004);
    assert.ok(peakOf(samples.subarray(samples.length - tail)) < 0.01, 'it is still sounding at its end');
    // Nothing left over that would push a speaker one way.
    assert.ok(Math.abs(meanOf(samples)) < 0.02, `its average is ${meanOf(samples).toFixed(3)}, not zero`);
  });
}

test('every voice on its own also starts and ends in silence', () => {
  for (const [name, recipe] of Object.entries(SOUNDS)) {
    for (const voice of recipe.voices) {
      const samples = render({ seed: recipe.seed, voices: [{ ...voice, at: 0 }] });
      assert.ok(Math.abs(samples[0]) < 1e-6, `${name}: a voice starts with a jump`);
      assert.ok(Math.abs(samples[samples.length - 2]) < 0.002, `${name}: a voice ends with a jump`);
    }
  }
});

test('a sound is the same every time it is made', () => {
  for (const name of NAMES) assert.deepEqual(render(SOUNDS[name]), render(SOUNDS[name]), name);
  // And a different seed gives different noise, so the seeds are doing something.
  assert.notDeepEqual(render({ ...SOUNDS.road, seed: 99 }), render(SOUNDS.road));
});

test('the sounds are balanced: none is far louder than the rest', () => {
  const loudness = Object.fromEntries(NAMES.map((name) => [name, rms(render(SOUNDS[name]))]));
  const values = Object.values(loudness);
  const ratio = Math.max(...values) / Math.min(...values);
  assert.ok(ratio < 6, `the loudest is ${ratio.toFixed(1)} times the quietest: ${JSON.stringify(loudness)}`);
  // The tick heard most often is among the quietest.
  assert.ok(peakOf(render(SOUNDS.pick)) <= peakOf(render(SOUNDS.place)));
});

test('the sounds have the shapes they are meant to: good news rises, bad news falls', () => {
  const [upgradeStart, upgradeEnd] = startAndEnd(render(SOUNDS.upgrade));
  assert.ok(upgradeEnd > upgradeStart * 1.2, `upgrade goes from ${upgradeStart.toFixed(0)} to ${upgradeEnd.toFixed(0)}`);
  const [winStart, winEnd] = startAndEnd(render(SOUNDS.win));
  assert.ok(winEnd > winStart * 1.2, `win goes from ${winStart.toFixed(0)} to ${winEnd.toFixed(0)}`);
  const [refuseStart, refuseEnd] = startAndEnd(render(SOUNDS.refuse));
  assert.ok(refuseEnd < refuseStart * 0.9, `refuse goes from ${refuseStart.toFixed(0)} to ${refuseEnd.toFixed(0)}`);
  // Saying no is lower than saying yes, and the win is the longest.
  assert.ok(crossingsPerSecond(render(SOUNDS.refuse)) < crossingsPerSecond(render(SOUNDS.upgrade)) / 2);
  for (const name of NAMES) if (name !== 'win') assert.ok(lengthOf(SOUNDS.win) > lengthOf(SOUNDS[name]), name);
  // A building going up is a low thud, well below the tick of picking a tool.
  const thud = render({ voices: [SOUNDS.place.voices[0]] });
  assert.ok(crossingsPerSecond(thud) < 400);
  assert.ok(crossingsPerSecond(render(SOUNDS.pick)) > 1000);
});

test('a tone is made at the pitch asked for', () => {
  for (const pitch of [220, 440, 880]) {
    const samples = render({ voices: [{ wave: 'sine', from: pitch, for: 0.5, level: 0.5 }] });
    // A wave crosses zero twice per cycle.
    assert.ok(Math.abs(crossingsPerSecond(samples) / 2 - pitch) < pitch * 0.03, `asked for ${pitch}, got ${(crossingsPerSecond(samples) / 2).toFixed(0)}`);
  }
  const sliding = render({ voices: [{ wave: 'triangle', from: 300, to: 1200, for: 0.5, level: 0.5 }] });
  const [low, high] = halves(sliding);
  assert.ok(high > low * 1.5);
});

// ---- the sea -------------------------------------------------------------------

test('the sea is quiet, never silent, swells like waves, and loops with no join', () => {
  const sea = renderSea({ ...SEA, rate: 22050 });
  assert.equal(sea.length, SEA.seconds * 22050);
  assert.ok(sea.every(Number.isFinite));
  assert.ok(Math.abs(peakOf(sea) - SEA.level) < 1e-3);
  assert.ok(Math.abs(meanOf(sea)) < 0.02);

  // Loudness over each half second: it rises and falls, but never stops.
  const window = 11025;
  const levels = [];
  for (let i = 0; i + window <= sea.length; i += window) levels.push(rms(sea, i, i + window));
  const loudest = Math.max(...levels);
  const quietest = Math.min(...levels);
  assert.ok(loudest > quietest * 1.8, `it barely swells: ${quietest.toFixed(3)} to ${loudest.toFixed(3)}`);
  assert.ok(quietest > loudest * 0.08, 'it falls silent between waves');

  // The join: the step from the last sample back to the first is no bigger than the steps inside.
  let typical = 0;
  for (let i = 1; i < sea.length; i++) typical = Math.max(typical, Math.abs(sea[i] - sea[i - 1]));
  assert.ok(Math.abs(sea[0] - sea[sea.length - 1]) <= typical, 'the loop has a jump where it joins');

  // Muffled: far fewer crossings than raw noise, which would hiss.
  let crossings = 0;
  for (let i = 1; i < sea.length; i++) if ((sea[i - 1] < 0) !== (sea[i] < 0)) crossings++;
  assert.ok(crossings / SEA.seconds < 1500, `${(crossings / SEA.seconds).toFixed(0)} crossings a second is a hiss, not a wash`);

  assert.deepEqual(renderSea({ ...SEA, rate: 22050 }), sea);
  assert.ok(SEA_SHARE > 0 && SEA_SHARE <= 0.5, 'the sea should sit well under the other sounds');
});

// ---- playing sounds, with a stand-in for the browser ---------------------------

function fakeBrowser({ state = 'running', broken = false } = {}) {
  const made = { contexts: [], buffers: [], sources: [], gains: [] };
  class Context {
    constructor() {
      if (broken) throw new Error('no sound here');
      this.state = state;
      this.currentTime = 0;
      this.destination = { name: 'speakers' };
      this.resumed = 0;
      made.contexts.push(this);
    }
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      const buffer = { channels, length, sampleRate, getChannelData: () => data };
      made.buffers.push(buffer);
      return buffer;
    }
    createBufferSource() {
      const source = { buffer: null, loop: false, started: false, onended: null, connect(to) { this.to = to; }, start() { this.started = true; } };
      made.sources.push(source);
      return source;
    }
    createGain() {
      const gain = { gain: { value: 1, setTargetAtTime(value) { this.value = value; } }, connect(to) { this.to = to; } };
      made.gains.push(gain);
      return gain;
    }
    resume() { this.resumed++; this.state = 'running'; }
    suspend() { this.state = 'suspended'; }
  }
  return { Context, made };
}

const settingsOf = (volume = 0.5, muted = false) => {
  const s = createSoundSettings(null, volume);
  if (muted) s.set({ muted: true });
  return s;
};
const audioWith = (browser, extra = {}) => createAudio({ Context: browser.Context, sounds: SOUNDS, sea: SEA, seaShare: SEA_SHARE, settings: settingsOf(), ...extra });

test('nothing is set up, and nothing plays, until the player has clicked or pressed a key', () => {
  const browser = fakeBrowser();
  const audio = audioWith(browser);
  assert.equal(audio.play('place'), false);
  assert.equal(browser.made.contexts.length, 0);
  audio.unlock();
  assert.equal(browser.made.contexts.length, 1);
  assert.equal(audio.play('place'), true);
  // Unlocking again and again makes nothing new.
  audio.unlock();
  audio.unlock();
  assert.equal(browser.made.contexts.length, 1);
});

test('unlocking starts the sea, looping and quiet, under the master volume', () => {
  const browser = fakeBrowser();
  const audio = audioWith(browser);
  audio.unlock();
  const [master, seaGain] = browser.made.gains;
  assert.equal(master.to.name, 'speakers');
  assert.equal(master.gain.value, 0.25, 'half volume is a quarter loudness');
  const sea = browser.made.sources[0];
  assert.equal(sea.loop, true);
  assert.equal(sea.started, true);
  assert.equal(sea.to, seaGain);
  assert.equal(seaGain.to, master);
  assert.equal(seaGain.gain.value, SEA_SHARE);
  assert.equal(sea.buffer.length, SEA.seconds * 22050);
  assert.ok(peakOf(sea.buffer.getChannelData(0)) > 0.1, 'the sea buffer is empty');
});

test('a played sound is handed to the browser with its real samples, and made only once', () => {
  const browser = fakeBrowser();
  const audio = audioWith(browser, { sea: null });
  audio.unlock();
  const context = browser.made.contexts[0];
  assert.equal(audio.play('upgrade'), true);
  const source = browser.made.sources[0];
  assert.equal(source.started, true);
  assert.equal(source.loop, false);
  assert.equal(source.buffer.sampleRate, SAMPLE_RATE);
  assert.deepEqual(source.buffer.getChannelData(0), render(SOUNDS.upgrade));
  context.currentTime += 1;
  assert.equal(audio.play('upgrade'), true);
  assert.equal(browser.made.buffers.length, 1, 'the sound was worked out twice');
  assert.equal(browser.made.sources.length, 2);
});

test('the same sound cannot pile up, and only a few sounds play at once', () => {
  const browser = fakeBrowser();
  const audio = audioWith(browser, { sea: null });
  audio.unlock();
  const context = browser.made.contexts[0];
  assert.equal(audio.play('road'), true);
  assert.equal(audio.play('road'), false, 'the same sound started twice in the same instant');
  assert.equal(audio.play('place'), true, 'a different sound was blocked');
  context.currentTime += 0.1;
  assert.equal(audio.play('road'), true);

  // Fill up, then show that finishing one makes room.
  for (const name of ['pick', 'upgrade', 'demolish', 'refuse', 'win']) audio.play(name);
  const started = browser.made.sources.filter((s) => s.started).length;
  assert.equal(started, 6);
  context.currentTime += 1;
  assert.equal(audio.play('win'), false, 'a seventh sound started');
  browser.made.sources[0].onended();
  assert.equal(audio.play('win'), true);
});

test('muting silences everything, and the volume is remembered', () => {
  const browser = fakeBrowser();
  const storage = { items: new Map(), getItem(k) { return this.items.get(k) ?? null; }, setItem(k, v) { this.items.set(k, v); } };
  const audio = createAudio({ Context: browser.Context, sounds: SOUNDS, sea: SEA, settings: createSoundSettings(storage, DEFAULT_VOLUME) });
  audio.unlock();
  const master = browser.made.gains[0];
  audio.setMuted(true);
  assert.equal(master.gain.value, 0);
  assert.equal(audio.play('place'), false);
  audio.setMuted(false);
  audio.setVolume(0.8);
  assert.ok(Math.abs(master.gain.value - 0.64) < 1e-9);
  assert.equal(audio.play('place'), true);
  // A later visit starts from what was set.
  const later = createSoundSettings(storage, DEFAULT_VOLUME);
  assert.equal(later.volume, 0.8);
  assert.equal(later.muted, false);
  audio.setMuted(true);
  assert.equal(createSoundSettings(storage, DEFAULT_VOLUME).muted, true);
});

test('a browser with no sound, a browser that refuses, and the silent test page all do nothing, quietly', () => {
  const none = createAudio({ Context: null, sounds: SOUNDS, sea: SEA, settings: settingsOf() });
  const refuses = audioWith(fakeBrowser({ broken: true }));
  const quiet = fakeBrowser();
  const silent = audioWith(quiet, { silent: true });
  for (const audio of [none, refuses, silent]) {
    audio.unlock();
    assert.equal(audio.play('place'), false);
    audio.setVolume(0.3);
    audio.setMuted(true);
    audio.setHidden(true);
    assert.equal(audio.available, false);
  }
  assert.equal(quiet.made.contexts.length, 0, 'the silent page set up sound anyway');
});

test('a sound system that starts asleep is woken, and the first click still gets its sound', () => {
  const browser = fakeBrowser({ state: 'suspended' });
  const audio = audioWith(browser, { sea: null });
  audio.unlock();
  const context = browser.made.contexts[0];
  assert.equal(context.resumed, 1);
  // Still waking: a sound asked for now is started, to be heard as soon as it is ready.
  context.state = 'suspended';
  assert.equal(audio.play('pick'), true);
  assert.equal(audio.play('place'), true);
  // But they may not pile up while it is not yet running.
  assert.equal(audio.play('upgrade'), false);
  assert.equal(audio.play('road'), false);
  context.state = 'running';
  assert.equal(audio.play('upgrade'), true);
});

test('a hidden tab goes quiet and a shown one comes back', () => {
  const browser = fakeBrowser();
  const audio = audioWith(browser);
  audio.setHidden(true); // before anything is set up: nothing to do, no error
  audio.unlock();
  const context = browser.made.contexts[0];
  audio.setHidden(true);
  assert.equal(context.state, 'suspended');
  assert.equal(audio.play('place'), false);
  audio.setHidden(false);
  assert.equal(context.state, 'running');
});

test('a sound the game does not have is ignored', () => {
  const audio = audioWith(fakeBrowser());
  audio.unlock();
  assert.equal(audio.play('trumpet'), false);
  assert.equal(audio.play(undefined), false);
});

// ---- settings ------------------------------------------------------------------

test('sound settings start at the default, keep within bounds, and survive bad storage', () => {
  const fresh = createSoundSettings(null, 0.5);
  assert.equal(fresh.volume, 0.5);
  assert.equal(fresh.muted, false);
  fresh.set({ volume: 7 });
  assert.equal(fresh.volume, 1);
  fresh.set({ volume: -2 });
  assert.equal(fresh.volume, 0);
  fresh.set({ volume: 'loud' });
  assert.equal(fresh.volume, 0, 'nonsense changed the volume');
  fresh.set({ muted: 'yes' });
  assert.equal(fresh.muted, false, 'only true mutes');

  const box = (text) => ({ getItem: (k) => (k === SOUND_KEY ? text : null), setItem() {} });
  for (const text of ['not json', '42', 'null', '{"volume":"x","muted":1}', '{}']) {
    const s = createSoundSettings(box(text), 0.5);
    assert.equal(s.volume, 0.5, text);
    assert.equal(s.muted, false, text);
  }
  assert.equal(createSoundSettings(box('{"volume":0.2,"muted":true}'), 0.5).volume, 0.2);
  assert.equal(createSoundSettings(box('{"volume":0.2,"muted":true}'), 0.5).muted, true);
  assert.equal(createSoundSettings(box('{"volume":9}'), 0.5).volume, 1);

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const s = createSoundSettings(broken, 0.5);
  s.set({ volume: 0.9 });
  assert.equal(s.volume, 0.9, 'the setting should still hold for this visit');
});

test('the sound button says what a click will do', () => {
  assert.equal(soundLabels({ available: true, muted: false, volume: 0.5 }).icon, 'sound');
  assert.match(soundLabels({ available: true, muted: false, volume: 0.5 }).title, /turn it off/);
  assert.equal(soundLabels({ available: true, muted: false, volume: 0.5 }).percent, '50%');
  assert.equal(soundLabels({ available: true, muted: true, volume: 0.5 }).icon, 'muted');
  assert.match(soundLabels({ available: true, muted: true, volume: 0.5 }).title, /turn it on/);
  assert.equal(soundLabels({ available: true, muted: true, volume: 0.5 }).percent, 'Off');
  assert.equal(soundLabels({ available: true, muted: false, volume: 0 }).icon, 'muted');
  assert.equal(soundLabels({ available: false, muted: false, volume: 0.5 }).icon, 'muted');
  assert.match(soundLabels({ available: false, muted: false, volume: 0.5 }).title, /not playing sound/);
});

test('the default volume is moderate', () => {
  assert.ok(DEFAULT_VOLUME >= 0.3 && DEFAULT_VOLUME <= 0.7);
});

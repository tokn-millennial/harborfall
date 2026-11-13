// Makes sounds out of numbers. No sound files and no browser code: a sound is
// worked out sample by sample into a plain list of numbers between -1 and 1,
// which the browser (or a game engine) can then play.
//
// A sound is described by a recipe:
//   { voices: [ voice, voice, ... ] }
// and each voice is one simple tone or burst of noise:
//   wave     'sine', 'triangle' or 'noise'
//   from     pitch at the start, in hertz (for noise: unused)
//   to       pitch at the end. Leave out to hold the pitch.
//   at       when the voice starts, in seconds from the start of the sound
//   for      how long it lasts, in seconds
//   level    how loud, 0 to 1
//   attack   seconds to reach full loudness. Short is sharp, long is soft.
//   lowpass  for noise: muffle everything above about this many hertz
//   lowpassTo  muffle more (or less) by the end
// Every voice fades to silence by its end, so a sound never clicks.

export const SAMPLE_RATE = 44100;

// A small repeatable random source, so a noisy sound is the same every time.
function randomSource(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How long a recipe lasts, in seconds.
export function lengthOf(recipe) {
  return recipe.voices.reduce((end, v) => Math.max(end, (v.at ?? 0) + v.for), 0);
}

function addVoice(out, voice, rate, random) {
  const start = Math.round((voice.at ?? 0) * rate);
  const count = Math.round(voice.for * rate);
  const attack = Math.max(1, Math.round((voice.attack ?? 0.005) * rate));
  const from = voice.from ?? 0;
  const to = voice.to ?? from;
  let phase = 0;
  let low = 0; // the muffling filter's memory
  for (let i = 0; i < count && start + i < out.length; i++) {
    const t = i / count; // 0 at the start of the voice, 1 at its end
    // Loudness: a quick rise, then a curve down to nothing.
    const fade = 1 - t;
    const loud = Math.min(1, i / attack) * fade * fade * voice.level;
    let value;
    if (voice.wave === 'noise') {
      const white = random() * 2 - 1;
      if (voice.lowpass) {
        const cut = voice.lowpass + ((voice.lowpassTo ?? voice.lowpass) - voice.lowpass) * t;
        const k = 1 - Math.exp((-2 * Math.PI * cut) / rate);
        low += (white - low) * k;
        value = low * 2.2; // muffling makes it quieter, so lift it back
      } else {
        value = white;
      }
    } else {
      // The pitch slides smoothly from "from" to "to".
      const pitch = from * Math.pow(to / from, t);
      phase += pitch / rate;
      const turn = phase - Math.floor(phase);
      value = voice.wave === 'triangle' ? 1 - 4 * Math.abs(turn - 0.5) : Math.sin(2 * Math.PI * turn);
    }
    out[start + i] += value * loud;
  }
}

// Turns a recipe into samples.
export function render(recipe, rate = SAMPLE_RATE) {
  const out = new Float32Array(Math.ceil(lengthOf(recipe) * rate) + 1);
  const random = randomSource(recipe.seed ?? 1);
  for (const voice of recipe.voices) addVoice(out, voice, rate, random);
  return out;
}

// A stretch of sea that can be played round and round with no join to hear:
// muffled noise that swells and falls like waves on a shore.
//   seconds   length of the loop
//   swells    how many waves come in during it
export function renderSea({ seconds = 14, swells = 2, level = 0.5, rate = 22050, seed = 5 } = {}) {
  const count = Math.round(seconds * rate);
  const overlap = Math.round(rate * 0.75);
  const random = randomSource(seed);
  const raw = new Float32Array(count + overlap);
  // Two rounds of muffling give the soft rush of water with no hiss.
  let a = 0;
  let b = 0;
  const k = 1 - Math.exp((-2 * Math.PI * 520) / rate);
  for (let i = 0; i < raw.length; i++) {
    a += (random() * 2 - 1 - a) * k;
    b += (a - b) * k;
    raw[i] = b;
  }
  const out = new Float32Array(count);
  let peak = 0;
  for (let i = 0; i < count; i++) {
    // The end of the noise is blended into its start, so the loop has no seam.
    let value = raw[i];
    if (i < overlap) {
      const mix = i / overlap;
      value = raw[i] * mix + raw[count + i] * (1 - mix);
    }
    // Each wave rises quickly and draws back slowly.
    const turn = ((i / count) * swells) % 1;
    const swell = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.pow(turn, 0.7)), 2);
    out[i] = value * swell;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < count; i++) out[i] = (out[i] / peak) * level;
  return out;
}

// The game's sounds, as recipes for the sound maker in synth.js.
// To change a sound, change its numbers. Pitches are in hertz, times in seconds.
// For reference: 262 is middle C, 523 the C above it, 1047 the C above that.
//
// They are meant to be small and soft: a game you play for half an hour should
// not wear on the ear. None lasts more than about a second.

export const SOUNDS = {
  // Picking a tool, or arming a demolish: a small wooden tick.
  pick: {
    voices: [
      { wave: 'sine', from: 880, to: 660, for: 0.05, level: 0.3, attack: 0.002 },
    ],
  },

  // A building goes up: a soft thud with a knock on top.
  place: {
    seed: 11,
    voices: [
      { wave: 'sine', from: 150, to: 70, for: 0.2, level: 0.52, attack: 0.004 },
      { wave: 'triangle', from: 392, to: 330, at: 0.01, for: 0.09, level: 0.22, attack: 0.002 },
      { wave: 'noise', for: 0.06, level: 0.14, attack: 0.001, lowpass: 2400, lowpassTo: 600 },
    ],
  },

  // Road is laid: a short scrape of gravel.
  road: {
    seed: 12,
    voices: [
      { wave: 'noise', for: 0.11, level: 0.3, attack: 0.008, lowpass: 3200, lowpassTo: 1200 },
      { wave: 'sine', from: 220, to: 160, for: 0.07, level: 0.25, attack: 0.003 },
    ],
  },

  // Something is knocked down: a low tumble that dies away.
  demolish: {
    seed: 13,
    voices: [
      { wave: 'noise', for: 0.4, level: 0.32, attack: 0.004, lowpass: 1800, lowpassTo: 200 },
      { wave: 'sine', from: 120, to: 48, for: 0.34, level: 0.42, attack: 0.004 },
      { wave: 'triangle', from: 196, to: 98, at: 0.05, for: 0.16, level: 0.14, attack: 0.003 },
    ],
  },

  // A house is upgraded: two notes going up, a fifth apart.
  upgrade: {
    voices: [
      { wave: 'triangle', from: 523, for: 0.16, level: 0.3, attack: 0.004 },
      { wave: 'sine', from: 523, for: 0.16, level: 0.2, attack: 0.004 },
      { wave: 'triangle', from: 784, at: 0.1, for: 0.34, level: 0.3, attack: 0.004 },
      { wave: 'sine', from: 1568, at: 0.1, for: 0.3, level: 0.08, attack: 0.004 },
    ],
  },

  // The game says no: two low notes going down. Gentle, because it is heard often.
  refuse: {
    voices: [
      { wave: 'triangle', from: 220, for: 0.1, level: 0.3, attack: 0.004 },
      { wave: 'triangle', from: 165, at: 0.09, for: 0.16, level: 0.3, attack: 0.004 },
    ],
  },

  // The win: four notes climbing a chord, the last one held.
  win: {
    voices: [
      { wave: 'triangle', from: 523, at: 0.0, for: 0.22, level: 0.28, attack: 0.005 },
      { wave: 'triangle', from: 659, at: 0.14, for: 0.22, level: 0.28, attack: 0.005 },
      { wave: 'triangle', from: 784, at: 0.28, for: 0.22, level: 0.28, attack: 0.005 },
      { wave: 'triangle', from: 1047, at: 0.42, for: 0.75, level: 0.3, attack: 0.005 },
      { wave: 'sine', from: 523, at: 0.42, for: 0.75, level: 0.16, attack: 0.02 },
      { wave: 'sine', from: 784, at: 0.42, for: 0.75, level: 0.12, attack: 0.02 },
    ],
  },
};

// The sea in the background. See renderSea in synth.js.
export const SEA = { seconds: 14, swells: 2, level: 0.5 };

// How loud the sea is next to the other sounds, and how loud everything is to
// begin with (0 to 1). The player's own setting is remembered after that.
export const SEA_SHARE = 0.3;
export const DEFAULT_VOLUME = 0.5;

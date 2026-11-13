// Plays the game's sounds. The sounds themselves are made in src/audio/ as
// plain lists of numbers. This file hands them to the browser's sound system.
//
// The browser's sound system is passed in (`Context`), so this file has no
// browser code of its own and is tested with a stand-in.
//
// Three things about browsers shape it:
//   - A page may not make a sound until the player has clicked or pressed a
//     key. So nothing is set up until `unlock` is called from such a moment.
//   - Sound may be missing or blocked. Then every call here quietly does nothing.
//   - A hidden tab should be silent.

import { render, renderSea, SAMPLE_RATE } from '../audio/synth.js';

const MIN_GAP_SECONDS = 0.06;   // the same sound is not started again sooner than this
const MAX_AT_ONCE = 6;          // sounds playing together
const MAX_WHILE_WAKING = 2;     // sounds that may wait while the sound system is still starting
const FADE_SECONDS = 0.08;      // volume changes glide, so they do not click
const SEA_RATE = 22050;

// options:
//   Context    the browser's AudioContext class, or null if it has none
//   sounds     name -> recipe (src/audio/sounds.js)
//   sea        settings for the background sea, or null for none
//   seaShare   how loud the sea is next to the other sounds
//   settings   { volume, muted, set({ volume, muted }) } (src/platform/soundSettings.js)
//   silent     true to never make a sound (the test page)
export function createAudio({ Context, sounds, sea = null, seaShare = 0.3, settings, silent = false }) {
  let context = null;
  let master = null;
  let failed = !Context || silent;
  const buffers = new Map();
  const lastStarted = new Map();
  let playing = 0;
  let hidden = false;

  // Loudness follows the square of the setting, which is how a volume slider feels even.
  const level = () => (settings.muted ? 0 : settings.volume * settings.volume);

  function bufferFor(name, samples, rate) {
    if (!buffers.has(name)) {
      const buffer = context.createBuffer(1, samples.length, rate);
      buffer.getChannelData(0).set(samples);
      buffers.set(name, buffer);
    }
    return buffers.get(name);
  }

  function startSea() {
    const source = context.createBufferSource();
    source.buffer = bufferFor('~sea', renderSea({ ...sea, rate: SEA_RATE }), SEA_RATE);
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = seaShare;
    source.connect(gain);
    gain.connect(master);
    source.start();
  }

  // Call from a click or a key press. Safe to call every time.
  function unlock() {
    if (failed) return;
    try {
      if (!context) {
        context = new Context();
        master = context.createGain();
        master.gain.value = level();
        master.connect(context.destination);
        if (sea) startSea();
      }
      if (context.state === 'suspended') context.resume();
    } catch {
      failed = true; // this browser will not play sound: stay quiet for good
    }
  }

  // Plays a sound by name. Returns whether it was started.
  function play(name) {
    const recipe = sounds[name];
    if (failed || !context || !recipe || hidden || settings.muted) return false;
    // A sound system takes a moment to start after the first click. A sound
    // asked for in that moment is still started, and is heard as soon as it is
    // ready. That is how the very first click gets its sound. Only a couple may
    // wait, so they cannot pile up and all go off together.
    const limit = context.state === 'running' ? MAX_AT_ONCE : MAX_WHILE_WAKING;
    const now = context.currentTime;
    if (playing >= limit || (lastStarted.has(name) && now - lastStarted.get(name) < MIN_GAP_SECONDS)) return false;
    try {
      const source = context.createBufferSource();
      source.buffer = bufferFor(name, render(recipe), SAMPLE_RATE);
      source.connect(master);
      source.onended = () => { playing = Math.max(0, playing - 1); };
      source.start();
      lastStarted.set(name, now);
      playing++;
      return true;
    } catch {
      return false;
    }
  }

  function applyLevel() {
    if (!master) return;
    try {
      master.gain.setTargetAtTime(level(), context.currentTime, FADE_SECONDS / 3);
    } catch {
      master.gain.value = level();
    }
  }

  return {
    unlock,
    play,
    get available() {
      return !failed;
    },
    get volume() {
      return settings.volume;
    },
    get muted() {
      return settings.muted;
    },
    setVolume(value) {
      settings.set({ volume: value });
      applyLevel();
    },
    setMuted(value) {
      settings.set({ muted: value });
      applyLevel();
    },
    // A hidden tab goes quiet, and a shown one comes back.
    setHidden(value) {
      hidden = value === true;
      if (!context) return;
      try {
        if (hidden) context.suspend();
        else context.resume();
      } catch {
        // Nothing to do.
      }
    },
  };
}

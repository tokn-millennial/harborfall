// The sound button in the top bar and the volume slider in the ? panel.

import { icon } from './icons.js';

// What the button and the slider's label should say for a given state. No page code.
export function soundLabels({ available, muted, volume }) {
  if (!available) return { icon: 'muted', title: 'This browser is not playing sound', percent: 'Off' };
  const off = muted || volume === 0;
  return {
    icon: off ? 'muted' : 'sound',
    title: off ? 'Sound is off. Click to turn it on.' : 'Sound is on. Click to turn it off.',
    percent: muted ? 'Off' : `${Math.round(volume * 100)}%`,
  };
}

export function createSoundControls({ button, slider, readout, audio }) {
  function refresh() {
    const labels = soundLabels({ available: audio.available, muted: audio.muted, volume: audio.volume });
    button.replaceChildren(icon(labels.icon, { size: 16 }));
    button.title = labels.title;
    button.setAttribute('aria-label', labels.title);
    button.disabled = !audio.available;
    slider.disabled = !audio.available;
    slider.value = String(Math.round(audio.volume * 100));
    readout.textContent = labels.percent;
  }

  button.addEventListener('click', () => {
    // Turning sound back on from zero would be silent, so give it a little.
    if (audio.muted && audio.volume === 0) audio.setVolume(0.3);
    audio.setMuted(!audio.muted);
    refresh();
    audio.play('pick');
  });
  slider.addEventListener('input', () => {
    audio.setVolume(Number(slider.value) / 100);
    if (audio.muted && audio.volume > 0) audio.setMuted(false);
    refresh();
  });
  // One tick when the slider is let go, to hear the new level. The slider then
  // gives up the keyboard, so the arrow keys go back to moving the view.
  slider.addEventListener('change', () => {
    audio.play('pick');
    slider.blur();
  });

  refresh();
  return { refresh };
}

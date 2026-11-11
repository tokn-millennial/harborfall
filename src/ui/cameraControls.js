// Mouse and keyboard control of the camera, plus raw pointer events for the tools.
//   Drag                      pan (unless the active tool wants that button)
//   Mouse wheel               zoom, centred on the cursor
//   W A S D or arrow keys     pan
//   + and -                   zoom, centred on the screen
//   Home or C                 back to the start
//
// Options:
//   shouldPan(button)          asked at mouse-down: does a drag with this button pan the view?
//   onDown(x, y, button)       mouse button went down on the map
//   onMove(x, y)               pointer moved
//   onUp(x, y, button, moved)  button released. `moved` is true if it was a drag, not a click.
//   onHome()                   Home or C was pressed

import { panByScreen, zoomAt } from '../render/camera.js';

const KEY_PAN_SPEED = 700;     // screen pixels per second while a pan key is held
const TAP_NUDGE = 32;          // screen pixels moved at once when a pan key goes down
const DRAG_THRESHOLD = 5;      // pixels the mouse may move and still count as a click
const WHEEL_STRENGTH = 0.0015;

const PAN_KEYS = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};
const PAN_KEY_BY_CHARACTER = {
  arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown',
  a: 'KeyA', d: 'KeyD', w: 'KeyW', s: 'KeyS',
};

export function createCameraControls({ canvas, camera, view, shouldPan = () => true, onDown, onMove, onUp, onHome }) {
  const pointer = { x: 0, y: 0, inside: false };
  const held = new Set();
  let drag = null; // { button, pans, lastX, lastY, startX, startY, moved }

  const position = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (event) => {
    const p = position(event);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.inside = true;
    drag = { button: event.button, pans: shouldPan(event.button), lastX: p.x, lastY: p.y, startX: p.x, startY: p.y, moved: false };
    // Capture keeps the drag alive if the pointer leaves the canvas. It can
    // fail for pointers the browser does not consider active; the drag still works.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // nothing to do
    }
    event.preventDefault();
    onDown?.(p.x, p.y, event.button);
  });

  canvas.addEventListener('pointermove', (event) => {
    const p = position(event);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.inside = true;
    if (drag) {
      if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > DRAG_THRESHOLD) drag.moved = true;
      if (drag.moved && drag.pans) panByScreen(camera, p.x - drag.lastX, p.y - drag.lastY);
      drag.lastX = p.x;
      drag.lastY = p.y;
    }
    onMove?.(p.x, p.y);
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!drag) return;
    const { button, moved } = drag;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const p = position(event);
    onUp?.(p.x, p.y, button, moved);
  });
  canvas.addEventListener('pointercancel', () => {
    if (drag) onUp?.(pointer.x, pointer.y, -1, true);
    drag = null;
  });
  canvas.addEventListener('pointerleave', () => { if (!drag) pointer.inside = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const p = position(event);
    // Some mice report lines, not pixels. Treat a line as about 30 pixels.
    const delta = event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY;
    const factor = Math.exp(-Math.max(-300, Math.min(300, delta)) * WHEEL_STRENGTH);
    zoomAt(camera, view, p.x, p.y, factor);
  }, { passive: false });

  // Letters are matched by position on the keyboard (so W A S D work on any
  // layout), with the typed character as a fallback. Plus and minus are matched
  // by the typed character, because their position differs between layouts.
  const panKey = (event) => (PAN_KEYS[event.code] ? event.code : PAN_KEY_BY_CHARACTER[event.key?.toLowerCase()] ?? null);

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const pan = panKey(event);
    if (pan) {
      // A quick tap must always move the view, even if no frame is drawn while the key is down.
      if (!held.has(pan)) panByScreen(camera, -PAN_KEYS[pan][0] * TAP_NUDGE, -PAN_KEYS[pan][1] * TAP_NUDGE);
      held.add(pan);
      event.preventDefault();
    } else if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
      zoomAt(camera, view, view.width / 2, view.height / 2, 1.25);
    } else if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') {
      zoomAt(camera, view, view.width / 2, view.height / 2, 0.8);
    } else if (event.code === 'Home' || event.code === 'KeyC' || event.key === 'Home' || event.key?.toLowerCase() === 'c') {
      onHome?.();
    }
  });
  window.addEventListener('keyup', (event) => {
    const pan = panKey(event);
    if (pan) held.delete(pan);
  });
  window.addEventListener('blur', () => {
    held.clear();
    if (drag) onUp?.(pointer.x, pointer.y, -1, true);
    drag = null;
  });

  return {
    pointer,
    // True while the view is being dragged around.
    get panning() {
      return drag !== null && drag.moved && drag.pans;
    },
    // Call once per frame with the seconds since the last frame.
    update(dt) {
      let dx = 0;
      let dy = 0;
      for (const code of held) {
        dx += PAN_KEYS[code][0];
        dy += PAN_KEYS[code][1];
      }
      if (dx !== 0 || dy !== 0) panByScreen(camera, -dx * KEY_PAN_SPEED * dt, -dy * KEY_PAN_SPEED * dt);
    },
  };
}

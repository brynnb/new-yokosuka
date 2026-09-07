const MENU_DIRECTIONS = Object.freeze({
  ArrowUp: [0, -1],
  w: [0, -1],
  W: [0, -1],
  ArrowDown: [0, 1],
  s: [0, 1],
  S: [0, 1],
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  A: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
  D: [1, 0],
});

export function menuDirectionForKey(key) {
  return MENU_DIRECTIONS[key] || null;
}

function controlCenter(control) {
  const bounds = control.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

export function findDirectionalControl(current, controls, [directionX, directionY]) {
  const origin = controlCenter(current);
  let best = null;
  let bestScore = Infinity;

  for (const candidate of controls) {
    if (candidate === current) continue;
    const center = controlCenter(candidate);
    const deltaX = center.x - origin.x;
    const deltaY = center.y - origin.y;
    const forward = deltaX * directionX + deltaY * directionY;
    if (forward <= 1) continue;
    const sideways = Math.abs(deltaX * directionY - deltaY * directionX);
    const score = forward + sideways * 2.5;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function acceptsTextInput(element) {
  return element?.matches?.("input, textarea, select, [contenteditable='true']");
}

export class AccountMenuKeyboard {
  constructor({ overlay, sounds = null, documentRoot = document }) {
    this.overlay = overlay;
    this.sounds = sounds;
    this.documentRoot = documentRoot;
    this.onKeyDown = (event) => this.#handleKeyDown(event);
    overlay.addEventListener("keydown", this.onKeyDown);
  }

  dispose() {
    this.overlay.removeEventListener("keydown", this.onKeyDown);
  }

  #handleKeyDown(event) {
    const direction = menuDirectionForKey(event.key);
    if (!direction || acceptsTextInput(event.target)) return;

    const controls = Array.from(
      this.overlay.querySelectorAll("button.account-control:not(:disabled)"),
    );
    if (!controls.length) return;

    event.preventDefault();
    const active = controls.includes(this.documentRoot.activeElement)
      ? this.documentRoot.activeElement
      : controls[0];
    const next = findDirectionalControl(active, controls, direction);
    if (!next) {
      active.focus();
      this.sounds?.blocked();
      return;
    }
    next.focus();
    this.sounds?.move();
  }
}

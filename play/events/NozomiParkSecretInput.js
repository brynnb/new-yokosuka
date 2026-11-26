import { connectedGamepads } from "../input/GamepadDiscovery.js";

// Held-input masks at 1ST_READ's port-zero cache, as consumed by 0x0031(0).
const keyboardMasks = new Map([
  ["Enter", 0x400], ["NumpadEnter", 0x400],
  ["ShiftLeft", 0x200], ["ShiftRight", 0x200],
  ["KeyJ", 0x004], ["KeyY", 0x002],
  ["ArrowUp", 0x1000], ["ArrowDown", 0x2000],
  ["ArrowLeft", 0x4000], ["ArrowRight", 0x8000],
]);
const padMasks = new Map([
  [0, 0x400], [1, 0x200], [2, 0x004], [3, 0x002], [9, 0x800],
  [12, 0x1000], [13, 0x2000], [14, 0x4000], [15, 0x8000],
]);

export class NozomiParkInputCapture {
  constructor({ target = globalThis.window, gamepads = connectedGamepads } = {}) {
    this.target = target;
    this.gamepads = gamepads;
    this.held = new Set();
    this.samples = [];
    this.lastFrame = -1;
    this.keydown = event => { if (keyboardMasks.has(event.code)) this.held.add(event.code); };
    this.keyup = event => this.held.delete(event.code);
    this.blur = () => this.held.clear();
    target?.addEventListener("keydown", this.keydown, true);
    target?.addEventListener("keyup", this.keyup, true);
    target?.addEventListener("blur", this.blur);
  }

  sample(frame) {
    if (!Number.isInteger(frame) || frame < 0 || frame === this.lastFrame) return;
    this.lastFrame = frame;
    let mask = 0;
    for (const code of this.held) mask |= keyboardMasks.get(code);
    const pad = this.gamepads().find(device => device.mapping === "standard");
    if (pad) {
      for (const [index, buttonMask] of padMasks) {
        if (pad.buttons[index]?.pressed) mask |= buttonMask;
      }
      // Retail ORs the two analogue trigger bytes into the held word as
      // soon as either trigger has any nonzero travel (1ST_READ 0x0c136dfc).
      if (pad.buttons[6]?.value > 0) mask |= 0x40;
      if (pad.buttons[7]?.value > 0) mask |= 0x80;
    }
    if (mask !== (this.samples.at(-1)?.mask ?? 0)) this.samples.push({ frame, mask });
  }

  dispose() {
    this.target?.removeEventListener("keydown", this.keydown, true);
    this.target?.removeEventListener("keyup", this.keyup, true);
    this.target?.removeEventListener("blur", this.blur);
    this.held.clear();
  }
}

export function isNozomiParkApproach(cutsceneId) {
  return cutsceneId === "story-s1-nozomi-park-rescue-main"
    || cutsceneId === "story-s1-nozomi-park-rescue-alternate";
}

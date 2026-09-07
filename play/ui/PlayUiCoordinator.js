import { findDirectionalControl } from "../account/AccountMenuKeyboard.js";

export class PlayUiCoordinator {
  constructor({
    canvas,
    controlHintHud,
    getBinding = () => null,
    getMenuRoot = () => null,
    getMenuSounds = () => null,
    getMovementLocked,
    setMovementLocked,
  }) {
    this.canvas = canvas;
    this.controlHintHud = controlHintHud;
    this.getBinding = getBinding;
    this.getMenuRoot = getMenuRoot;
    this.getMenuSounds = getMenuSounds;
    this.getMovementLocked = getMovementLocked;
    this.setMovementLocked = setMovementLocked;
    this.lockOwners = new Set();
    this.movementLockBeforeModals = false;
    this.activeControlHintDevice = "keyboard";
  }

  openModal(owner) {
    if (this.lockOwners.has(owner)) return;
    if (this.lockOwners.size === 0) {
      this.movementLockBeforeModals = Boolean(this.getMovementLocked());
    }
    this.lockOwners.add(owner);
    this.setMovementLocked(true);
  }

  closeModal(owner) {
    if (!this.lockOwners.delete(owner)) return;
    this.setMovementLocked(
      this.lockOwners.size > 0 || this.movementLockBeforeModals,
    );
  }

  handoffModal(owner) {
    this.lockOwners.delete(owner);
  }

  visibleMenuControls() {
    const root = this.getMenuRoot();
    if (!root) return [];
    return Array.from(root.querySelectorAll([
      "button:not(:disabled)",
      "[role='tab']:not([aria-disabled='true'])",
      "[role='slider']:not([aria-disabled='true'])",
      "input:not(:disabled)",
    ].join(","))).filter((control) => {
      const bounds = control.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    });
  }

  menuIsActive() {
    return this.visibleMenuControls().length > 0;
  }

  moveMenuFocus(direction) {
    const controls = this.visibleMenuControls();
    if (!controls.length) return;
    const active = controls.includes(document.activeElement)
      ? document.activeElement
      : controls[0];
    const keyboardKey = {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
    }[direction];
    if (
      active.matches("[role='tab'], [role='slider'], input[type='range']")
      && (direction === "left" || direction === "right")
    ) {
      active.dispatchEvent(new KeyboardEvent("keydown", {
        key: keyboardKey,
        code: keyboardKey,
        bubbles: true,
        cancelable: true,
      }));
      return;
    }
    const vector = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    }[direction];
    const next = findDirectionalControl(active, controls, vector);
    (next || active).focus();
    if (next) this.getMenuSounds()?.move();
    else this.getMenuSounds()?.blocked();
  }

  interactAtCanvasCenter() {
    const bounds = this.canvas.getBoundingClientRect();
    const options = {
      button: 0,
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
    this.canvas.dispatchEvent(new PointerEvent("pointerdown", options));
    this.canvas.dispatchEvent(new PointerEvent("pointerup", options));
  }

  dispatchBoundAction(action) {
    const code = this.getBinding(action);
    if (!code) return;
    window.dispatchEvent(new KeyboardEvent("keydown", {
      code,
      key: code === "Space" ? " " : code,
      bubbles: true,
      cancelable: true,
    }));
    window.dispatchEvent(new KeyboardEvent("keyup", {
      code,
      key: code === "Space" ? " " : code,
      bubbles: true,
      cancelable: true,
    }));
  }

  setActiveControlHintDevice(device) {
    if (
      (device !== "keyboard" && device !== "gamepad")
      || device === this.activeControlHintDevice
    ) return;
    this.activeControlHintDevice = device;
    this.controlHintHud.dataset.inputDevice = device;
  }

  dispose() {
    this.lockOwners.clear();
  }
}

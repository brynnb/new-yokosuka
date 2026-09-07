export const INPUT_CONTEXTS = Object.freeze({
  EXPLORATION: "exploration",
  FORKLIFT: "forklift",
  MENU: "menu",
  POOL: "pool",
});

const clamp = (value, minimum = -1, maximum = 1) => (
  Math.min(maximum, Math.max(minimum, Number(value) || 0))
);

function binding(device, control, scale = 1) {
  return Object.freeze({ device, control, scale });
}

function action(type, bindings) {
  return Object.freeze({ type, bindings: Object.freeze(bindings) });
}

export function createGameplayActionMaps(getKeyBinding = () => null) {
  const key = (name, fallback) => getKeyBinding(name) || fallback;
  const forkliftCameraKey = key("cameraMode", "KeyR");
  const forkliftRaiseKey = key("forkliftRaise", "KeyE");
  const movement = {
    moveX: action("axis", [
      binding("keyboard", key("moveRight", "KeyD"), 1),
      binding("keyboard", "ArrowRight", 1),
      binding("keyboard", key("moveLeft", "KeyA"), -1),
      binding("keyboard", "ArrowLeft", -1),
      binding("gamepad", "moveX"),
      binding("touch", "moveX"),
    ]),
    moveY: action("axis", [
      binding("keyboard", key("moveForward", "KeyW"), 1),
      binding("keyboard", "ArrowUp", 1),
      binding("keyboard", key("moveBackward", "KeyS"), -1),
      binding("keyboard", "ArrowDown", -1),
      binding("gamepad", "moveY"),
      binding("touch", "moveY"),
      binding("virtual", "autoRun"),
    ]),
  };
  return Object.freeze({
    [INPUT_CONTEXTS.EXPLORATION]: Object.freeze({
      ...movement,
      // Keyboard turning is distinct from analog directional movement.
      turn: action("axis", movement.moveX.bindings.filter(({ device }) => device === "keyboard")),
      moveX: action("axis", movement.moveX.bindings.filter(({ device }) => device !== "keyboard")),
      run: action("button", [
        binding("keyboard", key("run", "ShiftLeft")),
        binding("keyboard", "ShiftRight"),
        binding("gamepad", "run"),
        binding("touch", "run"),
      ]),
      runModifier: action("button", [
        binding("gamepad", "runModifier"),
      ]),
    }),
    [INPUT_CONTEXTS.FORKLIFT]: Object.freeze({
      throttle: movement.moveY,
      steering: movement.moveX,
      lift: action("axis", [
        ...(forkliftRaiseKey === forkliftCameraKey
          ? []
          : [binding("keyboard", forkliftRaiseKey, 1)]),
        binding("keyboard", key("forkliftLower", "KeyF"), -1),
        binding("gamepad", "liftRaise", 1),
        binding("gamepad", "liftLower", -1),
        binding("touch", "lift"),
      ]),
      horn: action("button", [
        binding("keyboard", key("forkliftHorn", "KeyH")),
        binding("gamepad", "horn"),
      ]),
    }),
  });
}

export class InputActionSnapshot {
  constructor(context, states) {
    this.context = context;
    this.actions = Object.freeze(states);
    Object.freeze(this);
  }

  state(name) {
    return this.actions[name] || Object.freeze({
      value: 0,
      held: false,
      pressed: false,
      released: false,
    });
  }

  value(name) {
    return this.state(name).value;
  }

  held(name) {
    return this.state(name).held;
  }

  pressed(name) {
    return this.state(name).pressed;
  }

  released(name) {
    return this.state(name).released;
  }
}

export class InputActionSystem {
  constructor({ actionMaps = createGameplayActionMaps() } = {}) {
    this.actionMaps = actionMaps;
    this.devices = new Map();
    this.previousHeld = new Map();
    this.contextStack = [INPUT_CONTEXTS.EXPLORATION];
  }

  setActionMaps(actionMaps) {
    this.actionMaps = actionMaps;
  }

  setValue(device, control, value) {
    if (!this.devices.has(device)) this.devices.set(device, new Map());
    const controls = this.devices.get(device);
    const next = clamp(value);
    if (Math.abs(next) <= 1e-7) controls.delete(control);
    else controls.set(control, next);
  }

  setButton(device, control, held) {
    this.setValue(device, control, held ? 1 : 0);
  }

  clearDevice(device) {
    this.devices.delete(device);
  }

  clearAll() {
    this.devices.clear();
  }

  value(device, control) {
    return this.devices.get(device)?.get(control) || 0;
  }

  setContext(context) {
    if (this.context !== context) this.previousHeld.delete(context);
    this.contextStack = [context];
  }

  pushContext(context) {
    this.contextStack.push(context);
  }

  popContext(context = null) {
    if (this.contextStack.length <= 1) return this.context;
    if (context === null || this.context === context) this.contextStack.pop();
    return this.context;
  }

  get context() {
    return this.contextStack.at(-1);
  }

  snapshot(context = this.context) {
    const definitions = this.actionMaps[context] || {};
    const previous = this.previousHeld.get(context) || new Map();
    const nextPrevious = new Map();
    const states = {};
    for (const [name, definition] of Object.entries(definitions)) {
      const contributions = definition.bindings.map((entry) => (
        this.value(entry.device, entry.control) * entry.scale
      ));
      const value = definition.type === "button"
        ? (contributions.some((entry) => entry > 0.5) ? 1 : 0)
        : clamp(contributions.reduce((sum, entry) => sum + entry, 0));
      const held = definition.type === "button"
        ? value > 0.5
        : Math.abs(value) > 1e-7;
      const wasHeld = previous.get(name) || false;
      states[name] = Object.freeze({
        value,
        held,
        pressed: held && !wasHeld,
        released: !held && wasHeld,
      });
      nextPrevious.set(name, held);
    }
    this.previousHeld.set(context, nextPrevious);
    return new InputActionSnapshot(context, states);
  }
}

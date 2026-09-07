const DEFAULT_BINDINGS = Object.freeze({
  toggle: "KeyF",
  controls: "KeyX",
  hand: "KeyJ",
  leg: "KeyK",
  throw: "KeyL",
  guard: "KeyI",
  run: "ShiftLeft",
  up: "KeyW",
  down: "KeyS",
});

function isEditableTarget(target) {
  return Boolean(target?.closest?.(
    "button, input, textarea, select, [contenteditable='true']",
  ));
}

export class CombatInput {
  constructor({
    target = window,
    bindings = DEFAULT_BINDINGS,
    getBindings = null,
    enableToggle = true,
    now = () => performance.now(),
    chordWindowMs = 75,
    sequentialAttackWindowMs = 250,
  } = {}) {
    this.target = target;
    this.bindings = bindings;
    this.getBindings = getBindings || (() => this.bindings);
    this.enableToggle = Boolean(enableToggle);
    this.now = now;
    this.chordWindowMs = chordWindowMs;
    this.sequentialAttackWindowMs = sequentialAttackWindowMs;
    this.held = new Set();
    this.pressed = [];
    this.pendingAttack = null;
    this.lastAttack = null;
    this.toggleRequested = false;
    this.controlsToggleRequested = false;
    this.attackTokens = (command, activeBindings) => {
      const tokens = [];
      if (this.held.has(activeBindings.run)) tokens.push("run");
      if (this.held.has(activeBindings.guard)) {
        tokens.push("guard", "plus");
      }
      tokens.push(command);
      return tokens;
    };
    this.flushPendingAttack = () => {
      if (!this.pendingAttack) return false;
      this.pressed.push(...this.pendingAttack.tokens);
      this.lastAttack = {
        command: this.pendingAttack.command,
        timestamp: this.pendingAttack.timestamp,
      };
      this.pendingAttack = null;
      return true;
    };
    this.onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      const activeBindings = this.getBindings();
      if (!Object.values(activeBindings).includes(event.code)) return;
      if (!event.repeat) this.held.add(event.code);
      if (event.repeat) return;
      if (this.enableToggle && event.code === activeBindings.toggle) {
        this.toggleRequested = true;
      }
      if (event.code === activeBindings.controls) {
        this.controlsToggleRequested = true;
      }
      for (const direction of ["up", "down"]) {
        if (event.code === activeBindings[direction]) {
          this.pressed.push(direction);
        }
      }
      const attack = ["hand", "leg", "throw"].find(
        (command) => activeBindings[command] === event.code,
      );
      if (attack) {
        const tokens = this.attackTokens(attack, activeBindings);
        // Guard+attack is already a complete native chord (Y+A/Y+B), so emit
        // it atomically. A following attack remains a sequential command, as
        // required by Shadow Blade.
        if (tokens.includes("guard")) {
          this.flushPendingAttack();
          this.pressed.push(...tokens);
          this.lastAttack = { command: attack, timestamp: this.now() };
          return;
        }
        const timestamp = this.now();
        if (
          this.pendingAttack
          && timestamp - this.pendingAttack.timestamp <= this.chordWindowMs
        ) {
          const previous = this.pendingAttack;
          this.pendingAttack = null;
          if (previous.command === attack) {
            this.pressed.push(...previous.tokens, attack);
          } else {
            this.pressed.push(...previous.tokens, "plus", attack);
          }
          this.lastAttack = { command: attack, timestamp };
          return;
        }
        this.flushPendingAttack();
        // Once the chord window has elapsed, another attack is a sequential
        // command component rather than the start of a new ambiguous chord.
        // Emit it immediately so native sequences such as S, J, K do not
        // commit the shorter S, J move while K waits for a second timeout.
        if (
          this.lastAttack
          && timestamp - this.lastAttack.timestamp
            <= this.sequentialAttackWindowMs
        ) {
          this.pressed.push(...tokens);
          this.lastAttack = { command: attack, timestamp };
          return;
        }
        this.pendingAttack = {
          command: attack,
          timestamp,
          tokens,
        };
      }
    };
    this.onKeyUp = (event) => {
      this.held.delete(event.code);
    };
    // Babylon's canvas keyboard handling can stop physical key events before
    // they bubble to window. Capture them on the way down instead, while
    // explicitly ignoring chat and other editable controls.
    target.addEventListener("keydown", this.onKeyDown, true);
    target.addEventListener("keyup", this.onKeyUp, true);
  }

  get guarding() {
    return this.held.has(this.getBindings().guard);
  }

  consumeCommands() {
    if (
      this.pendingAttack
      && this.now() - this.pendingAttack.timestamp >= this.chordWindowMs
    ) {
      this.flushPendingAttack();
    }
    return this.pressed.splice(0);
  }

  discardCommands() {
    this.pressed.length = 0;
    this.pendingAttack = null;
    this.lastAttack = null;
  }

  consumeToggle() {
    const requested = this.toggleRequested;
    this.toggleRequested = false;
    return requested;
  }

  consumeControlsToggle() {
    const requested = this.controlsToggleRequested;
    this.controlsToggleRequested = false;
    return requested;
  }

  dispose() {
    this.target.removeEventListener("keydown", this.onKeyDown, true);
    this.target.removeEventListener("keyup", this.onKeyUp, true);
    this.held.clear();
    this.pressed.length = 0;
    this.pendingAttack = null;
    this.lastAttack = null;
    this.controlsToggleRequested = false;
  }
}

export { DEFAULT_BINDINGS as COMBAT_INPUT_BINDINGS };

import { gamepadPreferences } from "./GamepadPreferences.js";

export const STANDARD_GAMEPAD_CONTROLS = Object.freeze({
  onFoot: Object.freeze([
    ["Left Stick", "Move"],
    ["Right Stick", "Look"],
    ["LT", "Hold run / walk"],
    ["LB", "Toggle run"],
    ["RT / RB", "Toggle camera"],
    ["A", "Interact"],
    ["B", "Advance dialogue"],
    ["X", "Open notebook"],
    ["Y", "Open inventory"],
    ["Menu", "Open settings"],
  ]),
  forklift: Object.freeze([
    ["Left Stick", "Steer"],
    ["RT / LT", "Forward / reverse"],
    ["A / B", "Raise / lower forks"],
    ["Right Stick", "Look"],
    ["LB / RB", "Zoom out / in"],
    ["X", "Toggle camera"],
    ["Y", "Exit forklift"],
  ]),
  pool: Object.freeze([
    ["Left Stick", "Aim / power"],
    ["A", "Line up / shoot / confirm"],
    ["B", "Reset spin"],
    ["X", "Toggle low view"],
    ["Y", "Move cue ball"],
    ["Menu", "Leave table"],
  ]),
});

export function applyGamepadDeadzone(value, deadzone) {
  const input = Number(value) || 0;
  if (Math.abs(input) <= deadzone) return 0;
  const magnitude = (Math.abs(input) - deadzone) / (1 - deadzone);
  return Math.sign(input) * Math.min(1, magnitude);
}

const CONTROLLER_ID_PATTERN =
  /gamepad|controller|xbox|dualshock|dualsense|playstation|nintendo|joy-con|8bitdo|steam deck|logitech/i;
const NON_CONTROLLER_ID_PATTERN =
  /mouse|keyboard|touchpad|trackpad|passthrough|consumer control|virtual device/i;

export function gamepadSuitabilityScore(gamepad) {
  if (!gamepad || gamepad.connected === false) return -Infinity;
  const id = String(gamepad.id || "");
  let score = 0;
  if (gamepad.mapping === "standard") score += 100;
  if (CONTROLLER_ID_PATTERN.test(id)) score += 50;
  if (NON_CONTROLLER_ID_PATTERN.test(id)) score -= 250;
  if ((gamepad.axes?.length || 0) >= 4) score += 20;
  if ((gamepad.buttons?.length || 0) >= 12) score += 20;
  return score;
}

export function selectPreferredGamepad(gamepads, selectedGamepadId = null) {
  const connected = Array.from(gamepads || []).filter(
    (gamepad) => gamepad && gamepad.connected !== false,
  );
  if (selectedGamepadId) {
    const selected = connected.find(
      (gamepad) => gamepad.id === selectedGamepadId,
    );
    if (selected) return selected;
  }
  return connected.sort(
    (left, right) => gamepadSuitabilityScore(right)
      - gamepadSuitabilityScore(left),
  )[0] || null;
}

function buttonPressed(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  return Boolean(button && (button.pressed || button.value > 0.55));
}

function buttonValue(gamepad, index) {
  return Number(gamepad?.buttons?.[index]?.value) || 0;
}

export function gamepadHasActiveInput(gamepad, state) {
  const movementDeadzone = state?.movementDeadzone ?? 0.22;
  const lookDeadzone = state?.lookDeadzone ?? 0.16;
  const axes = gamepad?.axes || [];
  if (
    applyGamepadDeadzone(axes[0], movementDeadzone) !== 0
    || applyGamepadDeadzone(axes[1], movementDeadzone) !== 0
    || applyGamepadDeadzone(
      axes[state?.lookXAxis ?? 2],
      lookDeadzone,
    ) !== 0
    || applyGamepadDeadzone(
      axes[state?.lookYAxis ?? 3],
      lookDeadzone,
    ) !== 0
  ) return true;
  return Array.from(gamepad?.buttons || []).some(
    (button) => button?.pressed || Number(button?.value) > 0.55,
  );
}

export class GamepadInput {
  constructor({
    preferences = gamepadPreferences,
    getGamepads = () => navigator.getGamepads?.() || [],
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (handle) => cancelAnimationFrame(handle),
    actions = null,
    getController = () => null,
    isForkliftMounted = () => false,
    isPoolActive = () => false,
    isPaused = () => false,
    isMenuActive = () => false,
    onMenuDirection = () => {},
    onMenuAccept = () => {},
    onMenuBack = () => {},
    onInteract = () => {},
    onDialogueAdvance = () => {},
    onOpenNotebook = () => {},
    onOpenInventory = () => {},
    onOpenMenu = () => {},
    onExitForklift = () => {},
    onPoolDirection = () => {},
    onPoolAction = () => {},
    onStatusChange = () => {},
    onActiveInput = () => {},
  } = {}) {
    this.preferences = preferences;
    this.getGamepads = getGamepads;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.actions = actions;
    this.getController = getController;
    this.isForkliftMounted = isForkliftMounted;
    this.isPoolActive = isPoolActive;
    this.isPaused = isPaused;
    this.isMenuActive = isMenuActive;
    this.onMenuDirection = onMenuDirection;
    this.onMenuAccept = onMenuAccept;
    this.onMenuBack = onMenuBack;
    this.onInteract = onInteract;
    this.onDialogueAdvance = onDialogueAdvance;
    this.onOpenNotebook = onOpenNotebook;
    this.onOpenInventory = onOpenInventory;
    this.onOpenMenu = onOpenMenu;
    this.onExitForklift = onExitForklift;
    this.onPoolDirection = onPoolDirection;
    this.onPoolAction = onPoolAction;
    this.onStatusChange = onStatusChange;
    this.onActiveInput = onActiveInput;
    this.previousButtons = new Map();
    this.activeIndex = null;
    this.frameHandle = null;
    this.previousTimestamp = null;
    this.previousPadId = null;
    this.activePadKey = null;
    this.inputReady = false;
    this.neutralInputFrames = 0;
    this.previousMenuDirection = null;
    this.menuRepeatAt = 0;
    this.zoomAccumulator = 0;
    this.unsubscribePreferences = this.preferences.subscribe((state) => {
      if (!state.enabled) this.release();
    });
  }

  start() {
    if (this.frameHandle !== null) return;
    this.frameHandle = this.requestFrame((timestamp) => this.#frame(timestamp));
  }

  dispose() {
    if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    this.unsubscribePreferences?.();
    this.release();
  }

  update(timestamp = 0) {
    const deltaSeconds = this.previousTimestamp === null
      ? 0
      : Math.min(0.05, Math.max(0, (timestamp - this.previousTimestamp) / 1000));
    this.previousTimestamp = timestamp;
    const gamepad = this.#selectGamepad();
    this.#syncGamepadConnection(gamepad);
    this.#reportStatus(gamepad);
    const state = this.preferences.getState();
    if (!state.enabled || !gamepad) {
      this.release();
      return;
    }
    if (!this.#updateInputReadiness(gamepad, state)) {
      this.release();
      this.#recordButtons(gamepad);
      return;
    }
    if (gamepadHasActiveInput(gamepad, state)) this.onActiveInput("gamepad");
    if (this.isMenuActive()) {
      this.release();
      this.#updateMenu(gamepad, timestamp, state);
      return;
    }
    if (this.isPoolActive()) {
      this.release();
      this.#updatePool(gamepad, state);
      return;
    }
    if (this.isPaused()) {
      this.release();
      this.#recordButtons(gamepad);
      return;
    }
    this.previousMenuDirection = null;
    this.#updateGameplay(gamepad, deltaSeconds, state);
  }

  release() {
    const controller = this.getController();
    this.actions?.clearDevice("gamepad");
    controller?.setGamepadLookActive?.(false);
    this.onPoolDirection(0, 0);
  }

  #frame(timestamp) {
    this.frameHandle = null;
    this.update(timestamp);
    this.frameHandle = this.requestFrame((next) => this.#frame(next));
  }

  #selectGamepad() {
    const pads = Array.from(this.getGamepads?.() || []);
    const selectedGamepadId = this.preferences.getState().selectedGamepadId;
    const next = selectPreferredGamepad(pads, selectedGamepadId);
    this.activeIndex = next?.index ?? null;
    if (!selectedGamepadId && next?.id) {
      this.preferences.setSelectedGamepadId?.(next.id);
    }
    return next;
  }

  #reportStatus(gamepad) {
    const id = gamepad?.id || null;
    if (id === this.previousPadId) return;
    this.previousPadId = id;
    this.onStatusChange({
      connected: Boolean(gamepad),
      id,
      mapping: gamepad?.mapping || "",
    });
  }

  #syncGamepadConnection(gamepad) {
    const nextKey = gamepad
      ? `${gamepad.index}:${gamepad.id}`
      : null;
    if (nextKey === this.activePadKey) return;
    this.activePadKey = nextKey;
    this.inputReady = false;
    this.neutralInputFrames = 0;
    this.previousButtons.clear();
    this.previousMenuDirection = null;
  }

  #updateInputReadiness(gamepad, state) {
    if (this.inputReady) return true;
    if (gamepadHasActiveInput(gamepad, state)) {
      this.neutralInputFrames = 0;
      return false;
    }
    this.neutralInputFrames += 1;
    if (this.neutralInputFrames < 2) return false;
    this.inputReady = true;
    return true;
  }

  #pressedThisFrame(gamepad, index) {
    const key = `${gamepad.index}:${index}`;
    const pressed = buttonPressed(gamepad, index);
    const previous = this.previousButtons.get(key) || false;
    this.previousButtons.set(key, pressed);
    return pressed && !previous;
  }

  #recordButtons(gamepad) {
    for (let index = 0; index < gamepad.buttons.length; index += 1) {
      this.#pressedThisFrame(gamepad, index);
    }
  }

  #menuDirection(gamepad, state) {
    const horizontal = applyGamepadDeadzone(
      gamepad.axes?.[0],
      state.movementDeadzone,
    );
    const vertical = applyGamepadDeadzone(
      gamepad.axes?.[1],
      state.movementDeadzone,
    );
    if (buttonPressed(gamepad, 12) || vertical < -0.55) return "up";
    if (buttonPressed(gamepad, 13) || vertical > 0.55) return "down";
    if (buttonPressed(gamepad, 14) || horizontal < -0.55) return "left";
    if (buttonPressed(gamepad, 15) || horizontal > 0.55) return "right";
    return null;
  }

  #updateMenu(gamepad, timestamp, state) {
    const direction = this.#menuDirection(gamepad, state);
    if (!direction) {
      this.previousMenuDirection = null;
    } else if (
      direction !== this.previousMenuDirection
      || timestamp >= this.menuRepeatAt
    ) {
      this.onMenuDirection(direction);
      this.menuRepeatAt = timestamp + (
        direction === this.previousMenuDirection ? 110 : 360
      );
      this.previousMenuDirection = direction;
    }
    if (this.#pressedThisFrame(gamepad, 0)) this.onMenuAccept();
    if (this.#pressedThisFrame(gamepad, 1)) this.onMenuBack();
    if (this.#pressedThisFrame(gamepad, 9)) this.onOpenMenu();
    this.#pressedThisFrame(gamepad, 2);
    this.#pressedThisFrame(gamepad, 3);
  }

  #updateGameplay(gamepad, deltaSeconds, state) {
    const controller = this.getController();
    const mounted = this.isForkliftMounted();
    const horizontal = applyGamepadDeadzone(
      gamepad.axes?.[0],
      state.movementDeadzone,
    );
    const vertical = applyGamepadDeadzone(
      gamepad.axes?.[1],
      state.movementDeadzone,
    );
    const leftTrigger = buttonValue(gamepad, 6);
    const rightTrigger = buttonValue(gamepad, 7);
    this.actions?.setValue("gamepad", "moveX", horizontal);
    this.actions?.setValue(
      "gamepad",
      "moveY",
      mounted ? rightTrigger - leftTrigger : -vertical,
    );
    this.actions?.setButton(
      "gamepad",
      "run",
      !mounted && buttonPressed(gamepad, 6),
    );
    this.actions?.setButton(
      "gamepad",
      "runModifier",
      !mounted && buttonPressed(gamepad, 6),
    );
    this.actions?.setButton(
      "gamepad",
      "liftRaise",
      mounted && buttonPressed(gamepad, 0),
    );
    this.actions?.setButton(
      "gamepad",
      "liftLower",
      mounted && buttonPressed(gamepad, 1),
    );
    if (!controller) {
      this.#recordButtons(gamepad);
      return;
    }
    this.#updateCamera(controller, gamepad, deltaSeconds, state);
    if (mounted) this.#updateZoom(controller, gamepad, deltaSeconds);

    const leftShoulderPressed = this.#pressedThisFrame(gamepad, 4);
    const rightShoulderPressed = this.#pressedThisFrame(gamepad, 5);
    const rightTriggerPressed = this.#pressedThisFrame(gamepad, 7);
    const interactPressed = this.#pressedThisFrame(gamepad, 0);
    const dialoguePressed = this.#pressedThisFrame(gamepad, 1);
    const notebookPressed = this.#pressedThisFrame(gamepad, 2);
    const inventoryPressed = this.#pressedThisFrame(gamepad, 3);
    const menuPressed = this.#pressedThisFrame(gamepad, 9);

    if (!mounted && leftShoulderPressed) {
      controller.toggleRun?.();
    }
    const cameraToggleRequested = (
      !mounted
      && (rightShoulderPressed || rightTriggerPressed)
    );
    if (cameraToggleRequested) {
      controller.setFirstPerson?.(!controller.firstPerson);
    }

    if (interactPressed && !mounted) this.onInteract();
    if (dialoguePressed && !mounted) {
      this.onDialogueAdvance();
    }
    if (notebookPressed) {
      if (mounted) controller.setFirstPerson?.(!controller.firstPerson);
      else this.onOpenNotebook();
    }
    if (inventoryPressed) {
      if (mounted) this.onExitForklift();
      else this.onOpenInventory();
    }
    if (menuPressed) this.onOpenMenu();
  }

  #updatePool(gamepad, state) {
    const horizontal = applyGamepadDeadzone(
      gamepad.axes?.[0],
      state.movementDeadzone,
    );
    const vertical = applyGamepadDeadzone(
      gamepad.axes?.[1],
      state.movementDeadzone,
    );
    this.onPoolDirection(horizontal, -vertical);
    if (this.#pressedThisFrame(gamepad, 0)) this.onPoolAction("primary");
    if (this.#pressedThisFrame(gamepad, 1)) this.onPoolAction("resetSpin");
    if (this.#pressedThisFrame(gamepad, 2)) this.onPoolAction("lowView");
    if (this.#pressedThisFrame(gamepad, 3)) this.onPoolAction("moveCueBall");
    if (this.#pressedThisFrame(gamepad, 9)) this.onPoolAction("leave");
  }

  #updateCamera(controller, gamepad, deltaSeconds, state) {
    const horizontal = applyGamepadDeadzone(
      (gamepad.axes?.[state.lookXAxis ?? 2] || 0)
        * (state.lookXAxisSign ?? 1),
      state.lookDeadzone,
    );
    const vertical = applyGamepadDeadzone(
      (gamepad.axes?.[state.lookYAxis ?? 3] || 0)
        * (state.lookYAxisSign ?? 1),
      state.lookDeadzone,
    );
    const verticalDirection = state.invertLookY ? -1 : 1;
    const active = horizontal !== 0 || vertical !== 0;
    controller.setGamepadLookActive?.(active);
    controller.orbitBy?.(
      horizontal * state.lookSensitivity * 2.4 * deltaSeconds,
      vertical * verticalDirection * state.lookSensitivity * 1.8 * deltaSeconds,
    );
  }

  #updateZoom(controller, gamepad, deltaSeconds) {
    const zoomOut = buttonPressed(gamepad, 4);
    const zoomIn = buttonPressed(gamepad, 5);
    if (zoomOut === zoomIn) {
      this.zoomAccumulator = 0;
      return;
    }
    this.zoomAccumulator += deltaSeconds * 8;
    while (this.zoomAccumulator >= 1) {
      controller.applyCameraZoom?.(zoomOut ? 1 : -1);
      this.zoomAccumulator -= 1;
    }
  }

}

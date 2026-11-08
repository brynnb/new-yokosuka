import assert from "node:assert/strict";
import test from "node:test";

import {
  GamepadInput,
  applyGamepadDeadzone,
  gamepadHasActiveInput,
  gamepadSuitabilityScore,
  selectPreferredGamepad,
} from "../play/input/GamepadInput.js";
import {
  INPUT_CONTEXTS,
  InputActionSystem,
  createGameplayActionMaps,
} from "../play/input/InputActions.js";
import { StoryQteRuntime } from "../play/scripts/StoryQteRuntime.js";

function pad({ axes = [0, 0, 0, 0], pressed = [], values = {} } = {}) {
  return {
    id: "Standard Test Pad",
    index: 0,
    connected: true,
    mapping: "standard",
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: pressed.includes(index),
      value: values[index] ?? (pressed.includes(index) ? 1 : 0),
    })),
  };
}

function preferences(overrides = {}) {
  const state = {
    enabled: true,
    selectedGamepadId: null,
    movementDeadzone: 0.2,
    lookDeadzone: 0.15,
    lookSensitivity: 1,
    invertLookY: false,
    lookXAxis: 2,
    lookYAxis: 3,
    lookXAxisSign: 1,
    lookYAxisSign: 1,
    ...overrides,
  };
  return {
    getState: () => state,
    subscribe: () => () => {},
    setSelectedGamepadId: (id) => {
      state.selectedGamepadId = id;
    },
  };
}

function controller() {
  return {
    keys: new Set(),
    firstPerson: false,
    cameraDistance: 3,
    thirdPersonCameraDistance: 3,
    options: { cameraMinDistance: 0.9 },
    movements: [],
    orbits: [],
    zooms: [],
    gamepadLookStates: [],
    runToggled: false,
    setTouchMovement(x, y, options) {
      this.movements.push([x, y, options]);
    },
    clearTouchMovement() {},
    orbitBy(x, y) {
      this.orbits.push([x, y]);
    },
    setGamepadLookActive(active) {
      this.gamepadLookStates.push(active);
    },
    applyCameraZoom(direction) {
      this.zooms.push(direction);
    },
    setFirstPerson(enabled) {
      this.firstPerson = enabled;
    },
    toggleRun() {
      this.runToggled = !this.runToggled;
    },
  };
}

test("gamepad deadzones rescale the usable analog range", () => {
  assert.equal(applyGamepadDeadzone(0.1, 0.2), 0);
  assert.equal(applyGamepadDeadzone(-0.1, 0.2), 0);
  assert.equal(applyGamepadDeadzone(1, 0.2), 1);
  assert.equal(applyGamepadDeadzone(-1, 0.2), -1);
  assert.ok(applyGamepadDeadzone(0.6, 0.2) > 0.49);
});

test("active gamepad input ignores stick and trigger drift", () => {
  const state = preferences().getState();
  assert.equal(gamepadHasActiveInput(pad({
    axes: [0.1, -0.1, 0.1, -0.1],
    values: { 6: 0.2 },
  }), state), false);
  assert.equal(gamepadHasActiveInput(pad({
    axes: [0, 0, 0.4, 0],
  }), state), true);
  assert.equal(gamepadHasActiveInput(pad({ pressed: [0] }), state), true);
});

test("gamepad selection prefers a real standard controller over passthrough input", () => {
  const passthrough = {
    ...pad(),
    id: "Mouse passthrough (absolute)",
    index: 0,
    mapping: "",
  };
  const xbox = {
    ...pad(),
    id: "Xbox Wireless Controller",
    index: 1,
  };
  assert.ok(
    gamepadSuitabilityScore(xbox) > gamepadSuitabilityScore(passthrough),
  );
  assert.equal(selectPreferredGamepad([passthrough, xbox]), xbox);
});

test("gamepad selection retains an available saved controller", () => {
  const xbox = { ...pad(), id: "Xbox Wireless Controller", index: 0 };
  const saved = {
    ...pad(),
    id: "My Raw Gamepad",
    index: 1,
    mapping: "",
  };
  assert.equal(
    selectPreferredGamepad([xbox, saved], saved.id),
    saved,
  );
});

test("standard gamepad drives analog movement, camera, and actions", () => {
  let currentPad = pad();
  const activePad = pad({
    axes: [0.6, -0.8, 0.5, -0.4],
    pressed: [0],
    values: { 6: 0.9 },
  });
  const player = controller();
  const actionSystem = new InputActionSystem();
  const actions = [];
  const activeDevices = [];
  const input = new GamepadInput({
    preferences: preferences(),
    getGamepads: () => [currentPad],
    actions: actionSystem,
    getController: () => player,
    onActiveInput: (device) => activeDevices.push(device),
    onInteract: () => actions.push("interact"),
  });
  input.update(0);
  input.update(16);
  currentPad = activePad;
  input.update(32);
  const snapshot = actionSystem.snapshot(INPUT_CONTEXTS.EXPLORATION);
  assert.ok(snapshot.value("moveX") > 0);
  assert.ok(snapshot.value("moveY") > 0);
  assert.equal(snapshot.held("run"), true);
  assert.ok(player.orbits.at(-1)[0] > 0);
  assert.ok(player.orbits.at(-1)[1] < 0);
  assert.equal(player.gamepadLookStates.at(-1), true);
  assert.deepEqual(activeDevices, ["gamepad"]);
  assert.deepEqual(actions, ["interact"]);

  currentPad = pad();
  input.update(48);
  currentPad = pad({ values: { 7: 1 } });
  input.update(64);
  assert.equal(player.firstPerson, true);
  currentPad = pad();
  input.update(80);
  currentPad = pad({ pressed: [5] });
  input.update(96);
  assert.equal(player.firstPerson, false);
  input.dispose();
  assert.equal(player.gamepadLookStates.at(-1), false);
});

test("Story QTE owns gamepad buttons and does not inherit or leak held input", () => {
  let currentPad=pad(),qteVisible=false;
  const results=[],actions=[],player=controller(),actionSystem=new InputActionSystem();
  const qte=new StoryQteRuntime({now:()=>0,schedule:()=>1,cancel(){},present(){},finish:outcome=>results.push(outcome)});
  const input=new GamepadInput({preferences:preferences(),getGamepads:()=>[currentPad],getController:()=>player,
    actions:actionSystem,isStoryQteActive:()=>qteVisible,onStoryQteButton:(code,pressed)=>pressed?qte.press(code):qte.release(code),
    onInteract:()=>actions.push("interact"),onDialogueAdvance:()=>actions.push("advance"),onOpenNotebook:()=>actions.push("notebook")});
  input.update(0);input.update(16);
  currentPad=pad({pressed:[1]});input.update(32);assert.deepEqual(actions,["advance"]);
  qteVisible=true;qte.start({buttons:["B","A","B","A"],windowMs:2000});
  input.update(48);assert.equal(qte.active.index,0); // Held dialogue B is suppressed.
  for(const [at,pressed] of [[64,[]],[80,[1]],[96,[]],[112,[0]],[128,[]],[144,[1]],[160,[]],[176,[0]]]) {
    currentPad=pad({pressed});input.update(at);
  }
  assert.deepEqual(results,["success"]);assert.deepEqual(actions,["advance"]);
  assert.equal(actionSystem.snapshot(INPUT_CONTEXTS.EXPLORATION).value("moveY"),0);
  qteVisible=false;input.update(192);input.update(208); // A remains held after the QTE.
  assert.deepEqual(actions,["advance"]);
  currentPad=pad();input.update(224);input.update(240);
  currentPad=pad({pressed:[0]});input.update(256);
  assert.deepEqual(actions,["advance","interact"]);input.dispose();
});

test("Story QTE directions merge stick and d-pad and support held chords", () => {
  let currentPad=pad(),active=true;
  const results=[],events=[];
  const qte=new StoryQteRuntime({now:()=>0,schedule:()=>1,cancel(){},present(){},finish:outcome=>results.push(outcome)});
  const input=new GamepadInput({preferences:preferences(),getGamepads:()=>[currentPad],isStoryQteActive:()=>active,
    onStoryQteButton:(code,pressed)=>{events.push([code,pressed]);if(pressed)qte.press(code);else qte.release(code);}});
  input.update(0);input.update(16);
  qte.start({steps:[{buttons:["Left","A"],windowMs:2000},{buttons:["Right"],windowMs:2000}]});
  currentPad=pad({axes:[-1,0,0,0]});input.update(32);
  currentPad=pad({axes:[-1,0,0,0],pressed:[0,14]});input.update(48);
  assert.equal(qte.active.index,1);
  currentPad=pad({pressed:[14]});input.update(64); // Stick released; d-pad still holds Left.
  assert.equal(events.filter(([code,pressed])=>code==="Left"&&!pressed).length,0);
  currentPad=pad();input.update(80);
  currentPad=pad({pressed:[15]});input.update(96);
  assert.deepEqual(results,["success"]);
  active=false;input.update(112);input.dispose();
});

test("disconnecting or disabling a gamepad releases a held Story QTE button", () => {
  let currentPad=pad(),active=true;
  const events=[],prefs=preferences();
  const input=new GamepadInput({preferences:prefs,getGamepads:()=>currentPad?[currentPad]:[],isStoryQteActive:()=>active,
    onStoryQteButton:(code,pressed)=>events.push([code,pressed])});
  input.update(0);input.update(16);currentPad=pad({pressed:[0]});input.update(32);
  currentPad=null;input.update(48);assert.deepEqual(events,[["A",true],["A",false]]);
  currentPad=pad();input.update(64);input.update(80);currentPad=pad({pressed:[1]});input.update(96);
  prefs.getState().enabled=false;input.update(112);
  assert.deepEqual(events.slice(-2),[["B",true],["B",false]]);input.dispose();
});

test("Dreamcast-style gamepad buttons open notebook, inventory, and settings", () => {
  let currentPad = pad();
  const actions = [];
  const input = new GamepadInput({
    preferences: preferences(),
    getGamepads: () => [currentPad],
    getController: () => controller(),
    onOpenNotebook: () => actions.push("notebook"),
    onOpenInventory: () => actions.push("inventory"),
    onOpenMenu: () => actions.push("settings"),
  });

  input.update(0);
  input.update(8);
  currentPad = pad({ pressed: [2] });
  input.update(16);
  currentPad = pad();
  input.update(32);
  currentPad = pad({ pressed: [3] });
  input.update(48);
  currentPad = pad();
  input.update(64);
  currentPad = pad({ pressed: [9] });
  input.update(80);

  assert.deepEqual(actions, ["notebook", "inventory", "settings"]);
  input.dispose();
});

test("left shoulder toggles the persistent run preference", () => {
  let currentPad = pad();
  const player = controller();
  const input = new GamepadInput({
    preferences: preferences(),
    getGamepads: () => [currentPad],
    getController: () => player,
  });

  input.update(0);
  input.update(8);
  currentPad = pad({ pressed: [4] });
  input.update(16);
  input.update(32);
  assert.equal(player.runToggled, true);
  currentPad = pad();
  input.update(48);
  currentPad = pad({ pressed: [4] });
  input.update(64);
  assert.equal(player.runToggled, false);
  input.dispose();
});

test("left trigger drift does not pull the camera into first person", () => {
  const player = controller();
  const input = new GamepadInput({
    preferences: preferences(),
    getGamepads: () => [pad({ values: { 6: 0.2 } })],
    getController: () => player,
  });
  input.update(0);
  input.update(1000);
  assert.equal(player.cameraDistance, 3);
  assert.equal(player.firstPerson, false);
  input.dispose();
});

test("camera look uses the saved raw-controller axes and directions", () => {
  const player = controller();
  let currentPad = pad();
  const input = new GamepadInput({
    preferences: preferences({
      lookXAxis: 5,
      lookYAxis: 4,
      lookXAxisSign: -1,
      lookYAxisSign: -1,
    }),
    getGamepads: () => [currentPad],
    getController: () => player,
  });
  input.update(0);
  input.update(16);
  currentPad = pad({ axes: [0, 0, 0, 0, 0.7, -0.8] });
  input.update(32);
  assert.ok(player.orbits.at(-1)[0] > 0);
  assert.ok(player.orbits.at(-1)[1] < 0);
  input.dispose();
});

test("forklift mapping uses triggers for travel and face buttons for forks", () => {
  const player = controller();
  const actionSystem = new InputActionSystem();
  let currentPad = pad();
  const input = new GamepadInput({
    preferences: preferences(),
    getGamepads: () => [currentPad],
    actions: actionSystem,
    getController: () => player,
    isForkliftMounted: () => true,
  });
  input.update(0);
  input.update(16);
  currentPad = pad({
    axes: [-0.5, 0, 0, 0],
    pressed: [0],
    values: { 6: 0.25, 7: 0.8 },
  });
  input.update(32);
  const snapshot = actionSystem.snapshot(INPUT_CONTEXTS.FORKLIFT);
  assert.ok(snapshot.value("steering") < 0);
  assert.equal(snapshot.value("throttle"), 0.55);
  assert.equal(snapshot.value("lift"), 1);
  assert.equal(player.keys.has("KeyR"), false);
  input.dispose();
});

test("gamepad release never clears keyboard-owned forklift controls", () => {
  const player = controller();
  player.keys.add("KeyE");
  const actionSystem = new InputActionSystem({
    actionMaps: createGameplayActionMaps(),
  });
  actionSystem.setButton("keyboard", "KeyE", true);
  const input = new GamepadInput({
    preferences: preferences({ enabled: false }),
    getGamepads: () => [pad()],
    actions: actionSystem,
    getController: () => player,
    isForkliftMounted: () => true,
  });
  input.update(0);
  assert.equal(player.keys.has("KeyE"), true);
  assert.equal(
    actionSystem.snapshot(INPUT_CONTEXTS.FORKLIFT).value("lift"),
    1,
  );
  input.dispose();
});

test("menu mode repeats directions and maps A and B to navigation actions", () => {
  let currentPad = pad();
  const actions = [];
  const input = new GamepadInput({
    preferences: preferences(),
    getGamepads: () => [currentPad],
    isMenuActive: () => true,
    onMenuDirection: (direction) => actions.push(direction),
    onMenuAccept: () => actions.push("accept"),
    onMenuBack: () => actions.push("back"),
  });
  input.update(0);
  input.update(16);
  currentPad = pad({ axes: [0, 1, 0, 0], pressed: [0] });
  input.update(100);
  input.update(500);
  currentPad = pad({ pressed: [1] });
  input.update(600);
  assert.deepEqual(actions, ["down", "accept", "down", "back"]);
  input.dispose();
});

test("pool mapping uses the left stick and dedicated face-button actions", () => {
  const directions = [];
  const actions = [];
  let currentPad = pad();
  const input = new GamepadInput({
    preferences: preferences(),
    getGamepads: () => [currentPad],
    isPoolActive: () => true,
    onPoolDirection: (horizontal, vertical) => {
      directions.push([horizontal, vertical]);
    },
    onPoolAction: (action) => actions.push(action),
  });
  input.update(0);
  input.update(16);
  currentPad = pad({
    axes: [0.6, -0.7, 0, 0],
    pressed: [0, 2],
  });
  input.update(32);
  assert.ok(directions.at(-1)[0] > 0);
  assert.ok(directions.at(-1)[1] > 0);
  assert.deepEqual(actions, ["primary", "lowView"]);
  input.dispose();
});

test("a connecting gamepad cannot emit phantom menu actions", () => {
  let currentPad = null;
  const actions = [];
  const input = new GamepadInput({
    preferences: preferences(),
    getGamepads: () => currentPad ? [currentPad] : [],
    isMenuActive: () => true,
    onMenuBack: () => actions.push("back"),
    onOpenMenu: () => actions.push("settings"),
  });

  input.update(0);
  currentPad = pad({ pressed: [1, 9] });
  input.update(16);
  input.update(32);
  currentPad = pad();
  input.update(48);
  input.update(64);
  assert.deepEqual(actions, []);

  currentPad = pad({ pressed: [9] });
  input.update(80);
  assert.deepEqual(actions, ["settings"]);
  input.dispose();
});

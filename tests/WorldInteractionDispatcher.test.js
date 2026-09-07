import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { WorldInteractionDispatcher } from "../play/interactions/WorldInteractionDispatcher.js";

function createHarness() {
  const candidates = [];
  const calls = [];
  const observable = {
    added: null,
    removed: null,
    add(callback) {
      this.added = { callback };
      return this.added;
    },
    remove(observer) { this.removed = observer; },
  };
  const scene = {
    pointerX: 12,
    pointerY: 24,
    onPointerObservable: observable,
    pick(_x, _y, predicate) {
      const pickedMesh = candidates.find(mesh => predicate(mesh));
      return pickedMesh
        ? { hit: true, distance: 1, pickedMesh }
        : { hit: false, pickedMesh: null };
    },
  };
  let ready = true;
  let canStart = true;
  const dispatcher = new WorldInteractionDispatcher({
    arcade: {
      getGames: () => null,
      cabinetView: { focusOnly: false, setActive() {} },
      paddleRuntime: { press: index => calls.push(["paddle", index]) },
      setMovementLocked: locked => calls.push(["lock", locked]),
    },
    camera: {},
    debug: {
      collisionPicker: { active: false },
      debugPanel: { showNpc: npc => calls.push(["debug-npc", npc]) },
      enabled: false,
      lightDebugger: { select: light => calls.push(["light", light]) },
      showLights: () => false,
      trianglePicker: { active: false },
    },
    forklift: {
      mode: { rightParked: () => false, enter: entry => calls.push(["forklift", entry]) },
      network: { availableForLocalEntry: () => true },
    },
    getActorPosition: () => ({ x: 0, y: 0, z: 0 }),
    getReady: () => ready,
    getWorld: () => ({ id: "interior", nativeArea: "ROOM" }),
    interactions: {
      authMovement: { play: value => calls.push(["auth", value]) },
      cinemaSeat: { enter: value => calls.push(["seat", value]) },
      clock: { ring: value => calls.push(["clock", value]) },
      door: { toggle: value => calls.push(["door", value]) },
      drawer: { toggle: value => calls.push(["drawer", value]) },
      inspectable: {
        inspect: value => calls.push(["inspect", value]),
        showHint: value => calls.push(["hint", value]),
      },
      vending: { open: value => calls.push(["vending", value]) },
    },
    openPoolChooser: () => true,
    playUi: { openModal: value => calls.push(["modal", value]) },
    poolRuntime: { active: false },
    scene,
    scriptedInteractions: {
      canStart: () => canStart,
      startNpc: npc => calls.push(["npc", npc]),
      startObject: value => calls.push(["script-object", value]),
      startNativeObject: () => false,
    },
    travelTransitions: {
      pending: false,
      beginDoor: (...args) => calls.push(["travel-door", ...args]),
      beginBoundary: value => calls.push(["travel-boundary", value]),
    },
    worldMapLayerState: { activeLayerForMesh: () => null },
  });
  const pointerInfo = mesh => ({
    type: BABYLON.PointerEventTypes.POINTERPICK,
    event: { button: 0 },
    pickInfo: { hit: Boolean(mesh), pickedMesh: mesh || null },
  });
  return {
    calls,
    candidates,
    dispatcher,
    observable,
    pointerInfo,
    setCanStart: value => { canStart = value; },
    setReady: value => { ready = value; },
  };
}

test("dispatcher owns its pointer observer lifecycle", () => {
  const harness = createHarness();
  harness.dispatcher.start();
  const observer = harness.observable.added;
  assert.ok(observer);
  harness.dispatcher.start();
  assert.equal(harness.observable.added, observer);
  harness.dispatcher.dispose();
  assert.equal(harness.observable.removed, observer);
});

test("an NPC pick takes precedence over world-object routing", () => {
  const harness = createHarness();
  const npc = {
    metadata: {
      scheduledActor: "NOZ_",
      scheduledActorInstanceId: "nozomi",
      scheduledActorLabel: "Nozomi",
    },
  };
  harness.dispatcher.handle(harness.pointerInfo(npc));
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0][0], "npc");
  assert.equal(harness.calls[0][1].id, "nozomi");
});

test("presentation ownership blocks gameplay routing", () => {
  const harness = createHarness();
  harness.setCanStart(false);
  harness.candidates.push({
    metadata: {
      interactiveClock: {
        root: { position: { x: 1, y: 0, z: 1 } },
      },
    },
  });
  harness.dispatcher.handle(harness.pointerInfo(null));
  assert.deepEqual(harness.calls, []);
});

test("a nearby pool table opens the chooser through modal ownership", () => {
  const harness = createHarness();
  harness.candidates.push({
    metadata: {
      interactivePool: { root: { position: { x: 2, y: 0, z: 3 } } },
    },
  });
  harness.dispatcher.handle(harness.pointerInfo(null));
  assert.deepEqual(harness.calls, [["modal", "pool-chooser"]]);
});

test("not-ready worlds ignore pointer interactions", () => {
  const harness = createHarness();
  harness.setReady(false);
  harness.dispatcher.handle(harness.pointerInfo(null));
  assert.deepEqual(harness.calls, []);
});

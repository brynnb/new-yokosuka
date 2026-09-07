import assert from "node:assert/strict";
import test from "node:test";
import { DeviceType, Observable } from "@babylonjs/core";

import { BabylonInputDevice } from "../play/input/BabylonInputDevice.js";
import { InputActionSystem } from "../play/input/InputActions.js";

test("Babylon keyboard device events update only the keyboard source", () => {
  const manager = {
    onDeviceConnectedObservable: new Observable(),
    onDeviceDisconnectedObservable: new Observable(),
    dispose() {},
  };
  const listeners = new Map();
  const eventTarget = {
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
  };
  const actions = new InputActionSystem();
  const activeDevices = [];
  actions.setButton("gamepad", "liftRaise", true);
  const device = new BabylonInputDevice({
    engine: null,
    actions,
    manager,
    eventTarget,
    onActiveInput: (deviceType) => activeDevices.push(deviceType),
  });
  const source = {
    deviceType: DeviceType.Keyboard,
    onInputChangedObservable: new Observable(),
  };
  manager.onDeviceConnectedObservable.notifyObservers(source);
  source.onInputChangedObservable.notifyObservers({
    code: "KeyR",
    type: "keydown",
    target: {},
  });
  assert.equal(actions.value("keyboard", "KeyR"), 1);
  assert.deepEqual(activeDevices, ["keyboard"]);
  source.onInputChangedObservable.notifyObservers({
    code: "KeyR",
    type: "keyup",
    target: {},
  });
  assert.equal(actions.value("keyboard", "KeyR"), 0);
  assert.equal(actions.value("gamepad", "liftRaise"), 1);

  source.onInputChangedObservable.notifyObservers({
    code: "KeyB",
    type: "keydown",
    target: {},
    isTrusted: false,
  });
  assert.deepEqual(activeDevices, ["keyboard"]);

  actions.setButton("keyboard", "KeyR", true);
  listeners.get("blur")();
  assert.equal(actions.value("keyboard", "KeyR"), 0);
  assert.equal(actions.value("gamepad", "liftRaise"), 1);
  device.dispose();
});

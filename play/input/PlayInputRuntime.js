import {
  INPUT_CONTEXTS,
  InputActionSystem,
  createGameplayActionMaps,
} from "./InputActions.js";

export class PlayInputRuntime {
  constructor({ getBinding }) {
    this.getBinding = getBinding;
    this.actions = new InputActionSystem({
      actionMaps: createGameplayActionMaps(getBinding),
    });
    this.currentSnapshot = null;
    this.devices = [];
  }

  attachDevice(device) {
    this.devices.push(device);
    return device;
  }

  refreshBindings() {
    this.actions.setActionMaps(createGameplayActionMaps(this.getBinding));
  }

  snapshot({ controller, mobileControls, vehicleActive }) {
    this.actions.setValue("touch", "moveX", controller.touchInput.x);
    this.actions.setValue("touch", "moveY", controller.touchInput.y);
    this.actions.setButton("touch", "run", controller.touchRunning);
    this.actions.setValue("touch", "lift", mobileControls.forkLiftInput);
    this.actions.setButton("virtual", "autoRun", controller.autoRun);
    this.actions.setContext(
      vehicleActive
        ? INPUT_CONTEXTS.FORKLIFT
        : INPUT_CONTEXTS.EXPLORATION,
    );
    this.currentSnapshot = this.actions.snapshot();
    return this.currentSnapshot;
  }

  forkliftSnapshot() {
    return this.currentSnapshot?.context === INPUT_CONTEXTS.FORKLIFT
      ? this.currentSnapshot
      : null;
  }

  dispose() {
    for (const device of this.devices) device.dispose();
    this.devices = [];
    this.actions.clearAll();
    this.currentSnapshot = null;
  }
}

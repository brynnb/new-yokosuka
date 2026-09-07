import {
  DeviceSourceManager,
  DeviceType,
} from "@babylonjs/core";

function isEditableTarget(target) {
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
    target?.tagName,
  );
}

export class BabylonInputDevice {
  constructor({
    engine,
    actions,
    manager = new DeviceSourceManager(engine),
    eventTarget = globalThis.window,
    onActiveInput = () => {},
  }) {
    this.actions = actions;
    this.manager = manager;
    this.onActiveInput = onActiveInput;
    this.keyboardObservers = new Map();
    this.connectedObserver = manager.onDeviceConnectedObservable.add(
      (source) => this.#connect(source),
    );
    this.disconnectedObserver = manager.onDeviceDisconnectedObservable.add(
      (source) => this.#disconnect(source),
    );
    this.onBlur = () => this.actions.clearDevice("keyboard");
    eventTarget?.addEventListener?.("blur", this.onBlur);
    this.removeBlurListener = () => eventTarget?.removeEventListener?.(
      "blur",
      this.onBlur,
    );
  }

  #connect(source) {
    if (source?.deviceType !== DeviceType.Keyboard) return;
    if (this.keyboardObservers.has(source)) return;
    const observer = source.onInputChangedObservable.add((event) => {
      if (!event?.code || isEditableTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey) {
        this.actions.setButton("keyboard", event.code, false);
        return;
      }
      // Some controller actions intentionally dispatch legacy keyboard events.
      // Do not let those synthetic events switch the hints back to keyboard.
      if (event.type === "keydown" && event.isTrusted !== false) {
        this.onActiveInput("keyboard");
      }
      this.actions.setButton(
        "keyboard",
        event.code,
        event.type === "keydown",
      );
    });
    this.keyboardObservers.set(source, observer);
  }

  #disconnect(source) {
    const observer = this.keyboardObservers.get(source);
    if (observer) source.onInputChangedObservable.remove(observer);
    this.keyboardObservers.delete(source);
    if (source?.deviceType === DeviceType.Keyboard) {
      this.actions.clearDevice("keyboard");
    }
  }

  dispose() {
    for (const [source, observer] of this.keyboardObservers) {
      source.onInputChangedObservable.remove(observer);
    }
    this.keyboardObservers.clear();
    this.manager.onDeviceConnectedObservable.remove(this.connectedObserver);
    this.manager.onDeviceDisconnectedObservable.remove(
      this.disconnectedObserver,
    );
    this.removeBlurListener?.();
    this.actions.clearDevice("keyboard");
    this.manager.dispose();
  }
}

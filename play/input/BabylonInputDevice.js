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
    // Babylon listens on the canvas. A menu can take focus between keydown
    // and keyup; always release that key even when the UI receives the event.
    this.onKeyUp = event => {
      if(event?.code)this.actions.setButton("keyboard",event.code,false);
    };
    eventTarget?.addEventListener?.("blur", this.onBlur);
    eventTarget?.addEventListener?.("keyup", this.onKeyUp, true);
    this.removeInputListeners = () => {
      eventTarget?.removeEventListener?.("blur",this.onBlur);
      eventTarget?.removeEventListener?.("keyup",this.onKeyUp,true);
    };
  }

  #connect(source) {
    if (source?.deviceType !== DeviceType.Keyboard) return;
    if (this.keyboardObservers.has(source)) return;
    const observer = source.onInputChangedObservable.add((event) => {
      if (!event?.code || (event.type==="keydown"&&isEditableTarget(event.target))) return;
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
    this.removeInputListeners?.();
    this.actions.clearDevice("keyboard");
    this.manager.dispose();
  }
}

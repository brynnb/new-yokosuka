export const DEBUG_VISIBLE_STORAGE_KEY =
  "new-yokosuka.show-debug";

function readDebugVisible(storage) {
  try {
    const value = storage?.getItem(DEBUG_VISIBLE_STORAGE_KEY);
    if (value === "0") return false;
    if (value === "1") return true;
  } catch {
    // Use the visible default when browser storage is unavailable.
  }
  return true;
}

function saveDebugVisible(storage, visible) {
  try {
    storage?.setItem(
      DEBUG_VISIBLE_STORAGE_KEY,
      visible ? "1" : "0",
    );
  } catch {
    // Debug visibility still works for this session without persistence.
  }
}

export class DisplayOptions {
  constructor(dom, { storage = globalThis.localStorage } = {}) {
    this.dom = dom;
    this.storage = storage;
  }

  sync() {
    this.dom.chatPanel.classList.toggle(
      "big-chat",
      this.dom.bigChat.checked,
    );
    this.dom.app.classList.toggle(
      "hide-world-controls",
      this.dom.hideControls.checked,
    );
    this.dom.app.classList.toggle(
      "hide-discord",
      this.dom.hideDiscord.checked,
    );
    this.dom.app.classList.toggle(
      "hide-debug-panel",
      !this.dom.showDebug.checked,
    );
  }

  initialize({ debugEnabled = false } = {}) {
    this.dom.debugVisibilityOption.hidden = !debugEnabled;
    this.dom.showDebug.checked = readDebugVisible(this.storage);
    const change = () => {
      this.sync();
    };
    const debugVisibilityChange = () => {
      saveDebugVisible(this.storage, this.dom.showDebug.checked);
      this.sync();
    };
    this.dom.bigChat.addEventListener("change", change);
    this.dom.hideControls.addEventListener("change", change);
    this.dom.hideDiscord.addEventListener("change", change);
    this.dom.showDebug.addEventListener(
      "change",
      debugVisibilityChange,
    );
    this.sync();
  }

  reset() {
    this.dom.bigChat.checked = false;
    this.dom.hideControls.checked = false;
    this.dom.hideDiscord.checked = false;
    this.dom.showDebug.checked = true;
    saveDebugVisible(this.storage, true);
    this.sync();
  }
}

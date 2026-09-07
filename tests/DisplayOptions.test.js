import assert from "node:assert/strict";
import test from "node:test";

import {
  DEBUG_VISIBLE_STORAGE_KEY,
  DisplayOptions,
} from "../play/ui/DisplayOptions.js";

function control(checked = false) {
  return {
    checked,
    listener: null,
    addEventListener(type, listener) {
      if (type === "change") this.listener = listener;
    },
  };
}

function classTarget() {
  const classes = new Set();
  return {
    classes,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
  };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("display options default to normal chat and visible world controls", () => {
  const app = classTarget();
  const chatPanel = classTarget();
  const bigChat = control();
  const hideControls = control();
  const hideDiscord = control();
  const showDebug = control(true);
  const debugVisibilityOption = { hidden: false };
  new DisplayOptions({
    app,
    chatPanel,
    bigChat,
    hideControls,
    hideDiscord,
    showDebug,
    debugVisibilityOption,
  }).initialize();

  assert.equal(chatPanel.classes.has("big-chat"), false);
  assert.equal(app.classes.has("hide-world-controls"), false);
  assert.equal(app.classes.has("hide-discord"), false);
  assert.equal(app.classes.has("hide-debug-panel"), false);
  assert.equal(debugVisibilityOption.hidden, true);
});

test("display options enlarge chat and hide only the world controls class", () => {
  const app = classTarget();
  const chatPanel = classTarget();
  const bigChat = control();
  const hideControls = control();
  const hideDiscord = control();
  const showDebug = control(true);
  const debugVisibilityOption = { hidden: true };
  new DisplayOptions({
    app,
    chatPanel,
    bigChat,
    hideControls,
    hideDiscord,
    showDebug,
    debugVisibilityOption,
  }).initialize({ debugEnabled: true });

  bigChat.checked = true;
  bigChat.listener();
  hideControls.checked = true;
  hideControls.listener();
  hideDiscord.checked = true;
  hideDiscord.listener();
  showDebug.checked = false;
  showDebug.listener();

  assert.equal(chatPanel.classes.has("big-chat"), true);
  assert.equal(app.classes.has("hide-world-controls"), true);
  assert.equal(app.classes.has("hide-discord"), true);
  assert.equal(app.classes.has("hide-debug-panel"), true);
  assert.equal(app.classes.has("hide-arcade-controls"), false);
  assert.equal(debugVisibilityOption.hidden, false);
});

test("display options reset to visible defaults", () => {
  const app = classTarget();
  const chatPanel = classTarget();
  const bigChat = control(true);
  const hideControls = control(true);
  const hideDiscord = control(true);
  const showDebug = control(false);
  const options = new DisplayOptions({
    app,
    chatPanel,
    bigChat,
    hideControls,
    hideDiscord,
    showDebug,
    debugVisibilityOption: { hidden: false },
  });
  options.initialize({ debugEnabled: true });

  options.reset();

  assert.equal(bigChat.checked, false);
  assert.equal(hideControls.checked, false);
  assert.equal(hideDiscord.checked, false);
  assert.equal(showDebug.checked, true);
  assert.equal(chatPanel.classes.has("big-chat"), false);
  assert.equal(app.classes.has("hide-world-controls"), false);
});

test("display options restore saved debug visibility", () => {
  const app = classTarget();
  const showDebug = control(true);
  const storage = memoryStorage({
    [DEBUG_VISIBLE_STORAGE_KEY]: "0",
  });
  new DisplayOptions({
    app,
    chatPanel: classTarget(),
    bigChat: control(),
    hideControls: control(),
    hideDiscord: control(),
    showDebug,
    debugVisibilityOption: { hidden: true },
  }, { storage }).initialize({ debugEnabled: true });

  assert.equal(showDebug.checked, false);
  assert.equal(app.classes.has("hide-debug-panel"), true);
});

test("display options save debug visibility changes and resets", () => {
  const app = classTarget();
  const showDebug = control(true);
  const storage = memoryStorage();
  const options = new DisplayOptions({
    app,
    chatPanel: classTarget(),
    bigChat: control(),
    hideControls: control(),
    hideDiscord: control(),
    showDebug,
    debugVisibilityOption: { hidden: true },
  }, { storage });
  options.initialize({ debugEnabled: true });

  showDebug.checked = false;
  showDebug.listener();
  assert.equal(storage.getItem(DEBUG_VISIBLE_STORAGE_KEY), "0");

  options.reset();
  assert.equal(storage.getItem(DEBUG_VISIBLE_STORAGE_KEY), "1");
});

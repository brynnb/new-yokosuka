import assert from "node:assert/strict";
import test from "node:test";

import {
  closeSettings,
  configureSettingsUi,
  openSettings,
  resetSettings,
  settingsCheckboxChanged,
  settingsValueChanged,
  useSettingsStore,
} from "../play/ui/react/settingsStore.js";

test("settings store owns modal lifecycle, reset, and return focus", () => {
  const events = [];
  const returnFocus = { focus: () => events.push("focus") };
  configureSettingsUi({
    onOpen: () => events.push("open"),
    onClose: () => events.push("close"),
    onReset: (tab) => events.push(`reset:${tab}`),
    onCheckboxChange: () => events.push("checkbox"),
  });
  useSettingsStore.setState({
    open: false,
    activeTab: "controls",
    returnFocus: null,
  });

  openSettings(returnFocus);
  resetSettings();
  settingsCheckboxChanged();
  settingsValueChanged();
  closeSettings();

  assert.deepEqual(events, [
    "open",
    "reset:controls",
    "checkbox",
    "checkbox",
    "close",
    "focus",
  ]);
  assert.equal(useSettingsStore.getState().open, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { connectedGamepads } from "../play/input/GamepadDiscovery.js";

test("gamepad discovery ignores Chromium's sparse controller slots", () => {
  const xbox = {
    id: "045e-0b13-Xbox Wireless Controller",
    connected: true,
  };
  assert.deepEqual(
    connectedGamepads(() => [xbox, null, null, null]),
    [xbox],
  );
});

test("gamepad discovery excludes disconnected and duplicate controllers", () => {
  const connected = { id: "Xbox Wireless Controller", connected: true };
  assert.deepEqual(connectedGamepads(() => [
    { id: "Old Controller", connected: false },
    connected,
    { ...connected },
    null,
  ]), [connected]);
});

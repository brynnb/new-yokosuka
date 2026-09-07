import assert from "node:assert/strict";
import test from "node:test";

import {
  AccountConnectionStatus,
  accountConnectionStatusText,
} from "../play/account/AccountConnectionStatus.js";

test("account connection status only reports server availability", () => {
  assert.equal(accountConnectionStatusText("connected"), "Server Online");
  assert.equal(accountConnectionStatusText("checking"), "Checking Server...");
  assert.equal(accountConnectionStatusText("offline"), "Server Offline");
});

test("account status retries after a lost connection", async () => {
  const scheduled = [];
  const statuses = [];
  let requestCount = 0;
  const monitor = new AccountConnectionStatus({
    request: async () => {
      requestCount += 1;
      if (requestCount === 2) throw new Error("offline");
      return { online: true };
    },
    setTimer: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
    clearTimer: () => {},
  });
  monitor.start((status) => statuses.push(status.text));
  await Promise.resolve();
  scheduled.shift()();
  await Promise.resolve();
  scheduled.shift()();
  await Promise.resolve();
  monitor.stop();

  assert.deepEqual(statuses, [
    "Checking Server...",
    "Server Online",
    "Server Offline",
    "Server Online",
  ]);
});

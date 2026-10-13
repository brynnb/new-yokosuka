import assert from "node:assert/strict";
import test from "node:test";
import { PlayUiCoordinator } from "../play/ui/PlayUiCoordinator.js";
import { ThirdPersonController } from "../src/ThirdPersonController.js";

function createHarness(initiallyLocked = false) {
  const controller = Object.assign(Object.create(ThirdPersonController.prototype), {
    movementLocked: initiallyLocked, manualMovementLocked: initiallyLocked,
    movementLockOwners: new Set(), keys: new Set(), clearTouchMovement() {},
  });
  const coordinator = new PlayUiCoordinator({
    acquireMovementLock: () => controller.acquireMovementLock(),
  });
  return {
    coordinator,
    controller,
    movementLocked: () => controller.movementLocked,
  };
}

test("a modal releases only its own lock, retaining an independent gameplay lock", () => {
  const unlocked = createHarness(false);
  unlocked.coordinator.openModal("settings");
  assert.equal(unlocked.movementLocked(), true);
  unlocked.coordinator.closeModal("settings");
  assert.equal(unlocked.movementLocked(), false);

  const locked = createHarness(true);
  locked.coordinator.openModal("journal");
  locked.coordinator.closeModal("journal");
  assert.equal(locked.movementLocked(), true);
});

test("overlapping modals keep movement locked until the last owner closes", () => {
  const harness = createHarness(false);
  harness.coordinator.openModal("settings");
  harness.coordinator.openModal("inventory");
  harness.coordinator.closeModal("settings");
  assert.equal(harness.movementLocked(), true);
  harness.coordinator.closeModal("inventory");
  assert.equal(harness.movementLocked(), false);
});

test("opening or closing one modal twice is idempotent", () => {
  const harness = createHarness(false);
  harness.coordinator.openModal("settings");
  harness.coordinator.openModal("settings");
  harness.coordinator.closeModal("settings");
  harness.coordinator.closeModal("settings");
  assert.equal(harness.movementLocked(), false);
});

test("a modal can hand movement locking to the runtime it starts", () => {
  const harness = createHarness(false);
  harness.coordinator.openModal("pool-chooser");
  const releasePool = harness.controller.acquireMovementLock();
  harness.coordinator.handoffModal("pool-chooser");
  assert.equal(harness.movementLocked(), true);

  harness.coordinator.openModal("settings");
  harness.coordinator.closeModal("settings");
  assert.equal(harness.movementLocked(), true);
  releasePool();
  assert.equal(harness.movementLocked(), false);
});

test("a modal and event may finish in either order without restoring stale locks", () => {
  for (const modalFirst of [true, false]) {
    const h = createHarness();
    const releaseEvent = h.controller.acquireMovementLock();
    h.coordinator.openModal("journal");
    if (modalFirst) { h.coordinator.closeModal("journal"); releaseEvent(); }
    else { releaseEvent(); h.coordinator.closeModal("journal"); }
    assert.equal(h.movementLocked(), false);
  }
});

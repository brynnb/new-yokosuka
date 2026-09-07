import assert from "node:assert/strict";
import test from "node:test";
import { PlayUiCoordinator } from "../play/ui/PlayUiCoordinator.js";

function createHarness(initiallyLocked = false) {
  let movementLocked = initiallyLocked;
  const coordinator = new PlayUiCoordinator({
    getMovementLocked: () => movementLocked,
    setMovementLocked: value => { movementLocked = value; },
  });
  return {
    coordinator,
    movementLocked: () => movementLocked,
  };
}

test("a modal restores the movement state it observed on open", () => {
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
  harness.coordinator.handoffModal("pool-chooser");
  assert.equal(harness.movementLocked(), true);

  harness.coordinator.openModal("settings");
  harness.coordinator.closeModal("settings");
  assert.equal(harness.movementLocked(), true);
});

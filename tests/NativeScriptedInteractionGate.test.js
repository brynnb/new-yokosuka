import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeDialogueState,
} from "../play/dialogue/NativeDialogueState.js";
import {
  browserYawToNativeRaw,
  evaluateNativeScriptedInteractionGate,
  nativeCircularAngleDifference,
} from "../play/events/NativeScriptedInteractionGate.js";

const pack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));
const interaction = pack.programs[0].scriptedInteractions[0];
const phoneBook = pack.programs
  .find(program => program.id === "disc1-d000-phone-book-0x6a49c")
  .scriptedInteractions[0];

function context(overrides = {}) {
  return {
    dialogueState: createNativeDialogueState(),
    gameDate: new Date("1986-01-01T12:00:00Z"),
    playerPosition: {
      x: 119.13939666748047,
      y: 0,
      z: 79.6144027709961,
    },
    playerYaw: -9375 * Math.PI * 2 / 0x10000,
    ...overrides,
  };
}

test("exact Hato activation gate matches its authored native transform", () => {
  const result = evaluateNativeScriptedInteractionGate(
    interaction.activation,
    context(),
  );
  assert.equal(result.resolved, true);
  assert.equal(result.matched, true);
  assert.deepEqual(result.nativePosition, (
    interaction.activation.nativeSpatialRecord.position
  ));
  assert.equal(result.facingRaw, 9375);
  assert.equal(result.facingDifference, 0);
});

test("scripted activation preserves strict native spatial and facing limits", () => {
  const activation = interaction.activation;
  const outsideLateral = context({
    playerPosition: {
      x: 119.13939666748047
        - activation.nativeSpatialRecord.lateralHalfWidth,
      y: 0,
      z: 79.6144027709961,
    },
    playerYaw: 0,
  });
  assert.equal(
    evaluateNativeScriptedInteractionGate(
      activation,
      outsideLateral,
    ).matched,
    false,
  );
  const facingBoundary = context({
    playerYaw: -(
      activation.nativeSpatialRecord.requiredFacingRaw
      + activation.nativeSpatialRecord.facingToleranceRaw
    ) * Math.PI * 2 / 0x10000,
  });
  assert.equal(
    evaluateNativeScriptedInteractionGate(
      activation,
      facingBoundary,
    ).reason,
    "scripted-gate-facing",
  );
});

test("scripted activation enforces exact persistent flag and hour range", () => {
  const activation = interaction.activation;
  const state = createNativeDialogueState();
  state.write(2, 100, 1);
  assert.equal(
    evaluateNativeScriptedInteractionGate(
      activation,
      context({ dialogueState: state }),
    ).reason,
    "scripted-gate-persistent-flag",
  );
  assert.equal(
    evaluateNativeScriptedInteractionGate(
      activation,
      context({ gameDate: new Date("1986-01-01T19:00:00Z") }),
    ).reason,
    "scripted-gate-hour",
  );
});

test("browser yaw conversion follows the established reflected X axis", () => {
  assert.equal(browserYawToNativeRaw(0), 0);
  assert.equal(browserYawToNativeRaw(-Math.PI / 2), 0x4000);
  assert.equal(browserYawToNativeRaw(Math.PI / 2), 0xc000);
  assert.equal(nativeCircularAngleDifference(1, 0xffff), 2);
});

test("tagged-object activation requires the exact authored tag and action", () => {
  assert.deepEqual(evaluateNativeScriptedInteractionGate(
    phoneBook.activation,
    {
      selectedObjectTag: "TBK1",
      selectedObjectAction: 1,
    },
  ), {
    resolved: true,
    matched: true,
    reason: null,
    objectTag: "TBK1",
    action: 1,
  });
  assert.equal(evaluateNativeScriptedInteractionGate(
    phoneBook.activation,
    {
      selectedObjectTag: "TBK3",
      selectedObjectAction: 1,
    },
  ).reason, "scripted-gate-object-action");
  assert.equal(evaluateNativeScriptedInteractionGate(
    phoneBook.activation,
    {
      selectedObjectTag: "TBK1",
    },
  ).reason, "scripted-gate-object-action-context-missing");
});

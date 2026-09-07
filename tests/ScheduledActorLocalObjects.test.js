import assert from "node:assert/strict";
import test from "node:test";
import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  scheduledAttachedObjectMatrix,
  scheduledBrowserAttachedObjectMatrix,
  scheduledLocalObjectActorParentMatrix,
  scheduledLocalObjectControllerRoute,
  scheduledLocalObjectMatrix,
  scheduledLocalObjectParentMatrix,
  scheduledLocalObjectPlacementTarget,
} from "../src/ScheduledActorLocalObjects.js";

test("held-object transforms follow the mirrored character frame", () => {
  const source = Mt5Loader.rowMultiply(
    Mt5Loader.rowRotationY(Math.PI / 4),
    Mt5Loader.rowTranslation(2, 3, 4),
  );
  const browser = scheduledBrowserAttachedObjectMatrix(source);

  assert.deepEqual(
    Mt5Loader.transformRowPoint([0, 0, 0], browser),
    [-2, 3, 4],
  );
  assert.deepEqual(
    Mt5Loader.transformRowVector([1, 0, 0], browser).map(
      (value) => Math.round(value * 1e12) / 1e12,
    ),
    [
      Math.SQRT1_2,
      0,
      Math.SQRT1_2,
    ].map((value) => Math.round(value * 1e12) / 1e12),
  );
});
import {
  controllerFamilyByIndex,
} from "../play/characters/NpcControllerFamilies.js";

test("control word one applies the native carried-object wrist correction", () => {
  const parent = Mt5Loader.rowMultiply(
    Mt5Loader.rowMultiply(
      Mt5Loader.rowRotationX(Math.PI / 4),
      Mt5Loader.rowRotationY(Math.PI / 3),
    ),
    Mt5Loader.rowTranslation(2, 3, 4),
  );
  const unchanged = scheduledLocalObjectParentMatrix(parent, {
    controlWord: 0,
  });
  const corrected = scheduledLocalObjectParentMatrix(parent, {
    controlWord: 1,
  });

  assert.equal(unchanged, parent);
  assert.deepEqual(corrected.slice(12, 15), [2, 3, 4]);
  assert.notDeepEqual(corrected.slice(0, 12), parent.slice(0, 12));
});

const broom = {
  placementMode: 2,
  runtimePosition: [
    0.43518999218940735,
    -0.8508099913597107,
    0.48438000679016113,
  ],
  transformControlWords: [4733, 31675, 3822],
};

test("all ordinary native placement modes preserve their MOMT node type", () => {
  assert.deepEqual(scheduledLocalObjectPlacementTarget(0), {
    nativeNodeId: 12,
  });
  assert.deepEqual(scheduledLocalObjectPlacementTarget(2), {
    nativeNodeId: 12,
  });
  assert.deepEqual(scheduledLocalObjectPlacementTarget(3), {
    nativeNodeId: 18,
  });
  assert.deepEqual(scheduledLocalObjectPlacementTarget(9), {
    nativeNodeId: 2,
  });
  assert.deepEqual(scheduledLocalObjectPlacementTarget(10), {
    kind: "actor-controller-transform",
  });
  assert.deepEqual(scheduledLocalObjectPlacementTarget(11), {
    kind: "actor-world-transform",
  });
});

test("native modes 10 and 11 retain their distinct actor transform sources", () => {
  assert.deepEqual(
    scheduledLocalObjectActorParentMatrix(
      scheduledLocalObjectPlacementTarget(10),
    ),
    [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ],
  );
  assert.deepEqual(
    scheduledLocalObjectActorParentMatrix(
      scheduledLocalObjectPlacementTarget(11),
    ),
    [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ],
  );
  assert.equal(
    scheduledLocalObjectActorParentMatrix(
      scheduledLocalObjectPlacementTarget(2),
    ),
    null,
  );
});

test("attachment routing follows the actor's exact controller family", () => {
  const canonicalRoutes = new Map([
    [-0x42, 30],
    [-0x41, 36],
  ]);
  assert.deepEqual(
    scheduledLocalObjectControllerRoute(
      scheduledLocalObjectPlacementTarget(2),
      controllerFamilyByIndex(0),
      canonicalRoutes,
    ),
    {
      nativeNodeId: 12,
      controllerMatrixIndex: 30,
      renderKey: -0x42,
    },
  );

  const permutedRoutes = new Map([
    [-0x42, 36],
    [-0x41, 30],
  ]);
  assert.deepEqual(
    scheduledLocalObjectControllerRoute(
      scheduledLocalObjectPlacementTarget(2),
      controllerFamilyByIndex(4),
      permutedRoutes,
    ),
    {
      nativeNodeId: 12,
      controllerMatrixIndex: 36,
      renderKey: -0x42,
    },
  );
});

test("attachment-only controls retain their exact controller matrix", () => {
  assert.deepEqual(
    scheduledLocalObjectControllerRoute(
      scheduledLocalObjectPlacementTarget(7),
      controllerFamilyByIndex(0),
      new Map([[-0x42, 30]]),
    ),
    {
      nativeNodeId: 7,
      controllerMatrixIndex: 25,
      renderKey: null,
    },
  );
});

test("Fukuhara broom retains its exact native local transform", () => {
  const matrix = scheduledLocalObjectMatrix(broom);
  assert.ok(matrix);
  assert.ok(Math.abs(matrix[12] - broom.runtimePosition[0]) < 1e-7);
  assert.ok(Math.abs(matrix[13] - broom.runtimePosition[1]) < 1e-7);
  assert.ok(Math.abs(matrix[14] - broom.runtimePosition[2]) < 1e-7);
});

test("local-object transform composes before the controller matrix", () => {
  const parent = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    4, 5, 6, 1,
  ];
  const local = scheduledLocalObjectMatrix(broom);
  const attached = scheduledAttachedObjectMatrix(parent, broom);
  assert.deepEqual(attached.slice(0, 12), local.slice(0, 12));
  assert.ok(Math.abs(attached[12] - (local[12] + 4)) < 1e-7);
  assert.ok(Math.abs(attached[13] - (local[13] + 5)) < 1e-7);
  assert.ok(Math.abs(attached[14] - (local[14] + 6)) < 1e-7);
});

import { Mt5Loader } from "./Mt5Loader.js";

const FULL_TURN = Math.PI * 2;

// FUN_0c11d960 maps the operation-0x10 placement byte to a native MOMT
// controller-node type. FUN_0c1140e6 then searches the actor's live 72-byte
// MOMT control records by that type and returns the matrix at record +0x44.
// Consequently this byte is not a fixed matrix index or render key: the
// original controller-family descriptor determines the record index.
const PLACEMENT_TARGETS = new Map([
  [0, Object.freeze({ nativeNodeId: 12 })],
  [1, Object.freeze({ nativeNodeId: 18 })],
  [2, Object.freeze({ nativeNodeId: 12 })],
  [3, Object.freeze({ nativeNodeId: 18 })],
  [4, Object.freeze({ nativeNodeId: 5 })],
  [5, Object.freeze({ nativeNodeId: 9 })],
  [6, Object.freeze({ nativeNodeId: 15 })],
  [7, Object.freeze({ nativeNodeId: 7 })],
  [8, Object.freeze({ nativeNodeId: 13 })],
  [9, Object.freeze({ nativeNodeId: 2 })],
  // Mode 10 builds the current animation controller's world transform from
  // controller +0x150 and +0x18c/+0x190/+0x194. Live NPC captures prove
  // +0x150 follows actor current position +0x24 and +0x190 equals actor
  // facing +0x50. ScheduledActorRuntime's actor root is this same current
  // controller transform, so its actor-local parent is identity.
  [10, Object.freeze({ kind: "actor-controller-transform" })],
  // Native mode 11 constructs the actor's world matrix from actor +0x1ac
  // (action position) and +0x50 (facing). All five authored mode-11 records
  // occur while Fukuhara is held at a preceding operation-3 position, so that
  // action position and the browser actor root are identical for the complete
  // extracted corpus. This is distinct from mode 10's live controller source.
  [11, Object.freeze({ kind: "actor-world-transform" })],
]);

export function scheduledLocalObjectPlacementTarget(placementMode) {
  return PLACEMENT_TARGETS.get(placementMode) || null;
}

export function scheduledLocalObjectActorParentMatrix(target) {
  if (
    target?.kind !== "actor-controller-transform"
    && target?.kind !== "actor-world-transform"
  ) return null;
  return Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function scheduledLocalObjectControllerRoute(
  target,
  controllerFamily,
  renderMatrixByKey,
) {
  if (
    !target
    || !controllerFamily?.nodes
    || !(renderMatrixByKey instanceof Map)
  ) {
    return null;
  }
  const control = controllerFamily.nodes.find(
    (node) => node.type === target.nativeNodeId,
  );
  if (!control) return null;
  const routed = [...renderMatrixByKey].find(
    ([, matrixIndex]) => matrixIndex === control.index,
  );
  return Object.freeze({
    nativeNodeId: target.nativeNodeId,
    controllerMatrixIndex: control.index,
    renderKey: routed?.[0] ?? null,
  });
}

export function scheduledLocalObjectTurnRadians(raw) {
  return (raw / 0x10000) * FULL_TURN;
}

export function scheduledLocalObjectMatrix(registration) {
  const position = registration.runtimePosition;
  const rotation = registration.transformControlWords;
  if (
    !Array.isArray(position)
    || position.length !== 3
    || !position.every(Number.isFinite)
    || !Array.isArray(rotation)
    || rotation.length !== 3
    || !rotation.every(Number.isFinite)
  ) {
    return null;
  }
  return Mt5Loader.sourceTransformMatrix({
    scl: { x: 1, y: 1, z: 1 },
    rot: {
      x: scheduledLocalObjectTurnRadians(rotation[0]),
      y: scheduledLocalObjectTurnRadians(rotation[1]),
      z: scheduledLocalObjectTurnRadians(rotation[2]),
    },
    pos: {
      x: position[0],
      y: position[1],
      z: position[2],
    },
  });
}

export function scheduledAttachedObjectMatrix(
  parentControlMatrix,
  registration,
) {
  const local = scheduledLocalObjectMatrix(registration);
  const parent = scheduledLocalObjectParentMatrix(
    parentControlMatrix,
    registration,
  );
  return local && parent
    ? Mt5Loader.rowMultiply(local, parent)
    : null;
}

export function scheduledLocalObjectParentMatrix(
  parentControlMatrix,
  registration,
) {
  if (
    !Array.isArray(parentControlMatrix)
    || parentControlMatrix.length !== 16
    || registration?.controlWord !== 1
  ) {
    return parentControlMatrix;
  }

  // FUN_0c11d6fa invokes FUN_0c11d85c only when operation-0x10 word +0x0c
  // is one. The native helper removes the controller's wrist rotation, then
  // installs X(+90), Y(-90), X(-atan2(rowY.x, rowY.z)). This keeps authored
  // bags and baskets aligned with the arm instead of inheriting wrist roll.
  const directionX = parentControlMatrix[4];
  const directionZ = parentControlMatrix[6];
  if (Math.hypot(directionX, directionZ) < 1e-6) {
    return parentControlMatrix;
  }
  const armAngle = Math.atan2(directionX, directionZ);
  const corrected = Mt5Loader.rowMultiply(
    Mt5Loader.rowRotationX(-armAngle),
    Mt5Loader.rowMultiply(
      Mt5Loader.rowRotationY(-Math.PI / 2),
      Mt5Loader.rowRotationX(Math.PI / 2),
    ),
  );
  corrected[12] = parentControlMatrix[12];
  corrected[13] = parentControlMatrix[13];
  corrected[14] = parentControlMatrix[14];
  return corrected;
}

export function scheduledBrowserAttachedObjectMatrix(sourceMatrix) {
  if (!Array.isArray(sourceMatrix) || sourceMatrix.length !== 16) return null;
  // The prop's own MT5 hierarchy has already been converted to browser
  // coordinates. Reflect the completed source attachment frame on both
  // sides so its position and orientation follow the character content
  // reflection without reflecting the prop geometry a second time.
  const flipX = Mt5Loader.rowScale(-1, 1, 1);
  return Mt5Loader.rowMultiply(
    Mt5Loader.rowMultiply(flipX, sourceMatrix),
    flipX,
  );
}

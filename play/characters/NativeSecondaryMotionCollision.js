import * as BABYLON from "@babylonjs/core";

import {
  NATIVE_SECONDARY_MOTION_COLLISION_PROFILES,
} from "../data/native-secondary-motion-collision.web.js";
import {
  nativeSecondaryMotionModelIdentity,
} from "./NativeSecondaryMotionProfiles.js";

function finiteMatrix(value) {
  return (
    value !== null
    && typeof value === "object"
    && value.length === 16
    && Array.from(value).every(Number.isFinite)
  );
}

function uniformScaleFromMatrix(matrix) {
  const scaling = BABYLON.Vector3.One();
  const rotation = BABYLON.Quaternion.Identity();
  const translation = BABYLON.Vector3.Zero();
  if (!matrix.decompose(scaling, rotation, translation)) {
    throw new Error("native actor collision space cannot be decomposed");
  }
  const magnitudes = [Math.abs(scaling.x), Math.abs(scaling.y), Math.abs(scaling.z)];
  const minimum = Math.min(...magnitudes);
  const maximum = Math.max(...magnitudes);
  if (maximum - minimum > Math.max(1e-5, maximum * 1e-5)) {
    throw new Error("native actor collision requires a uniform character scale");
  }
  return magnitudes.reduce((sum, value) => sum + value, 0) / 3;
}

function controllerMatrixByType(controllerFamily, controllerMatrices) {
  if (
    !Array.isArray(controllerFamily?.nodes)
    || !Array.isArray(controllerMatrices)
  ) return null;
  const matrixByType = new Map();
  for (const node of controllerFamily.nodes) {
    const matrix = controllerMatrices[node.index];
    if (finiteMatrix(matrix)) matrixByType.set(node.type, matrix);
  }
  return matrixByType;
}

export function nativeSecondaryMotionCollisionProfile(modelCode) {
  const identity = nativeSecondaryMotionModelIdentity(modelCode);
  return identity
    ? NATIVE_SECONDARY_MOTION_COLLISION_PROFILES[identity] || null
    : null;
}

export function buildNativeActorCollisionProxy({
  profile,
  controllerFamily,
  controllerMatrices,
  spaceMatrix = BABYLON.Matrix.Identity(),
} = {}) {
  if (!profile) return null;
  if (!(spaceMatrix instanceof BABYLON.Matrix)) {
    throw new TypeError("native actor collision requires a Babylon space matrix");
  }
  const matrixByType = controllerMatrixByType(
    controllerFamily,
    controllerMatrices,
  );
  if (!matrixByType) return null;
  const worldScale = uniformScaleFromMatrix(spaceMatrix);
  const points = profile.points.map((point) => {
    const controllerMatrix = matrixByType.get(point.controllerType);
    if (!controllerMatrix) {
      throw new Error(
        `native actor collision controller type ${point.controllerType} is unavailable`,
      );
    }
    const controllerPoint = BABYLON.Vector3.TransformCoordinates(
      BABYLON.Vector3.FromArray(point.localPosition),
      BABYLON.Matrix.FromArray(controllerMatrix),
    );
    return Object.freeze({
      center: BABYLON.Vector3.TransformCoordinates(
        controllerPoint,
        spaceMatrix,
      ),
      radius: point.radius * worldScale,
    });
  });
  const spans = Object.freeze(
    profile.spans.map(({ pointIndex, pointCount }) => (
      Object.freeze(points.slice(pointIndex, pointIndex + pointCount))
    )),
  );
  return Object.freeze({
    spans,
    projection: Object.freeze({
      ...profile.projection,
      segmentLengthSquaredFloor: (
        profile.projection.segmentLengthSquaredFloor
        * worldScale
        * worldScale
      ),
      normalLengthFloor: (
        profile.projection.normalLengthFloor * worldScale
      ),
    }),
  });
}

// Exact high-level translation of FUN_0c094b78. For four-point spans the
// native routine successively projects the result toward each following
// control point; it is not a collection of independently-tested capsules.
export function projectNativeVariableRadiusSpan(
  query,
  span,
  clearance,
  projection,
) {
  if (!(query instanceof BABYLON.Vector3)) {
    throw new TypeError("native collision query must be a Babylon vector");
  }
  if (!Array.isArray(span) || span.length < 2) {
    throw new TypeError("native collision span must contain at least two points");
  }
  let center = span[0].center.clone();
  let radius = span[0].radius;
  const interior = span.length >= 3;
  for (let index = 1; index < span.length; index += 1) {
    const next = span[index];
    const segment = center.subtract(next.center);
    const lengthSquared = Math.max(
      segment.lengthSquared(),
      projection.segmentLengthSquaredFloor,
    );
    let amount = BABYLON.Vector3.Dot(
      query.subtract(next.center),
      segment,
    ) / lengthSquared;
    if (!interior || amount > projection.interiorHigh) {
      amount -= projection.endpointBias;
    } else if (amount < projection.interiorLow) {
      amount += projection.endpointBias;
    }
    amount = BABYLON.Scalar.Clamp(amount, 0, 1);
    center = next.center.add(segment.scale(amount));
    radius = next.radius + (radius - next.radius) * amount;
  }

  const delta = query.subtract(center);
  const distance = delta.length();
  const combinedRadius = radius + clearance;
  if (!(combinedRadius > distance)) {
    return Object.freeze({ hit: false, point: query.clone() });
  }
  const denominator = Math.max(distance, projection.normalLengthFloor);
  return Object.freeze({
    hit: true,
    point: center.add(delta.scale(combinedRadius / denominator)),
  });
}

// Mirrors FUN_0c094934's authored span order and FUN_0c094b34's correction.
// The projection routine moves the candidate endpoint to the body surface.
// FUN_0c094b34 then restores the authored segment length from the unchanged
// OSAG record origin toward that projected endpoint. The next body span
// receives the corrected endpoint.
export function resolveNativeActorCollision(
  origin,
  point,
  spans,
  {
    nodeRadius,
    clearance,
    projection,
  },
) {
  if (!(origin instanceof BABYLON.Vector3)) {
    throw new TypeError("native collision origin must be a Babylon vector");
  }
  if (!(point instanceof BABYLON.Vector3)) {
    throw new TypeError("native collision point must be a Babylon vector");
  }
  if (!Array.isArray(spans) || spans.length === 0) {
    return Object.freeze({ hit: false, point: point.clone() });
  }
  if (!Number.isFinite(nodeRadius) || nodeRadius < 0) {
    throw new TypeError("native collision node radius must be nonnegative");
  }
  let resolved = point.clone();
  let hit = false;
  for (const span of spans) {
    const projected = projectNativeVariableRadiusSpan(
      resolved,
      span,
      clearance,
      projection,
    );
    if (!projected.hit) continue;
    hit = true;
    const direction = projected.point.subtract(origin);
    const distance = direction.length();
    const denominator = Math.max(distance, projection.normalLengthFloor);
    resolved = origin.add(
      direction.scale(nodeRadius / denominator),
    );
  }
  return Object.freeze({ hit, point: resolved });
}

export function nativeSecondaryMotionNodeCollisionParameters(
  nodes,
  profile,
  spaceMatrix = BABYLON.Matrix.Identity(),
) {
  if (!Array.isArray(nodes) || nodes.length < 2) {
    throw new TypeError("native secondary-motion chain needs two nodes");
  }
  const nodeCollision = profile?.nodeCollision;
  const radiusScales = nodeCollision?.radiusLengthScaleByMode;
  const clearances = nodeCollision?.clearanceByMode;
  if (
    !radiusScales
    || typeof radiusScales !== "object"
    || !clearances
    || typeof clearances !== "object"
  ) {
    throw new Error(
      "native secondary-motion node-collision profile is unavailable",
    );
  }
  if (
    nodeCollision.sourceSelection !== "childSourceOrSelf"
    || nodeCollision.runtimeModeDerivation
      !== "chainOrdinalLowFiveBits"
  ) {
    throw new Error("native secondary-motion radius routing is unsupported");
  }
  const modeMask = Number(nodeCollision.runtimeModeMask);
  if (!Number.isSafeInteger(modeMask) || modeMask < 0) {
    throw new Error("native secondary-motion radius mode mask is invalid");
  }
  const worldScale = uniformScaleFromMatrix(spaceMatrix);
  return nodes.map((node, index) => {
    // FUN_0c132e14 selects param_2+0x2c when that child source exists and
    // otherwise keeps param_2. The OSAG record's low-five-bit mode is the
    // chain ordinal established by the native record builder.
    const sourceVector = (nodes[index + 1] || node)?.pos;
    const sourceLength = Math.hypot(
      sourceVector?.x,
      sourceVector?.y,
      sourceVector?.z,
    );
    const mode = index & modeMask;
    const radiusScale = radiusScales[mode] ?? radiusScales.default;
    const clearance = clearances[mode] ?? clearances.default;
    if (!Number.isFinite(sourceLength) || sourceLength <= 0) {
      throw new Error("native secondary-motion source vector is unavailable");
    }
    if (!Number.isFinite(radiusScale) || radiusScale < 0) {
      throw new Error("native secondary-motion radius scale is unavailable");
    }
    if (!Number.isFinite(clearance) || clearance < 0) {
      throw new Error("native secondary-motion clearance is unavailable");
    }
    return Object.freeze({
      radius: sourceLength * radiusScale * worldScale,
      clearance: clearance * worldScale,
    });
  });
}

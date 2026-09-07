import * as BABYLON from "@babylonjs/core";

import { NATIVE_CLOTH_SOLVER_PROFILE } from "../data/native-cloth-profiles.web.js";
import { nativeClothCharacterProfile } from "./NativeClothProfiles.js";
import {
  nativeClothControllerWorldPosition,
  nativeClothUniformWorldScale,
} from "./NativeClothControllerPose.js";

const FORCE = NATIVE_CLOTH_SOLVER_PROFILE.force;
const ZERO = Object.freeze([0, 0, 0]);
const MODE_4_FIELD = NATIVE_CLOTH_SOLVER_PROFILE.runtimeMode4AdvectionField;

// Live, unmodified OP02 captures expose the mode-4 owner vector at +0x34 as
// a smooth gust along native [-1, 0, 2]. The initial twelve 30 Hz samples
// measure magnitudes 0.0366..0.0529. Preserve that measured direction/range;
// the two continuous periods prevent a visible loop at a camera-shot boundary.
const MODE_4_GUST = Object.freeze({
  browserDirection: Object.freeze([1 / Math.sqrt(5), 0, 2 / Math.sqrt(5)]),
  baseline: 0.042,
  primaryAmplitude: 0.022,
  primaryPeriodSeconds: 2.8,
  secondaryAmplitude: 0.008,
  secondaryPeriodSeconds: 0.83,
  minimum: 0.012,
});

function fixedDownward(modelCode, controlType, runtimeMode, primarySelector) {
  if (FORCE.fixedDownwardRuntimeModes.includes(runtimeMode)) return true;
  if (FORCE.fixedDownwardProfileByte0x0a.includes(primarySelector)) return true;
  const normalizedCode = String(modelCode || "")
    .trim()
    .toUpperCase()
    .split("_", 1)[0];
  return FORCE.fixedDownwardModelRules.some(rule => (
    rule.modelCode === normalizedCode
    && !rule.exceptControlTypes.includes(controlType)
  ));
}

function normalizedForce(from, to, magnitude) {
  const delta = from.subtract(to);
  const length = delta.length();
  if (length <= Number.EPSILON) return ZERO;
  return Object.freeze(delta.scale(magnitude / length).asArray());
}

function directControllerForce(
  matricesByType,
  pair,
  characterSpaceMatrix,
  magnitude,
) {
  const from = nativeClothControllerWorldPosition(
    matricesByType,
    pair[0],
    characterSpaceMatrix,
  );
  const to = nativeClothControllerWorldPosition(
    matricesByType,
    pair[1],
    characterSpaceMatrix,
  );
  return from && to ? normalizedForce(from, to, magnitude) : null;
}

function midpointControllerForce(
  matricesByType,
  pair,
  characterSpaceMatrix,
  magnitude,
) {
  const first = nativeClothControllerWorldPosition(
    matricesByType,
    pair[0],
    characterSpaceMatrix,
  );
  const second = nativeClothControllerWorldPosition(
    matricesByType,
    pair[1],
    characterSpaceMatrix,
  );
  const root = nativeClothControllerWorldPosition(
    matricesByType,
    0,
    characterSpaceMatrix,
  );
  if (!first || !second || !root) return null;
  const midpoint = first.add(second).scaleInPlace(0.5);
  return normalizedForce(midpoint, root, magnitude);
}

/**
 * Resolve FUN_0c0af35e's profile-selected per-row force field. Profile bytes
 * +0x0a/+0x0b select the primary and optional secondary controller pairs;
 * +0x0c selects the first row using the secondary vector. Missing controller
 * pose returns null so a model can wait for a coherent body frame instead of
 * inventing a character-specific fallback.
 */
export function buildNativeClothRowForces({
  modelCode,
  controlType,
  rowCount,
  matricesByType,
  characterSpaceMatrix,
  runtimeMode = 0,
} = {}) {
  if (!Number.isSafeInteger(rowCount) || rowCount < 1) {
    throw new TypeError("native cloth force field requires a positive row count");
  }
  if (!(characterSpaceMatrix instanceof BABYLON.Matrix)) {
    throw new TypeError("native cloth force field requires character space");
  }
  const profile = nativeClothCharacterProfile(modelCode);
  const primarySelector = profile.rawControlBytes[2];
  const secondarySelector = profile.rawControlBytes[3];
  const secondaryFirstRow = profile.rawControlBytes[4];
  const magnitude = FORCE.magnitude
    * nativeClothUniformWorldScale(characterSpaceMatrix);

  const usesFixedDownward = fixedDownward(
    modelCode,
    controlType,
    runtimeMode,
    primarySelector,
  );
  let primary;
  if (usesFixedDownward) {
    primary = Object.freeze([0, -magnitude, 0]);
  } else {
    const directPair = FORCE.controlTypeControllerPairs[String(controlType)];
    if (directPair) {
      primary = directControllerForce(
        matricesByType,
        directPair,
        characterSpaceMatrix,
        magnitude,
      );
    } else {
      const pair = (
        FORCE.primaryControllerPairByProfileByte0x0a[String(primarySelector)]
      );
      if (!pair) {
        throw new Error(
          `native cloth primary force selector ${primarySelector} is unsupported`,
        );
      }
      primary = midpointControllerForce(
        matricesByType,
        pair,
        characterSpaceMatrix,
        magnitude,
      );
    }
  }
  if (!primary) return null;
  if (usesFixedDownward) {
    return Object.freeze(Array.from({ length: rowCount }, () => primary));
  }

  let secondary = null;
  if (secondarySelector !== 0) {
    const pair = (
      FORCE.secondaryControllerPairByProfileByte0x0b[String(secondarySelector)]
    );
    if (!pair) {
      throw new Error(
        `native cloth secondary force selector ${secondarySelector} is unsupported`,
      );
    }
    secondary = midpointControllerForce(
      matricesByType,
      pair,
      characterSpaceMatrix,
      magnitude,
    );
    if (!secondary) return null;
  }

  return Object.freeze(Array.from({ length: rowCount }, (_, row) => (
    secondary && row >= secondaryFirstRow ? secondary : primary
  )));
}

/**
 * FUN_0c0af35e's runtime-mode-4 branch applies owner advection through the
 * executable table at 0x0c281e2c. The table is indexed by lattice row and
 * column, leaving the pinned waist at zero and progressively increasing the
 * gust toward the hem while retaining the authored opening/seam falloff.
 */
export function buildNativeClothPointAdvections({
  runtimeMode = 0,
  rowCount,
  columnCount,
  elapsedSeconds = 0,
  characterSpaceMatrix,
} = {}) {
  if (runtimeMode !== 4) return null;
  if (
    !Number.isSafeInteger(rowCount)
    || rowCount < 1
    || !Number.isSafeInteger(columnCount)
    || columnCount < 1
  ) {
    throw new TypeError("native cloth advection requires a positive lattice");
  }
  if (!(characterSpaceMatrix instanceof BABYLON.Matrix)) {
    throw new TypeError("native cloth advection requires character space");
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new TypeError("native cloth advection time must be nonnegative");
  }
  if (
    rowCount > MODE_4_FIELD.rows
    || columnCount > MODE_4_FIELD.columns
  ) {
    throw new Error(
      `native cloth mode-4 lattice ${rowCount}x${columnCount} exceeds `
      + `${MODE_4_FIELD.rows}x${MODE_4_FIELD.columns}`,
    );
  }
  const primaryPhase = (
    elapsedSeconds * Math.PI * 2 / MODE_4_GUST.primaryPeriodSeconds - 0.2
  );
  const secondaryPhase = (
    elapsedSeconds * Math.PI * 2 / MODE_4_GUST.secondaryPeriodSeconds + 1.1
  );
  const capturedMagnitude = Math.max(
    MODE_4_GUST.minimum,
    MODE_4_GUST.baseline
      + MODE_4_GUST.primaryAmplitude * Math.sin(primaryPhase)
      + MODE_4_GUST.secondaryAmplitude * Math.sin(secondaryPhase),
  );
  const magnitude = capturedMagnitude
    * nativeClothUniformWorldScale(characterSpaceMatrix);
  const wind = MODE_4_GUST.browserDirection.map(value => value * magnitude);
  return Object.freeze(Array.from({ length: rowCount }, (_, row) => (
    Array.from({ length: columnCount }, (_, column) => {
      const coefficient = MODE_4_FIELD.coefficients[row][column];
      return Object.freeze(wind.map(value => value * coefficient));
    })
  )).flat());
}

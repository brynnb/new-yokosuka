import {
  NATIVE_CLOTH_BODY_COLLISION_PROFILES,
  NATIVE_CLOTH_CHARACTER_PROFILES,
  NATIVE_CLOTH_FALLBACK_PROFILE,
  NATIVE_CLOTH_RUNTIME_MODE_OVERRIDE_PROFILES,
  NATIVE_CLOTH_SOLVER_PROFILE,
} from "../data/native-cloth-profiles.web.js";

export function nativeClothModelIdentity(modelCode) {
  const normalized = String(modelCode || "")
    .trim()
    .toUpperCase()
    .replace(/\.(?:CHRM|MT5)$/u, "");
  const identity = normalized.split("_", 1)[0];
  return /^[A-Z0-9]{3}$/u.test(identity) ? identity : null;
}

export function nativeClothCharacterProfile(modelCode) {
  const identity = nativeClothModelIdentity(modelCode);
  return (
    (identity && NATIVE_CLOTH_CHARACTER_PROFILES[identity])
    || NATIVE_CLOTH_FALLBACK_PROFILE
  );
}

export function nativeClothBodyCollisionProfile(
  modelCode,
  runtimeMode = 0,
) {
  const overrideAddress = (
    NATIVE_CLOTH_RUNTIME_MODE_OVERRIDE_PROFILES[String(runtimeMode)]
  );
  const character = nativeClothCharacterProfile(modelCode);
  const address = overrideAddress || character.bodyCollisionProfileAddress;
  const profile = NATIVE_CLOTH_BODY_COLLISION_PROFILES[address];
  if (!profile) {
    throw new Error(`native cloth collision profile ${address} is unavailable`);
  }
  return profile;
}

/**
 * FUN_0c0af35e reads profile byte +0x0d to scale current-minus-previous
 * position independently on each source axis. These are executable literals,
 * not visually tuned garment parameters.
 */
export function nativeClothVelocityDampingForMode(mode) {
  return (
    NATIVE_CLOTH_SOLVER_PROFILE.velocityDampingByProfileByte0x0d[String(mode)]
    || NATIVE_CLOTH_SOLVER_PROFILE.velocityDampingByProfileByte0x0d.default
  );
}

export function nativeClothVelocityDamping(modelCode, runtimeMode = 0) {
  // FUN_0c0af35e's runtime-mode-4 branch keeps the complete parent-row
  // displacement, then adds the owner's lattice-weighted advection vector.
  if (runtimeMode === 4) return Object.freeze([1, 1, 1]);
  return nativeClothVelocityDampingForMode(
    nativeClothCharacterProfile(modelCode).rawControlBytes[5],
  );
}

export function nativeClothClosedRingConstraintProfile(
  modelCode,
  runtimeMode = 0,
) {
  const profile = nativeClothCharacterProfile(modelCode);
  if (runtimeMode !== 0) {
    return Object.freeze({
      spacingSource: "authored",
      spacingScale: 1,
      measuredMaximumBodyRadiusScale: null,
    });
  }
  if (profile.rawControlBytes[5] === 3) {
    return Object.freeze({
      spacingSource: "authored",
      spacingScale: NATIVE_CLOTH_SOLVER_PROFILE.closedRingAuthoredSpacingScale,
      measuredMaximumBodyRadiusScale: null,
    });
  }
  return Object.freeze({
    spacingSource: "measured",
    spacingScale: 1,
    measuredMaximumBodyRadiusScale: (
      NATIVE_CLOTH_SOLVER_PROFILE.closedRingMeasuredMaximumBodyRadiusScale
    ),
  });
}

import {
  NATIVE_SECONDARY_MOTION_MODEL_PROFILES,
} from "../data/native-secondary-motion-collision.web.js";

const DEFAULT_CHAIN_PROFILE = Object.freeze({
  behavior: "chain",
  damping: 0.8,
  gravity: 1.1,
  restoring: 0.02,
  gravityStepByMode: null,
  maximumDeflectionRadians: 0.75,
  constraintIterations: 4,
  maximumStepDistance: 0.08,
  resetDistance: 0.75,
});

// FUN_0c132a58 dispatches MT5 render-node types 0x78..0x8d to native OSAG
// handlers. Type 0x78 is the articulated-chain handler used by KOK_M's
// fourteen-piece ponytail. Other types deliberately remain disabled until
// their distinct native handlers have been characterized; treating every
// special node as hair would animate eyes, garment anchors, and attachments.
export const NATIVE_OSAG_CHAIN_NODE_TYPE = 0x78;
export const NATIVE_OSAG_STRAND_NODE_TYPE = 0x79;
// MGR_M has two type-0x81 chains rooted beneath its left/right arm hierarchy.
// The executable routes them to the bounded-angular surface handler at
// 0x0c135bec.  They are Shenhua's sleeves, not a second ponytail solver.
export const NATIVE_OSAG_ARTICULATED_SURFACE_NODE_TYPE = 0x81;
export const NATIVE_OSAG_SIMULATED_NODE_TYPES = Object.freeze([
  NATIVE_OSAG_CHAIN_NODE_TYPE,
  NATIVE_OSAG_STRAND_NODE_TYPE,
  NATIVE_OSAG_ARTICULATED_SURFACE_NODE_TYPE,
]);

const MGR_OPENING_RUNTIME_MODE = 1;

const NODE_TYPE_PROFILES = Object.freeze({
  // Live OP02 captures from the native 0x79 and 0x81 handlers. The values
  // are mean per-update node displacement, not visually tuned wind speeds.
  [NATIVE_OSAG_STRAND_NODE_TYPE]: Object.freeze({
    turbulenceStepByRuntimeMode: Object.freeze({
      [MGR_OPENING_RUNTIME_MODE]: 0.0057553028337186726,
    }),
    turbulenceVerticalScale: 0.03,
  }),
  [NATIVE_OSAG_ARTICULATED_SURFACE_NODE_TYPE]: Object.freeze({
    behavior: "articulated-surface",
    angularAmplitudeDegrees: 1.5,
    angularApproachDegrees: 0.19999998807907104,
    primaryPhaseStepDegrees: 10,
    secondaryPhaseStepDegrees: -15,
    primaryBiasDegrees: -1.5,
    secondaryBiasDegrees: -1.5,
    fixedTurnUnitsPer45Degrees: 8192,
  }),
});

const MODEL_PROFILES = Object.freeze({
  // FUN_0c132e14 has an explicit KOK branch. The constants surrounding that
  // branch retain 0.6 of the previous endpoint displacement. Its downward
  // step is 0.025 for modes 0/1 and 4+, 0.035 for mode 2, and 0.03 for mode 3.
  // None of those values is a positional spring. Keep the native model
  // identity here rather than leaking a
  // SORY/OP00 special case into presentation or cutscene configuration.
  KOK: Object.freeze({
    damping: NATIVE_SECONDARY_MOTION_MODEL_PROFILES.KOK.retainedDisplacement,
    gravity: 0,
    restoring: 0,
    gravityStepByMode:
      NATIVE_SECONDARY_MOTION_MODEL_PROFILES.KOK.downwardStepByMode,
    maximumDeflectionRadians: 0.6,
    constraintIterations: 5,
    maximumStepDistance: 0.08,
    resetDistance: 0.75,
  }),
});

export function nativeSecondaryMotionModelIdentity(modelCode) {
  const normalized = String(modelCode || "").trim().toUpperCase();
  if (!normalized) return null;
  return normalized.replace(/_[A-Z0-9]$/, "");
}

export function nativeSecondaryMotionProfile({
  modelCode,
  nodeType,
  runtimeMode = 0,
} = {}) {
  if (!NATIVE_OSAG_SIMULATED_NODE_TYPES.includes(nodeType)) return null;
  const identity = nativeSecondaryMotionModelIdentity(modelCode);
  const nodeTypeProfile = NODE_TYPE_PROFILES[nodeType] || null;
  if (
    nodeType !== NATIVE_OSAG_CHAIN_NODE_TYPE
    && (identity !== "MGR" || runtimeMode !== MGR_OPENING_RUNTIME_MODE)
  ) return null;
  return Object.freeze({
    ...DEFAULT_CHAIN_PROFILE,
    ...(nodeType === NATIVE_OSAG_CHAIN_NODE_TYPE && identity
      ? MODEL_PROFILES[identity]
      : null),
    ...nodeTypeProfile,
    turbulenceStep: (
      identity === "MGR" && nodeType !== NATIVE_OSAG_ARTICULATED_SURFACE_NODE_TYPE
    )
      ? nodeTypeProfile?.turbulenceStepByRuntimeMode?.[runtimeMode] || 0
      : 0,
  });
}

export function nativeSecondaryMotionNodeTypes({
  modelCode,
  runtimeMode = 0,
} = {}) {
  return Object.freeze(NATIVE_OSAG_SIMULATED_NODE_TYPES.filter(nodeType => (
    nativeSecondaryMotionProfile({ modelCode, nodeType, runtimeMode }) !== null
  )));
}

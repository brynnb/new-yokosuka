import fs from "node:fs";
import { parseMt7 } from "../../src/Mt7Parser.js";
import { shenmue2NativeRestProfileForNodes } from
  "../../play/characters/Shenmue2ScheduledActorMotionRuntime.js";

function matrixTranslation(matrix) {
  return matrix?.slice(12, 15);
}

function pointDistance(left, right) {
  if (!left || !right) return null;
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

export function shenmue2RestProfileForModelBytes(bytes) {
  const nodes = parseMt7(bytes).nodes.map((sourceNode) => ({
    sourceNode,
  }));
  const profile = shenmue2NativeRestProfileForNodes(nodes);
  return profile ? {
    name: profile.name,
    matchError: profile.error,
    modelFamily: profile.modelFamily,
    restRecordIndex: profile.restRecordIndex,
    selectorSource: profile.selectorSource,
    pelvisRest: profile.pelvisRest,
    neckLength: profile.neckLength,
    headOffset: profile.headOffset,
    legUpper: profile.features[0],
    legLower: profile.features[1],
    mirroredLegUpper: profile.mirroredLegUpper,
    mirroredLegLower: profile.mirroredLegLower,
    armUpper: profile.armSolverUpper,
    armLower: profile.armSolverLower,
  } : null;
}

export function shenmue2RestProfileForModelFile(filename) {
  return shenmue2RestProfileForModelBytes(fs.readFileSync(filename));
}

export function nativeControllerSegmentLengths(controller) {
  const matrices = new Map((controller.renderBindings || []).map((binding) => [
    Number(binding.controllerMatrixOffset),
    matrixTranslation(binding.controllerMatrix),
  ]));
  const length = (left, right) => pointDistance(
    matrices.get(left),
    matrices.get(right),
  );
  const chains = [
    ["leg", 0x620, 0x660, 0x760],
    ["leg", 0xb10, 0xb50, 0xc50],
    ["arm", 0x18c8, 0x1908, 0x1980],
    ["arm", 0x1e48, 0x1e88, 0x1f00],
  ];
  const measured = new Map();
  for (const [kind, root, joint, end] of chains) {
    const pair = [length(root, joint), length(joint, end)];
    if (pair.every(Number.isFinite)) {
      if (!measured.has(kind)) measured.set(kind, []);
      measured.get(kind).push(pair);
    }
  }
  const average = (kind, index) => {
    const values = (measured.get(kind) || []).map((pair) => pair[index]);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };
  return {
    legUpper: average("leg", 0),
    legLower: average("leg", 1),
    armUpper: average("arm", 0),
    armLower: average("arm", 1),
  };
}

export function nativeControllerRestProfileError(controller, profile) {
  const lengths = nativeControllerSegmentLengths(controller);
  if (!profile || !Object.values(lengths).every(Number.isFinite)) return null;
  // The visible hand matrix is not always the lower-arm solver endpoint (SEI
  // is the retained counterexample), so the three direct segment invariants
  // identify the profile without treating that renderer binding as anatomy.
  const expected = [profile.legUpper, profile.legLower, profile.armUpper];
  const actual = [lengths.legUpper, lengths.legLower, lengths.armUpper];
  return {
    lengths,
    relativeRmsError: Math.sqrt(expected.reduce((sum, value, index) => (
      sum + ((actual[index] - value) / Math.max(value, 0.05)) ** 2
    ), 0) / expected.length),
  };
}

export function classifyNativeControllerRestProfile(
  controller,
  profiles,
  { maximumRelativeRmsError = 0.03 } = {},
) {
  const match = [...profiles.values()].reduce((best, profile) => {
    const result = nativeControllerRestProfileError(controller, profile);
    if (!result) return best;
    return !best || result.relativeRmsError < best.relativeRmsError
      ? { name: profile.name, ...result }
      : best;
  }, null);
  return match?.relativeRmsError < maximumRelativeRmsError ? match : null;
}

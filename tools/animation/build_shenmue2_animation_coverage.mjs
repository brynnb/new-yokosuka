#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveShenmue2NativeMotionId } from "../../src/Shenmue2MotLoader.js";
import {
  classifyNativeControllerRestProfile,
  shenmue2RestProfileForModelBytes,
  shenmue2RestProfileForModelFile,
} from "../lib/Shenmue2NativeRestProfiles.js";
import { shenmue2HumanModelAssets } from
  "../lib/Shenmue2RuntimeActorBinding.js";
import {
  SHENMUE2_SPECIAL_ACTOR_MODELS,
  SHENMUE2_SPECIAL_MODEL_BY_CODE,
} from "../lib/Shenmue2SpecialActorBinding.js";
import { shenmue2RamCaptureTiming } from
  "../lib/Shenmue2CaptureEvidence.js";
import { SHENMUE2_NATIVE_REQUIRED_RENDER_POSE_OUTPUTS } from
  "../lib/Shenmue2AnimationConformance.js";

function parseArguments(argv) {
  const options = {
    crowdDirectory: "play/data/shenmue2-crowd",
    fixtureDirectory: "tests/fixtures/shenmue2-animation",
    fixtureReportDirectory: null,
    bindingsDirectory: ".disc-work",
    characterDirectory: "play/assets/shenmue2-characters",
    humansIndexPath: ".disc-work/shenmue2-disc1-native-npc/HUMANS.IDX",
    humansArchivePath: ".disc-work/shenmue2-disc1-native-npc/HUMANS.AFS",
    outputPath: "tools/evidence/shenmue2-animation-coverage.json",
  };
  const names = new Map([
    ["--crowd-dir", "crowdDirectory"],
    ["--fixtures-dir", "fixtureDirectory"],
    ["--fixtures-report-dir", "fixtureReportDirectory"],
    ["--bindings-dir", "bindingsDirectory"],
    ["--characters-dir", "characterDirectory"],
    ["--humans-index", "humansIndexPath"],
    ["--humans-archive", "humansArchivePath"],
    ["--out", "outputPath"],
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const property = names.get(argv[index]);
    const value = argv[index + 1];
    if (!property || value === undefined) {
      throw new Error(`Unknown or incomplete argument: ${argv[index] ?? ""}`);
    }
    options[property] = value;
  }
  const resolved = Object.fromEntries(Object.entries(options)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, path.resolve(value)]));
  resolved.fixtureReportDirectory ||= resolved.fixtureDirectory;
  return resolved;
}

function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((filename) => filename.endsWith(".json"))
    .sort()
    .map((filename) => path.join(directory, filename));
}

function recursiveJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory()
        ? recursiveJsonFiles(filename)
        : entry.name.endsWith(".json") ? [filename] : [];
    });
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function hex(value) {
  return `0x${Number(value).toString(16).padStart(4, "0")}`;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sortedCounts(map, keyName) {
  return [...map]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => ({ [keyName]: key, count }));
}

function relativeToRepository(filename) {
  return path.relative(process.cwd(), filename).split(path.sep).join("/");
}

const options = parseArguments(process.argv.slice(2));
const nativeModelAssets = shenmue2HumanModelAssets(
  options.humansIndexPath,
  options.humansArchivePath,
);
const nativeModels = new Map();
const nativeModelsByActor = new Map();
const nativeRestProfiles = new Map();
for (const asset of nativeModelAssets) {
  nativeModelsByActor.set(asset.actorCode, asset.modelCode);
  const profile = shenmue2RestProfileForModelBytes(asset.modelBytes);
  if (!nativeModels.has(asset.modelCode)) {
    nativeModels.set(asset.modelCode, {
      modelCode: asset.modelCode,
      restProfile: profile?.name || null,
      modelSha256: sha256(asset.modelBytes),
      actorCodes: [],
      logicalIndices: [],
    });
  }
  const model = nativeModels.get(asset.modelCode);
  if (model.modelSha256 !== sha256(asset.modelBytes)) {
    throw new Error(
      `HUMANS contains nonidentical ${asset.modelCode} model candidates`,
    );
  }
  if (!model.actorCodes.includes(asset.actorCode)) {
    model.actorCodes.push(asset.actorCode);
    model.actorCodes.sort();
  }
  if (!model.logicalIndices.includes(asset.logicalIndex)) {
    model.logicalIndices.push(asset.logicalIndex);
    model.logicalIndices.sort((left, right) => left - right);
  }
  if (profile && !nativeRestProfiles.has(profile.name)) {
    nativeRestProfiles.set(profile.name, profile);
  }
}
for (const binding of SHENMUE2_SPECIAL_ACTOR_MODELS) {
  nativeModelsByActor.set(binding.actorCode, binding.modelCode);
}
const availableModels = fs.existsSync(options.characterDirectory)
  ? fs.readdirSync(options.characterDirectory)
    // Story characters use native suffixes such as _M and _W. CHRM content,
    // not the filename suffix, determines whether the model is a complete
    // compact-controller body suitable for conformance.
    .filter((filename) => filename.endsWith(".CHRM"))
    .map((filename) => path.basename(filename, ".CHRM"))
    .sort()
  : [];
const modelProfiles = new Map(availableModels.map((modelCode) => {
  const filename = path.join(options.characterDirectory, `${modelCode}.CHRM`);
  return [modelCode, shenmue2RestProfileForModelFile(filename)];
}));
const availableModelAssets = availableModels.map((modelCode) => {
  const filename = path.join(options.characterDirectory, `${modelCode}.CHRM`);
  const modelSha256 = sha256(fs.readFileSync(filename));
  const nativeModel = nativeModels.get(modelCode);
  const specialModel = SHENMUE2_SPECIAL_MODEL_BY_CODE.get(modelCode);
  const nativeModelSha256 = nativeModel?.modelSha256
    || specialModel?.modelSha256
    || null;
  return {
    modelCode,
    file: relativeToRepository(filename),
    modelSha256,
    nativeModelSha256,
    exactNativeBytes: nativeModelSha256 === modelSha256,
    sourceInventory: specialModel ? "global-character" : "HUMANS",
  };
});
const restProfiles = new Map();
for (const [modelCode, profile] of modelProfiles) {
  if (!profile) continue;
  if (!restProfiles.has(profile.name)) {
    restProfiles.set(profile.name, { ...profile, models: [] });
  }
  restProfiles.get(profile.name).models.push(modelCode);
}
const pairActors = new Map();
const modelActors = new Map();
const motionActors = new Map();
const actorProfiles = new Map();
const explicitMotions = new Map();
let actorInstanceCount = 0;

for (const filename of jsonFiles(options.crowdDirectory)) {
  const crowd = readJson(filename);
  if (crowd.schema !== "new-yokosuka-shenmue2-crowd-v2") continue;
  for (const actor of crowd.actors || []) {
    const evidence = actor.shenmue2NativeEvidence || {};
    const motionId = Number(evidence.locomotionMotionId);
    const modelCode = actor.modelCode;
    if (!modelCode || !Number.isInteger(motionId)) continue;
    actorInstanceCount += 1;
    const pairKey = `${modelCode}:${motionId}`;
    const actorKey = `${crowd.worldId}:${actor.actorCode}`;
    if (!pairActors.has(pairKey)) pairActors.set(pairKey, new Set());
    pairActors.get(pairKey).add(actorKey);
    if (!modelActors.has(modelCode)) modelActors.set(modelCode, new Set());
    modelActors.get(modelCode).add(actorKey);
    increment(motionActors, hex(motionId));
    const profile = evidence.actorProfile || {};
    increment(
      actorProfiles,
      `age:${profile.ageCategory ?? "?"}/subtype:${profile.motionSubtype ?? "?"}`,
    );
    const explicit = evidence.explicitPoseMotion;
    if (Number.isInteger(Number(explicit?.motionId))) {
      increment(explicitMotions, hex(explicit.motionId));
    }
  }
}

function motionCategoryFor(motionId) {
  const resolvedMotion = resolveShenmue2NativeMotionId(motionId);
  return motionActors.has(hex(motionId))
    ? "outdoor-locomotion"
    : resolvedMotion?.bank === "npcTable"
      ? "npc-table-action"
      : resolvedMotion?.bank === "npc"
        ? "npc-shared"
        : resolvedMotion?.bank === "motion"
          ? "global-motion"
          : resolvedMotion ? "area-specific" : "unresolved";
}

const fixtures = recursiveJsonFiles(options.fixtureDirectory).flatMap((filename) => {
  const fixture = readJson(filename);
  if (fixture.schema !== "new-yokosuka-s2-native-pose-fixture-v1") return [];
  const modelCode = path.basename(fixture.modelFile, ".CHRM");
  const motionId = Number(fixture.motionId);
  const resolvedMotion = resolveShenmue2NativeMotionId(motionId);
  const motionCategory = motionCategoryFor(motionId);
  const slotMotionIds = [...new Set((fixture.frames || []).flatMap(
    (frame) => frame.slotMotionIds || [],
  ).map(Number))].sort((left, right) => left - right);
  const hasIndependentSlotMotion = slotMotionIds.some(
    (slotMotionId) => slotMotionId !== motionId,
  );
  const motionCategories = [...new Set([
    motionCategory,
    ...slotMotionIds.map(motionCategoryFor),
    ...(hasIndependentSlotMotion ? ["independently-layered"] : []),
  ])].sort();
  return [{
    id: fixture.id,
    status: fixture.status || "strict-native",
    file: relativeToRepository(path.join(
      options.fixtureReportDirectory,
      path.relative(options.fixtureDirectory, filename),
    )),
    modelCode,
    restProfile: modelProfiles.get(modelCode)?.name || null,
    motionId: hex(motionId),
    motionBank: resolvedMotion?.bank || null,
    motionCategory,
    motionCategories,
    slotMotionIds: slotMotionIds.map(hex),
    hasIndependentSlotMotion,
    runtimeCurveState: fixture.frames?.some(
      (frame) => frame.nativeSolverInputs?.curveAffines?.length,
    ) ? "captured-affine" : "identity-affine",
    frameCount: fixture.frames?.length || 0,
    controllerAddress: fixture.provenance?.controllerAddress || null,
    actorCode: fixture.provenance?.modelBinding?.actorCode || null,
    exactRenderedModelIdentity:
      fixture.provenance?.modelBinding?.exactRenderedModelIdentity || null,
  }];
});
const strictFixtures = fixtures.filter(({ status }) => status === "strict-native");
const discrepancyFixtures = fixtures.filter(
  ({ status }) => status.endsWith("discrepancy"),
);
const fixtureProfileMotions = new Map();
for (const fixture of strictFixtures) {
  const key = `${fixture.restProfile}:${fixture.motionId}`;
  if (!fixtureProfileMotions.has(key)) fixtureProfileMotions.set(key, []);
  fixtureProfileMotions.get(key).push(fixture.id);
}
const allFixtureProfileMotions = new Map();
for (const fixture of fixtures) {
  const key = `${fixture.restProfile}:${fixture.motionId}`;
  if (!allFixtureProfileMotions.has(key)) {
    allFixtureProfileMotions.set(key, []);
  }
  allFixtureProfileMotions.get(key).push(fixture.id);
}

const nativeObservations = new Map();
const nativeProfileMotionObservations = new Map();
const nativeProfileMotionControllerGroups = new Map();
const nativeSignatures = new Map();
const observedControllers = new Set();
let unclassifiedNativeControllerCount = 0;
for (const filename of jsonFiles(options.bindingsDirectory)) {
  const report = readJson(filename);
  if (report.schema !== "new-yokosuka-shenmue2-runtime-controller-bindings-v2") {
    continue;
  }
  const capture = path.basename(path.dirname(report.source?.ramPath || filename));
  const captureTiming = report.source?.captureTiming
    || shenmue2RamCaptureTiming(report.source?.ramPath || filename);
  for (const controller of report.controllers || []) {
    const observationKey = `${capture}:${controller.address}`;
    if (observedControllers.has(observationKey)) continue;
    observedControllers.add(observationKey);
    const motions = (controller.currentMotionIds || []).map(Number);
    if (!Number.isInteger(motions[0])) continue;
    increment(nativeObservations, hex(motions[0]));
    const restProfile = classifyNativeControllerRestProfile(
      controller,
      nativeRestProfiles,
    );
    if (restProfile) {
      const profileMotion = `${restProfile.name}:${hex(motions[0])}`;
      const actorCode = controller.actorBinding?.actorCode;
      const modelCode = nativeModelsByActor.get(actorCode);
      increment(
        nativeProfileMotionObservations,
        profileMotion,
      );
      // A compact controller address is allocation-local. Group exact actor
      // observations across scene reloads by their native identity so one
      // fixture can retain every synchronized allocation of that actor.
      const groupIdentity = actorCode || controller.address;
      const groupKey = `${profileMotion}:${groupIdentity}`;
      if (!nativeProfileMotionControllerGroups.has(groupKey)) {
        nativeProfileMotionControllerGroups.set(groupKey, {
          restProfile: restProfile.name,
          motionId: hex(motions[0]),
          controllerAddress: controller.address,
          controllerAddresses: new Set(),
          captures: [],
          captureTimingCounts: {},
          completePoseCaptureCount: 0,
          discoveryCompletePoseCaptureCount: 0,
          maximumRelativeSegmentLengthError: 0,
          actorCodes: new Set(),
          modelCodes: new Set(),
        });
      }
      const group = nativeProfileMotionControllerGroups.get(groupKey);
      group.controllerAddresses.add(controller.address);
      if (actorCode) group.actorCodes.add(actorCode);
      if (modelCode) group.modelCodes.add(modelCode);
      group.captures.push(capture);
      group.captureTimingCounts[captureTiming] = (
        group.captureTimingCounts[captureTiming] || 0
      ) + 1;
      const offsets = new Set((controller.renderBindings || []).map(
        ({ controllerMatrixOffset }) => Number(controllerMatrixOffset),
      ));
      if (SHENMUE2_NATIVE_REQUIRED_RENDER_POSE_OUTPUTS.every(
        ({ offset }) => offsets.has(offset),
      )) {
        group.discoveryCompletePoseCaptureCount += 1;
        if (captureTiming === "synchronized-pvr-frame") {
          group.completePoseCaptureCount += 1;
        }
      }
      group.maximumRelativeSegmentLengthError = Math.max(
        group.maximumRelativeSegmentLengthError,
        restProfile.relativeRmsError,
      );
    } else {
      unclassifiedNativeControllerCount += 1;
    }
    const signature = motions.map(hex).join("/");
    increment(nativeSignatures, signature);
  }
}

const pairs = [...pairActors].map(([pairKey, actors]) => {
  const separator = pairKey.lastIndexOf(":");
  const modelCode = pairKey.slice(0, separator);
  const motionNumber = Number(pairKey.slice(separator + 1));
  const motionId = hex(motionNumber);
  const restProfile = modelProfiles.get(modelCode)?.name || null;
  const actorKeys = [...actors].sort();
  return {
    modelCode,
    restProfile,
    motionId,
    actorCount: actors.size,
    actorKeys,
    worldIds: [...new Set(actorKeys.map(
      (actorKey) => actorKey.slice(0, actorKey.indexOf(":")),
    ))].sort(),
    nativeControllerObservationCount: nativeObservations.get(motionId) || 0,
    nativeProfileMotionObservationCount: nativeProfileMotionObservations.get(
      `${restProfile}:${motionId}`,
    ) || 0,
    fixtureIds: strictFixtures.filter((fixture) => (
      fixture.modelCode === modelCode && fixture.motionId === motionId
    )).map(({ id }) => id),
    profileMotionFixtureIds: fixtureProfileMotions.get(
      `${restProfile}:${motionId}`,
    ) || [],
  };
}).sort((left, right) => (
  right.actorCount - left.actorCount
  || right.nativeControllerObservationCount
    - left.nativeControllerObservationCount
  || left.modelCode.localeCompare(right.modelCode)
));

const observedMotionIds = new Set(nativeObservations.keys());
const crowdMotionIds = new Set(motionActors.keys());
const fixtureMotionIds = new Set(strictFixtures.map(({ motionId }) => motionId));
const fixtureAllMotionIds = new Set(fixtures.flatMap(
  ({ slotMotionIds }) => slotMotionIds,
));
const strictFixtureMotionCategories = new Set(strictFixtures.flatMap(
  ({ motionCategories }) => motionCategories,
));
const fixtureModels = new Set(strictFixtures.map(({ modelCode }) => modelCode));
const strictFixtureRestProfiles = new Set(strictFixtures
  .map(({ restProfile }) => restProfile)
  .filter(Boolean));
const requiredProfileMotions = new Set(pairs.map(
  ({ restProfile, motionId }) => `${restProfile}:${motionId}`,
));
const crowdRestProfiles = new Set(pairs.map(({ restProfile }) => restProfile));
const coveredProfileMotions = new Set([...requiredProfileMotions].filter(
  (key) => fixtureProfileMotions.has(key),
));
const fixtureSourceCandidates = [...nativeProfileMotionControllerGroups.values()]
  .map((candidate) => ({
    ...candidate,
    controllerAddresses: [...candidate.controllerAddresses].sort(),
    actorCodes: [...candidate.actorCodes].sort(),
    modelCodes: [...candidate.modelCodes].sort(),
    exactActorModelBindingCount: candidate.actorCodes.size,
    captureCount: candidate.captures.length,
    requiredCrowdPair: requiredProfileMotions.has(
      `${candidate.restProfile}:${candidate.motionId}`,
    ),
    // A retained discrepancy is already the exact native source for this
    // profile/motion pair. Include it here so corpus refresh does not create
    // a second fixture merely because the first one correctly fails strict
    // conformance.
    existingFixtureIds: allFixtureProfileMotions.get(
      `${candidate.restProfile}:${candidate.motionId}`,
    ) || [],
  }))
  .sort((left, right) => (
    Number(right.requiredCrowdPair) - Number(left.requiredCrowdPair)
    || right.completePoseCaptureCount - left.completePoseCaptureCount
    || right.captureCount - left.captureCount
    || left.restProfile.localeCompare(right.restProfile)
    || left.motionId.localeCompare(right.motionId)
    || left.controllerAddress.localeCompare(right.controllerAddress)
  ));

const nativeRestProfileCoverage = [...nativeRestProfiles.keys()].sort()
  .map((restProfile) => {
    const nativeModelCodes = [...nativeModels.values()]
      .filter((model) => model.restProfile === restProfile)
      .map(({ modelCode }) => modelCode)
      .sort();
    const specialModelCodes = SHENMUE2_SPECIAL_ACTOR_MODELS
      .filter(({ modelCode }) => (
        modelProfiles.get(modelCode)?.name === restProfile
      ))
      .map(({ modelCode }) => modelCode);
    const availableModelCodes = [...new Set([
      ...nativeModelCodes.filter((modelCode) => modelProfiles.has(modelCode)),
      ...specialModelCodes,
    ])].sort();
    const observedMotionIds = [...nativeProfileMotionObservations.keys()]
      .flatMap((key) => {
        const separator = key.indexOf(":");
        return key.slice(0, separator) === restProfile
          ? [key.slice(separator + 1)]
          : [];
      })
      .sort();
    const fixtureIds = strictFixtures
      .filter((fixture) => fixture.restProfile === restProfile)
      .map(({ id }) => id)
      .sort();
    const status = fixtureIds.length
      ? "strict-native"
      : observedMotionIds.length
        ? "native-observed-without-exact-model-fixture"
        : availableModelCodes.length
          ? "browser-model-requires-native-capture"
          : "native-model-not-extracted-for-browser";
    return {
      restProfile,
      status,
      nativeModelCount: nativeModelCodes.length,
      specialModelCount: specialModelCodes.length,
      availableModelCount: availableModelCodes.length,
      availableModelCodes,
      observedMotionIds,
      fixtureIds,
      requiredEvidence: fixtureIds.length ? null : (
        observedMotionIds.length
          ? "Resolve an exact live actor/model binding for an existing complete native controller capture"
          : availableModelCodes.length
            ? "Capture one exact available model with all 17 visible solver matrices bound"
            : "Extract and bind at least one exact HUMANS model, then capture its native controller"
      ),
    };
  });

const missingNativeProfileCaptureTargets = nativeRestProfileCoverage
  .filter(({ fixtureIds, availableModelCodes }) => (
    fixtureIds.length === 0 && availableModelCodes.length > 0
  ))
  .flatMap((profile) => profile.availableModelCodes.map((modelCode) => {
    const model = nativeModels.get(modelCode);
    const specialModel = SHENMUE2_SPECIAL_MODEL_BY_CODE.get(modelCode);
    return {
      restProfile: profile.restProfile,
      modelCode,
      actorCodes: model?.actorCodes
        || (specialModel ? [specialModel.actorCode] : []),
      observedMotionIds: profile.observedMotionIds,
      requiredEvidence: (
        "Dreamcast RAM capture with one exact listed native actor active and "
        + "all 17 visible solver matrices bound; intermediate arm roots may be read directly from controller RAM"
      ),
    };
  }));

const report = {
  schema: "new-yokosuka-shenmue2-animation-coverage-v1",
  evidenceBoundary: (
    "The full NPC model inventory comes directly from HUMANS.IDX/AFS. Crowd "
    + "model/motion pairings come from extracted NPC.BIN and HUMANS assets; "
    + "native controller observations come from retained Dreamcast RAM binding "
    + "reports. Live HUMANS records and separately audited CLMD special-actor "
    + "records provide exact actor/model identity when present; a matching "
    + "motion ID alone does not identify a model."
  ),
  summary: {
    nativeHumanActorBindingCount: nativeModelAssets.length,
    nativeHumanModelCount: nativeModels.size,
    nativeHumanRestProfileCount: nativeRestProfiles.size,
    nativeHumanUnclassifiedModelCount: [...nativeModels.values()]
      .filter(({ restProfile }) => !restProfile).length,
    availableCharacterModelCount: availableModels.length,
    availableCharacterRestProfileCount: restProfiles.size,
    exactNativeAvailableCharacterModelCount: availableModelAssets.filter(
      ({ exactNativeBytes }) => exactNativeBytes,
    ).length,
    crowdReferencedModelCount: modelActors.size,
    crowdActorInstanceCount: actorInstanceCount,
    crowdModelMotionPairCount: pairActors.size,
    crowdRestProfileCount: crowdRestProfiles.size,
    crowdRestProfileMotionPairCount: requiredProfileMotions.size,
    crowdLocomotionMotionCount: crowdMotionIds.size,
    explicitLayerMotionCount: explicitMotions.size,
    nativeControllerObservationCount: observedControllers.size,
    nativeUnclassifiedControllerCount: unclassifiedNativeControllerCount,
    nativeObservedPrimaryMotionCount: observedMotionIds.size,
    nativeObservedRestProfileMotionPairCount: nativeProfileMotionObservations.size,
    strictFixtureCount: strictFixtures.length,
    exactNativeDiscrepancyFixtureCount: discrepancyFixtures.length,
    exactNativeDiscrepancyFrameCount: discrepancyFixtures.reduce(
      (sum, { frameCount }) => sum + frameCount,
      0,
    ),
    fixtureModelCount: fixtureModels.size,
    strictFixtureRestProfileCount: strictFixtureRestProfiles.size,
    nativeRestProfilesWithoutStrictFixtureCount:
      nativeRestProfiles.size - strictFixtureRestProfiles.size,
    nativeRestProfilesReadyForCaptureCount: nativeRestProfileCoverage.filter(
      ({ fixtureIds, availableModelCodes }) => (
        fixtureIds.length === 0 && availableModelCodes.length > 0
      ),
    ).length,
    fixturePrimaryMotionCount: fixtureMotionIds.size,
    fixtureAllSlotMotionCount: fixtureAllMotionIds.size,
    strictFixtureMotionCategoryCount: strictFixtureMotionCategories.size,
    strictFixtureIndependentLayerCount: strictFixtures.filter(
      ({ hasIndependentSlotMotion }) => hasIndependentSlotMotion,
    ).length,
    fixtureCoveredCrowdPairCount: pairs.filter(({ fixtureIds }) => fixtureIds.length).length,
    fixtureCoveredRestProfileMotionPairCount: coveredProfileMotions.size,
  },
  fixtures,
  coverage: {
    nativeModelsNotExtractedForBrowser: [...nativeModels.keys()].filter(
      (modelCode) => !modelProfiles.has(modelCode),
    ).sort(),
    extractedModelsAbsentFromNativeHumans: availableModels.filter(
      (modelCode) => (
        !nativeModels.has(modelCode)
        && !SHENMUE2_SPECIAL_MODEL_BY_CODE.has(modelCode)
      ),
    ),
    extractedModelsDifferingFromNativeHumans: availableModelAssets
      .filter(({ nativeModelSha256, exactNativeBytes }) => (
        nativeModelSha256 && !exactNativeBytes
      ))
      .map(({ modelCode }) => modelCode),
    availableModelsNotReferencedByCrowds: availableModels.filter(
      (modelCode) => !modelActors.has(modelCode),
    ),
    crowdModelsWithoutFixture: [...modelActors.keys()].filter(
      (modelCode) => !fixtureModels.has(modelCode),
    ).sort(),
    crowdMotionsWithoutNativeObservation: [...crowdMotionIds].filter(
      (motionId) => !observedMotionIds.has(motionId),
    ).sort(),
    nativeObservedMotionsWithoutFixture: [...observedMotionIds].filter(
      (motionId) => !fixtureMotionIds.has(motionId),
    ).sort(),
  },
  nativeModelInventory: [...nativeModels.values()].sort(
    (left, right) => left.modelCode.localeCompare(right.modelCode),
  ),
  specialActorModelInventory: SHENMUE2_SPECIAL_ACTOR_MODELS,
  availableModelAssets,
  nativePrimaryMotionObservations: sortedCounts(nativeObservations, "motionId"),
  nativeRestProfileMotionObservations: sortedCounts(
    nativeProfileMotionObservations,
    "restProfileMotion",
  ),
  nativeRestProfileCoverage,
  nativeFixtureSourceCandidates: fixtureSourceCandidates,
  nativeSlotSignatures: sortedCounts(nativeSignatures, "slotMotionIds"),
  restProfiles: [...restProfiles.values()].sort(
    (left, right) => left.name.localeCompare(right.name),
  ),
  crowdLocomotionMotions: sortedCounts(motionActors, "motionId"),
  crowdExplicitLayerMotions: sortedCounts(explicitMotions, "motionId"),
  crowdActorProfiles: sortedCounts(actorProfiles, "profile"),
  modelMotionPairs: pairs,
  missingNativeProfileCaptureTargets,
  missingNativeCaptureTargets: pairs.filter(({
    nativeProfileMotionObservationCount,
  }) => nativeProfileMotionObservationCount === 0).map((pair) => ({
    restProfile: pair.restProfile,
    motionId: pair.motionId,
    modelCode: pair.modelCode,
    actorCount: pair.actorCount,
    actorKeys: pair.actorKeys,
    worldIds: pair.worldIds,
    requiredEvidence: (
      "Dreamcast RAM capture with this actor active and all 17 visible "
      + "solver matrices bound; intermediate arm roots may be read directly "
      + "from controller RAM; exact HUMANS actor/model binding is required"
    ),
  })),
  nextFixtureCandidates: [...new Map(pairs.filter(({
    profileMotionFixtureIds,
    nativeProfileMotionObservationCount,
  }) => (
    !profileMotionFixtureIds.length && nativeProfileMotionObservationCount > 0
  )).map((pair) => [`${pair.restProfile}:${pair.motionId}`, pair])).values()],
};

fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
fs.writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.error(
  `Wrote ${pairs.length} model/motion pairs, ${observedControllers.size} native observations, ${strictFixtures.length} strict fixtures, and ${discrepancyFixtures.length} discrepancy fixtures to ${options.outputPath}`,
);

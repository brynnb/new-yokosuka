#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  scheduledActorAreaWorlds,
} from "../lib/scheduled_actor_world_mapping.js";

const sourcePath = path.resolve(
  process.argv[2] || "tools/evidence/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[3] || "play/data/scheduled-actors.json",
);
const assetPath = path.resolve("play/data/scheduled-actor-assets.json");
const nativeMapTransitionPath = path.resolve(
  "play/data/native-map-transitions.json",
);
const mcirOccupancyPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-mcir-occupancy-evidence.json",
);
const actionEvidencePath = path.resolve(
  process.argv[5]
    || "tools/evidence/scheduled-actor-action-evidence.json",
);
const characterSelectionEvidencePath = path.resolve(
  process.argv[6]
    || (
      "tools/evidence/"
      + "scheduled-actor-character-selection-evidence.json"
    ),
);
const modelOverrideEvidencePath = path.resolve(
  process.argv[7]
    || "tools/evidence/scheduled-actor-model-override-evidence.json",
);
const sceneObjectEvidencePath = path.resolve(
  process.argv[8]
    || "tools/evidence/scheduled-actor-scene-object-evidence.json",
);
const variableMotionEvidencePath = path.resolve(
  process.argv[9]
    || "tools/evidence/scheduled-actor-variable-motion-evidence.json",
);
const linkedInteractionEvidencePath = path.resolve(
  process.argv[10]
    || "tools/evidence/scheduled-actor-linked-interaction-evidence.json",
);
const interactionRegistrationEvidencePath = path.resolve(
  process.argv[11]
    || (
      "tools/evidence/"
      + "scheduled-actor-interaction-registration-evidence.json"
    ),
);
const subordinateEvidencePath = path.resolve(
  process.argv[13]
    || "tools/evidence/scheduled-actor-subordinate-evidence.json",
);
const defaultIdleEvidencePath = path.resolve(
  process.argv[14]
    || "tools/evidence/scheduled-actor-default-idle-evidence.json",
);
const targetRegistryEvidencePath = path.resolve(
  process.argv[15]
    || "tools/evidence/scheduled-actor-target-registry-evidence.json",
);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const assetEvidence = JSON.parse(fs.readFileSync(assetPath, "utf8"));
const nativeMapTransitions = JSON.parse(
  fs.readFileSync(nativeMapTransitionPath, "utf8"),
);
const defaultIdleEvidence = JSON.parse(
  fs.readFileSync(defaultIdleEvidencePath, "utf8"),
);
const defaultIdleByActor = new Map(
  defaultIdleEvidence.actors.map((actor) => [actor.actorCode, actor]),
);
const mcirOccupancyEvidence = JSON.parse(
  fs.readFileSync(mcirOccupancyPath, "utf8"),
);
const actionEvidence = JSON.parse(
  fs.readFileSync(actionEvidencePath, "utf8"),
);
const actionBindingById = new Map(actionEvidence.actionIdBindings.map(
  (binding) => [binding.actionControllerId, binding],
));
const characterSelectionEvidence = JSON.parse(
  fs.readFileSync(characterSelectionEvidencePath, "utf8"),
);
const characterBindingByCode = new Map(
  characterSelectionEvidence.characterBindings.map(
    (binding) => [binding.residentCharacterCode, binding],
  ),
);
const attachmentEvidencePath = path.resolve(
  process.argv[12]
    || "tools/evidence/scheduled-actor-attachment-evidence.json",
);
const modelOverrideEvidence = JSON.parse(
  fs.readFileSync(modelOverrideEvidencePath, "utf8"),
);
const liveModelOverrideCountByCode = new Map(
  [...Map.groupBy(
    modelOverrideEvidence.observations.filter(
      (observation) => observation.modelOverridePresent,
    ),
    (observation) => observation.modelOverrideCode,
  ).entries()].map(([modelCode, observations]) => [
    modelCode,
    observations.length,
  ]),
);
const sceneObjectEvidence = JSON.parse(
  fs.readFileSync(sceneObjectEvidencePath, "utf8"),
);
const variableMotionEvidence = JSON.parse(
  fs.readFileSync(variableMotionEvidencePath, "utf8"),
);
const linkedInteractionEvidence = JSON.parse(
  fs.readFileSync(linkedInteractionEvidencePath, "utf8"),
);
const interactionRegistrationEvidence = JSON.parse(
  fs.readFileSync(interactionRegistrationEvidencePath, "utf8"),
);
const targetRegistryEvidence = JSON.parse(
  fs.readFileSync(targetRegistryEvidencePath, "utf8"),
);
const targetRegistryByCode = new Map(
  targetRegistryEvidence.targets.map(
    (target) => [target.targetCode, target],
  ),
);
const subordinateEvidence = JSON.parse(
  fs.readFileSync(subordinateEvidencePath, "utf8"),
);
const attachmentEvidence = JSON.parse(
  fs.readFileSync(attachmentEvidencePath, "utf8"),
);
const linkedInteractionBindingByTarget = new Map(
  linkedInteractionEvidence.targetBindings.map(
    (binding) => [binding.targetCode, binding],
  ),
);
const activeVariableMotionCountByOperation = new Map(
  [...Map.groupBy(
    variableMotionEvidence.activeObservations.filter(
      (observation) => observation.sourceMatchCount === 1,
    ),
    (observation) => (
      `${observation.sourceProgramByteSha256}:`
      + observation.exactSourceOperation.operationFileOffset
    ),
  ).entries()].map(([operationKey, observations]) => [
    operationKey,
    observations.length,
  ]),
);
const activeSceneObjectCountByBinding = new Map(
  [...Map.groupBy(
    sceneObjectEvidence.activeObservations.filter(
      (observation) => observation.sourceMatchCount === 1,
    ),
    (observation) => (
      `${observation.sceneObjectCode}:`
      + observation.sceneObjectControlValue
    ),
  ).entries()].map(([binding, observations]) => [
    binding,
    observations.length,
  ]),
);

// The supported Dobuita destinations are the authoritative list of interiors
// the browser can load. Keeping schedule playback on that same source prevents
// a newly supported room from silently rendering without its resident actors.
const areaWorlds = scheduledActorAreaWorlds(nativeMapTransitions);
const harborAreas = new Set(["MFSY", "MKSG", "MS08"]);
const synchronousDescriptorOperations = new Set([
  2, 3, 5, 8, 9, 0x0b, 0x0c, 0x0d, 0x0f,
  0x10, 0x11, 0x13, 0x15, 0x17, 0x19,
  0x1a, 0x1b, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x24, 0x28,
  0x2a, 0x2b, 0x2f, 0x30, 0x33, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d,
]);

function runtimePlacementModelsByAreaAndTag() {
  const result = new Map();
  for (const [area, worldId] of Object.entries(areaWorlds)) {
    const filename = path.resolve(
      `play/data/${worldId === "mfsy" ? "mfsy" : area.toLowerCase()}`
      + "-runtime-placements.json",
    );
    if (!fs.existsSync(filename)) continue;
    const document = JSON.parse(fs.readFileSync(filename, "utf8"));
    for (const placement of document.placements || []) {
      const tag = placement.runtime?.objectTag;
      if (!tag || !placement.model) continue;
      const key = `${area}:${tag}`;
      const models = result.get(key) || new Set();
      models.add(placement.model);
      result.set(key, models);
    }
  }
  return result;
}

const localObjectModels = runtimePlacementModelsByAreaAndTag();

function timeText(seconds) {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function descriptorOperation(operation, routes, sourceVariant) {
  const result = {
    operation: operation.operation,
    fileOffset: operation.fileOffset,
    byteLength: operation.byteLength,
    rawOperands: operation.rawOperands,
  };
  if (operation.operation === 8) result.area = operation.area;
  if (operation.operation === 3) {
    result.runtimePosition = operation.runtimePosition;
    result.browserPosition = operation.browserPosition;
    result.facingFixed = operation.facingFixed;
  }
  if (operation.operation === 7) {
    result.durationSeconds = operation.durationSeconds;
  }
  if (operation.operation === 2) {
    result.motionStateId = operation.motionStateId;
  }
  if (operation.operation === 9) {
    result.actorStateValue = operation.actorStateValue;
  }
  if (operation.operation === 0x0f) {
    result.actorControlValue = operation.actorControlValue;
  }
  if (operation.operation === 0x10) {
    result.localTransform = operation.localTransform;
  }
  if (operation.operation === 0x11) {
    result.objectCode = operation.objectCode;
  }
  if (operation.operation === 0x16) {
    result.targetCode = operation.targetCode;
    result.activationSecond = operation.activationSecond;
    result.recordCount = operation.recordCount;
    result.encodedWordLength = operation.encodedWordLength;
    result.minimumDelaySeconds = operation.minimumDelaySeconds;
    result.subordinateStream = operation.subordinateStream;
    result.subordinateRuntimeEvidence = {
      stateMachineAddress:
        subordinateEvidence.nativeEvidence.controllerStateMachineAddress,
      initializationAddress:
        subordinateEvidence.nativeEvidence.controllerInitializationAddress,
      subordinateCursorOffset:
        subordinateEvidence.nativeEvidence.actorSubordinateCursorOffset,
      exactRuntimeObservationCount:
        subordinateEvidence.summary.exactActiveOperation16ObservationCount,
      runtimeEvidence: path.relative(
        process.cwd(),
        subordinateEvidencePath,
      ),
      replayBoundary: (
        "gate waiting and final placement are deterministic where linked "
        + "placements resolve; intermediate controller route duration "
        + "remains unmodeled"
      ),
    };
  }
  if (operation.operation === 0x17) {
    const targetRegistry = targetRegistryByCode.get(operation.targetCode);
    if (!targetRegistry?.byteStableSubtype) {
      throw new Error(
        `Operation 0x17 target ${operation.targetCode} has no exact subtype`,
      );
    }
    result.targetCode = operation.targetCode;
    result.targetSubtype = targetRegistry.targetSubtype;
    result.interactionMode = operation.interactionMode;
    result.interactionModeSigned = operation.interactionModeSigned;
    result.timeControlValue = operation.timeControlValue;
    result.targetTimeMode = operation.targetTimeMode;
    result.relativeDurationSeconds = operation.relativeDurationSeconds;
    result.absoluteTargetSecond = operation.absoluteTargetSecond;
    result.runtimePosition = operation.runtimePosition;
    result.browserPosition = operation.browserPosition;
    result.controlValues = operation.controlValues;
    result.interactionRegistrationEvidence = {
      widthHandlerAddress: "0x0c0f9566",
      initializerAddress: "0x0c0f956a",
      updateAddress: "0x0c0f9630",
      descriptorHandlerAddress: "0x0c0f96d0",
      activePredicateAddress: "0x0c0f987c",
      actorRegistrationPointerOffset: "0xa4",
      actorStateOffset: "0xd4",
      actorOperationPointerOffset: "0xd8",
      actorTargetRegistryPointerOffset: "0xdc",
      targetRegistryLookupAddress: "0x0c0f9458",
      targetRegistryEvidence: path.relative(
        process.cwd(),
        targetRegistryEvidencePath,
      ),
      targetSubtype: targetRegistry.targetSubtype,
      targetSubtypeObservationCount: targetRegistry.observationCount,
      descriptorBehavior:
        "synchronous registration; externally activated",
      runtimeEvidence: path.relative(
        process.cwd(),
        interactionRegistrationEvidencePath,
      ),
      payloadStatus: (
        "position and seven control words retained numerically; "
        + "native target subtype is exact, while subtype-specific "
        + "animation/placement control mapping remains unresolved"
      ),
    };
  }
  if (operation.operation === 0x19) {
    result.motionStateId = operation.motionStateId;
    result.motionStateControlWord = operation.motionStateControlWord;
    result.motionRequestControlValues =
      operation.motionRequestControlValues;
    result.motionRequestEffect = operation.motionRequestEffect;
    result.motionRequestEvidence = {
      handlerPointerLiteralAddress: "0x0c11978c",
      handlerAddress: "0x0c11f804",
      controllerRequestAddress: "0x0c10d77c",
      actorMotionRequestOffset: "0xf0",
      actorControllerPointerOffset: "0x6c",
      zeroValueEffect:
        "tears down the previous controller request before storing zero",
    };
  }
  if (operation.operation === 0x1a) {
    result.motionStateId = operation.motionStateId;
    result.motionControlValue = operation.motionControlValue;
    result.motionTailValue = operation.motionTailValue;
  }
  if (operation.operation === 0x18) {
    const targetRegistry = targetRegistryByCode.get(operation.targetCode);
    const targetBinding = linkedInteractionBindingByTarget.get(
      operation.targetCode,
    );
    if (
      !targetRegistry?.byteStableSubtype
      || (
        targetBinding
        && targetBinding.targetSubtype !== targetRegistry.targetSubtype
      )
    ) {
      throw new Error(
        `Operation 0x18 target ${operation.targetCode} subtype is not exact`,
      );
    }
    result.targetCode = operation.targetCode;
    result.targetSubtype = targetRegistry.targetSubtype;
    result.timeControlValue = operation.timeControlValue;
    result.targetTimeMode = operation.targetTimeMode;
    result.relativeDurationSeconds = operation.relativeDurationSeconds;
    result.absoluteTargetSecond = operation.absoluteTargetSecond;
    result.interactionMotionStateIds =
      operation.interactionMotionStateIds;
    result.interactionControlValues =
      operation.interactionControlValues;
    result.linkedInteractionEvidence = {
      handlerAddress: "0x0c0f9812",
      targetRegistryLookupAddress: "0x0c0f9458",
      initializerAddress: "0x0c0f96f0",
      subtypeOneHandlerAddress: "0x0c0f8ec0",
      subtypeThreeHandlerAddress: "0x0c0f6b38",
      actorStateOffset: "0xd4",
      actorOperationPointerOffset: "0xd8",
      actorTargetRegistryPointerOffset: "0xdc",
      actorTargetSecondOffset: "0xe0",
      targetRegistryEvidence: path.relative(
        process.cwd(),
        targetRegistryEvidencePath,
      ),
      runtimeEvidence: path.relative(
        process.cwd(),
        linkedInteractionEvidencePath,
      ),
      targetBinding: targetBinding ? {
        targetSubtype: targetBinding.targetSubtype,
        activeWindowStartSecond:
          targetBinding.activeWindowStartSecond,
        activeWindowEndSecond:
          targetBinding.activeWindowEndSecond,
        observationCount: targetBinding.observationCount,
        captureHashCount: targetBinding.captureHashCount,
      } : null,
      payloadStatus: (
        "three numeric motion-state IDs and four control values retained; "
        + "higher-level interaction animation names remain unresolved"
      ),
    };
  }
  if (operation.operation === 0x22) {
    const operationKey = (
      `${sourceVariant.sourceProgramByteSha256}:`
      + operation.fileOffset
    );
    result.timeControlValue = operation.timeControlValue;
    result.targetTimeMode = operation.targetTimeMode;
    result.relativeDurationSeconds = operation.relativeDurationSeconds;
    result.absoluteTargetSecond = operation.absoluteTargetSecond;
    result.motionCandidateCount = operation.motionCandidateCount;
    result.uniqueMotionStateIds = operation.uniqueMotionStateIds;
    result.deterministicMotionStateId =
      operation.deterministicMotionStateId;
    result.motionStateSelectionStatus =
      operation.motionStateSelectionStatus;
    result.motionCandidates = operation.motionCandidates.map(
      (candidate) => ({
        recordIndex: candidate.recordIndex,
        motionStateId: candidate.motionStateId,
        motionWord: candidate.motionWord,
        motionControlFloat: candidate.motionControlFloat,
        motionControlFlags: candidate.motionControlFlags,
        selectionAdvanceControl: candidate.selectionAdvanceControl,
      }),
    );
    result.variableMotionEvidence = {
      handlerAddress: "0x0c0f90f2",
      initializerAddress: "0x0c0f8f48",
      updateAddress: "0x0c0f8f8c",
      actorOperationPointerOffset: "0xac",
      actorTargetSecondOffset: "0xcc",
      actorSelectedIndexOffset: "0xd0",
      actorCandidateCountOffset: "0xd4",
      actorMotionStateOffset: "0x06",
      runtimeEvidence: path.relative(
        process.cwd(),
        variableMotionEvidencePath,
      ),
      exactActiveRuntimeObservationCount:
        activeVariableMotionCountByOperation.get(operationKey) || 0,
      selectionStatus: (
        Number.isInteger(operation.deterministicMotionStateId)
          ? (
            "all authored candidates share one numeric motion state; "
            + "motion-state selection is RNG-independent"
          )
          : (
            "candidate records and selected numeric motion states are "
            + "proven; native random choice and authored motion names are "
            + "not synthesized"
          )
      ),
    };
  }
  if (operation.operation === 0x1c) {
    const positivePathStep = operation.pathControlFloat > 0
      ? Math.fround(
        Math.fround(operation.pathControlFloat)
        * Math.fround(
          attachmentEvidence.handlerEvidence.positivePathControlScale,
        ),
      )
      : null;
    const negativeForkliftPathStep = (
      operation.pathControlFloat === -20
      && operation.secondaryObjectCode.startsWith(
        attachmentEvidence.handlerEvidence.forkliftObjectPrefix,
      )
    )
      ? attachmentEvidence.handlerEvidence
        .forkliftNegativeTwentyPathStep
      : null;
    result.secondaryControlWord = operation.secondaryControlWord;
    result.secondaryObjectCode = operation.secondaryObjectCode;
    result.pointCount = operation.pointCount;
    result.pointFileOffset = operation.resolvedFileOffset;
    result.pathControlFloat = operation.pathControlFloat;
    result.pathControlValue = operation.pathControlValue;
    result.resolvedPathStepPerUpdate =
      positivePathStep ?? negativeForkliftPathStep;
    result.secondaryRoute = operation.secondaryRoute && {
      points: operation.secondaryRoute.browserPoints,
    };
    result.attachmentRouteEvidence = {
      initializationHandlerAddress: "0x0c128a2e",
      actorObjectSynchronizationAddress: "0x0c12ac2e",
      pointStrideBytes: 8,
      pointAxes: ["runtimeX", "runtimeZ"],
      actorRoutePointerOffset: "0x5c",
      actorRoutePointCountOffset: "0x60",
      nativePathStepOffset: "0x140",
      positivePathControlScaleAddress: "0x0c1290f0",
      positivePathControlScale: 0.009259258396923542,
      positivePathControlRule: (
        "pathControlFloat * positivePathControlScale"
      ),
      negativePathControlSelectorAddress: "0x0c12ab92",
      negativeTwentyRule: (
        "-20 selects index 1 from the attachment-type path-step table"
      ),
      forkliftObjectPrefix:
        attachmentEvidence.handlerEvidence.forkliftObjectPrefix,
      forkliftPathStepTableAddress:
        attachmentEvidence.handlerEvidence.forkliftPathStepTableAddress,
      forkliftPathStepTable:
        attachmentEvidence.handlerEvidence.forkliftPathStepTable,
      resolvedPathStepStatus: Number.isFinite(
        positivePathStep ?? negativeForkliftPathStep,
      )
        ? "engine-proven finite path step"
        : "unresolved path-control mapping",
    };
  }
  if (operation.operation === 0x24) {
    result.secondaryObjectCode = operation.secondaryObjectCode;
    result.runtimeVector = operation.runtimeVector;
    result.browserVector = operation.runtimeVector && [
      -operation.runtimeVector[0],
      operation.runtimeVector[1],
      operation.runtimeVector[2],
    ];
    result.transformControlWord = operation.transformControlWord;
    result.enabled = operation.enabled;
    result.attachmentPlacementEvidence = {
      handlerAddress: "0x0c12b9a0",
      actorAttachmentPointerOffset: "0x98",
      actorPositionOffset: "0x24",
      attachmentPositionOffset: "0x1c",
      actorFacingOffset: "0x50",
      attachmentFacingOffset: "0x44",
    };
  }
  if (operation.operation === 0x28) {
    result.actorByteValue = operation.actorByteValue;
  }
  if (operation.operation === 0x2a) {
    const binding = (
      `${operation.sceneObjectCode}:`
      + operation.sceneObjectControlValue
    );
    result.sceneObjectCode = operation.sceneObjectCode;
    result.sceneObjectControlValue =
      operation.sceneObjectControlValue;
    result.sceneObjectTransitionMode =
      operation.sceneObjectTransitionMode;
    result.interactionRuntimePosition =
      operation.interactionRuntimePosition;
    result.interactionBrowserPosition =
      operation.interactionBrowserPosition;
    result.interactionFacingFixed =
      operation.interactionFacingFixed;
    result.interactionFacingControlWord =
      operation.interactionFacingControlWord;
    result.interactionControlFloats =
      operation.interactionControlFloats;
    result.sceneObjectTransitionEvidence = {
      handlerPointerLiteralAddress: "0x0c1197a0",
      handlerAddress: "0x0c0f9efa",
      sceneObjectStateHandlerAddress: "0x0c0f9c90",
      actorObjectCodeOffset: "0xc8",
      actorControlOffset: "0xd4",
      transitionModeRule: "sceneObjectControlValue + 4",
      runtimeEvidence: path.relative(
        process.cwd(),
        sceneObjectEvidencePath,
      ),
      exactActiveRuntimeBindingObservationCount:
        activeSceneObjectCountByBinding.get(binding) || 0,
      interactionPayloadStatus: (
        "position, facing, and two floats retained numerically; "
        + "higher-level interaction meaning unresolved"
      ),
    };
  }
  if (operation.operation === 0x2b) {
    const runtimeBinding = characterBindingByCode.get(
      operation.residentCharacterCode,
    );
    result.residentCharacterCode = operation.residentCharacterCode;
    result.residentCharacterIndex = (
      runtimeBinding?.observedCharacterIndices.length === 1
        ? runtimeBinding.observedCharacterIndices[0]
        : null
    );
    result.residentCharacterSelectionEvidence = {
      handlerPointerLiteralAddress: "0x0c1197a4",
      characterLookupAddress: "0x0c1147ec",
      characterTablePointerAddress: "0x0c21bc80",
      actorCharacterIndexOffset: "0x08",
      runtimeEvidence: path.relative(
        process.cwd(),
        characterSelectionEvidencePath,
      ),
      resolvedCaptureHashCount:
        runtimeBinding?.resolvedCaptureHashCount || 0,
      unresolvedCaptureHashCount:
        runtimeBinding?.unresolvedCaptureHashCount || 0,
    };
  }
  if (operation.operation === 0x2f) {
    result.modelOverrideCode = operation.modelOverrideCode;
    result.modelOverrideControlValue =
      operation.modelOverrideControlValue;
    result.modelOverridePersistent = operation.modelOverridePersistent;
    result.modelOverrideEffect = operation.modelOverrideEffect;
    result.modelOverrideEvidence = {
      handlerPointerLiteralAddress: "0x0c1197a8",
      handlerAddress: "0x0c11acd8",
      actorModelPointerOffset: "0x8c",
      actorModelOverrideOffset: "0x18e",
      maximumModelNameLength: 11,
      runtimeEvidence: path.relative(
        process.cwd(),
        modelOverrideEvidencePath,
      ),
      liveRuntimeObservationCount:
        liveModelOverrideCountByCode.get(operation.modelOverrideCode) || 0,
    };
  }
  if (operation.operation === 0x30) {
    const runtimeBinding = actionBindingById.get(
      operation.actionControllerId,
    );
    result.actionControllerId = operation.actionControllerId;
    result.actionControlValues = operation.actionControlValues;
    result.actionRequestOperand = operation.actionRequestOperand;
    result.actionReservedOperand = operation.actionReservedOperand;
    result.actionControllerMode = operation.actionControllerMode;
    result.actionControllerEffect = operation.actionControllerEffect;
    result.actionResolutionBoundary = (
      "mode-7 queued command resolved through the native registered "
      + "motion-bank lookup"
    );
    result.actionControllerEvidence = {
      handlerAddress: "0x0c11f026",
      teardownAddress: "0x0c11efd2",
      controllerRequestAddress: "0x0c10d77c",
      controllerRequestInitializerAddress: "0x0c10d7f6",
      registeredMotionLookupAddress: "0x0c092f14",
      actorOperationPointerOffset: "0xec",
      actorActionIdOffset: "0xf0",
      controllerActionIdOffset: "0xaa",
      controllerModeOffset: "0xac",
      requestDeliveryModel:
        actionEvidence.nativeEvidence.requestDeliveryModel,
      runtimeEvidence: path.relative(process.cwd(), actionEvidencePath),
      runtimeObservationCount: runtimeBinding?.observationCount || 0,
      runtimeCaptureHashCount: runtimeBinding?.captureHashCount || 0,
      runtimeResidentControllerObservationCount:
        runtimeBinding?.residentControllerObservationCount || 0,
    };
  }
  if (operation.operation === 0x35) {
    const defaultIdle = defaultIdleByActor.get(sourceVariant.actorCode);
    result.actorControlValue = operation.actorControlValue;
    result.routeCompletionMotionOverrideId =
      operation.routeCompletionMotionOverrideId ?? null;
    result.routeCompletionDefaultIdleCandidateMotionIds = (
      operation.routeCompletionMotionOverrideId === null
        ? defaultIdle?.exactCandidateMotionIds ?? null
        : null
    );
    result.routeCompletionDefaultIdleUnanimousMotionId = (
      operation.routeCompletionMotionOverrideId === null
        ? defaultIdle?.unanimousNonzeroMotionId ?? null
        : null
    );
    result.routeCompletionSelectionStatus =
      operation.routeCompletionSelectionStatus;
    result.routeCompletionEvidence = {
      path: (
        "tools/evidence/"
        + "scheduled-actor-route-completion-evidence.json"
      ),
      actorOverrideOffset: "0x1c0",
      routeCompletionStateOffset: "0xf4",
      actorCurrentMotionStateOffset: "0x06",
      defaultIdleEvidence: path.relative(
        process.cwd(),
        defaultIdleEvidencePath,
      ),
      defaultIdleSelectionRule:
        "candidate[processWideRandom15 % 4]",
    };
  }
  if (operation.operation === 0x38) {
    result.actorBooleanValue = operation.actorBooleanValue;
  }
  if (operation.operation === 1) {
    const route = routes.get(operation.fileOffset);
    result.area = operation.area;
    result.movementMode = operation.subtype;
    result.pointFileOffset = operation.resolvedFileOffset;
    result.points = route?.browserPoints || null;
  }
  return result;
}

function scheduleVariant(sourceVariant, table) {
  const journeys = table.entries.map((entry) => {
    const routes = new Map(entry.descriptor.routes.map(
      (route) => [route.operationFileOffset, route],
    ));
    const operations = entry.descriptor.operations.map(
      (operation) => descriptorOperation(operation, routes, sourceVariant),
    );
    let operationArea = null;
    for (const operation of operations) {
      if (operation.operation === 8) {
        operationArea = operation.area;
        continue;
      }
      if (
        operation.operation !== 0x10
        || !operation.localTransform?.locationCode
        || !operationArea
      ) continue;
      const models = [
        ...(localObjectModels.get(
          `${operationArea}:${operation.localTransform.locationCode}`,
        ) || []),
      ];
      operation.localTransform = {
        ...operation.localTransform,
        resolvedModel: models.length === 1 ? models[0] : null,
        resolvedModelCandidates: models,
        resolvedModelEvidence: (
          models.length === 1
            ? "exact runtime scene-object placement"
            : "unresolved or ambiguous runtime scene-object placement"
        ),
      };
    }
    for (let index = 0; index < operations.length; index++) {
      if (![0x10, 0x11, 0x17, 0x18, 0x22, 0x2f].includes(
        operations[index].operation,
      )) continue;
      const activationSecond = descriptorOperationReadySecond(
        sourceVariant,
        entry,
        entry.descriptor.operations[index],
      );
      operations[index].descriptorActivationSecond = activationSecond;
      if (operations[index].operation === 0x17) {
        operations[index].descriptorRegistrationSecond = activationSecond;
      } else if (operations[index].operation === 0x18) {
        operations[index].targetSecond =
          operation18TargetSecond(
            activationSecond,
            entry.descriptor.operations[index],
          );
        operations[index].gateReleaseSecond =
          operation18ReleaseSecond(
            activationSecond,
            entry.descriptor.operations[index],
          );
      } else if (operations[index].operation === 0x22) {
        operations[index].gateReleaseSecond =
          operation22ReleaseSecond(
            activationSecond,
            entry.descriptor.operations[index],
          );
      }
    }
    const journeyRoutes = entry.descriptor.routes.map((route) => ({
      area: route.area,
      operationFileOffset: route.operationFileOffset,
      subtype: route.subtype,
      pointFileOffset: route.resolvedFileOffset,
      points: route.browserPoints,
    }));
    return {
      startSecond: entry.startSecond,
      startTime: timeText(entry.startSecond),
      descriptorFileOffset: entry.resolvedDescriptorFileOffset,
      areas: [...new Set([
        ...operations.map((operation) => operation.area),
        ...journeyRoutes.map((route) => route.area),
      ].filter(Boolean))],
      operations,
      routes: journeyRoutes,
    };
  }).sort((a, b) => a.startSecond - b.startSecond);
  return {
    scheduleVariantId: (
      `${sourceVariant.sourceProgramByteSha256.slice(0, 12)}`
      + `:source-table-${table.fileOffset}`
    ),
    sourceTableFileOffset: table.fileOffset,
    selectorIndices: table.selectorIndices,
    journeys,
  };
}

function sourceProgramOffset(sourceVariant) {
  return Number.parseInt(sourceVariant.sourceFiles[0].programFileOffset, 16);
}

function tableDelta(sourceVariant, table) {
  return Number.parseInt(table.sourceTableFileOffset, 16)
    - sourceProgramOffset(sourceVariant);
}

function observedTableWeights(sourceVariant) {
  const result = new Map();
  for (const ramVariantId of sourceVariant.matchingRamVariantIds) {
    const ramVariant = source.variants.find(
      (candidate) => candidate.variantId === ramVariantId,
    );
    if (!ramVariant) continue;
    const programHeader = Number.parseInt(
      ramVariant.representativeProgramHeader,
      16,
    );
    const captureWeight = Math.max(1, ramVariant.sourceCaptures.length);
    for (const table of ramVariant.scheduleTables) {
      const delta = Number.parseInt(table.scheduleTable, 16) - programHeader;
      result.set(delta, (result.get(delta) || 0) + captureWeight);
    }
  }
  return result;
}

function defaultScheduleSelection(sourceVariant, scheduleVariants) {
  const baseSelector = sourceVariant.scheduleSelector?.pointerSlots.find(
    (slot) => slot.selectorIndex === 1,
  );
  const nativeBase = baseSelector && scheduleVariants.find(
    (candidate) => (
      candidate.sourceTableFileOffset === baseSelector.scheduleFileOffset
    ),
  );
  if (nativeBase) {
    return {
      scheduleVariantId: nativeBase.scheduleVariantId,
      evidence: "native selector mode 1",
      baseSelectorMode: 1,
    };
  }
  const weights = observedTableWeights(sourceVariant);
  const observed = scheduleVariants
    .map((candidate) => ({
      candidate,
      weight: weights.get(tableDelta(sourceVariant, candidate)) || 0,
    }))
    .sort((left, right) => (
      right.weight - left.weight
      || Number.parseInt(left.candidate.sourceTableFileOffset, 16)
        - Number.parseInt(right.candidate.sourceTableFileOffset, 16)
    ));
  if (observed[0]?.weight > 0) {
    return {
      scheduleVariantId: observed[0].candidate.scheduleVariantId,
      evidence: "most frequently observed relocated RAM table",
      representativeCaptureCount: observed[0].weight,
    };
  }
  return {
    scheduleVariantId: scheduleVariants[0].scheduleVariantId,
    evidence: "first selector-backed source table; no matching RAM capture",
  };
}

const assetByMappedModel = new Map(assetEvidence.assets.map(
  (asset) => [asset.mappedModelCode, asset],
));
const actorVariantCounts = new Map();
for (const variant of source.sourceVariants) {
  actorVariantCounts.set(
    variant.actorCode,
    (actorVariantCounts.get(variant.actorCode) || 0) + 1,
  );
}

function browserLinkedRoute(route) {
  return route && {
    fileOffset: route.fileOffset,
    points: route.browserPoints,
  };
}

function float32WordsHex(values) {
  const words = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => words.writeFloatLE(value, index * 4));
  return words.toString("hex");
}

const linkedRouteTables = (source.linkedRouteTables || []).map((table) => ({
  linkedRouteTableId: table.linkedRouteTableId,
  resourceFileOffset: table.resourceFileOffset,
  roots: table.roots.map((root) => ({
    targetCode: root.targetCode,
    fileOffset: root.fileOffset,
    position: root.browserPosition,
    route: browserLinkedRoute(root.route),
    finalEndpointInvariantAcrossLeaves:
      root.finalEndpointInvariantAcrossLeaves,
    finalEndpointLeafIndices: root.finalEndpointLeafIndices,
    finalEndpoint: root.finalBrowserEndpoint,
    finalRuntimeEndpointWordHex: root.finalRuntimeEndpointWordHex,
    allLeavesInitiallyUnoccupied: root.groups.every(
      (group) => group.leaves.every(
        (leaf) => leaf.initialOccupantCode === null,
      ),
    ),
    groups: root.groups.map((group) => ({
      groupIndex: group.groupIndex,
      fileOffset: group.fileOffset,
      selectorWords: group.selectorWords,
      leaves: group.leaves.map((leaf) => ({
        leafIndex: leaf.leafIndex,
        fileOffset: leaf.fileOffset,
        position: leaf.browserPosition,
        transformControlWord: leaf.transformControlWord,
        initialOccupantCode: leaf.initialOccupantCode,
        firstRoute: browserLinkedRoute(leaf.firstRoute),
        secondRoute: browserLinkedRoute(leaf.secondRoute),
        finalRuntimeEndpointWordHex: (
          leaf.secondRoute?.runtimePoints?.length
            ? float32WordsHex(leaf.secondRoute.runtimePoints.at(-1))
            : null
        ),
      })),
    })),
  })),
  decodingEvidence: table.decodingEvidence,
}));

const actors = source.sourceVariants
  .filter((variant) => variant.characterMapping)
  .map((variant) => {
    const asset = assetByMappedModel.get(variant.characterMapping.modelCode);
    const defaultMotion = defaultIdleByActor.get(variant.actorCode);
    if (!asset) {
      throw new Error(
        `Missing extracted asset for ${variant.actorCode} `
        + `(${variant.characterMapping.modelCode}).`,
      );
    }
    const scheduleVariants = variant.scheduleTables.map(
      (table) => scheduleVariant(variant, table),
    );
    const defaultSelection = defaultScheduleSelection(
      variant,
      scheduleVariants,
    );
    const sourceContexts = [...new Set(variant.sourceFiles
      .map((file) => file.containerArea)
      .filter((area) => ["D000", "JOMO", "MFSY"].includes(area)))];
    let playbackAreas = [...new Set(variant.selectedAreas)];
    if (actorVariantCounts.get(variant.actorCode) > 1) {
      if (sourceContexts.includes("MFSY")) {
        playbackAreas = playbackAreas.filter((area) => harborAreas.has(area));
      } else if (sourceContexts.includes("D000")) {
        playbackAreas = playbackAreas.filter((area) => !harborAreas.has(area));
      }
    }
    const selected = scheduleVariants.find(
      (candidate) => (
        candidate.scheduleVariantId === defaultSelection.scheduleVariantId
      ),
    );
    const linkedTargetCodes = [...new Set(scheduleVariants.flatMap(
      (schedule) => schedule.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x16,
        ).map((operation) => operation.targetCode),
      ),
    ))].sort();
    const modelOverrideCodes = [...new Set(scheduleVariants.flatMap(
      (schedule) => schedule.journeys.flatMap(
        (journey) => journey.operations
          .filter((operation) => (
            operation.operation === 0x2f
            && operation.modelOverrideCode
            && (
              operation.modelOverrideCode
                !== variant.characterMapping.modelCode
            )
          ))
          .map((operation) => operation.modelOverrideCode),
      ),
    ))].sort();
    const modelOverrides = modelOverrideCodes.map((modelCode) => {
      const overrideAsset = assetByMappedModel.get(modelCode);
      if (!overrideAsset) {
        throw new Error(
          `Missing extracted override asset for ${variant.actorCode} `
          + `(${modelCode}).`,
        );
      }
      return {
        modelCode: overrideAsset.assetModelCode,
        textureFile: overrideAsset.textureFile,
        evidence: "exact operation-0x2f model override and HUMANS asset",
      };
    });
    const authoredAreas = new Set([
      ...playbackAreas,
      ...selected.journeys.flatMap((journey) => journey.areas),
    ]);
    if (actorVariantCounts.get(variant.actorCode) > 1) {
      for (const area of [...authoredAreas]) {
        if (
          (sourceContexts.includes("MFSY") && !harborAreas.has(area))
          || (sourceContexts.includes("D000") && harborAreas.has(area))
        ) authoredAreas.delete(area);
      }
    }
    return {
      instanceId: (
        `${variant.actorCode}:`
        + variant.sourceProgramByteSha256.slice(0, 12)
      ),
      actorCode: variant.actorCode,
      label: variant.characterMapping.characterName,
      mappedModelCode: variant.characterMapping.modelCode,
      modelCode: asset.assetModelCode,
      textureFile: asset.textureFile,
      modelOverrides,
      nativeMovementScale: variant.nativeMovementScale,
      nativeDefaultPathSpeedPerGameSecond:
        variant.nativeDefaultPathSpeedPerGameSecond,
      nativeDefaultMotionStateId:
        defaultMotion?.exactDefaultMotionStateId ?? null,
      nativeDefaultMotionEvidence: {
        actorDefinitionOffset: "0x7c",
        actorCurrentMotionStateOffset: "0x06",
        lifecycleResetAddress: "0x0c11ee08",
        selectionRule:
          "operation-0x09 value other than one installs definition +0x7c",
        evidence: path.relative(
          process.cwd(),
          defaultIdleEvidencePath,
        ),
      },
      sourceProgramByteSha256: variant.sourceProgramByteSha256,
      sourceContexts,
      sourceFiles: variant.sourceFiles,
      linkedRouteTableIds: [...new Set(variant.sourceFiles
        .map((file) => file.linkedRouteTableId)
        .filter(Boolean))].sort(),
      linkedTargetCodes,
      selectedAreas: variant.selectedAreas,
      scheduleSelector: variant.scheduleSelector,
      playbackAreas,
      defaultArea: playbackAreas.length === 1 ? playbackAreas[0] : null,
      playbackWorldIds: [...authoredAreas]
        .map((area) => areaWorlds[area])
        .filter(Boolean),
      defaultScheduleVariantId: defaultSelection.scheduleVariantId,
      defaultScheduleSelection: defaultSelection,
      scheduleVariants,
    };
  })
  .sort((left, right) => (
    left.actorCode.localeCompare(right.actorCode)
    || left.instanceId.localeCompare(right.instanceId)
  ));

const observedMcirBindingByExactOperation = new Map();
const observedMcirLeavesByActiveOperationProgramVariant = new Map();
const observedMcirBindingByOwner = new Map();
const observedMcirBindingsByAreaOwner = new Map();
const observedActiveMcirBindingsByAreaOwner = new Map();
for (const graph of mcirOccupancyEvidence.graphs) {
  for (const binding of graph.bindings) {
    observedMcirBindingByOwner.set(
      [
        graph.linkedRouteTableId,
        binding.targetCode,
        binding.occupantActorCode,
      ].join(":"),
      binding,
    );
  }
  for (const binding of graph.areaProgramVariantBindings || []) {
    const ownerKey = [
      graph.linkedRouteTableId,
      binding.targetCode,
      binding.occupantActorCode,
    ].join(":");
    if (!observedMcirBindingsByAreaOwner.has(ownerKey)) {
      observedMcirBindingsByAreaOwner.set(ownerKey, []);
    }
    observedMcirBindingsByAreaOwner.get(ownerKey).push(binding);
    if (!binding.deterministicFinalReselectedLeaf) continue;
  }
  for (const binding of graph.activeOperationProgramBindings || []) {
    const ownerKey = [
      graph.linkedRouteTableId,
      binding.targetCode,
      binding.occupantActorCode,
    ].join(":");
    if (!observedActiveMcirBindingsByAreaOwner.has(ownerKey)) {
      observedActiveMcirBindingsByAreaOwner.set(ownerKey, []);
    }
    observedActiveMcirBindingsByAreaOwner.get(ownerKey).push(binding);
    if (!binding.deterministicObservedLeaf) continue;
    const key = [
      graph.linkedRouteTableId,
      binding.targetCode,
      binding.occupantActorCode,
      binding.normalizedProgramByteSha256,
      binding.operationOffsetFromProgramHeader,
    ].join(":");
    if (!observedMcirLeavesByActiveOperationProgramVariant.has(key)) {
      observedMcirLeavesByActiveOperationProgramVariant.set(key, []);
    }
    observedMcirLeavesByActiveOperationProgramVariant.get(key).push(binding);
  }
  for (const binding of graph.activeOperationBindings || []) {
    const key = [
      graph.linkedRouteTableId,
      binding.targetCode,
      binding.occupantActorCode,
      binding.normalizedProgramByteSha256,
      binding.operationOffsetFromProgramHeader,
    ].join(":");
    observedMcirBindingByExactOperation.set(key, binding);
  }
}

function operationOffsetFromProgramHeader(actor, operation) {
  const offsets = new Set(actor.sourceFiles.map(
    (file) => (
      Number.parseInt(operation.fileOffset, 16)
      - Number.parseInt(file.programFileOffset, 16)
    ),
  ));
  return offsets.size === 1 ? [...offsets][0] : null;
}

function routeLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const deltaX = points[index][0] - points[index - 1][0];
    const deltaY = points[index][1] - points[index - 1][1];
    const deltaZ = points[index][2] - points[index - 1][2];
    length += Math.hypot(deltaX, deltaY, deltaZ);
  }
  return length;
}

function operation16ReleaseSecond(entry, operation) {
  const activationSecond = operation.activationSecond < 0
    ? entry.startSecond - operation.activationSecond
    : operation.activationSecond;
  return Math.max(
    entry.startSecond + operation.minimumDelaySeconds,
    activationSecond,
  );
}

function operation22ReleaseSecond(activationSecond, operation) {
  if (!Number.isFinite(activationSecond)) return null;
  return operation.timeControlValue < 0
    ? activationSecond - operation.timeControlValue
    : Math.max(activationSecond, operation.timeControlValue);
}

function operation18TargetSecond(activationSecond, operation) {
  if (!Number.isFinite(activationSecond)) return null;
  return operation.timeControlValue <= 0
    ? activationSecond - operation.timeControlValue
    : operation.timeControlValue;
}

function operation18ReleaseSecond(activationSecond, operation) {
  const targetSecond = operation18TargetSecond(
    activationSecond,
    operation,
  );
  const targetBinding = linkedInteractionBindingByTarget.get(
    operation.targetCode,
  );
  if (!Number.isFinite(targetSecond) || !targetBinding) return null;
  const startSecond = targetBinding.activeWindowStartSecond;
  const endSecond = targetBinding.activeWindowEndSecond;
  if (targetBinding.targetSubtype === 1) {
    let releaseSecond = Math.max(activationSecond, targetSecond);
    if (releaseSecond >= startSecond && releaseSecond < endSecond) {
      releaseSecond = endSecond;
    }
    return releaseSecond;
  }
  if (targetBinding.targetSubtype === 3) {
    if (
      activationSecond < startSecond
      || activationSecond > endSecond
      || targetSecond < activationSecond
    ) {
      return activationSecond;
    }
    return Math.min(targetSecond, endSecond) + 1;
  }
  return null;
}

// These operations advance synchronously in the native dispatcher (or through
// its registered 0x17 extension) and therefore add no descriptor clock time.
// Operations 0x18 and 0x22 are handled separately because they are timed
// gates. Keeping the set explicit makes timing proofs fail closed if an
// unreviewed operation precedes the target.
function descriptorOperationReadySecond(
  sourceVariant,
  entry,
  targetOperation,
) {
  let descriptorSecond = entry.startSecond;
  for (const operation of entry.descriptor.operations) {
    if (operation.fileOffset === targetOperation.fileOffset) {
      return descriptorSecond;
    }
    if (operation.operation === 7) {
      descriptorSecond += operation.durationSeconds;
      continue;
    }
    if (operation.operation === 1) {
      const route = entry.descriptor.routes.find(
        (candidate) => (
          candidate.operationFileOffset === operation.fileOffset
        ),
      );
      const speed = sourceVariant.nativeDefaultPathSpeedPerGameSecond;
      if (!route?.runtimePoints?.length || !(speed > 0)) return null;
      descriptorSecond += (
        routeLength(route.runtimePoints) / speed
      );
      continue;
    }
    if (operation.operation === 0x16) {
      descriptorSecond = Math.max(
        descriptorSecond,
        operation16ReleaseSecond(entry, operation),
      );
      continue;
    }
    if (operation.operation === 0x18) {
      descriptorSecond = operation18ReleaseSecond(
        descriptorSecond,
        operation,
      );
      if (!Number.isFinite(descriptorSecond)) return null;
      continue;
    }
    if (operation.operation === 0x22) {
      descriptorSecond = operation22ReleaseSecond(
        descriptorSecond,
        operation,
      );
      continue;
    }
    if (
      operation.operation === 0
      || operation.operation === 4
      || operation.operation === 0x12
      || !synchronousDescriptorOperations.has(operation.operation)
    ) return null;
  }
  return null;
}

const sourceOperation16Occurrences = new Map();
for (const sourceVariant of source.sourceVariants) {
  for (const table of sourceVariant.scheduleTables) {
    for (const entry of table.entries) {
      for (const operation of entry.descriptor.operations) {
        if (operation.operation !== 0x16) continue;
        const occurrenceKey = [
          sourceVariant.sourceProgramByteSha256,
          operation.fileOffset,
        ].join(":");
        const timing = {
          journeyStartSecond: entry.startSecond,
          claimReadySecond: descriptorOperationReadySecond(
            sourceVariant,
            entry,
            operation,
          ),
          releaseSecond: operation16ReleaseSecond(entry, operation),
        };
        const existing = sourceOperation16Occurrences.get(occurrenceKey);
        if (existing) {
          existing.scheduleTimingSignatures.add(JSON.stringify(timing));
          continue;
        }
        sourceOperation16Occurrences.set(occurrenceKey, {
          occurrenceKey,
          actorCode: sourceVariant.actorCode,
          sourceProgramByteSha256:
            sourceVariant.sourceProgramByteSha256,
          operationFileOffset: operation.fileOffset,
          targetCode: operation.targetCode,
          ...timing,
          scheduleTimingSignatures: new Set([JSON.stringify(timing)]),
        });
      }
    }
  }
}

const sourceOperation16OccurrencesByTarget = Map.groupBy(
  [...sourceOperation16Occurrences.values()],
  (occurrence) => occurrence.targetCode,
);

function exclusiveFirstClaimProof(actor, operation, rootMatches) {
  if (
    rootMatches.length !== 1
    || !rootMatches[0].root.allLeavesInitiallyUnoccupied
  ) return null;
  const occurrence = sourceOperation16Occurrences.get([
    actor.sourceProgramByteSha256,
    operation.fileOffset,
  ].join(":"));
  if (!occurrence || !Number.isFinite(occurrence.claimReadySecond)) {
    return null;
  }
  const targetOccurrences = (
    sourceOperation16OccurrencesByTarget.get(operation.targetCode) || []
  );
  if (
    targetOccurrences.some((candidate) => (
      !Number.isFinite(candidate.claimReadySecond)
      || !Number.isFinite(candidate.releaseSecond)
      || candidate.releaseSecond > 86400
      || candidate.scheduleTimingSignatures.size !== 1
    ))
  ) return null;
  const otherOccurrences = targetOccurrences.filter(
    (candidate) => candidate.occurrenceKey !== occurrence.occurrenceKey,
  );
  const nextClaimantStartSecond = Math.min(
    ...otherOccurrences.map((candidate) => candidate.journeyStartSecond),
  );
  if (
    occurrence.claimReadySecond > occurrence.releaseSecond
    || !(nextClaimantStartSecond > occurrence.releaseSecond)
  ) return null;
  const leaves = rootMatches[0].root.groups.flatMap(
    (group) => group.leaves,
  );
  if (!leaves[0]?.secondRoute?.points?.length) return null;
  return {
    occurrence,
    targetOccurrences,
    nextClaimantStartSecond,
    leaf: leaves[0],
  };
}

for (const actor of actors) {
  for (const variant of actor.scheduleVariants) {
    for (const journey of variant.journeys) {
      for (const operation of journey.operations) {
        if (operation.operation !== 0x16) continue;
        // The native 0x0c127302 lookup searches the resident MCIR directory
        // globally by four-byte target code. Both exact graphs coexist in
        // reviewed captures, and their 37 target codes are disjoint, so a
        // program is not restricted to the MCIR table packaged beside it.
        const rootMatches = linkedRouteTables.flatMap((table) => table.roots
          .filter((root) => root.targetCode === operation.targetCode)
          .map((root) => ({ table, root })));
        const leaves = rootMatches.flatMap(({ root }) => root.groups.flatMap(
          (group) => group.leaves,
        ));
        const operationOffset = operationOffsetFromProgramHeader(
          actor,
          operation,
        );
        const exactWaitingMatches = rootMatches.flatMap(
          ({ table, root }) => {
            const binding = observedMcirBindingByExactOperation.get([
              table.linkedRouteTableId,
              operation.targetCode,
              actor.actorCode,
              actor.sourceProgramByteSha256,
              operationOffset,
            ].join(":"));
            if (!binding?.deterministicObservedLeaf) return [];
            const observation = binding.leafObservations[0];
            const leaf = root.groups.flatMap(
              (group) => group.leaves,
            ).find(
              (candidate) => candidate.leafIndex === observation.leafIndex,
            );
            return leaf ? [{ table, binding, observation, leaf }] : [];
          },
        );
        let waitingMatches = exactWaitingMatches;
        if (waitingMatches.length === 0) {
          const journeyAreas = new Set(journey.areas);
          waitingMatches = rootMatches.flatMap(({ table, root }) => {
            const bindings = (
              observedMcirLeavesByActiveOperationProgramVariant.get([
                table.linkedRouteTableId,
                operation.targetCode,
                actor.actorCode,
                actor.sourceProgramByteSha256,
                operationOffset,
              ].join(":")) || []
            ).filter((binding) => journeyAreas.has(binding.likelyArea));
            return bindings.flatMap((binding) => {
              if (!binding.deterministicObservedLeaf) return [];
              const observation = binding.leafObservations[0];
              const leaf = root.groups.flatMap(
                (group) => group.leaves,
              ).find(
                (candidate) => (
                  candidate.leafIndex === observation.leafIndex
                ),
              );
              return leaf
                ? [{ table, binding, observation, leaf }]
                : [];
            });
          });
        }
        const waitingKeys = new Set(waitingMatches.map(
          ({ table, leaf }) => (
            `${table.linkedRouteTableId}:${leaf.leafIndex}`
          ),
        ));
        if (waitingMatches.length > 0 && waitingKeys.size === 1) {
          const { binding, observation, leaf } = waitingMatches[0];
          operation.waitingPlacement = {
            status: exactWaitingMatches.length > 0
              ? "capture-proven deterministic exact-operation waiting leaf"
              : "capture-proven deterministic map/program waiting leaf",
            claimInitializationHandlerAddress: "0x0c126cca",
            occupancyEvidence: path.relative(
              process.cwd(),
              mcirOccupancyPath,
            ),
            subordinateRuntimeEvidence: path.relative(
              process.cwd(),
              subordinateEvidencePath,
            ),
            leafIndex: leaf.leafIndex,
            observationCount: waitingMatches.reduce(
              (count, match) => (
                count + match.observation.observationCount
              ),
              0,
            ),
            captureHashCount: new Set(waitingMatches.flatMap(
              (match) => match.observation.captureHashes,
            )).size,
            observedLikelyAreas:
              binding.likelyAreas
              || (binding.likelyArea ? [binding.likelyArea] : []),
            transformControlWord: leaf.transformControlWord,
            position: [...leaf.position],
          };
        }
        const allocationIndependentRoot = (
          rootMatches.length === 1
          && rootMatches[0].root.finalEndpointInvariantAcrossLeaves
          && leaves.length > 0
        );
        if (allocationIndependentRoot) {
          const root = rootMatches[0].root;
          const route = leaves[0].secondRoute;
          operation.linkedPlacement = {
            status: leaves.length === 1
              ? "allocation-independent single MCIR leaf endpoint"
              : "allocation-independent identical MCIR leaf endpoints",
            selectorFunctionAddress: "0x0c1274a4",
            selectorFunctionResult: 1,
            occupiedLeafLookupAddress: "0x0c12743c",
            freeLeafLookupAddress: "0x0c12733a",
            placementHandlerAddress: "0x0c126ec2",
            allocationIndependenceEvidence: (
              "every leaf reachable under this exact target root ends its "
              + "second route at the same bit-exact XYZ point"
            ),
            possibleLeafIndices: [...root.finalEndpointLeafIndices],
            finalRuntimeEndpointWordHex:
              root.finalRuntimeEndpointWordHex,
            routeFileOffset: route.fileOffset,
            position: [...root.finalEndpoint],
          };
          continue;
        }
        const firstClaimProof = exclusiveFirstClaimProof(
          actor,
          operation,
          rootMatches,
        );
        if (firstClaimProof) {
          const {
            occurrence,
            targetOccurrences,
            nextClaimantStartSecond,
            leaf,
          } = firstClaimProof;
          operation.linkedPlacement = {
            status:
              "source-wide exclusive first claim on zero-initialized MCIR root",
            selectorFunctionAddress: "0x0c1274a4",
            selectorFunctionResult: 1,
            occupiedLeafLookupAddress: "0x0c12743c",
            freeLeafLookupAddress: "0x0c12733a",
            claimInitializationHandlerAddress: "0x0c126cca",
            placementHandlerAddress: "0x0c126ec2",
            graphOccupancyResetAddress: "0x0c126232",
            dispatcherAddress: "0x0c119444",
            extensionHandlerAddress: "0x0c0f5b28",
            allocationEvidence: (
              "the exact MCIR graph initializes every target leaf empty; "
              + "the complete source-program census proves this operation "
              + "claims and releases the first free leaf before any other "
              + "operation targeting the root can begin"
            ),
            sourceProgramVariantCount: source.sourceVariants.length,
            targetClaimantOperationCount: targetOccurrences.length,
            journeyStartSecond: occurrence.journeyStartSecond,
            claimReadySecond: occurrence.claimReadySecond,
            releaseSecond: occurrence.releaseSecond,
            nextClaimantStartSecond,
            leafIndex: leaf.leafIndex,
            finalRuntimeEndpointWordHex:
              leaf.finalRuntimeEndpointWordHex,
            routeFileOffset: leaf.secondRoute.fileOffset,
            position: [...leaf.secondRoute.points.at(-1)],
          };
          continue;
        }
        if (operationOffset !== null) {
          const observedMatch = rootMatches.map(({ table, root }) => ({
            root,
            binding: observedMcirBindingByExactOperation.get([
              table.linkedRouteTableId,
              operation.targetCode,
              actor.actorCode,
              actor.sourceProgramByteSha256,
              operationOffset,
            ].join(":")),
          })).find(
            (match) => match.binding?.deterministicFinalReselectedLeaf,
          );
          const observedLeaf = observedMatch?.root.groups.flatMap(
            (group) => group.leaves,
          ).find(
            (leaf) => (
              leaf.leafIndex
              === observedMatch.binding
                .finalReselectionObservations[0].leafIndex
            ),
          );
          const route = observedLeaf?.secondRoute;
          if (route?.points?.length) {
            operation.linkedPlacement = {
              status:
                "capture-proven deterministic exact-operation MCIR leaf",
              selectorFunctionAddress: "0x0c1274a4",
              selectorFunctionResult: 1,
              occupiedLeafLookupAddress: "0x0c12743c",
              freeLeafLookupAddress: "0x0c12733a",
              placementHandlerAddress: "0x0c126ec2",
              occupancyEvidence: path.relative(
                process.cwd(),
                mcirOccupancyPath,
              ),
              leafIndex: observedLeaf.leafIndex,
              sourceProgramByteSha256: actor.sourceProgramByteSha256,
              operationOffsetFromProgramHeader: operationOffset,
              activeOperationOwnerEvidence: (
                "runtime actor record current-operation field is 0x16 and "
                + "its saved next-operation pointer ends after this exact "
                + "source operation targeting the occupied MCIR root"
              ),
              finalReselectionEvidence: (
                "native 0x0c126ec2 clear-and-first-free selection applied "
                + "to the captured MCIR population"
              ),
              waitingLeafIndices: observedMatch.binding.leafObservations.map(
                (observation) => observation.leafIndex,
              ),
              observationCount:
                observedMatch.binding
                  .finalReselectionObservations[0].observationCount,
              captureHashCount:
                observedMatch.binding
                  .finalReselectionObservations[0].captureHashCount,
              observedOperationAddresses:
                observedMatch.binding.operationAddresses,
              observedLikelyAreas: observedMatch.binding.likelyAreas,
              routeFileOffset: route.fileOffset,
              position: [...route.points.at(-1)],
            };
            continue;
          }
        }

        const journeyAreas = new Set(journey.areas);
        const areaMatches = rootMatches.flatMap(({ table, root }) => {
          const bindings = observedMcirLeavesByActiveOperationProgramVariant
            .get([
            table.linkedRouteTableId,
            operation.targetCode,
            actor.actorCode,
            actor.sourceProgramByteSha256,
            operationOffset,
          ].join(":")) || [];
          return bindings.filter(
            (binding) => journeyAreas.has(binding.likelyArea),
          ).map((binding) => ({
            binding,
            linkedRouteTableId: table.linkedRouteTableId,
            root,
            leaf: root.groups.flatMap((group) => group.leaves).find(
              (leaf) => (
                leaf.leafIndex
                === binding.finalReselectionObservations[0].leafIndex
              ),
            ),
          }));
        }).filter((match) => match.leaf?.secondRoute?.points?.length);
        const areaLeafKeys = new Set(areaMatches.map(
          ({ binding, leaf, linkedRouteTableId }) => (
            `${linkedRouteTableId}:${binding.normalizedProgramByteSha256}:`
            + leaf.leafIndex
          ),
        ));
        if (areaMatches.length > 0 && areaLeafKeys.size === 1) {
          const areaLeaf = areaMatches[0].leaf;
          const areaRoute = areaLeaf.secondRoute;
          const captureHashes = new Set(areaMatches.flatMap(
            ({ binding }) => (
              binding.finalReselectionObservations[0].captureHashes
            ),
          ));
          operation.linkedPlacement = {
          status: "capture-proven deterministic map/program MCIR leaf",
          selectorFunctionAddress: "0x0c1274a4",
          selectorFunctionResult: 1,
          occupiedLeafLookupAddress: "0x0c12743c",
          freeLeafLookupAddress: "0x0c12733a",
          placementHandlerAddress: "0x0c126ec2",
          occupancyEvidence: path.relative(
            process.cwd(),
            mcirOccupancyPath,
          ),
          sourceProgramByteSha256: actor.sourceProgramByteSha256,
          operationOffsetFromProgramHeader: operationOffset,
          activeOperationOwnerEvidence: (
            "runtime actor record current-operation field is 0x16 and its "
            + "saved next-operation pointer ends after this exact source "
            + "operation targeting the occupied MCIR root"
          ),
          finalReselectionEvidence: (
            "native 0x0c126ec2 clear-and-first-free selection applied to "
            + "the captured MCIR population"
          ),
          waitingLeafIndices: [...new Set(areaMatches.flatMap(
            ({ binding }) => binding.leafObservations.map(
              (observation) => observation.leafIndex,
            ),
          ))].sort((left, right) => left - right),
          observedScheduleTables: [...new Set(areaMatches.flatMap(
            ({ binding }) => binding.scheduleTables,
          ))].sort(),
          observedOperationAddresses: [...new Set(areaMatches.flatMap(
            ({ binding }) => binding.operationAddresses,
          ))].sort(),
          likelyAreas: [...new Set(areaMatches.map(
            ({ binding }) => binding.likelyArea,
          ))].sort(),
          leafIndex: areaLeaf.leafIndex,
          observationCount: areaMatches.reduce(
            (count, { binding }) => (
              count
              + binding.finalReselectionObservations[0].observationCount
            ),
            0,
          ),
          captureHashCount: captureHashes.size,
          routeFileOffset: areaRoute.fileOffset,
          position: [...areaRoute.points.at(-1)],
          };
          continue;
        }
        const ownerKeys = rootMatches.map(({ table }) => [
          table.linkedRouteTableId,
          operation.targetCode,
          actor.actorCode,
        ].join(":"));
        const globalBindings = ownerKeys.map(
          (key) => observedMcirBindingByOwner.get(key),
        ).filter(Boolean);
        const areaBindings = ownerKeys.flatMap(
          (key) => observedMcirBindingsByAreaOwner.get(key) || [],
        ).filter((binding) => journeyAreas.has(binding.likelyArea));
        const activeAreaBindings = ownerKeys.flatMap(
          (key) => observedActiveMcirBindingsByAreaOwner.get(key) || [],
        ).filter((binding) => journeyAreas.has(binding.likelyArea));
        const sameProgramAreaBindings = activeAreaBindings.filter(
          (binding) => (
            binding.normalizedProgramByteSha256
            === actor.sourceProgramByteSha256
          ),
        );
        const exactOperationAreaBindings = sameProgramAreaBindings.filter(
          (binding) => (
            binding.operationOffsetFromProgramHeader === operationOffset
          ),
        );
        const exactOperationGlobalBindings = rootMatches.map(
          ({ table }) => observedMcirBindingByExactOperation.get([
            table.linkedRouteTableId,
            operation.targetCode,
            actor.actorCode,
            actor.sourceProgramByteSha256,
            operationOffset,
          ].join(":")),
        ).filter(Boolean);
        let unresolvedReason = (
          "actor-target-not-occupied-in-reviewed-captures"
        );
        if (exactOperationAreaBindings.length > 0) {
          unresolvedReason = (
            "exact-operation-map-program-observations-disagree"
          );
        } else if (sameProgramAreaBindings.length > 0) {
          unresolvedReason = (
            "matching-map-program-observed-for-different-operation"
          );
        } else if (activeAreaBindings.length > 0) {
          unresolvedReason = (
            "observed-map-program-does-not-match-source-variant"
          );
        } else if (exactOperationGlobalBindings.some(
          (binding) => !binding.deterministicFinalReselectedLeaf,
        )) {
          unresolvedReason = (
            "exact-operation-observed-on-multiple-leaves-without-matching-map"
          );
        } else if (globalBindings.some(
          (binding) => !binding.deterministicObservedLeaf,
        )) {
          unresolvedReason = (
            "actor-target-observed-on-multiple-leaves-without-matching-map-program"
          );
        } else if (globalBindings.length > 0) {
          unresolvedReason = (
            "nondefault-variant-lacks-matching-map-program-observation"
          );
        }
        operation.linkedPlacementUnresolved = {
          status: "unresolved shared MCIR leaf",
          reason: unresolvedReason,
          occupancyEvidence: path.relative(process.cwd(), mcirOccupancyPath),
          journeyAreas: [...journeyAreas],
          observedLeafIndices: [...new Set(globalBindings.flatMap(
            (binding) => binding.leafObservations.map(
              (observation) => observation.leafIndex,
            ),
          ))].sort((left, right) => left - right),
          observedMapProgramCandidates: activeAreaBindings.map((binding) => ({
            likelyArea: binding.likelyArea,
            normalizedProgramByteSha256:
              binding.normalizedProgramByteSha256,
            operationOffsetFromProgramHeader:
              binding.operationOffsetFromProgramHeader,
            leafIndices: binding.leafObservations.map(
              (observation) => observation.leafIndex,
            ),
          })),
        };
      }
    }
  }
}

function selectedSchedule(actor) {
  return actor.scheduleVariants.find(
    (variant) => variant.scheduleVariantId === actor.defaultScheduleVariantId,
  );
}

const allBrowserOperations = actors.flatMap(
  (actor) => actor.scheduleVariants.flatMap(
    (variant) => variant.journeys.flatMap(
      (journey) => journey.operations,
    ),
  ),
);
const secondaryRouteOperations = allBrowserOperations.filter(
  (operation) => (
    operation.operation === 0x1c
    && operation.secondaryRoute?.points?.length
  ),
);
const linkedPlacementOperations = allBrowserOperations.filter(
  (operation) => operation.operation === 0x16 && operation.linkedPlacement,
);
const actionControllerOperations = allBrowserOperations.filter(
  (operation) => operation.operation === 0x30,
);
const unresolvedLinkedPlacementOperations = allBrowserOperations.filter(
  (operation) => (
    operation.operation === 0x16
    && operation.linkedPlacementUnresolved
  ),
);
const unresolvedLinkedPlacementReasonCounts = Object.fromEntries(
  [...new Set(unresolvedLinkedPlacementOperations.map(
    (operation) => operation.linkedPlacementUnresolved.reason,
  ))].sort().map((reason) => [
    reason,
    unresolvedLinkedPlacementOperations.filter(
      (operation) => operation.linkedPlacementUnresolved.reason === reason,
    ).length,
  ]),
);

const manifest = {
  schema: "new-yokosuka-browser-scheduled-actors-v4",
  generatedFrom: [
    path.relative(process.cwd(), sourcePath),
    path.relative(process.cwd(), mcirOccupancyPath),
    path.relative(process.cwd(), actionEvidencePath),
    path.relative(process.cwd(), characterSelectionEvidencePath),
    path.relative(process.cwd(), modelOverrideEvidencePath),
    path.relative(process.cwd(), sceneObjectEvidencePath),
    path.relative(process.cwd(), variableMotionEvidencePath),
    path.relative(process.cwd(), linkedInteractionEvidencePath),
    path.relative(process.cwd(), interactionRegistrationEvidencePath),
    path.relative(process.cwd(), attachmentEvidencePath),
    path.relative(process.cwd(), subordinateEvidencePath),
    path.relative(process.cwd(), nativeMapTransitionPath),
  ],
  coordinateConversion: source.coordinateConversion,
  evidenceBoundary: (
    "Every source actor with an exact chars.csv identity/model mapping and a "
    + "byte-verified HUMANS model/texture pair is included. All source program "
    + "and timetable variants remain catalogued. Playback selects an observed "
    + "RAM table where available and labels source-only fallbacks explicitly. "
    + "Four actor codes with distinct D000/MFSY programs are scoped to their "
    + "corresponding pre-harbor or harbor browser worlds."
  ),
  areaWorlds,
  linkedRouteTables,
  actors,
  summary: {
    actorCodeCount: new Set(actors.map((actor) => actor.actorCode)).size,
    actorProgramVariantCount: actors.length,
    mappedModelCount: new Set(
      actors.map((actor) => actor.mappedModelCode),
    ).size,
    scheduleVariantCount: actors.reduce(
      (count, actor) => count + actor.scheduleVariants.length,
      0,
    ),
    timetableEntryCount: actors.reduce(
      (count, actor) => count + actor.scheduleVariants.reduce(
        (variantCount, variant) => variantCount + variant.journeys.length,
        0,
      ),
      0,
    ),
    routeCount: actors.reduce(
      (count, actor) => count + actor.scheduleVariants.reduce(
        (variantCount, variant) => variantCount + variant.journeys.reduce(
          (journeyCount, journey) => journeyCount + journey.routes.length,
          0,
        ),
        0,
      ),
      0,
    ),
    routePointCount: actors.reduce(
      (count, actor) => count + actor.scheduleVariants.reduce(
        (variantCount, variant) => variantCount + variant.journeys.reduce(
          (journeyCount, journey) => journeyCount + journey.routes.reduce(
            (routeCount, route) => routeCount + route.points.length,
            0,
          ),
          0,
        ),
        0,
      ),
      0,
    ),
    secondaryObjectRouteCount: secondaryRouteOperations.length,
    secondaryObjectRoutePointCount: secondaryRouteOperations.reduce(
      (count, operation) => (
        count + operation.secondaryRoute.points.length
      ),
      0,
    ),
    distinctSecondaryObjectRouteArrayCount: new Set(
      secondaryRouteOperations.map(
        (operation) => operation.pointFileOffset,
      ),
    ).size,
    positiveSecondaryObjectRouteCount:
      attachmentEvidence.summary.sourcePositiveTwentyRouteOperationCount,
    negativeSecondaryObjectRouteCount:
      attachmentEvidence.summary.sourceNegativeTwentyRouteOperationCount,
    resolvedSecondaryObjectRouteStepCount:
      attachmentEvidence.summary.sourceResolvedPathStepOperationCount,
    actionControllerOperationCount: actionControllerOperations.length,
    actionControllerInstallOperationCount:
      actionControllerOperations.filter(
        (operation) => operation.actionControllerId !== 0,
      ).length,
    actionControllerTeardownOperationCount:
      actionControllerOperations.filter(
        (operation) => operation.actionControllerId === 0,
      ).length,
    distinctActionControllerIdCount: new Set(
      actionControllerOperations
        .map((operation) => operation.actionControllerId)
        .filter(Boolean),
    ).size,
    captureProvenActionControllerRequestObservationCount:
      actionEvidence.summary
        .exactSourceOperationActionRequestObservationCount,
    residentCharacterSelectionOperationCount:
      characterSelectionEvidence.summary.sourceOperationCount,
    captureProvenResidentCharacterSelectionCount:
      characterSelectionEvidence.summary
        .fullyResolvedSelectedCharacterCodeCount,
    modelOverrideOperationCount:
      modelOverrideEvidence.summary.sourceOperationCount,
    persistentModelOverrideOperationCount:
      modelOverrideEvidence.summary
        .sourcePersistentOverrideOperationCount,
    clearedModelOverrideOperationCount:
      modelOverrideEvidence.summary.sourceClearedOverrideOperationCount,
    liveModelOverrideObservationCount:
      modelOverrideEvidence.summary.nonemptyRuntimeOverrideObservationCount,
    sceneObjectTransitionOperationCount:
      sceneObjectEvidence.summary.sourceOperationCount,
    distinctSceneObjectTransitionCodeCount:
      sceneObjectEvidence.summary.distinctSceneObjectCodeCount,
    exactActiveSceneObjectTransitionObservationCount:
      sceneObjectEvidence.summary
        .exactActiveSourceOperationObservationCount,
    variableMotionGateOperationCount:
      variableMotionEvidence.summary.sourceOperationCount,
    variableMotionCandidateRecordCount:
      variableMotionEvidence.summary.sourceMotionCandidateRecordCount,
    deterministicVariableMotionStateOperationCount:
      variableMotionEvidence.summary
        .sourceUnanimousMotionStateOperationCount,
    randomVariableMotionStateOperationCount:
      variableMotionEvidence.summary.sourceRandomMotionStateOperationCount,
    exactActiveVariableMotionGateObservationCount:
      variableMotionEvidence.summary
        .exactActiveSourceOperationObservationCount,
    linkedInteractionOperationCount:
      linkedInteractionEvidence.summary.sourceOperationCount,
    linkedInteractionTargetBindingCount:
      linkedInteractionEvidence.targetBindings.length,
    exactActiveLinkedInteractionObservationCount:
      linkedInteractionEvidence.summary
        .exactActiveSourceOperationObservationCount,
    validLinkedInteractionTargetBindingObservationCount:
      linkedInteractionEvidence.summary
        .validTargetBindingObservationCount,
    transientInvalidLinkedInteractionTargetBindingObservationCount:
      linkedInteractionEvidence.summary
        .transientInvalidTargetBindingObservationCount,
    interactionRegistrationOperationCount:
      interactionRegistrationEvidence.summary.sourceOperationCount,
    interactionRegistrationActorCodeCount:
      interactionRegistrationEvidence.summary.sourceActorCodeCount,
    exactActiveInteractionRegistrationObservationCount:
      interactionRegistrationEvidence.summary
        .exactActiveSourceOperationObservationCount,
    exactActiveInteractionRegistrationPointerObservationCount:
      interactionRegistrationEvidence.summary
        .exactRegistrationPointerObservationCount,
    subordinateRuntimeObservationCount:
      subordinateEvidence.summary.exactActiveOperation16ObservationCount,
    exactSubordinateSourcePointerJoinCount:
      subordinateEvidence.summary.exactActiveOperation16ObservationCount,
    deterministicWaitingPlacementOperationCount:
      allBrowserOperations.filter(
        (operation) => (
          operation.operation === 0x16 && operation.waitingPlacement
        ),
      ).length,
    deterministicExactOperationWaitingPlacementCount:
      allBrowserOperations.filter(
        (operation) => (
          operation.operation === 0x16
          && operation.waitingPlacement?.status
            === (
              "capture-proven deterministic exact-operation waiting leaf"
            )
        ),
      ).length,
    deterministicMapProgramWaitingPlacementCount:
      allBrowserOperations.filter(
        (operation) => (
          operation.operation === 0x16
          && operation.waitingPlacement?.status
            === (
              "capture-proven deterministic map/program waiting leaf"
            )
        ),
      ).length,
    linkedPlacementOperationCount: linkedPlacementOperations.length,
    allocationIndependentSingleLeafLinkedPlacementCount:
      linkedPlacementOperations.filter(
      (operation) => (
        operation.linkedPlacement.status
        === "allocation-independent single MCIR leaf endpoint"
      ),
    ).length,
    allocationIndependentSharedEndpointLinkedPlacementCount:
      linkedPlacementOperations.filter(
        (operation) => (
          operation.linkedPlacement.status
          === "allocation-independent identical MCIR leaf endpoints"
        ),
      ).length,
    sourceWideExclusiveFirstClaimLinkedPlacementCount:
      linkedPlacementOperations.filter(
        (operation) => (
          operation.linkedPlacement.status
          === (
            "source-wide exclusive first claim on zero-initialized "
            + "MCIR root"
          )
        ),
      ).length,
    captureProvenExactOperationLinkedPlacementCount:
      linkedPlacementOperations.filter(
        (operation) => (
          operation.linkedPlacement.status
          === "capture-proven deterministic exact-operation MCIR leaf"
        ),
      ).length,
    captureProvenAreaProgramLinkedPlacementCount:
      linkedPlacementOperations.filter(
        (operation) => (
          operation.linkedPlacement.status
          === "capture-proven deterministic map/program MCIR leaf"
        ),
      ).length,
    unresolvedLinkedPlacementOperationCount:
      unresolvedLinkedPlacementOperations.length,
    unresolvedLinkedPlacementReasonCounts,
    selectedTimetableEntryCount: actors.reduce(
      (count, actor) => count + selectedSchedule(actor).journeys.length,
      0,
    ),
    selectedRouteCount: actors.reduce(
      (count, actor) => count + selectedSchedule(actor).journeys.reduce(
        (journeyCount, journey) => journeyCount + journey.routes.length,
        0,
      ),
      0,
    ),
    sourceOnlySelectionCount: actors.filter(
      (actor) => actor.defaultScheduleSelection.evidence.includes(
        "no matching RAM capture",
      ),
    ).length,
    linkedRouteTableCount: linkedRouteTables.length,
    linkedRouteRootCount: linkedRouteTables.reduce(
      (count, table) => count + table.roots.length,
      0,
    ),
    linkedRoutePointCount: linkedRouteTables.reduce(
      (count, table) => count + table.roots.reduce(
        (rootCount, root) => (
          rootCount
          + root.route.points.length
          + root.groups.reduce(
            (groupCount, group) => (
              groupCount + group.leaves.reduce(
                (leafCount, leaf) => (
                  leafCount
                  + leaf.firstRoute.points.length
                  + leaf.secondRoute.points.length
                ),
                0,
              )
            ),
            0,
          )
        ),
        0,
      ),
      0,
    ),
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${manifest.summary.actorCodeCount} actor codes, `
  + `${manifest.summary.actorProgramVariantCount} program variants, `
  + `${manifest.summary.routeCount} routes.`,
);

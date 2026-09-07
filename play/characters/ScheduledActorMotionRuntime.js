import * as BABYLON from "@babylonjs/core";
import {
  interpolateMatrixRoutes,
} from "../../src/AnimationMatrixInterpolation.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import {
  createHumanoidMotnControls,
  evaluateHumanoidMotnFrame,
  splitHumanoidActorTranslation,
} from "../../src/RyoMotnRuntime.js";
import {
  evaluateHumanoidRuntimeControls,
} from "../../src/ShenmueRuntimeRig.js";
import {
  controllerFamilyByIndex,
  npcControllerFamilyForMotion,
  npcControllerFamilyForModel,
} from "./NpcControllerFamilies.js";
import {
  resolveScheduledActorMotionState,
} from "../../src/ScheduledActorMotionRegistry.js";
import {
  scheduledActorMotionRequirements,
} from "../../src/ScheduledActorMotionRequirements.js";
import motionManifest from "../data/scheduled-actor-motions.json" with {
  type: "json",
};
import {
  Shenmue2ScheduledActorMotionRuntime,
} from "./Shenmue2ScheduledActorMotionRuntime.js";

export {
  applyShenmue2Mt7MotionPose,
  compactLegTargetDeltaBrowser,
  compactLegTargetPositionBrowser,
  compactTargetDeltaBrowser,
  configureShenmue2Mt7ControllerHierarchy,
  evaluateShenmue2Mt7ControllerPose,
  evaluateShenmue2Mt7ControllerVelocity,
  SHENMUE2_NATIVE_LAYER_BLEND_FRAMES,
  SHENMUE2_NATIVE_LAYER_SOURCE_TANGENT_SCALE,
  shenmue2NativeActorRelativeRotationQuaternion,
  shenmue2NativeDirectionBlendRotationQuaternion,
  shenmue2NativeHeadLocalRotationQuaternion,
  shenmue2NativeHeadLocalPosition,
  shenmue2NativePelvisPrimaryRotationQuaternion,
  shenmue2NativePelvisOutputRotationQuaternion,
  shenmue2NativePelvisRotationQuaternion,
  shenmue2NativeRestProfileForNodes,
  shenmue2NativeLegReach,
  scheduledActorShenmue2MotionSelection,
  SHENMUE2_NATIVE_MOTION_BLEND_FRAMES,
  solveShenmue2TwoBonePositions,
} from "./Shenmue2ScheduledActorMotionRuntime.js";

const MOTION_FPS = 30;
function stateNameMaps() {
  return Object.fromEntries(
    Object.entries(motionManifest.stateNames).map(([bank, rows]) => [
      bank,
      new Map(rows.map((row) => [row.index, row.name])),
    ]),
  );
}

const STATE_NAME_BY_BANK_AND_INDEX = stateNameMaps();

export function scheduledActorMotionSelection(routeState) {
  if (!routeState) return null;
  if (routeState.operation === 1 && routeState.moving) {
    const profile = motionManifest.movementProfiles[
      routeState.movementMode
    ];
    if (!profile) return null;
    const elapsed = routeState.movementElapsedRealSeconds ?? Infinity;
    return {
      bank: profile.bank,
      name: profile.name,
      loop: profile.loop,
      elapsedSeconds: Math.max(0, elapsed),
    };
  }

  // Operation 0x30 installs a mode-7 request through the same native motion
  // registry as the ordinary scheduler requests. Its authored channels are
  // layered over the retained scheduler motion below; its zero form tears
  // down that overlay and exposes the retained motion alone.
  const activeMotionStateId = (
    routeState.actionControllerId
    || routeState.motionStateId
  );
  const resolved = resolveScheduledActorMotionState(activeMotionStateId);
  if (!resolved) return null;
  const { bank, index } = resolved;
  const name = STATE_NAME_BY_BANK_AND_INDEX[bank]?.get(index);
  if (!name) return null;
  return {
    bank,
    name,
    loop: /(?:^|_)LP(?:_|$)/.test(name),
  };
}

export function scheduledActorMotionLayers(routeState) {
  const selection = scheduledActorMotionSelection(routeState);
  if (!selection) return null;

  // Native mode-7 evidence from SGRH proves that an installed carrying
  // request remains active at controller +0x72/+0x74 while all 37 evaluated
  // locomotion controls are byte-identical to an ordinary family-matched
  // AKI_AKI_WALK_LP controller at the same phases. The request is therefore
  // not an actor-skeleton overlay during operation-1 movement. Local carried
  // objects consume their own attachment path separately.
  if (
    routeState?.operation === 1
    && routeState.moving
  ) {
    return {
      selection,
      baseSelection: null,
      baseProvidesTimeline: false,
    };
  }

  return {
    selection,
    baseSelection: routeState?.actionControllerId
      ? scheduledActorMotionSelection({
          motionStateId: routeState.motionStateId,
        })
      : null,
    baseProvidesTimeline: false,
  };
}

export { scheduledActorMotionRequirements };

function buildClip(
  sequence,
  runtimeRig,
  {
    baseSequence = null,
    baseProvidesTimeline = false,
    baseSourceControllerFamily = null,
    extractHorizontal = false,
    sourceControllerFamily = null,
  } = {},
) {
  const greatestCommonDivisor = (left, right) => (
    right
      ? greatestCommonDivisor(right, left % right)
      : left
  );
  const sequenceFrames = Math.max(1, sequence.durationFrames || 1);
  const baseFrames = Math.max(
    1,
    baseSequence?.durationFrames || 1,
  );
  // A partial action and its underlying pose are independent looping clocks.
  // Their exact combined cycle repeats at the least common multiple.
  const frameCount = baseSequence && baseProvidesTimeline
    ? baseFrames
    : baseSequence
    ? (sequenceFrames / greatestCommonDivisor(
        sequenceFrames,
        baseFrames,
      )) * baseFrames
    : sequenceFrames;
  const evaluateFrame = (frame) => {
    // Scheduled actors use native NPC sequences and a control rig initialized
    // from the target CHRM's authored skeleton. Ryo's player-only shoulder
    // correction and limb dimensions do not participate in this path.
    let result;
    if (baseSequence) {
      const baseControls = createHumanoidMotnControls(
        baseSequence,
        frame % baseFrames,
        runtimeRig,
        {
          sourceControllerFamily: baseSourceControllerFamily,
        },
      );
      const controls = createHumanoidMotnControls(
        sequence,
        frame % sequenceFrames,
        runtimeRig,
        {
          baseControls,
          sourceControllerFamily,
        },
      );
      result = {
        matrices: evaluateHumanoidRuntimeControls(controls, {
          runtimeRig,
        }),
      };
    } else {
      result = evaluateHumanoidMotnFrame(
        sequence,
        frame,
        runtimeRig,
        { sourceControllerFamily },
      );
    }
    return result.matrices;
  };
  const rawFrames = Array.from(
    { length: frameCount },
    (_, frame) => evaluateFrame(frame),
  );
  const loopStartFrame = extractHorizontal && frameCount > 1 ? 1 : 0;
  const loopFrameCount = extractHorizontal && frameCount > 1
    ? frameCount - 1
    : frameCount;
  let frames = rawFrames;
  let cycleDisplacement = [0, 0];
  let maximumResidualDistance = 0;
  if (extractHorizontal) {
    const startRoot = rawFrames[0][0];
    const endRoot = rawFrames.at(-1)[0];
    const start = [startRoot[12], startRoot[14]];
    cycleDisplacement = [
      endRoot[12] - start[0],
      endRoot[14] - start[1],
    ];
    const frameSpan = Math.max(1, frameCount - 1);
    frames = rawFrames.map((matrices, frame) => {
      // The schedule route supplies the cycle's average displacement. Remove
      // only that linear component from the authored root, leaving the
      // within-cycle forward/back and lateral residual in the pose. Because
      // these matrices remain local to the actor root, the residual naturally
      // rotates with the route heading. This is especially important for the
      // drunk walks, whose stagger is not a constant-speed straight line.
      const progress = Math.min(frame, frameSpan) / frameSpan;
      const actorTranslation = [
        start[0] + cycleDisplacement[0] * progress,
        0,
        start[1] + cycleDisplacement[1] * progress,
      ];
      const pose = splitHumanoidActorTranslation(matrices, {
        actorTranslation,
        extractHorizontal: true,
      }).poseMatrices;
      maximumResidualDistance = Math.max(
        maximumResidualDistance,
        Math.hypot(pose[0][12], pose[0][14]),
      );
      return pose;
    });
  }
  return {
    name: sequence.name,
    durationSeconds: frames.length / MOTION_FPS,
    loopStartFrame,
    loopFrameCount,
    cycleDisplacement,
    maximumResidualDistance,
    frames,
  };
}

function clipPoseWorkspace(clip, renderMatrixByKey, current = null) {
  if (
    current?.clip === clip
    && current.renderMatrixByKey === renderMatrixByKey
  ) {
    return current;
  }
  const controllerMatrices = clip.frames[0].map(
    () => new Float32Array(16),
  );
  return {
    clip,
    renderMatrixByKey,
    controllerMatrices,
    renderRoutes: new Map(
      [...renderMatrixByKey].map(([renderKey, matrixIndex]) => [
        renderKey,
        controllerMatrices[matrixIndex],
      ]),
    ),
    startMatrix: BABYLON.Matrix.Identity(),
    endMatrix: BABYLON.Matrix.Identity(),
    resultMatrix: BABYLON.Matrix.Identity(),
  };
}

function interpolatePoseMatrixToRef(start, end, amount, result, workspace) {
  if (amount <= 0) {
    result.set(start);
    return;
  }
  if (amount >= 1) {
    result.set(end);
    return;
  }
  BABYLON.Matrix.FromArrayToRef(start, 0, workspace.startMatrix);
  BABYLON.Matrix.FromArrayToRef(end, 0, workspace.endMatrix);
  BABYLON.Matrix.DecomposeLerpToRef(
    workspace.startMatrix,
    workspace.endMatrix,
    amount,
    workspace.resultMatrix,
  );
  result.set(workspace.resultMatrix.asArray());
}

function clipPose(
  clip,
  elapsedSeconds,
  loop,
  renderMatrixByKey,
  currentWorkspace = null,
) {
  const lastIndex = Math.max(0, clip.frames.length - 1);
  const rawFrame = Math.max(0, elapsedSeconds * MOTION_FPS);
  const loopStart = clip.loopStartFrame ?? 0;
  const loopFrameCount = clip.loopFrameCount ?? clip.frames.length;
  const frame = loop && loopFrameCount > 1
    ? loopStart + rawFrame % loopFrameCount
    : Math.min(lastIndex, rawFrame);
  const index = Math.floor(frame);
  const nextIndex = loop
    ? loopStart + ((index - loopStart + 1) % loopFrameCount)
    : Math.min(lastIndex, index + 1);
  const amount = frame - index;
  const workspace = clipPoseWorkspace(
    clip,
    renderMatrixByKey,
    currentWorkspace,
  );
  for (
    let matrixIndex = 0;
    matrixIndex < workspace.controllerMatrices.length;
    matrixIndex += 1
  ) {
    interpolatePoseMatrixToRef(
      clip.frames[index][matrixIndex],
      clip.frames[nextIndex][matrixIndex],
      amount,
      workspace.controllerMatrices[matrixIndex],
      workspace,
    );
  }
  return {
    controllerMatrices: workspace.controllerMatrices,
    renderRoutes: workspace.renderRoutes,
    workspace,
  };
}

export class ScheduledActorMotionRuntime {
  constructor({
    renderMatrixByKey,
    characterRuntime,
    fetchArrayBuffer,
    bankUrls,
  }) {
    this.renderMatrixByKey = renderMatrixByKey;
    this.characterRuntime = characterRuntime;
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.bankUrls = bankUrls;
    this.bankBuffers = new Map();
    this.sequences = new Map();
    this.movementNames = new Set();
    this.clips = new Map();
    this.shenmue2Runtime = new Shenmue2ScheduledActorMotionRuntime({
      fetchArrayBuffer,
      bankUrls,
    });
    this.sequenceIdentities = new WeakMap();
    this.nextSequenceIdentity = 1;
  }

  async prefetch(definitions, signal) {
    const requirements = scheduledActorMotionRequirements(definitions);
    await Promise.all(Object.entries(requirements)
      .filter(([, names]) => names.length > 0)
      .map(([bank]) => this.fetchArrayBuffer(this.bankUrls[bank], {signal})));
  }

  async configure(definitions) {
    const requirements = scheduledActorMotionRequirements(definitions);
    const banks = await Promise.all(
      Object.entries(requirements)
        .filter(([, names]) => names.length > 0)
        .map(async ([bank, names]) => {
          let buffer = this.bankBuffers.get(bank);
          if (!buffer) {
            buffer = await this.fetchArrayBuffer(this.bankUrls[bank]);
            this.bankBuffers.set(bank, buffer);
          }
          return [
            bank,
            MotnLoader.parse(buffer, { sequenceNames: names }),
          ];
        }),
    );

    await this.shenmue2Runtime.configure(definitions);

    this.clips.clear();
    this.sequences.clear();
    this.movementNames = new Set(
      Object.values(motionManifest.movementProfiles).map(
        (profile) => `${profile.bank}:${profile.name}`,
      ),
    );
    for (const [bank, parsed] of banks) {
      for (const sequence of parsed.sequences) {
        if (!sequence?.valid || !sequence.valueData?.complete) continue;
        this.sequences.set(`${bank}:${sequence.name}`, sequence);
      }
    }

  }

  async loadNamedSelections(selections) {
    const namesByBank = new Map();
    const movementKeys = new Set();
    for (const selection of selections || []) {
      if (!selection?.bank || !selection?.name) continue;
      const names = namesByBank.get(selection.bank) || new Set();
      names.add(selection.name);
      namesByBank.set(selection.bank, names);
      if (selection.movement) {
        movementKeys.add(`${selection.bank}:${selection.name}`);
      }
    }
    const parsedBanks = await Promise.all(
      [...namesByBank].map(async ([bank, names]) => {
        const url = this.bankUrls[bank];
        if (!url) throw new Error(`Motion bank URL not configured: ${bank}`);
        let buffer = this.bankBuffers.get(bank);
        if (!buffer) {
          buffer = await this.fetchArrayBuffer(url);
          this.bankBuffers.set(bank, buffer);
        }
        return [bank, MotnLoader.parse(buffer, {
          sequenceNames: [...names],
        })];
      }),
    );
    for (const [bank, parsed] of parsedBanks) {
      for (const name of namesByBank.get(bank)) {
        const sequence = parsed.getSequence(name);
        if (!sequence?.valid || !sequence.valueData?.complete) {
          throw new Error(`Complete MOTN sequence not found: ${name}`);
        }
        this.sequences.set(`${bank}:${name}`, sequence);
      }
    }
    for (const key of movementKeys) this.movementNames.add(key);
    this.clips.clear();
  }

  apply(model, routeState, elapsedSeconds) {
    if (
      !model?.loader
      || !model?.renderRoot
      || model.skeletalAnimation === false
    ) {
      return false;
    }
    if (model.characterAssetFormat === "MT7") {
      return this.shenmue2Runtime.apply(model, routeState, elapsedSeconds);
    }
    const layers = scheduledActorMotionLayers(routeState);
    if (!layers) return false;
    return this.applyNamed(
      model,
      layers.selection,
      elapsedSeconds,
      {
        baseSelection: layers.baseSelection,
        baseProvidesTimeline: layers.baseProvidesTimeline,
      },
    );
  }

  applyNamed(
    model,
    selection,
    elapsedSeconds,
    {
      baseSelection = null,
      baseProvidesTimeline = false,
    } = {},
  ) {
    if (!model?.loader || !model?.renderRoot || !selection) return false;
    const key = `${selection.bank}:${selection.name}`;
    const sequence = this.sequences.get(key);
    if (!sequence) return false;
    const baseKey = baseSelection
      ? `${baseSelection.bank}:${baseSelection.name}`
      : null;
    const baseSequence = baseKey && baseKey !== key
      ? this.sequences.get(baseKey)
      : null;
    return this.applyResolved(
      model,
      selection,
      elapsedSeconds,
      sequence,
      baseSequence,
      {
        cacheKey: key,
        baseCacheKey: baseKey,
        baseProvidesTimeline,
      },
    );
  }

  applyActivitySequence(model, { sequence, frame } = {}) {
    if (
      !sequence?.valid
      || sequence.valueData?.complete !== true
      || !Number.isSafeInteger(frame)
      || frame < 0
    ) return false;
    let identity = this.sequenceIdentities.get(sequence);
    if (!identity) {
      identity = this.nextSequenceIdentity;
      this.nextSequenceIdentity += 1;
      this.sequenceIdentities.set(sequence, identity);
    }
    return this.applyResolved(
      model,
      {
        name: sequence.name,
        loop: false,
        elapsedSeconds: frame / MOTION_FPS,
      },
      frame / MOTION_FPS,
      sequence,
      null,
      {
        cacheKey: `activity:${identity}`,
        baseCacheKey: null,
        exactFrame: frame,
      },
    );
  }

  applyResolved(
    model,
    selection,
    elapsedSeconds,
    sequence,
    baseSequence,
    {
      cacheKey,
      baseCacheKey,
      baseProvidesTimeline = false,
      exactFrame = null,
    },
  ) {
    const sourceControllerFamily = npcControllerFamilyForMotion(
      model.modelCode,
      sequence,
    );
    const baseSourceControllerFamily = baseSequence
      ? npcControllerFamilyForMotion(model.modelCode, baseSequence)
      : null;
    const embeddedControllerFamily = controllerFamilyByIndex(
      model.renderRoot._mt5ControllerFamilyIndex,
    );
    const generatedControllerFamily = npcControllerFamilyForModel(
      model.modelCode,
    );
    if (
      embeddedControllerFamily
      && generatedControllerFamily
      && embeddedControllerFamily.index !== generatedControllerFamily.index
    ) {
      throw new Error(
        `${model.modelCode} embedded controller family disagrees with `
        + "generated Disc evidence",
      );
    }
    const controllerFamily = (
      embeddedControllerFamily || generatedControllerFamily
    );
    // The target family comes directly from this CHRM's authored root node.
    // The generated table is the same Disc data audited ahead of time.
    if (!sourceControllerFamily || !controllerFamily) return false;
    const controllerFamilyId = controllerFamily.id;
    if (!model.humanoidControlRigs) {
      model.humanoidControlRigs = new Map();
    }
    let humanoidControlRig = model.humanoidControlRigs.get(
      controllerFamilyId,
    );
    if (!humanoidControlRig) {
      humanoidControlRig = this.characterRuntime
        .buildHumanoidControlRig(model.loader, model.renderRoot, {
          modelCode: model.modelCode,
          controllerFamily,
        });
      if (humanoidControlRig) {
        model.humanoidControlRigs.set(
          controllerFamilyId,
          humanoidControlRig,
        );
      }
    }
    if (!humanoidControlRig) return false;
    // Shenmue's FUN_0c12d70c walks the target HRCM hierarchy and
    // FUN_0c0924a0 looks up each node's exact signed render key in the live
    // controller tree. Intersect against this target family's complete
    // render tree, not Ryo's 13-route subset: nonhuman families contain
    // authored limb, head, tail, and ear branches absent from Ryo.
    if (!humanoidControlRig.authoredRenderMatrixByKey) {
      const authoredRenderRoutes = this.characterRuntime
        .renderMatrixRoutesForRoot(
          model.renderRoot,
          humanoidControlRig.renderMatrixByKey,
        );
      humanoidControlRig.authoredRenderMatrixByKey = new Map(
        [...humanoidControlRig.renderMatrixByKey].filter(([renderKey]) => (
          authoredRenderRoutes.has(renderKey)
        )),
      );
    }
    const renderMatrixByKey = humanoidControlRig.authoredRenderMatrixByKey;
    if (renderMatrixByKey.size === 0) return false;
    let pose;
    if (exactFrame !== null) {
      const evaluated = evaluateHumanoidMotnFrame(
        sequence,
        exactFrame,
        humanoidControlRig.rig,
        {
          sourceControllerFamily,
        },
      );
      const controllerMatrices = splitHumanoidActorTranslation(
        evaluated.matrices,
        { extractHorizontal: false },
      ).poseMatrices;
      pose = {
        controllerMatrices,
        renderRoutes: interpolateMatrixRoutes(
          controllerMatrices,
          controllerMatrices,
          renderMatrixByKey,
          0,
        ),
      };
    } else {
      const clipKey = [
        cacheKey,
        baseCacheKey || "",
        baseProvidesTimeline ? "base-timeline" : "primary-timeline",
        humanoidControlRig.signature,
      ].join(":");
      let clip = this.clips.get(clipKey);
      if (!clip) {
        clip = buildClip(
          sequence,
          humanoidControlRig.rig,
          {
            baseSequence,
            baseProvidesTimeline,
            baseSourceControllerFamily,
            extractHorizontal: (
              this.movementNames.has(cacheKey)
              || this.movementNames.has(baseCacheKey)
            ),
            sourceControllerFamily,
          },
        );
        this.clips.set(clipKey, clip);
      }
      if (!clip) return false;
      pose = clipPose(
        clip,
        selection.elapsedSeconds ?? elapsedSeconds,
        selection.loop,
        renderMatrixByKey,
        model.motionPoseWorkspace,
      );
      model.motionPoseWorkspace = pose.workspace;
    }
    // This is the original render contract, not skeletal retargeting:
    // FUN_0c12d70c traverses the target HRCM, FUN_0c0924a0 resolves each
    // authored signed render key in the controller tree, and the matrix at
    // the resolved node's +0x38 is copied directly by FUN_0c1d1a00.
    //
    // Rebuilding these absolute matrices through the CHRM parent hierarchy
    // corrupts compact rigs whose render nodes intentionally collapse parts
    // of a controller chain (SHY_L's legs are one concrete example).
    const nativeRenderRoutes = pose.renderRoutes;
    // FUN_0c1140e6 resolves carried-object targets against the complete MOMT
    // controller array, including controls that do not directly drive an MT5
    // render node. Preserve both representations: routed matrices are the
    // exact controller outputs consumed by HRCM, while the full controller
    // array covers authored attachment-only controls.
    model.latestControllerFamily = controllerFamily;
    model.latestControllerRenderMatrixByKey = renderMatrixByKey;
    model.latestControllerMatrices = pose.controllerMatrices;
    // Keep the established property name because local-object and grounding
    // consumers already read it; its value is now the native route map.
    model.latestRetargetedRoutes = nativeRenderRoutes;
    this.characterRuntime.applyCharacterRigWorldMatrices(
      model.loader,
      model.renderRoot,
      nativeRenderRoutes,
    );
    return true;
  }
}

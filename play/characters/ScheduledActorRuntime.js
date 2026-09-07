import * as BABYLON from "@babylonjs/core";
import { clearWorldSceneAssets } from "../../src/rendering/SceneResources.js";
import { fetchAsset, getTexturePack } from "../../src/assetLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { routeLength, sampleRoute } from "../../src/RouteSampling.js";
import {
  ForkliftRig,
  createForkliftState,
} from "../../src/ForkliftRig.js";
import {
  scheduledActorModelCode,
} from "../../src/ScheduledActorPresentation.js";
import {
  scheduledAttachedObjectMatrix,
  scheduledBrowserAttachedObjectMatrix,
  scheduledLocalObjectActorParentMatrix,
  scheduledLocalObjectControllerRoute,
  scheduledLocalObjectPlacementTarget,
} from "../../src/ScheduledActorLocalObjects.js";
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";
import {
  FORKLIFT_DRIVER_HORIZONTAL_OFFSET,
  FORKLIFT_MODEL,
} from "../config/forklifts.js";
import {
  SCHEDULED_SECONDARY_OBJECTS,
} from "../config/scheduledSecondaryObjects.js";
import {
  scheduledActorShenmue2MotionSelection,
  scheduledActorMotionSelection,
} from "./ScheduledActorMotionRuntime.js";
import scheduledActorLocalObjectModels
  from "../data/scheduledActorLocalObjectModels.js";
import {
  nativeClothStateForModel,
} from "./NativeClothBabylonPresentation.js";
import {
  loadNativeCharacterModel,
  nativeCharacterGroundOffset,
  nativeCharacterMinimumWorldY,
  nativeCharacterModelScale,
} from "./NativeCharacterModelLoader.js";

const SCHEDULED_ACTOR_TURN_RESPONSE = 10;
const SCHEDULED_ACTOR_TURN_CONTINUITY_SPEED = 20;

export function scheduledActorLocalLoopRouteState(
  definition,
  distance = 0,
  gameSecond = null,
) {
  const route = definition?.localLoopRoute;
  if (!Array.isArray(route?.points) || route.points.length < 2) return null;
  if (
    Number.isFinite(gameSecond)
    && Number.isFinite(route.activeUntilSecond)
    && gameSecond >= route.activeUntilSecond
  ) {
    return null;
  }
  const length = routeLength(route.points);
  if (!Number.isFinite(length) || length <= 0) {
    if (!route.stationary) return null;
    return {
      actorCode: definition.actorCode,
      worldId: route.worldId,
      position: route.points[0],
      rootYaw: 0,
      operation: 3,
      moving: false,
      movementMode: null,
      movementElapsedRealSeconds: 0,
      routeId: route.id || null,
      routeDistance: 0,
      routeLength: 0,
    };
  }
  const wrappedDistance = ((distance % length) + length) % length;
  const sampled = sampleRoute(route.points, wrappedDistance);
  if (!sampled) return null;
  return {
    actorCode: definition.actorCode,
    worldId: route.worldId,
    position: sampled.position,
    rootYaw: sampled.yaw + Math.PI,
    operation: 1,
    moving: true,
    movementMode: route.movementMode || "0x66",
    movementElapsedRealSeconds: wrappedDistance / Math.max(
      0.01,
      route.speed || 1,
    ),
    routeId: route.id || null,
    routeDistance: wrappedDistance,
    routeLength: length,
  };
}

export function scheduledActorNativeScheduleRouteState(
  definition,
  playback,
  deltaSeconds = 0,
  gameSecond = null,
) {
  const schedule = definition?.nativeSchedule;
  const phases = schedule?.phases;
  if (!Array.isArray(phases) || phases.length === 0 || !playback) return null;
  const secondOfDay = Number.isFinite(gameSecond) ? gameSecond : 0;
  // Native programs are linear instruction streams. A clock gate whose packed
  // time moves backwards belongs to the following day, so compare the small
  // post-midnight window against the builder's normalized 24h+ phase times.
  const clock = Number.isFinite(schedule.wrapAfterMidnightSecond)
    && secondOfDay <= schedule.wrapAfterMidnightSecond
    ? secondOfDay + 24 * 60 * 60
    : secondOfDay;
  let phaseIndex = 0;
  for (let index = 1; index < phases.length; index += 1) {
    if (clock < phases[index].startSecond) break;
    phaseIndex = index;
  }
  const phase = phases[phaseIndex];
  if (playback.phaseIndex !== phaseIndex) {
    const enteringFromActivePhase = playback.active === true;
    playback.phaseIndex = phaseIndex;
    playback.distance = 0;
    playback.exited = false;
    playback.entryPosition = enteringFromActivePhase && playback.position
      ? [...playback.position]
      : [...(phase.points?.[0] || definition.position || [0, 0, 0])];
    playback.initializeLoopPhase = !enteringFromActivePhase;
    playback.phaseElapsedSeconds = 0;
  }
  playback.active = phase.active !== false;
  if (!playback.active) {
    playback.position = [
      ...(phase.points?.[0] || definition.position || [0, 0, 0]),
    ];
    return null;
  }
  if (playback.exited) return null;

  const previousPhaseElapsedSeconds = Number(playback.phaseElapsedSeconds) || 0;
  playback.phaseElapsedSeconds = previousPhaseElapsedSeconds
    + Math.max(0, deltaSeconds);
  const prelude = phase.nativePrelude;
  if (prelude && playback.phaseElapsedSeconds < prelude.durationSeconds) {
    const position = prelude.position
      || phase.points?.[0]
      || playback.entryPosition;
    playback.position = [...position];
    return {
      actorCode: definition.actorCode,
      worldId: schedule.worldId,
      position: [...position],
      rootYaw: Number.isFinite(prelude.rootYaw) ? prelude.rootYaw : 0,
      operation: 3,
      moving: false,
      movementMode: null,
      movementElapsedRealSeconds: playback.phaseElapsedSeconds,
      routeId: `${definition.instanceId || definition.actorCode}:phase:${phaseIndex}:prelude`,
      routeDistance: 0,
      routeLength: 0,
      nativeSchedulePhaseIndex: phaseIndex,
      nativeMotionId: prelude.motionId,
      nativeMotionRate: prelude.playbackRate,
    };
  }
  const routeDeltaSeconds = prelude
    ? Math.max(0, playback.phaseElapsedSeconds - prelude.durationSeconds)
      - Math.max(0, previousPhaseElapsedSeconds - prelude.durationSeconds)
    : Math.max(0, deltaSeconds);

  const authoredPoints = (phase.points || []).map((point) => [...point]);
  const points = phase.behavior === "once" && authoredPoints.length > 0
    ? [
        [...playback.entryPosition],
        ...authoredPoints.slice(1),
      ]
    : authoredPoints;
  const speed = Math.max(0.01, Number(schedule.speed) || 1);
  const length = routeLength(points);
  let sampled = null;
  let moving = false;
  if (phase.behavior === "loop" && length > 0) {
    if (playback.initializeLoopPhase) {
      playback.distance = length * Math.max(
        0,
        Math.min(1, Number(schedule.phase) || 0),
      );
      playback.initializeLoopPhase = false;
    }
    playback.distance = (
      playback.distance + routeDeltaSeconds * speed
    ) % length;
    sampled = sampleRoute(points, playback.distance);
    moving = true;
  } else if (phase.behavior === "once" && length > 0) {
    playback.distance = Math.min(
      length,
      playback.distance + routeDeltaSeconds * speed,
    );
    sampled = sampleRoute(points, playback.distance);
    moving = playback.distance < length;
    if (!moving && phase.exitAfterArrival) {
      playback.position = [...points.at(-1)];
      playback.exited = true;
      return null;
    }
  }
  const position = sampled?.position
    || points.at(-1)
    || playback.entryPosition;
  playback.position = [...position];
  return {
    actorCode: definition.actorCode,
    worldId: schedule.worldId,
    position: [...position],
    rootYaw: sampled?.yaw === undefined
      ? (Number.isFinite(phase.nativeRootYaw) ? phase.nativeRootYaw : 0)
      : sampled.yaw + Math.PI,
    operation: moving ? 1 : 3,
    moving,
    movementMode: moving ? "0x66" : null,
    movementElapsedRealSeconds: playback.distance / speed,
    routeId: `${definition.instanceId || definition.actorCode}:phase:${phaseIndex}`,
    routeDistance: playback.distance,
    routeLength: Number.isFinite(length) ? length : 0,
    nativeSchedulePhaseIndex: phaseIndex,
    nativeMotionId: Number.isInteger(phase.nativeMotionId)
      ? phase.nativeMotionId
      : null,
    nativeMotionRate: Number.isFinite(phase.nativeMotionRate)
      ? phase.nativeMotionRate
      : 1,
  };
}

export function scheduledActorLocalObjectModel(
  registration,
  worldId,
  modelRegistry = scheduledActorLocalObjectModels,
) {
  if (!registration?.locationCode) return null;
  return (
    modelRegistry?.worlds?.[worldId]?.[registration.locationCode]
    || registration.resolvedModel
    || null
  );
}

export function scheduledActorLocalObjectModelRequirements(
  definitions,
  worldId,
  modelRegistry = scheduledActorLocalObjectModels,
) {
  if (definitions?.localObjectModels) {
    return [...definitions.localObjectModels];
  }
  const models = new Set();
  for (const definition of definitions || []) {
    for (const journey of definition.journeys || []) {
      for (const operation of journey.operations || []) {
        if (operation.operation !== 0x10 || !operation.localTransform) {
          continue;
        }
        const model = scheduledActorLocalObjectModel(
          operation.localTransform,
          worldId,
          modelRegistry,
        );
        if (model) models.add(model);
      }
    }
  }
  return [...models].sort();
}

export function scheduledActorInterpolatedYaw(
  currentYaw,
  targetYaw,
  deltaSeconds,
  response = SCHEDULED_ACTOR_TURN_RESPONSE,
) {
  if (!Number.isFinite(targetYaw)) return currentYaw;
  if (!Number.isFinite(currentYaw)) return targetYaw;
  const elapsed = Math.max(0, deltaSeconds);
  const turnResponse = Math.max(0, response);
  if (elapsed === 0 || turnResponse === 0) return currentYaw;
  const shortestTurn = Math.atan2(
    Math.sin(targetYaw - currentYaw),
    Math.cos(targetYaw - currentYaw),
  );
  const alpha = 1 - Math.exp(-turnResponse * elapsed);
  return currentYaw + shortestTurn * alpha;
}

export function scheduledActorTurnIsContinuous(
  previousPosition,
  nextPosition,
  deltaSeconds,
) {
  if (
    !Array.isArray(previousPosition)
    || !Array.isArray(nextPosition)
    || previousPosition.length < 3
    || nextPosition.length < 3
  ) {
    return false;
  }
  const dx = nextPosition[0] - previousPosition[0];
  const dz = nextPosition[2] - previousPosition[2];
  const maximumDistance = Math.max(
    2,
    Math.max(0, deltaSeconds) * SCHEDULED_ACTOR_TURN_CONTINUITY_SPEED,
  );
  return Math.hypot(dx, dz) <= maximumDistance;
}

export function scheduledActorFacingYaw(position, target) {
  if (
    !Array.isArray(position)
    || !Array.isArray(target)
    || position.length < 3
    || target.length < 3
    || ![position[0], position[2], target[0], target[2]].every(
      Number.isFinite,
    )
  ) {
    return null;
  }
  const deltaX = target[0] - position[0];
  const deltaZ = target[2] - position[2];
  if (deltaX === 0 && deltaZ === 0) return null;
  return Math.atan2(deltaX, deltaZ);
}

export function scheduledActorModelScaleCorrection(
  modelCode,
  { animated = false } = {},
) {
  return nativeCharacterModelScale(modelCode, { animated });
}

export function applyScheduledActorAnimatedScale(model) {
  const root = model?.root;
  if (!root?.scaling || typeof root.scaling.setAll !== "function") {
    return false;
  }
  const animatedScale = model.animatedScale
    ?? scheduledActorModelScaleCorrection(
      model.modelCode,
      { animated: true },
    );
  if (root.scaling.x === animatedScale) return false;
  root.scaling.setAll(animatedScale);
  root.computeWorldMatrix?.(true);
  return true;
}

export function scheduledActorMinimumWorldY(root, { refresh = true } = {}) {
  return nativeCharacterMinimumWorldY(root, { refresh });
}

export function scheduledActorGroundOffset(root, clearance = 0.003) {
  return nativeCharacterGroundOffset(root, clearance);
}

export function scheduledActorDebugIdentity(node) {
  const selection = scheduledActorSelection(node);
  return selection
    ? { name: selection.name, id: selection.id }
    : null;
}

export function scheduledActorSelection(node) {
  for (let current = node; current; current = current.parent) {
    const metadata = current.metadata;
    if (!metadata?.scheduledActorInstanceId) continue;
    return {
      name: (
        metadata.scheduledActorLabel
        || metadata.scheduledActor
        || "Unknown NPC"
      ),
      id: metadata.scheduledActorInstanceId,
      actorCode: metadata.scheduledActor || null,
      root: current,
    };
  }
  return null;
}

export function pickScheduledActorSelection(
  scene,
  camera,
  pointerX,
  pointerY,
  directPick = null,
) {
  const directSelection = scheduledActorSelection(
    directPick?.pickedMesh,
  );
  if (directSelection) return directSelection;
  // POINTERPICK reports only the nearest general-purpose hit. Re-pick against
  // the actor proxy so a wall overlay or bind-pose character piece cannot
  // steal the interaction.
  const actorPick = scene?.pick?.(
    pointerX,
    pointerY,
    (mesh) => Boolean(
      mesh.metadata?.scheduledActorDebugSelectionProxy
      && scheduledActorSelection(mesh)
    ),
    false,
    camera,
  );
  return scheduledActorSelection(actorPick?.pickedMesh);
}

export function pickScheduledActorDebugIdentity(
  scene,
  camera,
  pointerX,
  pointerY,
  directPick = null,
) {
  const selection = pickScheduledActorSelection(
    scene,
    camera,
    pointerX,
    pointerY,
    directPick,
  );
  return selection ? { name: selection.name, id: selection.id } : null;
}

function scheduledActorDebugSelectionBounds(root) {
  const minimum = new BABYLON.Vector3(
    Infinity,
    Infinity,
    Infinity,
  );
  const maximum = new BABYLON.Vector3(
    -Infinity,
    -Infinity,
    -Infinity,
  );
  for (const node of [root, ...root.getDescendants(false)]) {
    if (
      node.isEnabled?.() === false
      || typeof node.getBoundingInfo !== "function"
      || typeof node.getTotalVertices !== "function"
      || node.getTotalVertices() <= 0
    ) {
      continue;
    }
    node.computeWorldMatrix(true);
    node.refreshBoundingInfo();
    const box = node.getBoundingInfo().boundingBox;
    minimum.minimizeInPlace(box.minimumWorld);
    maximum.maximizeInPlace(box.maximumWorld);
  }
  if (
    ![minimum.x, minimum.y, minimum.z, maximum.x, maximum.y, maximum.z]
      .every(Number.isFinite)
  ) {
    return null;
  }
  return {
    center: minimum.add(maximum).scale(0.5),
    size: maximum.subtract(minimum),
  };
}

function createScheduledActorDebugSelectionProxy(
  scene,
  actorRoot,
  renderRoot,
  scaleCorrection,
) {
  const bounds = scheduledActorDebugSelectionBounds(renderRoot);
  if (!bounds) return null;
  const inverseScale = scaleCorrection > 1e-6
    ? 1 / scaleCorrection
    : 1;
  const proxy = BABYLON.MeshBuilder.CreateBox(
    `${actorRoot.name}_debug_selection`,
    { size: 1 },
    scene,
  );
  proxy.parent = actorRoot;
  proxy.position.copyFrom(bounds.center.scale(inverseScale));
  proxy.scaling.set(
    Math.max(bounds.size.x * inverseScale, 0.55 * inverseScale),
    Math.max(bounds.size.y * inverseScale, 1.55 * inverseScale),
    Math.max(bounds.size.z * inverseScale, 0.45 * inverseScale),
  );
  // The actor-specific debug pick supplies an explicit predicate, so Babylon
  // can ray-test this mesh while ordinary scene picking and rendering ignore
  // it completely.
  proxy.isVisible = false;
  proxy.isPickable = false;
  proxy.checkCollisions = false;
  proxy.metadata = {
    ...(actorRoot.metadata || {}),
    cameraBlocker: false,
    scheduledActorDebugSelectionProxy: true,
  };
  return proxy;
}

export function updateScheduledActorDebugSelectionProxy(
  proxy,
  animatedBounds,
  scaleCorrection,
) {
  if (!proxy || !animatedBounds) return false;
  const { minimum, maximum } = animatedBounds;
  if (
    !Array.isArray(minimum)
    || !Array.isArray(maximum)
    || minimum.length < 3
    || maximum.length < 3
    || ![...minimum.slice(0, 3), ...maximum.slice(0, 3)]
      .every(Number.isFinite)
  ) {
    return false;
  }
  const inverseScale = scaleCorrection > 1e-6
    ? 1 / scaleCorrection
    : 1;
  proxy.position.set(
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  );
  proxy.scaling.set(
    Math.max(maximum[0] - minimum[0], 0.55 * inverseScale),
    Math.max(maximum[1] - minimum[1], 1.55 * inverseScale),
    Math.max(maximum[2] - minimum[2], 0.45 * inverseScale),
  );
  return true;
}

function placeScheduledActor(root, position) {
  root.position.set(
    position[0],
    position[1] + (
      root.metadata?.scheduledActorSecondaryObjectActive
        ? 0
        : (root.metadata?.scheduledActorGroundOffset || 0)
    ),
    position[2],
  );
}

export function scheduledActorSecondaryObjectCode(definition) {
  if (definition?.secondaryObject?.kind === "forklift") {
    return definition.secondaryObject.objectCode || null;
  }
  for (const journey of definition?.journeys || []) {
    for (const operation of journey.operations || []) {
      if (
        operation.operation === 0x1c
        && operation.secondaryObjectCode?.startsWith("FK0")
      ) {
        return operation.secondaryObjectCode;
      }
    }
  }
  return null;
}

export function scheduledActorSecondaryObjectDefinition(definition) {
  if (definition?.secondaryObject) {
    return { ...definition.secondaryObject };
  }
  const forkliftCode = scheduledActorSecondaryObjectCode(definition);
  if (forkliftCode) {
    return {
      objectCode: forkliftCode,
      kind: "forklift",
      model: FORKLIFT_MODEL,
    };
  }
  for (const journey of definition?.journeys || []) {
    for (const operation of journey.operations || []) {
      if (operation.operation !== 0x24) continue;
      const configured = SCHEDULED_SECONDARY_OBJECTS[
        operation.secondaryObjectCode
      ];
      if (configured) {
        return {
          objectCode: operation.secondaryObjectCode,
          ...configured,
        };
      }
    }
  }
  return null;
}

export function scheduledForkliftDriverHorizontalOffset() {
  // The playable forklift's MT5 root is rotated by PI beneath its chassis
  // while its measured driver offset is expressed in chassis space. Scheduled
  // FK0 objects use the native actor/object facing directly and therefore do
  // not retain that extra model rotation. Rotate the measured horizontal seat
  // displacement by the same PI to express it in the scheduled actor frame.
  // Vertical placement remains owned by the exact native ride animation.
  return new BABYLON.Vector3(
    -FORKLIFT_DRIVER_HORIZONTAL_OFFSET.x,
    0,
    -FORKLIFT_DRIVER_HORIZONTAL_OFFSET.z,
  );
}

function scheduledActorRenderableMeshes(root) {
  return [root, ...root.getDescendants(false)].filter((node) => (
    typeof node.getTotalVertices === "function"
    && node.getTotalVertices() > 0
    && !node.metadata?.scheduledActorDebugSelectionProxy
  ));
}

export function scheduledMt7HumanoidMotionNodes(root) {
  const entries = root?._mt7Nodes || [];
  // Live Dreamcast controllers partition compact curves into five native
  // solvers. Their renderer outputs prove that MT7 preorder is not the curve
  // order: 0x04/0x09 are the two arm-solver roots, 0x01 is the torso output,
  // 0x0e owns the lower-body branch, and ffbd is the head output. Bind only
  // directly recoverable controls here. Basis/attachment inputs and terminal
  // render nodes inherit their solved parent instead of receiving a guessed
  // independent curve.
  const motionControlById = new Map([
    // Slot 0: the hip followed by two procedural leg branches. Controllers
    // 3/6 are foot-position targets consumed by the native two-bone solver;
    // 4/7 are terminal foot controls. The knees are solver outputs and do not
    // own compact Euler curves.
    [0x0e, { index: 0, kind: "rotation" }],
    [0x15, { index: 3, kind: "solverTarget" }],
    [0x17, { index: 4, kind: "solverTerminal" }],
    [0x10, { index: 6, kind: "solverTarget" }],
    [0x12, { index: 7, kind: "solverTerminal" }],
    // Slot 1 is a one-output torso solver. Controller 8 carries the animated
    // basis; 9 is its aim vector and 10 is the fixed terminal input. Applying
    // controller 10 directly was why otherwise valid walkers had rigid torsos.
    [0x01, { index: 8, kind: "solverRotation" }],
    // Slot 2 follows the same root/basis/target split as S1's aimed head.
    // Controller 11 is the ordinary neck/head rotation; 12 and 13 are solver
    // basis/target inputs and must not be applied as a head Euler triplet.
    [0xffbd, { index: 11, kind: "rotation" }],
    // Slots 3/4: solver root followed by the three independently controlled
    // arm nodes. The fourth MT7 node in each chain is a terminal inheritor.
    // Native slot-3 outputs lie on the positive-Z shoulder side and slot 4
    // on negative Z. The MT7 render chains use the opposite numeric ordering:
    // 0x05 is positive-Z and 0x0a is negative-Z. Bind by native output side,
    // as the lower-body solver likewise crosses its numbered target branches.
    [0x09, { index: 14, kind: "rotation" }],
    [0x05, { index: 15, kind: "solverBasis" }],
    [0x06, { index: 16, kind: "solverTarget" }],
    [0x07, { index: 17, kind: "rotation" }],
    [0x04, { index: 18, kind: "rotation" }],
    [0x0a, { index: 19, kind: "solverBasis" }],
    [0x0b, { index: 20, kind: "solverTarget" }],
    [0x0c, { index: 21, kind: "rotation" }],
  ]);
  const humanoidNodeIds = new Set([
    0x04, 0x09, 0x01,
    0x0a, 0x0b, 0x0c, 0xffbe,
    0x05, 0x06, 0x07, 0xffbf,
    0x0e,
    0x15, 0x16, 0x17, 0x18,
    0x10, 0x11, 0x12, 0x13,
    0xffbd, 0xffff, 0xffb0, 0xffbb, 0xffaf, 0x79,
  ]);
  const selected = [];
  const seenControllerIndices = new Set();
  const sourceByOffset = new Map(entries.map((entry) => [
    entry.sourceNode.offset,
    entry.sourceNode,
  ]));
  const modelFamilySourceNode = entries.find((entry) => (
    !entry.sourceNode.parentOffset
  ))?.sourceNode || null;
  const hasOrdinaryHeadOutput = entries.some((entry) => (
    entry.sourceNode.id === 0xffbd
  ));
  for (const entry of entries) {
    const { id } = entry.sourceNode;
    const parentId = sourceByOffset.get(entry.sourceNode.parentOffset)?.id;
    const isStoryHeadOutput = (
      !hasOrdinaryHeadOutput && id === 0x46 && parentId === 0x01
    );
    if (!humanoidNodeIds.has(id) && !isStoryHeadOutput) continue;
    // CC1 replaces the ordinary 0x0c forearm control with 0xffff while
    // retaining the same position in the 0x0a -> 0x0b chain. Resolve signed
    // aliases by authored parent context; the same IDs also occur as genuine
    // terminals elsewhere and must not receive this curve globally.
    const contextualMotionControl = (
      motionControlById.get(id)
      ?? ((id === 0xffff && parentId === 0x0b)
        ? { index: 21, kind: "rotation" }
        : undefined)
      // RYO_M and the other audited full-story character hierarchies put a
      // direct 0x46 child beneath torso 0x01 instead of the pedestrian
      // 0xffbd head output. In the live Ryo capture, the MDC7 records follow
      // the exact model preorder 0x04, 0x09, 0x01, 0x46; that fourth record is
      // bound to compact-controller matrix +0x1508, native solver slot 2's
      // controller-11 output. Require both the authored parent context and
      // absence of 0xffbd so unrelated 0x46 render nodes remain untouched.
      ?? (isStoryHeadOutput
        ? { index: 11, kind: "rotation" }
        : undefined)
    );
    const motionNodeIndex = contextualMotionControl?.index;
    if (
      motionNodeIndex !== undefined
      && seenControllerIndices.has(motionNodeIndex)
    ) continue;
    if (motionNodeIndex !== undefined) {
      seenControllerIndices.add(motionNodeIndex);
    }
    selected.push({
      ...entry,
      modelFamilySourceNode,
      motionNodeIndex: motionNodeIndex ?? null,
      motionControllerKind: contextualMotionControl?.kind ?? null,
      motionSolverSlot: motionNodeIndex === undefined
        ? null
        : motionNodeIndex < 8 ? 0
        : motionNodeIndex < 11 ? 1
        : motionNodeIndex < 14 ? 2
        : motionNodeIndex < 18 ? 3
        : 4,
      motionTerminal: motionNodeIndex === undefined,
      motionRoot: id === 0x01,
    });
  }
  // A06_E is a native reduced renderer hierarchy. Its exact HUMANS model and
  // two synchronized MDC7 captures retain every ordinary humanoid node except
  // the invisible 0x09/0x04 arm-solver roots. Both upper arms are authored as
  // direct torso children, while compact-controller matrices +0x1690/+0x1c10
  // still prove that the native solver computes those intermediate roots.
  // Accept only that complete 17-node signature; this must not turn arbitrary
  // props that happen to reuse body IDs into animated humanoids.
  const reducedNativeIds = new Set([
    0x01, 0xffbd,
    0x05, 0x06, 0x07, 0xffbf,
    0x0a, 0x0b, 0x0c, 0xffbe,
    0x0e,
    0x10, 0x11, 0x12,
    0x15, 0x16, 0x17,
  ]);
  const isReducedNativeHierarchy = (
    selected.length === reducedNativeIds.size
    && selected.every(({ sourceNode }) => reducedNativeIds.has(sourceNode.id))
    && new Set(selected.map(({ sourceNode }) => sourceNode.id)).size
      === reducedNativeIds.size
    && [0x05, 0x0a].every((id) => {
      const entry = selected.find(({ sourceNode }) => sourceNode.id === id);
      return sourceByOffset.get(entry?.sourceNode.parentOffset)?.id === 0x01;
    })
  );
  if (isReducedNativeHierarchy) {
    selected.shenmue2ReducedNativeHierarchy = true;
  }
  // Ordinary audited humanoids retain at least the 18 structural body nodes
  // plus one head/terminal node. The exact reduced signature above is the
  // only established exception.
  return selected.length >= 19 || isReducedNativeHierarchy ? selected : [];
}

const SCHEDULED_ACTOR_OCCLUSION_MATERIALS = new WeakMap();

function scheduledActorOcclusionMaterial(scene) {
  let material = SCHEDULED_ACTOR_OCCLUSION_MATERIALS.get(scene);
  if (material) return material;
  material = new BABYLON.StandardMaterial(
    "scheduled_actor_occlusion_material",
    scene,
  );
  // This box participates only in the GPU visibility query. It must neither
  // appear in the frame nor write depth that can hide ordinary scene meshes.
  material.disableColorWrite = true;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  SCHEDULED_ACTOR_OCCLUSION_MATERIALS.set(scene, material);
  return material;
}

function createScheduledActorOcclusionProxy(
  scene,
  actorRoot,
  renderRoot,
  scaleCorrection,
) {
  const bounds = scheduledActorDebugSelectionBounds(renderRoot);
  if (!bounds) return null;
  const inverseScale = scaleCorrection > 1e-6
    ? 1 / scaleCorrection
    : 1;
  const proxy = BABYLON.MeshBuilder.CreateBox(
    `${actorRoot.name}_occlusion`,
    { size: 1 },
    scene,
  );
  proxy.parent = actorRoot;
  proxy.position.copyFrom(bounds.center.scale(inverseScale));
  proxy.scaling.set(
    Math.max(bounds.size.x * inverseScale, 0.55 * inverseScale),
    Math.max(bounds.size.y * inverseScale, 1.55 * inverseScale),
    Math.max(bounds.size.z * inverseScale, 0.45 * inverseScale),
  );
  proxy.material = scheduledActorOcclusionMaterial(scene);
  proxy.isPickable = false;
  proxy.checkCollisions = false;
  proxy.metadata = {
    cameraBlocker: false,
    scheduledActorOcclusionProxy: true,
  };
  proxy.occlusionType = BABYLON.AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
  proxy.occlusionQueryAlgorithmType =
    BABYLON.AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
  proxy.occlusionRetryCount = 2;
  return proxy;
}

export function scheduledActorModelIsInFrustum(model, frustumPlanes) {
  const meshes = model?.renderMeshes || [];
  const cullingMesh = (
    model?.occlusionMesh?.isEnabled?.()
    && typeof model.occlusionMesh.isInFrustum === "function"
  )
    ? model.occlusionMesh
    : null;
  if (
    Array.isArray(frustumPlanes)
    && frustumPlanes.length > 0
    && (
      cullingMesh
        ? !cullingMesh.isInFrustum(frustumPlanes)
        : (
          meshes.length > 0
          && !meshes.some((mesh) => (
            mesh.isEnabled?.()
            && mesh.isVisible !== false
            && mesh.visibility !== 0
            && mesh.isInFrustum(frustumPlanes)
          ))
        )
    )
  ) {
    return false;
  }
  return true;
}

export function scheduledActorModelShouldAnimate(
  model,
  frustumPlanes,
) {
  if (!scheduledActorModelIsInFrustum(model, frustumPlanes)) {
    return false;
  }
  // Babylon updates this asynchronously from the previous render's
  // conservative bounding-box query. Optimistic queries report visible when
  // unsupported, delayed, or uncertain, so a failed query cannot leave an
  // NPC permanently frozen.
  return !scheduledActorModelIsOccluded(model);
}

export function scheduledActorModelIsOccluded(model) {
  const proxy = model?.occlusionMesh;
  return Boolean(
    proxy
    && proxy.isEnabled?.() !== false
    && proxy.isOccluded === true
  );
}

export function setScheduledActorOcclusionCulled(model, culled) {
  const next = Boolean(culled);
  if (
    !model?.renderRoot?.setEnabled
    || next === Boolean(model.occlusionRenderCulled)
  ) {
    return false;
  }
  // The query proxy is parented to the actor placement root, not renderRoot.
  // Disabling only renderRoot removes all character pieces from Babylon's
  // active/render mesh lists while leaving the proxy alive to detect when the
  // actor becomes visible again.
  model.renderRoot.setEnabled(!next);
  model.occlusionRenderCulled = next;
  return true;
}

export function scheduledActorModelBlocksCamera(
  model,
  target,
  cameraPosition,
  maximumCameraDistance = 2,
) {
  const proxy = model?.occlusionMesh;
  if (
    !proxy?.isEnabled?.()
    || !target
    || !cameraPosition
  ) return false;
  const offset = cameraPosition.subtract(target);
  const distance = offset.length();
  if (!Number.isFinite(distance) || distance <= 1e-6) return false;
  proxy.computeWorldMatrix(true);
  const bounds = proxy.getBoundingInfo().boundingBox;
  const minimum = bounds.minimumWorld;
  const maximum = bounds.maximumWorld;
  const distanceFromBounds = Math.hypot(
    Math.max(minimum.x - cameraPosition.x, 0, cameraPosition.x - maximum.x),
    Math.max(minimum.y - cameraPosition.y, 0, cameraPosition.y - maximum.y),
    Math.max(minimum.z - cameraPosition.z, 0, cameraPosition.z - maximum.z),
  );
  if (distanceFromBounds > maximumCameraDistance) return false;
  return Boolean(
    new BABYLON.Ray(
      target,
      offset.scale(1 / distance),
      distance,
    ).intersectsMesh(proxy, false)?.hit,
  );
}

export function setScheduledActorCameraFade(
  model,
  faded,
  opacity = 0.5,
) {
  const meshes = model?.renderMeshes || [];
  if (faded === Boolean(model?.cameraFadeState)) return;
  if (faded) {
    const materialClones = new Map();
    const meshStates = new Map();
    for (const mesh of meshes) {
      const material = mesh.material;
      if (!material?.clone) continue;
      let fadedMaterial = materialClones.get(material);
      if (!fadedMaterial) {
        fadedMaterial = material.clone(
          `${material.name || "scheduled_actor"}_camera_fade`,
        );
        fadedMaterial.alpha = (
          Number.isFinite(material.alpha) ? material.alpha : 1
        ) * opacity;
        fadedMaterial.transparencyMode = (
          material.transparencyMode
            === BABYLON.StandardMaterial.MATERIAL_ALPHATEST
            ? BABYLON.StandardMaterial.MATERIAL_ALPHATESTANDBLEND
            : BABYLON.StandardMaterial.MATERIAL_ALPHABLEND
        );
        // Render only the nearest surface of layered character geometry;
        // otherwise every body/clothing layer blends over the next and makes
        // the faded NPC look pale or self-illuminated.
        fadedMaterial.needDepthPrePass = true;
        materialClones.set(material, fadedMaterial);
      }
      meshStates.set(mesh, {
        material,
        disableAlphaToCoverage: mesh._mt5DisableAlphaToCoverage,
      });
      mesh.material = fadedMaterial;
      // Alpha-to-coverage is useful for opaque hair cutouts, but conflicts
      // with a whole-character alpha blend.
      mesh._mt5DisableAlphaToCoverage = true;
    }
    model.cameraFadeState = {
      materialClones: new Set(materialClones.values()),
      meshStates,
    };
    return;
  }
  for (const [mesh, state] of model.cameraFadeState?.meshStates || []) {
    mesh.material = state.material;
    mesh._mt5DisableAlphaToCoverage = state.disableAlphaToCoverage;
  }
  for (const material of model.cameraFadeState?.materialClones || []) {
    material.dispose(false, false);
  }
  model.cameraFadeState = null;
}

function captureAttachedRootState(root) {
  return {
    parent: root.parent,
    position: root.position.clone(),
    rotation: root.rotation.clone(),
    rotationQuaternion: root.rotationQuaternion?.clone() || null,
    scaling: root.scaling.clone(),
    enabled: root.isEnabled(),
  };
}

function thawAttachedRoot(root) {
  for (const node of [root, ...root.getDescendants(false)]) {
    node.unfreezeWorldMatrix?.();
  }
}

function applySourceMatrixToRoot(root, parent, sourceMatrix) {
  const browserMatrix = scheduledBrowserAttachedObjectMatrix(sourceMatrix);
  if (!browserMatrix) return false;
  const matrix = BABYLON.Matrix.FromArray(browserMatrix);
  const scaling = BABYLON.Vector3.One();
  const rotation = BABYLON.Quaternion.Identity();
  const translation = BABYLON.Vector3.Zero();
  if (!matrix.decompose(scaling, rotation, translation)) return false;
  thawAttachedRoot(root);
  root.parent = parent;
  root.position.copyFrom(translation);
  root.rotation.set(0, 0, 0);
  root.rotationQuaternion = rotation;
  root.scaling.copyFrom(scaling);
  root.setEnabled(true);
  root.computeWorldMatrix(true);
  return true;
}

function captureActivityVector(vector, label) {
  const values = [vector?.x, vector?.y, vector?.z];
  if (!values.every(Number.isFinite)) {
    throw new Error(`scheduled activity actor ${label} is unavailable`);
  }
  return values;
}

function restoreActivityVector(vector, values) {
  if (typeof vector?.set === "function") vector.set(...values);
  else [vector.x, vector.y, vector.z] = values;
}

function captureActivityRoot(root) {
  const quaternion = root.rotationQuaternion
    ? [
        root.rotationQuaternion.x,
        root.rotationQuaternion.y,
        root.rotationQuaternion.z,
        root.rotationQuaternion.w,
      ]
    : null;
  if (quaternion && !quaternion.every(Number.isFinite)) {
    throw new Error("scheduled activity actor quaternion is unavailable");
  }
  return {
    enabled: root.isEnabled(),
    position: captureActivityVector(root.position, "position"),
    rotation: captureActivityVector(root.rotation, "rotation"),
    scaling: captureActivityVector(root.scaling, "scaling"),
    quaternion,
  };
}

function restoreActivityRoot(root, snapshot) {
  root.setEnabled(snapshot.enabled);
  restoreActivityVector(root.position, snapshot.position);
  restoreActivityVector(root.rotation, snapshot.rotation);
  restoreActivityVector(root.scaling, snapshot.scaling);
  if (snapshot.quaternion) {
    if (!root.rotationQuaternion) {
      throw new Error("scheduled activity actor quaternion ownership changed");
    }
    if (typeof root.rotationQuaternion.set === "function") {
      root.rotationQuaternion.set(...snapshot.quaternion);
    } else {
      [
        root.rotationQuaternion.x,
        root.rotationQuaternion.y,
        root.rotationQuaternion.z,
        root.rotationQuaternion.w,
      ] = snapshot.quaternion;
    }
  } else {
    root.rotationQuaternion = null;
  }
}

export class ScheduledActorRuntime {
  constructor({
    scene,
    state,
    fetchArrayBuffer,
    bundledCharacterAsset,
    bundledCharacterModels,
    bundledCharacterTextures,
    suppressDetachedCharacterVariants,
    getActiveWorldId,
    getGameDate = null,
    getCameraOcclusionTarget = null,
    getCameraFadeEnabled = null,
    networkState = null,
    motionRuntime = null,
    debugPickable = false,
    interactionPickable = false,
  }) {
    this.scene = scene;
    this.state = state;
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.bundledCharacterAsset = bundledCharacterAsset;
    this.bundledCharacterModels = bundledCharacterModels;
    this.bundledCharacterTextures = bundledCharacterTextures;
    this.suppressDetachedCharacterVariants =
      suppressDetachedCharacterVariants;
    this.getActiveWorldId = getActiveWorldId;
    this.getGameDate = getGameDate;
    this.getCameraOcclusionTarget = getCameraOcclusionTarget;
    this.getCameraFadeEnabled = getCameraFadeEnabled;
    this.networkState = networkState;
    this.motionRuntime = motionRuntime;
    this.debugPickable = debugPickable;
    this.interactionPickable = interactionPickable;
    this.entries = [];
    this.dialogueFacingTargets = new Map();
    this.activityActorOwners = new Map();
    this.localObjectOwners = new Map();
    this.localObjectTemplates = new Map();
    this.nativeClothStates = new Set();
    this.loadedWorldId = null;
    this.loadController = null;
    this.modelQueue = Promise.resolve();
  }

  clear() {
    this.loadController?.abort();
    for (const owner of new Set(this.activityActorOwners.values())) {
      this.endActivityActors(owner);
    }
    for (const entry of this.entries) {
      for (const model of new Set([
        entry.defaultModel,
        ...(entry.models?.values() || []),
      ])) {
        setScheduledActorCameraFade(model, false);
        setScheduledActorOcclusionCulled(model, false);
      }
      this.releaseLocalObjects(entry);
      entry.secondaryObject?.root.setEnabled(false);
    }
    for (const cloth of this.nativeClothStates) cloth.release();
    this.entries = [];
    this.dialogueFacingTargets.clear();
    this.activityActorOwners.clear();
    this.localObjectOwners.clear();
    this.localObjectTemplates.clear();
    this.nativeClothStates.clear();
    this.loadedWorldId = null;
  }

  runtimeWorldId() {
    return this.loadedWorldId || this.getActiveWorldId();
  }

  dialogueActor(actorCode, preferredInstanceId = null) {
    const normalizedActorCode = String(actorCode || "").toUpperCase();
    const matches = this.entries.filter((entry) => {
      const instanceId = entry.definition.instanceId
        || entry.definition.actorCode;
      return entry.definition.actorCode === normalizedActorCode
        && (!preferredInstanceId || instanceId === preferredInstanceId);
    });
    if (matches.length !== 1) return null;
    const entry = matches[0];
    if (!entry.defaultModel && entry.models?.size === 0) return null;
    const position = entry.root.getAbsolutePosition?.() || entry.root.position;
    if (![position?.x, position?.y, position?.z].every(Number.isFinite)) {
      return null;
    }
    return {
      actorCode: normalizedActorCode,
      instanceId: entry.definition.instanceId || normalizedActorCode,
      position: [position.x, position.y, position.z],
    };
  }

  dialogueActorModel(actorCode, preferredInstanceId = null) {
    const normalizedActorCode = String(actorCode || "").toUpperCase();
    const matches = this.entries.filter((entry) => {
      const instanceId = entry.definition.instanceId
        || entry.definition.actorCode;
      return entry.definition.actorCode === normalizedActorCode
        && (!preferredInstanceId || instanceId === preferredInstanceId);
    });
    if (matches.length !== 1) return null;
    const entry = matches[0];
    const models = [...new Set([
      entry.defaultModel,
      ...(entry.models?.values() || []),
    ])].filter(model => model?.root?.isEnabled?.() === true);
    return models.length === 1 ? models[0] : null;
  }

  activityEntries(actorCodes) {
    const normalized = Array.isArray(actorCodes)
      ? actorCodes.map(value => String(value || "").toUpperCase())
      : [];
    if (!normalized.length || normalized.includes("")
      || new Set(normalized).size !== normalized.length) {
      throw new TypeError("scheduled activity actors must be a non-empty unique list");
    }
    return normalized.map(actorCode => {
      const matches = this.entries.filter(entry => entry.definition.actorCode === actorCode);
      if (matches.length !== 1) {
        throw new Error(`scheduled activity actor ${actorCode} is not unique`);
      }
      return matches[0];
    });
  }

  async prepareActivityActors(actorCodes, { signal } = {}) {
    signal?.throwIfAborted();
    const entries = this.activityEntries(actorCodes);
    // Residents are streamed only while present in the network snapshot.
    // A script must explicitly prepare its actors before synchronous ownership
    // acquisition, even when those residents are off-map or offline. Reuse the
    // world's model cache/queue; never spawn duplicate activity-only residents.
    const results = await Promise.allSettled(entries.map(async entry => {
      signal?.throwIfAborted();
      entry.signal?.throwIfAborted();
      const hasActiveModel = [...entry.models.values()].some(model => model.root.isEnabled());
      if (!entry.defaultModel && !hasActiveModel) {
        await this.ensureEntryModel(entry, entry.definition.modelCode || null);
      }
      // The model belongs to the world, not this request. Cancelling a preview
      // leaves a successfully cached body hidden; changing worlds aborts and
      // disposes it through ensureEntryModel's existing lifetime checks.
      signal?.throwIfAborted();
      entry.signal?.throwIfAborted();
      if (!this.entries.includes(entry)) {
        throw new DOMException("Scheduled actor world changed during preparation", "AbortError");
      }
    }));
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    return true;
  }

  beginActivityActors(owner, actorCodes) {
    if (owner === null || owner === undefined) {
      throw new TypeError("scheduled activity actors require an owner");
    }
    const entries = this.activityEntries(actorCodes);
    if ([...this.activityActorOwners.values()].includes(owner)) {
      throw new Error("scheduled activity owner is already active");
    }
    const selected = entries.map((entry) => {
      const actorCode = entry.definition.actorCode;
      const instanceId = entry.definition.instanceId || actorCode;
      if (this.activityActorOwners.has(instanceId)) {
        throw new Error(`scheduled activity actor ${actorCode} is already owned`);
      }
      const models = [...new Set([
        entry.defaultModel,
        ...(entry.models?.values() || []),
      ])].filter(Boolean);
      const activeModels = models.filter(
        model => model.root?.isEnabled?.() === true,
      );
      const model = entry.definition.activityOnly
        ? entry.defaultModel
        : activeModels.length === 1
          ? activeModels[0]
          : activeModels.length === 0
            ? entry.defaultModel
            : null;
      if (
        !model
        || (entry.definition.activityOnly && activeModels.length !== 0)
      ) {
        throw new Error(
          `scheduled activity actor ${actorCode} has no unique presentation model`
          + ` (default=${entry.defaultModel?.modelCode || "none"}, loaded=${models.length}, enabled=${activeModels.length})`,
        );
      }
      return {
        actorCode,
        instanceId,
        entry,
        root: model.root,
        model,
        snapshot: captureActivityRoot(model.root),
      };
    });
    for (const actor of selected) {
      actor.entry.activityPresentation = actor;
      this.activityActorOwners.set(actor.instanceId, owner);
      actor.root.setEnabled(true);
    }
    return selected.map(({ actorCode, instanceId, root, model }) => ({
      actorCode,
      instanceId,
      root,
      model,
    }));
  }

  activityActor(owner, actorCode) {
    const normalized = String(actorCode || "").toUpperCase();
    const matches = this.entries.filter(entry => (
      entry.activityPresentation?.actorCode === normalized
      && this.activityActorOwners.get(
        entry.activityPresentation.instanceId,
      ) === owner
    ));
    if (matches.length !== 1) return null;
    const { instanceId, root, model } = matches[0].activityPresentation;
    return { actorCode: normalized, instanceId, root, model };
  }

  endActivityActors(owner) {
    const entries = this.entries.filter(entry => (
      entry.activityPresentation
      && this.activityActorOwners.get(
        entry.activityPresentation.instanceId,
      ) === owner
    ));
    if (entries.length === 0) return false;
    for (const entry of entries) {
      const activity = entry.activityPresentation;
      restoreActivityRoot(activity.root, activity.snapshot);
      this.activityActorOwners.delete(activity.instanceId);
      entry.activityPresentation = null;
      entry.motionKey = null;
      entry.motionElapsedSeconds = 0;
    }
    return true;
  }

  dialogueFacingState(instanceId) {
    const state = this.dialogueFacingTargets.get(instanceId);
    return state ? structuredClone(state) : null;
  }

  restoreDialogueFacingState(instanceId, state) {
    if (state === null) return this.dialogueFacingTargets.delete(instanceId);
    if (!state || typeof state !== "object") {
      throw new TypeError("scheduled actor facing restoration requires saved state");
    }
    this.dialogueFacingTargets.set(instanceId, structuredClone(state));
    return true;
  }

  setDialogueFacingTarget(
    instanceId,
    target,
    { activate = false, source = null } = {},
  ) {
    if (typeof instanceId !== "string" || !instanceId) {
      throw new TypeError("scheduled actor FACE target requires an instance ID");
    }
    if (
      !Array.isArray(target)
      || target.length !== 3
      || !target.every(Number.isFinite)
    ) {
      throw new TypeError(
        "scheduled actor FACE target requires three finite coordinates",
      );
    }
    const entryExists = this.entries.some(
      entry => (
        (entry.definition.instanceId || entry.definition.actorCode)
        === instanceId
      ),
    );
    if (!entryExists) return false;
    const previous = this.dialogueFacingTargets.get(instanceId);
    this.dialogueFacingTargets.set(instanceId, {
      target: [...target],
      offset: null,
      active: Boolean(activate || previous?.active),
      source: source ? { ...source } : null,
    });
    return true;
  }

  setDialogueFacingOffset(
    instanceId,
    offset,
    { activate = false, source = null } = {},
  ) {
    if (typeof instanceId !== "string" || !instanceId) {
      throw new TypeError(
        "scheduled actor facing offset requires an instance ID",
      );
    }
    if (
      !Array.isArray(offset)
      || offset.length !== 3
      || !offset.every(Number.isFinite)
    ) {
      throw new TypeError(
        "scheduled actor facing offset requires three finite coordinates",
      );
    }
    const entryExists = this.entries.some(
      entry => (
        (entry.definition.instanceId || entry.definition.actorCode)
        === instanceId
      ),
    );
    if (!entryExists) return false;
    const previous = this.dialogueFacingTargets.get(instanceId);
    this.dialogueFacingTargets.set(instanceId, {
      target: null,
      offset: [...offset],
      active: Boolean(activate || previous?.active),
      source: source ? { ...source } : null,
    });
    return true;
  }

  clearDialogueFacingTarget(instanceId) {
    return this.dialogueFacingTargets.delete(instanceId);
  }

  requiredModel(definition, worldId) {
    const authoritative = this.networkState?.stateFor(
      definition.instanceId || definition.actorCode,
    );
    // Script-owned actors must remain synchronously available to native event
    // transactions. Network residents may arrive after the initial snapshot.
    const needed = definition.activityOnly || ((definition.authoritative || definition.journeys)
      ? authoritative?.worldId === worldId
      : definition.position || definition.localLoopRoute);
    return needed ? scheduledActorModelCode(definition, authoritative) : undefined;
  }

  async prefetchModel(definition, code, signal, priority = 0) {
    if (!code) return;
    const model = definition.modelOverrides?.find(row => row.modelCode === code)
      || definition;
    await Promise.all([
      this.bundledCharacterAsset(this.bundledCharacterModels,
        `${code}.CHRM`, definition.characterAssetDirectory),
      this.bundledCharacterAsset(this.bundledCharacterTextures,
        model.textureFile || `${code.replace(/_[ML]$/, "")}_textures.bin`,
        definition.characterAssetDirectory),
    ].map(url => this.fetchArrayBuffer(url, {signal, priority})));
  }

  async prefetch(definitions, worldId, signal) {
    const jobs = definitions.map(definition => this.prefetchModel(
      definition, this.requiredModel(definition, worldId), signal,
    ));
    await Promise.all([...jobs, this.motionRuntime?.prefetch?.(definitions, signal)]);
  }

  async load(definitions, onModelLoaded, worldId = null, signal = null) {
    this.clear();
    const controller = new AbortController();
    this.loadController = controller;
    const loadSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    // WorldLoader deliberately finishes assembling the destination before
    // play.js publishes it as active. Do not consult that still-stale global
    // while selecting attachment assets or performing the initial update.
    this.loadedWorldId = worldId || this.getActiveWorldId();
    const loadedWorldId = this.loadedWorldId;
    this.networkState?.configure(definitions);
    await this.motionRuntime?.configure(definitions);
    loadSignal.throwIfAborted();
    const localObjectModels = scheduledActorLocalObjectModelRequirements(
      definitions,
      this.loadedWorldId,
    );
    const jobs = [
      ...localObjectModels.map(
        (model) => this.loadLocalObjectTemplate(model, loadSignal),
      ),
      ...definitions.map(async (definition) => {
        const placeholder = new BABYLON.TransformNode(`scheduled_${definition.instanceId || definition.actorCode}`, this.scene);
        placeholder.setEnabled(false);
        this.state.currentMeshes.push(placeholder);
        const entry = {
          definition,
          root: placeholder,
          modelRoots: new Map(),
          models: new Map(),
          defaultModel: null,
          pendingModels: new Map(),
          failedModels: new Set(),
          signal: loadSignal,
          motionKey: null,
          motionElapsedSeconds: 0,
          groundedMotionKey: null,
          attachedLocalObjects: new Map(),
          localObjectInstances: new Map(),
          visualYaw: null,
          visualYawRoot: null,
          visualYawWorldId: null,
          visualYawPosition: null,
          secondaryObject: null,
          localRouteDistance: (() => {
            const route = definition.localLoopRoute;
            const length = routeLength(route?.points || []);
            return Number.isFinite(length) && length > 0
              ? length * Math.max(0, Math.min(1, route.phase || 0))
              : 0;
          })(),
          nativeSchedulePlayback: {
            phaseIndex: null,
            active: false,
            distance: 0,
            entryPosition: null,
            position: null,
            exited: false,
            phaseElapsedSeconds: 0,
          },
        };
        this.entries.push(entry);
        const required = this.requiredModel(definition, loadedWorldId);
        // A static attachment may be visible while its owner is off-map.
        // Preserve the existing secondary-object policy independently of NPCs.
        entry.secondaryObject = await this.loadSecondaryObject(definition, loadSignal);
        entry.signal.throwIfAborted();
        if (required !== undefined) await this.ensureEntryModel(entry, required);
        onModelLoaded?.();
      }),
    ];
    try {
      await Promise.all(jobs);
    } catch (error) {
      controller.abort(error);
      // No task from the abandoned area may attach after the next area's
      // scene disposal. Drain parallel object parsers before returning.
      await Promise.allSettled(jobs);
      throw error;
    }
    loadSignal.throwIfAborted();
    this.update(0);
  }

  ensureEntryModel(entry, code) {
    if (entry.models.has(code)) return Promise.resolve(entry.models.get(code));
    if (entry.pendingModels.has(code)) return entry.pendingModels.get(code);
    const definition = code === entry.definition.modelCode || code === null
      ? {modelCode: entry.definition.modelCode || null,
          textureFile: entry.definition.textureFile || null, isDefault: true}
      : {...entry.definition.modelOverrides?.find(row => row.modelCode === code), isDefault: false};
    if (!definition.isDefault && !definition.modelCode) {
      return Promise.reject(new Error(`Unknown model variant ${code} for ${entry.definition.actorCode}`));
    }
    // New snapshots can introduce many residents together. Start their reads
    // immediately through the bounded asset queue; serialize only scene/GPU
    // assembly, not an entire download-then-build waterfall per resident.
    const source = this.prefetchModel(entry.definition, code, entry.signal, 1)
      .then(() => null, error => error);
    const pending = this.modelQueue.then(async () => {
      // Even cached assets must not rebuild every NPC in one microtask burst.
      await new Promise(resolve => setTimeout(resolve, 0));
      entry.signal.throwIfAborted();
      const error = await source;
      if (error) throw error;
      entry.signal.throwIfAborted();
      return this.loadModel(entry.definition, definition, entry.signal);
    }).then(model => {
      if (entry.signal.aborted) {
        clearWorldSceneAssets({currentMeshes: [model.root]});
        this.state.currentMeshes = this.state.currentMeshes.filter(root => root !== model.root);
      }
      entry.signal.throwIfAborted();
      entry.models.set(code, model);
      entry.modelRoots.set(code, model.root);
      if (model.isDefault) entry.defaultModel = model;
      // Keep dialogue's position tied to the selected visible variant even if
      // the default body was never needed in this visit.
      entry.root = model.root;
      return model;
    }).finally(() => entry.pendingModels.delete(code));
    this.modelQueue = pending.catch(() => {});
    entry.pendingModels.set(code, pending);
    return pending;
  }

  requestEntryModel(entry, code) {
    if (entry.signal?.aborted || entry.failedModels?.has(code) || entry.pendingModels.has(code)) return;
    void this.ensureEntryModel(entry, code).catch(error => {
      if (entry.signal.aborted) return;
      entry.failedModels.add(code);
      console.error(`Scheduled actor ${entry.definition.actorCode}: failed to load ${code || entry.definition.model}`, error);
    });
  }

  async loadLocalObjectTemplate(model, signal) {
    if (!model || this.localObjectTemplates.has(model)) {
      return this.localObjectTemplates.get(model) || null;
    }
    const pending = (async () => {
      const [response, texturePack] = await Promise.all([
        fetchAsset(model),
        getTexturePack(model),
      ]);
      const loader = new Mt5Loader(this.scene, {
        backFaceCulling: false,
      });
      configureMt5TexturePack(loader, texturePack);
      signal?.throwIfAborted();
      const loadedRoots = await loader.load(
        await response.arrayBuffer(),
        texturePack,
      );
      if (signal?.aborted) {
        clearWorldSceneAssets({currentMeshes: loadedRoots});
        signal.throwIfAborted();
      }
      if (!loadedRoots.length) {
        throw new Error(
          `${model} did not produce a scheduled local-object model.`,
        );
      }
      const template = new BABYLON.TransformNode(
        `scheduled_local_object_template_${model}`,
        this.scene,
      );
      template._filename = model;
      for (const root of loadedRoots) {
        root.parent = template;
      }
      for (const node of template.getDescendants(false)) {
        node.isPickable = false;
        node.checkCollisions = false;
      }
      template.setEnabled(false);
      this.state.currentMeshes.push(template);
      return template;
    })();
    this.localObjectTemplates.set(model, pending);
    try {
      const template = await pending;
      this.localObjectTemplates.set(model, template);
      return template;
    } catch (error) {
      signal?.throwIfAborted();
      this.localObjectTemplates.delete(model);
      console.warn(
        `Could not load scheduled local object ${model}:`,
        error,
      );
      return null;
    }
  }

  localObjectInstance(entry, registration) {
    const model = scheduledActorLocalObjectModel(
      registration,
      this.runtimeWorldId(),
    );
    if (!model) return null;
    const template = this.localObjectTemplates.get(model);
    if (!template || typeof template.then === "function") return null;
    const instanceKey = `${registration.objectCode}:${model}`;
    let root = entry.localObjectInstances.get(instanceKey);
    if (root) return root;
    root = template.clone(
      `scheduled_${entry.definition.actorCode}`
      + `_${registration.objectCode}_${registration.locationCode}`,
      null,
      false,
    );
    if (!root) return null;
    root._filename = model;
    root.metadata = {
      ...(root.metadata || {}),
      scheduledActorLocalObject: registration.objectCode,
      scheduledActorLocalObjectLocation: registration.locationCode,
      scheduledActorInstanceId: (
        entry.definition.instanceId
        || entry.definition.actorCode
      ),
    };
    for (const node of root.getDescendants(false)) {
      node.isPickable = false;
      node.checkCollisions = false;
      node.metadata = {
        ...(node.metadata || {}),
        ...root.metadata,
      };
    }
    root.setEnabled(false);
    this.state.currentMeshes.push(root);
    entry.localObjectInstances.set(instanceKey, root);
    return root;
  }

  placedLocalObject(registration) {
    const expectedModel = scheduledActorLocalObjectModel(
      registration,
      this.runtimeWorldId(),
    )?.toUpperCase();
    return this.state.currentMeshes.find((root) => {
      const placement = root._runtimePlacementRecord;
      if (
        placement?.runtime?.objectTag !== registration.locationCode
        || !root._runtimePlacement
      ) {
        return false;
      }
      return (
        !expectedModel
        || root._filename?.toUpperCase() === expectedModel
        || placement.model?.toUpperCase() === expectedModel
      );
    }) || null;
  }

  releaseLocalObject(entry, objectCode) {
    const attachment = entry.attachedLocalObjects?.get(objectCode);
    if (!attachment) return;
    const { root, previous, managed } = attachment;
    thawAttachedRoot(root);
    if (managed) {
      root.parent = null;
      root.setEnabled(false);
    } else {
      root.parent = previous.parent;
      root.position.copyFrom(previous.position);
      root.rotation.copyFrom(previous.rotation);
      root.rotationQuaternion = previous.rotationQuaternion?.clone() || null;
      root.scaling.copyFrom(previous.scaling);
      root.setEnabled(previous.enabled);
      root.computeWorldMatrix(true);
    }
    if (this.localObjectOwners.get(root) === entry) {
      this.localObjectOwners.delete(root);
    }
    entry.attachedLocalObjects.delete(objectCode);
  }

  releaseLocalObjects(entry) {
    for (const objectCode of [
      ...(entry.attachedLocalObjects?.keys() || []),
    ]) {
      this.releaseLocalObject(entry, objectCode);
    }
  }

  updateLocalObjects(entry, actorRoot, model, routeState) {
    const registrations = new Map(
      (routeState?.localObjects || []).map(
        (registration) => [registration.objectCode, registration],
      ),
    );
    for (const objectCode of [
      ...(entry.attachedLocalObjects?.keys() || []),
    ]) {
      if (!registrations.has(objectCode)) {
        this.releaseLocalObject(entry, objectCode);
      }
    }
    for (const [objectCode, registration] of registrations) {
      const resolvedModel = scheduledActorLocalObjectModel(
        registration,
        this.runtimeWorldId(),
      );
      const currentAttachment = entry.attachedLocalObjects.get(objectCode);
      if (
        currentAttachment
        && (
          currentAttachment.locationCode !== registration.locationCode
          || currentAttachment.model !== resolvedModel
        )
      ) {
        this.releaseLocalObject(entry, objectCode);
      }
      const target = scheduledLocalObjectPlacementTarget(
        registration.placementMode,
      );
      const route = scheduledLocalObjectControllerRoute(
        target,
        model?.latestControllerFamily,
        model?.latestControllerRenderMatrixByKey,
      );
      const actorParentMatrix = scheduledLocalObjectActorParentMatrix(target);
      const parentMatrix = actorParentMatrix || (route
        ? (
            (
              route.renderKey !== null
              && model?.latestRetargetedRoutes?.get(route.renderKey)
            )
            || model?.latestControllerMatrices?.[
              route.controllerMatrixIndex
            ]
          )
        : null);
      const sourceMatrix = parentMatrix
        ? scheduledAttachedObjectMatrix(parentMatrix, registration)
        : null;
      if (!sourceMatrix) {
        this.releaseLocalObject(entry, objectCode);
        continue;
      }
      let attachment = entry.attachedLocalObjects.get(objectCode);
      if (!attachment) {
        const managedRoot = this.localObjectInstance(entry, registration);
        const root = managedRoot || this.placedLocalObject(registration);
        const owner = root && this.localObjectOwners.get(root);
        if (!root || (owner && owner !== entry)) continue;
        attachment = {
          root,
          previous: managedRoot
            ? null
            : captureAttachedRootState(root),
          managed: Boolean(managedRoot),
          locationCode: registration.locationCode,
          model: resolvedModel,
        };
        entry.attachedLocalObjects.set(objectCode, attachment);
        this.localObjectOwners.set(root, entry);
      }
      applySourceMatrixToRoot(
        attachment.root,
        actorRoot,
        sourceMatrix,
      );
    }
  }

  async loadSecondaryObject(definition, signal) {
    const secondaryDefinition =
      scheduledActorSecondaryObjectDefinition(definition);
    if (!secondaryDefinition) return null;
    const {
      kind,
      model: modelFilename,
      objectCode,
    } = secondaryDefinition;
    const [response, texturePack] = await Promise.all([
      fetchAsset(modelFilename),
      getTexturePack(modelFilename),
    ]);
    const loader = new Mt5Loader(this.scene, { backFaceCulling: false });
    signal?.throwIfAborted();
    configureMt5TexturePack(loader, texturePack);
    const [root] = await loader.load(
      await response.arrayBuffer(),
      texturePack,
    );
    if (signal?.aborted) {
      if (root) clearWorldSceneAssets({currentMeshes: [root]});
      signal.throwIfAborted();
    }
    if (!root) {
      throw new Error(
        `${modelFilename} did not produce scheduled object ${objectCode}.`,
      );
    }
    root.name = `scheduled_${definition.actorCode}_${objectCode}`;
    root._filename = modelFilename;
    root.rotationQuaternion = null;
    root.rotation.setAll(0);
    root.setEnabled(false);
    for (const node of [root, ...root.getDescendants(false)]) {
      node.isPickable = false;
      node.checkCollisions = false;
      node.metadata = {
        ...(node.metadata || {}),
        scheduledActorSecondaryObject: objectCode,
        scheduledActorInstanceId:
          definition.instanceId || definition.actorCode,
      };
    }
    const rig = kind === "forklift" ? new ForkliftRig(root) : null;
    const state = kind === "forklift" ? createForkliftState() : null;
    rig?.apply(state);
    this.state.currentMeshes.push(root);
    return {
      kind,
      objectCode,
      root,
      rig,
      state,
      previousPosition: null,
      previousYaw: null,
    };
  }

  updateSecondaryObject(entry, actorRoot, model, routeState) {
    const secondary = entry.secondaryObject;
    const objectCode = routeState?.secondaryObjectCode;
    const forkliftActive = Boolean(
      secondary
      && secondary.kind === "forklift"
      && objectCode?.startsWith("FK0"),
    );
    const staticAttachment = routeState?.secondaryAttachments?.find(
      (attachment) => (
        attachment.objectCode === secondary?.objectCode
        && entry.definition.areaWorlds?.[attachment.area]
          === this.runtimeWorldId()
      ),
    );
    const staticActive = Boolean(
      secondary
      && secondary.kind === "static-attachment"
      && staticAttachment,
    );
    const active = forkliftActive || staticActive;
    for (const candidate of entry.models?.values() || []) {
      candidate.renderRoot.position.copyFrom(
        candidate.standingRenderPosition,
      );
    }
    actorRoot.metadata.scheduledActorSecondaryObjectActive =
      forkliftActive;
    if (!secondary) return false;
    secondary.root.setEnabled(active);
    if (!active) {
      secondary.previousPosition = null;
      secondary.previousYaw = null;
      return false;
    }

    if (staticActive) {
      secondary.root.parent = null;
      secondary.root.position.set(...staticAttachment.position);
      secondary.root.rotationQuaternion = null;
      secondary.root.rotation.set(0, staticAttachment.rootYaw, 0);
      return false;
    }

    secondary.objectCode = objectCode;
    secondary.root.parent = actorRoot;
    secondary.root.position.setAll(0);
    secondary.root.rotationQuaternion = null;
    // Secondary-route actor yaw already includes the MT5 half-turn used by
    // ordinary scheduled character roots. Adding the fleet's standalone
    // model half-turn here a second time makes the forklift face opposite its
    // authored path.
    secondary.root.rotation.setAll(0);
    // Dreamcast attachment captures show the actor and FK0 object sharing the
    // exact same world position and facing. The native ride sequence carries
    // vertical seating through its root translation. Its horizontal root
    // channels are exactly zero, so express the measured vehicle-seat offset
    // in this unrotated scheduled-object frame.
    model.renderRoot.position.copyFrom(model.standingRenderPosition);
    model.renderRoot.position.addInPlace(
      scheduledForkliftDriverHorizontalOffset(),
    );
    // The selected CHRM remains the visible driver while its secondary object
    // is active. This is explicit because model-override schedules normally
    // toggle entire render roots as phases change.
    model.renderRoot.setEnabled?.(true);

    if (secondary.previousPosition) {
      const distance = Math.hypot(
        routeState.position[0] - secondary.previousPosition[0],
        routeState.position[2] - secondary.previousPosition[2],
      );
      secondary.state.wheelRoll -= distance / 0.615;
      if (Number.isFinite(secondary.previousYaw)) {
        const yawDelta = Math.atan2(
          Math.sin(routeState.rootYaw - secondary.previousYaw),
          Math.cos(routeState.rootYaw - secondary.previousYaw),
        );
        secondary.state.steeringAngle = Math.max(
          -0.55,
          Math.min(0.55, yawDelta * 2),
        );
      }
    }
    secondary.previousPosition = [...routeState.position];
    secondary.previousYaw = routeState.rootYaw;
    secondary.rig.apply(secondary.state);
    return true;
  }

  async loadModel(definition, modelDefinition, signal = null) {
    const isHumansActor = Boolean(modelDefinition.modelCode);
    const isMt7Character = definition.characterAssetFormat === "MT7";
    const modelUrl = isHumansActor
      ? this.bundledCharacterAsset(
        this.bundledCharacterModels,
        `${modelDefinition.modelCode}.CHRM`,
        definition.characterAssetDirectory,
      )
      : null;
    const texturePackUrl = isHumansActor
      ? this.bundledCharacterAsset(
        this.bundledCharacterTextures,
        modelDefinition.textureFile
          || (
            `${modelDefinition.modelCode.replace(/_[ML]$/, "")}`
            + "_textures.bin"
          ),
        definition.characterAssetDirectory,
      )
      : null;
    const [modelBuffer, texturePack] = await Promise.all([
      modelUrl
        ? this.fetchArrayBuffer(modelUrl, {signal, priority: 1})
        : fetchAsset(definition.model).then(
          (response) => response.arrayBuffer(),
        ),
      texturePackUrl
        ? this.fetchArrayBuffer(texturePackUrl, {signal, priority: 1})
        : getTexturePack(definition.model),
    ]);
    signal?.throwIfAborted();
    let loader;
    let renderRoot;
    if (isHumansActor) {
      ({ loader, renderRoot } = await loadNativeCharacterModel({
        scene: this.scene,
        modelBuffer,
        texturePack,
        sourceFilename: `${modelDefinition.modelCode}.CHRM`,
        assetFormat: isMt7Character ? "MT7" : "MT5",
      }));
    } else {
      loader = new Mt5Loader(this.scene, {
      // Several non-CLTH HUMANS meshes rely on both sides of their polygons.
      // Keep the broad loader mode here; native cloth preparation below
      // isolates each exterior/lining pair and restores its authored culling.
      backFaceCulling: false,
      mirrorCharacterX: isHumansActor,
      nativeTwiddledRectUV: isHumansActor,
      textureAddressMode: isHumansActor ? "clamp" : "repeat",
      characterRigMode: isHumansActor ? "gpu" : null,
      characterRigSeamMode: isHumansActor ? "weld" : null,
      materialSideOrientation: null,
      });
      configureMt5TexturePack(loader, texturePack);
      [renderRoot] = await loader.load(modelBuffer, texturePack, {
        sourceFilename: definition.model,
      });
    }
    if (!renderRoot) {
      throw new Error(
        `Scheduled actor ${definition.actorCode} did not produce `
        + `${modelDefinition.modelCode || definition.model}.`,
      );
    }
    if (signal?.aborted) {
      clearWorldSceneAssets({currentMeshes: [renderRoot]});
      signal.throwIfAborted();
    }
    const scaleCorrection = isHumansActor
      ? (
          scheduledActorModelScaleCorrection(modelDefinition.modelCode)
          * (definition.characterScale || 1)
        )
      : 1;
    const groundOffset = isHumansActor
      ? scheduledActorGroundOffset(renderRoot) * scaleCorrection
      : 0;
    // Pose baking resets the model root before rewriting its vertices. Keep
    // schedule placement on a separate parent so animation cannot move an NPC
    // back to the map origin or discard a character scale correction.
    const root = new BABYLON.TransformNode(
      `scheduled_${definition.instanceId || definition.actorCode}`
      + (modelDefinition.isDefault ? "" : `_${modelDefinition.modelCode}`),
      this.scene,
    );
    renderRoot.parent = root;
    root.scaling.setAll(scaleCorrection);
    root._filename = definition.model || `${modelDefinition.modelCode}.CHRM`;
    root.metadata = {
      ...(root.metadata || {}),
      scheduledActor: definition.actorCode,
      scheduledActorLabel: definition.label || definition.actorCode,
      scheduledActorInstanceId: (
        definition.instanceId
        || definition.actorCode
      ),
      scheduledActorModelCode: modelDefinition.modelCode,
      scheduledActorGroundOffset: groundOffset,
    };
    for (const node of root.getDescendants(false)) {
      node.metadata = {
        ...(node.metadata || {}),
        cameraBlocker: false,
        scheduledActor: root.metadata.scheduledActor,
        scheduledActorLabel: root.metadata.scheduledActorLabel,
        scheduledActorInstanceId: root.metadata.scheduledActorInstanceId,
        scheduledActorModelCode: root.metadata.scheduledActorModelCode,
      };
      node.isPickable = this.debugPickable;
      node.checkCollisions = false;
    }
    const debugSelectionProxy = (
      this.debugPickable || this.interactionPickable
    )
      ? createScheduledActorDebugSelectionProxy(
          this.scene,
          root,
          renderRoot,
          scaleCorrection,
        )
      : null;
    const occlusionMesh = createScheduledActorOcclusionProxy(
      this.scene,
      root,
      renderRoot,
      scaleCorrection,
    );
    root.setEnabled(false);
    this.state.currentMeshes.push(root);
    const renderMeshes = scheduledActorRenderableMeshes(renderRoot);
    return {
      ...modelDefinition,
      actorCode: definition.actorCode,
      logicalCharacterIndex:
        definition.shenmue2NativeEvidence?.logicalCharacterIndex ?? null,
      motionFamilyIndex:
        definition.shenmue2NativeEvidence?.motionFamilyIndex ?? null,
      actorProfile:
        definition.shenmue2NativeEvidence?.actorProfile ?? null,
      explicitPoseMotion:
        definition.shenmue2NativeEvidence?.explicitPoseMotion ?? null,
      // The bundled default CHRM is the native HIMG model-variant zero. Future
      // schedule-driven model overrides must carry their own exact index.
      modelVariantIndex: 0,
      loader,
      root,
      renderRoot,
      standingRenderPosition: renderRoot.position.clone(),
      localRetargetProfile: null,
      renderMeshes,
      occlusionMesh,
      debugSelectionProxy,
      skeletalAnimation: true,
      characterAssetFormat: definition.characterAssetFormat || "MT5",
      animatedScale: isMt7Character ? scaleCorrection : 1,
      motionTranslationScale: isMt7Character && scaleCorrection > 0
        ? 1 / scaleCorrection
        : 1,
      mt7MotionNodes: isMt7Character
        ? scheduledMt7HumanoidMotionNodes(renderRoot)
        : null,
    };
  }

  update(deltaSeconds) {
    const camera = this.scene?.activeCamera;
    const cameraPosition = camera?.globalPosition || camera?.position || null;
    const cameraOcclusionTarget = this.getCameraOcclusionTarget?.() || null;
    const cameraFadeEnabled = this.getCameraFadeEnabled?.() !== false;
    const frustumPlanes = camera
      ? BABYLON.Frustum.GetPlanes(camera.getTransformationMatrix())
      : null;
    for (const entry of this.entries) {
      this.updateEntry(
        entry,
        deltaSeconds,
        frustumPlanes,
      );
      for (const model of new Set([
        entry.defaultModel,
        ...(entry.models?.values() || []),
      ])) {
        setScheduledActorCameraFade(
          model,
          cameraFadeEnabled && scheduledActorModelBlocksCamera(
            model,
            cameraOcclusionTarget,
            cameraPosition,
          ),
        );
      }
    }
  }

  updateEntry(
    entry,
    deltaSeconds,
    frustumPlanes = null,
  ) {
    if (entry.activityPresentation) return;
    const { definition } = entry;
    const authoritativeState = this.networkState?.stateFor(
      definition.instanceId || definition.actorCode,
    );
    if (definition.localLoopRoute) {
      entry.localRouteDistance += Math.max(0, deltaSeconds)
        * Math.max(0, definition.localLoopRoute.speed || 0);
    }
    const gameDate = this.getGameDate?.();
    const gameSecond = gameDate instanceof Date && !Number.isNaN(gameDate.valueOf())
      ? gameDate.getUTCHours() * 3600
        + gameDate.getUTCMinutes() * 60
        + gameDate.getUTCSeconds()
      : null;
    // Shenmue's world clock advances much faster than wall time. Native clock
    // fields gate when an actor program is active; they are not a movement
    // clock. Using seconds-since-midnight as route distance made S2 actors
    // travel roughly 15 times faster than their authored walking speed.
    const localRouteDistance = entry.localRouteDistance;
    const localRouteState = definition.nativeSchedule
      ? scheduledActorNativeScheduleRouteState(
          definition,
          entry.nativeSchedulePlayback,
          deltaSeconds,
          gameSecond,
        )
      : scheduledActorLocalLoopRouteState(
          definition,
          localRouteDistance,
          gameSecond,
        );
    const routeState = authoritativeState
      ? {
          ...(authoritativeState.visual || {}),
          actorCode: definition.actorCode,
          worldId: authoritativeState.worldId,
          position: [
            authoritativeState.x,
            authoritativeState.y,
            authoritativeState.z,
          ],
          rootYaw: authoritativeState.yaw,
          operation: authoritativeState.operation,
          moving: authoritativeState.mode === "walking",
          movementMode: authoritativeState.movementMode,
          movementElapsedRealSeconds:
            authoritativeState.movementElapsedRealSeconds,
          motionStateId: authoritativeState.motionStateId ?? null,
          modelOverrideCode:
            authoritativeState.modelOverrideCode || null,
          routeId: authoritativeState.routeId,
          routeDistance: authoritativeState.routeDistance,
          routeLength: authoritativeState.routeLength,
          blockedBy: authoritativeState.blockedBy || null,
          authoritativeRevision: authoritativeState.revision,
        }
      : localRouteState;
    const actorActive = definition.activityOnly
      ? false
      : (definition.authoritative || definition.journeys)
      ? Boolean(
          authoritativeState
          && routeState?.worldId === this.runtimeWorldId()
        )
      : definition.localLoopRoute
        ? Boolean(localRouteState)
        : Boolean(definition.position);
    const secondaryAttachmentActive = Boolean(
      entry.secondaryObject?.kind === "static-attachment"
      && routeState?.secondaryAttachments?.some(
        (attachment) => (
          attachment.objectCode === entry.secondaryObject.objectCode
          && definition.areaWorlds?.[attachment.area]
            === this.runtimeWorldId()
        ),
      ),
    );
    const selectedCode = scheduledActorModelCode(definition, routeState);
    if ((actorActive || secondaryAttachmentActive) && entry.pendingModels && !entry.models.has(selectedCode)) {
      this.requestEntryModel(entry, selectedCode);
      for (const candidate of entry.modelRoots.values()) candidate.setEnabled(false);
      return;
    }
    const root = (
      entry.modelRoots.get(scheduledActorModelCode(definition, routeState))
      || entry.root
    );
    if (actorActive) entry.root = root;
    if (actorActive && entry.signal && !entry.variantsPrefetched) {
      entry.variantsPrefetched = true;
      // Only residents actually seen in this visit warm their other authored
      // bodies. This downloads bytes at low priority; it does not build hidden
      // meshes, animate off-map residents, or hold the loading screen open.
      void Promise.all((definition.modelOverrides || [])
        .map(row => row.modelCode)
        .concat(definition.modelCode || [])
        .filter(code => code !== selectedCode)
        .map(code => this.prefetchModel(definition, code, entry.signal, -1)))
        .catch(error => {
          if (!entry.signal.aborted) console.warn(`NPC variant prefetch failed: ${definition.actorCode}`, error);
        });
    }
    for (const candidate of new Set([
      entry.root,
      ...entry.modelRoots.values(),
    ])) {
      candidate.setEnabled(actorActive && candidate === root);
    }
    if (!actorActive && !secondaryAttachmentActive) {
      this.releaseLocalObjects(entry);
      entry.secondaryObject?.root.setEnabled(false);
      if (entry.secondaryObject) {
        entry.secondaryObject.previousPosition = null;
        entry.secondaryObject.previousYaw = null;
      }
      entry.visualYaw = null;
      entry.visualYawRoot = null;
      entry.visualYawWorldId = null;
      entry.visualYawPosition = null;
      return;
    }

    const model = entry.models?.get(
      scheduledActorModelCode(definition, routeState),
    ) || entry.defaultModel;
    const secondaryObjectActive = this.updateSecondaryObject(
      entry,
      root,
      model,
      routeState,
    );
    if (!actorActive) {
      this.releaseLocalObjects(entry);
      entry.visualYaw = null;
      entry.visualYawRoot = null;
      entry.visualYawWorldId = null;
      entry.visualYawPosition = null;
      return;
    }
    if (routeState) {
      placeScheduledActor(root, routeState.position);
      const targetYaw = routeState.rootYaw
        ?? (
          Number.isFinite(routeState.yaw)
            ? routeState.yaw + Math.PI
            : 0
        );
      const worldId = routeState.worldId ?? this.runtimeWorldId();
      const continuous = (
        entry.visualYawRoot === root
        && entry.visualYawWorldId === worldId
        && scheduledActorTurnIsContinuous(
          entry.visualYawPosition,
          routeState.position,
          deltaSeconds,
        )
      );
      entry.visualYaw = continuous
        ? scheduledActorInterpolatedYaw(
          entry.visualYaw,
          targetYaw,
          deltaSeconds,
        )
        : targetYaw;
      root.rotation.set(0, entry.visualYaw, 0);
      entry.visualYawRoot = root;
      entry.visualYawWorldId = worldId;
      entry.visualYawPosition = [...routeState.position];
    } else {
      placeScheduledActor(root, definition.position);
      root.rotation.set(
        ...(definition.rotationDegrees || [0, 0, 0]).map(
          BABYLON.Tools.ToRadians,
        ),
      );
      entry.visualYaw = null;
      entry.visualYawRoot = null;
      entry.visualYawWorldId = null;
      entry.visualYawPosition = null;
    }
    const instanceId = definition.instanceId || definition.actorCode;
    const dialogueFacing = this.dialogueFacingTargets.get(instanceId);
    if (dialogueFacing?.active) {
      const dialogueTarget = dialogueFacing.offset
        ? [
            root.position.x + dialogueFacing.offset[0],
            root.position.y + dialogueFacing.offset[1],
            root.position.z + dialogueFacing.offset[2],
          ]
        : dialogueFacing.target;
      const dialogueYaw = scheduledActorFacingYaw(
        [root.position.x, root.position.y, root.position.z],
        dialogueTarget,
      );
      if (dialogueYaw !== null) {
        root.rotation.set(0, dialogueYaw, 0);
        entry.visualYaw = dialogueYaw;
      }
    }
    const motion = model?.characterAssetFormat === "MT7"
      ? scheduledActorShenmue2MotionSelection(model, routeState)
      : scheduledActorMotionSelection(routeState);
    const modelCode = scheduledActorModelCode(definition, routeState);
    const motionKey = motion
      ? `${modelCode || "default"}:${motion.bank}:${motion.name}:${motion.playbackRate || 1}`
      : null;
    if (motionKey !== entry.motionKey) {
      entry.motionKey = motionKey;
      entry.motionElapsedSeconds = 0;
    } else {
      entry.motionElapsedSeconds += Math.max(0, deltaSeconds);
    }
    const inFrustum = scheduledActorModelIsInFrustum(model, frustumPlanes);
    const occluded = scheduledActorModelIsOccluded(model);
    setScheduledActorOcclusionCulled(
      model,
      !inFrustum || occluded,
    );
    const applied = inFrustum && !occluded
      ? this.motionRuntime?.apply(
        model,
        routeState,
        entry.motionElapsedSeconds,
      )
      : false;
    if (applied) applyScheduledActorAnimatedScale(model);
    const animatedBounds = applied
      ? model?.renderRoot?._mt5CharacterGpuRig?.bounds
      : null;
    if (animatedBounds && model?.debugSelectionProxy) {
      updateScheduledActorDebugSelectionProxy(
        model.debugSelectionProxy,
        animatedBounds,
        root.scaling.x,
      );
    }
    if (animatedBounds && model?.occlusionMesh) {
      updateScheduledActorDebugSelectionProxy(
        model.occlusionMesh,
        animatedBounds,
        root.scaling.x,
      );
    }
    if (
      applied
      && !secondaryObjectActive
      && entry.groundedMotionKey !== motionKey
    ) {
      // The native pose and the static CHRM bind can have different vertical
      // baselines. Calibrate once after the first successfully applied pose;
      // doing this every frame would erase authored body motion and add
      // unnecessary bounding work.
      root.computeWorldMatrix(true);
      const gpuPoseMinimumY = animatedBounds?.minimum?.[1] ?? Infinity;
      const minimumY = Number.isFinite(gpuPoseMinimumY)
        ? root.position.y + gpuPoseMinimumY * root.scaling.y
        : scheduledActorMinimumWorldY(root, {
          refresh: false,
        });
      if (Number.isFinite(minimumY)) {
        const correction = routeState.position[1] + 0.003 - minimumY;
        root.metadata.scheduledActorGroundOffset += correction;
        root.position.y += correction;
        root.computeWorldMatrix(true);
      }
      entry.groundedMotionKey = motionKey;
    }
    this.updateLocalObjects(entry, root, model, routeState);
    root.computeWorldMatrix(true);
    if (
      inFrustum
      && !occluded
      && model?.characterAssetFormat !== "MT7"
      && model?.loader
      && model?.renderRoot
    ) {
      const cloth = nativeClothStateForModel(model);
      if (cloth.active) {
        cloth.update(deltaSeconds);
        this.nativeClothStates.add(cloth);
      }
    }
  }
}

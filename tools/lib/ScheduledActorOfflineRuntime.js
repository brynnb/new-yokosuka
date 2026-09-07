import { GAME_DAY_MS } from "../../src/WorldTime.js";
import {
  resolveScheduledActorMotionState,
  scheduledActorInteractionMotionCandidates,
} from "../../src/ScheduledActorMotionRegistry.js";
import {
  routeLength,
  sampleRoute,
} from "../../src/RouteSampling.js";
import {
  scheduledActorModelCode,
} from "../../src/ScheduledActorPresentation.js";
import motionManifest from "../../play/data/scheduled-actor-motions.json" with {
  type: "json",
};

export {
  routeLength,
  sampleRoute,
  scheduledActorModelCode,
};

export const SECONDARY_ROUTE_POSITIVE_CONTROL_SCALE =
  0.009259258396923542;
export const SECONDARY_ROUTE_FORKLIFT_NEGATIVE_TWENTY_STEP =
  0.18518516421318054;
export const SECONDARY_ROUTE_SNAP_DISTANCE = 10;

export function stepSecondaryRoute(
  points,
  position,
  targetIndex,
  step,
) {
  if (
    !Array.isArray(points)
    || points.length === 0
    || !Array.isArray(position)
    || position.length !== 3
    || !position.every(Number.isFinite)
    || !Number.isInteger(targetIndex)
    || targetIndex < 0
    || !Number.isFinite(step)
    || step <= 0
  ) return null;

  let nextTargetIndex = targetIndex;
  while (nextTargetIndex < points.length) {
    const target = points[nextTargetIndex];
    if (
      !Array.isArray(target)
      || target.length !== 3
      || !target.every(Number.isFinite)
    ) return null;
    const delta = target.map((value, axis) => value - position[axis]);
    const distance = Math.hypot(...delta);
    if (distance > step) {
      return {
        position: position.map(
          (value, axis) => value + delta[axis] * step / distance,
        ),
        targetIndex: nextTargetIndex,
        completed: false,
      };
    }
    nextTargetIndex += 1;
  }

  return {
    position: [...points.at(-1)],
    targetIndex: nextTargetIndex,
    completed: true,
  };
}

export function initializeSecondaryRoute(
  points,
  currentPosition = null,
) {
  if (
    !Array.isArray(points)
    || points.length === 0
    || !points.every(
      (point) => (
        Array.isArray(point)
        && point.length === 3
        && point.every(Number.isFinite)
      ),
    )
  ) return null;

  const hasCurrentPosition = (
    Array.isArray(currentPosition)
    && currentPosition.length === 3
    && currentPosition.every(Number.isFinite)
  );
  const first = points[0];
  const firstDistanceSquared = hasCurrentPosition
    ? (
      (currentPosition[0] - first[0]) ** 2
      + (currentPosition[2] - first[2]) ** 2
    )
    : Infinity;
  const snapsToFirst = (
    firstDistanceSquared > SECONDARY_ROUTE_SNAP_DISTANCE ** 2
  );
  const position = snapsToFirst ? [...first] : [...currentPosition];
  const targetIndex = snapsToFirst && points.length > 1 ? 1 : 0;
  const target = points[targetIndex] || first;
  return {
    position,
    targetIndex,
    snapsToFirst,
    rootYaw: Math.atan2(
      target[0] - position[0],
      target[2] - position[2],
    ) + Math.PI,
  };
}

export function secondaryRoutePathStep(operation) {
  if (
    Number.isFinite(operation?.resolvedPathStepPerUpdate)
    && operation.resolvedPathStepPerUpdate > 0
  ) {
    return Math.fround(operation.resolvedPathStepPerUpdate);
  }
  if (
    Number.isFinite(operation?.pathControlFloat)
    && operation.pathControlFloat > 0
  ) {
    return Math.fround(
      Math.fround(operation.pathControlFloat)
      * Math.fround(SECONDARY_ROUTE_POSITIVE_CONTROL_SCALE),
    );
  }
  if (
    operation?.pathControlFloat === -20
    && operation?.secondaryObjectCode?.startsWith("FK0")
  ) {
    return SECONDARY_ROUTE_FORKLIFT_NEGATIVE_TWENTY_STEP;
  }
  return null;
}

function activeSecondaryRouteJourney(definition, gameDate) {
  if (!definition?.journeys?.length || !(gameDate instanceof Date)) {
    return null;
  }
  const nowSecond = secondsSinceMidnight(gameDate);
  const journey = [...definition.journeys]
    .reverse()
    .find((candidate) => candidate.startSecond <= nowSecond);
  if (!journey) return null;
  const routeOperations = journey.operations?.filter(
    (operation) => (
      operation.operation === 0x1c
      && operation.secondaryRoute?.points?.length
      && Number.isFinite(secondaryRoutePathStep(operation))
    ),
  ) || [];
  return routeOperations.length > 0 ? { journey, routeOperations } : null;
}

export function createSecondaryRouteController(
  definition,
  gameDate,
  areaWorlds,
) {
  const active = activeSecondaryRouteJourney(definition, gameDate);
  if (!active) return null;
  const { journey, routeOperations } = active;
  const firstOperation = routeOperations[0];
  const initialized = initializeSecondaryRoute(
    firstOperation.secondaryRoute.points,
  );
  if (!initialized) return null;
  const area = journey.operations
    .filter((operation) => operation.operation === 8)
    .at(-1)?.area
    || journey.areas?.[0]
    || definition.defaultArea
    || null;
  if (!area) return null;
  return {
    actorCode: definition.actorCode,
    area,
    worldId: areaWorlds?.[area] || null,
    journeyStartSecond: journey.startSecond,
    routeOperations,
    routeIndex: 0,
    position: initialized.position,
    targetIndex: initialized.targetIndex,
    rootYaw: initialized.rootYaw,
    secondaryObjectCode: firstOperation.secondaryObjectCode,
    motionStateId: firstOperation.secondaryControlWord ?? null,
    motionBank: resolveScheduledActorMotionState(
      firstOperation.secondaryControlWord,
    )?.bank ?? null,
    moving: true,
    transitionUpdatesRemaining: 0,
    updateCount: 0,
  };
}

export function advanceSecondaryRouteController(
  controller,
  updateCount = 1,
) {
  if (
    !controller
    || !Array.isArray(controller.routeOperations)
    || controller.routeOperations.length === 0
    || !Number.isInteger(updateCount)
    || updateCount < 0
  ) return null;

  const next = {
    ...controller,
    position: [...controller.position],
  };
  for (let update = 0; update < updateCount; update++) {
    next.updateCount += 1;
    if (next.transitionUpdatesRemaining > 0) {
      next.transitionUpdatesRemaining -= 1;
      if (next.transitionUpdatesRemaining === 0) {
        const operation = next.routeOperations[next.routeIndex];
        const initialized = initializeSecondaryRoute(
          operation.secondaryRoute.points,
          next.position,
        );
        if (!initialized) return null;
        next.position = initialized.position;
        next.targetIndex = initialized.targetIndex;
        next.rootYaw = initialized.rootYaw;
        next.secondaryObjectCode = operation.secondaryObjectCode;
        next.motionStateId = operation.secondaryControlWord ?? null;
        next.motionBank = resolveScheduledActorMotionState(
          operation.secondaryControlWord,
        )?.bank ?? null;
        next.moving = true;
      }
      continue;
    }

    const operation = next.routeOperations[next.routeIndex];
    next.secondaryObjectCode = operation.secondaryObjectCode;
    next.motionStateId = operation.secondaryControlWord ?? null;
    next.motionBank = resolveScheduledActorMotionState(
      operation.secondaryControlWord,
    )?.bank ?? null;
    const points = operation.secondaryRoute.points;
    const pathStep = secondaryRoutePathStep(operation);
    const previous = next.position;
    const stepped = stepSecondaryRoute(
      points,
      previous,
      next.targetIndex,
      pathStep,
    );
    if (!stepped) return null;
    next.position = stepped.position;
    next.targetIndex = stepped.targetIndex;
    next.moving = !stepped.completed;
    if (!stepped.completed) {
      next.rootYaw = Math.atan2(
        next.position[0] - previous[0],
        next.position[2] - previous[2],
      ) + Math.PI;
      continue;
    }

    const completedRouteIndex = next.routeIndex;
    next.routeIndex = (
      next.routeIndex + 1
    ) % next.routeOperations.length;
    // The linked-object interpreter persists one opcode per actor update:
    // operation 0x24 lies between routes, and wrapping also crosses 0x04.
    // The following 0x1c update initializes its route before movement resumes.
    next.transitionUpdatesRemaining = (
      completedRouteIndex === next.routeOperations.length - 1 ? 3 : 2
    );
  }
  return next;
}

export function secondsSinceMidnight(date) {
  return (
    date.getUTCHours() * 60 * 60
    + date.getUTCMinutes() * 60
    + date.getUTCSeconds()
    + date.getUTCMilliseconds() / 1000
  );
}

function normalizedNativeBaseSelector(selector, requested) {
  let result = requested;
  const slots = new Map((selector?.pointerSlots || []).map(
    (slot) => [slot.selectorIndex, slot.rawSchedulePointer],
  ));
  if (result === 2 || result === 4) {
    if (slots.get(0) === slots.get(2)) {
      if (result === 4) result = 1;
    } else {
      result = 2;
    }
  } else if (result === 3 && slots.get(0) === slots.get(3)) {
    result = 1;
  }
  return result;
}

export function nativeScheduleSelectorIndex(
  selector,
  {
    baseSelector = 1,
    storyFlags = [],
    month = 0,
    day = 0,
  } = {},
) {
  if (!selector?.pointerSlots?.length) return null;
  const flags = storyFlags instanceof Set
    ? storyFlags
    : new Set(storyFlags);
  const normalizedBase = normalizedNativeBaseSelector(
    selector,
    baseSelector,
  );
  let selected = normalizedBase;
  for (const condition of selector.conditions || []) {
    const clearFlagsMatch = condition.requiredClearFlags.every(
      (flag) => !flags.has(flag),
    );
    const setFlagsMatch = condition.requiredSetFlags.every(
      (flag) => flags.has(flag),
    );
    const beforeEnd = (
      condition.endMonth === 0
      || condition.endDay === 0
      || month < condition.endMonth
      || day < condition.endDay
    );
    const afterStart = (
      condition.startMonth === 0
      || condition.startDay === 0
      || (
        condition.startMonth <= month
        && condition.startDay <= day
      )
    );
    const baseMatches = (
      condition.requiredBaseSelector < 0
      || condition.requiredBaseSelector === normalizedBase
    );
    if (
      clearFlagsMatch
      && setFlagsMatch
      && beforeEnd
      && afterStart
      && baseMatches
    ) {
      selected = condition.targetSelectorIndex;
      break;
    }
  }
  return selected;
}

export function scheduledActorVariant(
  definition,
  gameDate,
  selectorState = {},
) {
  if (!definition?.scheduleVariants?.length) return null;
  const useNativeSelector = (
    selectorState.useNativeSelector === true
    || Object.hasOwn(selectorState, "baseSelector")
    || Object.hasOwn(selectorState, "storyFlags")
    || Object.hasOwn(selectorState, "month")
    || Object.hasOwn(selectorState, "day")
  );
  const selectorIndex = useNativeSelector
    ? nativeScheduleSelectorIndex(
      definition.scheduleSelector,
      {
        ...selectorState,
        month: selectorState.month
          ?? (gameDate instanceof Date ? gameDate.getUTCMonth() + 1 : 0),
        day: selectorState.day
          ?? (gameDate instanceof Date ? gameDate.getUTCDate() : 0),
      },
    )
    : null;
  const selected = selectorIndex === null
    ? null
    : definition.scheduleVariants.find(
      (variant) => variant.selectorIndices?.includes(selectorIndex),
    );
  return selected || definition.scheduleVariants.find(
    (variant) => (
      variant.scheduleVariantId === definition.defaultScheduleVariantId
    ),
  ) || null;
}

export function scheduledRouteState(
  definition,
  gameDate,
  dayLengthMs,
) {
  if (!definition?.route?.length || !(gameDate instanceof Date)) return null;
  const startSecond = definition.startSecond;
  const gameElapsedSeconds = secondsSinceMidnight(gameDate) - startSecond;
  if (gameElapsedSeconds < 0) return null;

  const realElapsedSeconds = (
    gameElapsedSeconds
    * dayLengthMs
    / GAME_DAY_MS
  );
  const distance = realElapsedSeconds * definition.speed;
  const length = routeLength(definition.route);
  if (distance > length) return null;
  const sampled = sampleRoute(definition.route, distance);
  return sampled
    ? {
      ...sampled,
      distance,
      routeLength: length,
      moving: distance < length,
    }
    : null;
}

export function scheduledJourneyState(
  definition,
  gameDate,
  dayLengthMs,
  areaWorlds,
) {
  if (!definition?.journeys?.length || !(gameDate instanceof Date)) {
    return null;
  }
  const nowSecond = secondsSinceMidnight(gameDate);
  const journey = [...definition.journeys]
    .reverse()
    .find((candidate) => candidate.startSecond <= nowSecond);
  if (!journey) return null;

  const realElapsedSeconds = (
    (nowSecond - journey.startSecond)
    * dayLengthMs
    / GAME_DAY_MS
  );
  let remainingDistance = realElapsedSeconds * definition.speed;
  for (let routeIndex = 0; routeIndex < journey.routes.length; routeIndex++) {
    const route = journey.routes[routeIndex];
    const length = routeLength(route.points);
    if (remainingDistance <= length) {
      const sampled = sampleRoute(route.points, remainingDistance);
      return sampled
        ? {
          ...sampled,
          actorCode: definition.actorCode,
          area: route.area,
          worldId: areaWorlds[route.area] || null,
          routeIndex,
          journeyStartSecond: journey.startSecond,
          moving: remainingDistance < length,
        }
        : null;
    }
    remainingDistance -= length;
  }
  return null;
}

function stateResult(state, areaWorlds, extra = {}) {
  const result = {
    actorCode: state.actorCode,
    area: state.area,
    worldId: areaWorlds[state.area] || null,
    position: state.position ? [...state.position] : null,
    rootYaw: state.rootYaw,
    motionStateId: state.motionStateId ?? null,
    motionBank: state.motionBank ?? null,
    actorLifecycleControlState:
      state.actorLifecycleControlState ?? null,
    actorQueryState: state.actorQueryState ?? null,
    actorBooleanControllerMode:
      state.actorBooleanControllerMode ?? null,
    actorBoundsControlMode:
      state.actorBoundsControlMode ?? null,
    routeCompletionMotionStateId:
      state.routeCompletionMotionStateId ?? null,
    routeCompletionDefaultIdleCandidateMotionIds:
      state.routeCompletionDefaultIdleCandidateMotionIds ?? null,
    routeCompletionSelectionStatus:
      state.routeCompletionSelectionStatus ?? null,
    residentCharacterCode: state.residentCharacterCode ?? null,
    residentCharacterIndex: state.residentCharacterIndex ?? null,
    modelOverrideCode: state.modelOverrideCode ?? null,
    sceneObjectTransition: state.sceneObjectTransition
      ? { ...state.sceneObjectTransition }
      : null,
    localObjects: [...(state.localObjects?.values() || [])].map(
      (localObject) => ({
        ...localObject,
        runtimePosition: [...localObject.runtimePosition],
        browserPosition: [...localObject.browserPosition],
        transformControlWords: [...localObject.transformControlWords],
      }),
    ),
    secondaryAttachments: [
      ...(state.secondaryAttachments?.values() || []),
    ].map((attachment) => ({
      ...attachment,
      position: [...attachment.position],
    })),
    actionControllerId: state.actionControllerId ?? null,
    actionControllerMode: state.actionControllerMode ?? null,
    interactionTargetCode: state.interactionTargetCode ?? null,
    interactionMotionStateIds: [
      ...(state.interactionMotionStateIds || []),
    ],
    interactionMotionSelection:
      state.interactionMotionSelection ?? null,
    moving: false,
    ...extra,
  };
  if (!result.position || !result.area) return null;
  return result;
}

function secondaryAttachmentRegistration(operation, area) {
  return {
    objectCode: operation.secondaryObjectCode,
    area,
    position: [...operation.browserVector],
    rootYaw: (
      -operation.transformControlWord * Math.PI * 2 / 0x10000
    ),
    transformControlWord: operation.transformControlWord,
    sourceOffset: operation.fileOffset || null,
  };
}

function applySecondaryAttachmentOperation(attachments, operation, area) {
  if (
    operation.operation !== 0x24
    || !operation.secondaryObjectCode
  ) return;
  if (!operation.enabled) {
    attachments.delete(operation.secondaryObjectCode);
    return;
  }
  if (
    operation.browserVector?.length !== 3
    || !operation.browserVector.every(Number.isFinite)
    || !Number.isFinite(operation.transformControlWord)
  ) return;
  attachments.set(
    operation.secondaryObjectCode,
    secondaryAttachmentRegistration(operation, area),
  );
}

function inheritedSecondaryAttachments(definition, currentJourney) {
  const attachments = new Map();
  const journeys = [...definition.journeys].sort(
    (left, right) => left.startSecond - right.startSecond,
  );
  const currentIndex = journeys.indexOf(currentJourney);
  let area = definition.defaultArea || null;
  for (let index = 0; index < currentIndex; index++) {
    const journey = journeys[index];
    const nextStartSecond = journeys[index + 1].startSecond;
    for (const operation of journey.operations) {
      if (
        Number.isFinite(operation.descriptorActivationSecond)
        && operation.descriptorActivationSecond >= nextStartSecond
      ) {
        continue;
      }
      if (operation.operation === 8) {
        area = operation.area;
      } else {
        applySecondaryAttachmentOperation(
          attachments,
          operation,
          area,
        );
      }
    }
  }
  return attachments;
}

function localObjectRegistration(operation, area) {
  const transform = operation.localTransform || operation;
  return {
    objectCode: transform.objectCode,
    locationCode: transform.locationCode,
    area,
    placementMode: transform.placementMode,
    runtimePosition: [...transform.runtimePosition],
    browserPosition: [...transform.browserPosition],
    transformControlWords: [...transform.transformControlWords],
    resolvedModel: transform.resolvedModel || null,
    sourceOffset: operation.fileOffset || transform.address || null,
  };
}

function inheritedLocalObjects(definition, currentJourney) {
  const localObjects = new Map();
  const journeys = [...definition.journeys].sort(
    (left, right) => left.startSecond - right.startSecond,
  );
  const currentIndex = journeys.indexOf(currentJourney);
  let area = definition.defaultArea || null;
  for (let index = 0; index < currentIndex; index++) {
    const journey = journeys[index];
    const nextStartSecond = journeys[index + 1].startSecond;
    for (const operation of journey.operations) {
      if (
        Number.isFinite(operation.descriptorActivationSecond)
        && operation.descriptorActivationSecond >= nextStartSecond
      ) {
        continue;
      }
      if (operation.operation === 8) {
        area = operation.area;
      } else if (
        operation.operation === 0x10
        && operation.localTransform
      ) {
        const registration = localObjectRegistration(operation, area);
        localObjects.set(registration.objectCode, registration);
      } else if (operation.operation === 0x11) {
        localObjects.delete(operation.objectCode);
      }
    }
  }
  return localObjects;
}

function inheritedModelOverrideCode(definition, currentJourney) {
  let modelOverrideCode = null;
  const journeys = [...definition.journeys].sort(
    (left, right) => left.startSecond - right.startSecond,
  );
  const currentIndex = journeys.indexOf(currentJourney);
  for (let index = 0; index < currentIndex; index++) {
    const journey = journeys[index];
    const nextStartSecond = journeys[index + 1].startSecond;
    for (const operation of journey.operations) {
      if (
        operation.operation !== 0x2f
        || !Number.isFinite(operation.descriptorActivationSecond)
        || operation.descriptorActivationSecond >= nextStartSecond
      ) {
        continue;
      }
      modelOverrideCode = operation.modelOverridePersistent
        ? operation.modelOverrideCode
        : null;
    }
  }
  return modelOverrideCode;
}

function sceneObjectTransition(operation) {
  return {
    sceneObjectCode: operation.sceneObjectCode,
    sceneObjectControlValue: operation.sceneObjectControlValue,
    sceneObjectTransitionMode: operation.sceneObjectTransitionMode,
    interactionBrowserPosition:
      operation.interactionBrowserPosition
        ? [...operation.interactionBrowserPosition]
        : null,
    interactionFacingFixed:
      operation.interactionFacingFixed ?? null,
    interactionControlFloats:
      operation.interactionControlFloats
        ? [...operation.interactionControlFloats]
        : [],
  };
}

function inheritedSceneObjectTransition(definition, currentJourney) {
  let transition = null;
  const journeys = [...definition.journeys].sort(
    (left, right) => left.startSecond - right.startSecond,
  );
  const currentIndex = journeys.indexOf(currentJourney);
  for (let index = 0; index < currentIndex; index++) {
    const journey = journeys[index];
    const nextStartSecond = journeys[index + 1].startSecond;
    for (const operation of journey.operations) {
      if (
        operation.operation !== 0x2a
        || (
          Number.isFinite(operation.descriptorActivationSecond)
          && operation.descriptorActivationSecond >= nextStartSecond
        )
      ) {
        continue;
      }
      transition = sceneObjectTransition(operation);
    }
  }
  return transition;
}

export function scheduledDescriptorState(
  definition,
  gameDate,
  areaWorlds,
  dayLengthMs = GAME_DAY_MS,
) {
  if (!definition?.journeys?.length || !(gameDate instanceof Date)) {
    return null;
  }
  const nowSecond = secondsSinceMidnight(gameDate);
  const journey = [...definition.journeys]
    .reverse()
    .find((candidate) => candidate.startSecond <= nowSecond);
  if (!journey?.operations?.length) return null;

  const state = {
    actorCode: definition.actorCode,
    area: definition.defaultArea || null,
    position: null,
    rootYaw: null,
    motionStateId: definition.nativeDefaultMotionStateId || null,
    motionBank: resolveScheduledActorMotionState(
      definition.nativeDefaultMotionStateId,
    )?.bank ?? null,
    actorLifecycleControlState: null,
    actorQueryState: null,
    actorBooleanControllerMode: null,
    actorBoundsControlMode: null,
    routeCompletionMotionStateId: null,
    routeCompletionDefaultIdleCandidateMotionIds: null,
    routeCompletionSelectionStatus: null,
    residentCharacterCode: null,
    residentCharacterIndex: null,
    modelOverrideCode: inheritedModelOverrideCode(definition, journey),
    sceneObjectTransition: inheritedSceneObjectTransition(
      definition,
      journey,
    ),
    localObjects: inheritedLocalObjects(definition, journey),
    secondaryAttachments: inheritedSecondaryAttachments(
      definition,
      journey,
    ),
    actionControllerId: null,
    actionControllerMode: null,
    interactionTargetCode: null,
    interactionMotionStateIds: [],
    interactionMotionSelection: null,
  };
  let descriptorSecond = journey.startSecond;
  const pathStepPerNativeUpdate =
    definition.nativeDefaultPathSpeedPerGameSecond;
  const realSecondsPerGameSecond = (
    Number.isFinite(dayLengthMs) && dayLengthMs > 0
      ? dayLengthMs / GAME_DAY_MS
      : 1
  );

  for (const operation of journey.operations) {
    if (operation.operation === 8) {
      state.area = operation.area;
      continue;
    }
    if (operation.operation === 3) {
      state.position = operation.browserPosition;
      state.rootYaw = (
        -operation.facingFixed * Math.PI * 2 / 0x10000
      );
      continue;
    }
    if (operation.operation === 7) {
      descriptorSecond += operation.durationSeconds;
      if (nowSecond < descriptorSecond) {
        return stateResult(state, areaWorlds, {
          operation: 7,
          descriptorSecond,
        });
      }
      continue;
    }
    if (operation.operation === 9) {
      state.actorLifecycleControlState = operation.actorStateValue;
      if (operation.actorStateValue !== 1) {
        state.motionStateId = definition.nativeDefaultMotionStateId || null;
        state.motionBank = resolveScheduledActorMotionState(
          state.motionStateId,
        )?.bank ?? null;
      }
      continue;
    }
    if (operation.operation === 0x0f) {
      // Native operation 0x0f writes this dword to actor +0x90. Game
      // scripts query it by the actor's four-character definition code.
      state.actorQueryState = operation.actorControlValue;
      continue;
    }
    if (operation.operation === 0x28) {
      // The native consumer accepts only zero or one; malformed values are
      // normalized to zero before reaching the controller.
      state.actorBooleanControllerMode =
        operation.actorByteValue === 1 ? 1 : 0;
      continue;
    }
    if (operation.operation === 0x38) {
      // This byte at actor +0x1d1 selects the native bounds/control-footprint
      // calculation. Keep the exact mode available to collision consumers;
      // it does not directly toggle mesh visibility.
      state.actorBoundsControlMode =
        operation.actorBooleanValue ? 1 : 0;
      continue;
    }
    if (
      operation.operation === 2
      || operation.operation === 0x19
      || operation.operation === 0x1a
    ) {
      state.motionStateId = (
        operation.operation === 0x19
        && operation.motionStateControlWord === 0
      )
        ? null
        : operation.motionStateId;
      state.motionBank = resolveScheduledActorMotionState(
        state.motionStateId,
      )?.bank ?? null;
      continue;
    }
    if (operation.operation === 0x17) {
      const candidates = scheduledActorInteractionMotionCandidates(
        operation.controlValues,
      );
      state.interactionTargetCode = operation.targetCode || null;
      state.interactionMotionStateIds = candidates;
      state.interactionMotionSelection = candidates.length === 1
        ? {
            motionStateId: candidates[0],
            nativeSelector: "single valid authored candidate",
            browserSelector: "PRNG-independent exact selection",
          }
        : null;
      if (state.interactionMotionSelection) {
        state.motionStateId =
          state.interactionMotionSelection.motionStateId;
        state.motionBank = resolveScheduledActorMotionState(
          state.motionStateId,
        )?.bank ?? null;
      }
      continue;
    }
    if (
      operation.operation === 0x10
      && operation.localTransform
    ) {
      const registration = localObjectRegistration(
        operation,
        state.area,
      );
      state.localObjects.set(registration.objectCode, registration);
      continue;
    }
    if (operation.operation === 0x11) {
      state.localObjects.delete(operation.objectCode);
      continue;
    }
    if (operation.operation === 0x2b) {
      state.residentCharacterCode = operation.residentCharacterCode;
      state.residentCharacterIndex = operation.residentCharacterIndex;
      continue;
    }
    if (operation.operation === 0x2a) {
      state.sceneObjectTransition = sceneObjectTransition(operation);
      continue;
    }
    if (operation.operation === 0x2f) {
      state.modelOverrideCode = operation.modelOverridePersistent
        ? operation.modelOverrideCode
        : null;
      continue;
    }
    if (operation.operation === 0x30) {
      state.actionControllerId = operation.actionControllerId || null;
      state.actionControllerMode = operation.actionControllerId
        ? operation.actionControllerMode
        : null;
      continue;
    }
    if (operation.operation === 0x35) {
      state.routeCompletionMotionStateId =
        operation.routeCompletionMotionOverrideId
        ?? operation.routeCompletionDefaultIdleUnanimousMotionId
        ?? null;
      state.routeCompletionDefaultIdleCandidateMotionIds =
        operation.routeCompletionDefaultIdleCandidateMotionIds ?? null;
      state.routeCompletionSelectionStatus =
        operation.routeCompletionSelectionStatus ?? null;
      continue;
    }
    if (
      operation.operation === 0x24
    ) {
      applySecondaryAttachmentOperation(
        state.secondaryAttachments,
        operation,
        state.area,
      );
      if (
        !operation.enabled
        || operation.browserVector?.length !== 3
        || !operation.browserVector.every(Number.isFinite)
      ) {
        continue;
      }
      // The native operation creates or updates an attached object. Reviewed
      // MFSY captures prove bit-for-bit that the active object's XYZ/facing
      // are mirrored into the owning actor record.
      state.position = [...operation.browserVector];
      state.rootYaw = (
        -operation.transformControlWord * Math.PI * 2 / 0x10000
      );
      continue;
    }
    if (operation.operation === 0x18) {
      if (!Number.isFinite(operation.gateReleaseSecond)) return null;
      if (nowSecond < operation.gateReleaseSecond) {
        return stateResult(state, areaWorlds, {
          operation: 0x18,
          descriptorSecond: operation.gateReleaseSecond,
          gateActivationSecond:
            operation.descriptorActivationSecond,
          gateReleaseSecond: operation.gateReleaseSecond,
          linkedInteraction: {
            targetCode: operation.targetCode,
            targetSecond: operation.targetSecond,
            targetTimeMode: operation.targetTimeMode,
            targetBinding:
              operation.linkedInteractionEvidence?.targetBinding
              || null,
            motionStateCandidates: [
              ...(operation.interactionMotionStateIds || []),
            ],
            controlValues: [
              ...(operation.interactionControlValues || []),
            ],
            payloadStatus: (
              "numeric interaction motion/control payload retained"
            ),
          },
        });
      }
      descriptorSecond = operation.gateReleaseSecond;
      continue;
    }
    if (operation.operation === 0x22) {
      const gateActivationSecond = descriptorSecond;
      const gateReleaseSecond = operation.timeControlValue < 0
        ? gateActivationSecond - operation.timeControlValue
        : Math.max(
          gateActivationSecond,
          operation.timeControlValue,
        );
      if (Number.isInteger(operation.deterministicMotionStateId)) {
        state.motionStateId = operation.deterministicMotionStateId;
      }
      if (nowSecond < gateReleaseSecond) {
        return stateResult(state, areaWorlds, {
          operation: 0x22,
          descriptorSecond: gateReleaseSecond,
          gateActivationSecond,
          gateReleaseSecond,
          variableMotionGate: {
            targetTimeMode: operation.targetTimeMode,
            timeControlValue: operation.timeControlValue,
            motionCandidateCount: operation.motionCandidateCount,
            motionStateCandidates: (operation.motionCandidates || []).map(
              (candidate) => candidate.motionStateId,
            ),
            deterministicMotionStateId:
              operation.deterministicMotionStateId ?? null,
            selectionStatus:
              operation.variableMotionEvidence?.selectionStatus
              || (
                Number.isInteger(operation.deterministicMotionStateId)
                  ? "RNG-independent unanimous numeric motion state"
                  : (
                    "native random candidate selection retained as "
                    + "unresolved"
                  )
              ),
          },
        });
      }
      descriptorSecond = gateReleaseSecond;
      continue;
    }
    if (operation.operation === 0x16) {
      const activationSecond = operation.activationSecond < 0
        ? journey.startSecond - operation.activationSecond
        : operation.activationSecond;
      const notBeforeSecond = Math.max(
        journey.startSecond + operation.minimumDelaySeconds,
        activationSecond,
      );
      if (nowSecond < notBeforeSecond) {
        if (operation.waitingPlacement?.position?.length === 3) {
          state.position = [...operation.waitingPlacement.position];
          if (Number.isFinite(
            operation.waitingPlacement.transformControlWord,
          )) {
            state.rootYaw = (
              -operation.waitingPlacement.transformControlWord
              * Math.PI * 2 / 0x10000
            );
          }
        }
        return stateResult(state, areaWorlds, {
          operation: 0x16,
          descriptorSecond,
          notBeforeSecond,
          targetCode: operation.targetCode,
          operation16Controller: {
            phase: "gate-waiting",
            waitingPlacement: operation.waitingPlacement || null,
            subordinateStream: operation.subordinateStream || null,
            runtimeEvidence: operation.subordinateRuntimeEvidence || null,
            replayStatus: operation.waitingPlacement
              ? (
                "capture-proven waiting leaf; subordinate motion/control "
                + "phase retained as authored metadata"
              )
              : "waiting leaf unresolved for this source/map population",
          },
        });
      }
      if (operation.linkedPlacement?.position?.length === 3) {
        state.position = [...operation.linkedPlacement.position];
        continue;
      }
      // The native handler may replace the position from its variable records.
      // Do not retain a stale position unless a later operation proves one.
      state.position = null;
      continue;
    }
    if (operation.operation === 1) {
      const movementProfile = motionManifest.movementProfiles[
        operation.movementMode
      ];
      const operationPathStep = (
        operation.nativePathStepPerUpdate
        ?? movementProfile?.nativePathStepPerUpdate
        ?? pathStepPerNativeUpdate
      );
      const speedMetersPerRealSecond = operationPathStep * 30;
      if (
        !operation.points?.length
        || !Number.isFinite(speedMetersPerRealSecond)
        || speedMetersPerRealSecond <= 0
      ) {
        return null;
      }
      state.area = operation.area || state.area;
      const elapsedGameSeconds = Math.max(
        0,
        nowSecond - descriptorSecond,
      );
      const elapsedRealSeconds = (
        elapsedGameSeconds * realSecondsPerGameSecond
      );
      const distance = elapsedRealSeconds * speedMetersPerRealSecond;
      const length = routeLength(operation.points);
      if (distance <= length) {
        const sampled = sampleRoute(operation.points, distance);
        const moving = distance < length;
        if (!moving && state.routeCompletionMotionStateId !== null) {
          state.motionStateId = state.routeCompletionMotionStateId;
          state.motionBank = resolveScheduledActorMotionState(
            state.motionStateId,
          )?.bank ?? null;
        }
        return sampled
          ? stateResult(state, areaWorlds, {
            ...sampled,
            rootYaw: sampled.yaw + Math.PI,
            moving,
            operation: 1,
            movementMode: operation.movementMode,
            movementElapsedRealSeconds: elapsedRealSeconds,
            movementRemainingRealSeconds: (
              Math.max(0, length - distance)
              / speedMetersPerRealSecond
            ),
            routeLength: length,
            journeyStartSecond: journey.startSecond,
          })
          : null;
      }
      const residualGameSeconds = (
        Math.max(0, distance - length)
        / speedMetersPerRealSecond
        / realSecondsPerGameSecond
      );
      descriptorSecond = (
        nowSecond - residualGameSeconds
      );
      state.position = [...operation.points.at(-1)];
      if (state.routeCompletionMotionStateId !== null) {
        state.motionStateId = state.routeCompletionMotionStateId;
        state.motionBank = resolveScheduledActorMotionState(
          state.motionStateId,
        )?.bank ?? null;
      }
      const previous = operation.points.at(-2) || operation.points.at(-1);
      const current = operation.points.at(-1);
      state.rootYaw = Math.atan2(
        current[0] - previous[0],
        current[2] - previous[2],
      ) + Math.PI;
      continue;
    }
    if (operation.operation === 0) {
      return stateResult(state, areaWorlds, {
        operation: 0,
        descriptorSecond,
      });
    }
    if (operation.operation === 4 || operation.operation === 0x12) {
      return stateResult(state, areaWorlds, {
        operation: operation.operation,
        descriptorSecond,
      });
    }
    // Native operations 0x05 and 0x13 clear the actor's current operation
    // field, not its world transform. Continue descriptor traversal while
    // retaining the last position established by operation 0x03 or 0x01.
  }
  return stateResult(state, areaWorlds, { descriptorSecond });
}

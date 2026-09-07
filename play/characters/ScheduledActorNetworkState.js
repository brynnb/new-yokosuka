import { GAME_DAY_MS, DEFAULT_DAY_LENGTH_MS } from "../../src/WorldTime.js";
import { sampleRoute } from "../../src/RouteSampling.js";

const WALKING_CORRECTION_SECONDS = 1;

function routeIndex(definitions) {
  const routes = new Map();
  for (const definition of definitions || []) {
    for (const route of definition.routes || []) {
      if (route.id && route.points?.length) {
        routes.set(route.id, route.points);
        for (const alias of route.aliases || []) {
          routes.set(alias, route.points);
        }
      }
    }
    for (const journey of definition.journeys || []) {
      for (const operation of journey.operations || []) {
        if (
          operation.operation === 1
          && operation.routeId
          && operation.points?.length
        ) {
          routes.set(operation.routeId, operation.points);
        }
        if (
          operation.operation === 0x1c
          && operation.routeId
          && operation.secondaryRoute?.points?.length
        ) {
          routes.set(operation.routeId, operation.secondaryRoute.points);
        }
        if (
          operation.operation === 0x1c
          && operation.secondaryHandoff?.routeId
          && operation.secondaryHandoff.points?.length
        ) {
          routes.set(
            operation.secondaryHandoff.routeId,
            operation.secondaryHandoff.points,
          );
        }
        const linked = operation.linkedPlacement;
        if (
          operation.operation === 0x16
          && linked?.controllerRouteId
          && linked.controllerRoutePoints?.length
        ) {
          routes.set(
            linked.controllerRouteId,
            linked.controllerRoutePoints,
          );
        }
        if (
          operation.operation === 0x16
          && linked?.handoffRouteId
          && linked.handoffRoutePoints?.length
        ) {
          routes.set(linked.handoffRouteId, linked.handoffRoutePoints);
        }
      }
    }
  }
  return routes;
}

function validState(state) {
  return Boolean(
    state?.id
    && state.worldId
    && Number.isSafeInteger(state.revision)
    && [
      state.x,
      state.y,
      state.z,
      state.yaw,
      state.updatedAt,
    ].every(Number.isFinite),
  );
}

function moveAvoidanceOffset(state, elapsedRealSeconds) {
  const currentX = state.avoidanceOffsetX || 0;
  const currentZ = state.avoidanceOffsetZ || 0;
  let targetX = currentX;
  let targetZ = currentZ;
  if (state.avoidancePhase === "sidestep") {
    targetX = state.avoidanceTargetX || 0;
    targetZ = state.avoidanceTargetZ || 0;
  } else if (state.avoidancePhase === "returning") {
    targetX = 0;
    targetZ = 0;
  } else {
    return [currentX, currentZ];
  }
  const deltaX = targetX - currentX;
  const deltaZ = targetZ - currentZ;
  const distance = Math.hypot(deltaX, deltaZ);
  const maximum = Math.max(0, state.avoidanceSpeed || 0)
    * elapsedRealSeconds;
  if (distance === 0 || distance <= maximum) return [targetX, targetZ];
  const scale = maximum / distance;
  return [
    currentX + deltaX * scale,
    currentZ + deltaZ * scale,
  ];
}

export class ScheduledActorNetworkState {
  constructor({
    getServerWallTimeMs,
    getDayLengthMs,
  }) {
    this.getServerWallTimeMs = getServerWallTimeMs;
    this.getDayLengthMs = getDayLengthMs;
    this.states = new Map();
    this.routes = new Map();
    this.walkingSpeedMultiplier = 1;
    this.walkingSpeedAnchors = new Map();
    this.walkingCorrections = new Map();
    this.observedRouteSpeeds = new Map();
    this.movementTimeAnchors = new Map();
  }

  configure(definitions) {
    this.routes = routeIndex(definitions);
  }

  replaceSnapshot(worldId, states) {
    for (const [id, state] of this.states) {
      if (state.worldId === worldId) {
        this.states.delete(id);
        this.walkingSpeedAnchors.delete(id);
        this.walkingCorrections.delete(id);
        this.observedRouteSpeeds.delete(id);
        this.movementTimeAnchors.delete(id);
      }
    }
    for (const state of states || []) this.upsert(state);
  }

  upsert(state) {
    if (!validState(state)) return false;
    const previous = this.states.get(state.id);
    if (previous && previous.revision >= state.revision) return false;
    const preserveWalkingPosition = Boolean(
      previous
      && ["walking", "blocked"].includes(previous.mode)
      && ["walking", "blocked"].includes(state.mode)
      && previous.routeId
      && previous.routeId === state.routeId,
    );
    const previousVisualDistance = preserveWalkingPosition
      ? this.stateFor(state.id)?.routeDistance
      : null;
    if (preserveWalkingPosition && state.updatedAt > previous.updatedAt) {
      const elapsedSeconds = (state.updatedAt - previous.updatedAt) / 1000;
      const observedSpeed = Math.max(
        0,
        (state.routeDistance - previous.routeDistance) / elapsedSeconds,
      );
      this.observedRouteSpeeds.set(state.id, {
        routeId: state.routeId,
        metersPerRealSecond: observedSpeed,
      });
    }
    if (
      previous
      && (
        previous.routeId !== state.routeId
        || previous.mode !== state.mode
      )
    ) {
      this.walkingSpeedAnchors.delete(state.id);
      this.walkingCorrections.delete(state.id);
      if (!preserveWalkingPosition) {
        this.observedRouteSpeeds.delete(state.id);
        this.movementTimeAnchors.delete(state.id);
      }
    }
    this.states.set(state.id, Object.freeze({ ...state }));
    if (Number.isFinite(previousVisualDistance)) {
      const projectedDistance = this.baseRouteDistance(state).distance;
      const offset = previousVisualDistance - projectedDistance;
      if (Math.abs(offset) > 1e-5) {
        this.walkingCorrections.set(state.id, {
          routeId: state.routeId,
          offset,
          startedAt: this.getServerWallTimeMs(),
        });
      } else {
        this.walkingCorrections.delete(state.id);
      }
    }
    return true;
  }

  remove(id, worldId, revision) {
    const previous = this.states.get(id);
    if (
      !previous
      || previous.worldId !== worldId
      || (Number.isSafeInteger(revision) && previous.revision > revision)
    ) {
      return false;
    }
    this.states.delete(id);
    this.walkingSpeedAnchors.delete(id);
    this.walkingCorrections.delete(id);
    this.observedRouteSpeeds.delete(id);
    this.movementTimeAnchors.delete(id);
    return true;
  }

  clear() {
    this.states.clear();
    this.walkingSpeedAnchors.clear();
    this.walkingCorrections.clear();
    this.observedRouteSpeeds.clear();
    this.movementTimeAnchors.clear();
  }

  baseRouteDistance(state) {
    const dayLengthMs = Number(this.getDayLengthMs?.())
      || DEFAULT_DAY_LENGTH_MS;
    const gameSecondsPerRealSecond = GAME_DAY_MS / dayLengthMs;
    const elapsedRealSeconds = Math.max(
      0,
      (this.getServerWallTimeMs() - state.updatedAt) / 1000,
    );
    const elapsedGameSeconds = elapsedRealSeconds * gameSecondsPerRealSecond;
    const sidestepping = state.avoidancePhase === "sidestep";
    const routeAdvancing = state.mode === "walking" && !sidestepping;
    const nominalSpeed = Math.max(
      0,
      (Number(state.speedPerGameSecond) || 0) * gameSecondsPerRealSecond,
    );
    const observed = this.observedRouteSpeeds.get(state.id);
    const routeSpeed = observed?.routeId === state.routeId
      ? Math.min(nominalSpeed, observed.metersPerRealSecond)
      : nominalSpeed;
    return {
      dayLengthMs,
      elapsedRealSeconds,
      elapsedGameSeconds,
      sidestepping,
      distance: Math.min(
        state.routeLength,
        state.routeDistance + (
          routeAdvancing ? elapsedRealSeconds * routeSpeed : 0
        ),
      ),
      routeSpeed,
    };
  }

  setWalkingSpeedMultiplier(multiplier) {
    if (
      !Number.isFinite(multiplier)
      || multiplier < 0.5
      || multiplier > 2
    ) return false;
    if (multiplier === 1) {
      // One is the authoritative server projection, not another debug offset.
      // Discard any lead or lag accumulated while live-tuning so reset really
      // returns every active route to the server timeline immediately.
      this.walkingSpeedMultiplier = 1;
      this.walkingSpeedAnchors.clear();
      return true;
    }
    if (multiplier === this.walkingSpeedMultiplier) return true;
    const visualDistances = new Map();
    for (const [id, state] of this.states) {
      if (state.mode !== "walking" || !state.routeId) continue;
      visualDistances.set(id, this.stateFor(id)?.routeDistance);
    }
    for (const [id, visualDistance] of visualDistances) {
      const state = this.states.get(id);
      if (!Number.isFinite(visualDistance) || !state) continue;
      this.walkingSpeedAnchors.set(id, {
        routeId: state.routeId,
        sourceDistance: this.baseRouteDistance(state).distance,
        visualDistance,
      });
    }
    this.walkingSpeedMultiplier = multiplier;
    return true;
  }

  stateFor(id) {
    const source = this.states.get(id);
    if (!source) return null;
    const state = { ...source };
    if (
      !["walking", "blocked"].includes(state.mode)
      || !state.routeId
    ) return state;
    const points = this.routes.get(state.routeId);
    if (!points?.length) return state;
    const {
      dayLengthMs,
      elapsedRealSeconds,
      elapsedGameSeconds,
      sidestepping,
      distance: baseDistance,
      routeSpeed,
    } = this.baseRouteDistance(state);
    let anchor = this.walkingSpeedAnchors.get(state.id);
    if (anchor?.routeId !== state.routeId) {
      anchor = {
        routeId: state.routeId,
        sourceDistance: state.routeDistance,
        visualDistance: state.routeDistance,
      };
      this.walkingSpeedAnchors.set(state.id, anchor);
    }
    let distance = Math.min(
      state.routeLength,
      Math.max(
        0,
        anchor.visualDistance + (
          baseDistance - anchor.sourceDistance
        ) * this.walkingSpeedMultiplier,
      ),
    );
    const correction = this.walkingCorrections.get(state.id);
    if (correction?.routeId === state.routeId) {
      const correctionElapsed = Math.max(
        0,
        (this.getServerWallTimeMs() - correction.startedAt) / 1000,
      );
      const correctionRemaining = Math.max(
        0,
        1 - correctionElapsed / WALKING_CORRECTION_SECONDS,
      );
      distance = Math.min(
        state.routeLength,
        Math.max(0, distance + correction.offset * correctionRemaining),
      );
      if (correctionRemaining === 0) {
        this.walkingCorrections.delete(state.id);
      }
    }
    const sampled = sampleRoute(points, distance);
    if (!sampled) return state;
    let movementTimeAnchor = this.movementTimeAnchors.get(state.id);
    if (movementTimeAnchor?.routeId !== state.routeId) {
      const nominalMetersPerRealSecond = Math.max(
        0,
        state.speedPerGameSecond * GAME_DAY_MS / dayLengthMs,
      );
      movementTimeAnchor = {
        routeId: state.routeId,
        elapsedSeconds: nominalMetersPerRealSecond > 0
          ? state.routeDistance / nominalMetersPerRealSecond
          : 0,
        wallTimeMs: state.updatedAt,
      };
      this.movementTimeAnchors.set(state.id, movementTimeAnchor);
    }
    const movementElapsedRealSeconds = (
      movementTimeAnchor.elapsedSeconds
      + Math.max(
        0,
        (this.getServerWallTimeMs() - movementTimeAnchor.wallTimeMs) / 1000,
      )
    );
    const [avoidanceOffsetX, avoidanceOffsetZ] = moveAvoidanceOffset(
      state,
      elapsedRealSeconds,
    );
    return {
      ...state,
      x: sampled.position[0] + avoidanceOffsetX,
      y: sampled.position[1],
      z: sampled.position[2] + avoidanceOffsetZ,
      yaw: (
        sidestepping || state.avoidancePhase === "returning"
          ? state.yaw
          : sampled.yaw + Math.PI
      ),
      routeDistance: distance,
      routeSegment: sampled.pointIndex,
      effectiveSecond: state.effectiveSecond + (
        state.mode === "walking" && !sidestepping ? elapsedGameSeconds : 0
      ),
      movementElapsedRealSeconds: (
        sidestepping
          ? (state.avoidanceMotionTime || 0) + elapsedRealSeconds
          : movementElapsedRealSeconds
      ),
      movementSpeedMetersPerRealSecond: (
        sidestepping
          ? Math.max(0, state.avoidanceSpeed || 0)
          : routeSpeed
      ),
      walkingSpeedMultiplier: this.walkingSpeedMultiplier,
    };
  }

  actorQueryStateForActorCode(actorCode, worldId = null) {
    if (typeof actorCode !== "string" || actorCode.length !== 4) {
      return null;
    }
    const values = new Set();
    for (const state of this.states.values()) {
      if (
        state.actorCode !== actorCode
        || (worldId && state.worldId !== worldId)
      ) {
        continue;
      }
      const value = state.visual?.actorQueryState;
      if (Number.isInteger(value)) values.add(value);
    }
    return values.size === 1 ? values.values().next().value : null;
  }
}

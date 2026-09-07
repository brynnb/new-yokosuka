import nativeMapTransitionData from "../play/data/native-map-transitions.json" with {
  type: "json",
};
import outdoorBoundaryData from "./OutdoorBoundaryTransitionData.js";
import shenmue2OutdoorBoundaryTransitions from
  "./Shenmue2BoundaryTransitionData.js";

function freezeArray(values) {
  return Object.freeze([...values]);
}

function sourceFromNativeVolume(route) {
  const shape = route.source.shape;
  return Object.freeze({
    worldId: route.source.worldId,
    eventId: route.source.eventId,
    recordFileOffset: route.source.recordFileOffset,
    shape: Object.freeze({
      kind: "parallelogram",
      origin: freezeArray(shape.origin),
      edgeA: freezeArray(shape.edgeA),
      edgeB: freezeArray(shape.edgeB),
      vertices: Object.freeze(shape.vertices.map(freezeArray)),
    }),
  });
}

function destinationFromNativeVolume(route) {
  const destination = route.destination;
  return Object.freeze({
    worldId: destination.worldId,
    scene: destination.scene,
    area: destination.area,
    entry: destination.entry,
    browserSpawn: Object.freeze({
      position: freezeArray(destination.browserSpawn.position),
      // Native Entry headings describe Ryo's authored model-forward axis.
      // The browser controller's forward vector is the opposite axis, so an
      // exact native heading must be rotated half a turn at the handoff.
      yaw: destination.browserSpawn.yawRadians + Math.PI,
    }),
  });
}

const NATIVE_OUTDOOR_BOUNDARY_TRANSITIONS = Object.freeze(
  (nativeMapTransitionData.runtimeNativeVolumeTransitions || [])
    .filter((route) => route.supported)
    .map((route) => Object.freeze({
    id: route.id,
    source: sourceFromNativeVolume(route),
    destination: destinationFromNativeVolume(route),
    evidence: Object.freeze({
      kind: "native-mapinfo-event-volume",
      eventFlag: route.evidence.flagHex,
      eventCallbackFileOffset: route.evidence.callbackFileOffset,
      routeCallerFileOffset: route.evidence.callFileOffset,
      helperFileOffset: route.evidence.helperFileOffset,
    }),
  })),
);

const SAKURAGAOKA_BOUNDARY_TRANSITIONS = Object.freeze(
  NATIVE_OUTDOOR_BOUNDARY_TRANSITIONS.filter(
    (transition) => transition.source.worldId === "sakuragaoka",
  ),
);

function sourceFromMeasuredPortal(route) {
  const portal = route.portal;
  return Object.freeze({
    worldId: route.fromWorldId,
    shape: Object.freeze({
      kind: "directional-portal",
      left: freezeArray(portal.left),
      right: freezeArray(portal.right),
      approach: freezeArray(portal.approach),
      edgePadding: portal.edgePadding,
      verticalTolerance: portal.verticalTolerance,
    }),
  });
}

// JD00 event 3 is decoded exactly, but its raw MAPINFO volume does not align
// with the browser-rendered dirt-path threshold. Retain the native transition
// above for evidence/debugging and restore the previously measured browser
// portal as the playable fallback at x=-30, z=44..48.
const SAKURAGAOKA_DIRT_PATH_FALLBACK = outdoorBoundaryData.find(
  (route) => route.id === "sakuragaoka-to-dobuita-dirt-path",
);
if (!SAKURAGAOKA_DIRT_PATH_FALLBACK) {
  throw new Error("Missing Sakuragaoka dirt-path boundary evidence.");
}

const BROWSER_MEASURED_BOUNDARY_TRANSITIONS = Object.freeze([
  Object.freeze({
    id: SAKURAGAOKA_DIRT_PATH_FALLBACK.id,
    source: sourceFromMeasuredPortal(SAKURAGAOKA_DIRT_PATH_FALLBACK),
    destination: Object.freeze({
      worldId: SAKURAGAOKA_DIRT_PATH_FALLBACK.toWorldId,
      entry: SAKURAGAOKA_DIRT_PATH_FALLBACK.nativeEntry ?? null,
      browserSpawn: Object.freeze({
        position: freezeArray(
          SAKURAGAOKA_DIRT_PATH_FALLBACK.browserSpawn.position,
        ),
        yaw: SAKURAGAOKA_DIRT_PATH_FALLBACK.browserSpawn.yaw,
      }),
    }),
    evidence: Object.freeze({
      kind: "manual-browser-capture-fallback",
      nativeTransitionId: "s1-jd00-event-3-to-d000-entry-11",
    }),
  }),
]);

const OUTDOOR_BOUNDARY_TRANSITIONS = Object.freeze([
  ...NATIVE_OUTDOOR_BOUNDARY_TRANSITIONS,
  ...BROWSER_MEASURED_BOUNDARY_TRANSITIONS,
  ...shenmue2OutdoorBoundaryTransitions,
]);

function horizontalPoint(position) {
  if (Array.isArray(position)) {
    return { x: Number(position[0]), z: Number(position[2]) };
  }
  return { x: Number(position?.x), z: Number(position?.z) };
}

function finitePoint(point) {
  return Number.isFinite(point.x) && Number.isFinite(point.z);
}

function pointInsideParallelogram(point, shape, epsilon = 1e-7) {
  const [originX, originZ] = shape.origin;
  const [edgeAX, edgeAZ] = shape.edgeA;
  const [edgeBX, edgeBZ] = shape.edgeB;
  const relativeX = point.x - originX;
  const relativeZ = point.z - originZ;
  const determinant = edgeAX * edgeBZ - edgeAZ * edgeBX;
  if (Math.abs(determinant) <= epsilon) return false;

  const alongA = (
    relativeX * edgeBZ - relativeZ * edgeBX
  ) / determinant;
  const alongB = (
    edgeAX * relativeZ - edgeAZ * relativeX
  ) / determinant;
  return (
    alongA >= -epsilon
    && alongA <= 1 + epsilon
    && alongB >= -epsilon
    && alongB <= 1 + epsilon
  );
}

function pointInsideSource(position, source) {
  const point = horizontalPoint(position);
  if (!finitePoint(point)) return false;
  if (source.shape.kind !== "parallelogram") return false;
  return pointInsideParallelogram(point, source.shape);
}

function positionComponents(position) {
  if (Array.isArray(position)) {
    return {
      x: Number(position[0]),
      y: Number(position[1]),
      z: Number(position[2]),
    };
  }
  return {
    x: Number(position?.x),
    y: Number(position?.y),
    z: Number(position?.z),
  };
}

function compilePortal(shape) {
  const [leftX, leftY, leftZ] = shape.left;
  const [rightX, rightY, rightZ] = shape.right;
  const dx = rightX - leftX;
  const dz = rightZ - leftZ;
  const lengthSquared = dx * dx + dz * dz;
  const length = Math.sqrt(lengthSquared);
  const approachSide = (
    dx * (shape.approach[2] - leftZ)
    - dz * (shape.approach[0] - leftX)
  ) / length;
  return Object.freeze({
    dx,
    dz,
    length,
    lengthSquared,
    approachSign: Math.sign(approachSide) || 1,
    averageY: (leftY + rightY) / 2,
  });
}

function signedPortalDistance(shape, geometry, position) {
  const point = positionComponents(position);
  return (
    geometry.dx * (point.z - shape.left[2])
    - geometry.dz * (point.x - shape.left[0])
  ) / geometry.length;
}

function portalProjection(shape, geometry, position) {
  const point = positionComponents(position);
  const projection = (
    (point.x - shape.left[0]) * geometry.dx
    + (point.z - shape.left[2]) * geometry.dz
  ) / geometry.lengthSquared;
  const paddingFraction = shape.edgePadding / geometry.length;
  return {
    projection,
    insideSpan: (
      projection >= -paddingFraction
      && projection <= 1 + paddingFraction
    ),
    insideHeight: (
      Number.isFinite(point.y)
      && Math.abs(point.y - geometry.averageY) <= shape.verticalTolerance
    ),
  };
}

function portalCrossingPoint(
  transition,
  geometry,
  runtime,
  previousPosition,
  position,
) {
  const shape = transition.source.shape;
  const previousDistance = signedPortalDistance(
    shape,
    geometry,
    previousPosition,
  );
  const currentDistance = signedPortalDistance(shape, geometry, position);
  const currentSide = currentDistance * geometry.approachSign;
  const currentPortal = portalProjection(shape, geometry, position);

  if (
    currentSide > 0.05
    && currentPortal.insideSpan
    && currentPortal.insideHeight
  ) {
    runtime.armed = true;
    runtime.lastApproachPosition = positionComponents(position);
    return null;
  }
  if (!runtime.armed || currentSide > 0) return null;

  const start = runtime.lastApproachPosition || positionComponents(
    previousPosition,
  );
  const current = positionComponents(position);
  const startDistance = signedPortalDistance(shape, geometry, start);
  const denominator = startDistance - currentDistance;
  let crossing = current;
  if (Math.abs(denominator) >= 0.000001) {
    const amount = startDistance / denominator;
    if (amount >= 0 && amount <= 1) {
      crossing = {
        x: start.x + (current.x - start.x) * amount,
        y: start.y + (current.y - start.y) * amount,
        z: start.z + (current.z - start.z) * amount,
      };
    }
  }

  const crossingPortal = portalProjection(shape, geometry, crossing);
  if (!crossingPortal.insideSpan || !crossingPortal.insideHeight) return null;
  runtime.armed = false;
  runtime.lastApproachPosition = null;
  return crossing;
}

function orientation(a, b, c) {
  return (
    (b.x - a.x) * (c.z - a.z)
    - (b.z - a.z) * (c.x - a.x)
  );
}

function pointOnSegment(point, start, end, epsilon = 1e-7) {
  return (
    Math.abs(orientation(start, end, point)) <= epsilon
    && point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.z >= Math.min(start.z, end.z) - epsilon
    && point.z <= Math.max(start.z, end.z) + epsilon
  );
}

function segmentsIntersect(a, b, c, d, epsilon = 1e-7) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (
    ((abC > epsilon && abD < -epsilon)
      || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon)
      || (cdA < -epsilon && cdB > epsilon))
  ) {
    return true;
  }
  return (
    pointOnSegment(c, a, b, epsilon)
    || pointOnSegment(d, a, b, epsilon)
    || pointOnSegment(a, c, d, epsilon)
    || pointOnSegment(b, c, d, epsilon)
  );
}

function movementCrossesSource(previousPosition, position, source) {
  const previous = horizontalPoint(previousPosition);
  const current = horizontalPoint(position);
  if (!finitePoint(previous) || !finitePoint(current)) return false;
  if (
    pointInsideParallelogram(previous, source.shape)
    || pointInsideParallelogram(current, source.shape)
  ) {
    return true;
  }

  const vertices = source.shape.vertices.map(([x, z]) => ({ x, z }));
  return vertices.some((vertex, index) => segmentsIntersect(
    previous,
    current,
    vertex,
    vertices[(index + 1) % vertices.length],
  ));
}

export class BoundaryTransitionDetector {
  constructor(transitions = OUTDOOR_BOUNDARY_TRANSITIONS) {
    this.transitions = transitions;
    this.portalGeometry = new Map();
    this.portalState = new Map();
    for (const transition of transitions) {
      if (transition.activation === "interaction") continue;
      if (transition.source.shape.kind !== "directional-portal") continue;
      this.portalGeometry.set(
        transition.id,
        compilePortal(transition.source.shape),
      );
      this.portalState.set(transition.id, {
        armed: false,
        lastApproachPosition: null,
      });
    }
    this.worldId = null;
    this.position = null;
    this.inside = new Set();
  }

  reset(worldId, position) {
    this.worldId = worldId;
    this.position = positionComponents(position);
    this.inside.clear();
    for (const runtime of this.portalState.values()) {
      runtime.armed = false;
      runtime.lastApproachPosition = null;
    }
    for (const transition of this.transitions) {
      if (
        transition.source.worldId === worldId
        && pointInsideSource(position, transition.source)
      ) {
        this.inside.add(transition.id);
      }
    }
  }

  update(worldId, position) {
    if (this.worldId !== worldId) {
      this.reset(worldId, position);
      return null;
    }

    let crossed = null;
    const nextInside = new Set();
    for (const transition of this.transitions) {
      if (transition.source.worldId !== worldId) continue;
      if (transition.activation === "interaction") continue;
      if (transition.source.shape.kind === "directional-portal") {
        const crossing = portalCrossingPoint(
          transition,
          this.portalGeometry.get(transition.id),
          this.portalState.get(transition.id),
          this.position,
          position,
        );
        if (!crossed && crossing) crossed = transition;
        continue;
      }
      const isInside = pointInsideSource(position, transition.source);
      if (isInside) nextInside.add(transition.id);
      if (
        !this.inside.has(transition.id)
        && !crossed
        && movementCrossesSource(this.position, position, transition.source)
      ) {
        crossed = transition;
      }
    }
    this.inside = nextInside;
    this.position = positionComponents(position);
    return crossed;
  }
}

export {
  OUTDOOR_BOUNDARY_TRANSITIONS,
  SAKURAGAOKA_BOUNDARY_TRANSITIONS,
  shenmue2OutdoorBoundaryTransitions as SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS,
  movementCrossesSource,
  pointInsideSource,
};

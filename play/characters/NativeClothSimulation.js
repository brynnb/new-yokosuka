import { NATIVE_CLOTH_SOLVER_PROFILE } from "../data/native-cloth-profiles.web.js";

const DEFAULT_STEP_SECONDS = 1 / NATIVE_CLOTH_SOLVER_PROFILE.fixedFramesPerSecond;
const DEFAULT_DAMPING = (
  NATIVE_CLOTH_SOLVER_PROFILE.velocityDampingByProfileByte0x0d.default
);
const DEFAULT_MAXIMUM_CATCH_UP_STEPS = 5;
const DEFAULT_RESET_DISTANCE = NATIVE_CLOTH_SOLVER_PROFILE.teleportDistance;
const PINNED_ANCHOR_HIGH_NIBBLE = (
  NATIVE_CLOTH_SOLVER_PROFILE.pinnedAnchorHighNibble
);
const OPEN_PANEL_TYPES = new Set(
  NATIVE_CLOTH_SOLVER_PROFILE.openPanelControlTypes,
);
const CLOSED_RING_TYPES = new Set(
  NATIVE_CLOTH_SOLVER_PROFILE.closedRingControlTypes,
);
const FIRST_DYNAMIC_ROW = NATIVE_CLOTH_SOLVER_PROFILE.firstDynamicRow;
const EPSILON = 1e-12;

function finitePoint(value, label) {
  if (
    (!Array.isArray(value) && !ArrayBuffer.isView(value))
    || value.length < 3
    || !Number.isFinite(value[0])
    || !Number.isFinite(value[1])
    || !Number.isFinite(value[2])
  ) {
    throw new TypeError(`native cloth ${label} is not a finite point`);
  }
  return [Number(value[0]), Number(value[1]), Number(value[2])];
}

function finiteNonnegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`native cloth ${label} must be nonnegative`);
  }
  return Number(value);
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`native cloth ${label} must be positive`);
  }
  return Number(value);
}

function clonePoints(points, label) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new TypeError(`native cloth ${label} must contain points`);
  }
  return points.map((point, index) => finitePoint(point, `${label} ${index}`));
}

function cloneMatchingPoints(points, expectedLength, label) {
  const cloned = clonePoints(points, label);
  if (cloned.length !== expectedLength) {
    throw new Error(`native cloth ${label} do not match the lattice`);
  }
  return cloned;
}

function copyPoint(target, source) {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

function distanceSquared(left, right) {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  const z = left[2] - right[2];
  return x * x + y * y + z * z;
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function subtract(left, right) {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalizeClosedRingProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new TypeError("native cloth closed-ring profile is unavailable");
  }
  if (!new Set(["authored", "measured"]).has(profile.spacingSource)) {
    throw new TypeError("native cloth closed-ring spacing source is invalid");
  }
  const spacingScale = finitePositive(
    profile.spacingScale,
    "closed-ring spacing scale",
  );
  const measuredMaximumBodyRadiusScale = (
    profile.measuredMaximumBodyRadiusScale === null
  )
    ? null
    : finitePositive(
      profile.measuredMaximumBodyRadiusScale,
      "closed-ring measured maximum body-radius scale",
    );
  if (
    profile.spacingSource === "authored"
    && measuredMaximumBodyRadiusScale !== null
  ) {
    throw new Error("native cloth authored ring spacing cannot have a body cap");
  }
  if (
    profile.spacingSource === "measured"
    && measuredMaximumBodyRadiusScale === null
  ) {
    throw new Error("native cloth measured ring spacing requires a body cap");
  }
  return Object.freeze({
    spacingSource: profile.spacingSource,
    spacingScale,
    measuredMaximumBodyRadiusScale,
  });
}

function normalizeTopology(topology, pointCount) {
  if (!Array.isArray(topology?.constraints)) {
    throw new TypeError("native cloth topology has no constraints");
  }
  const rowCount = Number(topology.rowCount);
  const columnCount = Number(topology.columnCount);
  if (
    !Number.isSafeInteger(rowCount)
    || rowCount < 2
    || !Number.isSafeInteger(columnCount)
    || columnCount < 1
    || rowCount * columnCount !== pointCount
    || topology.constraints.length !== pointCount
  ) {
    throw new Error("native cloth topology does not describe its lattice");
  }
  const controlType = Number(topology.controlType);
  if (!OPEN_PANEL_TYPES.has(controlType) && !CLOSED_RING_TYPES.has(controlType)) {
    throw new Error(`native cloth control type ${controlType} has no solver family`);
  }
  if (
    !Array.isArray(topology.anchorSelectors)
    || topology.anchorSelectors.length !== rowCount
  ) {
    throw new Error("native cloth topology has no row anchor selectors");
  }

  const sourceToLattice = new Map();
  for (const [index, constraint] of topology.constraints.entries()) {
    const sourceIndex = constraint?.sourceVertexIndex;
    if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0) {
      throw new TypeError("native cloth constraint has no source vertex");
    }
    if (sourceToLattice.has(sourceIndex)) {
      throw new Error(`native cloth source vertex ${sourceIndex} is duplicated`);
    }
    sourceToLattice.set(sourceIndex, index);
  }

  const constraints = topology.constraints.map((constraint, index) => {
    const neighbor = name => {
      const record = constraint.neighbors?.[name];
      if (!record || record.sourceVertexIndex < 0) {
        return Object.freeze({ index: -1, restLength: 0 });
      }
      const neighborIndex = sourceToLattice.get(record.sourceVertexIndex);
      if (neighborIndex === undefined) {
        throw new Error(
          `native cloth neighbor ${record.sourceVertexIndex} is unavailable`,
        );
      }
      return Object.freeze({
        index: neighborIndex,
        restLength: finiteNonnegative(
          record.restLength,
          `${name} rest length at ${index}`,
        ),
      });
    };
    const anchorBinding = Number(constraint.anchorBinding || 0) & 0xff;
    return Object.freeze({
      pinned: (anchorBinding & 0xf0) === PINNED_ANCHOR_HIGH_NIBBLE,
      rowPrevious: neighbor("rowPrevious"),
      rowNext: neighbor("rowNext"),
      columnPrevious: neighbor("columnPrevious"),
      columnNext: neighbor("columnNext"),
    });
  });
  return Object.freeze({
    rowCount,
    columnCount,
    controlType,
    solverFamily: OPEN_PANEL_TYPES.has(controlType) ? "open-panel" : "closed-ring",
    anchorSelectors: Object.freeze(topology.anchorSelectors.map(value => Number(value))),
    pinned: Object.freeze(constraints.map(constraint => constraint.pinned)),
    constraints: Object.freeze(constraints),
    collisionMask: Number(topology.collisionMask ?? 0xffff) & 0xffff,
  });
}

function normalizeColliders(colliders, collisionMask) {
  if (colliders == null) return [];
  if (!Array.isArray(colliders)) {
    throw new TypeError("native cloth colliders must be an array");
  }
  return colliders.flatMap((collider, index) => {
    const mask = Number(collider?.collisionMaskBit ?? 0xffff) & 0xffff;
    if ((mask & collisionMask) === 0) return [];
    return [Object.freeze({
      center: finitePoint(collider?.center, `collider ${index} center`),
      radius: finiteNonnegative(collider?.radius, `collider ${index} radius`),
    })];
  });
}

function normalizeRowForces(rowForces, rowCount) {
  if (rowForces == null) {
    return Array.from({ length: rowCount }, () => [0, 0, 0]);
  }
  if (!Array.isArray(rowForces) || rowForces.length !== rowCount) {
    throw new TypeError("native cloth row forces do not match the lattice");
  }
  return rowForces.map((force, row) => finitePoint(force, `row ${row} force`));
}

function normalizePointAdvections(pointAdvections, pointCount) {
  if (pointAdvections == null) {
    return Array.from({ length: pointCount }, () => [0, 0, 0]);
  }
  if (!Array.isArray(pointAdvections) || pointAdvections.length !== pointCount) {
    throw new TypeError("native cloth point advections do not match the lattice");
  }
  return pointAdvections.map((force, index) => (
    finitePoint(force, `point ${index} advection`)
  ));
}

function projectAtDistance(center, target, distance, fallbackDirection = null) {
  let dx = target[0] - center[0];
  let dy = target[1] - center[1];
  let dz = target[2] - center[2];
  let length = Math.hypot(dx, dy, dz);
  if (length <= EPSILON && fallbackDirection) {
    dx = fallbackDirection[0];
    dy = fallbackDirection[1];
    dz = fallbackDirection[2];
    length = Math.hypot(dx, dy, dz);
  }
  if (length <= EPSILON) return [...target];
  const scale = distance / length;
  return [
    center[0] + dx * scale,
    center[1] + dy * scale,
    center[2] + dz * scale,
  ];
}

/**
 * Pure implementation of FUN_0c0af35e's ordinary positional CLTH path.
 *
 * The native solver walks rows from the anchored top, applies one profile
 * force/advection update, projects each point from its already-solved parent,
 * resolves body spheres, then performs the control-type-specific horizontal
 * pass. FUN_0c0b0512 updates auxiliary surface vectors; it is not an extra
 * positional PBD iteration.
 */
export class NativeClothSimulation {
  constructor({
    restPositions,
    restAuxiliaryEndpoints,
    topology,
    stepSeconds = DEFAULT_STEP_SECONDS,
    damping = DEFAULT_DAMPING,
    maximumCatchUpSteps = DEFAULT_MAXIMUM_CATCH_UP_STEPS,
    resetDistance = DEFAULT_RESET_DISTANCE,
    closedRingConstraintProfile = null,
  } = {}) {
    const rest = clonePoints(restPositions, "rest positions");
    const restAuxiliary = cloneMatchingPoints(
      restAuxiliaryEndpoints,
      rest.length,
      "rest auxiliary endpoints",
    );
    this.topology = normalizeTopology(topology, rest.length);
    this.stepSeconds = finitePositive(stepSeconds, "step seconds");
    const dampingByAxis = Number.isFinite(damping)
      ? [damping, damping, damping]
      : finitePoint(damping, "damping");
    if (dampingByAxis.some(value => value < 0 || value > 1)) {
      throw new TypeError("native cloth damping must be between zero and one");
    }
    if (!Number.isSafeInteger(maximumCatchUpSteps) || maximumCatchUpSteps < 1) {
      throw new TypeError(
        "native cloth maximum catch-up steps must be a positive integer",
      );
    }
    this.damping = Object.freeze(dampingByAxis);
    this.maximumCatchUpSteps = maximumCatchUpSteps;
    this.resetDistanceSquared = finiteNonnegative(
      resetDistance,
      "reset distance",
    ) ** 2;
    this.closedRingConstraintProfile = this.topology.solverFamily === "closed-ring"
      ? normalizeClosedRingProfile(closedRingConstraintProfile)
      : null;
    this.restPositions = rest;
    this.restAuxiliaryEndpoints = restAuxiliary;
    this.positions = null;
    this.auxiliaryEndpoints = null;
    this.previousPositions = null;
    this.accumulator = 0;
  }

  get active() {
    return this.positions !== null;
  }

  reset(
    basePositions = this.restPositions,
    baseAuxiliaryEndpoints = this.restAuxiliaryEndpoints,
  ) {
    const base = this.#normalizeBase(basePositions);
    const auxiliary = this.#normalizeAuxiliary(baseAuxiliaryEndpoints);
    this.positions = base.map(point => [...point]);
    this.auxiliaryEndpoints = auxiliary.map(point => [...point]);
    this.previousPositions = base.map(point => [...point]);
    this.accumulator = 0;
    return this.currentPositions();
  }

  clear() {
    this.positions = null;
    this.auxiliaryEndpoints = null;
    this.previousPositions = null;
    this.accumulator = 0;
  }

  currentPositions() {
    if (!this.positions) return null;
    return this.positions.map(point => Object.freeze([...point]));
  }

  currentAuxiliaryEndpoints() {
    if (!this.auxiliaryEndpoints) return null;
    return this.auxiliaryEndpoints.map(point => Object.freeze([...point]));
  }

  advance(deltaSeconds, {
    basePositions,
    baseAuxiliaryEndpoints,
    rowForces = null,
    pointAdvections = null,
    colliders = [],
    minimumBodyCollisionRadius = null,
  } = {}) {
    const elapsed = finiteNonnegative(deltaSeconds, "elapsed time");
    const base = this.#normalizeBase(basePositions);
    const baseAuxiliary = this.#normalizeAuxiliary(baseAuxiliaryEndpoints);
    let reset = false;
    if (!this.positions) {
      this.reset(base, baseAuxiliary);
      reset = true;
    }
    const collision = normalizeColliders(
      colliders,
      this.topology.collisionMask,
    );
    const forces = normalizeRowForces(rowForces, this.topology.rowCount);
    const advections = normalizePointAdvections(
      pointAdvections,
      this.topology.constraints.length,
    );

    this.accumulator += Math.min(
      elapsed,
      this.stepSeconds * this.maximumCatchUpSteps,
    );
    let steps = 0;
    while (
      this.accumulator + Number.EPSILON >= this.stepSeconds
      && steps < this.maximumCatchUpSteps
    ) {
      this.#step(
        base,
        baseAuxiliary,
        forces,
        advections,
        collision,
        minimumBodyCollisionRadius,
      );
      this.accumulator -= this.stepSeconds;
      steps += 1;
    }
    if (steps === this.maximumCatchUpSteps) {
      this.accumulator = Math.min(this.accumulator, this.stepSeconds);
    }
    return Object.freeze({
      positions: this.currentPositions(),
      auxiliaryEndpoints: this.currentAuxiliaryEndpoints(),
      steps,
      interpolation: this.accumulator / this.stepSeconds,
      reset,
    });
  }

  #normalizeBase(basePositions) {
    const base = clonePoints(basePositions, "animated base positions");
    if (base.length !== this.restPositions.length) {
      throw new Error(
        "native cloth animated base does not match its rest positions",
      );
    }
    return base;
  }

  #normalizeAuxiliary(baseAuxiliaryEndpoints) {
    return cloneMatchingPoints(
      baseAuxiliaryEndpoints,
      this.restPositions.length,
      "animated auxiliary endpoints",
    );
  }

  #step(
    base,
    baseAuxiliary,
    rowForces,
    pointAdvections,
    colliders,
    minimumBodyCollisionRadius,
  ) {
    // FUN_0c0ae916 copies the freshly body-posed source state into the
    // current buffer before each native solve. Only the prior solved buffer
    // survives between ticks.
    const current = base.map(point => [...point]);
    const auxiliary = baseAuxiliary.map(point => [...point]);
    const previous = this.previousPositions;
    const teleported = current.some((point, index) => (
      distanceSquared(point, previous[index]) > this.resetDistanceSquared
    ));
    const { rowCount, columnCount, constraints } = this.topology;

    for (let row = FIRST_DYNAMIC_ROW; row < rowCount; row += 1) {
      const force = rowForces[row];
      for (let column = 0; column < columnCount; column += 1) {
        const index = row * columnCount + column;
        const advection = pointAdvections[index];
        const constraint = constraints[index];
        if (constraint.pinned) continue;
        const parentIndex = constraint.rowPrevious.index;
        if (parentIndex < 0) {
          throw new Error("native cloth dynamic point has no parent row");
        }
        // Native constraint record +0x10 is this point's previous solved
        // position, while +0x1c/+0x20 are the row parent's current/previous
        // positions. The freshly body-posed buffer supplies anchors and the
        // parent chain, but must not snap every dynamic point back through the
        // body at the start of each solve.
        const parentOrigin = current[parentIndex];
        const targetOrigin = teleported ? parentOrigin : previous[index];
        const parentVelocity = teleported
          ? [0, 0, 0]
          : [
              parentOrigin[0] - previous[parentIndex][0],
              parentOrigin[1] - previous[parentIndex][1],
              parentOrigin[2] - previous[parentIndex][2],
            ];
        const target = [
          targetOrigin[0]
            + parentVelocity[0] * this.damping[0]
            + force[0]
            + advection[0],
          targetOrigin[1]
            + parentVelocity[1] * this.damping[1]
            + force[1]
            + advection[1],
          targetOrigin[2]
            + parentVelocity[2] * this.damping[2]
            + force[2]
            + advection[2],
        ];
        const fallback = [
          base[index][0] - base[parentIndex][0],
          base[index][1] - base[parentIndex][1],
          base[index][2] - base[parentIndex][2],
        ];
        current[index] = projectAtDistance(
          current[parentIndex],
          target,
          constraint.rowPrevious.restLength,
          fallback,
        );
        this.#resolvePointCollisions(
          current[index],
          auxiliary[index],
          colliders,
          current[parentIndex],
          constraint.rowPrevious.restLength,
          fallback,
        ) ? 1 : 0;
      }
    }

    if (this.topology.solverFamily === "open-panel") {
      this.#solveOpenPanelColumns(current, base);
    } else {
      this.#solveClosedRings(
        current,
        base,
        minimumBodyCollisionRadius,
      );
    }
    this.#updateSurfaceAuxiliaryEndpoints(current, auxiliary);
    this.positions = current;
    this.auxiliaryEndpoints = auxiliary;
    this.previousPositions = current.map(point => [...point]);
  }

  #solveOpenPanelColumns(points, base) {
    const { rowCount, columnCount, constraints, anchorSelectors } = this.topology;
    for (let row = FIRST_DYNAMIC_ROW; row < rowCount; row += 1) {
      const selector = anchorSelectors[row];
      if (!Number.isSafeInteger(selector) || selector < 0 || selector >= columnCount) {
        throw new Error(`native cloth row ${row} anchor selector is invalid`);
      }
      for (let column = selector; column >= 0; column -= 1) {
        this.#projectColumnPoint(
          points,
          base,
          row * columnCount + column,
          "columnNext",
        );
      }
      for (let column = selector + 1; column < columnCount; column += 1) {
        this.#projectColumnPoint(
          points,
          base,
          row * columnCount + column,
          "columnPrevious",
        );
      }
    }
  }

  #projectColumnPoint(points, base, index, neighborName) {
    const constraint = this.topology.constraints[index];
    const neighbor = constraint[neighborName];
    if (constraint.pinned || neighbor.index < 0) return;
    const fallback = [
      base[index][0] - base[neighbor.index][0],
      base[index][1] - base[neighbor.index][1],
      base[index][2] - base[neighbor.index][2],
    ];
    points[index] = projectAtDistance(
      points[neighbor.index],
      points[index],
      neighbor.restLength,
      fallback,
    );
  }

  #solveClosedRings(points, base, minimumBodyCollisionRadius) {
    const { rowCount, columnCount, constraints } = this.topology;
    const profile = this.closedRingConstraintProfile;
    let maximumMeasuredSpacing = null;
    if (profile.spacingSource === "measured") {
      maximumMeasuredSpacing = finitePositive(
        minimumBodyCollisionRadius,
        "minimum body-collision radius",
      ) * profile.measuredMaximumBodyRadiusScale;
    }
    for (let row = FIRST_DYNAMIC_ROW; row < rowCount; row += 1) {
      let lengthTotal = 0;
      let lengthCount = 0;
      for (let column = 0; column < columnCount; column += 1) {
        const index = row * columnCount + column;
        const next = constraints[index].columnNext;
        if (next.index < 0) continue;
        lengthTotal += Math.sqrt(distanceSquared(points[index], points[next.index]));
        lengthCount += 1;
      }
      const measuredSpacing = Math.min(
        lengthCount > 0 ? lengthTotal / lengthCount : 0,
        maximumMeasuredSpacing ?? Infinity,
      );
      for (let column = 0; column < columnCount; column += 1) {
        const index = row * columnCount + column;
        if (constraints[index].pinned) continue;
        const previous = constraints[index].columnPrevious;
        const next = constraints[index].columnNext;
        if (previous.index < 0 || next.index < 0) continue;
        const spacing = profile.spacingSource === "authored"
          ? previous.restLength * profile.spacingScale
          : measuredSpacing;
        const fromPrevious = projectAtDistance(
          points[previous.index],
          points[index],
          spacing,
          [
            base[index][0] - base[previous.index][0],
            base[index][1] - base[previous.index][1],
            base[index][2] - base[previous.index][2],
          ],
        );
        const fromNext = projectAtDistance(
          points[next.index],
          points[index],
          spacing,
          [
            base[index][0] - base[next.index][0],
            base[index][1] - base[next.index][1],
            base[index][2] - base[next.index][2],
          ],
        );
        points[index][0] = (fromPrevious[0] + fromNext[0]) * 0.5;
        points[index][1] = (fromPrevious[1] + fromNext[1]) * 0.5;
        points[index][2] = (fromPrevious[2] + fromNext[2]) * 0.5;
      }
    }
  }

  #resolvePointCollisions(
    point,
    auxiliaryEndpoint,
    colliders,
    rowParent,
    rowRestLength,
    rowFallback,
  ) {
    for (const collider of colliders) {
      const radius = collider.radius;
      const dx = point[0] - collider.center[0];
      const dy = point[1] - collider.center[1];
      const dz = point[2] - collider.center[2];
      const pointDistanceSquared = dx * dx + dy * dy + dz * dz;
      if (pointDistanceSquared >= radius * radius) continue;
      const direction = subtract(auxiliaryEndpoint, point);
      const directionLengthSquared = dot(direction, direction);
      if (directionLengthSquared <= EPSILON) {
        throw new Error("native cloth collision auxiliary is degenerate");
      }
      const centerDelta = subtract(point, collider.center);
      const linear = 2 * dot(direction, centerDelta);
      const constant = dot(centerDelta, centerDelta) - radius * radius;
      const discriminant = (
        linear * linear - 4 * directionLengthSquared * constant
      );
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        let distance = (
          -linear + root
        ) / (2 * directionLengthSquared);
        if (distance < 0) {
          distance = (-linear - root) / (2 * directionLengthSquared);
        }
        point[0] += direction[0] * distance;
        point[1] += direction[1] * distance;
        point[2] += direction[2] * distance;
      }
      copyPoint(
        point,
        projectAtDistance(
          rowParent,
          point,
          rowRestLength,
          rowFallback,
        ),
      );
    }
  }

  #updateSurfaceAuxiliaryEndpoints(points, auxiliary) {
    const { rowCount, columnCount, constraints } = this.topology;
    for (let row = FIRST_DYNAMIC_ROW; row < rowCount; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        const index = row * columnCount + column;
        const constraint = constraints[index];
        const parentIndex = constraint.rowPrevious.index;
        const hasPreviousColumn = constraint.columnPrevious.index >= 0;
        const horizontalIndex = hasPreviousColumn
          ? constraint.columnPrevious.index
          : constraint.columnNext.index;
        if (parentIndex < 0 || horizontalIndex < 0) continue;

        let normal = cross(
          subtract(points[parentIndex], points[index]),
          subtract(points[horizontalIndex], points[index]),
        );
        if (!hasPreviousColumn) normal = normal.map(value => -value);
        const parentNormal = subtract(
          auxiliary[parentIndex],
          points[parentIndex],
        );
        if (dot(normal, parentNormal) < 0) {
          normal = normal.map(value => -value);
        }
        const length = Math.hypot(...normal);
        if (length <= EPSILON) continue;
        auxiliary[index][0] = points[index][0] + normal[0] / length;
        auxiliary[index][1] = points[index][1] + normal[1] / length;
        auxiliary[index][2] = points[index][2] + normal[2] / length;
      }
    }
  }
}

export const NATIVE_CLOTH_SIMULATION_DEFAULTS = Object.freeze({
  stepSeconds: DEFAULT_STEP_SECONDS,
  damping: DEFAULT_DAMPING,
  maximumCatchUpSteps: DEFAULT_MAXIMUM_CATCH_UP_STEPS,
  resetDistance: DEFAULT_RESET_DISTANCE,
});

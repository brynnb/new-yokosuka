import * as BABYLON from "@babylonjs/core";

import {
  NativeArticulatedSurfaceMotion,
} from "./NativeArticulatedSurfaceMotion.js";
import {
  NATIVE_OSAG_CHAIN_NODE_TYPE,
  nativeSecondaryMotionNodeTypes,
  nativeSecondaryMotionProfile,
} from "./NativeSecondaryMotionProfiles.js";
import {
  buildNativeActorCollisionProxy,
  nativeSecondaryMotionCollisionProfile,
  nativeSecondaryMotionNodeCollisionParameters,
  resolveNativeActorCollision,
} from "./NativeSecondaryMotionCollision.js";

const NATIVE_FRAME_SECONDS = 1 / 30;
const EPSILON = 1e-8;

function nodeType(node) {
  return (node?.flag ?? -1) & 0xffff;
}

function finiteMatrix(value) {
  return (
    value !== null
    && typeof value === "object"
    && value.length === 16
    && value.every(Number.isFinite)
  );
}

function positionFromMatrix(matrix) {
  return new BABYLON.Vector3(matrix[12], matrix[13], matrix[14]);
}

function renderSpace(model) {
  return (
    model.renderRoot?._mt5CharacterContentRoot
    || model.renderRoot
  );
}

function transformPoint(point, matrix) {
  return BABYLON.Vector3.TransformCoordinates(point, matrix);
}

function perpendicularTo(direction) {
  const candidate = Math.abs(direction.y) < 0.9
    ? BABYLON.Axis.Y
    : BABYLON.Axis.X;
  return BABYLON.Vector3.Cross(direction, candidate).normalize();
}

function rotationBetween(fromValue, toValue) {
  const from = fromValue.normalizeToNew();
  const to = toValue.normalizeToNew();
  const dot = BABYLON.Scalar.Clamp(BABYLON.Vector3.Dot(from, to), -1, 1);
  if (dot > 1 - EPSILON) return BABYLON.Matrix.Identity();
  const axis = dot < -1 + EPSILON
    ? perpendicularTo(from)
    : BABYLON.Vector3.Cross(from, to).normalize();
  return BABYLON.Matrix.RotationAxis(axis, Math.acos(dot));
}

function multiplyMatrices(left, right) {
  const result = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        result[row * 4 + column] += (
          left[row * 4 + inner] * right[inner * 4 + column]
        );
      }
    }
  }
  return result;
}

function clampVectorLength(vector, maximum) {
  const lengthSquared = vector.lengthSquared();
  if (lengthSquared <= maximum * maximum) return vector;
  return vector.scale(maximum / Math.sqrt(lengthSquared));
}

function constrainDirection(directionValue, restValue, maximumRadians) {
  const direction = directionValue.normalizeToNew();
  const rest = restValue.normalizeToNew();
  const dot = BABYLON.Scalar.Clamp(
    BABYLON.Vector3.Dot(rest, direction),
    -1,
    1,
  );
  const angle = Math.acos(dot);
  if (angle <= maximumRadians) return direction;
  const axis = dot < -1 + EPSILON
    ? perpendicularTo(rest)
    : BABYLON.Vector3.Cross(rest, direction).normalize();
  return BABYLON.Vector3.TransformNormal(
    rest,
    BABYLON.Matrix.RotationAxis(axis, maximumRadians),
  ).normalize();
}

export function buildNativeSecondaryMotionRestPoints(
  nodeWorldOrigins,
  nodeParameters,
) {
  if (
    !Array.isArray(nodeWorldOrigins)
    || nodeWorldOrigins.length < 2
    || nodeWorldOrigins.length !== nodeParameters?.length
  ) {
    throw new TypeError(
      "native secondary-motion rest data must match the OSAG nodes",
    );
  }
  const points = [nodeWorldOrigins[0].clone()];
  for (let index = 0; index < nodeWorldOrigins.length; index += 1) {
    const authoredDirection = index < nodeWorldOrigins.length - 1
      ? nodeWorldOrigins[index + 1].subtract(nodeWorldOrigins[index])
      : nodeWorldOrigins[index].subtract(nodeWorldOrigins[index - 1]);
    if (authoredDirection.lengthSquared() <= EPSILON) {
      throw new Error("native secondary-motion segment direction is unavailable");
    }
    points.push(
      points[index].add(
        authoredDirection.normalize().scale(nodeParameters[index].radius),
      ),
    );
  }
  return points;
}

export function discoverNativeSecondaryMotionChains(
  modelRoot,
  { nodeTypes = [NATIVE_OSAG_CHAIN_NODE_TYPE] } = {},
) {
  const supportedTypes = new Set(nodeTypes);
  const nodes = modelRoot?._mt5Nodes || [];
  const byAddress = new Map(nodes.map(node => [node.addr, node]));
  const roots = nodes.filter(node => (
    supportedTypes.has(nodeType(node))
    && nodeType(byAddress.get(node.parentAddr)) !== nodeType(node)
  ));
  const chains = [];
  for (const root of roots) {
    const chain = [];
    const visited = new Set();
    let current = root;
    while (
      current
      && nodeType(current) === nodeType(root)
      && !visited.has(current.addr)
    ) {
      chain.push(current);
      visited.add(current.addr);
      current = byAddress.get(current.child);
    }
    if (chain.length >= 2) chains.push(Object.freeze([...chain]));
  }
  return Object.freeze(chains);
}

export class NativeSecondaryMotionChain {
  constructor(nodes, profile, turbulenceSeed = 0) {
    this.nodes = nodes;
    this.profile = profile;
    this.points = null;
    this.previousPoints = null;
    this.segmentLengths = null;
    this.frame = 0;
    this.turbulenceSeed = Number(turbulenceSeed) | 0;
  }

  reset(baseWorldPoints) {
    this.points = baseWorldPoints.map(point => point.clone());
    this.previousPoints = baseWorldPoints.map(point => point.clone());
    this.segmentLengths = baseWorldPoints.slice(1).map(
      (point, index) => BABYLON.Vector3.Distance(
        baseWorldPoints[index],
        point,
      ),
    );
    this.frame = 0;
  }

  #turbulence(index) {
    if (!(this.profile.turbulenceStep > 0)) return BABYLON.Vector3.Zero();
    // The native 0x79 handler obtains a fresh random vector for each node.
    // Use a deterministic integer hash so seek/replay is stable while
    // retaining that per-node stochastic contract. Magnitudes come from the
    // live OP02 handler capture above; the native PRNG seed is intentionally
    // not treated as authored cutscene data.
    let state = Math.imul(this.frame + 1, 0x9e3779b1)
      ^ Math.imul(index + 1, 0x85ebca6b)
      ^ this.turbulenceSeed;
    const component = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) / 0xffffffff) * 2 - 1;
    };
    const vector = new BABYLON.Vector3(
      component(),
      component() * (this.profile.turbulenceVerticalScale ?? 1),
      component(),
    );
    if (vector.lengthSquared() <= EPSILON) return BABYLON.Vector3.Zero();
    return vector.normalize().scale(this.profile.turbulenceStep);
  }

  update(baseWorldPoints, collision = null) {
    if (
      !this.points
      || this.points.length !== baseWorldPoints.length
      || BABYLON.Vector3.Distance(
        this.points[0],
        baseWorldPoints[0],
      ) > this.profile.resetDistance
    ) {
      this.reset(baseWorldPoints);
      if (collision) this.#resolveCollision(collision, baseWorldPoints);
      return this.points;
    }

    const next = [baseWorldPoints[0].clone()];
    for (let index = 1; index < this.points.length; index += 1) {
      const current = this.points[index];
      const velocity = current.subtract(this.previousPoints[index]).scale(
        this.profile.damping,
      );
      const restoring = baseWorldPoints[index].subtract(current).scale(
        this.profile.restoring,
      );
      const nativeGravityStep = this.profile.gravityStepByMode
        ? (
            this.profile.gravityStepByMode[index - 1]
            ?? this.profile.gravityStepByMode.default
          )
        : this.profile.gravity * NATIVE_FRAME_SECONDS * NATIVE_FRAME_SECONDS;
      const gravityStep = new BABYLON.Vector3(0, -nativeGravityStep, 0);
      const displacement = clampVectorLength(
        velocity.add(restoring).add(gravityStep).add(this.#turbulence(index)),
        this.profile.maximumStepDistance,
      );
      next.push(current.add(displacement));
    }

    for (
      let iteration = 0;
      iteration < this.profile.constraintIterations;
      iteration += 1
    ) {
      next[0].copyFrom(baseWorldPoints[0]);
      for (let index = 1; index < next.length; index += 1) {
        this.#constrainPoint(next, index, baseWorldPoints);
      }
    }

    this.previousPoints = this.points;
    this.points = next;
    this.frame += 1;
    if (collision) this.#resolveCollision(collision, baseWorldPoints);
    return this.points;
  }

  #constrainPoint(points, index, baseWorldPoints) {
    const delta = points[index].subtract(points[index - 1]);
    if (delta.lengthSquared() <= EPSILON) {
      const fallback = baseWorldPoints[index]
        .subtract(baseWorldPoints[index - 1])
        .normalize()
        .scale(this.segmentLengths[index - 1]);
      points[index].copyFrom(points[index - 1].add(fallback));
      return;
    }
    const restDirection = baseWorldPoints[index]
      .subtract(baseWorldPoints[index - 1]);
    const constrainedDirection = constrainDirection(
      delta,
      restDirection,
      this.profile.maximumDeflectionRadians,
    );
    points[index].copyFrom(
      points[index - 1].add(
        constrainedDirection.scale(this.segmentLengths[index - 1]),
      ),
    );
  }

  #resolveCollision({
    spans,
    nodeParameters,
    projection,
  }, baseWorldPoints) {
    if (nodeParameters.length !== this.points.length - 1) {
      throw new Error("native collision data do not match the OSAG chain");
    }
    // Each native OSAG record owns the endpoint following its rendered node
    // origin. Resolve root-to-tip so an endpoint corrected against the body is
    // immediately the origin used to constrain the following native record.
    // The root origin itself is body-animated and is never a collision query.
    for (let index = 0; index < nodeParameters.length; index += 1) {
      const pointIndex = index + 1;
      this.#constrainPoint(this.points, pointIndex, baseWorldPoints);
      const resolved = resolveNativeActorCollision(
        this.points[index],
        this.points[pointIndex],
        spans,
        {
          nodeRadius: nodeParameters[index].radius,
          clearance: nodeParameters[index].clearance,
          projection,
        },
      );
      if (!resolved.hit) continue;
      // FUN_0c132e14 stores the corrected endpoint at OSAG +0x68 while the
      // preceding endpoint remains at +0x5c. Contact therefore participates
      // in the next native inertia calculation; do not rewrite prior state.
      this.points[pointIndex].copyFrom(resolved.point);
    }
  }
}

class NativeSecondaryMotionModelState {
  constructor(model) {
    this.model = model;
    this.collisionProfile = nativeSecondaryMotionCollisionProfile(
      model.modelCode,
    );
    this.runtimeMode = Number.isSafeInteger(
      model.nativeSecondaryMotionRuntimeMode,
    ) ? model.nativeSecondaryMotionRuntimeMode : 0;
    const supportedNodeTypes = nativeSecondaryMotionNodeTypes({
      modelCode: model.modelCode,
      runtimeMode: this.runtimeMode,
    });
    this.chains = discoverNativeSecondaryMotionChains(model.renderRoot, {
      nodeTypes: supportedNodeTypes,
    }).map(
      (nodes, chainIndex) => {
        const profile = nativeSecondaryMotionProfile({
          modelCode: model.modelCode,
          nodeType: nodeType(nodes[0]),
          runtimeMode: this.runtimeMode,
        });
        const solver = profile.behavior === "articulated-surface"
          ? new NativeArticulatedSurfaceMotion(nodes, profile)
          : new NativeSecondaryMotionChain(
              nodes,
              profile,
              Math.imul(chainIndex + 1, 0xc2b2ae35),
            );
        return Object.freeze({ nodes, profile, solver });
      },
    );
  }

  get active() {
    return this.chains.length > 0;
  }

  baseMatrices() {
    return this.model.loader.characterRigWorldMatrices(
      this.model.renderRoot,
      this.model.latestRetargetedRoutes || null,
    );
  }

  restoreBasePose() {
    return this.model.loader.applyCharacterRigResolvedWorldMatrices(
      this.model.renderRoot,
      this.baseMatrices(),
    );
  }

  update() {
    const { loader, renderRoot } = this.model;
    const baseMatrices = this.baseMatrices();
    const resolvedMatrices = new Map(baseMatrices);
    const space = renderSpace(this.model);
    const spaceMatrix = space.computeWorldMatrix(true).clone();
    const inverseSpaceMatrix = BABYLON.Matrix.Invert(spaceMatrix);
    const collisionProxy = buildNativeActorCollisionProxy({
      profile: this.collisionProfile,
      controllerFamily: this.model.latestControllerFamily,
      controllerMatrices: this.model.latestControllerMatrices,
      spaceMatrix,
    });

    for (const chain of this.chains) {
      const baseSourcePoints = chain.nodes.map((node) => {
        const matrix = baseMatrices.get(node.addr);
        if (!finiteMatrix(matrix)) {
          throw new Error(
            `native secondary-motion node 0x${node.addr.toString(16)} has no matrix`,
          );
        }
        return positionFromMatrix(matrix);
      });
      const usesBodyCollision = (
        nodeType(chain.nodes[0]) === NATIVE_OSAG_CHAIN_NODE_TYPE
      );
      const nodeParameters = collisionProxy && usesBodyCollision
        ? nativeSecondaryMotionNodeCollisionParameters(
            chain.nodes,
            this.collisionProfile,
            spaceMatrix,
          )
        : null;
      const solverParameters = nodeParameters || chain.nodes.map(
        (node, index) => {
          const source = chain.nodes[index + 1] || node;
          return Object.freeze({
            radius: Math.hypot(source.pos.x, source.pos.y, source.pos.z),
          });
        },
      );
      const baseWorldPoints = buildNativeSecondaryMotionRestPoints(
        baseSourcePoints.map(point => transformPoint(point, spaceMatrix)),
        solverParameters,
      );
      const collision = collisionProxy && nodeParameters
        ? {
            spans: collisionProxy.spans,
            nodeParameters,
            projection: collisionProxy.projection,
          }
        : null;
      const simulatedWorldPoints = chain.solver.update(
        baseWorldPoints,
        collision,
      );
      const baseSolverSourcePoints = baseWorldPoints.map(
        point => transformPoint(point, inverseSpaceMatrix),
      );
      const simulatedSourcePoints = simulatedWorldPoints.map(
        point => transformPoint(point, inverseSpaceMatrix),
      );

      for (let index = 0; index < chain.nodes.length; index += 1) {
        const node = chain.nodes[index];
        const baseMatrix = baseMatrices.get(node.addr);
        const baseDirection = baseSolverSourcePoints[index + 1]
          .subtract(baseSolverSourcePoints[index]);
        const simulatedDirection = simulatedSourcePoints[index + 1]
          .subtract(simulatedSourcePoints[index]);
        if (
          baseDirection.lengthSquared() <= EPSILON
          || simulatedDirection.lengthSquared() <= EPSILON
        ) continue;
        const deltaRotation = rotationBetween(
          baseDirection,
          simulatedDirection,
        );
        const resolved = multiplyMatrices(
          baseMatrix,
          deltaRotation.asArray(),
        );
        resolved[12] = simulatedSourcePoints[index].x;
        resolved[13] = simulatedSourcePoints[index].y;
        resolved[14] = simulatedSourcePoints[index].z;
        resolvedMatrices.set(node.addr, resolved);
      }
    }

    return loader.applyCharacterRigResolvedWorldMatrices(
      renderRoot,
      resolvedMatrices,
    );
  }
}

export class NativeSecondaryMotionPresentation {
  constructor({ actors } = {}) {
    if (typeof actors?.activeActor !== "function") {
      throw new TypeError(
        "native secondary-motion presentation requires actor resolution",
      );
    }
    this.actors = actors;
    this.modelStates = new WeakMap();
    this.active = null;
  }

  reset() {
    if (this.active) return false;
    this.modelStates = new WeakMap();
    return true;
  }

  begin(owner, actorTags) {
    if (this.active) {
      throw new Error("native secondary motion is already owned");
    }
    const states = [];
    for (const actorTag of actorTags) {
      const model = this.actors.activeActor(actorTag)?.model;
      if (
        !model?.loader
        || !model?.renderRoot
        || model.characterAssetFormat === "MT7"
      ) continue;
      let state = this.modelStates.get(model);
      if (!state) {
        state = new NativeSecondaryMotionModelState(model);
        this.modelStates.set(model, state);
      }
      if (state.active && !states.includes(state)) states.push(state);
    }
    this.active = { owner, states };
    return true;
  }

  apply(owner) {
    if (this.active?.owner !== owner) return false;
    for (const state of this.active.states) {
      if (state.update() !== true) return false;
    }
    return true;
  }

  end(owner) {
    if (this.active?.owner !== owner) return false;
    const states = this.active.states;
    this.active = null;
    for (const state of states) state.restoreBasePose();
    return true;
  }
}

export function createNativeSecondaryMotionPresentation(options) {
  return new NativeSecondaryMotionPresentation(options);
}

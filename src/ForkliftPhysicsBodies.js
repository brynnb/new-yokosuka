import * as BABYLON from "@babylonjs/core";
import { FORKLIFT_MAXIMUM_LIFT } from "./ForkliftRig.js";
import {
  COLLISION,
  DEFAULT_FORKLIFT_PHYSICS_TUNING,
  FORKLIFT_CHASSIS_CENTER,
  FORKLIFT_ENTRY_SETTLE_SECONDS,
  FORKLIFT_FORK_ASSEMBLY_MASS,
  FORKLIFT_HYDRAULIC_FORCE,
  FORKLIFT_TINE_CENTER_X,
  FORKLIFT_TINE_CENTER_Y,
  FORKLIFT_TINE_CENTER_Z,
  FORKLIFT_TINE_DIMENSIONS,
  FORKLIFT_UPRIGHT_FRICTION,
  clamp,
  forkliftBodyCollideMask,
  forkliftCompoundTineCollideMask,
  forkliftCompoundTineTranslation,
  setShapeFilters,
  transformedPoint,
} from "./ForkliftCargoRules.js";

export async function ensureForkliftPhysics(scene) {
  if (scene.getPhysicsEngine()) return scene.getPhysicsEngine();
  const [
    { default: HavokPhysics },
    { default: havokWasmUrl },
  ] = await Promise.all([
    import("@babylonjs/havok"),
    import("@babylonjs/havok/lib/esm/HavokPhysics.wasm?url"),
  ]);
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  scene.enablePhysics(
    new BABYLON.Vector3(0, -9.81, 0),
    new BABYLON.HavokPlugin(true, havok),
  );
  scene.getPhysicsEngine()?.setTimeStep(1 / 60);
  return scene.getPhysicsEngine();
}

export function createAnimatedBox({
  scene,
  bodyKinds,
  name,
  extents,
  membership,
  collide,
  localCenter = null,
  initialPosition = null,
  animated = true,
}) {
  const node = new BABYLON.TransformNode(name, scene);
  if (initialPosition) node.position.copyFrom(initialPosition);
  node.rotationQuaternion = BABYLON.Quaternion.Identity();
  node.metadata = { cargoPhysicsProxy: true, localCenter };
  const shape = new BABYLON.PhysicsShapeBox(
    BABYLON.Vector3.Zero(),
    BABYLON.Quaternion.Identity(),
    extents,
    scene,
  );
  setShapeFilters(shape, membership, collide);
  shape.material = { friction: 0.72, restitution: 0.005 };
  const aggregate = new BABYLON.PhysicsAggregate(
    node,
    shape,
    { mass: 0, friction: 0.72, restitution: 0.005 },
    scene,
  );
  if (animated) {
    aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
  }
  bodyKinds.set(aggregate.body, name);
  return {
    node,
    aggregate,
    shape,
    localCenter,
    halfExtents: extents.scale(0.5),
    pose: {
      position: initialPosition?.clone()
        || new BABYLON.Vector3(0, -1000, 0),
      orientation: BABYLON.Quaternion.Identity(),
    },
  };
}

export function createDynamicForkliftBodies({
  scene,
  bodyKinds,
  id,
  position,
  orientation,
  linearVelocity = BABYLON.Vector3.Zero(),
  angularVelocity = BABYLON.Vector3.Zero(),
  tuning = {},
  forkLift = 0,
  elapsedSeconds = 0,
}) {
  const rotation = orientation.clone().normalize();
  const center = transformedPoint(
    position,
    new BABYLON.Vector3(
      FORKLIFT_CHASSIS_CENTER.x,
      FORKLIFT_CHASSIS_CENTER.y,
      FORKLIFT_CHASSIS_CENTER.z,
    ),
    rotation,
  );
  const node = new BABYLON.TransformNode(
    `forklift_dynamic_chassis_${id}`,
    scene,
  );
  node.position.copyFrom(center);
  node.rotationQuaternion = rotation.clone();
  node.metadata = { cargoPhysicsProxy: true };
  const chassisShape = new BABYLON.PhysicsShapeBox(
    // Leave the chassis clear of the road while upright so its four wheel
    // contacts, rather than a sliding box face, support and drive it. The
    // body still reaches the ground naturally when the forklift tips.
    new BABYLON.Vector3(0, 0.125, 0),
    BABYLON.Quaternion.Identity(),
    new BABYLON.Vector3(1.28, 1.5, 1.35),
    scene,
  );
  setShapeFilters(
    chassisShape,
    COLLISION.forkliftBody,
    forkliftBodyCollideMask(),
  );
  chassisShape.material = {
    friction: FORKLIFT_UPRIGHT_FRICTION,
    restitution: 0.001,
  };
  const initialForkLift = clamp(
    Number(forkLift) || 0,
    0,
    FORKLIFT_MAXIMUM_LIFT,
  );
  const chassisMass = Math.max(
    1,
    (Number(tuning.mass) || DEFAULT_FORKLIFT_PHYSICS_TUNING.mass)
      - FORKLIFT_FORK_ASSEMBLY_MASS,
  );
  const aggregate = new BABYLON.PhysicsAggregate(
    node,
    chassisShape,
    {
      mass: chassisMass,
      friction: FORKLIFT_UPRIGHT_FRICTION,
      restitution: 0.001,
    },
    scene,
  );
  aggregate.body.setLinearDamping(0.06);
  aggregate.body.setAngularDamping(0.22);
  aggregate.body.setLinearVelocity(linearVelocity);
  aggregate.body.setAngularVelocity(angularVelocity);

  const forkNode = new BABYLON.TransformNode(
    `forklift_dynamic_forks_${id}`,
    scene,
  );
  forkNode.position.copyFrom(transformedPoint(
    position,
    new BABYLON.Vector3(
      0,
      FORKLIFT_TINE_CENTER_Y + initialForkLift,
      FORKLIFT_TINE_CENTER_Z,
    ),
    rotation,
  ));
  forkNode.rotationQuaternion = rotation.clone();
  forkNode.metadata = { cargoPhysicsProxy: true };
  const tineShapes = [
    -FORKLIFT_TINE_CENTER_X,
    FORKLIFT_TINE_CENTER_X,
  ].map(() => {
    const tineShape = new BABYLON.PhysicsShapeBox(
      BABYLON.Vector3.Zero(),
      BABYLON.Quaternion.Identity(),
      new BABYLON.Vector3(
        FORKLIFT_TINE_DIMENSIONS.x,
        FORKLIFT_TINE_DIMENSIONS.y,
        FORKLIFT_TINE_DIMENSIONS.z,
      ),
      scene,
    );
    setShapeFilters(
      tineShape,
      COLLISION.forkliftTine,
      forkliftCompoundTineCollideMask(initialForkLift),
    );
    tineShape.material = { friction: 0.68, restitution: 0.001 };
    return tineShape;
  });
  const forkShape = new BABYLON.PhysicsShapeContainer(scene);
  for (const [index, x] of [
    -FORKLIFT_TINE_CENTER_X,
    FORKLIFT_TINE_CENTER_X,
  ].entries()) {
    forkShape.addChild(
      tineShapes[index],
      new BABYLON.Vector3(x, 0, 0),
      BABYLON.Quaternion.Identity(),
      BABYLON.Vector3.One(),
    );
  }
  setShapeFilters(
    forkShape,
    COLLISION.forkliftTine,
    forkliftCompoundTineCollideMask(initialForkLift),
  );
  const forkAggregate = new BABYLON.PhysicsAggregate(
    forkNode,
    forkShape,
    {
      mass: FORKLIFT_FORK_ASSEMBLY_MASS,
      friction: 0.68,
      restitution: 0.001,
    },
    scene,
  );
  forkAggregate.body.setLinearDamping(0.04);
  forkAggregate.body.setAngularDamping(0.1);
  forkAggregate.body.setLinearVelocity(linearVelocity);
  forkAggregate.body.setAngularVelocity(angularVelocity);
  const axes = [
    BABYLON.PhysicsConstraintAxis.LINEAR_X,
    BABYLON.PhysicsConstraintAxis.LINEAR_Y,
    BABYLON.PhysicsConstraintAxis.LINEAR_Z,
    BABYLON.PhysicsConstraintAxis.ANGULAR_X,
    BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
    BABYLON.PhysicsConstraintAxis.ANGULAR_Z,
  ];
  const forkConstraint = new BABYLON.Physics6DoFConstraint(
    {
      pivotA: forkliftCompoundTineTranslation(0, 0),
      pivotB: BABYLON.Vector3.Zero(),
      axisA: BABYLON.Axis.Y,
      axisB: BABYLON.Axis.Y,
      perpAxisA: BABYLON.Axis.X,
      perpAxisB: BABYLON.Axis.X,
      collision: false,
    },
    axes.map((axis) => (
      axis === BABYLON.PhysicsConstraintAxis.LINEAR_X
        ? { axis, minLimit: 0, maxLimit: FORKLIFT_MAXIMUM_LIFT }
        : { axis, minLimit: 0, maxLimit: 0 }
    )),
    scene,
  );
  aggregate.body.addConstraint(forkAggregate.body, forkConstraint);
  forkConstraint.setAxisMotorType(
    BABYLON.PhysicsConstraintAxis.LINEAR_X,
    BABYLON.PhysicsConstraintMotorType.POSITION,
  );
  forkConstraint.setAxisMotorMaxForce(
    BABYLON.PhysicsConstraintAxis.LINEAR_X,
    FORKLIFT_HYDRAULIC_FORCE,
  );
  forkConstraint.setAxisMotorTarget(
    BABYLON.PhysicsConstraintAxis.LINEAR_X,
    initialForkLift,
  );
  const dynamic = {
    node,
    shape: chassisShape,
    chassisShape,
    forkNode,
    forkShape,
    forkAggregate,
    forkConstraint,
    tineShapes,
    forkTargetLift: initialForkLift,
    aggregate,
    surfaceFriction: FORKLIFT_UPRIGHT_FRICTION,
    settling: true,
    settleUntil: elapsedSeconds + FORKLIFT_ENTRY_SETTLE_SECONDS,
    settleChassisPosition: node.position.clone(),
    settleForkPosition: forkNode.position.clone(),
    settleOrientation: rotation.clone(),
    previousForwardSpeed: 0,
    filteredForwardAcceleration: 0,
  };
  aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
  forkAggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
  aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
  aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
  forkAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
  forkAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
  bodyKinds.set(aggregate.body, "activeForklift");
  bodyKinds.set(forkAggregate.body, "activeForklift");
  return dynamic;
}

export function disposeDynamicForkliftBodies(dynamic, bodyKinds) {
  if (!dynamic) return;
  bodyKinds.delete(dynamic.aggregate.body);
  bodyKinds.delete(dynamic.forkAggregate.body);
  dynamic.forkConstraint.dispose();
  dynamic.forkAggregate.dispose();
  dynamic.forkShape.dispose();
  for (const tineShape of dynamic.tineShapes) tineShape.dispose();
  dynamic.forkNode.dispose();
  dynamic.aggregate.dispose();
  dynamic.chassisShape.dispose();
  dynamic.node.dispose();
}

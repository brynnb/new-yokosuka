import * as BABYLON from "@babylonjs/core";
import {
  createForkliftChassisState,
} from "../../src/ForkliftChassisDynamics.js";
import { trailCameraYaw } from "../../src/ThirdPersonController.js";

export class ForkliftController {
  constructor({
    getController,
    getMobileLiftInput,
    getInputSnapshot = () => null,
  }) {
    this.getController = getController;
    this.getMobileLiftInput = getMobileLiftInput;
    this.getInputSnapshot = getInputSnapshot;
    this.cameraManuallyPositioned = false;
  }

  readInput() {
    const controller = this.getController();
    if (!controller || controller.movementLocked) {
      return { throttle: 0, steering: 0, lift: 0, horn: false };
    }
    const snapshot = this.getInputSnapshot();
    if (snapshot) {
      return {
        throttle: BABYLON.Scalar.Clamp(snapshot.value("throttle"), -1, 1),
        steering: BABYLON.Scalar.Clamp(snapshot.value("steering"), -1, 1),
        lift: BABYLON.Scalar.Clamp(snapshot.value("lift"), -1, 1),
        horn: snapshot.held("horn"),
      };
    }
    const keys = controller.keys;
    const throttle = (
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0)
      - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0)
      + controller.touchInput.y
      + (controller.autoRun ? 1 : 0)
    );
    const steering = (
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0)
      - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0)
      + controller.touchInput.x
    );
    const lift = (
      (keys.has("KeyE") ? 1 : 0)
      - (keys.has("KeyF") ? 1 : 0)
      + this.getMobileLiftInput()
    );
    return {
      throttle: BABYLON.Scalar.Clamp(throttle, -1, 1),
      steering: BABYLON.Scalar.Clamp(steering, -1, 1),
      lift: BABYLON.Scalar.Clamp(lift, -1, 1),
      horn: keys.has("KeyH"),
    };
  }

  orientationQuaternion(
    yaw,
    chassisState,
    activeChassisState,
    physicsOrientation,
  ) {
    if (chassisState === activeChassisState && physicsOrientation) {
      return physicsOrientation.clone();
    }
    return BABYLON.Quaternion.RotationYawPitchRoll(
      yaw,
      chassisState?.pitch || 0,
      chassisState?.roll || 0,
    ).normalize();
  }

  modelOrientationQuaternion(
    yaw,
    chassisState,
    activeChassisState,
    physicsOrientation,
  ) {
    return this.orientationQuaternion(
      yaw,
      chassisState,
      activeChassisState,
      physicsOrientation,
    ).multiply(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI));
  }

  quaternionFromNetworkState(state, yaw = 0, prefix = "") {
    const quaternionPrefix = prefix ? `${prefix}Q` : "q";
    const values = [
      Number(state?.[`${quaternionPrefix}x`]),
      Number(state?.[`${quaternionPrefix}y`]),
      Number(state?.[`${quaternionPrefix}z`]),
      Number(state?.[`${quaternionPrefix}w`]),
    ];
    const length = Math.hypot(...values);
    if (
      values.every(Number.isFinite)
      && length >= 0.5
      && length <= 1.5
    ) {
      return new BABYLON.Quaternion(...values).normalize();
    }
    return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw);
  }

  chassisTiltFromOrientation(orientation) {
    const euler = orientation.toEulerAngles();
    return BABYLON.Quaternion.RotationYawPitchRoll(0, euler.x, euler.z);
  }

  chassisStateFromPhysicsPose(pose, previousState) {
    const matrix = BABYLON.Matrix.FromQuaternionToRef(
      pose.orientation,
      BABYLON.Matrix.Identity(),
    );
    const forward = BABYLON.Vector3.TransformNormal(
      BABYLON.Axis.Z,
      matrix,
    ).normalize();
    const right = BABYLON.Vector3.TransformNormal(
      BABYLON.Axis.X,
      matrix,
    ).normalize();
    const up = BABYLON.Vector3.TransformNormal(
      BABYLON.Axis.Y,
      matrix,
    ).normalize();
    const pitch = Math.atan2(-forward.y, Math.hypot(forward.x, forward.z));
    const roll = Math.atan2(right.y, up.y);
    const tipped = up.y < 0.58;
    return createForkliftChassisState({
      ...previousState,
      pitch,
      roll,
      bounce: 0,
      pitchVelocity: BABYLON.Vector3.Dot(pose.angularVelocity, right),
      rollVelocity: BABYLON.Vector3.Dot(pose.angularVelocity, forward),
      tipped,
      tippingDirection: tipped ? Math.sign(roll || 1) : 0,
      pitchTippingDirection: tipped && Math.abs(pitch) > Math.abs(roll)
        ? Math.sign(pitch || 1)
        : 0,
      previousSpeed: Number(pose.forwardSpeed) || 0,
    });
  }

  finishFrame({
    deltaSeconds,
    actorRoot,
    forkliftState,
    actualDistance,
    movementForward = null,
    terrain = null,
    updateCamera = true,
  }) {
    const controller = this.getController();
    const forward = movementForward || new BABYLON.Vector3(
      Math.sin(actorRoot.rotation.y),
      0,
      Math.cos(actorRoot.rotation.y),
    );
    const moving = Math.abs(forkliftState.speed) > 0.03;
    if (controller.rightMouseDown || controller.gamepadLookActive) {
      this.cameraManuallyPositioned = true;
    }
    const cameraFollowing = (
      moving
      && !this.cameraManuallyPositioned
      && !controller.firstPerson
      && !controller.rightMouseDown
      && !controller.gamepadLookActive
      && controller.touchLookPointerId === null
      && !controller.pointerLocked
    );
    if (controller.firstPerson) {
      controller.cameraYaw = actorRoot.rotation.y + Math.PI;
    } else if (cameraFollowing) {
      controller.cameraYaw = trailCameraYaw(
        controller.cameraYaw,
        actorRoot.rotation.y,
        controller.options.cameraTrailSpeed,
        deltaSeconds,
      );
    }
    if (updateCamera) controller.updateCamera(deltaSeconds);
    return {
      moving,
      turning: Math.abs(forkliftState.steeringAngle) > 0.01,
      running: moving,
      speed: Math.abs(forkliftState.speed),
      movement: forward.scale(Math.sign(forkliftState.speed)),
      actualDistance,
      terrain,
      pointerLocked: controller.pointerLocked,
      cameraFollowing,
      cameraDistance: controller.cameraDistance,
      cameraResolvedDistance: controller.cameraResolvedDistance,
      firstPerson: controller.firstPerson,
      noClip: controller.noClip,
      runToggled: false,
      autoRun: controller.autoRun,
      movementLocked: controller.movementLocked,
    };
  }
}

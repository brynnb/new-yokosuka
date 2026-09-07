import * as BABYLON from "@babylonjs/core";
import { exponentialResponse } from "./ThirdPersonControllerRules.js";

export function resolveCameraPosition({
  scene,
  pickWithRay = null,
  blockerPredicate,
  options,
  target,
  desired,
}) {
  const offset = desired.subtract(target);
  const desiredDistance = offset.length();
  if (desiredDistance <= 1e-8) {
    return { position: desired.clone(), distance: 0 };
  }
  const direction = offset.scale(1 / desiredDistance);
  const hit = (pickWithRay || scene.pickWithRay.bind(scene))(
    new BABYLON.Ray(target, direction, desiredDistance),
    blockerPredicate,
  );
  const distance = hit?.hit
    ? Math.max(
      options.cameraMinimumResolvedDistance,
      hit.distance - options.cameraCollisionPadding,
    )
    : desiredDistance;
  return {
    position: target.add(direction.scale(distance)),
    distance,
  };
}

export function updateControllerCamera(controller, deltaSeconds) {
  const {
    actorRoot,
    camera,
    options,
    scene,
  } = controller;
  if (controller.firstPerson) {
    const head = actorRoot.position.add(
      new BABYLON.Vector3(0, options.firstPersonHeadHeight, 0),
    );
    const backOffset = Number(options.firstPersonCameraBackOffset) || 0;
    const cameraPosition = head.add(new BABYLON.Vector3(
      Math.sin(controller.cameraYaw) * backOffset,
      0,
      Math.cos(controller.cameraYaw) * backOffset,
    ));
    const horizontal = Math.cos(controller.cameraPitch);
    const lookDirection = new BABYLON.Vector3(
      -Math.sin(controller.cameraYaw) * horizontal,
      -Math.sin(controller.cameraPitch),
      -Math.cos(controller.cameraYaw) * horizontal,
    );
    controller.cameraTarget.copyFrom(cameraPosition);
    camera.position.copyFrom(cameraPosition);
    controller.cameraResolvedDistance = 0;
    camera.setTarget(cameraPosition.add(lookDirection));
    return;
  }
  const target = actorRoot.position.add(
    new BABYLON.Vector3(0, options.cameraTargetHeight, 0),
  );
  controller.cameraTarget = BABYLON.Vector3.Lerp(
    controller.cameraTarget,
    target,
    exponentialResponse(options.cameraTargetResponse, deltaSeconds),
  );
  const horizontalDistance = (
    controller.cameraDistance * Math.cos(controller.cameraPitch)
  );
  const desired = controller.cameraTarget.add(new BABYLON.Vector3(
    Math.sin(controller.cameraYaw) * horizontalDistance,
    Math.sin(controller.cameraPitch) * controller.cameraDistance,
    Math.cos(controller.cameraYaw) * horizontalDistance,
  ));
  const resolved = resolveCameraPosition({
    scene,
    pickWithRay: (ray, predicate) => controller.pickWithRay(ray, predicate),
    blockerPredicate: controller.cameraBlockerPredicate,
    options,
    target: controller.cameraTarget,
    desired,
  });
  camera.position.copyFrom(resolved.position);
  controller.cameraResolvedDistance = resolved.distance;
  camera.setTarget(controller.cameraTarget);
}

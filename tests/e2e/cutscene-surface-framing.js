// Browser-side diagnostic only. A close-up checks mesh fit, not authored shots.
export function frameCutsceneSurface(runtime, kind, actorTag, sideName, onFrame) {
  let entry = kind === "face" ? runtime.presentation.faces.entries.get(actorTag)
    : runtime.presentation.hands.active.hands.get(actorTag).sides[sideName].side;
  if (!entry && kind === "face") {
    const face = runtime.presentation.faces.active.genericFaces.get(actorTag);
    entry = { root: face.actor.model.renderRoot, loader: face.actor.model.loader,
      primaryNode: face.speech.controller.binding.destination };
  }
  const root = entry.root, scene = root.getScene(), camera = scene.activeCamera;
  const matrix = root._mt5CharacterWorldMatrices.get(entry.primaryNode.addr);
  const content = entry.loader.characterContentRoot(root).computeWorldMatrix(true).asArray();
  const point = camera.position.clone();
  point.set(...[0, 1, 2].map(axis => matrix[12] * content[axis]
    + matrix[13] * content[4 + axis] + matrix[14] * content[8 + axis] + content[12 + axis]));
  const position = camera.position.clone(), target = camera.getTarget().clone();
  const direction = kind === "face" ? point.clone().set(...[0, 1, 2].map(axis =>
    matrix[0] * content[axis] + matrix[1] * content[4 + axis] + matrix[2] * content[8 + axis])).normalize()
    : camera.position.subtract(point).normalize();
  const closeupPosition = point.add(direction.scale(kind === "face" ? 0.65 : 0.5));
  const observer = scene.onBeforeCameraRenderObservable.add(activeCamera => {
    if (activeCamera !== camera) return;
    camera.position.copyFrom(closeupPosition); camera.setTarget(point);
    scene.setTransformMatrix(camera.getViewMatrix(true), camera.getProjectionMatrix(true));
    onFrame();
  });
  return () => {
    scene.onBeforeCameraRenderObservable.remove(observer);
    camera.position.copyFrom(position); camera.setTarget(target);
  };
}

// A prop can be held against either a detailed or a body hand. Frame the
// actual attached object without assuming which hand representation is active.
export function frameCutsceneObject(runtime, objectTag, onFrame, { reverse = false } = {}) {
  const root = runtime.attachedObjects.objects.get(objectTag).root;
  return frameSceneRoot(root, onFrame, { reverse });
}

export function frameSceneRoot(root, onFrame, { reverse = false, distance = 0.55, yOffset = 0, localCamera = null, localTarget = null } = {}) {
  const scene = root.getScene(), camera = scene.activeCamera;
  const point = root.getAbsolutePosition().clone();
  point.y += yOffset;
  const position = camera.position.clone(), target = camera.getTarget().clone();
  const direction = camera.position.subtract(point).normalize();
  if (reverse) direction.scaleInPlace(-1);
  let closeupPosition = point.add(direction.scale(distance));
  if(localCamera&&localTarget){
    const transform=values=>camera.position.constructor.TransformCoordinates(camera.position.clone().set(...values),root.computeWorldMatrix(true));
    closeupPosition=transform(localCamera);point.copyFrom(transform(localTarget));
  }
  const observer = scene.onBeforeCameraRenderObservable.add(activeCamera => {
    if (activeCamera !== camera) return;
    camera.position.copyFrom(closeupPosition); camera.setTarget(point);
    scene.setTransformMatrix(camera.getViewMatrix(true), camera.getProjectionMatrix(true));
    onFrame();
  });
  return () => {
    scene.onBeforeCameraRenderObservable.remove(observer);
    camera.position.copyFrom(position); camera.setTarget(target);
  };
}

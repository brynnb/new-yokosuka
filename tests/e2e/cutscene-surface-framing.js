// Browser-side diagnostic only. A close-up checks mesh fit, not authored shots.
export function frameCutsceneSurface(runtime, kind, actorTag, sideName, onFrame) {
  const entry = kind === "face" ? runtime.presentation.faces.entries.get(actorTag)
    : runtime.presentation.hands.active.hands.get(actorTag).sides[sideName].side;
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

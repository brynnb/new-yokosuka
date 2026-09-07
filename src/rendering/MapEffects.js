export function installWorldMt7MapEffect(root) {
  const effect = root?._mt7MapEffectDefinition;
  if (!effect || root._worldMt7MapEffectRuntime) return null;

  const textures = new Set(root.getChildMeshes(false).flatMap((mesh) => {
    const texture = mesh.material?.diffuseTexture;
    return texture ? [texture] : [];
  }));
  if (textures.size === 0) return null;
  const bindings = [...textures].map((texture) => ({
    texture,
    baseUOffset: texture.uOffset,
    baseVOffset: texture.vOffset,
  }));
  const wrapUnit = (value) => ((value % 1) + 1) % 1;
  const update = (elapsedSeconds) => {
    for (const binding of bindings) {
      binding.texture.uOffset = wrapUnit(
        binding.baseUOffset + elapsedSeconds * effect.scrollUPerSecond
      );
      binding.texture.vOffset = wrapUnit(
        binding.baseVOffset + elapsedSeconds * effect.scrollVPerSecond
      );
    }
  };

  let elapsedSeconds = 0;
  const scene = root.getScene();
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsedSeconds += Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    update(elapsedSeconds);
  });
  let removalObserver = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.onBeforeRenderObservable.remove(renderObserver);
    scene.onMeshRemovedObservable.remove(removalObserver);
  };
  removalObserver = scene.onMeshRemovedObservable.add((mesh) => {
    if (mesh === root) dispose();
  });
  root._worldMt7MapEffectRuntime = {
    effect,
    bindings,
    update,
    dispose,
  };
  return root._worldMt7MapEffectRuntime;
}

import { Axis, Quaternion } from '@babylonjs/core';
import catalog from '../../src/data/collection-model-names.json' with {type: 'json'};
import { fetchAsset, getTexturePack } from '../../src/assetLoader.js';
import { Mt5Loader } from '../../src/Mt5Loader.js';
import { configureMt5TexturePack } from '../assets/configureMt5TexturePack.js';

// The server's capsule keys use the original collection-table resource code.
// Resolve through that same source catalog, not guessed filename suffixes (the
// table includes differently-sized variants and models with irregular names).
const models = new Map(Object.entries(catalog.items).map(([model, item]) =>
  [`capsule_${item.resourceCode.toLowerCase()}`, model]));

export function collectionToyModel(key) {
  const model = models.get(key);
  if (!model) throw new Error(`No collection model is catalogued for ${key}.`);
  return model;
}

export function untilAborted(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  let abort;
  return Promise.race([promise, new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, {once: true});
  })]).finally(() => signal.removeEventListener('abort', abort));
}

export async function loadCapsuleToy(scene, model, signal) {
  if (!/^G_ITEM_[A-Z0-9]+\.MT5$/.test(model || '')) {
    throw new Error('The server did not provide a valid toy model.');
  }
  signal?.throwIfAborted();
  // Shared immutable asset reads may also serve the world or another preview.
  // Cancel our wait without cancelling those consumers, and check ownership
  // before constructing any scene objects from a late response.
  const [buffer, textures] = await untilAborted(Promise.all([
    fetchAsset(model).then(response => response.arrayBuffer()), getTexturePack(model),
  ]), signal);
  signal?.throwIfAborted();
  const loader = new Mt5Loader(scene);
  configureMt5TexturePack(loader, textures);
  const [root] = await loader.load(buffer, textures);
  if (!root) throw new Error(`Missing model ${model}`);
  if (signal?.aborted) { root.dispose(false, true); signal.throwIfAborted(); }
  for (const mesh of root.getChildMeshes(false)) {
    mesh.isPickable = false;
    mesh.checkCollisions = false;
  }
  return root;
}

export function rotateCapsuleToy(pivot, camera, yaw, pitch) {
  const turn = Quaternion.RotationAxis(camera.getDirection(Axis.Y), yaw);
  const tilt = Quaternion.RotationAxis(camera.getDirection(Axis.X), pitch);
  pivot.rotationQuaternion = tilt.multiply(turn).multiply(pivot.rotationQuaternion).normalize();
}

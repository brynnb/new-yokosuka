import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import test from 'node:test';
import * as B from '@babylonjs/core';
import {Mt7Loader} from '../src/Mt7Loader.js';
import {detectModelOverlayFaces} from '../tools/assets/model_overlay_analyzer.js';
import {compileSceneryBundle, loadSceneryBundle} from '../src/rendering/PreparedSceneryBundle.js';
import {freezeSceneRoots} from '../src/rendering/SceneResources.js';
import overlayIndex from '../play/data/mt7-overlay-manifest.json' with {type: 'json'};

const filename = 'S2DC_D1_AK00_MPK00_MAP.MT7';
const source = `.disc-work/shenmue2-models/models/${filename}`;

test('real Fortune’s Pier overlays preserve triangles, textures and depth bias through bundling', {
  skip: !existsSync(source) && 'requires extracted S2 scenery',
}, async () => {
  const engine = new B.NullEngine(); engine.doNotHandleContextLost = false;
  const scene = new B.Scene(engine);
  const overlayManifest = JSON.parse(readFileSync(`public${overlayIndex.files[filename].shard}`));
  const loader = new Mt7Loader(scene, {overlayManifest});
  const bytes = readFileSync(source);
  const textures = readFileSync('.disc-work/shenmue2-models/textures/S2DC_D1_AK00_MPK00_textures.bin');
  const vertices = root => root.getChildMeshes().flatMap(mesh => {
    const positions = mesh.getVerticesData('position');
    const uvs = mesh.getVerticesData('uv');
    const indices = mesh.getIndices();
    return Array.from({length: indices.length / 3}, (_, face) => JSON.stringify(
      Array.from(indices.slice(face * 3, face * 3 + 3)).flatMap(index => [
        ...positions.slice(index * 3, index * 3 + 3), ...uvs.slice(index * 2, index * 2 + 2),
      ]),
    ));
  }).sort();
  try {
    const [raw] = new Mt7Loader(scene).load(bytes, textures, {sourceFilename: filename, assetKind: 'MAPM'});
    const expected = vertices(raw);
    const detected = detectModelOverlayFaces(scene);
    assert.deepEqual(detected.overlays, overlayManifest.files[filename].overlays);
    raw.dispose(false, true);
    const [root] = loader.load(bytes, textures, {sourceFilename: filename, assetKind: 'MAPM'});
    root._filename = filename;
    assert.deepEqual(vertices(root), expected, 'splitting retains every original triangle and UV');
    const biased = root.getChildMeshes().filter(mesh => mesh.metadata?.mt7DepthOverlay);
    assert.ok(biased.length > 0);
    const alpha = biased.filter(mesh => mesh.material.diffuseTexture?.hasAlpha);
    assert.ok(alpha.length > 0, 'includes transparent foliage, not just opaque doors');
    assert.ok(new Set(biased.map(mesh => mesh.material)).size < biased.length, 'strips share biased materials');
    for (const mesh of biased) {
      assert.ok(mesh.material.zOffset < 0 && mesh.material.zOffset >= -8);
      assert.notEqual(mesh.material.metadata?.preserveEmissive, true);
    }
    root.metadata.shenmue2SceneAssetKind = 'MAPM';
    freezeSceneRoots([root]);
    // Texture-array rendering is exercised by the GPU test; NullEngine checks
    // serialized material/alpha ownership without pretending to have WebGL 2.
    const bundle = await compileSceneryBundle([root], {sceneryFilenames: [filename], textureArrays: false});
    const restoredScene = new B.Scene(engine);
    try {
      const restored = await loadSceneryBundle(restoredScene, bundle.manifest, bundle.binary);
      const restoredBiased = restoredScene.meshes.filter(mesh => mesh.material?.zOffset < 0);
      assert.ok(restoredBiased.length > 0);
      assert.ok(restoredBiased.some(mesh => mesh.material.diffuseTexture?.hasAlpha));
      restored.dispose();
    } finally {restoredScene.dispose();}
  } finally {scene.dispose(); loader.clearCaches(); engine.dispose();}
});

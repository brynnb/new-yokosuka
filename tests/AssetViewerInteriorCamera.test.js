import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, TransformNode } from '@babylonjs/core';
import { findInteriorViewpoint } from '../src/AssetViewerInteriorCamera.js';

test('interior framing validates room geometry and rejects unrelated or obstructed entries', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const root = new TransformNode('room', scene);
    // Room layers need not be named MAP; classification comes from the
    // extracted archive member kind, not a special-case filename.
    root._filename = 'S2DC_D2_TEST_MPK00_MAP02.MT7';
    root.metadata = {assetViewerKind:'MAPM'};
    const floor = MeshBuilder.CreateBox('floor', {width:10, depth:10, height:0.2}, scene);
    floor.position.y = -0.1; floor.parent = root;
    const ceiling = floor.clone('ceiling'); ceiling.position.y = 3.1;
    const pose = {position:[0,0,0], yaw:0, source:'fixture'};
    const view = findInteriorViewpoint([root], [pose]);
    assert.ok(view);
    assert.ok(Math.abs(view.position.y - 1.6) < 0.001);
    assert.equal(view.target.z, 2);
    assert.equal(findInteriorViewpoint([root], [{...pose, position:[100,0,100]}]), null);
    assert.equal(findInteriorViewpoint([root], [{...pose, yaw:NaN}]), null);
    const wall = MeshBuilder.CreateBox('obstruction', {width:2, height:3, depth:0.2}, scene);
    wall.parent = root; wall.position.set(0,1.5,0.5);
    assert.equal(findInteriorViewpoint([root], [pose]), null);
    wall.dispose(); ceiling.dispose();
    assert.equal(findInteriorViewpoint([root], [pose]), null);
  } finally { scene.dispose(); engine.dispose(); }
});

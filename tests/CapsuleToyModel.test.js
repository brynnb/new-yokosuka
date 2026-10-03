import assert from 'node:assert/strict';
import test from 'node:test';
import { Axis, Quaternion } from '@babylonjs/core';
import { collectionToyModel, rotateCapsuleToy, untilAborted } from '../play/interactions/CapsuleToyModel.js';
import catalog from '../src/data/collection-model-names.json' with {type: 'json'};

test('every original collection resource resolves to its catalogued model, not a guessed filename', () => {
  for (const [model, item] of Object.entries(catalog.items)) {
    assert.equal(collectionToyModel(`capsule_${item.resourceCode.toLowerCase()}`), model);
  }
  assert.throws(() => collectionToyModel('capsule_missing'), /No collection model/);
  assert.throws(() => collectionToyModel('../model'), /No collection model/);
});

test('popup and held-toy rotation use camera-relative axes and remain normalized', () => {
  const pivot = {rotationQuaternion: Quaternion.Identity()};
  const axes = [];
  const camera = {getDirection(axis) { axes.push(axis); return axis; }};
  rotateCapsuleToy(pivot, camera, 0.25, -0.5);
  const expected = Quaternion.RotationAxis(Axis.X, -0.5).multiply(Quaternion.RotationAxis(Axis.Y, 0.25));
  assert.ok(pivot.rotationQuaternion.equalsWithEpsilon(expected));
  assert.deepEqual(axes, [Axis.Y, Axis.X]);
  for (let i = 0; i < 1000; i++) rotateCapsuleToy(pivot, camera, 0.02, 0.03);
  assert.ok(Math.abs(pivot.rotationQuaternion.length() - 1) < 1e-9);
});

test('cancelling a preview wait leaves the shared asset consumer intact', async () => {
  let finish;
  const read = new Promise(resolve => { finish = resolve; });
  const abort = new AbortController();
  const preview = untilAborted(read, abort.signal);
  abort.abort();
  await assert.rejects(preview, {name: 'AbortError'});
  finish('shared asset');
  assert.equal(await read, 'shared asset');
  assert.equal(await untilAborted(Promise.resolve('ready'), new AbortController().signal), 'ready');
});

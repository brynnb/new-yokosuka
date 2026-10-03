import assert from 'node:assert/strict';
import test from 'node:test';
import {NullEngine, Scene, TransformNode, Matrix, Vector3} from '@babylonjs/core';
import {CapsulePurchaseProps} from '../play/interactions/CapsulePurchaseProps.js';
import {GACHA_CAPSULE} from '../src/DobuitaGachaInteraction.js';
import fs from 'node:fs';

test('capsule grips, regrip and drop geometry match audited original literals', () => {
  const evidence = JSON.parse(fs.readFileSync('tools/evidence/d000-gacha-interaction.json', 'utf8'));
  assert.equal(evidence.status, 'verified');
  for (const [key, value] of Object.entries(evidence.capsuleProps.recovered)) assert.deepEqual(GACHA_CAPSULE[key], value, key);
});

test('shell dispenses, follows the rendered hands, separates, releases and cleans up', t => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  const character = new TransformNode('character', scene);
  character.scaling.x = -1; // Source character content reflection.
  character._mt5Nodes = [{addr: 1, flag: -0x41}, {addr: 2, flag: -0x42}];
  character._mt5CharacterWorldMatrices = new Map([
    [1, Matrix.Translation(0.3, 1, 0).asArray()], [2, Matrix.Translation(-0.3, 1, 0).asArray()],
  ]);
  const samples = [];
  const props = new CapsulePurchaseProps({scene, getCharacterRoot: () => character,
    getCharacterPoseAt: (state, frame) => {
      samples.push([state, frame]);
      return new Map([[-0x41, Matrix.Translation(0.3, 1, 0).asArray()], [-0x42, Matrix.Translation(-0.3, 1, 0).asArray()]]);
    }});
  props.roots = Array.from({length: 5}, (_, i) => new TransformNode(`shell-${i}`, scene));
  const roots = [...props.roots];
  const machine = {highDetailRoot: new TransformNode('machine', scene)};
  const emote = {};
  props.update(emote, machine, 200);
  assert.ok(roots.every(root => !root.isEnabled()));
  props.update(emote, machine, 215);
  const {lid, base} = props.active;
  assert.ok(lid.isEnabled() && base.isEnabled());
  assert.equal(roots.filter(root => root.isEnabled()).length, 2);
  const start = lid.getAbsolutePosition().clone();
  props.update(emote, machine, 250);
  assert.ok(Math.abs(start.y - lid.getAbsolutePosition().y - GACHA_CAPSULE.dropDistance) < 1e-6);
  props.update(emote, machine, 325);
  assert.equal(lid.parent, character);
  assert.equal(base.parent, character);
  assert.ok(Vector3.Distance(lid.getAbsolutePosition(), base.getAbsolutePosition()) < 1e-6);
  props.update(emote, machine, 380);
  assert.ok(Vector3.Distance(lid.getAbsolutePosition(), base.getAbsolutePosition()) > 0.4);
  props.update(emote, machine, 415); // Skips exact release, still samples original frame.
  assert.deepEqual(samples, [['dobuitaGacha:loop', 410]]);
  assert.equal(lid.parent, null);
  props.update(emote, machine, 510);
  assert.deepEqual(samples[1], ['dobuitaGacha:loop', 503]);
  props.update(emote, machine, 530);
  assert.ok(roots.every(root => !root.isEnabled()));
  props.restore();
  assert.equal(props.active, null);
  assert.ok(roots.every(root => root.parent === null));
  props.update({}, machine, 325);
  assert.ok(props.active);
  props.clear();
  assert.equal(props.active, null);
  assert.equal(props.roots.length, 0);
  assert.ok(roots.every(root => root.isDisposed()));
});

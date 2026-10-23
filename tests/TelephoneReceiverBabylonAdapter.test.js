import assert from "node:assert/strict";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../src/Mt5Loader.js";
import { scheduledBrowserAttachedObjectMatrix } from "../src/ScheduledActorLocalObjects.js";
import {
  createScriptEventPresentationCatalog,
} from "../play/scripts/ScriptEventPresentationCatalog.js";
import {
  createTelephoneReceiverBabylonAdapter,
} from "../play/scripts/TelephoneReceiverBabylonAdapter.js";

function approximatelyEqual(actual, expected, epsilon = 1e-6) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= epsilon,
      `matrix value ${index}: ${value} != ${expected[index]}`,
    );
  });
}

test("TELM selector 3 binds only telephone control 3 to Ryo's left hand", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const modelOffset = new BABYLON.TransformNode("player-model-offset", scene);
  const telephone = new BABYLON.TransformNode("telephone", scene);
  const receiver = new BABYLON.TransformNode("telephone-control-3", scene);
  receiver.parent = telephone;
  receiver.position.set(0, 0.1855, -0.079594);
  const geometry = BABYLON.MeshBuilder.CreateBox("receiver-geometry", {}, scene);
  geometry.parent = receiver;
  telephone._mt5Nodes = [{ flag: 3, mesh: receiver }];
  telephone.freezeWorldMatrix();
  receiver.freezeWorldMatrix();
  geometry.freezeWorldMatrix();
  const originalPosition = receiver.position.clone();
  const hand = Mt5Loader.rowTranslation(1, 2, 3);
  const adapter = createTelephoneReceiverBabylonAdapter({
    resolveObjectRoot: tag => tag === "TEL_" ? telephone : null,
    resolveActorControl: request => {
      assert.deepEqual(request, {
        actorCode: "AKIR",
        renderKey: -0x42,
      });
      return { root: modelOffset, matrix: hand };
    },
  });
  const binding = createScriptEventPresentationCatalog().sequence(
    "jomo.telephone.answer.sa1093.first",
  ).answer.receiver;
  const owner = { event: "telephone" };

  assert.equal(adapter.attach(binding, owner), true);
  assert.equal(receiver.parent, modelOffset);
  const correction = Mt5Loader.sourceTransformMatrix({
    scl: { x: 1, y: 1, z: 1 },
    rot: { x: 0, y: 0, z: Math.PI / 2 },
    pos: {
      x: 0.07499999552965164,
      y: 0.02499999850988388,
      z: 0,
    },
  });
  approximatelyEqual(
    receiver.computeWorldMatrix(true).asArray(),
    scheduledBrowserAttachedObjectMatrix(Mt5Loader.rowMultiply(Mt5Loader.rowMultiply(
      Mt5Loader.sourceTransformMatrix({scl:{x:1,y:1,z:1},
        rot:Object.fromEntries(["x","y","z"].map((axis,i)=>[axis,binding.controllerRotationWords[i]/65536*Math.PI*2])),
        pos:Object.fromEntries(["x","y","z"].map((axis,i)=>[axis,binding.controllerTranslation[i]]))}),correction),hand)),
  );

  assert.equal(adapter.detach(binding, owner), true);
  assert.equal(receiver.parent, telephone);
  assert.deepEqual(receiver.position.asArray(), originalPosition.asArray());
  assert.equal(receiver.isWorldMatrixFrozen, true);
  assert.equal(geometry.isWorldMatrixFrozen, true);
  engine.dispose();
});

test("telephone receiver binding fails closed for an unproven route", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const modelOffset = new BABYLON.TransformNode("player-model-offset", scene);
  const adapter = createTelephoneReceiverBabylonAdapter({
    resolveObjectRoot: () => null,
    resolveActorControl: () => ({ root: modelOffset, matrix: Mt5Loader.rowIdentity() }),
  });
  const binding = createScriptEventPresentationCatalog().sequence(
    "jomo.telephone.answer.sa1093.first",
  ).answer.receiver;

  assert.equal(adapter.attach({ ...binding, bindingIndex: 2 }, {}), false);
  assert.equal(adapter.attach(binding, {}), false);
  engine.dispose();
});

test("telephone supports another actor and the right hand without a Ryo matrix-index alias", () => {
  const engine = new BABYLON.NullEngine(), scene = new BABYLON.Scene(engine);
  const actor = new BABYLON.TransformNode("fuku-render-root", scene);
  actor.position.set(3, 0, 2); actor.rotation.y = 1.1; actor.scaling.setAll(1.2);
  const phone = new BABYLON.TransformNode("phone", scene);
  const receiver = new BABYLON.TransformNode("handset", scene); receiver.parent = phone;
  phone._mt5Nodes = [{flag:3,mesh:receiver}];
  const adapter = createTelephoneReceiverBabylonAdapter({resolveObjectRoot:()=>phone,
    resolveActorControl: request => {
      assert.deepEqual(request,{actorCode:"FUKU",renderKey:-65});
      return {root:actor,matrix:Mt5Loader.rowTranslation(0.2,1.3,-0.4)};
    }});
  const original = createScriptEventPresentationCatalog().sequence("jomo.telephone.answer.sa1093.first").answer.receiver;
  const binding = {...original,actorCode:"FUKU",bindingIndex:4,actorRenderKey:-65};
  delete binding.actorRuntimeMatrixIndex;
  const owner={};
  assert.equal(adapter.attach(binding,owner),true);
  assert.equal(receiver.parent,actor);
  assert.equal(adapter.update({...binding,actorCode:"AKIR"},owner),false);
  assert.equal(adapter.detach(binding,{}),false);
  adapter.restoreActive(); assert.equal(receiver.parent,phone);
  assert.equal(adapter.restoreActive(),true);
  engine.dispose();
});

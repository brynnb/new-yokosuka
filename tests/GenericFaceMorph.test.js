import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  GenericFaceMorphController,
  resolveGenericFaceMorph,
} from "../src/GenericFaceMorph.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  loadNativeCharacterModel,
} from "../play/characters/NativeCharacterModelLoader.js";
import {
  NativeDialogueFacialPresentation,
} from "../play/dialogue/NativeDialogueFacialPresentation.js";
import { nativeLipSyncDescriptor } from "../src/NativeLipSync.js";

test("generic NPC mouths use the authored attached and detached -68 targets", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const source = readFileSync("play/assets/characters/GKA_L.CHRM");
    const loader = new Mt5Loader(scene, {
      mirrorCharacterX: true,
      characterRigMode: "gpu",
    });
    const [renderRoot] = await loader.load(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    const binding = resolveGenericFaceMorph({ loader, renderRoot });
    assert.ok(binding);
    assert.equal(binding.destination.model.nbVertex, 51);
    assert.equal(binding.closed.model.nbVertex, 51);
    assert.equal(binding.open.model.nbVertex, 51);
    const mesh = binding.meshes[0].mesh;
    const closed = Array.from(Float32Array.from(mesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    )));
    const controller = new GenericFaceMorphController(binding);
    assert.deepEqual(Array.from(mesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    )), closed, "starting speech must not move the closed mouth");
    controller.transition(true, 4);
    for (let tick = 0; tick < 4; tick += 1) controller.advanceTick();
    const open = Array.from(mesh.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    ));
    assert.notDeepEqual(open, closed);
    const bindMatrix = loader.sourceWorldMatrixForNode(binding.destination);
    for (const [vertexIndex, sourceIndex] of mesh._mt5SourceVertexIndices.entries()) {
      const localIndex = sourceIndex - binding.destination.model.vertexBase;
      if (localIndex < 0 || localIndex >= binding.destination.model.nbVertex) continue;
      const first = loader.globalVertices[binding.closed.model.vertexBase + localIndex].sourcePos;
      const second = loader.globalVertices[binding.open.model.vertexBase + localIndex].sourcePos;
      const delta = Mt5Loader.transformRowVector(
        second.map((value, axis) => value - first[axis]), bindMatrix,
      );
      for (let axis = 0; axis < 3; axis += 1) {
        const offset = vertexIndex * 3 + axis;
        assert.ok(Math.abs(open[offset] - closed[offset] - delta[axis]) < 1e-6,
          "opening uses the authored displacement in the GPU bind coordinate space");
      }
    }
    controller.reset();
    assert.deepEqual(
      Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
      closed,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("production NPC mouths survive preparation and repeated dialogue", async () => {
  const engine = new BABYLON.NullEngine();
  try {
    for (const modelCode of ["GKA_L", "FUK_M", "SIA_L", "RFD_L"]) {
      const scene = new BABYLON.Scene(engine);
      try {
        const source = readFileSync(`play/assets/characters/${modelCode}.CHRM`);
        const model = await loadNativeCharacterModel({
          scene,
          modelBuffer: source.buffer.slice(
            source.byteOffset, source.byteOffset + source.byteLength,
          ),
          sourceFilename: `${modelCode}.CHRM`,
        });
        const binding = resolveGenericFaceMorph(model);
        assert.ok(binding, `${modelCode}: attached mouth remains morphable`);
        assert.equal(binding.destination.mesh.isEnabled(), true);
        for (const sourceNode of [binding.closed, binding.open]) {
          assert.equal(sourceNode.mesh.isEnabled(), false,
            `${modelCode}: detached mouth is a source, not a visible surface`);
          const meshes = model.renderRoot._mt5CharacterGpuRig.skinnedMeshes.filter(
            mesh => mesh._mt5NodeAddress === sourceNode.addr,
          );
          assert.ok(meshes.length > 0,
            `${modelCode}: source geometry must not be baked into body batches`);
          assert.ok(meshes.every(mesh => !mesh.isEnabled() && !mesh.isDisposed()));
        }
        const mesh = binding.meshes[0].mesh;
        const positions = () => Array.from(Float32Array.from(
          mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
        ));
        const closed = positions();
        const boundsBefore = [
          ...mesh.getBoundingInfo().minimum.asArray(),
          ...mesh.getBoundingInfo().maximum.asArray(),
        ];
        const faces = new NativeDialogueFacialPresentation({
          scheduledActors: { dialogueActorModel: () => model },
        });
        const message = {
          speakerId: modelCode,
          lipSync: nativeLipSyncDescriptor([{ shape: 5, durationTicks: 60 }]),
        };
        assert.equal(faces.start(message), true);
        assert.deepEqual(positions(), closed,
          `${modelCode}: speech preserves the prepared closed-mouth geometry`);
        assert.deepEqual([
          ...mesh.getBoundingInfo().minimum.asArray(),
          ...mesh.getBoundingInfo().maximum.asArray(),
        ], boundsBefore, `${modelCode}: speech preserves rig culling bounds`);
        faces.update(4 / 30);
        assert.notDeepEqual(positions(), closed);
        faces.endMessage(message);
        assert.deepEqual(positions(), closed);
        assert.equal(faces.start(message), true);
        assert.deepEqual(positions(), closed);
        faces.update(4 / 30);
        faces.stop();
        assert.deepEqual(positions(), closed);
      } finally {
        scene.dispose();
      }
    }
  } finally {
    engine.dispose();
  }
});

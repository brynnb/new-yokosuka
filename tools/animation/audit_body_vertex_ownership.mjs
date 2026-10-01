// Run through scripts/testing/run-tests.mjs script to keep the model audit bounded.
// Source IDs, not coincident positions, identify vertices borrowed by MT5 strips.
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";

const files = process.argv.slice(2);
if (!files.length) files.push(
  "play/assets/characters/IWA_M.CHRM",
  "play/assets/characters/FUK_M.CHRM",
  "play/assets/characters/KOK_M.CHRM",
  "public/models/S2_YDB1_YKC_M.MT5",
  "public/models/S3_JOMO_SIN_M.MT5",
);
const engine = new BABYLON.NullEngine();
try {
  for (const file of files) {
    const scene = new BABYLON.Scene(engine);
    try {
      const bytes = fs.readFileSync(file);
      const loader = new Mt5Loader(scene, { characterRigMode: "gpu", characterRigSeamMode: "weld" });
      const [root] = await loader.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const rig = root._mt5CharacterGpuRig;
      const owners = new Map();
      for (const node of root._mt5Nodes) {
        if (!node.model) continue;
        for (let i = 0; i < node.model.nbVertex; i++) owners.set(node.model.vertexBase + i, node);
      }
      let borrowed = 0, differsFromRigidSourceOwner = 0, blended = 0;
      const joints = {};
      for (const mesh of rig.skinnedMeshes) {
        const indices = mesh.getVerticesData("matricesIndices");
        const weights = mesh.getVerticesData("matricesWeights");
        mesh._mt5SourceVertexIndices.forEach((id, vertex) => {
          if (mesh._mt5ExternalParentVertexOffsets?.[vertex] < 0) return;
          const owner = owners.get(id);
          if (!owner) throw new Error(`${file}: vertex ${id} has no source owner`);
          const bone = rig.boneByNodeAddress.get(owner.addr);
          if (!bone) throw new Error(`${file}: source owner ${owner.addr} has no bone`);
          if (weights[vertex * 4] !== 1) blended++;
          if (indices[vertex * 4] !== bone.getIndex() || weights[vertex * 4] !== 1) differsFromRigidSourceOwner++;
          if (owner.addr === mesh._mt5NodeAddress) return;
          borrowed++;
          const node = root._mt5Nodes.find(n => n.addr === mesh._mt5NodeAddress);
          const key = `${(owner.flag << 16) >> 16}->${(node.flag << 16) >> 16}`;
          (joints[key] ||= new Set()).add(id);
        });
      }
      console.log(JSON.stringify({ file, sha256: createHash("sha256").update(bytes).digest("hex"),
        borrowedRenderVertices: borrowed, blendedRenderVertices: blended, differsFromRigidSourceOwner,
        jointSourceVertices: Object.fromEntries(Object.entries(joints).map(([key, ids]) => [key, ids.size])),
      }));
    } finally { scene.dispose(); }
  }
} finally { engine.dispose(); }

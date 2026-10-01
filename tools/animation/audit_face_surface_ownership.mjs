// Local source-data audit, not a rendered visibility test. Run from repo root.
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { integrateBodyFaceSurface } from "../../src/FaceSurfaceIntegration.js";

const manifest = JSON.parse(fs.readFileSync(
  "play/assets/cutscenes/native-faces/manifest.generated.json", "utf8",
));
const op00 = JSON.parse(fs.readFileSync(
  "play/assets/introduction/op00/asset-inventory.generated.json", "utf8",
));
const op02 = JSON.parse(fs.readFileSync(
  "play/assets/introduction/op02/manifest.json", "utf8",
));
const definitions = {
  ...manifest.facialAssets,
  SORY: op00.facialAssets.SORY,
  "JAKR/JKB": manifest.facialVariants.JKB,
  "OP02/SINF": op02.facialAssets.SINF,
};
const key = node => (node.flag << 16) >> 16;
const engine = new BABYLON.NullEngine();
try {
  for (const [actor, definition] of Object.entries(definitions)) {
    if (process.argv[2] && actor !== process.argv[2]) continue;
    const scene = new BABYLON.Scene(engine);
    try {
      const load = async (path, detailed = false) => {
        const bytes = fs.readFileSync(path);
        const loader = new Mt5Loader(scene, {
          mirrorCharacterX: true, characterRigMode: "gpu",
          characterRigSeamMode: detailed ? "none" : "weld",
          respectStripWindingSign: detailed,
        });
        const [root] = await loader.load(bytes.buffer.slice(
          bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
        ), null);
        return { loader, root, path, sha256: createHash("sha256").update(bytes).digest("hex") };
      };
      // Ryo's production body is the model configured in play/config/characters.js.
      const body = await load(actor === "AKIR"
        ? "public/models/S2_YDB1_YKC_M.MT5"
        : actor === "SINF" ? "public/models/S3_JOMO_SIN_M.MT5"
        : actor === "OP02/SINF" ? op02.packageActors.SINF.assetPath
        : actor === "JAKR/JKB" ? "extracted_files/data/SCENE/01/MODEL/CHARA/JKB_M.MT5"
        : `play/assets/characters/${definition.bodyModelCode}.CHRM`);
      const face = await load(definition.model.path, true);
      const attachment = body.root._mt5Nodes.find(n => key(n) === -67 && n.model);
      const nodes = new Map(body.root._mt5Nodes.map(n => [n.addr, n]));
      const within = mesh => {
        let node = nodes.get(mesh._mt5NodeAddress);
        while (node) {
          if (node === attachment) return true;
          node = nodes.get(node.parentAddr);
        }
        return false;
      };
      const meshes = body.root.getChildMeshes(false).filter(m => within(m) && m.getTotalIndices());
      const before = new Map(meshes.map(m => [m, m.getTotalIndices() / 3]));
      const result = integrateBodyFaceSurface({
        bodyModelRoot: body.root, bodyLoader: body.loader, bodyFaceNode: attachment,
        faceRoot: face.root, faceLoader: face.loader,
        faceAttachmentNode: face.root._mt5Nodes.find(n => key(n) === 3 && n.model),
        faceEyeNodes: face.root._mt5Nodes.filter(n => [77, 78].includes(key(n)) && n.model),
      });
      const detailedTextures = [...new Set(face.root.getChildMeshes(false)
        .filter(m => m.getTotalIndices()).map(m => m.metadata?.mt5TextureId))];
      const attachmentAncestors = [];
      let parent = face.root._mt5Nodes.find(n => key(n) === 3 && n.model);
      while ((parent = face.root._mt5Nodes.find(node => node.addr === parent.parentAddr))) {
        attachmentAncestors.push({ address: parent.addr, key: key(parent),
          vertices: parent.model?.nbVertex || 0 });
      }
      console.log(JSON.stringify({
        actor, body: { path: body.path, sha256: body.sha256 },
        face: { path: face.path, sha256: face.sha256 },
        signedSeamVertices: result.boundExternalParentVertexCount,
        removed: result.removedTriangleCount, retained: result.retainedTriangleCount,
        detailedTextures,
        attachmentAncestors,
        bodyMeshes: meshes.map(mesh => ({
          nodeKey: key(nodes.get(mesh._mt5NodeAddress)),
          texture: mesh.metadata?.mt5TextureId,
          before: before.get(mesh), after: mesh.getTotalIndices() / 3,
        })),
      }));
    } finally { scene.dispose(); }
  }
} finally { engine.dispose(); }

#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import op00Inventory from "../../play/assets/introduction/op00/asset-inventory.generated.json" with {
  type: "json",
};
import tgmaManifest from "../../play/assets/hazuki/tgma/manifest.json" with {
  type: "json",
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDirectory = path.join(
  root,
  "extracted_files/data/SCENE/01/MODEL/FACE",
);
const outputDirectory = path.join(root, "play/assets/cutscenes/native-faces");
const posePath = path.join(
  root,
  "play/assets/cutscenes/native-faces/native-talk-poses.generated.json",
);
const jakrPosePath = path.join(
  root,
  "play/assets/cutscenes/native-faces/jakr-talk-poses.generated.json",
);
const sinfPosePath = path.join(
  root,
  "play/assets/cutscenes/native-faces/sinf-talk-poses.generated.json",
);
const jkbPosePath = path.join(
  root,
  "play/assets/cutscenes/native-faces/jkb-talk-poses.generated.json",
);
const storyPosePath = path.join(
  root,
  "play/assets/cutscenes/native-faces/story-talk-poses.generated.json",
);
const expected = Object.freeze({
  IWAO: Object.freeze({
    bodyModelCode: "IWA_M",
    faceCode: "IWA",
    modelSha256: "3843ab19cc4b70ee3ce0b1eadc3b1847c5d9c7cf9229ff474484d91f1288f29f",
    tableSha256: "406ceb8399fba2ef989af0871b47c42ad62e2a1aadf536eba39f2af4c78501c3",
  }),
  JAKR: Object.freeze({
    bodyModelCode: "JKA_M",
    faceCode: "JKA",
    modelSha256: "7af0756726e5dee137c27f4fe6774be6309c246d033b7890d3d8f39a6ced27a4",
    tableSha256: "37caf2b88d92a32607418fbcc63607e7c4a70f23a851e34e3d494a2928a12988",
    posePath: jakrPosePath,
  }),
  SINF: Object.freeze({
    bodyModelCode: "SIN_M",
    faceCode: "SIN",
    modelSha256: "384e70b147fd0ea6b25ef34f28af80afe1658236f98cb18b468656e6700a7682",
    tableSha256: "9ce6c79f85666df9d19bdce9210d975aa60ad3b6e68bd97f5770a56b090bb9e7",
    posePath: sinfPosePath,
  }),
  INE_: Object.freeze({
    bodyModelCode: "INE_M",
    faceCode: "INE",
    modelSha256: "0e4b50d8926ba3d2c53ba82955c825c6a806ae12725482d659592fe6e1d418a1",
    tableSha256: "5116ef74d03b22381cb4e440de3493b54629fe3afce619dc87fa7689a6aedd7e",
  }),
  FUKU: Object.freeze({
    bodyModelCode: "FUK_M",
    faceCode: "FUK",
    modelSha256: "91d7ea39451d3f45c6c7b4a8536d3f0a349be274df9581df64f5177c17dcf1ed",
    tableSha256: "0da346204075039870a014ed304b2c77af9a410f3a07e2a1f8f4196743725047",
  }),
  SMTH: Object.freeze({
    bodyModelCode: "GIB_M",
    faceCode: "GIB",
    modelSha256: "c71ccb15d1b29621a1d539c8cc89c97def6a97c480169a81313220c4405f2a4b",
    tableSha256: "71e25c250f7cac26eaadd36e87c5bac72eda5baf3ab557eed6a48741285a5bdd",
  }),
  TONY: Object.freeze({
    bodyModelCode: "GIJ_M",
    faceCode: "GIJ",
    modelSha256: "4a70a5d5049d004e2440511acb07ab25b2756c6b06a5795bab2b64dde9dd5732",
    tableSha256: "13dd495f35dcd2454fd61c211c5f933f27baa32be04f02b9b5ad8ff30d51d330",
  }),
  HRSK: Object.freeze({
    bodyModelCode: "NZM_L",
    faceCode: "NZM",
    modelSha256: "3fa8edf09120105297480f18ec86390aa6a6418884acfcdc115040c64d239ef0",
    tableSha256: "5fcf97d48be6863fda3f3d91ab128aa3a23283af0249275d91a3c0866470b95c",
  }),
  YAMA: Object.freeze({
    bodyModelCode: "YMG_L",
    faceCode: "YMG",
    modelSha256: "17e98b42752469c6ea80fb105ed570e3cbdefc280104ca29098327b1c0bced28",
    tableSha256: "feff5238a1ddd09f9a1368067157d9149ede9dc65c49a0afa7d8c136cd82b7f0",
  }),
  KISY: Object.freeze({
    bodyModelCode: "KIS_M",
    faceCode: "KIS",
    modelSha256: "1c3d7af0feefec70746dbb887257c4adb0c2ef3971a3889d1768f6406a4c9639",
    tableSha256: "406779572b41f7432de473b177762901ffe10a56effddba4ac2f23ec8273cd6c",
    posePath: storyPosePath,
  }),
  TAIJ: Object.freeze({
    bodyModelCode: "SYU_M",
    faceCode: "SYU",
    modelSha256: "2452a00d85865f4393fc6eec0c284b3204588ec6c300345a5d8609878a4f9f63",
    tableSha256: "03f5e59373b83a5ee8aaac3dcdccada228b0b8d3fef33d82eda094005e2f1ba6",
    posePath: storyPosePath,
  }),
  JIMY: Object.freeze({
    bodyModelCode: "JIM_M",
    faceCode: "JIM",
    modelSha256: "cd3745f0013755393fddc119f89365b1cfb68e2522626d34530c422c387aedf1",
    tableSha256: "6f289a2dea03c347485a0504afd92af28b0a5591d95675f2d78297423b0bd3d0",
    posePath: storyPosePath,
  }),
  HORS: Object.freeze({
    bodyModelCode: "TAT_M",
    faceCode: "TAT",
    modelSha256: "6c8584dbead4218d9b6f5c993cee1a303dc457dcfcbb8bca7e839f621fd323b9",
    tableSha256: "c8cef6d0d674f90313c27e170c7611db761c3eaaf368afa3b0184be02c1782d5",
    posePath: storyPosePath,
  }),
  CHRL: Object.freeze({
    bodyModelCode: "BIS_L",
    faceCode: "BIS",
    modelSha256: "71f93a590becbc04eea6a0d22ba3516a107d3b732c4861ebe31112730e7ff085",
    tableSha256: "53e8538c3fb03e678d76e46679ffc45b8a0a2c41686e3e355cddebfcdf499060",
    posePath: storyPosePath,
  }),
});
const expectedVariants = Object.freeze({
  // JAKR normally resolves to the adult JKA face. SAKR authors the same actor
  // tag with the archive-local young-Ryo JKB body and therefore selects this
  // exact named presentation variant at the package boundary.
  JKB: Object.freeze({
    actorTag: "JAKR",
    bodyModelCode: "JKB_M",
    faceCode: "JKB",
    modelSha256: "311a4f734f2f5f4e28156a2b8ccdfd04429711ee8592721653e3e892bcdafb9f",
    tableSha256: "ca13ce45c2c5e1829c87c9144d5e5f8f2e1fc0a43f3a5fd186821f71bcedc8ff",
    posePath: jkbPosePath,
  }),
  // Both exact NZM bodies use the NZM FACE shell, but are independent entries:
  // do not generalize this into automatic _L/_M body compatibility.
  NZM_M: Object.freeze({
    ...expected.HRSK,
    actorTag: "HRSK",
    bodyModelCode: "NZM_M",
  }),
});

const sha256 = value => createHash("sha256").update(value).digest("hex");
const relative = filename => path.relative(root, filename).replaceAll(path.sep, "/");

function exactAsset(source, destination, expectedHash) {
  const value = readFileSync(source);
  const actualHash = sha256(value);
  if (actualHash !== expectedHash) {
    throw new Error(`${relative(source)} changed: ${actualHash}`);
  }
  copyFileSync(source, destination);
  return Object.freeze({
    path: relative(destination),
    sourcePath: relative(source),
    byteLength: value.byteLength,
    sha256: actualHash,
  });
}

mkdirSync(outputDirectory, { recursive: true });
const poses = (actorTag, actorPosePath = posePath) => {
  const poseBytes = readFileSync(actorPosePath);
  return Object.freeze({
  path: relative(actorPosePath),
  byteLength: poseBytes.byteLength,
  sha256: sha256(poseBytes),
  generatedBy: "tools/animation/extract_native_face_poses.py",
  actorTag,
  });
};
function buildFacialAsset(actorTag, definition) {
  const modelName = `${definition.faceCode}_F.MT5`;
  const tableName = `${definition.faceCode}_FTBL.BIN`;
  return Object.freeze({
    actorTag,
    bodyModelCode: definition.bodyModelCode,
    faceCode: definition.faceCode,
    attachmentRenderKey: -67,
    faceRootRenderKey: 3,
    eyeRenderKeys: Object.freeze([77, 78]),
    model: exactAsset(
      path.join(sourceDirectory, modelName),
      path.join(outputDirectory, modelName),
      definition.modelSha256,
    ),
    table: exactAsset(
      path.join(sourceDirectory, tableName),
      path.join(outputDirectory, tableName),
      definition.tableSha256,
    ),
    poses: poses(actorTag, definition.posePath),
  });
}

const facialAssets = {
  AKIR: {
    ...op00Inventory.facialAssets.AKIR,
    poses: poses("AKIR"),
  },
};
for (const [actorTag, definition] of Object.entries(expected)) {
  facialAssets[actorTag] = buildFacialAsset(actorTag, definition);
}
const facialVariants = Object.fromEntries(Object.entries(expectedVariants).map(
  ([variantId, definition]) => [
    variantId,
    buildFacialAsset(definition.actorTag, definition),
  ],
));
// TGMA already publishes this exact alternate Fuku body/face pair and native
// TALK output. Reuse it across scenes (including GMCT), not another copy or
// the incompatible FUK face selected by the actor's logical name.
const fub = tgmaManifest.facialAssets.FUKU;
if (fub.bodyModelCode !== "FUB_M" || fub.faceCode !== "FUB") {
  throw new Error("TGMA no longer supplies the exact FUB facial variant");
}
for (const record of [fub.model, fub.table, fub.poses]) {
  if (sha256(readFileSync(path.join(root, record.path))) !== record.sha256) {
    throw new Error(`Shared FUB asset changed: ${record.path}`);
  }
}
facialVariants.FUB = fub;

const manifest = {
  schema: "new-yokosuka-native-face-pack-v1",
  generatedBy: "tools/cutscenes/build_native_face_pack.mjs",
  evidenceBoundary: "Ryo reuses the exact OP00 FACE/FTBL assets. Declared body variants use pinned original FACE/FTBL pairs; TALK poses are evaluated by the original SH-4 function. Speech follows matching SRF mouth cues when present. Asset binding alone does not verify every scene's expressions, camera shots or speech coverage.",
  facialAssets,
  facialVariants,
};
writeFileSync(
  path.join(outputDirectory, "manifest.generated.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Wrote exact native face pack to ${relative(outputDirectory)}`);

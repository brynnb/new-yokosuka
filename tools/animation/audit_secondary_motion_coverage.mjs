// Bounded corpus check: discover every characterized OSAG node and advance its
// real GPU body model. This proves coverage/cleanup, not visual or native fidelity.
// Run: node scripts/testing/run-tests.mjs script tools/animation/audit_secondary_motion_coverage.mjs
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as BABYLON from "@babylonjs/core";
import { loadNativeCharacterModel } from "../../play/characters/NativeCharacterModelLoader.js";
import { NativeSecondaryMotionModelState } from "../../play/characters/NativeSecondaryMotionRuntime.js";
import { controllerFamilyByIndex } from "../../play/characters/NpcControllerFamilies.js";
import { authoredControllerFamilyIndexFromMt5 } from "../../src/Mt5ControllerFamily.js";
import { NATIVE_OSAG_SIMULATED_NODE_TYPES } from "../../play/characters/NativeSecondaryMotionProfiles.js";

const outputIndex = process.argv.indexOf("--out");
const output = outputIndex < 0 ? null : process.argv[outputIndex + 1];
const codes = fs.readdirSync("play/assets/characters").filter(name => name.endsWith(".CHRM")).sort();
BABYLON.Logger.LogLevels = BABYLON.Logger.ErrorLogLevel;
const engine = new BABYLON.NullEngine();
const models = [];
try {
  for (const filename of codes) {
    const scene = new BABYLON.Scene(engine);
    try {
      const buffer = fs.readFileSync(`play/assets/characters/${filename}`);
      const { loader, renderRoot } = await loadNativeCharacterModel({ scene,
        modelBuffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        sourceFilename: filename });
      const modelCode = filename.slice(0, -5);
      const family = controllerFamilyByIndex(authoredControllerFamilyIndexFromMt5(buffer));
      const model = { loader, renderRoot, modelCode,
        latestControllerFamily: family,
        latestControllerMatrices: family?.nodes.map(() => BABYLON.Matrix.Identity().asArray()) };
      const state = new NativeSecondaryMotionModelState(model);
      const expected = renderRoot._mt5Nodes.filter(node => NATIVE_OSAG_SIMULATED_NODE_TYPES.includes(node.flag & 65535));
      const covered = new Set([...state.chains.flatMap(chain => chain.nodes.map(node => node.addr)),
        ...state.surfaces.map(surface => surface.node.addr)]);
      const missing = expected.filter(node => !covered.has(node.addr));
      if (missing.length) throw new Error(`${filename} has undiscovered OSAG nodes: ${missing.map(node => node.addr)}`);
      const base = loader.characterRigWorldMatrices(renderRoot);
      if (state.active) {
        for (let frame = 0; frame < 60; frame++) {
          renderRoot.position.x = frame / 300;
          if (!state.update(1 / 30)) throw new Error(`${filename}: secondary pose not applied`);
          if (state.surfaces.some(surface => !surface.acquired)) {
            throw new Error(`${filename}: vertex surface lacks a live controller hookup`);
          }
          if (![...renderRoot._mt5CharacterWorldMatrices.values()].every(matrix => matrix.every(Number.isFinite))) {
            throw new Error(`${filename}: nonfinite secondary pose`);
          }
        }
        state.release();
        for (const [addr, matrix] of renderRoot._mt5CharacterWorldMatrices) {
          if (matrix.some((value, i) => Math.abs(value - base.get(addr)[i]) > 1e-9)) {
            throw new Error(`${filename}: pose leaked after release`);
          }
        }
      }
      if (expected.length) models.push({ modelCode, sha256: createHash("sha256").update(buffer).digest("hex"),
        nodes: expected.length, chains: state.chains.length, vertexSurfaces: state.surfaces.length,
        nodeTypes: [...new Set(expected.map(node => `0x${(node.flag & 65535).toString(16)}`))] });
    } finally { scene.dispose(); }
  }
} finally { engine.dispose(); }
const report = { schema: "secondary-motion-runtime-coverage-v1", scannedModels: codes.length, models,
  validation: "headless GPU-rig upload, discovery, finite playback, release; not rendered/native-fidelity evidence" };
if (output) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
else console.log(JSON.stringify(report, null, 2));

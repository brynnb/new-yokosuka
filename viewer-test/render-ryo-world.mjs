import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createGL from "gl";
import { PNG } from "pngjs";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { MotnLoader } from "../src/MotnLoader.js";

BABYLON.Logger.LogLevels = BABYLON.Logger.NoneLogLevel;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const width = Number.parseInt(process.env.RYO_WORLD_WIDTH || "1400", 10);
const height = Number.parseInt(process.env.RYO_WORLD_HEIGHT || "1000", 10);
const sequenceName = process.env.RYO_WORLD_SEQUENCE || "AKI_AKI_RUN_LP";
const frameEnv = Number.parseFloat(process.env.RYO_WORLD_FRAME || "");
const actorYaw = BABYLON.Tools.ToRadians(Number.parseFloat(process.env.RYO_WORLD_YAW || "32"));
const outputPath = path.resolve(
  repoRoot,
  process.env.RYO_WORLD_OUT || "viewer-test/output/ryo-world-run-midstride-proof.png",
);
const metadataPath = path.resolve(
  repoRoot,
  process.env.RYO_WORLD_META || outputPath.replace(/\.[^.]+$/, ".json"),
);

const MODEL_PATH = path.join(repoRoot, "public/models/S2_YDB1_YKC_M.MT5");
const TEXTURE_PATH = path.join(repoRoot, "public/models/S2_YDB1_textures.bin");
const MOTION_PATH = path.join(repoRoot, "extracted_files/data/MOTION/MOTION.BIN");
const POSE_OPTIONS = {
  applyMode: "additive",
  useTranslations: false,
  rotationScale: 1,
  rotationSigns: [1, 1, 1],
  positionSigns: [-1, 1, 1],
  poseTarget: "node-index",
};

function createCanvas(targetWidth, targetHeight) {
  const gl = createGL(targetWidth, targetHeight, {
    preserveDrawingBuffer: true,
    antialias: true,
    stencil: true,
  });
  if (!gl) throw new Error("Could not create headless WebGL context.");

  const canvas = {
    width: targetWidth,
    height: targetHeight,
    clientWidth: targetWidth,
    clientHeight: targetHeight,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: targetWidth, height: targetHeight };
    },
    getContext(type) {
      if (type === "webgl" || type === "experimental-webgl") return gl;
      return null;
    },
  };

  return { canvas, gl };
}

function writePng(gl, targetWidth, targetHeight, targetPath) {
  const pixels = new Uint8Array(targetWidth * targetHeight * 4);
  gl.readPixels(0, 0, targetWidth, targetHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const png = new PNG({ width: targetWidth, height: targetHeight });
  const stride = targetWidth * 4;
  for (let y = 0; y < targetHeight; y++) {
    const srcStart = (targetHeight - 1 - y) * stride;
    const dstStart = y * stride;
    png.data.set(pixels.subarray(srcStart, srcStart + stride), dstStart);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, PNG.sync.write(png));
}

function getRenderableBounds(root) {
  let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  let count = 0;

  for (const node of [root, ...root.getDescendants(false)]) {
    node.computeWorldMatrix(true);
  }

  for (const node of root.getDescendants(false)) {
    if (typeof node.getBoundingInfo !== "function" || node.getTotalVertices() <= 0) continue;
    if (!node.isEnabled() || node.isVisible === false) continue;
    node.refreshBoundingInfo();
    node.computeWorldMatrix(true);
    const box = node.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
    max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
    count++;
  }

  return { min, max, count, center: min.add(max).scale(0.5), size: max.subtract(min) };
}

function createWorld(scene) {
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 8, height: 8 }, scene);
  const groundMaterial = new BABYLON.StandardMaterial("ground_mat", scene);
  groundMaterial.diffuseColor = new BABYLON.Color3(0.43, 0.45, 0.42);
  groundMaterial.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  ground.material = groundMaterial;

  for (let i = -4; i <= 4; i++) {
    const zLine = BABYLON.MeshBuilder.CreateLines(
      `grid_z_${i}`,
      { points: [new BABYLON.Vector3(-4, 0.004, i), new BABYLON.Vector3(4, 0.004, i)] },
      scene,
    );
    zLine.color = new BABYLON.Color3(0.22, 0.23, 0.22);
    const xLine = BABYLON.MeshBuilder.CreateLines(
      `grid_x_${i}`,
      { points: [new BABYLON.Vector3(i, 0.004, -4), new BABYLON.Vector3(i, 0.004, 4)] },
      scene,
    );
    xLine.color = new BABYLON.Color3(0.22, 0.23, 0.22);
  }

  const markerMaterial = new BABYLON.StandardMaterial("marker_mat", scene);
  markerMaterial.diffuseColor = new BABYLON.Color3(0.55, 0.49, 0.37);
  markerMaterial.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);

  for (const [name, x, z, width, depth] of [
    ["start", 0, 0, 0.14, 1.1],
    ["stride", 0, 1.25, 0.14, 1.1],
  ]) {
    const marker = BABYLON.MeshBuilder.CreateBox(name, { width, height: 0.035, depth }, scene);
    marker.position.set(x, 0.018, z);
    marker.material = markerMaterial;
  }
}

function parseBoolEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

function normalizeTextureAddressMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  return ["clamp", "repeat", "mirror"].includes(normalized) ? normalized : "mirror";
}

const { canvas, gl } = createCanvas(width, height);
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  createElement() {
    return canvas;
  },
};
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "node-headless-gl" },
  configurable: true,
});

const engine = new BABYLON.Engine(
  canvas,
  true,
  {
    preserveDrawingBuffer: true,
    stencil: true,
    disableWebGL2Support: true,
  },
  false,
);
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.73, 0.74, 0.71, 1);
scene.ambientColor = new BABYLON.Color3(0.5, 0.5, 0.48);
createWorld(scene);

new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.95;
const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.45, -1, -0.65), scene);
key.intensity = 1.2;

const actorRoot = new BABYLON.TransformNode("ryo_actor_root", scene);
actorRoot.rotation.y = actorYaw;
const modelOffset = new BABYLON.TransformNode("ryo_model_offset", scene);
modelOffset.parent = actorRoot;

const modelBuffer = fs.readFileSync(MODEL_PATH).buffer;
const textureBuffer = fs.readFileSync(TEXTURE_PATH).buffer;
const loader = new Mt5Loader(scene, {
  backFaceCulling: parseBoolEnv("RYO_WORLD_BACKFACE_CULLING", false),
  emulateMirrorResize: parseBoolEnv("RYO_WORLD_EMULATE_MIRROR_RESIZE", true),
  textureAddressMode: normalizeTextureAddressMode(process.env.RYO_WORLD_TEXTURE_ADDRESS_MODE || "mirror"),
  textureCoordinateMode: Mt5Loader.normalizeTextureCoordinateMode(process.env.RYO_WORLD_TEXTURE_COORDINATE_MODE || "viewer"),
  ryoHeadAtlasFix: parseBoolEnv("RYO_WORLD_HEAD_ATLAS_FIX", true),
  ryoHeadAtlasMode: process.env.RYO_WORLD_HEAD_ATLAS_MODE || "project-cw-auto-legacy-region",
  characterRigMode: "baked",
});
loader.setTexturePackIndex(Mt5Loader.buildTexturePackIndex(textureBuffer), null, textureBuffer, null);

const roots = await loader.load(modelBuffer, textureBuffer);
if (roots.length === 0) throw new Error("Ryo MT5 did not produce a renderable root.");

const modelRoot = roots[0];
modelRoot.parent = modelOffset;
const motion = MotnLoader.parse(fs.readFileSync(MOTION_PATH));
const sequence = motion.getSequence(sequenceName);
if (!sequence) throw new Error(`Motion sequence not found: ${sequenceName}`);

const frame = Number.isFinite(frameEnv) ? frameEnv : sequence.durationFrames * 0.45;
loader.applyCharacterRigPose(modelRoot, MotnLoader.evaluateSequence(sequence, frame), POSE_OPTIONS);

const rootSummary = MotnLoader.rootMotionSummary(sequence);
const rootTravelAtFrame = -MotnLoader.rootMotionDelta(sequence, 0, frame);
actorRoot.position.addInPlace(new BABYLON.Vector3(
  Math.sin(actorRoot.rotation.y),
  0,
  Math.cos(actorRoot.rotation.y),
).scale(rootTravelAtFrame));

let bounds = getRenderableBounds(modelRoot);
modelOffset.position.y = -bounds.min.y;
bounds = getRenderableBounds(actorRoot);

const camera = new BABYLON.ArcRotateCamera(
  "camera",
  BABYLON.Tools.ToRadians(214),
  BABYLON.Tools.ToRadians(65),
  Math.max(2.8, Math.max(bounds.size.x, bounds.size.y, bounds.size.z) * 1.75),
  bounds.center.add(new BABYLON.Vector3(0, 0.08, 0)),
  scene,
);
camera.minZ = 0.01;
camera.maxZ = 100;
scene.activeCamera = camera;

scene.render();
engine.flushFramebuffer();
writePng(gl, width, height, outputPath);

const renderMeshes = modelRoot.getDescendants(false).filter((node) => (
  node instanceof BABYLON.Mesh &&
  typeof node.getTotalVertices === "function" &&
  node.getTotalVertices() > 0 &&
  node.isEnabled() &&
  node.isVisible !== false
));
const metadata = {
  outputPath,
  model: path.basename(MODEL_PATH),
  texturePack: path.basename(TEXTURE_PATH),
  sequence: sequence.name,
  frame,
  durationFrames: sequence.durationFrames,
  textureAddressMode: loader.textureAddressMode,
  textureCoordinateMode: loader.textureCoordinateMode,
  poseTarget: POSE_OPTIONS.poseTarget,
  rotationScale: POSE_OPTIONS.rotationScale,
  rotationSigns: POSE_OPTIONS.rotationSigns,
  useTranslations: POSE_OPTIONS.useTranslations,
  rootMotion: {
    summary: rootSummary,
    travelAtFrame: rootTravelAtFrame,
    actorPosition: [actorRoot.position.x, actorRoot.position.y, actorRoot.position.z],
    actorYawDegrees: BABYLON.Tools.ToDegrees(actorRoot.rotation.y),
  },
  renderMeshes: renderMeshes.length,
  bounds: {
    min: bounds.min.asArray(),
    max: bounds.max.asArray(),
    size: bounds.size.asArray(),
  },
};

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify(metadata, null, 2));

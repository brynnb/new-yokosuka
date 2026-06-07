import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { MotnLoader } from "../src/MotnLoader.js";

const MODEL_PATH = "/models/S2_YDB1_YKC_M.MT5";
const TEXTURE_PATH = "/models/S2_YDB1_textures.bin";
const MOTION_PATH = "/extracted_files/data/MOTION/MOTION.BIN";
const WALK_SEQUENCE = "AKI_AKI_WALK_LP";
const RUN_SEQUENCE = "AKI_AKI_RUN_LP";
const POSE_OPTIONS = {
  applyMode: "additive",
  useTranslations: false,
  rotationScale: 1,
  rotationSigns: [1, 1, 1],
  positionSigns: [-1, 1, 1],
  poseTarget: "node-index",
};

const dom = {
  canvas: document.getElementById("renderCanvas"),
  status: document.getElementById("status"),
  motionMode: document.getElementById("motionMode"),
  movementSource: document.getElementById("movementSource"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  frameButton: document.getElementById("frameButton"),
  labButton: document.getElementById("labButton"),
};

const engine = new BABYLON.Engine(dom.canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.73, 0.74, 0.71, 1);
scene.ambientColor = new BABYLON.Color3(0.52, 0.52, 0.5);

const actorRoot = new BABYLON.TransformNode("ryo_actor_root", scene);
const modelOffset = new BABYLON.TransformNode("ryo_model_offset", scene);
modelOffset.parent = actorRoot;

const camera = new BABYLON.ArcRotateCamera(
  "camera",
  BABYLON.Tools.ToRadians(210),
  BABYLON.Tools.ToRadians(66),
  2.8,
  new BABYLON.Vector3(0, 0.42, 0),
  scene,
);
camera.attachControl(dom.canvas, true);
camera.minZ = 0.01;
camera.maxZ = 100;
camera.lowerRadiusLimit = 1.0;
camera.upperRadiusLimit = 7.0;
camera.wheelPrecision = 80;
camera.panningSensibility = 0;
scene.activeCamera = camera;

new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.95;
const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -1, -0.7), scene);
key.intensity = 1.15;

const keys = new Set();
let loader = null;
let modelRoot = null;
let motion = null;
let walkSequence = null;
let runSequence = null;
let currentFrame = 0;
let paused = false;
let ready = false;
let lastSequenceName = null;
let lastAppliedFrame = -1;
let lastState = "rest";

function createWorld() {
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 32, height: 32 }, scene);
  const groundMaterial = new BABYLON.StandardMaterial("ground_mat", scene);
  groundMaterial.diffuseColor = new BABYLON.Color3(0.48, 0.49, 0.46);
  groundMaterial.specularColor = new BABYLON.Color3(0.03, 0.03, 0.03);
  ground.material = groundMaterial;

  const lineMaterial = new BABYLON.StandardMaterial("grid_mat", scene);
  lineMaterial.emissiveColor = new BABYLON.Color3(0.22, 0.24, 0.25);
  lineMaterial.disableLighting = true;

  for (let i = -16; i <= 16; i++) {
    const zLine = BABYLON.MeshBuilder.CreateLines(
      `grid_z_${i}`,
      { points: [new BABYLON.Vector3(-16, 0.003, i), new BABYLON.Vector3(16, 0.003, i)] },
      scene,
    );
    zLine.color = new BABYLON.Color3(0.23, 0.24, 0.23);
    const xLine = BABYLON.MeshBuilder.CreateLines(
      `grid_x_${i}`,
      { points: [new BABYLON.Vector3(i, 0.003, -16), new BABYLON.Vector3(i, 0.003, 16)] },
      scene,
    );
    xLine.color = new BABYLON.Color3(0.23, 0.24, 0.23);
  }

  const curbMaterial = new BABYLON.StandardMaterial("curb_mat", scene);
  curbMaterial.diffuseColor = new BABYLON.Color3(0.55, 0.56, 0.54);
  curbMaterial.specularColor = new BABYLON.Color3(0.03, 0.03, 0.03);

  for (const [name, x, z, width, depth] of [
    ["north", 0, -6, 16, 0.24],
    ["south", 0, 6, 16, 0.24],
    ["west", -6, 0, 0.24, 16],
    ["east", 6, 0, 0.24, 16],
  ]) {
    const curb = BABYLON.MeshBuilder.CreateBox(
      `curb_${name}`,
      { width, height: 0.08, depth },
      scene,
    );
    curb.position.set(x, 0.04, z);
    curb.material = curbMaterial;
  }
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

function getRenderableBounds(root) {
  let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  let count = 0;

  for (const node of [root, ...root.getDescendants(false)]) {
    node.computeWorldMatrix(true);
  }

  for (const node of root.getDescendants(false)) {
    if (typeof node.getBoundingInfo !== "function" || node.getTotalVertices() <= 0) {
      continue;
    }
    node.refreshBoundingInfo();
    node.computeWorldMatrix(true);
    const box = node.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
    max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
    count++;
  }

  if (count === 0) {
    min = BABYLON.Vector3.Zero();
    max = BABYLON.Vector3.Zero();
  }

  return { min, max, count, center: min.add(max).scale(0.5), size: max.subtract(min) };
}

function frameCamera() {
  const target = actorRoot.position.add(new BABYLON.Vector3(0, 0.42, 0));
  camera.setTarget(target);
  camera.radius = 2.8;
  camera.beta = BABYLON.Tools.ToRadians(66);
}

function evaluatePose(sequence, frame) {
  return MotnLoader.evaluateSequence(sequence, frame);
}

function applySequence(sequence, frame) {
  if (!loader || !modelRoot || !sequence) return;
  loader.applyCharacterRigPose(modelRoot, evaluatePose(sequence, frame), POSE_OPTIONS);
}

function applyRestPose() {
  if (!loader || !modelRoot) return;
  loader.applyCharacterRigPose(modelRoot, new Map(), POSE_OPTIONS);
}

function motionState(isMoving, isRunning) {
  switch (dom.motionMode.value) {
    case "walk":
      return "walk";
    case "run":
      return "run";
    case "rest":
      return "rest";
    default:
      if (!isMoving) return "rest";
      return isRunning ? "run" : "walk";
  }
}

function currentSequenceForState(state) {
  if (state === "run") return runSequence;
  if (state === "walk") return walkSequence;
  return null;
}

function updateAnimation(deltaSeconds, state) {
  const sequence = currentSequenceForState(state);
  if (!sequence) {
    if (lastState !== "rest") {
      applyRestPose();
      lastAppliedFrame = -1;
    }
    currentFrame = 0;
    lastSequenceName = null;
    lastState = "rest";
    return { sequence: null, previousFrame: 0, currentFrame: 0, advanced: false };
  }

  if (lastSequenceName !== sequence.name) {
    currentFrame = 0;
    lastAppliedFrame = -1;
  }

  const previousFrame = currentFrame;
  if (!paused) {
    currentFrame = (currentFrame + deltaSeconds * 30) % Math.max(1, sequence.durationFrames);
  }

  if (Math.abs(currentFrame - lastAppliedFrame) > 0.001 || lastSequenceName !== sequence.name) {
    applySequence(sequence, currentFrame);
    lastAppliedFrame = currentFrame;
  }

  lastSequenceName = sequence.name;
  lastState = state;
  return {
    sequence,
    previousFrame,
    currentFrame,
    advanced: !paused && currentFrame !== previousFrame,
  };
}

function movementInput() {
  const forward = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0)
    - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  const turn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0)
    - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
  const running = keys.has("ShiftLeft") || keys.has("ShiftRight");
  return { forward, turn, running };
}

function updateActor(deltaSeconds) {
  const input = movementInput();
  const turnSpeed = 2.55;
  actorRoot.rotation.y += input.turn * turnSpeed * deltaSeconds;

  const isMoving = Math.abs(input.forward) > 0;
  const state = motionState(isMoving, input.running);
  const animation = updateAnimation(deltaSeconds, state);
  if (isMoving && !paused) {
    const manualDistance = (input.running ? 1.85 : 0.9) * deltaSeconds;
    const rootDistance = animation.sequence
      ? -MotnLoader.rootMotionDelta(animation.sequence, animation.previousFrame, animation.currentFrame)
      : 0;
    const distance = dom.movementSource.value === "root-motion"
      ? rootDistance
      : manualDistance;
    const direction = new BABYLON.Vector3(
      Math.sin(actorRoot.rotation.y),
      0,
      Math.cos(actorRoot.rotation.y),
    );
    actorRoot.position.addInPlace(direction.scale(input.forward * distance));
  }

  return { state, moving: isMoving, running: input.running, animation };
}

function updateCamera(deltaSeconds) {
  const target = actorRoot.position.add(new BABYLON.Vector3(0, 0.43, 0));
  const currentTarget = camera.getTarget();
  camera.setTarget(BABYLON.Vector3.Lerp(currentTarget, target, Math.min(1, deltaSeconds * 8)));
}

function updateStatus(state) {
  const sequence = currentSequenceForState(state.state);
  dom.status.textContent = [
    `state ${state.state}${paused ? " paused" : ""}`,
    sequence ? `motion ${sequence.name} frame ${currentFrame.toFixed(1)}` : "motion rest",
    `position ${actorRoot.position.x.toFixed(2)}, ${actorRoot.position.z.toFixed(2)}`,
    `movement ${dom.movementSource.value}`,
    "target node-index  rotation radians",
  ].join("\n");
}

async function loadRyo() {
  dom.status.textContent = "Loading...";
  const [modelBuffer, textureBuffer, motionBuffer] = await Promise.all([
    fetchArrayBuffer(MODEL_PATH),
    fetchArrayBuffer(TEXTURE_PATH),
    fetchArrayBuffer(MOTION_PATH),
  ]);

  loader = new Mt5Loader(scene, {
    backFaceCulling: false,
    ryoHeadAtlasFix: true,
    ryoHeadAtlasMode: "project-cw-obj-side",
    characterRigMode: "baked",
  });
  loader.setTexturePackIndex(Mt5Loader.buildTexturePackIndex(textureBuffer), null, textureBuffer, null);

  const roots = await loader.load(modelBuffer, textureBuffer);
  if (roots.length === 0) {
    throw new Error("Ryo MT5 did not produce a renderable root.");
  }

  modelRoot = roots[0];
  modelRoot.parent = modelOffset;
  motion = MotnLoader.parse(motionBuffer);
  walkSequence = motion.getSequence(WALK_SEQUENCE);
  runSequence = motion.getSequence(RUN_SEQUENCE);
  if (!walkSequence || !runSequence) {
    throw new Error("Required Ryo walk/run sequences were not found.");
  }

  applyRestPose();
  const bounds = getRenderableBounds(modelRoot);
  modelOffset.position.y = -bounds.min.y;
  frameCamera();
  ready = true;
}

function resetActor() {
  actorRoot.position.set(0, 0, 0);
  actorRoot.rotation.set(0, 0, 0);
  currentFrame = 0;
  lastAppliedFrame = -1;
  lastSequenceName = null;
  applyRestPose();
  frameCamera();
}

function bindEvents() {
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });
  window.addEventListener("resize", () => engine.resize());

  dom.pauseButton.addEventListener("click", () => {
    paused = !paused;
    dom.pauseButton.textContent = paused ? "Resume" : "Pause";
  });
  dom.resetButton.addEventListener("click", resetActor);
  dom.frameButton.addEventListener("click", frameCamera);
  dom.labButton.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
}

createWorld();
bindEvents();

loadRyo().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
});

engine.runRenderLoop(() => {
  const deltaSeconds = Math.min(0.05, Math.max(0, engine.getDeltaTime() / 1000));
  if (!ready) {
    scene.render();
    return;
  }

  const state = updateActor(deltaSeconds);
  updateCamera(deltaSeconds);
  updateStatus(state);
  scene.render();
});

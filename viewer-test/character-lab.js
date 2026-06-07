import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { MotnLoader } from "../src/MotnLoader.js";

const ASSETS = [
  {
    label: "YDB1 Ryu - YKC_M",
    model: "S2_YDB1_YKC_M.MT5",
    texturePack: "S2_YDB1_textures.bin",
  },
  {
    label: "JOMO Ryu - YKB_M",
    model: "S2_JOMO_YKB_M.MT5",
    texturePack: "S2_JOMO_textures.bin",
  },
  {
    label: "MFSY Ryu - YKB_M",
    model: "S2_MFSY_YKB_M.MT5",
    texturePack: "S2_MFSY_textures.bin",
  },
  {
    label: "YDB1 Fuku-san - FUK_M",
    model: "S2_YDB1_FUK_M.MT5",
    texturePack: "S2_YDB1_textures.bin",
  },
  {
    label: "TOKI Ryu effect/static - RYUM400G",
    model: "S2_TOKI_RYUM400G.MT5",
    texturePack: "S2_TOKI_textures.bin",
  },
];

const MOTION_PATH = "/extracted_files/data/MOTION/MOTION.BIN";
const DEFAULT_MOTION_SEQUENCES = ["AKI_AKI_RUN_LP", "AKI_AKI_WALK_LP"];
const STABLE_MOTION_TARGETS = {
  "node-index": new Set([25, 26, 29, 30, 31, 32]),
  "flag-low-byte": new Set([5, 9, 16, 18, 21, 23]),
};
const MOTION_POSE_OPTIONS = {
  applyMode: "additive",
  useTranslations: false,
  rotationScale: 1,
  rotationSigns: [1, 1, 1],
  positionSigns: [-1, 1, 1],
};

const PRESETS = {
  app: {
    useHierarchy: true,
    usePositions: true,
    useRotations: true,
    root: [-90, 0, 0],
    posSigns: [-1, 1, 1],
    rotSigns: [1, -1, -1],
    rotOrder: "babylon",
    pivotMode: "none",
  },
  rawrot: {
    useHierarchy: true,
    usePositions: true,
    useRotations: true,
    root: [-90, 0, 0],
    posSigns: [-1, 1, 1],
    rotSigns: [1, 1, 1],
    rotOrder: "babylon",
    pivotMode: "none",
  },
  "q-xyz": {
    useHierarchy: true,
    usePositions: true,
    useRotations: true,
    root: [-90, 0, 0],
    posSigns: [-1, 1, 1],
    rotSigns: [1, -1, -1],
    rotOrder: "xyz",
    pivotMode: "none",
  },
  "q-xzy": {
    useHierarchy: true,
    usePositions: true,
    useRotations: true,
    root: [-90, 0, 0],
    posSigns: [-1, 1, 1],
    rotSigns: [1, -1, -1],
    rotOrder: "xzy",
    pivotMode: "none",
  },
  "flat": {
    useHierarchy: false,
    usePositions: true,
    useRotations: true,
    root: [-90, 0, 0],
    posSigns: [-1, 1, 1],
    rotSigns: [1, -1, -1],
    rotOrder: "babylon",
    pivotMode: "none",
  },
  "no-rot": {
    useHierarchy: true,
    usePositions: true,
    useRotations: false,
    root: [-90, 0, 0],
    posSigns: [-1, 1, 1],
    rotSigns: [1, -1, -1],
    rotOrder: "babylon",
    pivotMode: "none",
  },
  identity: {
    useHierarchy: false,
    usePositions: false,
    useRotations: false,
    root: [-90, 0, 0],
    posSigns: [-1, 1, 1],
    rotSigns: [1, -1, -1],
    rotOrder: "babylon",
    pivotMode: "none",
  },
};

const dom = {
  canvas: document.getElementById("renderCanvas"),
  status: document.getElementById("status"),
  modelSelect: document.getElementById("modelSelect"),
  presetSelect: document.getElementById("presetSelect"),
  reloadButton: document.getElementById("reloadButton"),
  frameButton: document.getElementById("frameButton"),
  worldButton: document.getElementById("worldButton"),
  copyButton: document.getElementById("copyButton"),
  shotButton: document.getElementById("shotButton"),
  motionSequence: document.getElementById("motionSequence"),
  motionInterpretation: document.getElementById("motionInterpretation"),
  motionTarget: document.getElementById("motionTarget"),
  motionFrame: document.getElementById("motionFrame"),
  motionStableFilter: document.getElementById("motionStableFilter"),
  motionPlayButton: document.getElementById("motionPlayButton"),
  motionRestButton: document.getElementById("motionRestButton"),
  useHierarchy: document.getElementById("useHierarchy"),
  useRotations: document.getElementById("useRotations"),
  usePositions: document.getElementById("usePositions"),
  pivotMode: document.getElementById("pivotMode"),
  rootX: document.getElementById("rootX"),
  rootY: document.getElementById("rootY"),
  rootZ: document.getElementById("rootZ"),
  posSignX: document.getElementById("posSignX"),
  posSignY: document.getElementById("posSignY"),
  posSignZ: document.getElementById("posSignZ"),
  rotSignX: document.getElementById("rotSignX"),
  rotSignY: document.getElementById("rotSignY"),
  rotSignZ: document.getElementById("rotSignZ"),
  rotOrder: document.getElementById("rotOrder"),
  ryoHeadAtlasMode: document.getElementById("ryoHeadAtlasMode"),
  textureCoordinateMode: document.getElementById("textureCoordinateMode"),
  backFaceCulling: document.getElementById("backFaceCulling"),
  stripWindingSign: document.getElementById("stripWindingSign"),
  mirrorResize: document.getElementById("mirrorResize"),
  showAxes: document.getElementById("showAxes"),
  dimUnselected: document.getElementById("dimUnselected"),
  nodeList: document.getElementById("nodeList"),
  settingsText: document.getElementById("settingsText"),
};

for (const asset of ASSETS) {
  const option = document.createElement("option");
  option.value = asset.model;
  option.textContent = asset.label;
  dom.modelSelect.append(option);
}

for (const presetName of Object.keys(PRESETS)) {
  const option = document.createElement("option");
  option.value = presetName;
  option.textContent = presetName;
  dom.presetSelect.append(option);
}

const engine = new BABYLON.Engine(dom.canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.78, 0.78, 0.76, 1);
scene.ambientColor = new BABYLON.Color3(0.55, 0.55, 0.55);

const camera = new BABYLON.ArcRotateCamera(
  "camera",
  BABYLON.Tools.ToRadians(205),
  BABYLON.Tools.ToRadians(72),
  2.2,
  BABYLON.Vector3.Zero(),
  scene,
);
camera.attachControl(dom.canvas, true);
camera.minZ = 0.01;
camera.maxZ = 100;
camera.wheelPrecision = 80;
camera.panningSensibility = 70;
camera.upperRadiusLimit = 20;
scene.activeCamera = camera;

new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.0;
const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -1, -0.75), scene);
key.intensity = 1.2;

let currentRoot = null;
let currentNodes = [];
let currentLoader = null;
let selectedNodeAddr = null;
let axesMeshes = [];
let motionData = null;
let currentMotionSequence = null;
let currentMotionFrame = 0;
let motionPlaying = false;

function degToRad(value) {
  return BABYLON.Tools.ToRadians(Number.parseFloat(value) || 0);
}

function radToDeg(value) {
  return Math.round(BABYLON.Tools.ToDegrees(value) * 100) / 100;
}

function axisQuaternion(axis, angle) {
  switch (axis) {
    case "x":
      return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, angle);
    case "y":
      return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, angle);
    case "z":
      return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, angle);
    default:
      throw new Error(`Unknown axis ${axis}`);
  }
}

function composeEuler(order, angles) {
  let q = BABYLON.Quaternion.Identity();
  for (const axis of order) {
    q = q.multiply(axisQuaternion(axis, angles[axis]));
  }
  return q;
}

function getSettings() {
  const motionInterpretation = getMotionInterpretation();
  const motionTarget = getMotionTarget();
  return {
    asset: ASSETS.find((asset) => asset.model === dom.modelSelect.value),
    useHierarchy: dom.useHierarchy.checked,
    usePositions: dom.usePositions.checked,
    useRotations: dom.useRotations.checked,
    root: [
      Number.parseFloat(dom.rootX.value) || 0,
      Number.parseFloat(dom.rootY.value) || 0,
      Number.parseFloat(dom.rootZ.value) || 0,
    ],
    posSigns: [
      Number.parseInt(dom.posSignX.value, 10),
      Number.parseInt(dom.posSignY.value, 10),
      Number.parseInt(dom.posSignZ.value, 10),
    ],
    rotSigns: [
      Number.parseInt(dom.rotSignX.value, 10),
      Number.parseInt(dom.rotSignY.value, 10),
      Number.parseInt(dom.rotSignZ.value, 10),
    ],
    rotOrder: dom.rotOrder.value,
    pivotMode: dom.pivotMode.value,
    motion: {
      sequence: currentMotionSequence?.name || null,
      interpretation: motionInterpretation,
      target: motionTarget,
      frame: currentMotionFrame,
      playing: motionPlaying,
      stableFilter: dom.motionStableFilter.checked,
      poseBones: currentMotionSequence
        ? filterMotionPose(evaluateMotionPose(currentMotionSequence, currentMotionFrame, motionInterpretation), motionTarget).size
        : 0,
    },
    ryoHeadAtlasMode: dom.ryoHeadAtlasMode.value,
    textureCoordinateMode: dom.textureCoordinateMode.value,
    backFaceCulling: dom.backFaceCulling.checked,
    respectStripWindingSign: dom.stripWindingSign.checked,
    emulateMirrorResize: dom.mirrorResize.checked,
    selectedNode: selectedNodeAddr ? `0x${selectedNodeAddr.toString(16)}` : null,
  };
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  dom.useHierarchy.checked = preset.useHierarchy;
  dom.usePositions.checked = preset.usePositions;
  dom.useRotations.checked = preset.useRotations;
  [dom.rootX.value, dom.rootY.value, dom.rootZ.value] = preset.root;
  [dom.posSignX.value, dom.posSignY.value, dom.posSignZ.value] = preset.posSigns.map(String);
  [dom.rotSignX.value, dom.rotSignY.value, dom.rotSignZ.value] = preset.rotSigns.map(String);
  dom.rotOrder.value = preset.rotOrder;
  dom.pivotMode.value = preset.pivotMode;
  applyTransforms();
}

function disposeAxes() {
  for (const mesh of axesMeshes) mesh.dispose();
  axesMeshes = [];
}

function createAxis(name, start, end, color) {
  const line = BABYLON.MeshBuilder.CreateLines(
    name,
    { points: [start, end], updatable: false },
    scene,
  );
  line.color = color;
  axesMeshes.push(line);
}

function updateAxes() {
  disposeAxes();
  if (!dom.showAxes.checked || !selectedNodeAddr) return;

  const node = currentNodes.find((candidate) => candidate.addr === selectedNodeAddr);
  if (!node?.mesh) return;

  node.mesh.computeWorldMatrix(true);
  const matrix = node.mesh.getWorldMatrix();
  const bounds = getRenderableBounds(currentRoot);
  const scale = Math.max(0.06, Math.max(bounds.size.x, bounds.size.y, bounds.size.z) * 0.08);
  const origin = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Zero(), matrix);
  createAxis("selected-x-axis", origin, BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(scale, 0, 0), matrix), new BABYLON.Color3(1, 0.2, 0.2));
  createAxis("selected-y-axis", origin, BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, scale, 0), matrix), new BABYLON.Color3(0.2, 1, 0.2));
  createAxis("selected-z-axis", origin, BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, 0, scale), matrix), new BABYLON.Color3(0.25, 0.45, 1));
}

function applyVisibilityDebug() {
  const dim = dom.dimUnselected.checked && selectedNodeAddr;
  for (const node of currentNodes) {
    if (!node.mesh) continue;
    const visibility = !dim || node.addr === selectedNodeAddr ? 1.0 : 0.18;
    const meshes = typeof node.mesh.getChildMeshes === "function"
      ? node.mesh.getChildMeshes(false)
      : [];
    for (const mesh of meshes) {
      mesh.visibility = visibility;
    }
  }
}

function applyTransforms() {
  if (!currentRoot) return;

  const settings = getSettings();
  const byAddr = new Map(currentNodes.map((node) => [node.addr, node]));

  currentRoot.rotationQuaternion = null;
  currentRoot.rotation.set(
    degToRad(settings.root[0]),
    degToRad(settings.root[1]),
    degToRad(settings.root[2]),
  );
  currentRoot.scaling.set(1, 1, 1);

  for (const node of currentNodes) {
    if (!node.mesh) continue;

    if (settings.useHierarchy && node.parentAddr) {
      const parent = byAddr.get(node.parentAddr);
      node.mesh.parent = parent?.mesh || currentRoot;
    } else {
      node.mesh.parent = currentRoot;
    }

    if (settings.usePositions) {
      node.mesh.position.set(
        settings.posSigns[0] * node.pos.x,
        settings.posSigns[1] * node.pos.y,
        settings.posSigns[2] * node.pos.z,
      );
    } else {
      node.mesh.position.set(0, 0, 0);
    }

    const pivotCompensation = applyModelPivot(node, settings);
    node.mesh.position.addInPlace(pivotCompensation);
    node.mesh.scaling.set(node.scl.x, node.scl.y, node.scl.z);

    if (!settings.useRotations) {
      node.mesh.rotationQuaternion = null;
      node.mesh.rotation.set(0, 0, 0);
      continue;
    }

    const angles = {
      x: settings.rotSigns[0] * node.rot.x,
      y: settings.rotSigns[1] * node.rot.y,
      z: settings.rotSigns[2] * node.rot.z,
    };

    if (settings.rotOrder === "babylon") {
      node.mesh.rotationQuaternion = null;
      node.mesh.rotation.set(angles.x, angles.y, angles.z);
    } else {
      node.mesh.rotation.set(0, 0, 0);
      node.mesh.rotationQuaternion = composeEuler(settings.rotOrder, angles);
    }
  }

  for (const node of [currentRoot, ...currentRoot.getDescendants(false)]) {
    node.computeWorldMatrix(true);
  }

  applyVisibilityDebug();
  updateAxes();
  updateStatus();
}

function convertedModelCenter(node) {
  const center = node.model?.center || { x: 0, y: 0, z: 0 };
  return new BABYLON.Vector3(-center.x, center.y, center.z);
}

function directGeometryChildren(node) {
  if (!node.mesh || typeof node.mesh.getChildren !== "function") return [];
  return node.mesh.getChildren().filter((child) => (
    child instanceof BABYLON.Mesh &&
    typeof child.getTotalVertices === "function" &&
    child.getTotalVertices() > 0
  ));
}

function applyModelPivot(node, settings) {
  const children = directGeometryChildren(node);
  if (children.length === 0) return BABYLON.Vector3.Zero();

  let offset = BABYLON.Vector3.Zero();
  let compensation = BABYLON.Vector3.Zero();
  if (settings.pivotMode === "center") {
    compensation = convertedModelCenter(node);
    offset = compensation.scale(-1);
  } else if (settings.pivotMode === "center-inverse") {
    offset = convertedModelCenter(node);
    compensation = offset.scale(-1);
  }

  for (const child of children) {
    child.position.copyFrom(offset);
  }

  return compensation;
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
  if (!currentRoot) return;
  const bounds = getRenderableBounds(currentRoot);
  const radius = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  camera.setTarget(bounds.center);
  camera.radius = Math.max(1.25, radius * 1.35);
  camera.alpha = BABYLON.Tools.ToRadians(205);
  camera.beta = BABYLON.Tools.ToRadians(72);
  updateStatus();
}

function updateNodeList() {
  dom.nodeList.innerHTML = "";
  for (const node of currentNodes) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node-button";
    if (node.addr === selectedNodeAddr) button.classList.add("is-selected");

    const addr = document.createElement("span");
    addr.textContent = node.addr.toString(16);
    const label = document.createElement("span");
    const modelLabel = node.model ? "mesh" : "node";
    label.textContent = `${modelLabel} rot ${radToDeg(node.rot.x)}, ${radToDeg(node.rot.y)}, ${radToDeg(node.rot.z)}`;

    button.append(addr, label);
    button.addEventListener("click", () => {
      selectedNodeAddr = selectedNodeAddr === node.addr ? null : node.addr;
      updateNodeList();
      applyTransforms();
    });
    dom.nodeList.append(button);
  }
}

function updateStatus() {
  if (!currentRoot) return;
  const bounds = getRenderableBounds(currentRoot);
  const settings = getSettings();
  dom.status.textContent = [
    settings.asset.model,
    `nodes ${currentNodes.length}  meshes ${bounds.count}`,
    `size ${bounds.size.x.toFixed(3)}, ${bounds.size.y.toFixed(3)}, ${bounds.size.z.toFixed(3)}`,
    settings.motion.sequence
      ? `motion ${settings.motion.sequence} ${settings.motion.interpretation}/${settings.motion.target} frame ${settings.motion.frame.toFixed(1)}${settings.motion.playing ? " playing" : ""}`
      : "motion none",
  ].join("\n");
  dom.settingsText.value = JSON.stringify(settings, null, 2);
}

async function loadMotionData() {
  if (motionData) return motionData;
  const motionBuffer = await fetchArrayBuffer(MOTION_PATH);
  motionData = MotnLoader.parse(motionBuffer);

  const preferred = DEFAULT_MOTION_SEQUENCES
    .map((name) => motionData.getSequence(name))
    .filter(Boolean);
  const fallback = motionData.findSequences(/WALK|RUN/).slice(0, 18);
  const sequences = [...new Map([...preferred, ...fallback].map((sequence) => [sequence.name, sequence])).values()];

  dom.motionSequence.innerHTML = "";
  for (const sequence of sequences) {
    const option = document.createElement("option");
    option.value = sequence.name;
    option.textContent = `${sequence.name} (${sequence.durationFrames}f)`;
    dom.motionSequence.append(option);
  }

  currentMotionSequence = sequences[0] || null;
  if (currentMotionSequence) {
    dom.motionSequence.value = currentMotionSequence.name;
    configureMotionFrameInput(currentMotionSequence);
  }

  return motionData;
}

function configureMotionFrameInput(sequence) {
  dom.motionFrame.min = "0";
  dom.motionFrame.max = String(sequence?.durationFrames || 1);
  dom.motionFrame.step = "0.1";
  currentMotionFrame = Math.min(currentMotionFrame, sequence?.durationFrames || 0);
  dom.motionFrame.value = String(currentMotionFrame);
}

function getMotionInterpretation() {
  return dom.motionInterpretation.value === "tracks" ? "tracks" : "compat";
}

function getMotionTarget() {
  return dom.motionTarget.value === "flag-low-byte" ? "flag-low-byte" : "node-index";
}

function evaluateMotionPose(sequence, frame, interpretation = getMotionInterpretation()) {
  return interpretation === "tracks"
    ? MotnLoader.evaluateSequenceMotionTracks(sequence, frame)
    : MotnLoader.evaluateSequence(sequence, frame);
}

function filterMotionPose(pose, target = getMotionTarget()) {
  if (!dom.motionStableFilter.checked) return pose;
  const stableTargets = STABLE_MOTION_TARGETS[target] || STABLE_MOTION_TARGETS["node-index"];
  const filtered = new Map();
  for (const [boneId, channels] of pose.entries()) {
    if (stableTargets.has(boneId)) {
      filtered.set(boneId, channels);
    }
  }
  return filtered;
}

function applyCurrentMotionFrame() {
  if (!currentRoot || !currentLoader || !currentMotionSequence) return;
  const motionTarget = getMotionTarget();
  const pose = filterMotionPose(evaluateMotionPose(currentMotionSequence, currentMotionFrame), motionTarget);
  currentLoader.applyCharacterRigPose(currentRoot, pose, {
    ...MOTION_POSE_OPTIONS,
    poseTarget: motionTarget,
  });
  dom.motionFrame.value = String(currentMotionFrame);
  updateAxes();
  updateStatus();
}

function restoreBindPose() {
  motionPlaying = false;
  dom.motionPlayButton.textContent = "Play";
  currentMotionFrame = 0;
  if (currentLoader && currentRoot) {
    currentLoader.applyCharacterRigPose(currentRoot, new Map(), {
      ...MOTION_POSE_OPTIONS,
      poseTarget: getMotionTarget(),
    });
  }
  dom.motionFrame.value = "0";
  updateAxes();
  updateStatus();
}

async function selectMotionSequence(name) {
  await loadMotionData();
  currentMotionSequence = motionData.getSequence(name) || currentMotionSequence;
  configureMotionFrameInput(currentMotionSequence);
  applyCurrentMotionFrame();
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

async function loadSelectedAsset() {
  const asset = ASSETS.find((candidate) => candidate.model === dom.modelSelect.value) || ASSETS[0];
  dom.status.textContent = `Loading ${asset.model}...`;
  disposeAxes();
  selectedNodeAddr = null;

  if (currentRoot) {
    currentRoot.dispose(false, true);
    currentRoot = null;
    currentNodes = [];
    currentLoader = null;
  }

  const [modelBuffer, textureBuffer] = await Promise.all([
    fetchArrayBuffer(`/models/${asset.model}`),
    fetchArrayBuffer(`/models/${asset.texturePack}`),
  ]);

  const loader = new Mt5Loader(scene, {
    backFaceCulling: dom.backFaceCulling.checked,
    respectStripWindingSign: dom.stripWindingSign.checked,
    emulateMirrorResize: dom.mirrorResize.checked,
    ryoHeadAtlasFix: true,
    ryoHeadAtlasMode: dom.ryoHeadAtlasMode.value,
    textureCoordinateMode: dom.textureCoordinateMode.value,
  });
  loader.setTexturePackIndex(Mt5Loader.buildTexturePackIndex(textureBuffer), null, textureBuffer, null);
  const roots = await loader.load(modelBuffer, textureBuffer);
  if (roots.length === 0) {
    throw new Error(`No renderable roots loaded for ${asset.model}`);
  }

  currentRoot = roots[0];
  currentNodes = currentRoot._mt5Nodes || [];
  currentLoader = loader;
  updateNodeList();
  applyTransforms();
  await loadMotionData();
  if (currentMotionSequence && motionPlaying) {
    applyCurrentMotionFrame();
  }
  frameCamera();
}

function savePng() {
  const settings = getSettings();
  const link = document.createElement("a");
  const slug = settings.asset.model.replace(/[^a-z0-9]+/gi, "-").replace(/-$/, "").toLowerCase();
  link.download = `${slug}-character-lab.png`;
  link.href = dom.canvas.toDataURL("image/png");
  link.click();
}

async function copySettings() {
  dom.settingsText.select();
  try {
    await navigator.clipboard.writeText(dom.settingsText.value);
  } catch {
    document.execCommand("copy");
  }
}

dom.presetSelect.addEventListener("change", () => applyPreset(dom.presetSelect.value));
dom.reloadButton.addEventListener("click", () => loadSelectedAsset().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
}));
dom.frameButton.addEventListener("click", frameCamera);
dom.worldButton.addEventListener("click", () => {
  window.location.href = "./ryo-world.html";
});
dom.copyButton.addEventListener("click", copySettings);
dom.shotButton.addEventListener("click", savePng);
dom.motionSequence.addEventListener("change", () => selectMotionSequence(dom.motionSequence.value).catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
}));
dom.motionFrame.addEventListener("input", () => {
  motionPlaying = false;
  dom.motionPlayButton.textContent = "Play";
  currentMotionFrame = Number.parseFloat(dom.motionFrame.value) || 0;
  applyCurrentMotionFrame();
});
dom.motionStableFilter.addEventListener("change", applyCurrentMotionFrame);
dom.motionInterpretation.addEventListener("change", applyCurrentMotionFrame);
dom.motionTarget.addEventListener("change", applyCurrentMotionFrame);
dom.motionPlayButton.addEventListener("click", () => {
  motionPlaying = !motionPlaying;
  dom.motionPlayButton.textContent = motionPlaying ? "Pause" : "Play";
  updateStatus();
});
dom.motionRestButton.addEventListener("click", restoreBindPose);
dom.ryoHeadAtlasMode.addEventListener("change", () => loadSelectedAsset().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
}));
dom.textureCoordinateMode.addEventListener("change", () => loadSelectedAsset().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
}));
dom.backFaceCulling.addEventListener("change", () => loadSelectedAsset().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
}));
dom.stripWindingSign.addEventListener("change", () => loadSelectedAsset().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
}));
dom.mirrorResize.addEventListener("change", () => loadSelectedAsset().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
}));

for (const input of [
  dom.useHierarchy,
  dom.useRotations,
  dom.usePositions,
  dom.pivotMode,
  dom.rootX,
  dom.rootY,
  dom.rootZ,
  dom.posSignX,
  dom.posSignY,
  dom.posSignZ,
  dom.rotSignX,
  dom.rotSignY,
  dom.rotSignZ,
  dom.rotOrder,
  dom.showAxes,
  dom.dimUnselected,
]) {
  input.addEventListener("change", applyTransforms);
  input.addEventListener("input", applyTransforms);
}

dom.modelSelect.addEventListener("change", () => loadSelectedAsset().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
}));

window.addEventListener("resize", () => engine.resize());
engine.runRenderLoop(() => {
  if (motionPlaying && currentMotionSequence) {
    const deltaFrames = Math.max(0, engine.getDeltaTime() / 1000) * 30;
    currentMotionFrame = (currentMotionFrame + deltaFrames) % Math.max(1, currentMotionSequence.durationFrames);
    applyCurrentMotionFrame();
  }
  scene.render();
});

applyPreset("app");
loadSelectedAsset().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
});

import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders/OBJ/objFileLoader.js";

const MODEL_ROOT = "/wudecon-obj/ryo/";
const MODEL_FILE = "S2_YDB1_YKC_M.obj";
const ATLAS_MATERIAL = "mat_5f4a414b5f424ba6";

const dom = {
  canvas: document.getElementById("renderCanvas"),
  status: document.getElementById("status"),
  materialMode: document.getElementById("materialMode"),
  uvTarget: document.getElementById("uvTarget"),
  uvRegion: document.getElementById("uvRegion"),
  uvMirrorSide: document.getElementById("uvMirrorSide"),
  uvRotateCw: document.getElementById("uvRotateCw"),
  uvRotateCcw: document.getElementById("uvRotateCcw"),
  uvRotate180: document.getElementById("uvRotate180"),
  uvSwap: document.getElementById("uvSwap"),
  uvFlipU: document.getElementById("uvFlipU"),
  uvFlipV: document.getElementById("uvFlipV"),
  backfaceCulling: document.getElementById("backfaceCulling"),
  frameButton: document.getElementById("frameButton"),
  materialList: document.getElementById("materialList"),
};

const engine = new BABYLON.Engine(dom.canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.73, 0.72, 0.68, 1);
scene.ambientColor = new BABYLON.Color3(0.58, 0.58, 0.58);

const camera = new BABYLON.ArcRotateCamera(
  "camera",
  BABYLON.Tools.ToRadians(215),
  BABYLON.Tools.ToRadians(70),
  1.2,
  BABYLON.Vector3.Zero(),
  scene,
);
camera.attachControl(dom.canvas, true);
camera.minZ = 0.01;
camera.maxZ = 100;
camera.wheelPrecision = 80;
camera.panningSensibility = 70;
scene.activeCamera = camera;

new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.9;
const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -1, -0.55), scene);
key.intensity = 1.35;

let loadedMeshes = [];
const originalMaterials = new Map();
const originalUvs = new Map();
const originalPositions = new Map();
const idMaterials = new Map();
const wireMaterials = new Map();

function materialName(material) {
  return material?.name || "(none)";
}

function colorFromName(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const hue = ((hash >>> 0) % 360) / 360;
  const color = BABYLON.Color3.FromHSV(hue * 360, 0.58, 0.88);
  if (name === ATLAS_MATERIAL) {
    return new BABYLON.Color3(0.95, 0.36, 0.22);
  }
  return color;
}

function createMaterial(name, color, wireframe = false) {
  const material = new BABYLON.StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
  material.backFaceCulling = dom.backfaceCulling.checked;
  material.wireframe = wireframe;
  return material;
}

function getIdMaterial(name) {
  if (!idMaterials.has(name)) {
    idMaterials.set(name, createMaterial(`id_${name}`, colorFromName(name)));
  }
  return idMaterials.get(name);
}

function getWireMaterial(name) {
  if (!wireMaterials.has(name)) {
    wireMaterials.set(name, createMaterial(`wire_${name}`, new BABYLON.Color3(0.08, 0.1, 0.12), true));
  }
  return wireMaterials.get(name);
}

function getVisibleMeshes() {
  return loadedMeshes.filter((mesh) => mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0);
}

function frameModel() {
  const meshes = getVisibleMeshes();
  if (meshes.length === 0) return;

  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
  }

  let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    const box = mesh.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
    max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
  }

  const center = min.add(max).scale(0.5);
  const size = max.subtract(min);
  const radius = Math.max(size.x, size.y, size.z) * 1.15 || 1;
  camera.setTarget(center);
  camera.radius = radius;
  camera.lowerRadiusLimit = radius * 0.08;
  camera.upperRadiusLimit = radius * 12;
}

function setBackfaceCulling(enabled) {
  for (const material of scene.materials) {
    if ("backFaceCulling" in material) {
      material.backFaceCulling = enabled;
    }
  }
}

function getUvTransformFlags() {
  return {
    rotateCw: dom.uvRotateCw.checked,
    rotateCcw: dom.uvRotateCcw.checked,
    rotate180: dom.uvRotate180.checked,
    swap: dom.uvSwap.checked,
    flipU: dom.uvFlipU.checked,
    flipV: dom.uvFlipV.checked,
  };
}

function formatUvTransform(flags = getUvTransformFlags()) {
  const active = [];
  if (flags.rotateCw) active.push("rotate-cw");
  if (flags.rotateCcw) active.push("rotate-ccw");
  if (flags.rotate180) active.push("rotate-180");
  if (flags.swap) active.push("swap");
  if (flags.flipU) active.push("flip-u");
  if (flags.flipV) active.push("flip-v");
  return active.length > 0 ? active.join(" + ") : "none";
}

function transformUv(u, v, flags) {
  let nextU = u;
  let nextV = v;

  if (flags.rotateCw) {
    [nextU, nextV] = [nextV, 1 - nextU];
  }
  if (flags.rotateCcw) {
    [nextU, nextV] = [1 - nextV, nextU];
  }
  if (flags.rotate180) {
    [nextU, nextV] = [1 - nextU, 1 - nextV];
  }
  if (flags.swap) {
    [nextU, nextV] = [nextV, nextU];
  }
  if (flags.flipU) {
    nextU = 1 - nextU;
  }
  if (flags.flipV) {
    nextV = 1 - nextV;
  }

  return [nextU, nextV];
}

function shouldTransformMesh(mesh) {
  if (dom.uvTarget.value === "all") return true;
  return materialName(originalMaterials.get(mesh) || mesh.material) === ATLAS_MATERIAL;
}

function isUvInRegion(sourceU) {
  switch (dom.uvRegion.value) {
    case "face":
      return sourceU >= 0.5;
    case "side":
      return sourceU < 0.5;
    default:
      return true;
  }
}

function shouldMirrorSideBack(sourceU, x) {
  if (sourceU >= 0.5) return false;
  if (dom.uvTarget.value !== "atlas") return false;
  if (dom.uvMirrorSide.value === "negative-x") return x < 0;
  if (dom.uvMirrorSide.value === "positive-x") return x > 0;
  return false;
}

function applyUvTransform() {
  const flags = getUvTransformFlags();
  const hasTransform = flags.rotateCw || flags.rotateCcw || flags.rotate180 || flags.swap || flags.flipU || flags.flipV;
  const hasMirror = dom.uvMirrorSide.value !== "off";
  for (const mesh of getVisibleMeshes()) {
    const source = originalUvs.get(mesh);
    const positions = originalPositions.get(mesh);
    if (!source) continue;

    if ((!hasTransform && !hasMirror) || !shouldTransformMesh(mesh)) {
      mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, source, false);
      continue;
    }

    const next = source.slice();
    for (let i = 0; i < next.length; i += 2) {
      const vertexIndex = i / 2;
      const x = positions ? positions[vertexIndex * 3] : 0;
      let sourceU = source[i];
      let sourceV = source[i + 1];

      if (shouldMirrorSideBack(sourceU, x)) {
        sourceU = 0.5 - sourceU;
      }

      if (!isUvInRegion(source[i])) {
        next[i] = sourceU;
        next[i + 1] = sourceV;
        continue;
      }

      const [u, v] = transformUv(sourceU, sourceV, flags);
      next[i] = u;
      next[i + 1] = v;
    }
    mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, next, false);
  }
}

function applyMaterialMode() {
  for (const mesh of getVisibleMeshes()) {
    const original = originalMaterials.get(mesh) || mesh.material;
    const name = materialName(original);
    if (dom.materialMode.value === "id") {
      mesh.material = getIdMaterial(name);
    } else if (dom.materialMode.value === "wire") {
      mesh.material = getWireMaterial(name);
    } else {
      mesh.material = original;
    }
  }
  setBackfaceCulling(dom.backfaceCulling.checked);
}

function countTriangles(mesh) {
  const indices = mesh.getIndices();
  if (indices?.length) return Math.floor(indices.length / 3);
  return 0;
}

function updateStatus() {
  const meshes = getVisibleMeshes();
  const vertices = meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
  const triangles = meshes.reduce((sum, mesh) => sum + countTriangles(mesh), 0);
  const materials = new Set(meshes.map((mesh) => materialName(originalMaterials.get(mesh) || mesh.material)));
  dom.status.textContent = [
    `${MODEL_FILE}`,
    `${meshes.length} meshes, ${vertices.toLocaleString()} vertices, ${triangles.toLocaleString()} triangles`,
    `${materials.size} materials; atlas material: ${ATLAS_MATERIAL}`,
    `UV: ${dom.uvTarget.value} / ${dom.uvRegion.value} / ${formatUvTransform()} / mirror ${dom.uvMirrorSide.value}`,
  ].join("\n");
}

function updateMaterialList() {
  const counts = new Map();
  for (const mesh of getVisibleMeshes()) {
    const name = materialName(originalMaterials.get(mesh) || mesh.material);
    counts.set(name, (counts.get(name) || 0) + countTriangles(mesh));
  }

  dom.materialList.innerHTML = "";
  for (const [name, triangles] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const row = document.createElement("div");
    row.className = "material-row";

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    const color = colorFromName(name);
    swatch.style.background = color.toHexString();

    const label = document.createElement("span");
    label.className = "material-name";
    label.textContent = name;
    label.title = name === ATLAS_MATERIAL ? "Ryo combined face/side-head atlas" : name;

    const count = document.createElement("span");
    count.textContent = triangles.toLocaleString();

    row.append(swatch, label, count);
    dom.materialList.append(row);
  }
}

async function loadObj() {
  dom.status.textContent = "Loading...";
  const result = await BABYLON.SceneLoader.ImportMeshAsync("", MODEL_ROOT, MODEL_FILE, scene);
  loadedMeshes = result.meshes;

  for (const mesh of getVisibleMeshes()) {
    originalMaterials.set(mesh, mesh.material);
    const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (uvs) originalUvs.set(mesh, Array.from(uvs));
    if (positions) originalPositions.set(mesh, Array.from(positions));
    mesh.alwaysSelectAsActiveMesh = true;
  }

  applyUvTransform();
  applyMaterialMode();
  updateMaterialList();
  frameModel();
  updateStatus();
}

dom.materialMode.addEventListener("change", applyMaterialMode);
dom.uvTarget.addEventListener("change", () => {
  applyUvTransform();
  updateStatus();
});
dom.uvRegion.addEventListener("change", () => {
  applyUvTransform();
  updateStatus();
});
dom.uvMirrorSide.addEventListener("change", () => {
  applyUvTransform();
  updateStatus();
});
for (const checkbox of [dom.uvRotateCw, dom.uvRotateCcw, dom.uvRotate180, dom.uvSwap, dom.uvFlipU, dom.uvFlipV]) {
  checkbox.addEventListener("change", () => {
    applyUvTransform();
    updateStatus();
  });
}
dom.backfaceCulling.addEventListener("change", () => {
  setBackfaceCulling(dom.backfaceCulling.checked);
});
dom.frameButton.addEventListener("click", frameModel);

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

loadObj().catch((error) => {
  console.error(error);
  dom.status.textContent = `OBJ load failed:\n${error?.message || error}`;
});

import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";

const CHARACTERS = [
  {
    key: "ryo",
    label: "Ryo",
    model: "S2_YDB1_YKC_M.MT5",
    texturePack: "S2_YDB1_textures.bin",
    targetCenter: new BABYLON.Vector3(-0.24, 0.5, 0),
    parts: [
      { addr: 0xd648, label: "main head/face shell" },
      { addr: 0xd688, label: "top scalp/hair cards/back strands" },
      { addr: 0xd6c8, label: "front hairline/side shell layer" },
    ],
  },
  {
    key: "fuku",
    label: "Fuku-san",
    model: "S2_YDB1_FUK_M.MT5",
    texturePack: "S2_YDB1_textures.bin",
    targetCenter: new BABYLON.Vector3(0.24, 0.5, 0),
    parts: [
      { addr: 0xa5b0, label: "upper face/head shell" },
      { addr: 0xa5f0, label: "mouth/jaw neutral", exclusiveGroup: "fuku-mouth" },
      { addr: 0xaeb0, label: "mouth/jaw variant A", exclusiveGroup: "fuku-mouth" },
      { addr: 0xaef0, label: "mouth/jaw variant B", exclusiveGroup: "fuku-mouth" },
    ],
  },
];

const dom = {
  canvas: document.getElementById("renderCanvas"),
  status: document.getElementById("status"),
  frontButton: document.getElementById("frontButton"),
  sideButton: document.getElementById("sideButton"),
  angleButton: document.getElementById("angleButton"),
  frameButton: document.getElementById("frameButton"),
  resetButton: document.getElementById("resetButton"),
  resetUvButton: document.getElementById("resetUvButton"),
  copySettingsButton: document.getElementById("copySettingsButton"),
  showBody: document.getElementById("showBody"),
  backFaceCulling: document.getElementById("backFaceCulling"),
  ryoHeadAtlasMode: document.getElementById("ryoHeadAtlasMode"),
  ryoParts: document.getElementById("ryoParts"),
  ryoUvControls: document.getElementById("ryoUvControls"),
  fukuParts: document.getElementById("fukuParts"),
};

const RYO_UV_DEFAULT = {
  scope: "atlas",
  rotation: "0",
  mirrorU: false,
  mirrorV: false,
  scaleU: 1,
  scaleV: 1,
  offsetU: 0,
  offsetV: 0,
  pivotU: 0.5,
  pivotV: 0.5,
};

const RYO_UV_TARGETS = [
  { key: "0xd648", label: "whole main head/face shell" },
  { key: "0xd688", label: "whole top scalp/hair cards/back strands" },
  { key: "0xd6c8", label: "whole front hairline/side shell layer" },
  { key: "0xd648:face", label: "texture 6 face strips", lockedScopeLabel: "Texture 6 face strips" },
  { key: "0xd648:side", label: "texture 6 side strips", lockedScopeLabel: "Texture 6 side strips" },
  { key: "0xd688:side", label: "texture 6 side strips", lockedScopeLabel: "Texture 6 side strips" },
  { key: "0xd6c8:side", label: "texture 6 side strips", lockedScopeLabel: "Texture 6 side strips" },
];

const engine = new BABYLON.Engine(dom.canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.76, 0.77, 0.74, 1);
scene.ambientColor = new BABYLON.Color3(0.54, 0.54, 0.52);

const camera = new BABYLON.ArcRotateCamera(
  "camera",
  BABYLON.Tools.ToRadians(270),
  BABYLON.Tools.ToRadians(72),
  0.86,
  new BABYLON.Vector3(0, 0.5, 0),
  scene,
);
camera.attachControl(dom.canvas, true);
camera.minZ = 0.01;
camera.maxZ = 100;
camera.lowerRadiusLimit = 0.2;
camera.upperRadiusLimit = 5;
camera.wheelPrecision = 90;
camera.panningSensibility = 75;
scene.activeCamera = camera;

new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.0;
const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -1, -0.75), scene);
key.intensity = 1.2;

const state = {
  characters: new Map(),
  enabledParts: new Map(),
  ryoUvTransforms: new Map(),
  loading: false,
  reloadTimer: null,
};

for (const character of CHARACTERS) {
  const enabled = new Set();
  const groups = new Set();
  for (const part of character.parts) {
    if (!part.exclusiveGroup) {
      enabled.add(part.addr);
      continue;
    }
    if (groups.has(part.exclusiveGroup)) continue;
    groups.add(part.exclusiveGroup);
    enabled.add(part.addr);
  }
  state.enabledParts.set(character.key, enabled);
}

for (const target of RYO_UV_TARGETS) {
  state.ryoUvTransforms.set(target.key, { ...RYO_UV_DEFAULT });
}

function hex(value) {
  return `0x${value.toString(16)}`;
}

function isDefaultUvTransform(transform) {
  return Object.entries(RYO_UV_DEFAULT).every(([key, value]) => transform[key] === value);
}

function parseFiniteNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ryoUvTransformPayload() {
  const payload = {};
  for (const [key, transform] of state.ryoUvTransforms) {
    if (isDefaultUvTransform(transform)) continue;
    payload[key] = { ...transform };
  }
  return payload;
}

function currentViewerSettings() {
  const enabledParts = {};
  for (const character of CHARACTERS) {
    const enabled = state.enabledParts.get(character.key);
    enabledParts[character.key] = character.parts
      .filter((part) => enabled.has(part.addr))
      .map((part) => hex(part.addr));
  }

  return {
    ryoAtlasMode: dom.ryoHeadAtlasMode.value,
    backFaceCulling: dom.backFaceCulling.checked,
    showBodyMeshes: dom.showBody.checked,
    enabledParts,
    ryoUvTransforms: ryoUvTransformPayload(),
  };
}

function settingsText() {
  const settings = currentViewerSettings();
  const lines = [
    "Ryo head-parts viewer settings",
    `Ryo Atlas: ${settings.ryoAtlasMode}`,
    `Backface culling: ${settings.backFaceCulling}`,
    `Show body meshes: ${settings.showBodyMeshes}`,
    `Ryo pieces: ${settings.enabledParts.ryo.join(", ") || "none"}`,
    `Fuku-san pieces: ${settings.enabledParts.fuku.join(", ") || "none"}`,
    "Ryo UV transforms:",
  ];

  const uvEntries = Object.entries(settings.ryoUvTransforms);
  if (uvEntries.length === 0) {
    lines.push("  none");
  } else {
    for (const [key, transform] of uvEntries) {
      lines.push(
        `  ${key}: scope ${transform.scope}, rotate ${transform.rotation}, ` +
        `mirrorU ${transform.mirrorU}, mirrorV ${transform.mirrorV}, ` +
        `scaleU ${transform.scaleU}, scaleV ${transform.scaleV}, ` +
        `offsetU ${transform.offsetU}, offsetV ${transform.offsetV}, ` +
        `pivotU ${transform.pivotU}, pivotV ${transform.pivotV}`,
      );
    }
  }

  lines.push("");
  lines.push(JSON.stringify(settings, null, 2));
  return lines.join("\n");
}

async function copySettingsToClipboard() {
  const text = settingsText();
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function captureCameraView() {
  return {
    alpha: camera.alpha,
    beta: camera.beta,
    radius: camera.radius,
    target: camera.target.clone(),
  };
}

function restoreCameraView(view) {
  if (!view) return;
  camera.alpha = view.alpha;
  camera.beta = view.beta;
  camera.radius = view.radius;
  camera.setTarget(view.target);
}

function scheduleReload(delay = 250) {
  window.clearTimeout(state.reloadTimer);
  state.reloadTimer = window.setTimeout(() => {
    reloadCharacters({ preserveCamera: true }).catch((error) => {
      console.error(error);
      dom.status.textContent = error.message;
    });
  }, delay);
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.arrayBuffer();
}

function getRenderableMeshes(root) {
  return root.getDescendants(false).filter((node) => (
    node instanceof BABYLON.Mesh &&
    typeof node.getTotalVertices === "function" &&
    node.getTotalVertices() > 0
  ));
}

function getRenderableBounds(roots) {
  let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  let count = 0;

  for (const root of roots) {
    for (const node of [root, ...root.getDescendants(false)]) {
      node.computeWorldMatrix(true);
    }

    for (const mesh of getRenderableMeshes(root)) {
      if (!mesh.isEnabled() || mesh.isVisible === false) continue;
      mesh.refreshBoundingInfo();
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
      max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
      count++;
    }
  }

  if (count === 0) {
    min = BABYLON.Vector3.Zero();
    max = BABYLON.Vector3.Zero();
  }

  return { min, max, count, center: min.add(max).scale(0.5), size: max.subtract(min) };
}

function characterBounds(record, partsOnly = true) {
  const partAddrs = new Set(record.config.parts.map((part) => part.addr));
  const hidden = [];
  const enabledParts = state.enabledParts.get(record.config.key);
  for (const mesh of getRenderableMeshes(record.root)) {
    const node = mesh.parent?._mt5Node || mesh._mt5Node;
    const isPart = node && partAddrs.has(node.addr);
    const shouldShow = partsOnly
      ? isPart && enabledParts.has(node.addr)
      : (isPart ? enabledParts.has(node.addr) : true);
    if (!shouldShow) {
      hidden.push([mesh, mesh.isEnabled(), mesh.isVisible]);
      mesh.setEnabled(false);
      mesh.isVisible = false;
    }
  }
  const bounds = getRenderableBounds([record.root]);
  for (const [mesh, enabled, visible] of hidden) {
    mesh.setEnabled(enabled);
    mesh.isVisible = visible;
  }
  return bounds;
}

function placeCharacter(record) {
  applyVisibilityForRecord(record);
  record.root.position.set(0, 0, 0);
  for (const node of [record.root, ...record.root.getDescendants(false)]) {
    node.computeWorldMatrix(true);
  }
  const bounds = characterBounds(record, true);
  const delta = record.config.targetCenter.subtract(bounds.center);
  record.root.position.addInPlace(delta);
}

function applyMaterialCulling(record) {
  const materials = new Set();
  for (const mesh of getRenderableMeshes(record.root)) {
    if (mesh.material) materials.add(mesh.material);
  }
  for (const material of materials) {
    if ("backFaceCulling" in material) material.backFaceCulling = dom.backFaceCulling.checked;
    if ("twoSidedLighting" in material) material.twoSidedLighting = true;
  }
}

function applyVisibilityForRecord(record) {
  const enabledParts = state.enabledParts.get(record.config.key);
  const partAddrs = new Set(record.config.parts.map((part) => part.addr));
  const showBody = dom.showBody.checked;

  for (const mesh of getRenderableMeshes(record.root)) {
    const node = mesh.parent?._mt5Node || mesh._mt5Node;
    const isPart = node && partAddrs.has(node.addr);
    const visible = isPart ? enabledParts.has(node.addr) : showBody;
    mesh.setEnabled(visible);
    mesh.isVisible = visible;
  }

  applyMaterialCulling(record);
}

function applyVisibility() {
  for (const record of state.characters.values()) {
    applyVisibilityForRecord(record);
  }
  updateStatus();
}

async function loadCharacter(config) {
  const [modelBuffer, textureBuffer] = await Promise.all([
    fetchArrayBuffer(`/models/${config.model}`),
    fetchArrayBuffer(`/models/${config.texturePack}`),
  ]);

  const loader = new Mt5Loader(scene, {
    backFaceCulling: dom.backFaceCulling.checked,
    respectStripWindingSign: false,
    emulateMirrorResize: true,
    ryoHeadAtlasFix: true,
    ryoHeadAtlasMode: dom.ryoHeadAtlasMode.value,
    ryoHeadNodeUvTransforms: config.key === "ryo" ? ryoUvTransformPayload() : null,
    textureCoordinateMode: "viewer",
    characterRigMode: "baked",
  });
  loader.setTexturePackIndex(Mt5Loader.buildTexturePackIndex(textureBuffer), null, textureBuffer, null);
  const roots = await loader.load(modelBuffer, textureBuffer);
  if (roots.length === 0) throw new Error(`No renderable roots loaded for ${config.model}`);

  const root = roots[0];
  root.name = `${config.key}_root`;
  const record = { config, loader, root, nodes: root._mt5Nodes || [] };
  state.characters.set(config.key, record);
  placeCharacter(record);
  return record;
}

function disposeCharacters() {
  for (const record of state.characters.values()) {
    record.root.dispose(false, true);
  }
  state.characters.clear();
}

function buildPartControls() {
  for (const character of CHARACTERS) {
    const fieldset = character.key === "ryo" ? dom.ryoParts : dom.fukuParts;
    for (const part of character.parts) {
      const row = document.createElement("label");
      row.className = "check-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.enabledParts.get(character.key).has(part.addr);
      input.dataset.character = character.key;
      input.dataset.addr = String(part.addr);
      if (part.exclusiveGroup) input.dataset.exclusiveGroup = part.exclusiveGroup;
      const label = document.createElement("span");
      label.innerHTML = `<code>${hex(part.addr)}</code> ${part.label}`;
      row.append(input, label);
      input.addEventListener("change", () => {
        const enabled = state.enabledParts.get(character.key);
        if (input.checked) {
          if (part.exclusiveGroup) {
            for (const sibling of character.parts) {
              if (sibling.exclusiveGroup !== part.exclusiveGroup || sibling.addr === part.addr) continue;
              enabled.delete(sibling.addr);
              const siblingInput = document.querySelector(`input[data-character="${character.key}"][data-addr="${sibling.addr}"]`);
              if (siblingInput) siblingInput.checked = false;
            }
          }
          enabled.add(part.addr);
        } else {
          enabled.delete(part.addr);
        }
        applyVisibility();
      });
      fieldset.append(row);
    }
  }
}

function buildRyoUvControls() {
  for (const target of RYO_UV_TARGETS) {
    const transform = state.ryoUvTransforms.get(target.key);
    const section = document.createElement("section");
    section.className = "uv-node";
    section.dataset.uvKey = target.key;

    const title = document.createElement("div");
    title.className = "uv-title";
    title.innerHTML = `<span><code>${target.key}</code> ${target.label}</span>`;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.dataset.uvReset = target.key;
    title.append(reset);

    const grid = document.createElement("div");
    grid.className = "uv-grid";
    grid.innerHTML = `
      <label>
        <span>Apply to</span>
        <select data-uv-field="scope" ${target.lockedScopeLabel ? "disabled" : ""}>
          <option value="atlas">${target.lockedScopeLabel || "Texture 6"}</option>
          ${target.lockedScopeLabel ? "" : `
            <option value="hair">Texture 8</option>
            <option value="head-textures">Textures 6+8</option>
            <option value="all">All node textures</option>
          `}
        </select>
      </label>
      <label>
        <span>Rotate</span>
        <select data-uv-field="rotation">
          <option value="0">0</option>
          <option value="90">90 CW</option>
          <option value="180">180</option>
          <option value="270">90 CCW</option>
        </select>
      </label>
      <label>
        <span>Scale U</span>
        <input data-uv-field="scaleU" type="number" min="-4" max="4" step="0.05" />
      </label>
      <label>
        <span>Scale V</span>
        <input data-uv-field="scaleV" type="number" min="-4" max="4" step="0.05" />
      </label>
      <label>
        <span>Offset U</span>
        <input data-uv-field="offsetU" type="number" min="-2" max="2" step="0.01" />
      </label>
      <label>
        <span>Offset V</span>
        <input data-uv-field="offsetV" type="number" min="-2" max="2" step="0.01" />
      </label>
      <label>
        <span>Pivot U</span>
        <input data-uv-field="pivotU" type="number" min="-2" max="2" step="0.01" />
      </label>
      <label>
        <span>Pivot V</span>
        <input data-uv-field="pivotV" type="number" min="-2" max="2" step="0.01" />
      </label>
    `;

    const checks = document.createElement("div");
    checks.className = "uv-checks";
    checks.innerHTML = `
      <label class="switch-row">
        <input data-uv-field="mirrorU" type="checkbox" />
        <span>Mirror U</span>
      </label>
      <label class="switch-row">
        <input data-uv-field="mirrorV" type="checkbox" />
        <span>Mirror V</span>
      </label>
    `;

    section.append(title, grid, checks);
    dom.ryoUvControls.append(section);
    syncRyoUvControlSection(section, transform);
  }

  dom.ryoUvControls.addEventListener("change", (event) => {
    const field = event.target?.dataset?.uvField;
    if (!field) return;

    const section = event.target.closest("[data-uv-key]");
    const key = section.dataset.uvKey;
    const transform = state.ryoUvTransforms.get(key);
    if (!transform) return;

    if (event.target.type === "checkbox") {
      transform[field] = event.target.checked;
    } else if (event.target.tagName === "SELECT") {
      transform[field] = event.target.value;
    } else {
      transform[field] = parseFiniteNumber(event.target.value, RYO_UV_DEFAULT[field]);
      event.target.value = String(transform[field]);
    }
    updateStatus();
    scheduleReload();
  });

  dom.ryoUvControls.addEventListener("click", (event) => {
    const key = event.target?.dataset?.uvReset || "";
    if (!key) return;
    state.ryoUvTransforms.set(key, { ...RYO_UV_DEFAULT });
    const section = dom.ryoUvControls.querySelector(`[data-uv-key="${key}"]`);
    if (section) syncRyoUvControlSection(section, state.ryoUvTransforms.get(key));
    updateStatus();
    scheduleReload(0);
  });
}

function syncRyoUvControlSection(section, transform) {
  for (const control of section.querySelectorAll("[data-uv-field]")) {
    const field = control.dataset.uvField;
    if (control.type === "checkbox") {
      control.checked = Boolean(transform[field]);
    } else {
      control.value = String(transform[field]);
    }
  }
}

function resetRyoUvTransforms() {
  for (const key of state.ryoUvTransforms.keys()) {
    state.ryoUvTransforms.set(key, { ...RYO_UV_DEFAULT });
  }
  for (const section of dom.ryoUvControls.querySelectorAll("[data-uv-key]")) {
    syncRyoUvControlSection(section, state.ryoUvTransforms.get(section.dataset.uvKey));
  }
}

function setAllParts(enabled) {
  for (const character of CHARACTERS) {
    const set = state.enabledParts.get(character.key);
    set.clear();
    if (enabled) {
      const groups = new Set();
      for (const part of character.parts) {
        if (!part.exclusiveGroup) {
          set.add(part.addr);
          continue;
        }
        if (groups.has(part.exclusiveGroup)) continue;
        groups.add(part.exclusiveGroup);
        set.add(part.addr);
      }
    }
  }
  for (const input of document.querySelectorAll("input[data-character][data-addr]")) {
    const set = state.enabledParts.get(input.dataset.character);
    input.checked = enabled && set.has(Number.parseInt(input.dataset.addr, 10));
  }
}

function frameCamera(alpha = camera.alpha, beta = camera.beta) {
  const roots = [...state.characters.values()].map((record) => record.root);
  if (roots.length === 0) return;
  const bounds = getRenderableBounds(roots);
  const radius = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  camera.setTarget(bounds.center);
  camera.radius = Math.max(0.45, radius * 1.55);
  camera.alpha = alpha;
  camera.beta = beta;
}

function updateStatus() {
  const lines = [];
  for (const record of state.characters.values()) {
    const enabled = state.enabledParts.get(record.config.key);
    lines.push(`${record.config.label}: ${record.config.parts.filter((part) => enabled.has(part.addr)).map((part) => hex(part.addr)).join(", ") || "none"}`);
  }
  const uvLines = [];
  for (const [key, transform] of state.ryoUvTransforms) {
    if (isDefaultUvTransform(transform)) continue;
    uvLines.push([
      key,
      transform.scope,
      `r${transform.rotation}`,
      transform.mirrorU ? "mu" : null,
      transform.mirrorV ? "mv" : null,
      `s${transform.scaleU}/${transform.scaleV}`,
      `o${transform.offsetU}/${transform.offsetV}`,
    ].filter(Boolean).join(" "));
  }
  if (uvLines.length) lines.push(`Ryo UV: ${uvLines.join(" | ")}`);
  dom.status.textContent = lines.join("\n");
}

async function reloadCharacters({ preserveCamera = false } = {}) {
  if (state.loading) return;
  const cameraView = preserveCamera ? captureCameraView() : null;
  state.loading = true;
  dom.status.textContent = "Loading...";
  disposeCharacters();
  try {
    await Promise.all(CHARACTERS.map(loadCharacter));
    applyVisibility();
    if (preserveCamera) {
      restoreCameraView(cameraView);
    } else {
      frameCamera(BABYLON.Tools.ToRadians(270), BABYLON.Tools.ToRadians(72));
    }
  } finally {
    state.loading = false;
  }
}

dom.frontButton.addEventListener("click", () => frameCamera(BABYLON.Tools.ToRadians(270), BABYLON.Tools.ToRadians(72)));
dom.sideButton.addEventListener("click", () => frameCamera(BABYLON.Tools.ToRadians(0), BABYLON.Tools.ToRadians(72)));
dom.angleButton.addEventListener("click", () => frameCamera(BABYLON.Tools.ToRadians(225), BABYLON.Tools.ToRadians(68)));
dom.frameButton.addEventListener("click", () => frameCamera(camera.alpha, camera.beta));
dom.resetButton.addEventListener("click", () => {
  setAllParts(true);
  resetRyoUvTransforms();
  dom.showBody.checked = false;
  dom.backFaceCulling.checked = false;
  reloadCharacters().catch((error) => {
    console.error(error);
    dom.status.textContent = error.message;
  });
});
dom.resetUvButton.addEventListener("click", () => {
  resetRyoUvTransforms();
  updateStatus();
  scheduleReload(0);
});
dom.copySettingsButton.addEventListener("click", async () => {
  try {
    await copySettingsToClipboard();
    const previous = dom.copySettingsButton.textContent;
    dom.copySettingsButton.textContent = "Copied";
    window.setTimeout(() => {
      dom.copySettingsButton.textContent = previous;
    }, 1100);
  } catch (error) {
    console.error(error);
    dom.status.textContent = `Copy failed: ${error.message}`;
  }
});
dom.showBody.addEventListener("change", applyVisibility);
dom.backFaceCulling.addEventListener("change", applyVisibility);
dom.ryoHeadAtlasMode.addEventListener("change", () => {
  reloadCharacters({ preserveCamera: true }).catch((error) => {
    console.error(error);
    dom.status.textContent = error.message;
  });
});

window.addEventListener("resize", () => engine.resize());
engine.runRenderLoop(() => scene.render());

buildPartControls();
buildRyoUvControls();
reloadCharacters().catch((error) => {
  console.error(error);
  dom.status.textContent = error.message;
});

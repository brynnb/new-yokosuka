import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createGL from "gl";
import { PNG } from "pngjs";
import * as BABYLON from "@babylonjs/core";

BABYLON.Logger.LogLevels = BABYLON.Logger.NoneLogLevel;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const width = Number.parseInt(process.env.OBJ_SHOT_WIDTH || "900", 10);
const height = Number.parseInt(process.env.OBJ_SHOT_HEIGHT || "900", 10);
const cameraAlpha = Number.parseFloat(process.env.OBJ_CAMERA_ALPHA || "180");
const cameraBeta = Number.parseFloat(process.env.OBJ_CAMERA_BETA || "72");
const cameraRadiusScale = Number.parseFloat(process.env.OBJ_CAMERA_RADIUS_SCALE || "1.15");
const renderFocus = process.env.OBJ_RENDER_FOCUS || "head";
const materialFilter = parseFilter(process.env.OBJ_ISOLATE_MATERIALS || process.env.OBJ_ISOLATE_MATERIAL || "");
const textureFilter = parseFilter(process.env.OBJ_ISOLATE_TEXTURES || process.env.OBJ_ISOLATE_TEXTURE || "");
const backfaceCulling = parseBoolEnv("OBJ_BACKFACE_CULLING", false);
const textureAddressMode = normalizeTextureAddressMode(process.env.OBJ_TEXTURE_ADDRESS_MODE || "mirror");
const uvTarget = process.env.OBJ_UV_TARGET || "atlas";
const uvTransforms = parseUvTransforms(process.env.OBJ_UV_TRANSFORMS || process.env.OBJ_UV_TRANSFORM || "");
const modelPath = process.env.OBJ_MODEL_PATH
  ? path.resolve(process.env.OBJ_MODEL_PATH)
  : path.join(repoRoot, "public/wudecon-obj/ryo/S2_YDB1_YKC_M.obj");
const outputPath = path.resolve(
  repoRoot,
  process.env.OBJ_SHOT_OUT || "viewer-test/output/wudecon-obj-head.png",
);

function createCanvas(width, height) {
  const gl = createGL(width, height, {
    preserveDrawingBuffer: true,
    antialias: true,
    stencil: true,
  });

  if (!gl) {
    throw new Error("Could not create headless WebGL context.");
  }

  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width, height };
    },
    getContext(type) {
      if (type === "webgl" || type === "experimental-webgl") return gl;
      return null;
    },
  };

  return { canvas, gl };
}

function writePng(gl, width, height, outputPath) {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const png = new PNG({ width, height });
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    const srcStart = (height - 1 - y) * stride;
    const dstStart = y * stride;
    png.data.set(pixels.subarray(srcStart, srcStart + stride), dstStart);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

function parseBoolEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

function parseFilter(value) {
  if (!value) return null;
  const entries = String(value)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return entries.length > 0 ? new Set(entries) : null;
}

function parseUvTransforms(value) {
  const transforms = String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set(transforms);
}

function normalizeTextureAddressMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  return ["clamp", "repeat", "mirror"].includes(normalized) ? normalized : "mirror";
}

function babylonAddressMode(mode) {
  switch (normalizeTextureAddressMode(mode)) {
    case "clamp":
      return BABYLON.Texture.CLAMP_ADDRESSMODE;
    case "repeat":
      return BABYLON.Texture.WRAP_ADDRESSMODE;
    default:
      return BABYLON.Texture.MIRROR_ADDRESSMODE;
  }
}

function shouldTransformUv(materialName) {
  if (uvTransforms.size === 0) return false;
  if (uvTarget === "all") return true;
  return materialName === "mat_5f4a414b5f424ba6";
}

function transformUvForMaterial(uv, materialName) {
  if (!uv || !shouldTransformUv(materialName)) return uv || [0, 0];
  let [u, v] = uv;

  if (uvTransforms.has("rotate-cw") || uvTransforms.has("cw")) {
    [u, v] = [v, 1 - u];
  }
  if (uvTransforms.has("rotate-ccw") || uvTransforms.has("ccw")) {
    [u, v] = [1 - v, u];
  }
  if (uvTransforms.has("rotate-180") || uvTransforms.has("180")) {
    [u, v] = [1 - u, 1 - v];
  }
  if (uvTransforms.has("swap")) {
    [u, v] = [v, u];
  }
  if (uvTransforms.has("flip-u") || uvTransforms.has("flipu")) {
    u = 1 - u;
  }
  if (uvTransforms.has("flip-v") || uvTransforms.has("flipv")) {
    v = 1 - v;
  }

  return [u, v];
}

function resolveObjIndex(index, values) {
  if (!index) return null;
  return index < 0 ? values.length + index : index;
}

function parseMtl(file) {
  if (!file || !fs.existsSync(file)) return new Map();
  const materials = new Map();
  let current = null;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [keyword, ...rest] = trimmed.split(/\s+/);
    if (keyword === "newmtl") {
      current = { name: rest.join(" "), texture: "" };
      materials.set(current.name, current);
    } else if (keyword === "map_Kd" && current) {
      current.texture = rest.join(" ");
    }
  }
  return materials;
}

function parseObj(file) {
  const vertices = [null];
  const uvs = [null];
  const normals = [null];
  const groups = new Map();
  let currentMaterial = "(none)";
  let mtlFile = "";

  function groupForMaterial(name) {
    if (!groups.has(name)) groups.set(name, []);
    return groups.get(name);
  }

  function parseFaceToken(token) {
    const [vertexRaw, uvRaw, normalRaw] = token.split("/");
    const vertexIndex = resolveObjIndex(Number.parseInt(vertexRaw, 10), vertices);
    const uvIndex = resolveObjIndex(Number.parseInt(uvRaw, 10), uvs);
    const normalIndex = resolveObjIndex(Number.parseInt(normalRaw, 10), normals);
    return {
      position: vertices[vertexIndex],
      uv: uvs[uvIndex],
      normal: normals[normalIndex],
    };
  }

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [keyword, ...rest] = trimmed.split(/\s+/);
    if (keyword === "mtllib") {
      mtlFile = rest.join(" ");
    } else if (keyword === "v") {
      vertices.push(rest.slice(0, 3).map(Number));
    } else if (keyword === "vt") {
      uvs.push(rest.slice(0, 2).map(Number));
    } else if (keyword === "vn") {
      normals.push(rest.slice(0, 3).map(Number));
    } else if (keyword === "usemtl") {
      currentMaterial = rest.join(" ");
    } else if (keyword === "f") {
      const face = rest.map(parseFaceToken);
      for (let i = 1; i < face.length - 1; i++) {
        groupForMaterial(currentMaterial).push([face[0], face[i], face[i + 1]]);
      }
    }
  }

  return {
    mtlFile,
    groups,
    vertexCount: vertices.length - 1,
    uvCount: uvs.length - 1,
    normalCount: normals.length - 1,
  };
}

function textureFromPng(file, scene) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const texture = BABYLON.RawTexture.CreateRGBATexture(
    png.data,
    png.width,
    png.height,
    scene,
    false,
    false,
    BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = hasAnyAlpha(png.data);
  texture.wrapU = babylonAddressMode(textureAddressMode);
  texture.wrapV = babylonAddressMode(textureAddressMode);
  return texture;
}

function hasAnyAlpha(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

function textureToken(textureFile) {
  return String(textureFile || "")
    .replace(/^tex_/, "")
    .replace(/\.png$/i, "")
    .toLowerCase();
}

function shouldBuildMaterial(materialName, textureFile) {
  if (materialFilter && !materialFilter.has(materialName.toLowerCase())) return false;
  if (textureFilter && !textureFilter.has(textureToken(textureFile))) return false;
  return true;
}

function buildMeshes(scene, modelRoot, obj, materials, objDir) {
  const meshes = [];
  for (const [materialName, faces] of obj.groups.entries()) {
    const materialInfo = materials.get(materialName) || { texture: "" };
    if (!shouldBuildMaterial(materialName, materialInfo.texture)) continue;

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    for (const face of faces) {
      const base = positions.length / 3;
      for (const vertex of face) {
        positions.push(...(vertex.position || [0, 0, 0]));
        normals.push(...(vertex.normal || [0, 1, 0]));
        uvs.push(...transformUvForMaterial(vertex.uv, materialName));
      }
      indices.push(base, base + 1, base + 2);
    }

    if (indices.length === 0) continue;

    const mesh = new BABYLON.Mesh(materialName, scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);

    const material = new BABYLON.StandardMaterial(materialName, scene);
    material.diffuseColor = new BABYLON.Color3(1, 1, 1);
    material.specularColor = new BABYLON.Color3(0, 0, 0);
    material.emissiveColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    material.backFaceCulling = backfaceCulling;
    material.twoSidedLighting = true;
    if (materialInfo.texture) {
      const texturePath = path.resolve(objDir, materialInfo.texture);
      if (fs.existsSync(texturePath)) {
        const texture = textureFromPng(texturePath, scene);
        material.diffuseTexture = texture;
        if (texture.hasAlpha) {
          material.diffuseTexture.hasAlpha = true;
          material.useAlphaFromDiffuseTexture = true;
          material.transparencyMode = BABYLON.StandardMaterial.MATERIAL_ALPHATEST;
          material.alphaCutOff = 0.5;
          material.backFaceCulling = false;
        }
      }
    }

    mesh.material = material;
    mesh.parent = modelRoot;
    mesh.alwaysSelectAsActiveMesh = true;
    meshes.push(mesh);
  }
  return meshes;
}

function getRenderableBounds(root) {
  let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  let count = 0;

  for (const node of [root, ...root.getDescendants(false)]) {
    node.computeWorldMatrix(true);
  }

  for (const node of root.getDescendants(false)) {
    if (!(node instanceof BABYLON.Mesh) || node.getTotalVertices() <= 0) continue;
    if (!node.isEnabled() || node.isVisible === false) continue;
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

function applyRenderFocus(meshes, focus) {
  const normalized = String(focus || "full").toLowerCase();
  if (normalized === "full") return;

  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const box = mesh.getBoundingInfo().boundingBox;
    const center = box.centerWorld;
    const size = box.extendSizeWorld.scale(2);
    const isHeadMesh = center.y >= 0.35 || (center.y >= 0.30 && size.y <= 0.35);
    const isAtlasMaterial = mesh.name === "mat_5f4a414b5f424ba6";
    const isHairMaterial = mesh.name === "mat_5f4d414b5f424ba6" || mesh.name === "mat_5f4a59455f424ba6";
    let visible = true;
    if (normalized === "head") visible = isHeadMesh;
    if (normalized === "head-atlas") visible = isAtlasMaterial;
    if (normalized === "head-hair") visible = isAtlasMaterial || isHairMaterial;
    mesh.setEnabled(visible);
    mesh.isVisible = visible;
  }
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
scene.clearColor = new BABYLON.Color4(0.78, 0.78, 0.76, 1);
scene.ambientColor = new BABYLON.Color3(0.55, 0.55, 0.55);

const objDir = path.dirname(modelPath);
const obj = parseObj(modelPath);
const mtlPath = obj.mtlFile ? path.resolve(objDir, obj.mtlFile) : "";
const materials = parseMtl(mtlPath);
const root = new BABYLON.Mesh("wudecon_obj_root", scene);
const meshes = buildMeshes(scene, root, obj, materials, objDir);
applyRenderFocus(meshes, renderFocus);

const bounds = getRenderableBounds(root);
const radius = Math.max(bounds.size.x, bounds.size.y, bounds.size.z) * 0.75;
const camera = new BABYLON.ArcRotateCamera(
  "camera",
  BABYLON.Tools.ToRadians(cameraAlpha),
  BABYLON.Tools.ToRadians(cameraBeta),
  Math.max(0.08, radius * cameraRadiusScale),
  bounds.center,
  scene,
);
camera.minZ = 0.01;
camera.maxZ = 100;
scene.activeCamera = camera;

new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.0;
const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -1, -0.75), scene);
key.intensity = 1.2;

scene.render();
engine.flushFramebuffer();
writePng(gl, width, height, outputPath);

console.log(JSON.stringify({
  modelPath,
  mtlPath,
  outputPath,
  renderFocus,
  uvTarget,
  uvTransforms: [...uvTransforms],
  materialFilter: materialFilter ? [...materialFilter] : [],
  textureFilter: textureFilter ? [...textureFilter] : [],
  backfaceCulling,
  textureAddressMode,
  meshes: meshes.filter((mesh) => mesh.isEnabled() && mesh.isVisible !== false).map((mesh) => ({
    name: mesh.name,
    vertices: mesh.getTotalVertices(),
    triangles: Math.floor((mesh.getIndices()?.length || 0) / 3),
    material: mesh.material?.name || "",
  })),
  camera: {
    alpha: cameraAlpha,
    beta: cameraBeta,
  },
  bounds: {
    min: bounds.min.asArray(),
    max: bounds.max.asArray(),
    size: bounds.size.asArray(),
  },
}, null, 2));

engine.dispose();

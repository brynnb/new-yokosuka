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
const width = Number.parseInt(process.env.RYU_SHOT_WIDTH || "1200", 10);
const height = Number.parseInt(process.env.RYU_SHOT_HEIGHT || "1200", 10);
const cameraAlpha = Number.parseFloat(process.env.RYU_CAMERA_ALPHA || "205");
const cameraBeta = Number.parseFloat(process.env.RYU_CAMERA_BETA || "72");
const fixedCameraTarget = parseNumberTriplet(process.env.RYU_CAMERA_TARGET || "", null);
const fixedCameraRadius = parseOptionalFiniteNumber(process.env.RYU_CAMERA_RADIUS);
const modelName = process.env.RYU_MODEL || "S2_YDB1_YKC_M.MT5";
const texturePackName = process.env.RYU_TEXTURE_PACK !== undefined
  ? process.env.RYU_TEXTURE_PACK
  : "S2_YDB1_textures.bin";
const faceModelName = process.env.RYU_FACE_MODEL || "";
const modelPath = process.env.RYU_MODEL_PATH
  ? path.resolve(process.env.RYU_MODEL_PATH)
  : path.join(repoRoot, "public/models", modelName);
const faceModelPath = process.env.RYU_FACE_MODEL_PATH
  ? path.resolve(process.env.RYU_FACE_MODEL_PATH)
  : faceModelName
    ? path.join(repoRoot, "public/models", faceModelName)
    : "";
const texturePackPath = process.env.RYU_TEXTURE_PACK_PATH
  ? path.resolve(process.env.RYU_TEXTURE_PACK_PATH)
  : texturePackName
    ? path.join(repoRoot, "public/models", texturePackName)
    : "";
const transformMode = process.env.RYU_TRANSFORM_MODE || "app";
const materialMode = process.env.RYU_MATERIAL_MODE || "textured";
const renderFocus = process.env.RYU_RENDER_FOCUS || "full";
const isolateTextures = parseTextureFilter(process.env.RYU_ISOLATE_TEXTURES || process.env.RYU_ISOLATE_TEXTURE || "");
const hiddenNodeOffsets = parseNodeOffsetFilter(process.env.RYU_HIDE_NODES || "");
const onlyNodeOffsets = parseNodeOffsetFilter(process.env.RYU_ONLY_NODES || "");
const hiddenHeadAtlasStrips = parseHeadAtlasStripFilter(process.env.RYU_HIDE_HEAD_ATLAS_STRIPS || "");
const onlyHeadAtlasStrips = parseHeadAtlasStripFilter(process.env.RYU_ONLY_HEAD_ATLAS_STRIPS || "");
const remapHeadAtlasStrips = parseHeadAtlasStripFilter(process.env.RYU_REMAP_HEAD_ATLAS_STRIPS || "");
const cameraRadiusScale = Number.parseFloat(process.env.RYU_CAMERA_RADIUS_SCALE || "");
const characterRigMode = process.env.RYU_CHARACTER_RIG_MODE || "baked";
const motionPath = process.env.RYU_MOTION_PATH
  ? path.resolve(process.env.RYU_MOTION_PATH)
  : "";
const motionSequenceName = process.env.RYU_MOTION_SEQUENCE || "";
const motionFrameEnv = Number.parseFloat(process.env.RYU_MOTION_FRAME || "");
const motionApplyMode = process.env.RYU_MOTION_APPLY || "additive";
const motionUseTranslations = parseBoolEnv("RYU_MOTION_TRANSLATIONS", false);
const motionRotationScale = parseFiniteNumber(process.env.RYU_MOTION_ROT_SCALE, 1);
const motionRotationSigns = parseNumberTriplet(process.env.RYU_MOTION_ROT_SIGNS, [1, -1, -1]);
const motionPositionSigns = parseNumberTriplet(process.env.RYU_MOTION_POS_SIGNS, [-1, 1, 1]);
const motionBoneFilter = parseIntegerFilter(process.env.RYU_MOTION_BONES || "");
const motionSkipBoneFilter = parseIntegerFilter(process.env.RYU_MOTION_SKIP_BONES || "");
const motionBoneMap = parseIntegerMap(process.env.RYU_MOTION_BONE_MAP || "");
const motionInterpretation = normalizeMotionInterpretation(process.env.RYU_MOTION_INTERPRETATION || "compat");
const motionTarget = normalizeMotionTarget(process.env.RYU_MOTION_TARGET || "node-index");
const ryoHeadAtlasMode = process.env.RYU_HEAD_ATLAS_MODE || "project-cw-obj-side";
const ryoHeadAtlasDebug = process.env.RYU_HEAD_ATLAS_DEBUG || "";
const respectStripWindingSign = parseBoolEnv("RYU_STRIP_WINDING_SIGN", false);
const emulateMirrorResize = parseBoolEnv("RYU_EMULATE_MIRROR_RESIZE", true);
const textureAlphaModeOverrides = parseAlphaModeOverrides(process.env.RYU_TEXTURE_ALPHA_MODES || "");
const textureZOffsetOverrides = parseTextureNumberOverrides(process.env.RYU_TEXTURE_Z_OFFSETS || "");
const textureAddressMode = normalizeTextureAddressMode(process.env.RYU_TEXTURE_ADDRESS_MODE || "mirror");
const textureAddressModeOverrides = parseAddressModeOverrides(process.env.RYU_TEXTURE_ADDRESS_MODES || "");
const textureCoordinateMode = Mt5Loader.normalizeTextureCoordinateMode(process.env.RYU_TEXTURE_COORDINATE_MODE || "viewer");
const faceAttachNodeAddr = parseNodeOffsetValue(process.env.RYU_FACE_ATTACH_NODE || "0xd648", 0xd648);
const faceAttachCompose = normalizeFaceAttachCompose(process.env.RYU_FACE_ATTACH_COMPOSE || "face-node");
const faceHeadAtlasMode = process.env.RYU_FACE_HEAD_ATLAS_MODE || ryoHeadAtlasMode;
const faceOverlayOnly = parseBoolEnv("RYU_FACE_OVERLAY_ONLY", false);
const faceOverlayOnTop = parseBoolEnv("RYU_FACE_OVERLAY_ON_TOP", false);
const faceOverlayZOffset = parseFiniteNumber(process.env.RYU_FACE_Z_OFFSET, 0);
const faceUvTransferJson = process.env.RYU_FACE_UV_TRANSFER_JSON
  ? path.resolve(process.env.RYU_FACE_UV_TRANSFER_JSON)
  : "";
const faceUvTransferMaxDistance = parseFiniteNumber(process.env.RYU_FACE_UV_TRANSFER_MAX_DISTANCE, 0.035);
const faceUvTransferTransform = normalizeFaceUvTransferTransform(process.env.RYU_FACE_UV_TRANSFER_TRANSFORM || "raw");
const faceUvTransferCurrentUMin = parseOptionalFiniteNumber(process.env.RYU_FACE_UV_TRANSFER_CURRENT_U_MIN);
const faceUvTransferCurrentUMax = parseOptionalFiniteNumber(process.env.RYU_FACE_UV_TRANSFER_CURRENT_U_MAX);
const outputPath = path.resolve(
  repoRoot,
  process.env.RYU_SHOT_OUT || `viewer-test/output/ryu-${transformMode}.png`,
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
    if (!node.isEnabled() || node.isVisible === false) {
      continue;
    }

    node.refreshBoundingInfo();
    node.computeWorldMatrix(true);
    const box = node.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
    max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
    count++;
  }

  return { min, max, count, center: min.add(max).scale(0.5), size: max.subtract(min) };
}

function getRenderableMeshes(root) {
  return root.getDescendants(false).filter((node) => (
    node instanceof BABYLON.Mesh &&
    typeof node.getTotalVertices === "function" &&
    node.getTotalVertices() > 0
  ));
}

function normalizeFaceUvTransferTransform(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  const allowed = new Set([
    "raw",
    "right-rotate-cw",
    "right-rotate-ccw",
    "right-rotate-180",
    "right-flipu",
    "right-flipv",
    "right-flipuv",
    "right-swap",
    "right-swap-flipv",
  ]);
  return allowed.has(normalized) ? normalized : "raw";
}

function transformFaceUvTransferUv(uv, transform) {
  if (!uv || uv.length < 2 || transform === "raw") return uv;

  const localX = Math.max(0, Math.min(1, (uv[0] - 0.5) * 2));
  const localY = Math.max(0, Math.min(1, uv[1]));
  let x = localX;
  let y = localY;

  switch (transform) {
    case "right-rotate-cw":
      x = localY;
      y = 1 - localX;
      break;
    case "right-rotate-ccw":
      x = 1 - localY;
      y = localX;
      break;
    case "right-rotate-180":
      x = 1 - localX;
      y = 1 - localY;
      break;
    case "right-flipu":
      x = 1 - localX;
      break;
    case "right-flipv":
      y = 1 - localY;
      break;
    case "right-flipuv":
      x = 1 - localX;
      y = 1 - localY;
      break;
    case "right-swap":
      x = localY;
      y = localX;
      break;
    case "right-swap-flipv":
      x = localY;
      y = 1 - localX;
      break;
  }

  return [0.5 + x * 0.5, y];
}

function applyFaceUvTransfer(root, transferPath, maxDistance, uvTransform, currentUMin = null, currentUMax = null) {
  if (!transferPath) return null;
  if (!fs.existsSync(transferPath)) {
    throw new Error(`FACE UV transfer JSON was not found: ${transferPath}`);
  }

  const report = JSON.parse(fs.readFileSync(transferPath, "utf8"));
  const matches = Array.isArray(report.matches)
    ? report.matches
    : [
        ...(Array.isArray(report.samples) ? report.samples : []),
        ...(Array.isArray(report.worst) ? report.worst : []),
      ];
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error(`FACE UV transfer JSON has no matches array: ${transferPath}`);
  }

  const byMesh = new Map();
  for (const match of matches) {
    if (!match?.transferredUv || !Array.isArray(match.transferredUv)) continue;
    const distance = match.reference?.distance;
    if (Number.isFinite(distance) && distance > maxDistance) continue;
    const currentU = match.currentUv?.[0];
    if (currentUMin !== null && (!Number.isFinite(currentU) || currentU < currentUMin)) continue;
    if (currentUMax !== null && (!Number.isFinite(currentU) || currentU > currentUMax)) continue;
    const parent = match.parent || "";
    const key = `${parent}/${match.mesh || ""}`;
    if (!byMesh.has(key)) byMesh.set(key, []);
    byMesh.get(key).push(match);
  }

  let applied = 0;
  let touchedMeshes = 0;
  for (const mesh of getRenderableMeshes(root)) {
    const parent = mesh.parent?.name || "";
    const key = `${parent}/${mesh.name}`;
    const rows = byMesh.get(key);
    if (!rows || rows.length === 0) continue;

    const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
    if (!uvs) continue;
    let meshApplied = 0;
    for (const row of rows) {
      const vertex = Number(row.vertex);
      const uv = transformFaceUvTransferUv(row.transferredUv, uvTransform);
      const offset = vertex * 2;
      if (!Number.isInteger(vertex) || offset < 0 || offset + 1 >= uvs.length) continue;
      uvs[offset] = uv[0];
      uvs[offset + 1] = uv[1];
      meshApplied++;
    }
    if (meshApplied > 0) {
      mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs, false);
      touchedMeshes++;
      applied += meshApplied;
    }
  }

  return {
    path: transferPath,
    sourceFace: report.face || null,
    compose: report.compose || null,
    maxDistance,
    uvTransform,
    currentUMin,
    currentUMax,
    candidateMatches: matches.length,
    applied,
    touchedMeshes,
  };
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

function axisQuaternion(axis, angle) {
  switch (axis) {
    case "x":
      return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, angle);
    case "y":
      return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, angle);
    case "z":
      return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, angle);
    default:
      throw new Error(`Unknown rotation axis ${axis}`);
  }
}

function composeEuler(order, angles) {
  let q = BABYLON.Quaternion.Identity();
  for (const axis of order) {
    q = q.multiply(axisQuaternion(axis, angles[axis]));
  }
  return q;
}

function parseBoolEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

function parseTextureFilter(value) {
  if (!value) return null;
  const filters = String(value)
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => part.replace(/^0x/, ""));
  return filters.length > 0 ? new Set(filters) : null;
}

function parseIntegerFilter(value) {
  if (!value) return null;
  const ids = String(value)
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter(Number.isFinite);
  return ids.length > 0 ? new Set(ids) : null;
}

function parseNodeOffsetFilter(value) {
  if (!value) return null;
  const ids = String(value)
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => Number.parseInt(part.replace(/^0x/, ""), 16))
    .filter(Number.isFinite);
  return ids.length > 0 ? new Set(ids) : null;
}

function parseNodeOffsetValue(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  const parsed = Number.parseInt(normalized.replace(/^0x/, ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseHeadAtlasStripFilter(value) {
  if (!value) return null;
  const filters = String(value)
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      const segments = part.split(":").map((segment) => segment?.trim()).filter(Boolean);
      const node = segments[0] || "*";
      const entry = segments.length >= 3 ? (segments[1] || "*") : null;
      const strip = segments.length >= 3 ? (segments[2] || "*") : (segments[1] || "*");
      if (node === "*" || node.startsWith("0x")) {
        return entry ? `${node}:${entry}:${strip}` : `${node}:${strip}`;
      }
      const parsedNode = Number.parseInt(node, 16);
      const normalizedNode = Number.isFinite(parsedNode) ? `0x${parsedNode.toString(16)}` : node;
      return entry ? `${normalizedNode}:${entry}:${strip}` : `${normalizedNode}:${strip}`;
    });
  return filters.length > 0 ? new Set(filters) : null;
}

function parseAlphaModeOverrides(value) {
  if (!value) return null;
  const overrides = new Map();
  for (const entry of String(value).split(",")) {
    const [keyRaw, modeRaw] = entry.split(":").map((part) => part?.trim().toLowerCase());
    if (!keyRaw || !modeRaw) continue;
    if (!["opaque", "alphatest", "blend"].includes(modeRaw)) continue;
    const key = keyRaw.startsWith("0x") ? keyRaw : keyRaw.replace(/^tex(?:ture)?-?/, "");
    overrides.set(key, modeRaw);
  }
  return overrides.size > 0 ? overrides : null;
}

function parseTextureNumberOverrides(value) {
  if (!value) return null;
  const overrides = new Map();
  for (const entry of String(value).split(",")) {
    const [keyRaw, valueRaw] = entry.split(":").map((part) => part?.trim().toLowerCase());
    if (!keyRaw || !valueRaw) continue;
    const number = Number.parseFloat(valueRaw);
    if (!Number.isFinite(number)) continue;
    const key = keyRaw.startsWith("0x") ? keyRaw : keyRaw.replace(/^tex(?:ture)?-?/, "");
    overrides.set(key, number);
  }
  return overrides.size > 0 ? overrides : null;
}

function normalizeTextureAddressMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  return ["clamp", "repeat", "mirror"].includes(normalized) ? normalized : "mirror";
}

function parseAddressModeOverrides(value) {
  if (!value) return null;
  const overrides = new Map();
  for (const entry of String(value).split(",")) {
    const [keyRaw, modeRaw] = entry.split(":").map((part) => part?.trim().toLowerCase());
    if (!keyRaw || !modeRaw) continue;
    const mode = normalizeTextureAddressMode(modeRaw);
    if (!["clamp", "repeat", "mirror"].includes(mode)) continue;
    const key = keyRaw.startsWith("0x") ? keyRaw : keyRaw.replace(/^tex(?:ture)?-?/, "");
    overrides.set(key, mode);
  }
  return overrides.size > 0 ? overrides : null;
}

function parseIntegerMap(value) {
  if (!value) return null;
  const map = new Map();
  for (const entry of String(value).split(",")) {
    const [fromRaw, toRaw] = entry.split(":").map((part) => part?.trim());
    const from = Number.parseInt(fromRaw, 10);
    const to = Number.parseInt(toRaw, 10);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      map.set(from, to);
    }
  }
  return map.size > 0 ? map : null;
}

function parseNumberTriplet(value, fallback) {
  if (!value) return fallback;
  const parts = value.split(",").map((part) => Number.parseFloat(part.trim()));
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback;
}

function parseFiniteNumber(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalFiniteNumber(value) {
  if (value === undefined || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMotionInterpretation(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["track", "tracks", "motion-track", "motion-tracks", "motiontracks"].includes(normalized)) {
    return "tracks";
  }
  return "compat";
}

function normalizeMotionTarget(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["flag", "flag-id", "flag-low-byte", "low-byte", "mt5-flag"].includes(normalized)) {
    return "flag-low-byte";
  }
  return "node-index";
}

function normalizeFaceAttachCompose(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["attach-only", "face-only", "identity"].includes(normalized)) {
    return normalized;
  }
  return "face-node";
}

function evaluateMotionPose(sequence, frame, interpretation = motionInterpretation) {
  return interpretation === "tracks"
    ? MotnLoader.evaluateSequenceMotionTracks(sequence, frame)
    : MotnLoader.evaluateSequence(sequence, frame);
}

function degToRad(degrees) {
  return degrees * Math.PI / 180;
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

function textureTokenForMesh(mesh, loader) {
  const materialName = mesh.material?.name || "";
  const match = materialName.match(/^mt5_mat_(\d+)/);
  if (!match) return null;

  const textureIndex = Number.parseInt(match[1], 10);
  const textureId = loader.textureIds.get(textureIndex);
  return {
    index: textureIndex,
    indexText: String(textureIndex),
    hex: textureId ? Mt5Loader.textureIdHex(textureId) : "",
  };
}

function meshMatchesTexture(mesh, loader, filters) {
  if (!filters) return true;
  const token = textureTokenForMesh(mesh, loader);
  if (!token) return false;
  return filters.has(token.indexText) || filters.has(token.hex);
}

function applyRenderFocus(root, loader, focus, filters) {
  const meshes = getRenderableMeshes(root);
  const normalizedFocus = String(focus || "full").toLowerCase();

  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const box = mesh.getBoundingInfo().boundingBox;
    const center = box.centerWorld;
    const size = box.extendSizeWorld.scale(2);
    const isHeadMesh = center.y >= 0.38 || (center.y >= 0.32 && size.y <= 0.35);
    const isTextureMatch = meshMatchesTexture(mesh, loader, filters);
    let visible = isTextureMatch;

    if (normalizedFocus === "head") {
      visible = visible && isHeadMesh;
    } else if (normalizedFocus === "head-atlas") {
      visible = visible && isHeadMesh && meshMatchesTexture(mesh, loader, filters || new Set(["6", "a64b425f4b414a5f"]));
    }

    mesh.setEnabled(visible);
    mesh.isVisible = visible;
  }
}

function applyHiddenNodeOffsets(root, hiddenOffsets) {
  if (!hiddenOffsets) return;
  for (const mesh of getRenderableMeshes(root)) {
    const node = mesh.parent?._mt5Node || mesh._mt5Node;
    if (!node || !hiddenOffsets.has(node.addr)) continue;
    mesh.setEnabled(false);
    mesh.isVisible = false;
  }
}

function applyOnlyNodeOffsets(root, onlyOffsets) {
  if (!onlyOffsets) return;
  for (const mesh of getRenderableMeshes(root)) {
    const node = mesh.parent?._mt5Node || mesh._mt5Node;
    const visible = node && onlyOffsets.has(node.addr);
    mesh.setEnabled(visible);
    mesh.isVisible = visible;
  }
}

function findNodeByAddr(root, addr) {
  return (root._mt5Nodes || []).find((node) => node.addr === addr) || null;
}

function faceOverlayMatrix(faceLoader, faceNode, attachMatrix, composeMode) {
  const faceWorld = faceLoader.sourceWorldMatrixForNode(faceNode);
  if (composeMode === "attach-only") return attachMatrix;
  if (composeMode === "face-only") return faceWorld;
  if (composeMode === "identity") return Mt5Loader.rowIdentity();
  return Mt5Loader.rowMultiply(faceWorld, attachMatrix);
}

function bakeFaceOverlayToBaseSourceSpace(faceRoot, faceLoader, attachMatrix, composeMode) {
  let meshCount = 0;
  let vertexCount = 0;

  faceRoot.rotationQuaternion = null;
  faceRoot.rotation.set(0, 0, 0);
  faceRoot.position.set(0, 0, 0);
  faceRoot.scaling.set(1, 1, 1);

  for (const faceNode of faceRoot._mt5Nodes || []) {
    const matrix = faceOverlayMatrix(faceLoader, faceNode, attachMatrix, composeMode);

    for (const mesh of directGeometryChildren(faceNode)) {
      if (!mesh._mt5SourcePositions) continue;

      const positions = [];
      for (let i = 0; i < mesh._mt5SourcePositions.length; i += 3) {
        const transformed = Mt5Loader.transformRowPoint([
          mesh._mt5SourcePositions[i],
          mesh._mt5SourcePositions[i + 1],
          mesh._mt5SourcePositions[i + 2],
        ], matrix);
        positions.push(...transformed);
      }
      mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false);

      if (mesh._mt5SourceNormals && mesh._mt5SourceNormals.length === mesh._mt5SourcePositions.length) {
        const normals = [];
        for (let i = 0; i < mesh._mt5SourceNormals.length; i += 3) {
          const transformed = Mt5Loader.transformRowVector([
            mesh._mt5SourceNormals[i],
            mesh._mt5SourceNormals[i + 1],
            mesh._mt5SourceNormals[i + 2],
          ], matrix);
          const length = Math.hypot(transformed[0], transformed[1], transformed[2]) || 1;
          normals.push(transformed[0] / length, transformed[1] / length, transformed[2] / length);
        }
        mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, false);
      } else {
        const indices = mesh.getIndices();
        if (indices && indices.length > 0) {
          const normals = [];
          BABYLON.VertexData.ComputeNormals(positions, indices, normals);
          mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, false);
        }
      }

      mesh.parent = faceRoot;
      mesh.rotationQuaternion = null;
      mesh.rotation.set(0, 0, 0);
      mesh.position.set(0, 0, 0);
      mesh.scaling.set(1, 1, 1);
      mesh._ryuFaceOverlay = true;
      mesh.refreshBoundingInfo();

      if (mesh.material) {
        mesh.material.backFaceCulling = false;
        mesh.material.twoSidedLighting = true;
        mesh.material.zOffset = faceOverlayZOffset;
        mesh.material.zOffsetUnits = faceOverlayZOffset;
        if (faceOverlayOnTop) {
          mesh.renderingGroupId = 1;
        }
      }

      meshCount++;
      vertexCount += mesh.getTotalVertices();
    }

    if (faceNode.mesh) {
      faceNode.mesh.setEnabled(false);
      faceNode.mesh.isVisible = false;
    }
  }

  return { meshCount, vertexCount };
}

async function loadFaceOverlay(baseRoot, textureBuffer) {
  if (!faceModelPath) return null;
  if (!fs.existsSync(faceModelPath)) {
    throw new Error(`FACE overlay model not found: ${faceModelPath}`);
  }

  const attachNode = findNodeByAddr(baseRoot, faceAttachNodeAddr);
  if (!attachNode) {
    throw new Error(`FACE attach node 0x${faceAttachNodeAddr.toString(16)} was not found in ${modelName}`);
  }

  const faceLoader = new Mt5Loader(scene, {
    backFaceCulling: false,
    respectStripWindingSign,
    emulateMirrorResize,
    ryoHeadAtlasFix: parseBoolEnv("RYU_FACE_HEAD_ATLAS_FIX", true),
    ryoHeadAtlasMode: faceHeadAtlasMode,
    ryoHeadAtlasDebug,
    textureAlphaModeOverrides,
    textureZOffsetOverrides,
    textureAddressMode,
    textureAddressModeOverrides,
    textureCoordinateMode,
    characterRigMode,
  });
  if (textureBuffer) {
    faceLoader.setTexturePackIndex(Mt5Loader.buildTexturePackIndex(textureBuffer), null, textureBuffer, null);
  }

  const faceBuffer = fs.readFileSync(faceModelPath).buffer;
  const faceRoots = await faceLoader.load(faceBuffer, textureBuffer);
  if (faceRoots.length === 0) {
    throw new Error(`No renderable FACE overlay root loaded for ${faceModelName || faceModelPath}`);
  }

  const faceRoot = faceRoots[0];
  const attachMatrix = loader.sourceWorldMatrixForNode(attachNode);
  const bakeReport = bakeFaceOverlayToBaseSourceSpace(faceRoot, faceLoader, attachMatrix, faceAttachCompose);
  faceRoot.parent = baseRoot;
  faceRoot._ryuFaceOverlay = true;

  if (faceOverlayOnly) {
    for (const mesh of getRenderableMeshes(baseRoot)) {
      if (mesh._ryuFaceOverlay) continue;
      mesh.setEnabled(false);
      mesh.isVisible = false;
    }
  }

  return {
    model: faceModelName || path.basename(faceModelPath),
    modelPath: faceModelPath,
    attachNode: `0x${faceAttachNodeAddr.toString(16)}`,
    attachCompose: faceAttachCompose,
    ryoHeadAtlasMode: faceHeadAtlasMode,
    overlayOnly: faceOverlayOnly,
    overlayOnTop: faceOverlayOnTop,
    zOffset: faceOverlayZOffset,
    nodes: faceRoot._mt5Nodes?.length || 0,
    meshes: bakeReport.meshCount,
    vertices: bakeReport.vertexCount,
  };
}

function forceBackfaceCulling(scene, enabled) {
  for (const material of scene.materials) {
    if ("backFaceCulling" in material) {
      material.backFaceCulling = enabled;
    }
    if ("twoSidedLighting" in material) {
      material.twoSidedLighting = true;
    }
  }
}

function captureNodeBindPose(nodes) {
  for (const node of nodes) {
    if (!node.mesh) continue;
    node._renderBindPose = {
      position: node.mesh.position.clone(),
      rotation: node.mesh.rotation.clone(),
      scaling: node.mesh.scaling.clone(),
    };
  }
}

function applyMotnSequence(root, sequence, frame, options = {}) {
  const nodes = root._mt5Nodes || [];
  const nodesByBoneId = new Map();
  const poseTarget = options.poseTarget || motionTarget;
  nodes.forEach((node, index) => {
    const boneId = poseTarget === "flag-low-byte" ? node.flag & 0xff : index;
    if (!node.mesh || boneId === 0xff) return;
    if (!nodesByBoneId.has(boneId)) nodesByBoneId.set(boneId, []);
    nodesByBoneId.get(boneId).push(node);
  });

  const interpretation = options.motionInterpretation || motionInterpretation;
  const pose = evaluateMotionPose(sequence, frame, interpretation);
  const applied = [];
  const missing = [];
  const rotationSigns = options.rotationSigns || [1, -1, -1];
  const positionSigns = options.positionSigns || [-1, 1, 1];
  const rotationScale = options.rotationScale ?? 1;
  const useTranslations = options.useTranslations === true;
  const applyMode = options.applyMode || "additive";

  for (const [boneId, channels] of pose.entries()) {
    const matchingNodes = nodesByBoneId.get(boneId);
    if (!matchingNodes?.length) {
      missing.push(boneId);
      continue;
    }

    for (const node of matchingNodes) {
      const bind = node._renderBindPose || {
        position: node.mesh.position,
        rotation: node.mesh.rotation,
      };

      const poseRotation = new BABYLON.Vector3(
        channels.rx * rotationScale * rotationSigns[0],
        channels.ry * rotationScale * rotationSigns[1],
        channels.rz * rotationScale * rotationSigns[2],
      );
      const posePosition = new BABYLON.Vector3(
        channels.tx * positionSigns[0],
        channels.ty * positionSigns[1],
        channels.tz * positionSigns[2],
      );

      node.mesh.rotationQuaternion = null;
      if (applyMode === "absolute") {
        node.mesh.rotation.copyFrom(poseRotation);
        if (useTranslations) node.mesh.position.copyFrom(posePosition);
      } else {
        node.mesh.rotation.copyFrom(bind.rotation.add(poseRotation));
        if (useTranslations) node.mesh.position.copyFrom(bind.position.add(posePosition));
      }

      applied.push({
        boneId,
        node: `0x${node.addr.toString(16)}`,
        channels: Object.fromEntries(
          Object.entries(channels)
            .filter(([, value]) => typeof value === "number" && Math.abs(value) > 1e-6),
        ),
      });
    }
  }

  return {
    sequence: sequence.name,
    frame,
    durationFrames: sequence.durationFrames,
    motionInterpretation: interpretation,
    poseTarget,
    channelCount: sequence.channelCount,
    motionTrackCount: sequence.motionTracks?.length || 0,
    compatComplete: sequence.valueData?.complete ?? null,
    motionTrackComplete: sequence.motionTrackData?.valueData?.complete ?? null,
    bakeMode: "hierarchy",
    applyMode,
    useTranslations,
    rotationScale,
    poseBones: pose.size,
    appliedCount: applied.length,
    appliedBoneIds: [...new Set(applied.map((entry) => entry.boneId))].sort((a, b) => a - b),
    missingBoneIds: [...new Set(missing)].sort((a, b) => a - b),
    appliedPreview: applied.slice(0, 12),
  };
}

function summarizeBakedPoseApplication(root, sequence, frame, pose, options = {}) {
  const nodes = root._mt5Nodes || [];
  const poseTarget = options.poseTarget || motionTarget;
  const nodeBoneIds = new Set(nodes
    .map((node, index) => (poseTarget === "flag-low-byte" ? node.flag & 0xff : index))
    .filter((targetId) => targetId !== 0xff));
  const poseBoneIds = [...pose.keys()].sort((a, b) => a - b);
  const appliedBoneIds = poseBoneIds.filter((boneId) => nodeBoneIds.has(boneId));
  const missingBoneIds = poseBoneIds.filter((boneId) => !nodeBoneIds.has(boneId));

  return {
    sequence: sequence.name,
    frame,
    durationFrames: sequence.durationFrames,
    motionInterpretation: options.motionInterpretation || motionInterpretation,
    poseTarget,
    channelCount: sequence.channelCount,
    motionTrackCount: sequence.motionTracks?.length || 0,
    compatComplete: sequence.valueData?.complete ?? null,
    motionTrackComplete: sequence.motionTrackData?.valueData?.complete ?? null,
    bakeMode: "source-vertex-rebake",
    applyMode: options.applyMode || "additive",
    useTranslations: options.useTranslations === true,
    rotationScale: options.rotationScale ?? 1,
    poseBones: pose.size,
    appliedCount: appliedBoneIds.length,
    appliedBoneIds,
    missingBoneIds,
    boneMap: motionBoneMap ? Object.fromEntries(motionBoneMap.entries()) : null,
  };
}

function loadAndApplyMotion(root, loader) {
  if (!motionPath) return null;
  if (!fs.existsSync(motionPath)) {
    throw new Error(`Motion file does not exist: ${motionPath}`);
  }

  const motionBytes = fs.readFileSync(motionPath);
  const motion = MotnLoader.parse(motionBytes);
  const sequence = motionSequenceName
    ? motion.getSequence(motionSequenceName)
    : motion.findSequences(/RUN.*LP|RUNNING/)[0];

  if (!sequence) {
    throw new Error(`Motion sequence not found: ${motionSequenceName || "first run-like sequence"}`);
  }

  const frame = Number.isFinite(motionFrameEnv)
    ? motionFrameEnv
    : sequence.durationFrames / 2;

  const poseOptions = {
    applyMode: motionApplyMode,
    useTranslations: motionUseTranslations,
    rotationScale: motionRotationScale,
    rotationSigns: motionRotationSigns,
    positionSigns: motionPositionSigns,
    motionInterpretation,
    poseTarget: motionTarget,
  };

  if (characterRigMode === "baked") {
    const pose = filterMotionPose(evaluateMotionPose(sequence, frame, motionInterpretation));
    loader.applyCharacterRigPose(root, pose, poseOptions);
    return summarizeBakedPoseApplication(root, sequence, frame, pose, poseOptions);
  }

  return applyMotnSequence(root, sequence, frame, {
    applyMode: poseOptions.applyMode,
    useTranslations: poseOptions.useTranslations,
    rotationScale: poseOptions.rotationScale,
    rotationSigns: poseOptions.rotationSigns,
    positionSigns: poseOptions.positionSigns,
    motionInterpretation,
    poseTarget: motionTarget,
  });
}

function filterMotionPose(pose) {
  let sourcePose = pose;
  if (motionBoneMap) {
    sourcePose = new Map();
    for (const [boneId, channels] of pose.entries()) {
      const mappedBoneId = motionBoneMap.get(boneId) ?? boneId;
      sourcePose.set(mappedBoneId, {
        ...channels,
        boneId: mappedBoneId,
        sourceBoneId: boneId,
      });
    }
  }

  if (!motionBoneFilter && !motionSkipBoneFilter) return sourcePose;
  const filtered = new Map();
  for (const [boneId, channels] of sourcePose.entries()) {
    if (motionBoneFilter && !motionBoneFilter.has(boneId)) continue;
    if (motionSkipBoneFilter?.has(boneId)) continue;
    filtered.set(boneId, channels);
  }
  return filtered;
}

function applyModelPivot(node, pivotMode) {
  const children = directGeometryChildren(node);
  if (children.length === 0) return BABYLON.Vector3.Zero();

  let offset = BABYLON.Vector3.Zero();
  let compensation = BABYLON.Vector3.Zero();
  if (pivotMode === "center") {
    compensation = convertedModelCenter(node);
    offset = compensation.scale(-1);
  } else if (pivotMode === "center-inverse") {
    offset = convertedModelCenter(node);
    compensation = offset.scale(-1);
  }

  for (const child of children) {
    child.position.copyFrom(offset);
  }

  return compensation;
}

function applyTransformMode(root, mode) {
  if (mode === "app") return;

  const nodes = root._mt5Nodes || [];
  const flat = mode.includes("flat");
  const identity = mode.includes("identity");
  const noRot = mode.includes("norot") || !parseBoolEnv("RYU_USE_ROTATIONS", true);
  const rawAngles = mode.includes("rawrot");
  const rawPosition = mode.includes("rawpos");
  const orderMatch = mode.match(/q-([xyz]{3})/);
  const useHierarchy = !flat && parseBoolEnv("RYU_USE_HIERARCHY", true);
  const usePositions = parseBoolEnv("RYU_USE_POSITIONS", true);
  const pivotMode = process.env.RYU_PIVOT_MODE || (
    mode.includes("pivot-center-inverse")
      ? "center-inverse"
      : mode.includes("pivot-center")
        ? "center"
        : "none"
  );
  const rootDegrees = parseNumberTriplet(process.env.RYU_ROOT_ROT, [-90, 0, 0]);
  const posSigns = parseNumberTriplet(process.env.RYU_POS_SIGNS, rawPosition ? [1, 1, 1] : [-1, 1, 1]);
  const rotSigns = parseNumberTriplet(process.env.RYU_ROT_SIGNS, rawAngles ? [1, 1, 1] : [1, -1, -1]);
  const rotOrder = process.env.RYU_ROT_ORDER || orderMatch?.[1] || "babylon";

  root.rotationQuaternion = null;
  root.rotation.set(degToRad(rootDegrees[0]), degToRad(rootDegrees[1]), degToRad(rootDegrees[2]));
  const byAddr = new Map(nodes.map((node) => [node.addr, node]));

  for (const node of nodes) {
    if (!node.mesh) continue;

    if (useHierarchy && node.parentAddr) {
      const parent = byAddr.get(node.parentAddr);
      node.mesh.parent = parent?.mesh || root;
    } else {
      node.mesh.parent = root;
    }

    if (identity) {
      node.mesh.position = BABYLON.Vector3.Zero();
      node.mesh.scaling = BABYLON.Vector3.One();
      node.mesh.rotationQuaternion = null;
      node.mesh.rotation = BABYLON.Vector3.Zero();
      continue;
    }

    if (usePositions) {
      node.mesh.position = new BABYLON.Vector3(
        posSigns[0] * node.pos.x,
        posSigns[1] * node.pos.y,
        posSigns[2] * node.pos.z,
      );
    } else {
      node.mesh.position = BABYLON.Vector3.Zero();
    }
    node.mesh.position.addInPlace(applyModelPivot(node, pivotMode));
    node.mesh.scaling = new BABYLON.Vector3(node.scl.x, node.scl.y, node.scl.z);

    if (noRot) {
      node.mesh.rotationQuaternion = null;
      node.mesh.rotation = BABYLON.Vector3.Zero();
      continue;
    }

    const angles = {
      x: rotSigns[0] * node.rot.x,
      y: rotSigns[1] * node.rot.y,
      z: rotSigns[2] * node.rot.z,
    };

    if (rotOrder !== "babylon") {
      node.mesh.rotation.set(0, 0, 0);
      node.mesh.rotationQuaternion = composeEuler(rotOrder, angles);
    } else {
      node.mesh.rotationQuaternion = null;
      node.mesh.rotation = new BABYLON.Vector3(angles.x, angles.y, angles.z);
    }
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

const modelBuffer = fs.readFileSync(modelPath).buffer;
const textureBuffer = texturePackPath && fs.existsSync(texturePackPath)
  ? fs.readFileSync(texturePackPath).buffer
  : null;
const loader = new Mt5Loader(scene, {
  backFaceCulling: parseBoolEnv("RYU_BACKFACE_CULLING", false),
  respectStripWindingSign,
  emulateMirrorResize,
  ryoHeadAtlasFix: parseBoolEnv("RYU_HEAD_ATLAS_FIX", true),
  ryoHeadAtlasMode,
  ryoHeadAtlasDebug,
  skipRyoHeadAtlasStrips: hiddenHeadAtlasStrips,
  onlyRyoHeadAtlasStrips: onlyHeadAtlasStrips,
  remapRyoHeadAtlasStrips: remapHeadAtlasStrips,
  textureAlphaModeOverrides,
  textureZOffsetOverrides,
  textureAddressMode,
  textureAddressModeOverrides,
  textureCoordinateMode,
  characterRigMode,
});
if (textureBuffer) {
  loader.setTexturePackIndex(Mt5Loader.buildTexturePackIndex(textureBuffer), null, textureBuffer, null);
}
const roots = await loader.load(modelBuffer, textureBuffer);

if (roots.length === 0) {
  throw new Error(`No renderable roots loaded for ${modelName}`);
}

const root = roots[0];
captureNodeBindPose(root._mt5Nodes || []);
const motionReport = loadAndApplyMotion(root, loader);
applyTransformMode(root, transformMode);
applyRenderFocus(root, loader, renderFocus, isolateTextures);
applyOnlyNodeOffsets(root, onlyNodeOffsets);
applyHiddenNodeOffsets(root, hiddenNodeOffsets);
const faceUvTransferReport = applyFaceUvTransfer(
  root,
  faceUvTransferJson,
  faceUvTransferMaxDistance,
  faceUvTransferTransform,
  faceUvTransferCurrentUMin,
  faceUvTransferCurrentUMax,
);
const faceOverlayReport = await loadFaceOverlay(root, textureBuffer);
if (materialMode === "clay") {
  const clay = new BABYLON.StandardMaterial("clay", scene);
  clay.diffuseColor = new BABYLON.Color3(0.66, 0.63, 0.56);
  clay.specularColor = new BABYLON.Color3(0, 0, 0);
  clay.backFaceCulling = false;
  for (const node of root.getDescendants(false)) {
    if (node instanceof BABYLON.Mesh && node.getTotalVertices() > 0 && !node._ryuFaceOverlay) {
      node.material = clay;
    }
  }
}
forceBackfaceCulling(scene, parseBoolEnv("RYU_BACKFACE_CULLING", false));
const bounds = getRenderableBounds(root);
const radius = Math.max(bounds.size.x, bounds.size.y, bounds.size.z) * 0.75;
const effectiveRadiusScale = Number.isFinite(cameraRadiusScale)
  ? cameraRadiusScale
  : renderFocus === "full" ? 1.65 : 1.15;
const cameraTarget = fixedCameraTarget
  ? new BABYLON.Vector3(fixedCameraTarget[0], fixedCameraTarget[1], fixedCameraTarget[2])
  : bounds.center;
const cameraDistance = fixedCameraRadius !== null
  ? fixedCameraRadius
  : Math.max(0.08, radius * effectiveRadiusScale);

const camera = new BABYLON.ArcRotateCamera(
  "camera",
  BABYLON.Tools.ToRadians(cameraAlpha),
  BABYLON.Tools.ToRadians(cameraBeta),
  cameraDistance,
  cameraTarget,
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
  model: modelName,
  modelPath,
  texturePack: textureBuffer ? texturePackName : null,
  texturePackPath: textureBuffer ? texturePackPath : null,
  transformMode,
  characterRigMode,
  ryoHeadAtlasMode,
  ryoHeadAtlasDebug,
  respectStripWindingSign,
  emulateMirrorResize,
  textureAlphaModeOverrides: textureAlphaModeOverrides ? Object.fromEntries(textureAlphaModeOverrides) : {},
  textureZOffsetOverrides: textureZOffsetOverrides ? Object.fromEntries(textureZOffsetOverrides) : {},
  textureAddressMode,
  textureAddressModeOverrides: textureAddressModeOverrides ? Object.fromEntries(textureAddressModeOverrides) : {},
  textureCoordinateMode,
  faceUvTransfer: faceUvTransferReport,
  faceUvTransferTransform,
  faceOverlay: faceOverlayReport,
  materialMode,
  renderFocus,
  motionInterpretation,
  motionTarget,
  motionRotationScale,
  motion: motionReport,
  isolateTextures: isolateTextures ? [...isolateTextures] : [],
  hiddenNodeOffsets: hiddenNodeOffsets ? [...hiddenNodeOffsets].map((value) => `0x${value.toString(16)}`) : [],
  onlyNodeOffsets: onlyNodeOffsets ? [...onlyNodeOffsets].map((value) => `0x${value.toString(16)}`) : [],
  hiddenHeadAtlasStrips: hiddenHeadAtlasStrips ? [...hiddenHeadAtlasStrips] : [],
  onlyHeadAtlasStrips: onlyHeadAtlasStrips ? [...onlyHeadAtlasStrips] : [],
  remapHeadAtlasStrips: remapHeadAtlasStrips ? [...remapHeadAtlasStrips] : [],
  outputPath,
  characterRig: root._mt5CharacterRig === true,
  nodes: root._mt5Nodes?.length || 0,
  renderMeshes: bounds.count,
  camera: {
    alpha: cameraAlpha,
    beta: cameraBeta,
    radius: cameraDistance,
    target: cameraTarget.asArray(),
  },
  bounds: {
    min: bounds.min.asArray(),
    max: bounds.max.asArray(),
    size: bounds.size.asArray(),
  },
}, null, 2));

engine.dispose();

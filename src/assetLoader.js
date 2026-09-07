import { runtimeAssetUrl } from "./RuntimeAssets.js";
import state from "./state.js";
import { R2_URL, R2_PREFIX, OFFLINE_MODE, timeToMapIndex } from "./constants.js";
import { Mt5Loader } from "./Mt5Loader.js";
import { fetchAssetResponse } from "./AssetCache.js";

let texturePackManifestPromise = null;
let texturePackManifest = undefined;
const texturePackIndexCache = new WeakMap();

const PACKAGED_VIEWER_ASSETS = Object.freeze({
  "G_VENDING_JIHS5KNG.MT5": "play/assets/vending/JIHS5KNG.CHRM",
  "G_VENDING_textures.bin": "play/assets/vending/VEND_textures.bin",
  "S1_OP00_OMO.MT5": "play/assets/introduction/op00/models/OMO.MAPM",
  "S1_OP00_JIMENHAL.MT5": "play/assets/introduction/op00/models/JIMENHAL.MAPM",
  "S1_OP00_NAIB.MT5": "play/assets/introduction/op00/models/NAIB.MAPM",
  "S1_OP00_NIWAKAL.MT5": "play/assets/introduction/op00/models/NIWAKAL.MAPM",
  "S1_OP00_OMADO.MT5": "play/assets/introduction/op00/models/OMADO.MAPM",
  "S1_OP00_OOSAKI.MT5": "play/assets/introduction/op00/models/OOSAKI.MAPM",
  "S1_OP00_JYUU.MT5": "play/assets/introduction/op00/models/JYUU.MAPM",
  "S1_OP00_B023H01G.MT5": "play/assets/introduction/op00/models/B023H01G.CHRM",
  "S1_OP00_BMWS703G.MT5": "play/assets/introduction/op00/models/BMWS703G.CHRM",
  "S1_OP00_DDRR1001.MT5": "play/assets/introduction/op00/models/DDRR1001.CHRM",
  "S1_OP00_DDRR1002.MT5": "play/assets/introduction/op00/models/DDRR1002.CHRM",
  "S1_OP00_DRGS502G.MT5": "play/assets/introduction/op00/models/DRGS502G.CHRM",
  "S1_OP00_YUKS502G.MT5": "play/assets/introduction/op00/models/YUKS502G.CHRM",
  "S1_OP00_YUKS503G.MT5": "play/assets/introduction/op00/models/YUKS503G.CHRM",
  "S1_OP02_MAP.MT5": "play/assets/introduction/op02/models/MAP.MAPM",
  "S1_OP02_MAP01.MT5": "play/assets/introduction/op02/models/MAP01.MAPM",
  "S1_OP02_MAP02.MT5": "play/assets/introduction/op02/models/MAP02.MAPM",
  "S1_OP02_MAP03.MT5": "play/assets/introduction/op02/models/MAP03.MAPM",
  "S1_OP02_textures.bin": "play/assets/introduction/op02/OP02_textures.bin",
});

function getAssetPaths(filename) {
  const isModelIndex = filename === "models.json";
  const packaged = PACKAGED_VIEWER_ASSETS[filename];
  return {
    localPath: packaged ? runtimeAssetUrl(packaged, { offline: true })
      : (isModelIndex ? `/${filename}` : `/models/${filename}`),
    r2Path: packaged ? runtimeAssetUrl(packaged, { offline: false })
      : R2_URL ? `${R2_URL}/${R2_PREFIX}/${filename}` : null,
  };
}

function isValidResponse(res, forFilename) {
  if (!res.ok) return false;
  const ct = res.headers.get("content-type") || "";
  // Vite may serve the SPA fallback for any missing local asset path.
  if (ct.includes("text/html")) return false;
  return true;
}

async function tryFetchAssetPath(path, filename) {
  if (!path) return null;
  try {
    const res = await fetchAssetResponse(path);
    return isValidResponse(res, filename) ? res : null;
  } catch {
    return null;
  }
}

export async function fetchAsset(filename) {
  const { localPath, r2Path } = getAssetPaths(filename);
  // During local development, the checked-in catalog describes any newly
  // staged assets in public/models before those binaries are uploaded to R2.
  // Reading the production catalog first makes new Main View buttons appear
  // valid while leaving state.allFiles unaware of every new model.
  const preferLocal = OFFLINE_MODE
    || (
      import.meta.env?.DEV
      && (filename === "models.json" || filename.startsWith("S3_"))
    );

  if (preferLocal) {
    // Offline: try local FIRST, fall back to R2
    try {
      const localRes = await fetchAssetResponse(localPath);
      if (isValidResponse(localRes, filename)) return localRes;
      console.warn(
        `[Viewer] Local file not found for: ${localPath}, trying R2 fallback...`,
      );
    } catch (e) {
      console.warn(
        `[Viewer] Local fetch error for ${localPath}, trying R2 fallback:`,
        e,
      );
    }

    // Fall back to R2 even in offline mode
    if (r2Path) {
      try {
        const r2Res = await fetchAssetResponse(r2Path);
        if (r2Res.ok) return r2Res;
      } catch (e) {
        // R2 also failed
      }
    }
  } else {
    // Online: try R2 FIRST to verify the cloud sync
    if (r2Path) {
      try {
        const r2Res = await fetchAssetResponse(r2Path);
        if (r2Res.ok) return r2Res;
        console.warn(
          `[Viewer] R2 fetch failed (${r2Res.status}) for: ${r2Path}, falling back to local.`,
        );
      } catch (e) {
        console.warn(
          `[Viewer] R2 fetch network error for ${r2Path}, falling back to local:`,
          e,
        );
      }
    }

    // Fall back to local
    try {
      const localRes = await fetchAssetResponse(localPath);
      if (isValidResponse(localRes, filename)) return localRes;
      console.error(
        `[Viewer] Local fetch failed for: ${localPath} (missing or HTML fallback)`,
      );
    } catch (e) {
      console.error(
        `[Viewer] Local fetch network error for ${localPath}:`,
        e,
      );
    }
  }

  throw new Error(
    `Failed to load asset: ${filename}. Checked R2: ${r2Path} and local: ${localPath}`,
  );
}

export async function fetchShenmue2Catalog() {
  const localPath = "/shenmue2/models.json";
  const r2Path = R2_URL ? `${R2_URL}/${R2_PREFIX}/shenmue2/models.json` : null;
  const response = OFFLINE_MODE || import.meta.env?.DEV
    ? (await tryFetchAssetPath(localPath, "models.json"))
      || (await tryFetchAssetPath(r2Path, "models.json"))
    : (await tryFetchAssetPath(r2Path, "models.json"))
      || (await tryFetchAssetPath(localPath, "models.json"));
  if (!response) throw new Error("Shenmue II model catalog not found");
  return response.json();
}

export async function fetchShenmue2Asset(kind, filename) {
  if (!new Set(["models", "textures"]).has(kind)) {
    throw new Error(`Unsupported Shenmue II asset kind: ${kind}`);
  }
  const relativePath = `shenmue2/${kind}/${encodeURIComponent(filename)}`;
  const localPath = `/${relativePath}`;
  const r2Path = R2_URL ? `${R2_URL}/${R2_PREFIX}/${relativePath}` : null;
  const response = OFFLINE_MODE || import.meta.env?.DEV
    ? (await tryFetchAssetPath(localPath, filename))
      || (await tryFetchAssetPath(r2Path, filename))
    : (await tryFetchAssetPath(r2Path, filename))
      || (await tryFetchAssetPath(localPath, filename));
  if (!response) throw new Error(`Shenmue II asset not found: ${filename}`);
  return response;
}

async function fetchOptionalAsset(filename) {
  const { localPath, r2Path } = getAssetPaths(filename);
  if (OFFLINE_MODE) {
    return (await tryFetchAssetPath(localPath, filename)) ||
      (await tryFetchAssetPath(r2Path, filename));
  }

  const r2Response = await tryFetchAssetPath(r2Path, filename);
  if (r2Response) return r2Response;

  // In production, optional time packs should not emit a second origin 404.
  if (r2Path) return null;

  return tryFetchAssetPath(localPath, filename);
}

async function getTexturePackManifest() {
  if (texturePackManifest !== undefined) return texturePackManifest;
  if (!texturePackManifestPromise) {
    texturePackManifestPromise = (async () => {
      try {
        const response = await fetch("/texture-packs.json");
        if (!isValidResponse(response, "texture-packs.json")) return null;
        const data = await response.json();
        if (!Array.isArray(data.texturePacks)) return null;
        return new Set(data.texturePacks);
      } catch {
        return null;
      }
    })();
  }

  texturePackManifest = await texturePackManifestPromise;
  return texturePackManifest;
}

export async function getTexturePack(filename, timeIndex = null) {
  // Determine scene prefix (e.g., S1_JOMO or G_CHARA)
  const parts = filename.split("_");
  if (parts.length < 2) return null;

  // For global files G_CHARA_..., the pack is G_CHARA_textures.bin
  // For scenario files S1_JOMO_..., the pack is S1_JOMO_textures.bin
  let packPrefix = "";
  if (parts[0] === "G") {
    packPrefix = `G_${parts[1]}`;
  } else {
    packPrefix = `${parts[0]}_${parts[1]}`;
  }

  // Determine which map texture index to use (0-3)
  const mapIdx = timeToMapIndex[timeIndex ?? state.currentTimeOfDay] ?? 0;
  const manifest = await getTexturePackManifest();

  // Try to load time-variant textures pack FIRST
  const timePackName = `${packPrefix}_textures_${mapIdx}.bin`;
  let timeBuffer = state.texturePacks.get(timePackName);
  if (timeBuffer === undefined) {
    try {
      const shouldTryTimePack = manifest === null || manifest.has(timePackName);
      const response = shouldTryTimePack ? await fetchOptionalAsset(timePackName) : null;
      if (response) {
        timeBuffer = await response.arrayBuffer();
        state.texturePacks.set(timePackName, timeBuffer);
      } else {
        state.texturePacks.set(timePackName, null);
        timeBuffer = null;
      }
    } catch (err) {
      state.texturePacks.set(timePackName, null);
      timeBuffer = null;
    }
  }

  // Load base textures pack
  const basePackName = `${packPrefix}_textures.bin`;
  let baseBuffer = state.texturePacks.get(basePackName);
  if (baseBuffer === undefined) {
    try {
      const shouldTryBasePack = manifest === null || manifest.has(basePackName);
      const response = shouldTryBasePack ? await fetchAsset(basePackName) : null;
      if (response?.ok) {
        baseBuffer = await response.arrayBuffer();
        state.texturePacks.set(basePackName, baseBuffer);
      } else {
        state.texturePacks.set(basePackName, null);
        baseBuffer = null;
      }
    } catch (err) {
      state.texturePacks.set(basePackName, null);
      baseBuffer = null;
    }
  }

  // Return time pack with base as fallback for missing textures
  if (timeBuffer) {
    return { base: baseBuffer, time: timeBuffer };
  }

  return baseBuffer;
}

function texturePackBuffers(pack) {
  if (!pack) return [];
  if (pack instanceof ArrayBuffer) return [pack];
  // The selected numbered pack overrides the scene's base pack.
  return [pack.time, pack.base].filter((buffer) => buffer instanceof ArrayBuffer);
}

function textureKeyFromBytes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
  return `${view.getUint32(0, true)}_${view.getUint32(4, true)}`;
}

function texturePackIndex(buffer) {
  if (!(buffer instanceof ArrayBuffer)) return new Map();
  let index = texturePackIndexCache.get(buffer);
  if (!index) {
    index = Mt5Loader.buildTexturePackIndex(buffer);
    texturePackIndexCache.set(buffer, index);
  }
  return index;
}

// Return only external NAME references. Embedded TEXN/PVRT textures need no
// scene pack and must not trigger cross-scene fallback downloads.
export function externalTextureKeysFromMt5(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) return new Set();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const fourCc = (offset) => String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
  if (fourCc(0) !== "HRCM") return new Set();

  const texOffset = view.getUint32(4, true);
  if (texOffset <= 0 || texOffset + 12 > buffer.byteLength) return new Set();
  if (fourCc(texOffset) !== "TEXD") return new Set();

  const headerSize = view.getUint32(texOffset + 4, true);
  const textureCount = view.getUint32(texOffset + 8, true);
  let offset = texOffset + headerSize;
  let seen = 0;
  const keys = new Set();

  while (seen < textureCount && offset + 8 <= buffer.byteLength) {
    const marker = fourCc(offset);
    const nodeSize = view.getUint32(offset + 4, true);
    if (nodeSize < 8 || offset + nodeSize > buffer.byteLength) break;

    if (marker === "NAME") {
      const entries = Math.floor((nodeSize - 8) / 8);
      for (let index = 0; index < entries && seen < textureCount; index++) {
        const idOffset = offset + 8 + index * 8;
        keys.add(textureKeyFromBytes(bytes.subarray(idOffset, idOffset + 8)));
        seen++;
      }
    } else if (marker === "TEXN" || marker === "PVRT") {
      seen++;
    }
    offset += nodeSize;
  }
  return keys;
}

function addPackBuffers(
  pack,
  buffers,
  seenBuffers,
  missingKeys,
  preferNewCoverage = false,
) {
  let addedCoverage = false;
  const additions = [];
  for (const buffer of texturePackBuffers(pack)) {
    if (seenBuffers.has(buffer)) continue;
    seenBuffers.add(buffer);
    const index = texturePackIndex(buffer);
    let coversMissing = false;
    for (const key of missingKeys) {
      if (index.has(key)) {
        coversMissing = true;
        addedCoverage = true;
      }
    }
    if (coversMissing) additions.push(buffer);
  }
  if (preferNewCoverage) {
    buffers.unshift(...additions);
  } else {
    buffers.push(...additions);
  }

  if (addedCoverage) {
    const covered = new Set();
    for (const buffer of buffers) {
      const index = texturePackIndex(buffer);
      for (const key of missingKeys) {
        if (index.has(key)) covered.add(key);
      }
    }
    covered.forEach((key) => missingKeys.delete(key));
  }
}

function concatenateTexturePacks(buffers) {
  if (buffers.length === 0) return null;
  if (buffers.length === 1) return buffers[0];
  const byteLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const merged = new Uint8Array(byteLength);
  let offset = 0;
  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return merged.buffer;
}

// Loose models are duplicated between Shenmue scenes, but their referenced
// textures are not always duplicated with them. Resolve the model's actual
// texture IDs against its numbered packs first, then same-named copies in
// other scene packs. This keeps the fallback data-driven instead of maintaining
// a growing list of special-case model names.
export async function getStandaloneTexturePack(
  filename,
  modelBuffer,
  primaryPack = null,
) {
  const requestedKeys = externalTextureKeysFromMt5(modelBuffer);
  if (requestedKeys.size === 0) return primaryPack;

  const missingKeys = new Set(requestedKeys);
  const buffers = [];
  const seenBuffers = new Set();
  addPackBuffers(primaryPack, buffers, seenBuffers, missingKeys);

  // A standalone MAP model may draw from MAP0..MAP3 regardless of the
  // viewer's current lighting preset (D000 MAP24-26 are concrete examples).
  for (let index = 0; index < 4 && missingKeys.size > 0; index++) {
    const pack = await getTexturePack(filename, index);
    addPackBuffers(pack, buffers, seenBuffers, missingKeys, true);
  }

  const basename = filename.split("_").at(-1)?.toUpperCase();
  const alternatives = basename
    ? state.allFiles.filter((candidate) => (
      candidate !== filename
      && candidate.toUpperCase().endsWith(`_${basename}`)
    ))
    : [];
  const attemptedPrefixes = new Set([
    filename.split("_").slice(0, 2).join("_").toUpperCase(),
  ]);

  for (const candidate of alternatives) {
    if (missingKeys.size === 0) break;
    const prefix = candidate.split("_").slice(0, 2).join("_").toUpperCase();
    if (attemptedPrefixes.has(prefix)) continue;
    attemptedPrefixes.add(prefix);

    const pack = await getTexturePack(candidate);
    addPackBuffers(pack, buffers, seenBuffers, missingKeys, true);
    for (let index = 0; index < 4 && missingKeys.size > 0; index++) {
      const variantPack = await getTexturePack(candidate, index);
      addPackBuffers(variantPack, buffers, seenBuffers, missingKeys, true);
    }
  }

  if (missingKeys.size > 0) {
    console.warn(
      `[Viewer] ${filename} still has ${missingKeys.size} unresolved texture reference(s).`,
    );
  }
  return concatenateTexturePacks(buffers);
}

import state from "./state.js";
import { R2_URL, R2_PREFIX, OFFLINE_MODE, timeToMapIndex } from "./constants.js";

let texturePackManifestPromise = null;
let texturePackManifest = undefined;

function getAssetPaths(filename) {
  const isModelIndex = filename === "models.json";
  return {
    localPath: isModelIndex ? `/${filename}` : `/models/${filename}`,
    r2Path: R2_URL ? `${R2_URL}/${R2_PREFIX}/${filename}` : null,
  };
}

function isValidResponse(res, forFilename) {
  if (!res.ok) return false;
  const ct = res.headers.get("content-type") || "";
  // If we requested a binary file but got HTML back, Vite is serving the SPA fallback.
  if (!forFilename.endsWith(".json") && ct.includes("text/html")) return false;
  return true;
}

async function tryFetchAssetPath(path, filename) {
  if (!path) return null;
  try {
    const res = await fetch(path);
    return isValidResponse(res, filename) ? res : null;
  } catch {
    return null;
  }
}

export async function fetchAsset(filename) {
  const { localPath, r2Path } = getAssetPaths(filename);

  if (OFFLINE_MODE) {
    // Offline: try local FIRST, fall back to R2
    try {
      const localRes = await fetch(localPath);
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
        const r2Res = await fetch(r2Path);
        if (r2Res.ok) return r2Res;
      } catch (e) {
        // R2 also failed
      }
    }
  } else {
    // Online: try R2 FIRST to verify the cloud sync
    if (r2Path) {
      try {
        const r2Res = await fetch(r2Path);
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
      const localRes = await fetch(localPath);
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

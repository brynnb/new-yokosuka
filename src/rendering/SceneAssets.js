import { fetchAsset, fetchShenmue2Asset, getTexturePack, getStandaloneTexturePack } from "../assetLoader.js";
import { Mt5Loader } from "../Mt5Loader.js";
import { buildHiddenSuffixes, updateModelVisibility } from "../variants.js";
import { clearWorldSceneAssets, freezeSceneRoots } from "./SceneResources.js";
import { spatiallyBatchMt7MapRoot } from "./SceneSpatialIndex.js";
import { installWorldMt7MapEffect } from "./MapEffects.js";

// Bound each resource read so a stalled request cannot hold the scene queue
// forever. Late I/O results never reach model parsing after timeout/cancel.
export async function readSceneResource(read, {signal, timeoutMs = 30000, retries = 1} = {}) {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw signal.reason || new Error("Scene load cancelled");
    let timer;
    let onAbort;
    try {
      return await Promise.race([
        Promise.resolve().then(read),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Scene resource timed out after ${timeoutMs}ms`)), timeoutMs);
          onAbort = () => reject(signal.reason || new Error("Scene load cancelled"));
          signal?.addEventListener("abort", onAbort, {once: true});
        }),
      ]);
    } catch (error) {
      if (signal?.aborted || attempt >= retries) throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

// Serialize use of scene-owned loader caches. A newer request invalidates the
// previous one immediately, but cannot dispose its textures while parsing is
// still in flight. UI consumers also use this for individual-model requests.
export async function runSceneLoad(state, options, load) {
  const id = ++state.currentLoadId;
  const cancelled = () => id !== state.currentLoadId || options.signal?.aborted;
  const previous = state.sceneLoadTask;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  state.sceneLoadTask = pending;
  try {
    await previous;
    if (cancelled()) return false;
    clearWorldSceneAssets(state);
    const result = await load(cancelled);
    return cancelled() ? false : result;
  } catch (error) {
    if (cancelled()) return false;
    throw error;
  } finally {
    release();
    if (state.sceneLoadTask === pending) state.sceneLoadTask = null;
  }
}

export function setLoaderTexturePackIndex(loader, secondaryBuffer) {
  if (!secondaryBuffer) {
    loader.setTexturePackIndex(null, null, null, null);
    return;
  }

  if (secondaryBuffer.base !== undefined || secondaryBuffer.time !== undefined) {
    const baseIdx = Mt5Loader.buildTexturePackIndex(secondaryBuffer.base);
    const timeIdx = Mt5Loader.buildTexturePackIndex(secondaryBuffer.time);
    loader.setTexturePackIndex(baseIdx, timeIdx, secondaryBuffer.base, secondaryBuffer.time);
    return;
  }

  if (secondaryBuffer instanceof ArrayBuffer) {
    const baseIdx = Mt5Loader.buildTexturePackIndex(secondaryBuffer);
    loader.setTexturePackIndex(baseIdx, null, secondaryBuffer, null);
    return;
  }

  loader.setTexturePackIndex(null, null, null, null);
}

export async function loadMt5Scene(state, prefix, options = {}) {
  return runSceneLoad(state, options, async (cancelled) => {
  state.singleModelMode = options.singleModel === true;
  const reportStatus = options.onStatus || (() => {});
  reportStatus(`Loading scene ${prefix}...`, true);

  // Set current zone and scene prefix from prefix (e.g. S1_JOMO -> JOMO)
  const parts = prefix.split("_");
  state.currentZone = options.variantZone
    || (parts.length > 1 ? parts[1] : prefix);
  state.currentScenePrefix = options.singleModel ? null : prefix;
  state.currentSceneComposition = options.composition || null;
  state.currentVariantProfile = options.variantProfile || null;
  if (Number.isInteger(options.timeOfDayIndex)) {
    state.currentTimeOfDay = options.timeOfDayIndex;
  }


  // Pre-compute which MAP suffixes should be skipped based on variant config.
  const hiddenSuffixes = buildHiddenSuffixes(state);

  const requestedFilenames = options.filenames instanceof Set
    ? new Set([...options.filenames].map(filename => filename.toUpperCase()))
    : null;
  const filesToLoad = state.allFiles.filter((f) => {
    if (!f.toLowerCase().endsWith(".mt5")) return false;
    const baseName = f.replace(".MT5", "").replace(".mt5", "");
    if (requestedFilenames) {
      if (!requestedFilenames.has(f.toUpperCase())) return false;
    } else if (!baseName.startsWith(`${prefix}_`)) {
      return false;
    }

    // HEURISTIC: Skip characters and items when loading a world scene.
    const upper = f.toUpperCase();
    if (!options.singleModel && (
      upper.includes("_CHAR_") ||
      upper.includes("_RYO_") ||
      upper.includes("_ITEM_") ||
      upper.includes("_GAC_") ||
      upper.includes("_LIMB_") ||
      upper.includes("_UR_") ||
      upper.endsWith("UR.MT5") ||
      upper.includes("_UL_") ||
      upper.endsWith("UL.MT5")
    )) {
      return false;
    }

    if (!options.includeHiddenVariants) {
      // Skip files that the variant system would immediately hide.
      for (const suffix of hiddenSuffixes) {
        if (
          upper.includes(`_${suffix}.`) ||
          upper.includes(`_${suffix}_`)
        ) {
          return false;
        }
      }
    }

    if (options.includeFile && !options.includeFile(f)) return false;

    return true;
  });
  let totalLoaded = 0;
  const failures = [];
  let totalProcessed = 0;
  const progressTotal = (
    filesToLoad.length
    + Math.max(0, Number(options.additionalProgressTotal) || 0)
  );
  options.onProgress?.({
    loaded: 0,
    total: progressTotal,
  });

  // A composition can reference more than one native area. Resolve one
  // texture pack per source instead of applying the first model's pack to the
  // entire scene.
  const texturePackSamples = new Map();
  for (const filename of filesToLoad) {
    const sourceKey = filename.split("_").slice(0, 2).join("_");
    if (!texturePackSamples.has(sourceKey)) {
      texturePackSamples.set(sourceKey, filename);
    }
  }
  const texturePacks = new Map(await Promise.all(
    [...texturePackSamples].map(async ([sourceKey, filename]) => (
      [sourceKey, await readSceneResource(() => getTexturePack(filename), options)]
    )),
  ));
  if (cancelled()) return false;

  // Parallel fetch with concurrency limit
  const CONCURRENCY = 6;
  const queue = [...filesToLoad];
  const pending = new Set();

  async function processFile(filename) {
    try {
      const response = await readSceneResource(() => fetchAsset(filename), options);
      if (cancelled()) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${filename}`);

      const buffer = await readSceneResource(() => response.arrayBuffer(), {...options, retries: 0});
      if (cancelled()) return;

      const modelTexturePack = await readSceneResource(() => getStandaloneTexturePack(
        filename,
        buffer,
        texturePacks.get(filename.split("_").slice(0, 2).join("_")) || null,
      ), options);
      if (cancelled()) return;

      // Numbered MAP files can draw from a different numbered texture pack
      // than the world's current time-of-day pack. Configure and parse as one
      // uninterrupted operation so parallel model fetches cannot exchange
      // their per-file indexes.
      setLoaderTexturePackIndex(state.loader, modelTexturePack);
      const meshes = await state.loader.load(
        buffer,
        modelTexturePack,
        { sourceFilename: filename },
      );
      if (cancelled()) {
        meshes.forEach((m) => m.dispose());
        return;
      }
      if (meshes.length === 0) return;

      meshes.forEach((m) => (m._filename = filename));
      state.currentMeshes.push(...meshes);
      totalLoaded++;
      reportStatus(
        `Loaded ${totalLoaded}/${filesToLoad.length} parts...`,
        true,
      );
    } catch (err) {
      failures.push({filename, error: err});
      if (!cancelled()) options.onError?.(filename, err);
    } finally {
      totalProcessed++;
      if (!cancelled()) {
        options.onProgress?.({
          loaded: totalProcessed,
          total: progressTotal,
        });
      }
    }
  }

  while (queue.length > 0 || pending.size > 0) {
    if (cancelled()) {
      // A loader parse may already be using the shared material/texture
      // caches. Let only the currently active batch unwind before the next
      // world starts; every stale mesh is disposed by processFile above.
      await Promise.allSettled(pending);
      return false;
    }

    while (pending.size < CONCURRENCY && queue.length > 0) {
      const filename = queue.shift();
      const p = processFile(filename).finally(() => pending.delete(p));
      pending.add(p);
    }

    if (pending.size > 0) {
      await Promise.race(pending);
    }
  }

  if (!cancelled() && failures.length) {
    throw new AggregateError(failures.map(f => f.error),
      `Failed to load scene assets: ${failures.map(f => f.filename).join(", ")}`);
  }
  if (!cancelled()) {
    options.prepareRoots?.(state.currentMeshes);
    // Keeping inactive variants resident must not make them visible. Apply
    // the same composition rules used by live season/time updates now, even
    // when the environment hasn't changed since the previous world load.
    updateModelVisibility(state);
    freezeSceneRoots(state.currentMeshes);
    reportStatus(`Loaded scene ${prefix} (${totalLoaded} models)`);
  }
  return !cancelled();
  });
}


// Both applications pass exact catalog records. Selection of scenes, disc
// variants and archives belongs to their catalogs, not to the renderer.
export async function loadMt7Scene(state, records, options = {}) {
  return runSceneLoad(state, options, async cancelled => {
    state.singleModelMode = options.singleModel === true;
    state.currentZone = records[0]?.area || null;
    state.currentScenePrefix = null;
    state.currentSceneComposition = null;
    state.currentVariantProfile = null;
    const packs = new Map();
    const texturePackFor = filename => {
      if (!filename) return Promise.resolve(null);
      if (!packs.has(filename)) packs.set(filename, (async () => {
        const response = await readSceneResource(() => fetchShenmue2Asset("textures", filename), options);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${filename}`);
        return readSceneResource(() => response.arrayBuffer(), {...options, retries: 0});
      })());
      return packs.get(filename);
    };
    let processed = 0;
    const total = records.length + (options.additionalProgressTotal || 0);
    const failures = [];
    options.onProgress?.({ loaded: 0, total });
    const queue = [...records];
    const processRecord = async record => {
      try {
        const [response, textures] = await Promise.all([
          readSceneResource(() => fetchShenmue2Asset("models", record.filename), options),
          texturePackFor(record.texturePack),
        ]);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${record.filename}`);
        const buffer = await readSceneResource(() => response.arrayBuffer(), {...options, retries: 0});
        if (cancelled()) return;
        const roots = state.mt7Loader.load(buffer, textures, {
          sourceFilename: record.filename, assetKind: record.kind,
        });
        if (cancelled()) { roots.forEach(root => root.dispose()); return; }
        for (const root of roots) {
          root._filename = record.filename;
          root.metadata = {
            ...root.metadata,
            assetViewerKind: record.kind,
            shenmue2SceneAssetKind: record.kind,
            shenmue2PlacementSource: record.kind === "PROP" ? "MPK00 PROP hierarchy" : null,
          };
          // Inspection must retain node identities, materials and source parts.
          // Only immutable MAPM geometry may be batched; PROP is never merged.
          if (record.kind === "MAPM") {
            if (options.batchStatic === true) spatiallyBatchMt7MapRoot(root);
            installWorldMt7MapEffect(root);
          }
          state.currentMeshes.push(root);
        }
      } catch (error) {
        failures.push({filename: record.filename, error});
        if (!cancelled()) options.onError?.(record.filename, error);
      } finally {
        processed++;
        if (!cancelled()) options.onProgress?.({loaded: processed, total});
      }
    };
    const workers = Array.from({length: Math.min(6, queue.length)}, async () => {
      while (queue.length && !cancelled()) await processRecord(queue.shift());
    });
    await Promise.all(workers);
    if (cancelled()) return false;
    if (failures.length) {
      throw new AggregateError(failures.map(f => f.error),
        `Failed to load ${failures.length} scene assets: ${failures.map(f => f.filename).join(", ")}`);
    }
    freezeSceneRoots(state.currentMeshes);
    return true;
  });
}

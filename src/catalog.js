import state from "./state.js";
import { setStatus, getModelList } from "./ui.js";
import { fetchAsset, getTexturePack } from "./assetLoader.js";
import { applyTimeOfDay } from "./lighting.js";
import { updateModelVisibility, buildHiddenSuffixes } from "./variants.js";
import { fitCameraToMeshes, detectInteriorScene, updateCameraSpeed } from "./scene.js";
import { timeOfDayPresets, seasonPresets } from "./constants.js";
import { Mt5Loader } from "./Mt5Loader.js";

// Freeze world matrices and materials on static geometry for rendering performance.
// This prevents Babylon.js from recalculating transforms and material dirty flags every frame.
function freezeLoadedMeshes(meshes) {
  const frozenMats = new Set();
  for (const root of meshes) {
    // Freeze the root and all children
    const allNodes = [root, ...root.getDescendants(false)];
    for (const node of allNodes) {
      if (node.freezeWorldMatrix) {
        node.freezeWorldMatrix();
      }
      if (node.material && !frozenMats.has(node.material)) {
        node.material.freeze();
        frozenMats.add(node.material);
      }
    }
  }
}

async function loadMetadata() {
  try {
    const mapsResponse = await fetch("/data/maps.csv");
    const mapsText = await mapsResponse.text();
    mapsText.split("\n").forEach((line) => {
      const parts = line.split(";");
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const id = parts[1].trim();
        if (id) state.mapNames[id] = name;
      }
    });

    const charsResponse = await fetch("/data/chars.csv");
    const charsText = await charsResponse.text();
    charsText.split("\n").forEach((line) => {
      const parts = line.split(";");
      if (parts.length >= 3) {
        const name = parts[0].trim();
        const id = parts[1].trim();
        const modelId = parts[2].trim();
        if (id && id !== "-") state.charNames[id] = name;
        if (modelId && modelId !== "-") {
          const cleanModelId = modelId.split("_")[0];
          state.charNames[cleanModelId] = name;
        }
      }
    });
    console.log("[Metadata] Loaded mappings", {
      maps: Object.keys(state.mapNames).length,
      chars: Object.keys(state.charNames).length,
    });
  } catch (err) {
    console.warn("[Metadata] Failed to load mappings", err);
  }
}

export async function loadScene(prefix) {
  const loadId = ++state.currentLoadId;
  state.singleModelMode = false;
  setStatus(`Loading scene ${prefix}...`, true);

  // Set current zone and scene prefix from prefix (e.g. S1_JOMO -> JOMO)
  const parts = prefix.split("_");
  state.currentZone = parts.length > 1 ? parts[1] : prefix;
  state.currentScenePrefix = prefix; // Track for time-of-day reloading

  // Clear previous
  state.currentMeshes.forEach((m) => m.dispose());
  state.currentMeshes = [];
  state.loader.textureCache.forEach((t) => t.dispose());
  state.loader.textureCache.clear();
  state.loader.materialCache.clear();

  // Pre-compute which MAP suffixes should be skipped based on variant config.
  const hiddenSuffixes = buildHiddenSuffixes();

  const filesToLoad = state.allFiles.filter((f) => {
    if (!f.toLowerCase().endsWith(".mt5")) return false;
    const baseName = f.replace(".MT5", "").replace(".mt5", "");
    if (!baseName.startsWith(prefix)) return false;

    // HEURISTIC: Skip characters and items when loading a world scene.
    const upper = f.toUpperCase();
    if (
      upper.includes("_CHAR_") ||
      upper.includes("_RYO_") ||
      upper.includes("_ITEM_") ||
      upper.includes("_GAC_") ||
      upper.includes("_LIMB_") ||
      upper.includes("_UR_") ||
      upper.endsWith("UR.MT5") ||
      upper.includes("_UL_") ||
      upper.endsWith("UL.MT5")
    ) {
      return false;
    }

    // Skip files that the variant system would immediately hide
    for (const suffix of hiddenSuffixes) {
      if (
        upper.includes(`_${suffix}.`) ||
        upper.includes(`_${suffix}_`)
      ) {
        return false;
      }
    }

    return true;
  });
  let totalLoaded = 0;

  // Pre-fetch the texture pack for the scene
  const sampleFile = filesToLoad[0];
  const secondaryBuffer = sampleFile ? await getTexturePack(sampleFile) : null;
  if (loadId !== state.currentLoadId) return;

  // Pre-index texture packs for O(1) lookups (instead of linear scan per file)
  if (secondaryBuffer) {
    if (secondaryBuffer.base !== undefined || secondaryBuffer.time !== undefined) {
      const baseIdx = Mt5Loader.buildTexturePackIndex(secondaryBuffer.base);
      const timeIdx = Mt5Loader.buildTexturePackIndex(secondaryBuffer.time);
      state.loader.setTexturePackIndex(baseIdx, timeIdx, secondaryBuffer.base, secondaryBuffer.time);
    } else if (secondaryBuffer instanceof ArrayBuffer) {
      const baseIdx = Mt5Loader.buildTexturePackIndex(secondaryBuffer);
      state.loader.setTexturePackIndex(baseIdx, null, secondaryBuffer, null);
    }
  } else {
    state.loader.setTexturePackIndex(null, null, null, null);
  }

  // Parallel fetch with concurrency limit
  const CONCURRENCY = 6;
  const queue = [...filesToLoad];
  const pending = new Set();

  async function processFile(filename) {
    try {
      const response = await fetchAsset(filename);
      if (loadId !== state.currentLoadId) return;
      if (!response.ok) return;

      const buffer = await response.arrayBuffer();
      if (loadId !== state.currentLoadId) return;

      const meshes = await state.loader.load(buffer, secondaryBuffer);
      if (loadId !== state.currentLoadId) {
        meshes.forEach((m) => m.dispose());
        return;
      }

      meshes.forEach((m) => (m._filename = filename));
      state.currentMeshes.push(...meshes);
      totalLoaded++;
      setStatus(`Loaded ${totalLoaded}/${filesToLoad.length} parts...`, true);
    } catch (err) {
      console.error(`Failed to load ${filename}`, err);
    }
  }

  while (queue.length > 0 || pending.size > 0) {
    if (loadId !== state.currentLoadId) return;

    while (pending.size < CONCURRENCY && queue.length > 0) {
      const filename = queue.shift();
      const p = processFile(filename).then(() => pending.delete(p));
      pending.add(p);
    }

    if (pending.size > 0) {
      await Promise.race(pending);
    }
  }

  if (loadId === state.currentLoadId && state.currentMeshes.length > 0) {
    const size = fitCameraToMeshes(state.currentMeshes);

    // Detect if this is an interior scene (affects sky visibility)
    state.isInteriorScene = detectInteriorScene(size);
    // Adjust camera speed based on scene size
    updateCameraSpeed(size);

    // Apply time of day (handles visibility and sky)
    applyTimeOfDay(state.currentTimeOfDay);
    updateModelVisibility();

    // Freeze static geometry for rendering performance
    freezeLoadedMeshes(state.currentMeshes);

    setStatus(`[Viewer] Loaded scene ${prefix} (${totalLoaded} models)`);
  }
}

export async function loadModelFromUrl(filename, element) {
  const loadId = ++state.currentLoadId;
  state.singleModelMode = true;

  // Clear previous
  state.currentMeshes.forEach((m) => m.dispose());
  state.currentMeshes = [];
  state.loader.textureCache.forEach((t) => t.dispose());
  state.loader.textureCache.clear();
  state.loader.materialCache.clear();

  document
    .querySelectorAll(".model-item")
    .forEach((el) => el.classList.remove("active"));
  if (element) {
    element.classList.add("active");
  }

  setStatus(`Loading ${filename}...`, true);

  // Set current zone from filename (e.g. S1_JOMO_... -> JOMO)
  const parts = filename.split("_");
  if (parts.length > 1 && (parts[0] === "S1" || parts[0] === "S2")) {
    state.currentZone = parts[1];
  } else if (parts.length > 1 && parts[0] === "G") {
    state.currentZone = parts[1]; // e.g. G_CHARA
  }

  try {
    // Fetch model and textures in parallel
    const [modelRes, secondaryBuffer] = await Promise.all([
      fetchAsset(filename),
      getTexturePack(filename),
    ]);

    if (loadId !== state.currentLoadId) return;

    if (!modelRes.ok) throw new Error("File not found");
    const buffer = await modelRes.arrayBuffer();
    if (loadId !== state.currentLoadId) return;

    const meshes = await state.loader.load(buffer, secondaryBuffer);
    if (loadId !== state.currentLoadId) {
      meshes.forEach((m) => m.dispose());
      return;
    }

    meshes.forEach((m) => (m._filename = filename));
    state.currentMeshes = meshes;

    if (meshes.length > 0) {
      const size = fitCameraToMeshes(meshes);
      setStatus(`[Viewer] Loaded ${filename}`);

      // Detect if this is an interior scene (affects sky visibility)
      state.isInteriorScene = detectInteriorScene(size);

      // Adjust camera speed based on model size
      updateCameraSpeed(size);

      // Apply time of day (handles visibility and sky)
      applyTimeOfDay(state.currentTimeOfDay);
      updateModelVisibility();

      // Freeze static geometry for rendering performance
      freezeLoadedMeshes(meshes);
    } else {
      setStatus(`[Viewer] Warning: No meshes found in ${filename}`);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  }
}

export async function loadCatalog() {
  await loadMetadata();
  const modelList = getModelList();
  try {
    const response = await fetchAsset("models.json");
    if (!response.ok) throw new Error("Catalog not found");
    state.allFiles = await response.json();
    const files = state.allFiles
      .filter((f) => f.toLowerCase().endsWith(".mt5"))
      .sort();
    state.mt5Files = files;

    // Scenario-based Organization Logic
    const hierarchy = {
      s1: { title: "💽 Scenario 1 (Yokosuka)", groups: {} },
      s2: { title: "💽 Scenario 2 (Harbor)", groups: {} },
      global: { title: "🌍 Global Library", groups: {} },
    };

    files.forEach((file) => {
      let category = "global";
      let folderKey = "Misc";
      let folderLabel = "Misc";

      if (file.startsWith("S1_")) {
        category = "s1";
        const parts = file.split("_");
        folderKey = parts[1]; // e.g. JOMO
        folderLabel = state.mapNames[folderKey] || folderKey;
      } else if (file.startsWith("S2_")) {
        category = "s2";
        const parts = file.split("_");
        folderKey = parts[1]; // e.g. DNOZ
        folderLabel = state.mapNames[folderKey] || folderKey;
      } else if (file.startsWith("G_")) {
        category = "global";
        const parts = file.split("_");
        folderKey = parts[1]; // e.g. CHARA
        folderLabel = folderKey.charAt(0) + folderKey.slice(1).toLowerCase();
      }

      const target = hierarchy[category].groups;
      if (!target[folderKey]) {
        target[folderKey] = { label: folderLabel, files: [] };
      }
      target[folderKey].files.push(file);
    });

    modelList.innerHTML = "";

    // Render Hierarchy
    ["s1", "s2", "global"].forEach((catKey) => {
      const cat = hierarchy[catKey];
      const groupKeys = Object.keys(cat.groups).sort();
      if (groupKeys.length === 0) return;

      const catContainer = document.createElement("div");
      catContainer.className = "category-group";

      const catHeader = document.createElement("div");
      catHeader.className = "category-header";
      catHeader.innerHTML = `<span>${cat.title} (${groupKeys.length})</span>`;

      const catContent = document.createElement("div");
      catContent.className = "category-content hidden";

      catHeader.onclick = () => {
        catContent.classList.toggle("hidden");
        catHeader.classList.toggle("expanded");
      };

      groupKeys.forEach((gKey) => {
        const group = cat.groups[gKey];
        const groupFiles = group.files.sort();

        const groupContainer = document.createElement("div");
        groupContainer.className = "model-group";

        const header = document.createElement("div");
        header.className = "group-header";

        const labelTxt =
          group.label === gKey ? gKey : `${group.label} (${gKey})`;
        header.innerHTML = `<span>📁 ${labelTxt} (${groupFiles.length})</span>`;

        const btn = document.createElement("button");
        btn.className = "scene-btn";
        btn.innerText = `Load All`;
        btn.onclick = (e) => {
          e.stopPropagation();
          const firstFile = groupFiles[0];
          const parts = firstFile.split("_");
          const groupPrefix = `${parts[0]}_${parts[1]}`;
          loadScene(groupPrefix);
        };
        header.appendChild(btn);

        const itemsList = document.createElement("ul");
        itemsList.className = "group-items hidden";

        header.onclick = () => {
          itemsList.classList.toggle("hidden");
          header.classList.toggle("expanded");
        };

        groupFiles.forEach((file) => {
          const li = document.createElement("li");
          li.className = "model-item";

          // Show filename without scenario/zone prefix for list
          const parts = file.split("_");
          let displayName = parts[parts.length - 1];
          if (parts.length >= 2) {
            const midPart = parts[parts.length - 2];
            if (
              midPart.startsWith("DR") ||
              midPart.startsWith("MAP") ||
              midPart.startsWith("G")
            ) {
              displayName = `${midPart}_${displayName}`;
            }
          }
          li.innerText = displayName;

          li.onclick = (e) => {
            e.stopPropagation();
            loadModelFromUrl(file, li);
          };
          itemsList.appendChild(li);
        });

        groupContainer.appendChild(header);
        groupContainer.appendChild(itemsList);
        catContent.appendChild(groupContainer);
      });

      catContainer.appendChild(catHeader);
      catContainer.appendChild(catContent);
      modelList.appendChild(catContainer);
    });

    setStatus(`Ready`);
  } catch (err) {
    setStatus("Error loading catalog");
    console.error(err);
  }
}

// Initialize sky/time and season toggle buttons
export function initToggleButtons() {
  const skyBtn = document.getElementById("sky-btn");
  if (skyBtn) {
    skyBtn.onclick = async () => {
      state.currentTimeOfDay = (state.currentTimeOfDay + 1) % timeOfDayPresets.length;
      applyTimeOfDay(state.currentTimeOfDay);
      updateModelVisibility();

      // Reload scene with new time-of-day textures if a scene is loaded
      if (state.currentScenePrefix) {
        const cam = state.scene.activeCamera;
        const savedPos = cam.position.clone();
        const savedRot = cam.rotation.clone();
        await loadScene(state.currentScenePrefix);
        cam.position.copyFrom(savedPos);
        cam.rotation.copyFrom(savedRot);
      }
    };
  }

  const seasonBtn = document.getElementById("season-btn");
  if (seasonBtn) {
    seasonBtn.onclick = async () => {
      state.currentSeason = (state.currentSeason + 1) % seasonPresets.length;
      // Must reload scene because variant files are skipped at load time.
      if (state.currentScenePrefix) {
        const cam = state.scene.activeCamera;
        const savedPos = cam.position.clone();
        const savedRot = cam.rotation.clone();
        await loadScene(state.currentScenePrefix);
        cam.position.copyFrom(savedPos);
        cam.rotation.copyFrom(savedRot);
      } else {
        updateModelVisibility();
      }
    };
  }
}

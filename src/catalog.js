import * as BABYLON from "@babylonjs/core";
import { findInteriorViewpoint } from "./AssetViewerInteriorCamera.js";
import state from "./state.js";
import { assetLabel, browserSection, mainViewList, mainViewButton, nestedBrowserSection, refreshBrowserSearch } from "./AssetBrowser.js";
import {
  collapseAssetViewerSidebarOnMobile,
  expandAssetParents,
  getModelList,
  setStatus,
} from "./ui.js";
import {
  fetchAsset,
  fetchShenmue2Catalog,
} from "./assetLoader.js";
import { applyTimeOfDay as applySceneTimeOfDay } from "./lighting.js";
import { updateModelVisibility } from "./variants.js";
import {
  detectInteriorScene,
  fitCameraToMeshes,
  setCameraPosition,
  updateCameraSpeed,
} from "./scene.js";
import { timeOfDayPresets, seasonPresets } from "./constants.js";
import { loadMt5Scene, loadMt7Scene } from "./rendering/SceneAssets.js";
import { clearWorldSceneAssets } from "./rendering/SceneResources.js";
import { arrangeVendingMachineDisplay } from "./VendingMachineDisplay.js";
import {
  groupShenmue2Catalog,
  compareShenmue2Archives,
  compareShenmue2Records,
  shenmue2ArchivePresentation,
  shenmue2AreaPresentation,
  shenmue2RecordDisplayName,
  primaryShenmue2AreaRecords,
  shenmue2OutdoorViews,
  shenmue2InteriorViews,
  shenmue2SceneVariantViews,
} from "./Shenmue2AssetOrganization.js";
import collectionModelNameAudit from "./data/collection-model-names.json";
import {
  enterAudioViewer,
  exitAudioViewer,
  syncAudioGameFromUrl,
} from "../asset-viewer/audio/audioViewer.js";
import { resolveSceneComposition } from "./SceneCompositions.js";
import { ASSET_VIEWER_MAIN_VIEWS, shenmueInteriorViews } from "./AssetViewerMainViews.js";
// Preserve the asset viewer's original, self-contained Hazuki exterior scene.
// The playable world uses JHD0; BETD is the viewer scene whose seasonal layers
// are authored to work with the generic Summer/Winter variant filtering.
const DEFAULT_MAIN_VIEW_PREFIX = "S1_BETD";
const mapRegions = {};
function applyTimeOfDay(presetIndex) {
  applySceneTimeOfDay(presetIndex);
  const button = document.getElementById("sky-btn");
  if (button) button.textContent = `Time: ${timeOfDayPresets[presetIndex].name}${state.isInteriorScene ? " (interior)" : ""}`;
}
let interiorEntryPoints = {};
let currentInteriorViewpoint = null;

function updateViewerCameraControls() {
  const overview = document.getElementById("overview-view-btn");
  const interior = document.getElementById("interior-view-btn");
  if (overview) overview.disabled = !state.currentMeshes.length;
  if (interior) {
    interior.disabled = !currentInteriorViewpoint;
    interior.title = currentInteriorViewpoint
      ? `Return to the validated entrance · ${currentInteriorViewpoint.source}`
      : state.currentGame === "shenmue2"
        ? "No entrance could be verified against this environment"
        : "Interior entrance presets are not yet available for Shenmue";
  }
}

function showInteriorView() {
  if (!currentInteriorViewpoint) return;
  state.scene.activeCamera.lowerRadiusLimit = 0.01;
  state.scene.activeCamera.setTarget(currentInteriorViewpoint.target);
  setCameraPosition(state.scene.activeCamera, currentInteriorViewpoint.position);
}

function applyInteriorCamera(record) {
  const disc = record.disc || Number(record.filename.match(/^S2DC_D(\d)_/)?.[1]);
  const scene = record.scene || String(disc).padStart(2, "0");
  const area = record.area || record.filename.split("_")[2];
  currentInteriorViewpoint = findInteriorViewpoint(
    state.currentMeshes, interiorEntryPoints[`${disc}/${scene}/${area}`],
  );
  updateViewerCameraControls();
  if (!currentInteriorViewpoint) return;
  showInteriorView();
  state.speedMultiplier = 0.5;
  state.isInteriorScene = true;
}

const GLOBAL_MODEL_LABELS = Object.freeze({
  "G_VENDING_JIHS5KNG.MT5": "Vending Machine",
});

let catalogGeneration = 0;

function resetAssetViewerTimeToDay() {
  state.currentTimeOfDay = 0;
}

async function clearLoadedAssets() {
  const id = state.currentLoadId;
  await state.sceneLoadTask;
  if (id !== state.currentLoadId) return false;
  currentInteriorViewpoint = null;
  const interiorButton = document.getElementById("interior-view-btn");
  if (interiorButton) interiorButton.disabled = true;
  clearWorldSceneAssets(state);
  updateViewerCameraControls();
  return true;
}

function updateGameSelector(game) {
  state.currentGame = game;
  document.querySelector(".asset-browser-tools").hidden = game === "audio";
  document.getElementById("viewer-camera-controls").hidden = game === "audio";
  const shenmueButton = document.getElementById("shenmue-game-btn");
  const shenmue2Button = document.getElementById("shenmue2-game-btn");
  const audioButton = document.getElementById("audio-game-btn");
  shenmueButton?.classList.toggle("active", game === "shenmue");
  shenmue2Button?.classList.toggle("active", game === "shenmue2");
  audioButton?.classList.toggle("active", game === "audio");
  shenmueButton?.setAttribute("aria-pressed", String(game === "shenmue"));
  shenmue2Button?.setAttribute("aria-pressed", String(game === "shenmue2"));
  audioButton?.setAttribute("aria-pressed", String(game === "audio"));
  const subtitle = document.getElementById("asset-format-subtitle");
  if (subtitle) {
    if (game === "audio") subtitle.textContent = "Rendered Music & Soundtrack";
    else if (game === "shenmue2") subtitle.textContent = "Extracted Dreamcast .MT7 Models";
    else subtitle.textContent = "Extracted .MT5 Models";
  }
}

function viewerCompositionContext() {
  return {
    timeOfDayIndex: state.currentTimeOfDay,
    seasonIndex: state.currentSeason,
    weatherIndex: state.currentWeatherIndex,
  };
}

function viewerComposition(compositionId) {
  return compositionId
    ? resolveSceneComposition(compositionId, viewerCompositionContext(), {
      includeInactiveVariants: false,
    })
    : null;
}

function isNumberedMapModel(filename, prefix) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escapedPrefix}_MAP(?:\\d+)?\\.MT5$`,
    "i",
  ).test(filename);
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
        if (id && id !== "ID") {
          state.mapNames[id] = name;
          mapRegions[id] = parts[2]?.trim() || "Other locations";
        }
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
          state.charNames[modelId] = name;
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

// Catalog adapters own selection, camera fitting and UI; all asset construction
// and resource ownership are in the shared renderer.
async function finishViewerScene(record = null) {
  const size = fitCameraToMeshes(state.currentMeshes);
  updateViewerCameraControls();
  state.isInteriorScene = detectInteriorScene(size);
  updateCameraSpeed(size);
  if (record && !state.singleModelMode) applyInteriorCamera(record);
  applyTimeOfDay(state.currentTimeOfDay);
  updateModelVisibility();
  await state.sceneEnvironment?.load(record
    ? {prefix: record.filename.replace(/_[^_]+$/, "")} : undefined);
}

export async function loadScene(prefix, options = {}) {
  currentInteriorViewpoint = null;
  const loaded = await loadMt5Scene(state, prefix, {
    ...options,
    onStatus: options.suppressStatus ? undefined : setStatus,
  });
  if (loaded && state.currentMeshes.length) {
    const id = state.currentLoadId;
    try {
      await finishViewerScene();
    } catch (error) {
      if (id !== state.currentLoadId) return false;
      throw error;
    }
    if (id !== state.currentLoadId) return false;
  }
  return loaded;
}

export async function loadModelFromUrl(filename, element) {
  document.querySelectorAll(".model-item.active").forEach(el => el.classList.remove("active"));
  element?.classList.add("active");
  setStatus(`Loading ${filename}...`, true);
  const task = loadMt5Scene(state, filename.split("_").slice(0, 2).join("_"), {
    filenames: new Set([filename]),
    singleModel: true,
    includeHiddenVariants: true,
    prepareRoots: roots => arrangeVendingMachineDisplay(filename, roots),
  });
  const id = state.currentLoadId;
  try {
    if (!await task) return;
    if (state.currentMeshes.length) await finishViewerScene();
    if (id !== state.currentLoadId) return;
    setStatus(`[Viewer] Loaded ${filename}`);
  } catch (error) {
    if (id !== state.currentLoadId) return;
    setStatus(`Error: ${error.message}`);
    console.error(error);
  }
}

async function loadShenmue2Model(record, element) {
  document.querySelectorAll(".model-item.active").forEach(item => item.classList.remove("active"));
  element?.classList.add("active");
  return loadShenmue2Group([record], record.filename, {singleModel: true});
}

export async function loadShenmue2Group(records, label, options = {}) {
  if (!records.length) return;
  currentInteriorViewpoint = null;
  if (!options.singleModel) document.querySelectorAll(".model-item.active").forEach(item => item.classList.remove("active"));
  const task = loadMt7Scene(state, records, {
    ...options,
    batchStatic: false,
    onProgress: ({loaded,total}) => setStatus(`Loading ${label} (${loaded}/${total})...`, true),
  });
  const id = state.currentLoadId;
  try {
    if (!await task) return;
    if (!state.currentMeshes.length) {
      setStatus(`[Viewer] No supported geometry in ${label}`);
      return;
    }
    await finishViewerScene(records[0]);
    if (id !== state.currentLoadId) return;
    const warnings = state.currentMeshes.reduce((n, root) => n + (root.metadata?.warnings?.length || 0), 0);
    const hidden = state.currentMeshes.reduce((n, root) => n + (root.metadata?.hiddenRuntimeTextureGroupCount || 0), 0);
    setStatus(`[Viewer] Loaded ${label} (${records.length} models${warnings ? `; ${warnings} unsupported parts` : ""}${hidden ? `; ${hidden} runtime auxiliary groups hidden` : ""})`);
  } catch (error) {
    if (id !== state.currentLoadId) return;
    setStatus(`Error: ${error.message}`);
    console.error(error);
  }
}

export async function loadShenmue2Catalog() {
  const requestId = ++catalogGeneration;
  ++state.currentLoadId;
  exitAudioViewer();
  updateGameSelector("shenmue2");
  if (!await clearLoadedAssets()) return;
  state.currentScenePrefix = null;
  const modelList = getModelList();
  modelList.innerHTML = "";
  modelList._browserSections = new Map();
  setStatus("Loading Shenmue II catalog...", true);

  try {
    const catalog = await fetchShenmue2Catalog();
    if (requestId !== catalogGeneration || state.currentGame !== "shenmue2") return;
    const records = Array.isArray(catalog.models) ? catalog.models : [];
    interiorEntryPoints = catalog.entryPoints || {};
    state.mt7Models = records;

    const zones = groupShenmue2Catalog(records);
    const quickViews = mainViewList("Shenmue II");
    const interiors = browserSection("Interiors");
    const sceneVariants = browserSection("Scene variants");
    const appendQuickView = (view, parent, label = view.label) => {
      const button = mainViewButton(label, `${view.area} · Disc ${view.disc} · Scene ${view.scene || "default"}`);
      button.dataset.area = view.area;
      button.addEventListener("click", () => {
        resetAssetViewerTimeToDay();
        document.querySelectorAll(".main-view-button").forEach(item => item.classList.toggle("active", item === button));
        void loadShenmue2Group(view.records, view.label);
        collapseAssetViewerSidebarOnMobile();
      });
      parent.append(button);
    };
    for (const view of shenmue2OutdoorViews(zones)) appendQuickView(view, quickViews.list);
    for (const view of shenmue2InteriorViews(zones)) appendQuickView(view, interiors.content);
    for (const view of shenmue2SceneVariantViews(zones)) {
      appendQuickView(view, sceneVariants.content, `${view.label} · Disc ${view.disc}, Scene ${view.scene || "default"}`);
    }
    quickViews.section.append(interiors.section, sceneVariants.section);
    modelList.append(quickViews.section);
    const itemByFilename = new Map();
    for (const { disc, scene, area: zone, archives: groups } of zones) {
      const area = shenmue2AreaPresentation(zone);
      const region = `${disc ? `Disc ${disc} · ` : ""}${area.region}`;
      const discParent = nestedBrowserSection(modelList, `disc-${disc}`, disc ? `Disc ${disc}` : "Shared across discs");
      const regionParent = nestedBrowserSection(discParent, area.region, area.region);
      const typeParent = area.library
        ? nestedBrowserSection(regionParent, zone, zone === "PACK" ? "Characters" : "Objects & shared assets")
        : regionParent;
      const recordsInZone = [...groups.values()].flat().sort(compareShenmue2Records);
      const mainAreaRecords = primaryShenmue2AreaRecords(groups);
      const zoneCount = recordsInZone.length;
      const category = document.createElement("section");
      category.className = "category-group";
      const categoryHeader = document.createElement("div");
      categoryHeader.className = "category-header";
      categoryHeader.setAttribute("role", "button");
      categoryHeader.setAttribute("tabindex", "0");
      categoryHeader.setAttribute("aria-expanded", "false");
      const areaLabel = document.createElement("span");
      assetLabel(areaLabel, `${area.label} (${zoneCount})`, `${zone}${scene ? ` · Scene ${scene}` : ""}`);
      categoryHeader.append(areaLabel);
      categoryHeader.title = `${region}${scene ? ` · Scenario ${scene}` : ""} · ${zoneCount} extracted models`;
      const loadZoneButton = document.createElement("button");
      loadZoneButton.className = "scene-btn";
      loadZoneButton.type = "button";
      loadZoneButton.textContent = mainAreaRecords ? "Load Area" : "Load All";
      loadZoneButton.addEventListener("click", (event) => {
        event.stopPropagation();
        document.querySelectorAll(".main-view-button.active").forEach(button => button.classList.remove("active"));
        resetAssetViewerTimeToDay();
        void loadShenmue2Group(
          mainAreaRecords || recordsInZone,
          mainAreaRecords ? `${area.label} main area` : area.label,
        );
        collapseAssetViewerSidebarOnMobile();
      });
      // Without an authoritative main archive, choose an archive below rather
      // than superimposing alternative scene versions (for example KSH1).
      if (area.library || (!mainAreaRecords && groups.size > 1)) {
        loadZoneButton.classList.add("hidden");
      }
      categoryHeader.appendChild(loadZoneButton);
      const categoryContent = document.createElement("div");
      categoryContent.className = "category-content hidden";
      const toggleCategory = () => {
        const expanded = categoryContent.classList.toggle("hidden") === false;
        categoryHeader.classList.toggle("expanded", expanded);
        categoryHeader.setAttribute("aria-expanded", String(expanded));
      };
      categoryHeader.addEventListener("click", toggleCategory);
      categoryHeader.addEventListener("keydown", (event) => {
        if (event.target !== categoryHeader) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleCategory();
        }
      });

      const appendArchiveGroup = (label, entries) => {
        const recordsInGroup = entries.map((entry) => entry.record);
        const group = document.createElement("div");
        group.className = "model-group";
        const groupHeader = document.createElement("div");
        groupHeader.className = "group-header";
        const archiveLabel = document.createElement("span");
        const archiveCodes = [...new Set(entries.map(entry => entry.archive))];
        assetLabel(archiveLabel, `${label.split(" · ")[0]} (${recordsInGroup.length})`,
          archiveCodes.length < 4 ? archiveCodes.join(", ") : `${archiveCodes.length} source archives`);
        groupHeader.append(archiveLabel);
        const loadAllButton = document.createElement("button");
        loadAllButton.className = "scene-btn";
        loadAllButton.type = "button";
        loadAllButton.textContent = "Load All";
        loadAllButton.addEventListener("click", (event) => {
          event.stopPropagation();
          document.querySelectorAll(".main-view-button.active").forEach(button => button.classList.remove("active"));
          resetAssetViewerTimeToDay();
          void loadShenmue2Group(recordsInGroup, `${zone}/${label}`);
          collapseAssetViewerSidebarOnMobile();
        });
        groupHeader.appendChild(loadAllButton);
        const items = document.createElement("ul");
        items.className = "group-items hidden";
        groupHeader.addEventListener("click", () => {
          items.classList.toggle("hidden");
          groupHeader.classList.toggle("expanded");
        });
        for (const { archive, record } of entries) {
          const item = document.createElement("li");
          item.className = "model-item";
          const displayName = shenmue2RecordDisplayName(record, archive);
          assetLabel(item, displayName.split(" · ")[0], record.filename);
          item.dataset.assetSearch += ` ${displayName} ${archive}`;
          item.addEventListener("click", (event) => {
            event.stopPropagation();
            resetAssetViewerTimeToDay();
            void loadShenmue2Model(record, item);
            collapseAssetViewerSidebarOnMobile();
          });
          itemByFilename.set(record.filename, item);
          items.appendChild(item);
        }
        group.append(groupHeader, items);
        const roles = recordsInGroup.map(record => record.kind);
        const sectionLabel = /event|cutscene|additional/i.test(label) ? "Scene variants"
          : roles.every(kind => kind === "CHRM") ? "Character & object models"
            : roles.some(kind => kind === "MAPM") ? "Environment" : "Objects";
        if (sectionLabel === "Environment") categoryContent.append(group);
        else nestedBrowserSection(categoryContent, sectionLabel, sectionLabel).append(group);
      };

      const archiveEntries = [...groups.keys()].map((archive) => ({
        archive,
        records: [...groups.get(archive)].sort(compareShenmue2Records),
      })).sort(compareShenmue2Archives);
      const singletonEntries = archiveEntries.filter(
        (entry) => entry.records.length === 1,
      );
      const groupedEntries = archiveEntries.filter(
        (entry) => entry.records.length > 1,
      );
      for (const entry of groupedEntries) {
        const archive = shenmue2ArchivePresentation(entry.archive, entry.records);
        appendArchiveGroup(
          archive.label,
          entry.records.map((record) => ({ archive: entry.archive, record })),
        );
      }
      if (singletonEntries.length === 1) {
        const entry = singletonEntries[0];
        const archive = shenmue2ArchivePresentation(entry.archive, entry.records);
        appendArchiveGroup(
          archive.label,
          [{ archive: entry.archive, record: entry.records[0] }],
        );
      } else if (singletonEntries.length > 1) {
        const singletonRoles = new Map();
        for (const entry of singletonEntries) {
          const presentation = shenmue2ArchivePresentation(entry.archive, entry.records);
          if (!singletonRoles.has(presentation.role)) {
            singletonRoles.set(presentation.role, []);
          }
          singletonRoles.get(presentation.role).push(entry);
        }
        for (const [role, entries] of singletonRoles) {
          const label = role === "additional-scene"
            ? "Additional one-file scenes & interiors"
            : role === "event-set"
              ? "Standalone event & cutscene models"
              : "Other standalone assets";
          appendArchiveGroup(
            label,
            entries.map((entry) => ({
              archive: entry.archive,
              record: entry.records[0],
            })),
          );
        }
      }
      category.append(categoryHeader, categoryContent);
      typeParent.appendChild(category);
    }
    refreshBrowserSearch(modelList);
    const requestedModel = new URLSearchParams(window.location.search).get("model");
    const requestedRecord = requestedModel
      ? records.find((record) => record.filename === requestedModel)
      : null;
    if (requestedRecord) {
      expandAssetParents(itemByFilename.get(requestedRecord.filename));
      await loadShenmue2Model(
        requestedRecord,
        itemByFilename.get(requestedRecord.filename),
      );
    } else {
      setStatus(`Ready · ${records.length.toLocaleString()} Shenmue II models`);
    }
  } catch (error) {
    if (requestId !== catalogGeneration) return;
    modelList.innerHTML = "";
    modelList._browserSections = new Map();
    setStatus(`Shenmue II assets unavailable: ${error.message}`);
    console.error(error);
  }
}

export async function loadAudioCatalog() {
  const requestId = ++catalogGeneration;
  ++state.currentLoadId;
  updateGameSelector("audio");
  if (!await clearLoadedAssets() || requestId !== catalogGeneration) return;
  getModelList().innerHTML = "";
  state.singleModelMode = false;
  state.currentScenePrefix = null;
  enterAudioViewer();
  // The audio catalog owns its game-specific loading/error/retry lifecycle.
  setStatus("Ready · Choose a game and audio track");
}

export async function loadCatalog() {
  const requestId = ++catalogGeneration;
  ++state.currentLoadId;
  exitAudioViewer();
  updateGameSelector("shenmue");
  if (!await clearLoadedAssets()) return;
  await loadMetadata();
  const modelList = getModelList();
  try {
    const response = await fetchAsset("models.json");
    if (!response.ok) throw new Error("Catalog not found");
    state.allFiles = await response.json();
    if (requestId !== catalogGeneration || state.currentGame !== "shenmue") return;
    const files = state.allFiles
      .filter((f) => f.toLowerCase().endsWith(".mt5"))
      .sort();
    state.mt5Files = files;

    // Scenario-based Organization Logic
    const hierarchy = {
      s1: { title: "Yokosuka · Scenario 1", groups: {} },
      s2: { title: "Harbor · Scenario 2", groups: {} },
      s3: { title: "Later story · Scenario 3", groups: {} },
      global: { title: "Shared assets", groups: {} },
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
      } else if (file.startsWith("S3_")) {
        category = "s3";
        const parts = file.split("_");
        folderKey = parts[1]; // e.g. MA00
        folderLabel = state.mapNames[folderKey] || folderKey;
      } else if (file.startsWith("G_")) {
        category = "global";
        const parts = file.split("_");
        folderKey = parts[1]; // e.g. CHARA
        folderLabel = ({CHARA: "Character models", ITEM: "Collectibles", OBJ: "Shared objects", VENDING: "Vending machines"})[folderKey] || folderKey;
      }

      const target = hierarchy[category].groups;
      if (!target[folderKey]) {
        target[folderKey] = { label: folderLabel, files: [] };
      }
      target[folderKey].files.push(file);
    });

    modelList.innerHTML = "";
    modelList._browserSections = new Map();

    const createModelItem = (file, options = {}) => {
      const item = document.createElement("li");
      item.className = "model-item";

      // Show filename without scenario/zone prefix for list
      const parts = file.split("_");
      let displayName = parts[parts.length - 1];
      if (parts.length >= 2) {
        const midPart = parts[parts.length - 2];
        if (
          midPart.startsWith("DR")
          || midPart.startsWith("MAP")
          || midPart.startsWith("G")
        ) {
          displayName = `${midPart}_${displayName}`;
        }
      }
      const member = file.replace(/^[^_]+_[^_]+_/, "").replace(/\.MT5$/i, "");
      const characterName = file.startsWith("G_CHARA_") ? state.charNames[member] : null;
      const friendly = options.displayName || characterName
        || (/^MAP\d*$/i.test(member) ? (member === "MAP" ? "Base environment" : "Environment layer") : displayName);
      assetLabel(item, friendly, file);
      if (options.title) {
        item.title = options.title;
      }
      if (options.className) {
        item.classList.add(
          ...options.className.split(/\s+/).filter(Boolean),
        );
      }

      item.addEventListener("click", (event) => {
        event.stopPropagation();
        resetAssetViewerTimeToDay();
        document.querySelectorAll(".main-view-button.active").forEach(
          (candidate) => candidate.classList.remove("active"),
        );
        void loadModelFromUrl(file, item);
        collapseAssetViewerSidebarOnMobile();
      });
      return item;
    };

    const {section: mainViews, list: mainViewsList} = mainViewList("Shenmue");
    const interiors = browserSection("Interiors");
    const sceneVariants = browserSection("Scene variants");
    const views = [
      ...ASSET_VIEWER_MAIN_VIEWS.filter(view => !view.interior),
      ...shenmueInteriorViews(files, state.mapNames),
    ];
    for (const view of views) {
      const button = mainViewButton(view.label.replace(/^OP00 Introduction Stage$/, "Opening scene · Hazuki residence"), view.prefix);
      button.classList.toggle("active", view.prefix === DEFAULT_MAIN_VIEW_PREFIX);
      button.addEventListener("click", () => {
        if (Number.isInteger(view.initialSeasonIndex)) {
          state.currentSeason = view.initialSeasonIndex;
        }
        if (Number.isInteger(view.initialWeatherIndex)) {
          state.currentWeatherIndex = view.initialWeatherIndex;
        }
        document.querySelectorAll(".main-view-button").forEach((candidate) => {
          candidate.classList.toggle("active", candidate === button);
        });
        document.querySelectorAll(".model-item.active").forEach((candidate) => {
          candidate.classList.remove("active");
        });
        const composition = viewerComposition(view.composition);
        void loadScene(view.prefix, {
          filenames: composition?.filenames,
          includeFile: view.mapOnly
            ? (filename) => isNumberedMapModel(filename, view.prefix)
            : undefined,
          variantProfile: composition?.variantProfile,
          variantZone: composition?.source,
          composition: view.composition,
        });
        collapseAssetViewerSidebarOnMobile();
      });
      const viewParent = view.interior ? interiors.content
        : view.composition || view.prefix.startsWith("S3_") ? sceneVariants.content : mainViewsList;
      viewParent.appendChild(button);
      const components = view.components?.length ? browserSection(`${view.label} · individual components`) : null;
      if (components) viewParent.append(components.section);
      for (const component of view.components || []) {
        const componentButton = document.createElement("button");
        componentButton.className = "main-view-button main-view-component-button";
        componentButton.type = "button";
        const parts = component.label.split(" — ");
        assetLabel(componentButton, parts[1] || `Scene component · ${component.label}`, component.filename);
        componentButton.addEventListener("click", () => {
          resetAssetViewerTimeToDay();
          document.querySelectorAll(".main-view-button.active").forEach(
            candidate => candidate.classList.remove("active"),
          );
          void loadModelFromUrl(component.filename, componentButton);
          collapseAssetViewerSidebarOnMobile();
        });
        components.content.appendChild(componentButton);
      }
    }
    mainViews.append(interiors.section, sceneVariants.section);
    modelList.appendChild(mainViews);

    const collectionModelFiles = [
      ...(hierarchy.global.groups.ITEM?.files || []),
    ].filter((file) => {
      const record = collectionModelNameAudit.items[file];
      return record && record.status !== "alternate-size-model";
    }).sort((left, right) => {
      const leftName = collectionModelNameAudit.items[left]?.displayName;
      const rightName = collectionModelNameAudit.items[right]?.displayName;
      if (leftName && rightName) return leftName.localeCompare(rightName);
      if (leftName) return -1;
      if (rightName) return 1;
      return left.localeCompare(right);
    });
    if (collectionModelFiles.length > 0) {
      const namedCollectionModels = collectionModelFiles.filter(
        (file) => collectionModelNameAudit.items[file]?.displayName,
      ).length;
      const uncataloguedCollectionModels = (
        collectionModelFiles.length - namedCollectionModels
      );
      const collectionSection = document.createElement("section");
      collectionSection.className = "category-group collection-models";

      const collectionHeader = document.createElement("div");
      collectionHeader.className = "category-header";
      collectionHeader.setAttribute("role", "button");
      collectionHeader.setAttribute("tabindex", "0");
      collectionHeader.setAttribute("aria-expanded", "false");
      collectionHeader.innerHTML = (
        `<span>Collection Models (${collectionModelFiles.length})</span>`
      );
      collectionHeader.title = (
        `${collectionModelNameAudit.counts.collectionTableNames} assets have names `
        + "in Shenmue's collection table, "
        + `${collectionModelNameAudit.counts.crossReferencedNames} was cross-referenced, `
        + `${collectionModelNameAudit.counts.alternateSizeModels} alternate-size `
        + "models are omitted from this list, "
        + `and ${uncataloguedCollectionModels} GAC assets remain uncatalogued.`
      );

      const collectionList = document.createElement("ul");
      collectionList.className = "group-items collection-models-list hidden";
      for (const file of collectionModelFiles) {
        const record = collectionModelNameAudit.items[file];
        const displayName = record?.displayName;
        const crossReferenced = record?.status === "cross-referenced";
        collectionList.appendChild(createModelItem(file, {
          displayName: displayName || `Uncatalogued · ${record?.resourceCode || file}`,
          title: crossReferenced
            ? `${displayName} — ${file} (cross-referenced; not named in the executable table)`
            : displayName
              ? `${displayName} — ${file}`
            : `${file} is not referenced by Shenmue's collection-name table`,
          className: displayName
            ? `named-collection-model${
              crossReferenced ? " cross-referenced-collection-model" : ""
            }`
            : "uncatalogued-collection-model",
        }));
      }

      const toggleCollectionModels = () => {
        const expanded = collectionList.classList.toggle("hidden") === false;
        collectionHeader.classList.toggle("expanded", expanded);
        collectionHeader.setAttribute("aria-expanded", String(expanded));
      };
      collectionHeader.addEventListener("click", toggleCollectionModels);
      collectionHeader.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleCollectionModels();
        }
      });

      collectionSection.appendChild(collectionHeader);
      collectionSection.appendChild(collectionList);
      nestedBrowserSection(modelList, "objects", "Objects").appendChild(collectionSection);
    }

    // Render Hierarchy
    ["s1", "s2", "s3", "global"].forEach((catKey) => {
      const cat = hierarchy[catKey];
      const groupKeys = Object.keys(cat.groups).sort((a,b) => cat.groups[a].label.localeCompare(cat.groups[b].label));
      if (groupKeys.length === 0) return;

      const {section: catContainer, content: catContent} = browserSection(`${cat.title} (${groupKeys.length})`);

      groupKeys.forEach((gKey) => {
        const group = cat.groups[gKey];
        const groupFiles = group.files.sort();

        const groupContainer = document.createElement("div");
        groupContainer.className = "model-group";

        const header = document.createElement("div");
        header.className = "group-header";

        const folderLabel = document.createElement("span");
        assetLabel(folderLabel, `${group.label} (${groupFiles.length})`, gKey);
        header.append(folderLabel);

        const btn = document.createElement("button");
        btn.className = "scene-btn";
        btn.innerText = `Load All`;
        btn.onclick = (e) => {
          e.stopPropagation();
          resetAssetViewerTimeToDay();
          document.querySelectorAll(".main-view-button.active").forEach(
            (candidate) => candidate.classList.remove("active"),
          );
          const firstFile = groupFiles[0];
          const parts = firstFile.split("_");
          const groupPrefix = `${parts[0]}_${parts[1]}`;
          loadScene(groupPrefix);
          collapseAssetViewerSidebarOnMobile();
        };
        header.appendChild(btn);

        const itemsList = document.createElement("ul");
        itemsList.className = "group-items hidden";

        header.onclick = () => {
          itemsList.classList.toggle("hidden");
          header.classList.toggle("expanded");
        };

        groupFiles.forEach((file) => {
          const displayName = GLOBAL_MODEL_LABELS[file];
          itemsList.appendChild(createModelItem(file, {
            displayName,
            title: displayName ? `${displayName} — ${file}` : undefined,
          }));
        });

        groupContainer.appendChild(header);
        groupContainer.appendChild(itemsList);
        if (catKey === "global") {
          nestedBrowserSection(modelList, gKey === "CHARA" ? "characters" : "objects", gKey === "CHARA" ? "Characters" : "Objects").append(groupContainer);
        } else {
          const region = mapRegions[gKey] || "Other locations";
          nestedBrowserSection(catContent, region, region).append(groupContainer);
        }
      });

      if (catKey !== "global") modelList.appendChild(catContainer);
    });
    refreshBrowserSearch(modelList);
    setStatus(`Ready`);

    // Auto-load the Hazuki Residence Grounds on startup.
    await loadScene(DEFAULT_MAIN_VIEW_PREFIX);

    // Override camera to a closer default view for the initial load
    if (state.scene && state.scene.activeCamera && state.currentMeshes.length > 0) {
      let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
      let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
      state.currentMeshes.forEach((m) => {
        const b = m.getHierarchyBoundingVectors(true);
        if (b.min.x !== Infinity && !isNaN(b.min.x)) {
          min = BABYLON.Vector3.Minimize(min, b.min);
          max = BABYLON.Vector3.Maximize(max, b.max);
        }
      });
      const center = BABYLON.Vector3.Center(min, max);
      const size = BABYLON.Vector3.Distance(min, max);
      const distance = size * 0.15;
      const position = new BABYLON.Vector3(
        center.x - distance,
        center.y + distance * 0.4,
        center.z + distance,
      );
      state.scene.activeCamera.setTarget(center);
      setCameraPosition(state.scene.activeCamera, position);
    }
  } catch (err) {
    if (requestId !== catalogGeneration) return;
    setStatus("Error loading catalog");
    console.error(err);
  }
}

// Initialize sky/time and season toggle buttons
export function initToggleButtons() {
  document.getElementById("overview-view-btn").addEventListener("click", () => {
    if (state.currentMeshes.length) updateCameraSpeed(fitCameraToMeshes(state.currentMeshes));
  });
  document.getElementById("interior-view-btn").addEventListener("click", showInteriorView);
  document.getElementById("shenmue-game-btn")?.addEventListener("click", () => {
    if (state.currentGame !== "shenmue") {
      history.pushState(null, "", "?mode=shenmue");
      void loadCatalog();
    }
  });
  document.getElementById("shenmue2-game-btn")?.addEventListener("click", () => {
    if (state.currentGame !== "shenmue2") {
      history.pushState(null, "", "?mode=shenmue2");
      void loadShenmue2Catalog();
    }
  });
  document.getElementById("audio-game-btn")?.addEventListener("click", () => {
    if (state.currentGame !== "audio") {
      history.pushState(null, "", "?mode=audio");
      void loadAudioCatalog();
    }
  });

  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") || params.get("game") || "shenmue";
    if (mode === "shenmue2" && state.currentGame !== "shenmue2") {
      void loadShenmue2Catalog();
    } else if (mode === "audio" && state.currentGame !== "audio") {
      void loadAudioCatalog();
    } else if (mode === "audio") {
      syncAudioGameFromUrl();
    } else if (mode === "shenmue" && state.currentGame !== "shenmue") {
      void loadCatalog();
    }
  });

  const skyBtn = document.getElementById("sky-btn");
  if (skyBtn) {
    skyBtn.onclick = async () => {
      state.currentTimeOfDay = (state.currentTimeOfDay + 1) % timeOfDayPresets.length;
      applyTimeOfDay(state.currentTimeOfDay);
      updateModelVisibility();

      // Reload scene with new time-of-day textures if a scene is loaded
      if (state.currentScenePrefix) {
        const cam = state.scene.activeCamera;
        const savedView = {
          alpha: cam.alpha,
          beta: cam.beta,
          radius: cam.radius,
          target: cam.target.clone(),
        };
        const composition = viewerComposition(state.currentSceneComposition);
        await loadScene(state.currentScenePrefix, {
          filenames: composition?.filenames,
          variantProfile: composition?.variantProfile,
          variantZone: composition?.source,
          composition: state.currentSceneComposition,
        });
        cam.alpha = savedView.alpha;
        cam.beta = savedView.beta;
        cam.radius = savedView.radius;
        cam.target.copyFrom(savedView.target);
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
        const savedView = {
          alpha: cam.alpha,
          beta: cam.beta,
          radius: cam.radius,
          target: cam.target.clone(),
        };
        const composition = viewerComposition(state.currentSceneComposition);
        await loadScene(state.currentScenePrefix, {
          filenames: composition?.filenames,
          variantProfile: composition?.variantProfile,
          variantZone: composition?.source,
          composition: state.currentSceneComposition,
        });
        cam.alpha = savedView.alpha;
        cam.beta = savedView.beta;
        cam.radius = savedView.radius;
        cam.target.copyFrom(savedView.target);
      } else {
        updateModelVisibility();
      }
    };
  }
}

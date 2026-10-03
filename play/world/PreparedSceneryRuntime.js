import {loadSceneryBundle, SCENERY_BUNDLE_SCHEMA} from "../../src/rendering/PreparedSceneryBundle.js";
import {readSceneResource, runSceneLoad} from "../../src/rendering/SceneAssets.js";
import {updateModelVisibility} from "../../src/variants.js";
import {auditFixedSceneryPlacements, sceneryPlacementId} from "../../tools/assets/scenery-placement-policy.js";
import {ScheduledSceneObjectCatalog} from "./ScheduledSceneObjectCatalog.js";
import {preparedSceneryKey, preparedScenerySpec} from "./PreparedSceneryPlan.js";
import {fetchAsset, fetchShenmue2Catalog} from "../../src/assetLoader.js";

const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

/** Prepared local scenery; all remaining world owners use the ordinary loader. */
export class PreparedSceneryRuntime {
  constructor(state, {baseUrl = "/scenery-output", allowMissing = false} = {}) {
    this.state = state;
    this.baseUrl = baseUrl;
    this.allowMissing = allowMissing;
  }

  supports(world) { return preparedSceneryKey(world) !== null; }

  async read(path, signal, {allowMissing = false} = {}) {
    return readSceneResource(async () => {
      const response = await fetch(path, {signal, cache: "no-store"});
      if (allowMissing && response.status === 404) return null;
      if (!response.ok) throw new Error(`Prepared scenery request failed (${response.status}): ${path}`);
      return response.arrayBuffer();
    }, {signal});
  }

  async plan(world, signal) {
    const key = preparedSceneryKey(world);
    const bytes = await this.read(`${this.baseUrl}/${key}/world.json`, signal, {allowMissing: this.allowMissing});
    // Fresh checkouts need not have compiled bundles. Only an absent manifest
    // selects the original loader; stale inputs, corrupt data and missing binary
    // payloads must remain visible errors instead of masking a broken build.
    if (bytes === null) {
      console.info(`[Scenery:${key}] No bundle; loading original assets. Build with npm run build:scenery -- ${key}`);
      return null;
    }
    const manifest = JSON.parse(new TextDecoder().decode(bytes));
    if (manifest.schema !== SCENERY_BUNDLE_SCHEMA || manifest.provenance?.key !== key) {
      throw new Error(`Rebuild the local ${key} scenery bundle before loading this world`);
    }
    const allFiles = await readSceneResource(async () => {
      if (world.assetFormat === "MT7") return fetchShenmue2Catalog();
      const response = await fetchAsset("models.json");
      if (!response.ok) throw new Error(`Model catalog request failed (${response.status})`);
      return response.json();
    }, {signal});
    const spec = preparedScenerySpec(world, allFiles);
    if (JSON.stringify(manifest.provenance.contract) !== JSON.stringify(spec.contract)) {
      throw new Error(`Prepared world definition changed; rebuild the bundle: ${key}`);
    }
    if (world.assetFormat !== "MT7") {
      this.state.allFiles = allFiles;
      this.state.mt5Files = allFiles.filter(file => /\.mt5$/i.test(file));
    }
    const documents = [];
    for (const file of spec.policyFiles) {
      const bytes = await this.read(`/${file}`, signal);
      if (manifest.provenance.sources.find(row => row.file === file)?.hash !== await hash(bytes)) {
        throw new Error(`Prepared scenery input changed; rebuild the bundle: ${file}`);
      }
      documents.push(JSON.parse(new TextDecoder().decode(bytes)));
    }
    const included = new Set();
    if (spec.policyFiles.length) {
      const [, scheduled, fixtures] = documents;
      // Recheck the actual gameplay placements, including any route enrichment.
      const audit = auditFixedSceneryPlacements(world.placements,
        new ScheduledSceneObjectCatalog(scheduled).definitions(world.id), fixtures);
      if (JSON.stringify(audit) !== JSON.stringify(manifest.provenance.placements)) {
        throw new Error("Gameplay placement ownership changed; rebuild the scenery bundle");
      }
      for (const row of audit.rows) if (row.included) included.add(row.id);
    }
    const models = spec.models;
    if (JSON.stringify(manifest.templates.map(row => row.model)) !== JSON.stringify(models)) {
      throw new Error("Prepared model coverage changed; rebuild the scenery bundle");
    }
    if (JSON.stringify(manifest.hierarchies.map(row => row.model)) !== JSON.stringify(spec.ownership?.hierarchyFilenames || [])) {
      throw new Error("Prepared resident hierarchy coverage changed; rebuild the scenery bundle");
    }
    return {manifest, spec, models: new Set(models), placements: world.placements.filter(row => !included.has(sceneryPlacementId(row)))};
  }

  async load({world, composition, manifest, signal, additionalProgressTotal, onProgress}) {
    const state = this.state;
    return runSceneLoad(state, {signal}, async cancelled => {
      onProgress({loaded: 0, total: additionalProgressTotal + 1});
      const bytes = new Uint8Array(await this.read(`${this.baseUrl}/${preparedSceneryKey(world)}/world.bin`, signal));
      if (cancelled()) return false;
      const bundle = await loadSceneryBundle(state.scene, manifest, bytes, {signal});
      if (cancelled()) { bundle.dispose(); return false; }
      state.preparedSceneryResources = bundle;
      state.currentMeshes = [...bundle.roots];
      state.singleModelMode = false;
      // Match loadMt7Scene: MT7's authoritative timed-layer owner runs later.
      // A legacy currentZone would also let MT5 variants alter those roots on
      // subsequent clock/weather changes, not just during initial loading.
      state.currentZone = world.assetFormat === "MT7" ? null : manifest.provenance.contract.zone;
      state.currentScenePrefix = world.assetFormat === "MT7" ? null : world.prefix;
      state.currentSceneComposition = world.assetFormat === "MT7" ? null : composition;
      state.currentVariantProfile = manifest.provenance.contract.variantProfile || null;
      // MT7 day/night layers belong to WorldMapLayerState, not MT5 variants.
      if (world.assetFormat !== "MT7") updateModelVisibility(state);
      onProgress({loaded: 1, total: additionalProgressTotal + 1});
      return true;
    });
  }
}

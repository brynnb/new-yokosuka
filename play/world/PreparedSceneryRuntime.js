import {loadSceneryBundle, SCENERY_BUNDLE_SCHEMA} from "../../src/rendering/PreparedSceneryBundle.js";
import {readSceneResource, runSceneLoad} from "../../src/rendering/SceneAssets.js";
import {updateModelVisibility} from "../../src/variants.js";
import {auditFixedSceneryPlacements, sceneryPlacementId} from "../../tools/assets/scenery-placement-policy.js";
import {ScheduledSceneObjectCatalog} from "./ScheduledSceneObjectCatalog.js";

const POLICY_FILES = ["play/data/d000-runtime-placements.json",
  "play/data/shenmue1-scheduled-scene-objects.json", "tools/evidence/d000-static-fixtures.json"];
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

/** Local opt-in adapter; all remaining world owners use the ordinary loader. */
export class PreparedSceneryRuntime {
  constructor(state, {baseUrl = "/scenery-output"} = {}) {
    this.state = state;
    this.baseUrl = baseUrl;
  }

  supports(world) { return world.id === "dobuita" && world.sceneComposition === "D000"; }

  async read(path, signal) {
    return readSceneResource(async () => {
      const response = await fetch(path, {signal, cache: "no-store"});
      if (!response.ok) throw new Error(`Prepared scenery request failed (${response.status}): ${path}`);
      return response.arrayBuffer();
    }, {signal});
  }

  async plan(world, signal) {
    const manifest = JSON.parse(new TextDecoder().decode(await this.read(`${this.baseUrl}/world.json`, signal)));
    if (manifest.schema !== SCENERY_BUNDLE_SCHEMA || manifest.provenance?.area !== "D000") {
      throw new Error("Rebuild the local Dobuita scenery bundle before testing /play");
    }
    const documents = [];
    for (const file of POLICY_FILES) {
      const bytes = await this.read(`/${file}`, signal);
      if (manifest.provenance.sources.find(row => row.file === file)?.hash !== await hash(bytes)) {
        throw new Error(`Prepared scenery input changed; rebuild the bundle: ${file}`);
      }
      documents.push(JSON.parse(new TextDecoder().decode(bytes)));
    }
    const [, scheduled, fixtures] = documents;
    // Recheck the actual gameplay placements, including any route enrichment.
    const audit = auditFixedSceneryPlacements(world.placements,
      new ScheduledSceneObjectCatalog(scheduled).definitions(world.id), fixtures);
    if (JSON.stringify(audit) !== JSON.stringify(manifest.provenance.placements)) {
      throw new Error("Gameplay placement ownership changed; rebuild the scenery bundle");
    }
    const included = new Set(audit.rows.filter(row => row.included).map(row => row.id));
    return {manifest, placements: world.placements.filter(row => !included.has(sceneryPlacementId(row)))};
  }

  async load({world, composition, manifest, signal, additionalProgressTotal, onProgress}) {
    const state = this.state;
    return runSceneLoad(state, {signal}, async cancelled => {
      onProgress({loaded: 0, total: additionalProgressTotal + 1});
      const bytes = new Uint8Array(await this.read(`${this.baseUrl}/world.bin`, signal));
      if (cancelled()) return false;
      const bundle = await loadSceneryBundle(state.scene, manifest, bytes, {signal});
      if (cancelled()) { bundle.dispose(); return false; }
      state.preparedSceneryResources = bundle;
      state.currentMeshes = bundle.roots;
      state.singleModelMode = false;
      state.currentZone = composition.source;
      state.currentScenePrefix = world.prefix;
      state.currentSceneComposition = composition;
      state.currentVariantProfile = composition.variantProfile;
      updateModelVisibility(state);
      onProgress({loaded: 1, total: additionalProgressTotal + 1});
      return true;
    });
  }
}

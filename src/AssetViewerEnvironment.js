import { NativeSceneLighting } from "./rendering/NativeSceneLighting.js";
import { WorldMapLayerState } from "./rendering/WorldMapLayerState.js";
import { sceneEnvironmentProfile } from "./rendering/SceneEnvironmentProfiles.js";
import { createGlobalWater, applyGlobalWaterTimeOfDay, disposeGlobalWater } from "./GlobalWater.js";

// Viewer controls supply a fixed preview time. The lighting, layer evaluation
// and water implementations are the same ones used by the playable world.
export class AssetViewerEnvironment {
  constructor(state) {
    this.state = state;
    this.lighting = new NativeSceneLighting({
      scene: state.scene,
      getActorPosition: () => state.scene.activeCamera?.position,
    });
    this.layers = new WorldMapLayerState();
    this.water = null;
    this.world = null;
    this.lastPreset = null;
    this.observer = state.scene.onBeforeRenderObservable.add(() => this.update());
    state.scene.onDisposeObservable.addOnce(() => this.dispose());
  }

  date() {
    // Representative hours inside the existing four lighting presets.
    return new Date(Date.UTC(1986, 11, 3, [12, 18, 20, 22][this.state.currentTimeOfDay] ?? 12));
  }

  async load({prefix = this.state.currentScenePrefix, area = this.state.currentZone} = {}) {
    this.clear();
    if (this.state.singleModelMode) return;
    this.world = sceneEnvironmentProfile({
      prefix, area, game: this.state.currentGame, interior: this.state.isInteriorScene,
    });
    this.layers.load(this.world, this.state.currentMeshes, this.date());
    const preparing = this.lighting.create(this.world);
    if (Number.isFinite(this.world.waterHeight)) {
      this.water = createGlobalWater(this.state.scene, {height: this.world.waterHeight});
    }
    this.update(true);
    await preparing;
  }

  update(force = false) {
    if (!this.world) return;
    this.lighting.update();
    const preset = this.state.currentTimeOfDay;
    if (!force && preset === this.lastPreset) return;
    this.lastPreset = preset;
    this.layers.update(this.date(), true);
    applyGlobalWaterTimeOfDay(this.water, {fromIndex: preset, toIndex: preset, progress: 0});
  }

  clear() {
    disposeGlobalWater(this.water);
    this.water = null;
    this.lighting.clear();
    this.layers.clear();
    this.world = null;
    this.lastPreset = null;
  }

  dispose() {
    this.clear();
    this.state.scene.onBeforeRenderObservable.remove(this.observer);
  }
}

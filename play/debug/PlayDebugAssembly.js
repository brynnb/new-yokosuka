import { OUTDOOR_BOUNDARY_TRANSITIONS } from "../../src/BoundaryTransitions.js";
import {
  forkliftPhysicsTuningFromControls,
} from "../forklift/ForkliftTuningControls.js";
import { CollisionDebugger } from "./CollisionDebugger.js";
import { CollisionPicker } from "./CollisionPicker.js";
import { DebugPanel } from "../ui/DebugPanel.js";
import { LightDebugger } from "./LightDebugger.js";
import { TrianglePicker } from "./TrianglePicker.js";

export class PlayDebugAssembly {
  constructor({
    scene,
    dom,
    enabled,
    getActorPosition,
    getReferenceTargetMeshes,
    refreshLightTargets,
    getSkybox,
    getWorld,
    getArcadeGames,
    getPlayerCollider,
    getWorldEnvironment,
    synchronizeWorldTime,
    refreshLoadingDateTime,
    setRunSpeedMultiplier,
    playerPersistence,
    getScheduledActorNetworkState,
    getPoolRuntime,
    getForkliftMode,
    persistPhysicsTuning,
    scriptScenarios,
    applyScriptScenario,
    resetScriptScenario,
    getCutsceneDirector,
  }) {
    this.dom = dom;
    this.light = new LightDebugger({
      scene,
      dom,
      enabled,
      getActorPosition,
      getReferenceTargetMeshes,
      refreshLightTargets,
    });
    let collisionPicker = null;
    this.triangle = new TrianglePicker({
      scene,
      dom,
      enabled,
      getSkybox,
      getWorld,
      onActivate: () => {
        collisionPicker?.setActive(false);
        const games = getArcadeGames();
        if (games?.active) games.close();
        if (dom.showCollisions.checked) {
          dom.showCollisions.checked = false;
          dom.tintCollisions.checked = false;
          dom.tintCollisions.disabled = true;
          this.collisions.setVisible(false);
        }
        if (dom.showLights.checked) {
          dom.showLights.checked = false;
          this.light.setVisible(false);
        }
      },
    });
    this.collisions = new CollisionDebugger({
      scene,
      dom,
      enabled,
      getWorldId: () => getWorld().id,
      getPlayerCollider,
      boundaryTransitions: OUTDOOR_BOUNDARY_TRANSITIONS,
    });
    collisionPicker = new CollisionPicker({
      scene,
      dom,
      enabled,
      getSkybox,
      getWorld,
      onActivate: () => {
        this.triangle.setActive(false);
        const games = getArcadeGames();
        if (games?.active) games.close();
        if (dom.showLights.checked) {
          dom.showLights.checked = false;
          this.light.setVisible(false);
        }
        dom.showCollisions.checked = true;
        dom.tintCollisions.disabled = false;
        this.collisions.setVisible(true);
      },
    });
    this.collisionPicker = collisionPicker;
    this.panel = new DebugPanel({
      dom,
      enabled,
      trianglePicker: this.triangle,
      collisionPicker,
      collisionDebugger: this.collisions,
      lightDebugger: this.light,
      onTimeOfDay: hour => {
        getWorldEnvironment().setDebugHour(hour);
        synchronizeWorldTime();
      },
      onServerTimeOfDay: async hour => {
        const updated = await getWorldEnvironment().setServerGameHour(hour);
        if (updated) {
          synchronizeWorldTime();
          refreshLoadingDateTime();
        }
        return updated;
      },
      onLiveClock: () => {
        getWorldEnvironment().setDebugHour(null);
        synchronizeWorldTime();
      },
      onRunSpeed: setRunSpeedMultiplier,
      persistRunSpeed: multiplier => (
        playerPersistence.saveDebugRunSpeed(multiplier)
      ),
      onNpcWalkSpeed: multiplier => (
        getScheduledActorNetworkState().setWalkingSpeedMultiplier(multiplier)
      ),
      persistNpcWalkSpeed: multiplier => (
        playerPersistence.saveDebugNpcWalkSpeed(multiplier)
      ),
      onDownloadPoolReflection: () => (
        getPoolRuntime()?.downloadRoomReflectionPanorama()
      ),
      onPhysicsTuning: values => {
        getForkliftMode().physicsTuning = forkliftPhysicsTuningFromControls(values);
      },
      persistPhysicsTuning,
      scriptScenarios,
      onApplyScriptScenario: applyScriptScenario,
      onResetScriptScenario: resetScriptScenario,
      onCutscenePauseToggle: () => getCutsceneDirector()?.togglePaused() || false,
      onCutsceneSkip: seconds => getCutsceneDirector()?.seekBySeconds(seconds) || false,
    });
  }

}

import * as BABYLON from "@babylonjs/core";
import { createLights } from "../src/lighting.js";
import { createSceneLoaders } from "../src/rendering/SceneResources.js";
import state from "../src/state.js";
import { MenuBackgroundScene } from "./account/MenuBackgroundScene.js";
import { GraphicsSettingsRuntime } from "../src/rendering/GraphicsSettingsRuntime.js";

export class PlaySceneRuntime {
  constructor({ dom, graphicsPreferences }) {
    this.dom = dom;
    this.graphicsPreferences = graphicsPreferences;
    this.menuBackgroundDisposed = false;

    // Selectable anti-aliasing is applied to the render target. Keeping the
    // canvas single-sampled lets Off and FXAA also remove the back-buffer cost.
    this.engine = new BABYLON.Engine(dom.canvas, false, {
      preserveDrawingBuffer: true,
      stencil: true,
      deterministicLockstep: true,
      lockstepMaxSteps: 8,
      timeStep: 1 / 60,
    });
    this.menuBackground = new MenuBackgroundScene({
      engine: this.engine,
      canvas: dom.canvas,
    });
    this.menuBackground.start();

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.4, 0.6, 0.9, 1);
    this.scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    this.camera = new BABYLON.UniversalCamera(
      "third_person_camera",
      new BABYLON.Vector3(0, 1.2, -3.2),
      this.scene,
    );
    // 10,000 still contains the 8,192-unit water plane without sacrificing
    // depth precision for surfaces separated by only millimetres.
    this.camera.minZ = 0.25;
    this.camera.maxZ = 10000;
    this.scene.activeCamera = this.camera;
    this.graphics = new GraphicsSettingsRuntime({
      engine: this.engine,
      scene: this.scene,
      camera: this.camera,
      preferences: graphicsPreferences,
    });

    state.canvas = dom.canvas;
    state.engine = this.engine;
    state.scene = this.scene;
    Object.assign(state, createSceneLoaders(this.scene, {
      generateMipMaps: () => graphicsPreferences.getState().mipmaps,
    }));
    Object.assign(state, {
      currentMeshes: [],
      currentLoadId: 0,
      currentSkybox: null,
      currentTimeOfDay: 0,
      currentSeason: 0,
      currentWeather: "clear",
      currentWeatherIndex: 0,
      isInteriorScene: false,
      currentZone: null,
      currentScenePrefix: null,
      currentSceneComposition: null,
      currentVariantProfile: null,
      singleModelMode: false,
      allFiles: [],
      mt5Files: [],
      texturePacks: new Map(),
    });
    createLights(this.scene);

    this.actorRoot = new BABYLON.TransformNode("ryo_actor_root", this.scene);
    this.forkliftChassisPose = new BABYLON.TransformNode(
      "local_forklift_chassis_pose",
      this.scene,
    );
    this.forkliftChassisPose.parent = this.actorRoot;
    this.forkliftChassisPose.rotationQuaternion = BABYLON.Quaternion.Identity();
    this.modelOffset = new BABYLON.TransformNode("ryo_model_offset", this.scene);
    this.modelOffset.parent = this.actorRoot;
    this.modelOffset.rotation.y = Math.PI;
    this.combatEnemyRoot = new BABYLON.TransformNode(
      "combat_enemy_root",
      this.scene,
    );
    this.combatEnemyModelOffset = new BABYLON.TransformNode(
      "combat_enemy_model_offset",
      this.scene,
    );
    this.combatEnemyModelOffset.parent = this.combatEnemyRoot;
    this.combatEnemyModelOffset.rotation.y = Math.PI;
  }

  disposeMenuBackground() {
    if (this.menuBackgroundDisposed) return false;
    this.menuBackgroundDisposed = true;
    this.menuBackground.dispose();
    return true;
  }

  dispose() {
    this.graphics.dispose();
  }
}

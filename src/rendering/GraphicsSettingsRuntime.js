import * as BABYLON from "@babylonjs/core";

export function antiAliasingConfiguration(value, maximumSamples = 4) {
  const maximum = Math.max(1, Number(maximumSamples) || 1);
  if (value === "fxaa") return { fxaa: true, samples: 1 };
  if (value === "msaa2") {
    return { fxaa: false, samples: Math.min(2, maximum) };
  }
  if (value === "msaa4") {
    return { fxaa: false, samples: Math.min(4, maximum) };
  }
  return { fxaa: false, samples: 1 };
}

export function anisotropyForTextureFiltering(value, maximum = 8) {
  const requested = value === "high" ? 8 : value === "balanced" ? 4 : 1;
  return Math.max(1, Math.min(requested, Number(maximum) || 1));
}

export class GraphicsSettingsRuntime {
  constructor({ engine, scene, camera, preferences }) {
    this.engine = engine;
    this.scene = scene;
    this.preferences = preferences;
    this.maximumAnisotropy = engine.getCaps().maxAnisotropy || 1;
    this.mipmapSamplingModes = new WeakMap();
    this.pipeline = new BABYLON.DefaultRenderingPipeline(
      "game_graphics_pipeline",
      false,
      scene,
      [camera],
    );
    this.camera = camera;
    this.cameraObserver = scene.onActiveCameraChanged.add(() => {
      const next = scene.activeCamera;
      if (!next || next === this.camera) return;
      this.pipeline.removeCamera(this.camera);
      this.pipeline.addCamera(next);
      this.camera = next;
    });
    this.textureFiltering = preferences.getState().textureFiltering;
    this.mipmaps = preferences.getState().mipmaps;
    this.textureObserver = scene.onNewTextureAddedObservable.add((texture) => {
      this.#applyMipmaps(texture);
      this.#applyTextureFiltering(texture);
    });
    this.unsubscribe = preferences.subscribe((state) => this.apply(state));
    this.apply(preferences.getState());
  }

  apply(state) {
    const antiAliasing = antiAliasingConfiguration(
      state.antiAliasing,
      this.engine.getCaps().maxMSAASamples,
    );
    this.pipeline.samples = antiAliasing.samples;
    this.pipeline.fxaaEnabled = antiAliasing.fxaa;
    this.textureFiltering = state.textureFiltering;
    this.mipmaps = state.mipmaps;
    for (const texture of this.scene.textures) {
      this.#applyMipmaps(texture);
      this.#applyTextureFiltering(texture);
    }
  }

  dispose() {
    this.scene.onActiveCameraChanged.remove(this.cameraObserver);
    this.unsubscribe?.();
    if (this.textureObserver) {
      this.scene.onNewTextureAddedObservable.remove(this.textureObserver);
    }
    this.pipeline.dispose();
  }

  #applyTextureFiltering(texture) {
    if (
      !texture
      || texture.isRenderTarget
      || !("anisotropicFilteringLevel" in texture)
    ) {
      return;
    }
    texture.anisotropicFilteringLevel = anisotropyForTextureFiltering(
      this.mipmaps ? this.textureFiltering : "performance",
      this.maximumAnisotropy,
    );
  }

  #applyMipmaps(texture) {
    if (!texture || typeof texture.updateSamplingMode !== "function") return;
    if (!this.mipmaps) {
      if (!this.mipmapSamplingModes.has(texture)) {
        this.mipmapSamplingModes.set(texture, texture.samplingMode);
      }
      texture.updateSamplingMode(BABYLON.Texture.BILINEAR_SAMPLINGMODE);
      return;
    }
    const samplingMode = this.mipmapSamplingModes.get(texture);
    if (samplingMode === undefined) return;
    texture.updateSamplingMode(samplingMode);
    this.mipmapSamplingModes.delete(texture);
  }
}

import * as BABYLON from "@babylonjs/core";

import { WORLD_WEATHER_NAMES } from "./WorldClock.js";

const CAMERA_CUT_DISTANCE = 4;
const PREWARM_STEP_OFFSET = 10;
const PREWARM_CYCLES = Object.freeze({
  rain: 18,
  snow: 140,
});
const SURFACE_GRID_SIZE = 1;
const SURFACE_PADDING = 0.03;

function normalizeWeather(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return WORLD_WEATHER_NAMES.includes(normalized) ? normalized : "clear";
}

function precipitationOccluder(mesh) {
  return Boolean(
    mesh?.isPickable
    && mesh.isEnabled?.()
    && mesh.isVisible !== false
    && mesh.visibility !== 0
    && mesh.metadata?.weatherOccluder !== false
    && mesh.metadata?.cameraBlocker === true
  );
}

function physicalMeshes(roots) {
  const meshes = [];
  for (const root of roots || []) {
    if (root?.isEnabled?.() === false) continue;
    for (const mesh of [root, ...(root?.getDescendants?.(false) || [])]) {
      if (
        precipitationOccluder(mesh)
        && typeof mesh.getTotalVertices === "function"
        && mesh.getTotalVertices() > 0
      ) {
        meshes.push(mesh);
      }
    }
  }
  return meshes;
}

function particleTexture(scene, weather) {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const dx = x - (size - 1) / 2;
      const dy = y - (size - 1) / 2;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const alpha = weather === "rain"
        ? (Math.abs(dx) < 1.5 ? 210 : 0)
        : Math.max(0, Math.round(255 * (1 - distance / 4)));
      data[offset] = weather === "rain" ? 190 : 255;
      data[offset + 1] = weather === "rain" ? 210 : 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = BABYLON.RawTexture.CreateRGBATexture(
    data,
    size,
    size,
    scene,
    false,
    false,
    BABYLON.Texture.NEAREST_SAMPLINGMODE,
  );
  texture.name = `world-weather-${weather}`;
  texture.hasAlpha = true;
  return texture;
}

function configureSnow(particles) {
  particles.emitRate = 780;
  // The slowest flakes emitted from the top of the box still travel more
  // than five metres below the camera before expiring. This keeps downhill
  // terrain inside the snowfall volume instead of exposing a clear band.
  particles.minLifeTime = 12;
  particles.maxLifeTime = 14;
  particles.minSize = 0.035;
  particles.maxSize = 0.11;
  particles.minAngularSpeed = -1.5;
  particles.maxAngularSpeed = 1.5;
  particles.gravity = new BABYLON.Vector3(0.08, -0.18, 0.03);
  particles.createBoxEmitter(
    new BABYLON.Vector3(-0.22, -0.9, -0.18),
    new BABYLON.Vector3(0.22, -0.55, 0.18),
    new BABYLON.Vector3(-16, 7, -16),
    new BABYLON.Vector3(16, 12, 16),
  );
}

function configureRain(particles) {
  particles.emitRate = 700;
  particles.minLifeTime = 1.1;
  particles.maxLifeTime = 1.8;
  particles.minSize = 0.025;
  particles.maxSize = 0.055;
  particles.minScaleY = 5;
  particles.maxScaleY = 9;
  particles.gravity = new BABYLON.Vector3(0.2, -5.5, 0.08);
  particles.createBoxEmitter(
    new BABYLON.Vector3(0.05, -5.2, 0.02),
    new BABYLON.Vector3(0.25, -4.5, 0.12),
    new BABYLON.Vector3(-14, 7, -14),
    new BABYLON.Vector3(14, 10, 14),
  );
}

function applyWeatherFog(scene, weather) {
  if (weather === "clear") {
    scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
    return;
  }
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  if (weather === "rain") {
    scene.fogDensity = 0.0022;
    scene.fogColor = new BABYLON.Color3(0.34, 0.39, 0.45);
  } else if (weather === "snow") {
    scene.fogDensity = 0.0011;
    scene.fogColor = new BABYLON.Color3(0.63, 0.68, 0.73);
  } else {
    scene.fogDensity = 0.0014;
    scene.fogColor = new BABYLON.Color3(0.48, 0.53, 0.59);
  }
}

export class WorldWeatherRuntime {
  constructor({
    scene,
    cameraCutDistance = CAMERA_CUT_DISTANCE,
  }) {
    if (!scene) throw new TypeError("world weather requires a Babylon scene");
    if (!Number.isFinite(cameraCutDistance) || cameraCutDistance <= 0) {
      throw new TypeError("world weather camera cut distance must be positive");
    }
    this.scene = scene;
    this.cameraCutDistanceSquared = cameraCutDistance * cameraCutDistance;
    this.weather = "clear";
    this.emitter = null;
    this.particles = null;
    this.openSkyEmitRate = 0;
    this.texture = null;
    this.observer = null;
    this.lastCameraPosition = null;
    this.occluders = [];
    this.surfaceCache = new Map();
    this.surfaceGeneration = 0;
    this.surfaceRayTop = 1;
    this.surfaceRayLength = 2;
  }

  cameraPosition() {
    const camera = this.scene.activeCamera;
    return camera?.parent
      ? camera.getAbsolutePosition?.()
      : camera?.position;
  }

  setOccluders(roots) {
    this.occluders = physicalMeshes(roots);
    let minimumY = Infinity;
    let maximumY = -Infinity;
    for (const mesh of this.occluders) {
      mesh.computeWorldMatrix?.(true);
      const box = mesh.getBoundingInfo?.().boundingBox;
      if (!box) continue;
      minimumY = Math.min(minimumY, box.minimumWorld.y);
      maximumY = Math.max(maximumY, box.maximumWorld.y);
    }
    if (Number.isFinite(minimumY) && Number.isFinite(maximumY)) {
      this.surfaceRayTop = maximumY + 1;
      this.surfaceRayLength = Math.max(2, maximumY - minimumY + 2);
    } else {
      this.surfaceRayTop = 1;
      this.surfaceRayLength = 2;
    }
    this.surfaceCache.clear();
    this.surfaceGeneration += 1;
    return this.occluders.length;
  }

  surfaceHeightAt(position, particle = null) {
    if (!position || this.occluders.length === 0) return null;
    const cellX = Math.floor(position.x / SURFACE_GRID_SIZE);
    const cellZ = Math.floor(position.z / SURFACE_GRID_SIZE);
    const metadata = particle?.metadata;
    if (
      metadata?.weatherSurfaceGeneration === this.surfaceGeneration
      && metadata.weatherSurfaceCellX === cellX
      && metadata.weatherSurfaceCellZ === cellZ
    ) {
      return metadata.weatherSurfaceY;
    }

    const key = `${cellX}:${cellZ}`;
    let surfaceY;
    if (this.surfaceCache.has(key)) {
      surfaceY = this.surfaceCache.get(key);
    } else {
      const ray = new BABYLON.Ray(
        new BABYLON.Vector3(
          (cellX + 0.5) * SURFACE_GRID_SIZE,
          this.surfaceRayTop,
          (cellZ + 0.5) * SURFACE_GRID_SIZE,
        ),
        BABYLON.Vector3.Down(),
        this.surfaceRayLength,
      );
      const hit = ray.intersectsMeshes(this.occluders, false)[0];
      surfaceY = hit?.pickedPoint?.y ?? null;
      this.surfaceCache.set(key, surfaceY);
    }
    if (particle) {
      particle.metadata = {
        ...(metadata || {}),
        weatherSurfaceGeneration: this.surfaceGeneration,
        weatherSurfaceCellX: cellX,
        weatherSurfaceCellZ: cellZ,
        weatherSurfaceY: surfaceY,
      };
    }
    return surfaceY;
  }

  configureSurfaceCollisions() {
    const particles = this.particles;
    const emitterType = particles?.particleEmitterType;
    if (!particles || !emitterType) return false;

    particles.startPositionFunction = (
      worldMatrix,
      position,
      particle,
      isLocal,
    ) => {
      emitterType.startPositionFunction(
        worldMatrix,
        position,
        particle,
        isLocal,
      );
      const surfaceY = this.surfaceHeightAt(position, particle);
      // A particle randomly created beneath a roof never came through that
      // roof. Move it just above the physical surface so it cannot flash for
      // one frame inside before the normal update retires it.
      if (Number.isFinite(surfaceY) && position.y <= surfaceY) {
        position.y = surfaceY + SURFACE_PADDING;
      }
    };

    const updateParticles = particles.updateFunction;
    particles.updateFunction = liveParticles => {
      updateParticles(liveParticles);
      for (const particle of liveParticles) {
        const surfaceY = this.surfaceHeightAt(particle.position, particle);
        if (
          Number.isFinite(surfaceY)
          && particle.position.y <= surfaceY + SURFACE_PADDING
        ) {
          particle.age = particle.lifeTime;
          particle.color.a = 0;
        }
      }
    };
    return true;
  }

  followCamera(position) {
    if (!position || !this.emitter) return false;
    const previous = this.lastCameraPosition;
    const delta = previous ? position.subtract(previous) : null;
    const cameraCut = Boolean(
      delta && delta.lengthSquared() >= this.cameraCutDistanceSquared
    );
    this.emitter.position.copyFrom(position);
    this.emitter.computeWorldMatrix?.(true);
    if (previous) previous.copyFrom(position);
    else this.lastCameraPosition = position.clone();

    // CPU particles normally remain in world space when their emitter moves.
    // That is correct for a travelling gameplay camera, but a cut would leave
    // the populated weather volume at the previous shot for many seconds.
    // Move the already-settled volume only across a discontinuous camera jump.
    if (cameraCut) {
      for (const particle of this.particles?.particles || []) {
        particle.position.addInPlace(delta);
      }
    }
    return cameraCut;
  }

  seedPrecipitation() {
    if (!this.particles) return false;
    this.followCamera(this.cameraPosition());
    this.particles.reset();
    this.particles.emitRate = this.openSkyEmitRate;
    this.particles.preWarmStepOffset = PREWARM_STEP_OFFSET;
    this.particles.preWarmCycles = PREWARM_CYCLES[this.weather] || 0;
    this.particles.start();
    // A later ordinary start should not unexpectedly perform the expensive
    // fill. Exiting cover explicitly calls this method when reseeding is needed.
    this.particles.preWarmCycles = 0;
    return true;
  }

  apply(value) {
    const weather = normalizeWeather(value);
    const precipitation = weather === "snow" || weather === "rain";
    if (
      weather === this.weather
      && (precipitation ? Boolean(this.particles) : !this.particles)
    ) {
      return false;
    }
    this.clear();
    this.weather = weather;
    applyWeatherFog(this.scene, weather);
    if (!precipitation) return true;

    this.emitter = new BABYLON.TransformNode("world_weather_emitter", this.scene);
    this.texture = particleTexture(this.scene, weather);
    this.particles = new BABYLON.ParticleSystem(
      `world_weather_${weather}`,
      // 780 flakes/second * 14 seconds = 10,920 possible live flakes.
      // Keep enough capacity that the extended vertical volume stays dense.
      weather === "rain" ? 1200 : 11000,
      this.scene,
    );
    this.particles.particleTexture = this.texture;
    this.particles.emitter = this.emitter;
    this.particles.color1 = new BABYLON.Color4(1, 1, 1, 0.88);
    this.particles.color2 = new BABYLON.Color4(0.82, 0.9, 1, 0.72);
    this.particles.colorDead = new BABYLON.Color4(0.8, 0.88, 1, 0);
    this.particles.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    if (weather === "snow") configureSnow(this.particles);
    else configureRain(this.particles);
    this.configureSurfaceCollisions();
    this.openSkyEmitRate = this.particles.emitRate;

    this.followCamera(this.cameraPosition());
    this.observer = this.scene.onBeforeRenderObservable.add(() => {
      this.followCamera(this.cameraPosition());
    });
    this.seedPrecipitation();
    return true;
  }

  clear() {
    if (this.observer) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }
    this.particles?.stop();
    this.particles?.dispose();
    this.texture?.dispose();
    this.emitter?.dispose();
    this.particles = null;
    this.openSkyEmitRate = 0;
    this.texture = null;
    this.emitter = null;
    this.lastCameraPosition = null;
    this.weather = "clear";
    applyWeatherFog(this.scene, "clear");
  }

  dispose() {
    this.clear();
    this.occluders = [];
    this.surfaceCache.clear();
  }
}

export function createWorldWeatherRuntime(options) {
  return new WorldWeatherRuntime(options);
}

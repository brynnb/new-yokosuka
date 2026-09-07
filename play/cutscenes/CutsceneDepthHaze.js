import * as BABYLON from "@babylonjs/core";

const SHADER_NAME = "cutsceneDepthHaze";

BABYLON.Effect.ShadersStore[`${SHADER_NAME}PixelShader`] ||= `
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthMap;
uniform vec3 hazeColor;
uniform float hazeStart;
uniform float hazeEnd;
uniform float maximumOpacity;
uniform float foregroundEnd;
uniform float foregroundOpacity;
uniform float depthMode;
uniform float depthPacked;
uniform float cameraNear;
uniform float cameraFar;

float unpackDepth(vec4 color) {
  const vec4 bitShift = vec4(
    1.0 / (255.0 * 255.0 * 255.0),
    1.0 / (255.0 * 255.0),
    1.0 / 255.0,
    1.0
  );
  return dot(color, bitShift);
}

void main(void) {
  vec4 sceneColor = texture2D(textureSampler, vUV);
  vec4 depthSample = texture2D(depthMap, vUV);
  float rawDepth = depthPacked > 0.5
    ? unpackDepth(depthSample)
    : depthSample.r;
  float viewDistance;
  if (depthMode < 0.5) {
    viewDistance = rawDepth;
  } else if (depthMode < 1.5) {
    viewDistance = cameraNear * cameraFar
      / max(cameraFar - rawDepth * (cameraFar - cameraNear), 0.0001);
  } else {
    viewDistance = cameraNear + rawDepth * (cameraFar - cameraNear);
  }
  float foregroundHaze = smoothstep(
    hazeStart,
    foregroundEnd,
    viewDistance
  ) * foregroundOpacity;
  float distantHaze = smoothstep(hazeStart, hazeEnd, viewDistance)
    * maximumOpacity;
  float haze = max(foregroundHaze, distantHaze);
  gl_FragColor = vec4(mix(sceneColor.rgb, hazeColor, haze), sceneColor.a);
}
`;

function finiteUnit(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be between 0 and 1`);
  }
  return value;
}

export function normalizeCutsceneDepthHaze(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value.startDistance) || value.startDistance < 0) {
    throw new TypeError("cutscene haze start distance must be non-negative");
  }
  if (
    !Number.isFinite(value.endDistance)
    || value.endDistance <= value.startDistance
  ) {
    throw new TypeError("cutscene haze end distance must exceed its start");
  }
  if (
    !Number.isFinite(value.foregroundEndDistance)
    || value.foregroundEndDistance <= value.startDistance
    || value.foregroundEndDistance > value.endDistance
  ) {
    throw new TypeError("cutscene haze foreground end must be within its distance envelope");
  }
  if (!Array.isArray(value.color) || value.color.length !== 3) {
    throw new TypeError("cutscene haze color must contain three channels");
  }
  return Object.freeze({
    startDistance: value.startDistance,
    endDistance: value.endDistance,
    foregroundEndDistance: value.foregroundEndDistance,
    foregroundOpacity: finiteUnit(
      value.foregroundOpacity,
      "cutscene haze foreground opacity",
    ),
    maximumOpacity: finiteUnit(
      value.maximumOpacity,
      "cutscene haze maximum opacity",
    ),
    color: Object.freeze(value.color.map((channel, index) => (
      finiteUnit(channel, `cutscene haze color channel ${index}`)
    ))),
  });
}

export class CutsceneDepthHaze {
  constructor({ scene, camera, options }) {
    if (!scene || !camera) {
      throw new TypeError("cutscene depth haze requires a scene and camera");
    }
    this.scene = scene;
    this.camera = camera;
    this.options = normalizeCutsceneDepthHaze(options);
    if (!this.options) throw new TypeError("cutscene depth haze is unavailable");

    const existing = scene._depthRenderer?.[camera.uniqueId] || null;
    this.depthRenderer = scene.enableDepthRenderer(
      camera,
      false,
      true,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE,
      true,
    );
    this.ownsDepthRenderer = !existing;
    this.previousForceDepthWriteTransparentMeshes =
      this.depthRenderer.forceDepthWriteTransparentMeshes;
    // Native MT5 characters frequently use the blend queue for feather, hair,
    // and garment-edge coverage even where the rendered surface is opaque.
    // Babylon excludes that queue from its depth renderer by default, which
    // makes a depth-based haze composite the distant background over actors.
    // Include those surfaces in the cutscene depth prepass so haze follows the
    // visible character depth just as it does for opaque world geometry.
    this.depthRenderer.forceDepthWriteTransparentMeshes = true;
    this.depthMode = this.depthRenderer._storeCameraSpaceZ
      ? 0
      : (this.depthRenderer._storeNonLinearDepth ? 1 : 2);
    this.postProcess = new BABYLON.PostProcess(
      "cutscene_depth_haze",
      SHADER_NAME,
      [
        "hazeColor",
        "hazeStart",
        "hazeEnd",
        "maximumOpacity",
        "foregroundEnd",
        "foregroundOpacity",
        "depthMode",
        "depthPacked",
        "cameraNear",
        "cameraFar",
      ],
      ["depthMap"],
      1,
      camera,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE,
      scene.getEngine(),
      false,
    );
    this.applyObserver = this.postProcess.onApplyObservable.add((effect) => {
      effect.setTexture("depthMap", this.depthRenderer.getDepthMap());
      effect.setColor3("hazeColor", BABYLON.Color3.FromArray(this.options.color));
      effect.setFloat("hazeStart", this.options.startDistance);
      effect.setFloat("hazeEnd", this.options.endDistance);
      effect.setFloat("maximumOpacity", this.options.maximumOpacity);
      effect.setFloat("foregroundEnd", this.options.foregroundEndDistance);
      effect.setFloat("foregroundOpacity", this.options.foregroundOpacity);
      effect.setFloat("depthMode", this.depthMode);
      effect.setFloat("depthPacked", this.depthRenderer.isPacked ? 1 : 0);
      effect.setFloat("cameraNear", this.camera.minZ);
      effect.setFloat("cameraFar", this.camera.maxZ);
    });
    this.disposed = false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.applyObserver) {
      this.postProcess.onApplyObservable.remove(this.applyObserver);
    }
    this.postProcess.dispose(this.camera);
    if (
      this.ownsDepthRenderer
      && this.scene._depthRenderer?.[this.camera.uniqueId] === this.depthRenderer
    ) {
      this.scene.disableDepthRenderer(this.camera);
    } else {
      this.depthRenderer.forceDepthWriteTransparentMeshes =
        this.previousForceDepthWriteTransparentMeshes;
    }
  }
}

export function createCutsceneDepthHaze(options) {
  return new CutsceneDepthHaze(options);
}

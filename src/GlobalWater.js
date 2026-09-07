import * as BABYLON from "@babylonjs/core";

// Vanguard renders one 20,000,000-unit plane with Godot's large-world
// precision. A triangle that large jitters in WebGL, so use a camera-following
// patch instead. The shader samples world position, keeping waves anchored
// while making the surface functionally infinite.
const GLOBAL_WATER_SIZE = 8192;
const GLOBAL_WATER_FADE_DISTANCE = 20000;
const GLOBAL_WATER_SUBDIVISIONS = 254;
const GLOBAL_WATER_DENSE_RADIUS = 128;
const GLOBAL_WATER_FOLLOW_STEP = 32;

// GPU Gems' practical water model uses a small sum of directional waves for
// mesh displacement and reserves higher frequencies for the surface normal.
// Each wave below keeps nearly the same amplitude/wavelength ratio so their
// slopes combine without one frequency overwhelming the others.
const WATER_WAVE_GLSL = `
const float WATER_TAU = 6.28318530718;
const float WATER_GRAVITY = 9.81;
const float WATER_TIME_SCALE = 0.5;

vec3 directionalWave(
  vec2 worldPosition,
  vec2 direction,
  float wavelength,
  float amplitude,
  float time
) {
  float waveNumber = WATER_TAU / wavelength;
  float angularSpeed = sqrt(WATER_GRAVITY * waveNumber);
  float phase = waveNumber * dot(direction, worldPosition)
    - angularSpeed * time * WATER_TIME_SCALE;
  float height = amplitude * sin(phase);
  float slope = amplitude * waveNumber * cos(phase);
  return vec3(height, direction * slope);
}

// x = height, yz = exact horizontal derivatives of that height.
vec3 waterWaveSample(vec2 worldPosition, float time) {
  return directionalWave(
    worldPosition, vec2(0.984, 0.177), 18.0, 0.14, time
  ) + directionalWave(
    worldPosition, vec2(0.760, 0.650), 11.0, 0.085, time
  ) + directionalWave(
    worldPosition, vec2(0.912, -0.410), 7.0, 0.054, time
  );
}

float waterGeometryFade(vec2 worldPosition, vec2 cameraWorldPosition) {
  return 1.0 - smoothstep(
    80.0,
    180.0,
    distance(worldPosition, cameraWorldPosition)
  );
}
`;

// Rows in time-of-day.png are a vertical sky-color timeline. Keep these
// separate from the scene presets so the water can move through the texture
// continuously while still matching fixed-time worlds and debug overrides.
const WATER_LIGHTING_PRESETS = [
  { textureV: 0.5, lightStrength: 1, contactStrength: 0.38 },
  { textureV: 0.625, lightStrength: 0.55, contactStrength: 0.32 },
  { textureV: 0.68, lightStrength: 0.18, contactStrength: 0.24 },
  { textureV: 0.875, lightStrength: 0.04, contactStrength: 0.18 },
];

const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;

uniform mat4 world;
uniform mat4 worldViewProjection;
uniform mat4 view;
uniform float iGlobalTime;
uniform vec3 cameraPosition;

varying vec3 vWorldPosition;
varying vec3 vViewPosition;

${WATER_WAVE_GLSL}

void main(void) {
  vec4 undisplacedWorldPosition = world * vec4(position, 1.0);
  vec3 displacedPosition = position;
  vec3 wave = waterWaveSample(
    undisplacedWorldPosition.xz,
    iGlobalTime
  );
  displacedPosition.y += wave.x * waterGeometryFade(
    undisplacedWorldPosition.xz,
    cameraPosition.xz
  );
  vec4 worldPosition = world * vec4(displacedPosition, 1.0);
  vWorldPosition = worldPosition.xyz;
  vViewPosition = (view * worldPosition).xyz;
  gl_Position = worldViewProjection * vec4(displacedPosition, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float iGlobalTime;
uniform vec3 cameraPosition;
uniform vec3 lightDir;
uniform vec3 lightColor;
uniform float lightStrength;
uniform sampler2D todTexture;
uniform sampler2D sceneDepthTexture;
uniform float timeOfDay;
uniform float fadeDistance;
uniform float contactStrength;
uniform float depthIsPacked;
uniform float depthNdcHalfZ;
uniform float cameraNear;
uniform float cameraFar;
uniform vec2 screenSize;

varying vec3 vWorldPosition;
varying vec3 vViewPosition;

const vec3 SEA_BASE = vec3(0.05, 0.12, 0.18);
const vec3 SEA_WATER_COLOR = vec3(0.5, 0.7, 0.4);

float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

${WATER_WAVE_GLSL}

float unpackDepth(vec4 packedDepth) {
  const vec4 bitShift = vec4(
    1.0 / (255.0 * 255.0 * 255.0),
    1.0 / (255.0 * 255.0),
    1.0 / 255.0,
    1.0
  );
  return dot(packedDepth, bitShift);
}

float linearDepth(float depth) {
  if (depthNdcHalfZ > 0.5) {
    return cameraNear * cameraFar / max(
      cameraFar - depth * (cameraFar - cameraNear),
      0.00001
    );
  }
  float ndcDepth = depth * 2.0 - 1.0;
  return 2.0 * cameraNear * cameraFar / max(
    cameraFar + cameraNear
      - ndcDepth * (cameraFar - cameraNear),
    0.00001
  );
}

vec3 getSkyColor(vec3 direction) {
  float elevation = asin(clamp(direction.y, -1.0, 1.0))
    / (3.14159265 * 0.5);
  float u = elevation * 0.5 + 0.5;
  return texture2D(todTexture, vec2(u, timeOfDay)).rgb;
}

void main(void) {
  vec3 p = vWorldPosition;
  float t = iGlobalTime * 1.35;

  // Vanguard's shader scale is 0.003 per centimeter. Multiplying by 100
  // preserves its wave size and travel speed in this meter-scale scene.
  float scale = 0.3;
  float n1 = noise(p.xz * scale + t * 0.3);
  float n1b = noise(p.xz * scale * 3.7 + t * 0.5) * 0.5;
  float n2 = noise(p.xz * scale * 1.7 - t * 0.2);
  float n2b = noise(p.xz * scale * 4.3 - t * 0.4) * 0.5;
  n1 += n1b;
  n2 += n2b;
  vec3 geometricWave = waterWaveSample(p.xz, iGlobalTime);
  float geometryFade = waterGeometryFade(p.xz, cameraPosition.xz);
  float waveSlopeX = geometricWave.y * geometryFade;
  float waveSlopeZ = geometricWave.z * geometryFade;
  vec3 normal = normalize(vec3(
    -waveSlopeX + (n1 - 0.75) * 0.18,
    1.0,
    -waveSlopeZ + (n2 - 0.75) * 0.18
  ));

  vec3 eye = normalize(p - cameraPosition);
  float fresnel = 1.0 - max(dot(normal, -eye), 0.0);
  fresnel = clamp(0.14 + pow(fresnel, 2.0) * 0.78, 0.0, 0.92);

  vec3 reflected = getSkyColor(reflect(eye, normal));
  vec3 horizonColor = texture2D(
    todTexture,
    vec2(0.5, timeOfDay)
  ).rgb;
  float brightness = dot(horizonColor, vec3(0.299, 0.587, 0.114));
  vec3 refracted = SEA_BASE * (0.3 + brightness * 0.7)
    + SEA_WATER_COLOR * 0.08 * brightness;
  vec3 color = mix(refracted, reflected, fresnel);

  float specular = pow(
    max(dot(reflect(eye, normal), normalize(lightDir)), 0.0),
    32.0
  );
  specular *= (32.0 + 8.0) / (3.1415 * 8.0);
  color += lightColor * specular * 0.75 * lightStrength;

  float shimmer = noise(p.xz * 0.2 + t * 0.15) * 0.1
    + noise(p.xz * 0.8 + t * 0.3) * 0.06;
  color += SEA_WATER_COLOR * shimmer * brightness;

  // Adapt Vanguard's realistic-water edge calculation: correct the
  // camera-space depth gap by the water/view angle before comparing it to a
  // world-space edge size. This keeps dock-wall contacts stable as the camera
  // moves instead of exposing the triangles in the opaque depth buffer.
  vec2 screenUv = gl_FragCoord.xy / screenSize;
  vec4 depthSample = texture2D(sceneDepthTexture, screenUv);
  float sampledDepth = mix(
    depthSample.r,
    unpackDepth(depthSample),
    step(0.5, depthIsPacked)
  );
  float depthGap = linearDepth(sampledDepth)
    - linearDepth(gl_FragCoord.z);
  vec3 viewDirection = normalize(-vViewPosition);
  float distanceFromEdge = max(depthGap, 0.0)
    * max(dot(normal, -eye), 0.0)
    / max(abs(viewDirection.z), 0.05);
  float edgeSize = 0.7;
  float normalizedEdgeDistance = distanceFromEdge / edgeSize;
  float edgeTexture = mix(
    noise(p.xz * 0.55 + vec2(0.12, -0.02) * t),
    noise(p.xz * 0.8 + vec2(-0.04, 0.1) * t),
    0.5
  );
  float edgeThreshold = mix(0.45, 1.0, edgeTexture);
  float contact = sampledDepth < 0.9999
    ? 1.0 - smoothstep(
      edgeThreshold - 0.12,
      edgeThreshold + 0.12,
      normalizedEdgeDistance
    )
    : 0.0;
  vec3 contactColor = mix(
    vec3(0.02, 0.06, 0.10),
    vec3(0.28, 0.45, 0.52),
    brightness
  );
  color = mix(color, contactColor, contact * contactStrength);

  float alpha = 1.0;
  if (fadeDistance > 0.0) {
    float cameraDistance = length(p - cameraPosition);
    float fadeStart = fadeDistance * 0.85;
    alpha = 1.0 - smoothstep(
      fadeStart,
      fadeDistance,
      cameraDistance
    );
  }
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(
    pow(max(color, vec3(0.0)), vec3(0.75)),
    alpha
  );
}
`;

export function createGlobalWater(
  scene,
  {
    height = -2,
    size = GLOBAL_WATER_SIZE,
    subdivisions = GLOBAL_WATER_SUBDIVISIONS,
  } = {},
) {
  const waterMesh = BABYLON.MeshBuilder.CreateGround(
    "globalWater",
    {
      width: size,
      height: size,
      subdivisions,
    },
    scene,
  );
  // Concentrate vertices around the camera without splitting the ocean into
  // overlapping near/far planes. A fifth-power curve keeps the playable area
  // dense, then expands the outer cells aggressively toward the horizon.
  const positions = waterMesh.getVerticesData(
    BABYLON.VertexBuffer.PositionKind,
  );
  const halfSize = size * 0.5;
  const denseRadius = Math.min(GLOBAL_WATER_DENSE_RADIUS, halfSize);
  for (let index = 0; index < positions.length; index += 3) {
    for (const axisOffset of [0, 2]) {
      const normalized = positions[index + axisOffset] / halfSize;
      const magnitude = Math.abs(normalized);
      positions[index + axisOffset] = Math.sign(normalized) * (
        denseRadius * magnitude
        + (halfSize - denseRadius) * magnitude ** 5
      );
    }
  }
  waterMesh.updateVerticesData(
    BABYLON.VertexBuffer.PositionKind,
    positions,
    true,
  );
  waterMesh.position.y = height;
  const initialCameraPosition = scene.activeCamera?.globalPosition;
  if (initialCameraPosition) {
    waterMesh.position.x = Math.round(
      initialCameraPosition.x / GLOBAL_WATER_FOLLOW_STEP,
    ) * GLOBAL_WATER_FOLLOW_STEP;
    waterMesh.position.z = Math.round(
      initialCameraPosition.z / GLOBAL_WATER_FOLLOW_STEP,
    ) * GLOBAL_WATER_FOLLOW_STEP;
  }
  waterMesh.isPickable = false;
  waterMesh.checkCollisions = false;
  waterMesh.alwaysSelectAsActiveMesh = true;
  // Babylon's default alphaIndex is effectively "render last". That placed
  // this transparent plane after alpha-blended character hair, allowing the
  // water to cover hair/scalp cards even though opaque body parts correctly
  // occluded it through the depth buffer. Render water before character and
  // UI transparency; ordinary opaque geometry still occludes it normally.
  waterMesh.alphaIndex = 0;

  const material = new BABYLON.ShaderMaterial(
    "globalWaterMaterial",
    scene,
    {
      vertexSource: VERTEX_SHADER,
      fragmentSource: FRAGMENT_SHADER,
    },
    {
      attributes: ["position"],
      uniforms: [
        "world",
        "worldViewProjection",
        "view",
        "iGlobalTime",
        "cameraPosition",
        "lightDir",
        "lightColor",
        "lightStrength",
        "timeOfDay",
        "fadeDistance",
        "contactStrength",
        "depthIsPacked",
        "depthNdcHalfZ",
        "cameraNear",
        "cameraFar",
        "screenSize",
      ],
      samplers: ["todTexture", "sceneDepthTexture"],
      needAlphaBlending: true,
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;

  const timeOfDayTexture = new BABYLON.Texture(
    "/textures/water/time-of-day.png",
    scene,
    false,
    false,
  );
  timeOfDayTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  timeOfDayTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  material.setTexture("todTexture", timeOfDayTexture);
  material.setFloat("iGlobalTime", 0);
  material.setFloat("timeOfDay", 0.5);
  material.setFloat("lightStrength", 1);
  material.setFloat("contactStrength", 0);
  material.setFloat("fadeDistance", GLOBAL_WATER_FADE_DISTANCE);
  material.setVector3(
    "cameraPosition",
    initialCameraPosition || BABYLON.Vector3.Zero(),
  );
  material.setVector3(
    "lightDir",
    new BABYLON.Vector3(0, 1, 0.8).normalize(),
  );
  material.setVector3("lightColor", BABYLON.Vector3.One());

  const depthCamera = scene.activeCamera;
  const existingDepthRenderer = depthCamera
    ? scene._depthRenderer?.[depthCamera.uniqueId]
    : null;
  const depthRenderer = depthCamera && scene.enableDepthRenderer
    ? scene.enableDepthRenderer(
      depthCamera,
      true,
      true,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    )
    : null;
  const depthMap = depthRenderer?.getDepthMap?.() || null;
  if (depthMap) {
    // Packed RGBA depth cannot be interpolated safely. Float depth can, and
    // bilinear filtering removes the crawling one-pixel stair steps seen at
    // dock silhouettes.
    depthMap.updateSamplingMode(
      depthRenderer.isPacked
        ? BABYLON.Texture.NEAREST_SAMPLINGMODE
        : BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    );
    material.setTexture("sceneDepthTexture", depthMap);
    material.setFloat("depthIsPacked", depthRenderer.isPacked ? 1 : 0);
    material.setFloat(
      "depthNdcHalfZ",
      scene.getEngine().isNDCHalfZRange ? 1 : 0,
    );
    material.setFloat("contactStrength", WATER_LIGHTING_PRESETS[0].contactStrength);
  }

  const screenSize = new BABYLON.Vector2(
    scene.getEngine().getRenderWidth(),
    scene.getEngine().getRenderHeight(),
  );
  material.setVector2("screenSize", screenSize);
  material.setFloat("cameraNear", depthCamera?.minZ || 0.1);
  material.setFloat("cameraFar", depthCamera?.maxZ || 10000);

  let elapsedTime = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsedTime += scene.getEngine().getDeltaTime() / 1000;
    material.setFloat("iGlobalTime", elapsedTime);
    const cameraPosition = scene.activeCamera?.globalPosition;
    if (cameraPosition) {
      waterMesh.position.x = Math.round(
        cameraPosition.x / GLOBAL_WATER_FOLLOW_STEP,
      ) * GLOBAL_WATER_FOLLOW_STEP;
      waterMesh.position.z = Math.round(
        cameraPosition.z / GLOBAL_WATER_FOLLOW_STEP,
      ) * GLOBAL_WATER_FOLLOW_STEP;
      material.setVector3("cameraPosition", cameraPosition);
    }
    const camera = scene.activeCamera;
    if (camera) {
      material.setFloat("cameraNear", camera.minZ);
      material.setFloat("cameraFar", camera.maxZ);
    }
    screenSize.set(
      scene.getEngine().getRenderWidth(),
      scene.getEngine().getRenderHeight(),
    );
    material.setVector2("screenSize", screenSize);
  });

  waterMesh.material = material;
  waterMesh.metadata = {
    ...waterMesh.metadata,
    globalWaterRenderObserver: renderObserver,
    globalWaterTimeOfDayTexture: timeOfDayTexture,
    globalWaterDepthCamera: depthCamera,
    globalWaterOwnsDepthRenderer: Boolean(
      depthRenderer && !existingDepthRenderer,
    ),
    globalWaterHasDepthTexture: Boolean(depthMap),
  };
  return waterMesh;
}

export function globalWaterLightingForBlend({
  fromIndex = 0,
  toIndex = fromIndex,
  progress = 0,
} = {}) {
  const from = WATER_LIGHTING_PRESETS[fromIndex]
    || WATER_LIGHTING_PRESETS[0];
  const to = WATER_LIGHTING_PRESETS[toIndex] || from;
  const amount = Math.min(1, Math.max(0, Number(progress) || 0));
  return {
    textureV: from.textureV + (to.textureV - from.textureV) * amount,
    lightStrength: from.lightStrength
      + (to.lightStrength - from.lightStrength) * amount,
    contactStrength: from.contactStrength
      + (to.contactStrength - from.contactStrength) * amount,
  };
}

export function applyGlobalWaterTimeOfDay(waterMesh, lightingBlend) {
  const material = waterMesh?.material;
  if (!material?.setFloat) return;
  const lighting = globalWaterLightingForBlend(lightingBlend);
  material.setFloat("timeOfDay", lighting.textureV);
  material.setFloat("lightStrength", lighting.lightStrength);
  material.setFloat(
    "contactStrength",
    waterMesh.metadata?.globalWaterHasDepthTexture
      ? lighting.contactStrength
      : 0,
  );
  waterMesh.metadata = {
    ...waterMesh.metadata,
    globalWaterLighting: lighting,
  };
}

export function disposeGlobalWater(waterMesh) {
  if (!waterMesh) return;
  const material = waterMesh.material;
  const timeOfDayTexture = waterMesh.metadata
    ?.globalWaterTimeOfDayTexture;
  const observer = waterMesh.metadata?.globalWaterRenderObserver;
  if (observer) {
    waterMesh.getScene().onBeforeRenderObservable.remove(observer);
  }
  // The depth map is scene-owned, so do not use forceDisposeTextures on the
  // material. Release the water-owned lookup texture separately.
  if (waterMesh.metadata?.globalWaterOwnsDepthRenderer) {
    waterMesh.getScene().disableDepthRenderer(
      waterMesh.metadata.globalWaterDepthCamera,
    );
  }
  waterMesh.material = null;
  waterMesh.dispose(false, false);
  timeOfDayTexture?.dispose?.();
  material?.dispose?.(false, false);
}

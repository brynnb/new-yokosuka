import * as BABYLON from "@babylonjs/core";
import phoenixLogoUrl from "../assets/account/phoenix-logo.png?url";
import newYokosukaLogoUrl from "../assets/account/new-yokosuka-logo.png?url";
import {
  MENU_BACKGROUND_COLOR,
  menuBackgroundLayout,
} from "./menuBackgroundLayout.js";
import {
  ACCOUNT_MENU_FADE_SECONDS,
  ACCOUNT_MENU_VISIBILITY_EVENT,
  accountMenuIsVisible,
} from "./AccountMenuPresentation.js";

const WORDMARK_ASPECT_RATIO = 926 / 350;

function createCloudMaterial(scene) {
  const material = new BABYLON.ShaderMaterial(
    "menu_cloud_material",
    scene,
    {
      vertexSource: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 worldViewProjection;
        varying vec2 vUV;

        void main(void) {
          vUV = uv;
          gl_Position = worldViewProjection * vec4(position, 1.0);
        }
      `,
      fragmentSource: `
        precision highp float;
        varying vec2 vUV;
        uniform float time;
        uniform float aspect;

        float hash(vec2 point) {
          point = fract(point * vec2(123.34, 456.21));
          point += dot(point, point + 45.32);
          return fract(point.x * point.y);
        }

        float noise(vec2 point) {
          vec2 cell = floor(point);
          vec2 fraction = fract(point);
          fraction = fraction * fraction * (3.0 - 2.0 * fraction);
          return mix(
            mix(hash(cell), hash(cell + vec2(1.0, 0.0)), fraction.x),
            mix(
              hash(cell + vec2(0.0, 1.0)),
              hash(cell + vec2(1.0, 1.0)),
              fraction.x
            ),
            fraction.y
          );
        }

        float fbm(vec2 point) {
          float value = 0.0;
          float amplitude = 0.54;
          for (int octave = 0; octave < 5; octave++) {
            value += amplitude * noise(point);
            point = point * 2.03 + vec2(17.1, 9.2);
            amplitude *= 0.5;
          }
          return value;
        }

        float cloudLayer(vec2 point, float scale, float drift, float depth) {
          vec2 samplePoint = point * scale;
          samplePoint.x += time * drift;
          samplePoint.y += sin(time * drift * 0.45 + depth) * 0.08;
          float body = fbm(samplePoint + depth * vec2(7.3, 3.9));
          float detail = fbm(samplePoint * 2.2 - depth * vec2(2.1, 5.4));
          return smoothstep(0.50, 0.77, body * 0.82 + detail * 0.28);
        }

        void main(void) {
          vec2 point = vUV - 0.5;
          point.x *= aspect;
          point += vec2(13.7, -8.4);

          float distant = cloudLayer(point + vec2(0.0, 0.08), 1.45, 0.010, 0.7);
          float middle = cloudLayer(point - vec2(0.0, 0.12), 2.05, 0.018, 2.4);
          float near = cloudLayer(point + vec2(0.0, 0.20), 2.75, 0.027, 4.8);
          float volume = distant * 0.32 + middle * 0.42 + near * 0.34;
          float density = 0.9 * (
            1.0 - exp(-volume * 3.0)
          );
          float illumination = smoothstep(
            0.24,
            0.82,
            fbm(point * 3.4 + vec2(-time * 0.006, 12.8))
          );
          vec3 cloudShadow = vec3(0.70, 0.82, 0.98);
          vec3 cloudColor = mix(
            cloudShadow,
            vec3(1.0),
            0.28 + illumination * 0.72
          );
          gl_FragColor = vec4(cloudColor, density);
        }
      `,
    },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "time", "aspect"],
      needAlphaBlending: true,
    },
  );
  material.backFaceCulling = false;
  material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return material;
}

export class MenuBackgroundScene {
  constructor({
    engine,
    canvas,
    reducedInterfaceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches ?? false,
  }) {
    this.engine = engine;
    this.canvas = canvas;
    this.reducedInterfaceMotion = reducedInterfaceMotion;
    this.elapsedSeconds = 0;
    this.previousTime = performance.now();
    this.scene = new BABYLON.Scene(engine);
    this.scene.clearColor = new BABYLON.Color4(
      MENU_BACKGROUND_COLOR.red,
      MENU_BACKGROUND_COLOR.green,
      MENU_BACKGROUND_COLOR.blue,
      1,
    );
    this.scene.autoClear = true;

    this.camera = new BABYLON.FreeCamera(
      "menu_background_camera",
      new BABYLON.Vector3(0, 0, -4),
      this.scene,
    );
    this.camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.setTarget(BABYLON.Vector3.Zero());
    this.scene.activeCamera = this.camera;

    this.cloudPlane = BABYLON.MeshBuilder.CreatePlane(
      "menu_clouds",
      { width: 2, height: 2 },
      this.scene,
    );
    this.cloudPlane.position.z = 0;
    this.cloudMaterial = createCloudMaterial(this.scene);
    this.cloudPlane.material = this.cloudMaterial;

    this.logoRoot = new BABYLON.TransformNode(
      "menu_phoenix_logo_root",
      this.scene,
    );
    this.logoRoot.position.z = -0.5;
    this.logoPlane = BABYLON.MeshBuilder.CreatePlane(
      "menu_phoenix_logo",
      { width: 1, height: 1 },
      this.scene,
    );
    this.logoPlane.parent = this.logoRoot;
    this.logoPlane.alphaIndex = 2;
    this.logoMaterial = new BABYLON.StandardMaterial(
      "menu_phoenix_logo_material",
      this.scene,
    );
    this.logoMaterial.disableLighting = true;
    this.logoMaterial.diffuseColor = BABYLON.Color3.White();
    this.logoMaterial.emissiveColor = BABYLON.Color3.White();
    this.logoMaterial.specularColor = BABYLON.Color3.Black();
    this.logoMaterial.backFaceCulling = false;
    this.logoMaterial.transparencyMode =
      BABYLON.Material.MATERIAL_ALPHABLEND;
    this.logoTexture = new BABYLON.Texture(
      phoenixLogoUrl,
      this.scene,
      true,
      false,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
    );
    this.logoTexture.hasAlpha = true;
    this.logoMaterial.opacityTexture = this.logoTexture;
    this.logoPlane.material = this.logoMaterial;
    this.logoDepthPlanes = [1, 2, 3].map((layer) => {
      const plane = BABYLON.MeshBuilder.CreatePlane(
        `menu_phoenix_logo_depth_${layer}`,
        { width: 1, height: 1 },
        this.scene,
      );
      plane.parent = this.logoRoot;
      plane.position.set(0.0045 * layer, -0.006 * layer, 0.018 * layer);
      plane.alphaIndex = 1;
      const material = this.logoMaterial.clone(
        `menu_phoenix_logo_depth_material_${layer}`,
      );
      const depthColor = new BABYLON.Color3(0.16, 0.3, 0.5);
      material.diffuseColor = depthColor;
      material.emissiveColor = depthColor;
      material.alpha = 0.24;
      plane.material = material;
      return plane;
    });
    this.logoGlow = new BABYLON.GlowLayer(
      "menu_phoenix_logo_glow",
      this.scene,
      {
        blurKernelSize: 48,
        mainTextureSamples: 2,
      },
    );
    this.logoGlow.intensity = 0.2;
    this.logoGlow.addIncludedOnlyMesh(this.logoPlane);

    this.wordmarkScene = new BABYLON.Scene(engine);
    this.wordmarkScene.autoClear = false;
    this.wordmarkScene.autoClearDepthAndStencil = true;
    this.wordmarkCamera = new BABYLON.FreeCamera(
      "menu_wordmark_camera",
      new BABYLON.Vector3(0, 0, -4),
      this.wordmarkScene,
    );
    this.wordmarkCamera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    this.wordmarkCamera.setTarget(BABYLON.Vector3.Zero());
    this.wordmarkScene.activeCamera = this.wordmarkCamera;
    this.wordmarkPlane = BABYLON.MeshBuilder.CreatePlane(
      "menu_new_yokosuka_wordmark",
      { width: 1, height: 1 },
      this.wordmarkScene,
    );
    this.wordmarkPlane.position.set(0, -0.04, 0);
    this.wordmarkMaterial = new BABYLON.StandardMaterial(
      "menu_new_yokosuka_wordmark_material",
      this.wordmarkScene,
    );
    this.wordmarkMaterial.disableLighting = true;
    this.wordmarkMaterial.diffuseColor = BABYLON.Color3.Black();
    this.wordmarkMaterial.emissiveColor = BABYLON.Color3.Black();
    this.wordmarkMaterial.specularColor = BABYLON.Color3.Black();
    this.wordmarkMaterial.alpha = 0.9;
    this.wordmarkMaterial.backFaceCulling = false;
    this.wordmarkMaterial.transparencyMode =
      BABYLON.Material.MATERIAL_ALPHABLEND;
    this.wordmarkTexture = new BABYLON.Texture(
      newYokosukaLogoUrl,
      this.wordmarkScene,
      true,
      true,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
    );
    this.wordmarkTexture.hasAlpha = true;
    this.wordmarkMaterial.opacityTexture = this.wordmarkTexture;
    this.wordmarkPlane.material = this.wordmarkMaterial;
    this.wordmarkTargetAlpha = accountMenuIsVisible() ? 0 : 0.9;
    this.wordmarkMaterial.alpha = this.wordmarkTargetAlpha;
    this.onAccountMenuVisibility = (event) => {
      this.wordmarkTargetAlpha = event.detail?.visible ? 0 : 0.9;
    };
    window.addEventListener(
      ACCOUNT_MENU_VISIBILITY_EVENT,
      this.onAccountMenuVisibility,
    );

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.renderLoop = () => this.render();
    this.readinessRevision = 0;
    this.resize();
  }

  resize() {
    this.engine.resize(true);
    const { width, height } = this.canvas.getBoundingClientRect();
    const layout = menuBackgroundLayout(width, height);
    this.camera.orthoLeft = layout.orthoLeft;
    this.camera.orthoRight = layout.orthoRight;
    this.camera.orthoBottom = layout.orthoBottom;
    this.camera.orthoTop = layout.orthoTop;
    this.wordmarkCamera.orthoLeft = layout.orthoLeft;
    this.wordmarkCamera.orthoRight = layout.orthoRight;
    this.wordmarkCamera.orthoBottom = layout.orthoBottom;
    this.wordmarkCamera.orthoTop = layout.orthoTop;
    this.cloudPlane.scaling.set(layout.aspect, 1, 1);
    this.logoRoot.scaling.set(layout.logoSize, layout.logoSize, 1);
    this.wordmarkPlane.scaling.set(
      layout.wordmarkWidth,
      layout.wordmarkWidth / WORDMARK_ASPECT_RATIO,
      1,
    );
    this.cloudMaterial.setFloat("aspect", layout.aspect);
  }

  start() {
    this.engine.runRenderLoop(this.renderLoop);
    const revision = ++this.readinessRevision;
    void Promise.all([
      this.scene.whenReadyAsync(),
      this.wordmarkScene.whenReadyAsync(),
    ]).then(() => {
      if (revision !== this.readinessRevision) return;
      window.requestAnimationFrame(() => {
        if (revision !== this.readinessRevision) return;
        document.body.classList.add("menu-scene-ready");
      });
    });
  }

  render() {
    const now = performance.now();
    const frameSeconds = Math.min(100, now - this.previousTime) / 1000;
    // The slow cloud drift and phoenix rotation are part of the game scene,
    // not navigational UI motion. Keep that ambient world alive while still
    // honoring reduced motion for the account-interface fade below.
    this.elapsedSeconds += frameSeconds;
    this.previousTime = now;
    const alphaDifference =
      this.wordmarkTargetAlpha - this.wordmarkMaterial.alpha;
    const alphaStep = this.reducedInterfaceMotion
      ? Math.abs(alphaDifference)
      : (0.9 / ACCOUNT_MENU_FADE_SECONDS) * frameSeconds;
    this.wordmarkMaterial.alpha += Math.sign(alphaDifference)
      * Math.min(Math.abs(alphaDifference), alphaStep);
    this.cloudMaterial.setFloat("time", this.elapsedSeconds);
    this.logoRoot.rotation.z = -this.elapsedSeconds * Math.PI / 120;
    this.scene.render();
    this.wordmarkScene.render();
  }

  dispose() {
    this.readinessRevision += 1;
    document.body.classList.remove("menu-scene-ready");
    this.engine.stopRenderLoop(this.renderLoop);
    this.resizeObserver.disconnect();
    window.removeEventListener(
      ACCOUNT_MENU_VISIBILITY_EVENT,
      this.onAccountMenuVisibility,
    );
    this.wordmarkScene.dispose();
    this.scene.dispose();
  }
}

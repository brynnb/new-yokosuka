import {
  AbstractMesh,
  BaseTexture,
  BindClipPlane,
  Color3,
  EffectFallbacks,
  GetEnvironmentBRDFTexture,
  MaterialDefines,
  MaterialHelper,
  Matrix,
  Mesh,
  PushMaterial,
  Scene,
  StandardMaterial,
  SubMesh,
  VertexBuffer,
} from "@babylonjs/core";
import type { IAnimatable } from "@babylonjs/core";
import type LightProbeManager from "../ibl/LightProbeManager.ts";

interface UniformDefinition {
  name: string;
  len: number;
}

const UNIFORMS: UniformDefinition[] = [
  { name: "vDiffuseColor", len: 4 },
  { name: "vDiffuseInfos", len: 2 },
  { name: "diffuseMatrix", len: 16 },
  { name: "vAoInfos", len: 2 },
  { name: "aoMatrix", len: 16 },
  { name: "vReflectivityRoughnessInfos", len: 2 },
  { name: "reflectivityRoughnessMatrix", len: 16 },
  { name: "vLodFallOff", len: 4 },
  { name: "vLightProbeInfos", len: 4 },
  { name: "vReflectivity", len: 4 },
  { name: "vAABB", len: 16 },
  { name: "pointSize", len: 1 },
];

function materialTextures(material: any): BaseTexture[] {
  return [
    material._diffuseTexture,
    material._aoTexture,
    material._reflectivityRoughnessTexture,
  ].filter(Boolean) as BaseTexture[];
}

export class DynamicIBLMaterialDefines extends MaterialDefines {
  [name: string]: any;

  constructor() {
    super();
    this.MAINUV1 = false;
    this.MAINUV2 = false;
    this.DIFFUSE = false;
    this.DIFFUSEDIRECTUV = 0;
    this.AO = false;
    this.AODIRECTUV = 0;
    this.DYAO = false;
    this.REFLECTIVITYROUGHNESS = false;
    this.REFLECTIVITYROUGHNESSDIRECTUV = 0;
    this.TONEMAPPINGMODE = 0;
    this.RADIANCE = false;
    this.IRRADIANCE = false;
    this.USEPARALLAXCORRECTION = false;
    this.USELODFALLOFF = false;
    this.USERADIANCELODROUGHNESS = false;
    this.LODBASEDMICROSURFACE = false;
    this.ENVIRONMENTBRDF = false;
    this.CLIPPLANE = false;
    this.ALPHATEST = false;
    this.DEPTHPREPASS = false;
    this.POINTSIZE = false;
    this.NORMAL = false;
    this.UV1 = false;
    this.UV2 = false;
    this.VERTEXCOLOR = false;
    this.VERTEXALPHA = false;
    this.INSTANCES = false;
    this.PBR = true;
    this.USEPHYSICALLIGHTFALLOFF = true;
    this.rebuild();
  }

  reset(): void {
    super.reset();
    this.PBR = true;
    this.USEPHYSICALLIGHTFALLOFF = true;
  }
}

export default class DynamicIBLMaterial extends PushMaterial {
  private _environmentBRDFTexture: BaseTexture | null;
  private _diffuseColor: Color3;
  private _lastBindedLPGroupId: number;
  private _lightProbeManager: LightProbeManager | null;
  private _reflectivityColor: Color3;
  private _roughness: number;
  private _toneMappingMode: number;
  private _diffuseTexture: BaseTexture | null = null;
  private _aoTexture: BaseTexture | null = null;
  private _reflectivityRoughnessTexture: BaseTexture | null = null;
  radianceLevel: number;
  irradianceLevel: number;
  useRadianceLodRoughness: boolean;
  readonly lodFallOffFactor: {
    near: number;
    farSubNear: number;
    radMax: number;
    iradMax: number;
  };

  constructor(
    name: string,
    scene: Scene,
    lightProbeManager: LightProbeManager | null = null,
  ) {
    super(name, scene);
    this._environmentBRDFTexture = null;
    this._diffuseColor = new Color3(1, 1, 1);
    this._lastBindedLPGroupId = -1;
    this._lightProbeManager = null;
    this._reflectivityColor = new Color3(0.04, 0.04, 0.04);
    this._roughness = 0;
    this.radianceLevel = 1;
    this.irradianceLevel = 1;
    this._toneMappingMode = 1;
    this.useRadianceLodRoughness = false;
    this.lodFallOffFactor = {
      near: 0,
      farSubNear: 0,
      radMax: 0,
      iradMax: 0,
    };
    this._lightProbeManager = lightProbeManager;
    this._environmentBRDFTexture =
      GetEnvironmentBRDFTexture(scene);
  }

  get diffuseTexture(): BaseTexture | null {
    return this._diffuseTexture;
  }

  set diffuseTexture(value: BaseTexture | null) {
    if (this._diffuseTexture === value) return;
    this._diffuseTexture = value;
    this._markAllSubMeshesAsTexturesDirty();
  }

  get aoTexture(): BaseTexture | null {
    return this._aoTexture;
  }

  set aoTexture(value: BaseTexture | null) {
    if (this._aoTexture === value) return;
    this._aoTexture = value;
    this._markAllSubMeshesAsTexturesDirty();
  }

  get reflectivityRoughnessTexture(): BaseTexture | null {
    return this._reflectivityRoughnessTexture;
  }

  set reflectivityRoughnessTexture(value: BaseTexture | null) {
    if (this._reflectivityRoughnessTexture === value) return;
    this._reflectivityRoughnessTexture = value;
    this._markAllSubMeshesAsTexturesDirty();
  }

  get diffuseColor(): Color3 {
    return this._diffuseColor;
  }

  set diffuseColor(value: Color3) {
    if (this._diffuseColor.equals(value)) return;
    this._diffuseColor = value;
    this._markAllSubMeshesAsTexturesDirty();
  }

  get reflectivityColor(): Color3 {
    return this._reflectivityColor;
  }

  set reflectivityColor(value: Color3) {
    if (this._reflectivityColor.equals(value)) return;
    this._reflectivityColor = value;
    this._markAllSubMeshesAsTexturesDirty();
  }

  get roughness(): number {
    return this._roughness;
  }

  set roughness(value: number) {
    if (this._roughness === value) return;
    this._roughness = value;
    this._markAllSubMeshesAsTexturesDirty();
  }

  get toneMappingMode(): number {
    return this._toneMappingMode;
  }

  set toneMappingMode(value: number) {
    if (this._toneMappingMode === value) return;
    this._toneMappingMode = value;
    this._markAllSubMeshesAsTexturesDirty();
  }

  setLodFallOff(
    near: number,
    far: number,
    radianceMax: number,
    irradianceMax: number,
  ): void {
    this.lodFallOffFactor.near = near;
    this.lodFallOffFactor.farSubNear = far - near;
    this.lodFallOffFactor.radMax = radianceMax;
    this.lodFallOffFactor.iradMax = irradianceMax;
  }

  getClassName(): string {
    return "DynamicIBLMaterial";
  }

  needAlphaBlending(): boolean {
    return false;
  }

  needAlphaTesting(): boolean {
    return false;
  }

  getAlphaTestTexture(): BaseTexture | null {
    return null;
  }

  isReadyForSubMesh(
    mesh: AbstractMesh,
    subMesh: SubMesh,
    useInstances?: boolean,
  ): boolean {
    if (
      subMesh.effect &&
      this.isFrozen &&
      subMesh._drawWrapper._wasPreviouslyReady
    ) {
      return true;
    }
    if (!subMesh.materialDefines) {
      subMesh.materialDefines = new DynamicIBLMaterialDefines();
    }

    const scene = this.getScene();
    const defines =
      subMesh.materialDefines as DynamicIBLMaterialDefines;
    if (
      !this.checkReadyOnEveryCall &&
      subMesh.effect &&
      defines._renderId === scene.getRenderId()
    ) {
      return true;
    }

    const probeManager = this._lightProbeManager;
    const engine = scene.getEngine();
    defines._needNormals = true;
    if (defines._areTexturesDirty) {
      defines._needUVs = false;
      defines.MAINUV1 = false;
      defines.MAINUV2 = false;
      if (scene.texturesEnabled) {
        if (probeManager) {
          if (!probeManager.isReady()) return false;
          defines.RADIANCE = Boolean(probeManager.radianceMap);
          defines.USERADIANCELODROUGHNESS =
            defines.RADIANCE && this.useRadianceLodRoughness;
          defines.IRRADIANCE = probeManager.hasGroup();
          defines.USEPARALLAXCORRECTION = Boolean(probeManager.aabb);
          defines.USELODFALLOFF = this.lodFallOffFactor.farSubNear > 0;
        } else {
          defines.RADIANCE = false;
          defines.USERADIANCELODROUGHNESS = false;
          defines.IRRADIANCE = false;
          defines.USEPARALLAXCORRECTION = false;
          defines.USELODFALLOFF = false;
        }
        if (engine.getCaps().textureLOD) {
          defines.LODBASEDMICROSURFACE = true;
        }
        if (this._diffuseTexture) {
          if (!this._diffuseTexture.isReadyOrNotBlocking()) return false;
          MaterialHelper.PrepareDefinesForMergedUV(
            this._diffuseTexture,
            defines,
            "DIFFUSE",
          );
        } else {
          defines.DIFFUSE = false;
        }
        if (this._aoTexture) {
          if (!this._aoTexture.isReadyOrNotBlocking()) return false;
          defines.AO = true;
          if (this._aoTexture.isCube) {
            defines.AODIRECTUV = 10;
          } else {
            MaterialHelper.PrepareDefinesForMergedUV(
              this._aoTexture,
              defines,
              "AO",
            );
          }
          defines.DYAO = Boolean(
            probeManager?.aabb && probeManager.aabb.useDyao,
          );
        } else {
          defines.AO = false;
          defines.AODIRECTUV = 0;
          defines.DYAO = false;
        }
        if (this._reflectivityRoughnessTexture) {
          if (!this._reflectivityRoughnessTexture.isReadyOrNotBlocking()) {
            return false;
          }
          MaterialHelper.PrepareDefinesForMergedUV(
            this._reflectivityRoughnessTexture,
            defines,
            "REFLECTIVITYROUGHNESS",
          );
        } else {
          defines.REFLECTIVITYROUGHNESS = false;
        }
        if (this._environmentBRDFTexture) {
          if (!this._environmentBRDFTexture.isReady()) return false;
          defines.ENVIRONMENTBRDF = true;
        } else {
          defines.ENVIRONMENTBRDF = false;
        }
      } else {
        defines.LODBASEDMICROSURFACE = false;
        defines.DIFFUSE = false;
        defines.AO = false;
        defines.DYAO = false;
        defines.REFLECTIVITYROUGHNESS = false;
        defines.RADIANCE = false;
        defines.USERADIANCELODROUGHNESS = false;
        defines.IRRADIANCE = false;
        defines.USEPARALLAXCORRECTION = false;
        defines.USELODFALLOFF = false;
        defines.ENVIRONMENTBRDF = false;
      }
      defines.TONEMAPPINGMODE = this._toneMappingMode;
    }

    if (defines._areMiscDirty) {
      defines.POINTSIZE = this.pointsCloud || scene.forcePointsCloud;
    }
    const needsNormals = MaterialHelper.PrepareDefinesForAttributes(
      mesh,
      defines,
      true,
      false,
      false,
    );
    if (
      needsNormals &&
      mesh &&
      !engine.getCaps().standardDerivatives &&
      !mesh.isVerticesDataPresent(VertexBuffer.NormalKind)
    ) {
      mesh.createNormals(true);
    }
    MaterialHelper.PrepareDefinesForFrameBoundValues(
      scene,
      engine,
      this,
      defines,
      Boolean(useInstances),
    );

    if (defines.isDirty) {
      defines.markAsProcessed();
      scene.resetCachedMaterial();
      const fallbacks = new EffectFallbacks();
      const attributes = [VertexBuffer.PositionKind];
      if (defines.NORMAL) attributes.push(VertexBuffer.NormalKind);
      if (defines.UV1) attributes.push(VertexBuffer.UVKind);
      if (defines.UV2) attributes.push(VertexBuffer.UV2Kind);
      if (defines.VERTEXCOLOR) {
        attributes.push(VertexBuffer.ColorKind);
      }
      MaterialHelper.PrepareAttributesForInstances(attributes, defines);
      const uniformsNames = [
        "world",
        "view",
        "viewProjection",
        "vEyePosition",
        "vFogInfos",
        "vFogColor",
        "vClipPlane",
        "vDynamicRatios",
        ...UNIFORMS.map((uniform) => uniform.name),
      ];
      const samplers = [
        "diffuseSampler",
        "aoSampler",
        "radSampler",
        "iradSampler0",
        "iradSampler1",
        "iradSampler2",
        "iradSampler3",
        "iradSampler4",
        "iradSampler5",
        "iradSampler6",
        "iradSampler7",
        "reflectivityRoughnessSampler",
        "environmentBrdfSampler",
      ];
      const uniformBuffersNames = ["Material", "Scene"];
      MaterialHelper.PrepareUniformsAndSamplersList({
        uniformsNames,
        uniformBuffersNames,
        samplers,
        defines,
      } as any);
      subMesh.setEffect(
        engine.createEffect(
          "luckyBreakDynamicIbl",
          {
            attributes,
            uniformsNames,
            uniformBuffersNames,
            samplers,
            defines: defines.toString(),
            fallbacks,
            onCompiled: this.onCompiled,
            onError: this.onError,
          } as any,
          engine,
        ),
        defines,
      );
      this.buildUniformLayout();
      if (probeManager) probeManager.watchMesh(mesh);
    }

    if (!subMesh.effect || !subMesh.effect.isReady()) return false;
    defines._renderId = scene.getRenderId();
    subMesh._drawWrapper._wasPreviouslyReady = true;
    return true;
  }

  buildUniformLayout(): void {
    for (const uniform of UNIFORMS) {
      this._uniformBuffer.addUniform(uniform.name, uniform.len);
    }
    this._uniformBuffer.create();
  }

  bindForSubMesh(
    world: Matrix,
    mesh: Mesh,
    subMesh: SubMesh,
  ): void {
    const scene = this.getScene();
    if (!subMesh.materialDefines || !subMesh.effect) return;

    const effect = subMesh.effect;
    this._activeEffect = effect;
    this.bindOnlyWorldMatrix(world);
    const mustRebind = this._mustRebind(
      scene,
      effect,
      subMesh,
      mesh.visibility,
    );
    const probeManager = this._lightProbeManager;
    if (mustRebind) {
      this._uniformBuffer.bindToEffect(effect, "Material");
      this.bindViewProjection(effect);
      if (
        !(
          this._uniformBuffer.useUbo &&
          this.isFrozen &&
          this._uniformBuffer.isSync
        )
      ) {
        if (scene.texturesEnabled) {
          if (this._diffuseTexture) {
            this._uniformBuffer.updateFloat2(
              "vDiffuseInfos",
              this._diffuseTexture.coordinatesIndex,
              this._diffuseTexture.level,
            );
            MaterialHelper.BindTextureMatrix(
              this._diffuseTexture,
              this._uniformBuffer,
              "diffuse",
            );
          }
          if (this._aoTexture) {
            this._uniformBuffer.updateFloat2(
              "vAoInfos",
              this._aoTexture.coordinatesIndex,
              this._aoTexture.level,
            );
            if (!this._aoTexture.isCube) {
              MaterialHelper.BindTextureMatrix(
                this._aoTexture,
                this._uniformBuffer,
                "ao",
              );
            }
          }
          if (this._reflectivityRoughnessTexture) {
            this._uniformBuffer.updateFloat2(
              "vReflectivityRoughnessInfos",
              this._reflectivityRoughnessTexture.coordinatesIndex,
              this._reflectivityRoughnessTexture.level,
            );
            MaterialHelper.BindTextureMatrix(
              this._reflectivityRoughnessTexture,
              this._uniformBuffer,
              "reflectivityRoughness",
            );
          }
          this._uniformBuffer.updateFloat4(
            "vReflectivity",
            this._reflectivityColor.r,
            this._reflectivityColor.g,
            this._reflectivityColor.b,
            this._roughness,
          );
          if (probeManager) {
            const radianceSize = probeManager.radianceMap
              ? probeManager.radianceMap.getSize().width
              : 0;
            this._uniformBuffer.updateFloat4(
              "vLightProbeInfos",
              radianceSize,
              probeManager.radianceLevel * this.radianceLevel,
              probeManager.irradianceLevel * this.irradianceLevel,
              0,
            );
            if (probeManager.aabb) {
              this._uniformBuffer.updateMatrix3x3(
                "vAABB",
                probeManager.aabb.array,
              );
            }
          }
        }
        if (this.lodFallOffFactor.farSubNear > 0) {
          this._uniformBuffer.updateFloat4(
            "vLodFallOff",
            this.lodFallOffFactor.near,
            this.lodFallOffFactor.farSubNear,
            this.lodFallOffFactor.radMax,
            this.lodFallOffFactor.iradMax,
          );
        }
        if (this.pointsCloud) {
          this._uniformBuffer.updateFloat("pointSize", this.pointSize);
        }
        this._uniformBuffer.updateColor4(
          "vDiffuseColor",
          this._diffuseColor,
          this.alpha * mesh.visibility,
        );
      }
      if (scene.texturesEnabled) {
        if (
          this._diffuseTexture &&
          StandardMaterial.DiffuseTextureEnabled
        ) {
          effect.setTexture("diffuseSampler", this._diffuseTexture);
        }
        if (this._aoTexture) effect.setTexture("aoSampler", this._aoTexture);
        if (this._reflectivityRoughnessTexture) {
          effect.setTexture(
            "reflectivityRoughnessSampler",
            this._reflectivityRoughnessTexture,
          );
        }
        if (probeManager?.radianceMap) {
          effect.setTexture("radSampler", probeManager.radianceMap);
        }
        if (this._environmentBRDFTexture) {
          effect.setTexture(
            "environmentBrdfSampler",
            this._environmentBRDFTexture,
          );
        }
      }
      BindClipPlane(effect, this, scene);
      const eyePosition =
        scene._forcedViewPosition ??
        scene._mirroredCameraPosition ??
        scene.activeCamera!.globalPosition;
      const handedness =
        scene.useRightHandedSystem ===
        (scene._mirroredCameraPosition != null);
      effect.setFloat4(
        "vEyePosition",
        eyePosition.x,
        eyePosition.y,
        eyePosition.z,
        handedness ? -1 : 1,
      );
    }

    if (probeManager) {
      const iblData = probeManager.getIBLData(mesh.uniqueId)!;
      const hasGroup = probeManager.hasGroup();
      const usesDynamicRatios =
        hasGroup || (probeManager.aabb && probeManager.aabb.useDyao);
      if (iblData.isDirty) probeManager.updateDynamicRatios(mesh, iblData);
      if (
        hasGroup &&
        (mustRebind || iblData.groupId !== this._lastBindedLPGroupId)
      ) {
        this._lastBindedLPGroupId = iblData.groupId;
        const probes = probeManager.getGroup(iblData.groupId)!.probes;
        effect.setTexture("iradSampler0", probes[0].texture);
        effect.setTexture("iradSampler1", probes[1].texture);
        effect.setTexture("iradSampler4", probes[4].texture);
        effect.setTexture("iradSampler5", probes[5].texture);
        effect.setTexture("iradSampler2", probes[2].texture);
        effect.setTexture("iradSampler3", probes[3].texture);
        effect.setTexture("iradSampler6", probes[6].texture);
        effect.setTexture("iradSampler7", probes[7].texture);
      }
      if (usesDynamicRatios) {
        effect.setArray("vDynamicRatios", Array.from(iblData.dynamicRatios));
      }
    }
    this._uniformBuffer.update();
    this._afterBind(mesh, this._activeEffect);
  }

  getAnimatables(): IAnimatable[] {
    return materialTextures(this).filter(
      (texture) => texture.animations && texture.animations.length > 0,
    );
  }

  getActiveTextures(): BaseTexture[] {
    const activeTextures = super.getActiveTextures();
    activeTextures.push(...materialTextures(this));
    return activeTextures;
  }

  hasTexture(texture: BaseTexture): boolean {
    return (
      super.hasTexture(texture) || materialTextures(this).includes(texture)
    );
  }

  dispose(
    forceDisposeEffect?: boolean,
    forceDisposeTextures?: boolean,
  ): void {
    if (forceDisposeTextures) {
      for (const texture of materialTextures(this)) texture.dispose();
      if (
        this._environmentBRDFTexture &&
        this.getScene().environmentBRDFTexture !==
          this._environmentBRDFTexture
      ) {
        this._environmentBRDFTexture.dispose();
      }
    }
    this._lightProbeManager = null;
    super.dispose(forceDisposeEffect, forceDisposeTextures);
  }

  clone(_name: string): DynamicIBLMaterial {
    throw new Error("Dynamic table materials cannot be duplicated.");
  }
}

import { AbstractMesh, Scene, TransformNode } from "@babylonjs/core";
import HdrCubeTexture from "./HdrCubeTexture.ts";
import IBLMeshData from "./IBLMeshData.ts";
import LightProbe from "./LightProbe.ts";
import LightProbeAABB from "./LightProbeAABB.ts";
import LightProbeGroupCube from "./LightProbeGroupCube.ts";

interface LightProbeConfig {
  id: string;
  aabbPosition?: ArrayLike<number>;
  aabbSizeMin?: ArrayLike<number>;
  aabbSizeMax?: ArrayLike<number>;
  aabbAO?: ArrayLike<number>;
  lpx?: number[];
  lpy?: number[];
  lpz?: number[];
}

export default class LightProbeManager {
  get id() { return this._id; }

  private _isReady: boolean;
  radianceLevel: number;
  radianceMap: HdrCubeTexture | null;
  irradianceLevel: number;
  private readonly _probes: LightProbe[];
  private readonly _groups: LightProbeGroupCube[];
  private _cachedIBLDatas: Record<string, IBLMeshData>;
  aabb: LightProbeAABB | null;
  private readonly _id: string;
  readonly _onMeshTransformDirty: (mesh: TransformNode) => void;
  private readonly _onMeshDisposed: (mesh: AbstractMesh) => void;

  constructor(
    scene: Scene,
    radianceUrl: string,
    irradianceUrls: string[],
    config: LightProbeConfig,
  ) {
    this._isReady = false;
    this.radianceLevel = 1;
    this.radianceMap = null;
    this.irradianceLevel = 1;
    this._probes = [];
    this._groups = [];
    this._cachedIBLDatas = Object.create(null);
    this.aabb = null;
    this._id = config.id;
    this._onMeshTransformDirty = (mesh: TransformNode) => {
      this.getIBLData(mesh.uniqueId)!.isDirty = true;
    };
    this._onMeshDisposed = (mesh: AbstractMesh) => {
      this.deleteIBLData(mesh.uniqueId);
    };

    this.radianceMap = radianceUrl && radianceUrl.length
      ? new HdrCubeTexture(scene, this._id + "-r", radianceUrl)
      : null;
    if (config.aabbPosition && config.aabbSizeMin && config.aabbSizeMax) {
      this.aabb = new LightProbeAABB(
        config.aabbPosition,
        config.aabbSizeMin,
        config.aabbSizeMax,
      );
      if (config.aabbAO) {
        this.aabb.aoCenter = config.aabbAO[0];
        this.aabb.aoOffset = config.aabbAO[1] - config.aabbAO[0];
        this.aabb.aoRangeY = config.aabbAO[2];
        this.aabb.useDyao = true;
      }
    }

    const xs = config.lpx;
    const ys = config.lpy;
    const zs = config.lpz;
    if (
      xs && xs.length !== 0 &&
      ys &&
      zs && zs.length !== 0 &&
      irradianceUrls && irradianceUrls.length !== 0
    ) {
      if (ys.length !== 2) {
        throw new Error(
          "Lighting probe configuration requires exactly two Y levels.",
        );
      }
      for (let yIndex = 0; yIndex !== ys.length; yIndex++) {
        const url = irradianceUrls[yIndex];
        let dataIndex = 0;
        for (const z of zs) {
          for (const x of xs) {
            const texture = new HdrCubeTexture(
              scene,
              this._id + "-i" + dataIndex,
              url,
              dataIndex++,
            );
            this._probes.push(new LightProbe(x, ys[yIndex], z, texture));
          }
        }
      }

      const xLast = xs.length - 1;
      const zLast = zs.length - 1;
      const layerSize = xs.length * zs.length;
      const groupCount = xLast * zLast;
      for (let id = 0; id !== groupCount; id++) {
        const p0 = id + Math.floor(id / xLast);
        const p1 = p0 + 1;
        const p3 = p1 + xLast;
        const p2 = p3 + 1;
        this._groups.push(new LightProbeGroupCube(id, [
          this._probes[p0],
          this._probes[p1],
          this._probes[p1 + layerSize],
          this._probes[p0 + layerSize],
          this._probes[p3],
          this._probes[p2],
          this._probes[p2 + layerSize],
          this._probes[p3 + layerSize],
        ]));
      }
      for (let id = 0; id !== groupCount; id++) {
        const group = this._groups[id];
        group.right = id - xLast >= 0 ? this._groups[id - xLast] : null;
        group.front = id % xLast < xLast - 1 ? this._groups[id + 1] : null;
        group.left = id + xLast < groupCount ? this._groups[id + xLast] : null;
        group.back = id % xLast > 0 ? this._groups[id - 1] : null;
      }
    } else {
      this._probes.length = 0;
      this._groups.length = 0;
    }
  }

  hasGroup(): boolean { return this._groups.length > 0; }
  getGroup(index: number): LightProbeGroupCube | undefined {
    return this._groups[index];
  }

  isReady(): boolean {
    if (!this._isReady) {
      if (this.radianceMap && !this.radianceMap.isReadyOrNotBlocking()) {
        return false;
      }
      for (const probe of this._probes) {
        if (probe.texture && !probe.texture.isReadyOrNotBlocking()) return false;
      }
      this._isReady = true;
    }
    return this._isReady;
  }

  dispose(): void {
    this._isReady = false;
    for (const group of this._groups) group.release();
    for (const probe of this._probes) probe.dispose();
    this._groups.length = 0;
    this._probes.length = 0;
    if (this.radianceMap) {
      this.radianceMap.dispose();
      this.radianceMap = null;
    }
    this._cachedIBLDatas = Object.create(null);
  }

  watchMesh(mesh: AbstractMesh): void {
    if (!this.getIBLData(mesh.uniqueId, true)) {
      this.getIBLData(mesh.uniqueId);
      mesh.registerAfterWorldMatrixUpdate(this._onMeshTransformDirty);
      mesh.onDispose = () => this._onMeshDisposed(mesh);
    }
  }

  getIBLData(
    id: string | number,
    skipCreate = false,
  ): IBLMeshData | undefined {
    const key = id + "";
    let data = this._cachedIBLDatas[key];
    if (!data && !skipCreate) {
      data = new IBLMeshData();
      this._cachedIBLDatas[key] = data;
    }
    return data;
  }

  deleteIBLData(id: string | number): void {
    const key = id + "";
    if (this._cachedIBLDatas[key]) delete this._cachedIBLDatas[key];
  }

  updateDynamicRatios(
    mesh: AbstractMesh,
    data: IBLMeshData,
  ): void {
    data.isDirty = false;
    let x;
    let z;
    const ratios = data.dynamicRatios;
    // Lucky Break's standalone balls live directly in table-local space.
    // NY's native ball geometry is parented beneath world-space pivots, so
    // probe selection must use the rendered absolute position.
    const position = mesh.getAbsolutePosition();
    let y = 0;
    if (this._groups.length > 0) {
      const epsilon = 1e-5;
      let group = data.groupId !== -1
        ? this._groups[data.groupId]
        : this._groups[0];
      x = position.x - group.probes[0].x;
      z = position.z - group.probes[0].z;
      if (x < -epsilon) {
        while (
          group.back &&
          (group = group.back) &&
          (x = position.x - group.probes[0].x) < -epsilon
        ) {}
      } else {
        while (x > group.size.x + epsilon && group.front) {
          group = group.front;
          x = position.x - group.probes[0].x;
        }
      }
      if (z < -epsilon) {
        while (
          group.right &&
          (group = group.right) &&
          (z = position.z - group.probes[0].z) < -epsilon
        ) {}
      } else {
        while (z > group.size.z + epsilon && group.left) {
          group = group.left;
          z = position.z - group.probes[0].z;
        }
      }
      data.groupId = group.id;
      x /= group.size.x;
      y = (position.y - group.probes[0].y) / group.size.y;
      z /= group.size.z;
      if (x < epsilon) x = 0;
      else if (x > 1 - epsilon) x = 1;
      if (y < epsilon) y = 0;
      else if (y > 1 - epsilon) y = 1;
      if (z < epsilon) z = 0;
      else if (z > 1 - epsilon) z = 1;
      const inverseX = 1 - x;
      const inverseY = 1 - y;
      const inverseZ = 1 - z;
      ratios[0] = inverseX * inverseY * inverseZ;
      ratios[1] = x * inverseY * inverseZ;
      ratios[4] = inverseX * inverseY * z;
      ratios[5] = x * inverseY * z;
      if (y > epsilon) {
        ratios[2] = x * y * inverseZ;
        ratios[3] = inverseX * y * inverseZ;
        ratios[6] = x * y * z;
        ratios[7] = inverseX * y * z;
      } else {
        ratios[2] = -1;
      }
    }

    const aabb = this.aabb;
    if (aabb && aabb.useDyao) {
      y = Math.max(0, position.y - aabb.array[1]);
      if (y < aabb.aoRangeY) {
        ratios[8] = 1 - y / aabb.aoRangeY;
        x = position.x - aabb.array[0];
        z = position.z - aabb.array[2];
        const radialDistanceSq = x * x + z * z;
        ratios[8] *=
          aabb.aoCenter +
          aabb.aoOffset *
            Math.min(1, radialDistanceSq / aabb.aoRangeXZSq);
      } else {
        ratios[8] = 0;
      }
    } else {
      ratios[8] = 1;
    }
  }
}

import { HDRTools, Scene, Tools } from "@babylonjs/core";
import CubeMapData from "./CubeMapData.ts";

export default class CubeMapDataManager {
  private static _sharedInstance: CubeMapDataManager | null = null;
  private static _tmpCanvas: HTMLCanvasElement | null = null;
  private _cachedDatas: Record<string, CubeMapData[]>;
  private _pendingDatas: Record<string, boolean>;

  constructor() {
    this._cachedDatas = {};
    this._pendingDatas = {};
    if (CubeMapDataManager._sharedInstance) {
      throw new Error("Only one cube-map data manager may be created.");
    }
  }

  static tmpCanvas(): HTMLCanvasElement {
    if (!CubeMapDataManager._tmpCanvas) {
      CubeMapDataManager._tmpCanvas = document.createElement("canvas");
    }
    return CubeMapDataManager._tmpCanvas;
  }

  static getInstance(): CubeMapDataManager {
    if (!CubeMapDataManager._sharedInstance) {
      CubeMapDataManager._sharedInstance =
        new CubeMapDataManager();
    }
    return CubeMapDataManager._sharedInstance;
  }

  getData(
    scene: Scene,
    url: string,
    dataIndex = 0,
    skipLoad = false,
  ): CubeMapData | null {
    const cached = this._cachedDatas[url];
    if (cached) {
      if (dataIndex >= cached.length || dataIndex < 0) dataIndex = 0;
      return cached[dataIndex];
    }
    if (!skipLoad && !this._pendingDatas[url]) {
      this.__loadAndCache(scene, url);
    }
    return null;
  }

  getDataLen(url: string): number {
    const cached = this._cachedDatas[url];
    return cached ? cached.length : 0;
  }

  clear(): void {
    this._cachedDatas = {};
    this._pendingDatas = {};
  }

  private __loadAndCache(scene: Scene, url: string): void {
    this._pendingDatas[url] = true;
    if (/\.hdr$/.test(url)) {
      Tools.LoadFile(
        url,
        (data: string | ArrayBuffer) => {
          if (this._pendingDatas[url]) {
            this.__parseAndCacheHdrData(data as ArrayBuffer, url);
          }
        },
        undefined,
        undefined,
        true,
        undefined,
      );
    } else {
      Tools.LoadImage(
        url,
        (image: HTMLImageElement | ImageBitmap) => {
          if (this._pendingDatas[url]) {
            this.__parseAndCacheLdrData(image, url);
          }
        },
        (message, error) => {
          if (message) throw new Error(message);
          if (error) throw error;
        },
        null,
      );
    }
  }

  __parseAndSaveCubeMapDatas(
    url: string,
    source: ArrayLike<number>,
    sourceWidth: number,
    sourceHeight: number,
    channels: number,
    divisor: number,
    exponent: number,
  ): void {
    const faceSize = sourceHeight / 6;
    const cubeMapCount = sourceWidth / faceSize;
    if (
      cubeMapCount < 1 ||
      cubeMapCount !== Math.floor(cubeMapCount) ||
      faceSize !== Math.floor(faceSize)
    ) {
      throw new Error(`Cube-map data has an unexpected size: ${url}`);
    }

    const cubeMaps: CubeMapData[] = [];
    for (let cubeIndex = 0; cubeIndex < cubeMapCount; cubeIndex++) {
      const cubeMap = new CubeMapData(faceSize);
      for (let face = 0; face < 6; face++) {
        const faceData = cubeMap.getFaceData(face);
        for (let row = 0; row < faceSize; row++) {
          const faceRowOffset = row * faceSize;
          const sourceRowOffset =
            (row + faceSize * face) * sourceWidth +
            cubeIndex * faceSize;
          for (let column = 0; column < faceSize; column++) {
            const destinationPixel = faceRowOffset + column;
            const sourcePixel = sourceRowOffset + column;
            faceData[3 * destinationPixel] = Math.pow(
              source[channels * sourcePixel] / divisor,
              exponent,
            );
            faceData[3 * destinationPixel + 1] = Math.pow(
              source[channels * sourcePixel + 1] / divisor,
              exponent,
            );
            faceData[3 * destinationPixel + 2] = Math.pow(
              source[channels * sourcePixel + 2] / divisor,
              exponent,
            );
          }
        }
      }
      cubeMaps[cubeIndex] = cubeMap;
    }
    this._cachedDatas[url] = cubeMaps;
    this._pendingDatas[url] = false;
  }

  private __parseAndCacheHdrData(data: ArrayBuffer, url: string): void {
    const bytes = new Uint8Array(data);
    const header = HDRTools.RGBE_ReadHeader(bytes);
    const pixels = HDRTools.RGBE_ReadPixels(bytes, header);
    this.__parseAndSaveCubeMapDatas(
      url,
      pixels,
      header.width,
      header.height,
      3,
      1,
      1,
    );
  }

  private __parseAndCacheLdrData(
    image: HTMLImageElement | ImageBitmap,
    url: string,
  ): void {
    const width = image.width;
    const height = image.height;
    const canvas = CubeMapDataManager.tmpCanvas();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Cube-map processing requires 2D canvas support.");
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    this.__parseAndSaveCubeMapDatas(
      url,
      context.getImageData(0, 0, width, height).data,
      width,
      height,
      4,
      255,
      2.2,
    );
  }
}

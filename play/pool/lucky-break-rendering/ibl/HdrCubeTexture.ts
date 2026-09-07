import { BaseTexture, Engine, Scene, Texture } from "@babylonjs/core";
import CubeMapDataManager from "./CubeMapDataManager.ts";

export default class HdrCubeTexture extends BaseTexture {
  private isGC: boolean;
  readonly url: string;
  readonly dataIndex: number;

  constructor(
    scene: Scene,
    name: string,
    url: string,
    dataIndex = 0,
  ) {
    super(scene);
    this.coordinatesMode = Texture.CUBIC_MODE;
    this.isGC = false;
    this.hasAlpha = false;
    this.isCube = true;
    this.gammaSpace = false;
    this.lodGenerationScale = 1;
    this.name = name;
    this.url = url;
    this.dataIndex = dataIndex;
    this.__initInternalTexture();
  }

  private __initInternalTexture(): void {
    const scene = this.getScene();
    if (!scene) return;
    const data = CubeMapDataManager.getInstance().getData(
      scene,
      this.url,
      this.dataIndex,
    );
    if (!data) return;
    const engine = scene.getEngine();
    this._texture = engine.createRawCubeTexture(
      data.getFaceArray(),
      data.fsize,
      Engine.TEXTUREFORMAT_RGB,
      engine.getCaps().textureFloat
        ? Engine.TEXTURETYPE_FLOAT
        : Engine.TEXTURETYPE_UNSIGNED_INT,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      null,
    );
    this._texture.isReady = true;
  }

  isReady(): boolean {
    if (!this._texture) this.__initInternalTexture();
    return super.isReady();
  }

  clone(): never {
    throw new Error("HDR cube textures cannot be duplicated.");
  }

  dispose(): void {
    if (!this.isGC) {
      this.isGC = true;
      super.dispose();
    }
  }
}

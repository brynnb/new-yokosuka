import { BaseTexture, Vector3 } from "@babylonjs/core";

export default class LightProbe extends Vector3 {
  texture: BaseTexture | null;

  constructor(
    x: number,
    y: number,
    z: number,
    texture: BaseTexture | null = null,
  ) {
    super(x, y, z);
    this.texture = texture;
  }

  dispose() {
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }
}

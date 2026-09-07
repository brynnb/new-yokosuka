export default class CubeMapData {
  private readonly _faceDatas: Float32Array[];
  readonly fsize: number;

  constructor(faceSize: number) {
    this._faceDatas = [];
    this.fsize = faceSize;
    for (let face = 0; face < 6; face++) {
      this._faceDatas[face] = new Float32Array(faceSize * faceSize * 3);
    }
  }

  getFaceData(face: number): Float32Array {
    return this._faceDatas[face];
  }

  getFaceArray(): Float32Array[] {
    return this._faceDatas;
  }
}

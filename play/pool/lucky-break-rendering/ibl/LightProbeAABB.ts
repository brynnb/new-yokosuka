export default class LightProbeAABB {
  readonly array: Float32Array;
  useDyao: boolean;
  aoCenter: number;
  aoOffset: number;
  aoRangeY: number;
  aoRangeXZSq: number;

  constructor(
    position: ArrayLike<number>,
    sizeMin: ArrayLike<number>,
    sizeMax: ArrayLike<number>,
  ) {
    this.array = new Float32Array(9);
    this.useDyao = false;
    this.aoCenter = 1;
    this.aoOffset = 0;
    this.aoRangeY = 0;
    this.aoRangeXZSq = 0;
    const values = this.array;
    values[0] = position[0];
    values[1] = position[1];
    values[2] = position[2];
    values[3] = sizeMin[0] - position[0];
    values[4] = sizeMin[1] - position[1];
    values[5] = sizeMin[2] - position[2];
    values[6] = sizeMax[0] - position[0];
    values[7] = sizeMax[1] - position[1];
    values[8] = sizeMax[2] - position[2];
    this.aoRangeY = values[7];
    const halfX = 0.5 * (sizeMax[0] - sizeMin[0]);
    const halfZ = 0.5 * (sizeMax[2] - sizeMin[2]);
    this.aoRangeXZSq = halfX * halfX + halfZ * halfZ;
  }
}

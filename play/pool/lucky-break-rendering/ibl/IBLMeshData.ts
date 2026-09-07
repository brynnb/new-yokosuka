export default class IBLMeshData {
  groupId: number;
  dynamicRatios: Float32Array;
  isDirty: boolean;

  constructor() {
    this.groupId = -1;
    this.dynamicRatios = new Float32Array(9);
    this.isDirty = false;
    this.isDirty = true;
  }
}

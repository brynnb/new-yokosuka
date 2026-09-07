import { Vector3 } from "@babylonjs/core";
import type LightProbe from "./LightProbe.ts";

export default class LightProbeGroupCube {
  left: LightProbeGroupCube | null;
  right: LightProbeGroupCube | null;
  front: LightProbeGroupCube | null;
  back: LightProbeGroupCube | null;
  readonly size: Vector3;
  readonly id: number;
  readonly probes: LightProbe[];

  constructor(id: number, probes: LightProbe[]) {
    this.left = null;
    this.right = null;
    this.front = null;
    this.back = null;
    this.size = new Vector3(0, 0, 0);
    this.id = id;
    this.probes = probes;
    this.size.copyFromFloats(
      probes[1].x - probes[0].x,
      probes[3].y - probes[0].y,
      probes[4].z - probes[0].z,
    );
    if (!LightProbeGroupCube.validate(this)) {
      console.error(`[Lucky Break lighting] Probe cube "${id}" is invalid.`);
      this.log();
      throw new Error(`Lighting probe cube "${id}" is malformed.`);
    }
  }

  release(): void {
    this.probes.length = 0;
    this.left = null;
    this.right = null;
    this.front = null;
    this.back = null;
  }

  log(indices: number[] | null = null): void {
    let output = "";
    const probes = this.probes;
    if (probes) {
      if (indices) {
        for (const index of indices) {
          output +=
            index + ": " + probes[index].x + "|" + probes[index].y +
            "|" + probes[index].z + "\n";
        }
      } else {
        for (let index = 0; index !== probes.length; index++) {
          output +=
            index + ": " + probes[index].x + "|" + probes[index].y +
            "|" + probes[index].z + "\n";
        }
      }
      console.log(
        "[Lucky Break lighting] Probe layout\n" + output + "\nextent: {" +
          this.size.x + "," + this.size.y + "," + this.size.z + "}",
      );
    } else {
      console.log("[Lucky Break lighting] Probe group is empty.");
    }
  }

  static validate(group: LightProbeGroupCube): boolean {
    const probes = group.probes;
    const epsilon = 1e-6;
    const size = group.size;
    return Boolean(probes) &&
      size.x >= epsilon &&
      Math.abs(probes[2].x - probes[3].x - size.x) <= epsilon &&
      Math.abs(probes[6].x - probes[7].x - size.x) <= epsilon &&
      Math.abs(probes[5].x - probes[4].x - size.x) <= epsilon &&
      size.y >= epsilon &&
      Math.abs(probes[2].y - probes[1].y - size.y) <= epsilon &&
      Math.abs(probes[6].y - probes[5].y - size.y) <= epsilon &&
      Math.abs(probes[7].y - probes[4].y - size.y) <= epsilon &&
      size.z >= epsilon &&
      Math.abs(probes[5].z - probes[1].z - size.z) <= epsilon &&
      Math.abs(probes[6].z - probes[2].z - size.z) <= epsilon &&
      Math.abs(probes[7].z - probes[3].z - size.z) <= epsilon;
  }
}

import { nativeFloat32FromWord } from "../events/NativeEventNumericRuntime.js";

const f32 = Math.fround;

function vector2(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
    throw new TypeError("native precipitation vertex requires two finite coordinates");
  }
  const words = value.map(f32);
  if (!words.every(Number.isFinite)) throw new TypeError("native precipitation vertex overflows float32");
  return Object.freeze(words);
}

export function prepareNativePrecipitationExclusion({ vertices, lower, upper }) {
  if (!Array.isArray(vertices) || vertices.length !== 4
    || !Number.isFinite(lower) || !Number.isFinite(upper)) {
    throw new TypeError("native precipitation exclusion requires four vertices and two finite heights");
  }
  const points = Object.freeze(vertices.map(vector2));
  if (!Number.isFinite(f32(lower)) || !Number.isFinite(f32(upper))) throw new TypeError("native precipitation height overflows float32");
  const edges = Object.freeze(points.map((point, i) => Object.freeze([
    f32(points[(i + 1) % 4][0] - point[0]), f32(points[(i + 1) % 4][1] - point[1]),
  ])));
  // Do not sort heights or normalize winding. They are authored native inputs;
  // reversing a polygon or lower/upper order genuinely changes its predicate.
  return Object.freeze({ vertices: points, edges, lower: f32(lower), upper: f32(upper),
    minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
    minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])) });
}

/** Native 0xc1c2b64 exclusion test, in original scene coordinates. */
export function nativePrecipitationExcluded(volume, x, y, z) {
  const px = f32(x), py = f32(y), pz = f32(z);
  if (py < volume.lower || py > volume.upper || px < volume.minX || px > volume.maxX
    || pz < volume.minZ || pz > volume.maxZ) return false;
  return volume.vertices.every((point, i) => {
    const [dx, dz] = volume.edges[i];
    const cross = f32(f32(f32(px - point[0]) * dz) - f32(f32(pz - point[1]) * dx));
    return cross < 0;
  });
}

/** FIXC ownership is separate from WAIR; releasing WAIR does not destroy it. */
export class NativePrecipitationFieldState {
  constructor(contract) {
    if (contract?.fieldTag !== "FIXC" || contract.affectedFieldKind !== 1
      || contract.defaultFactoryFlags !== 0x38e3
      || contract.componentCounts?.rain !== 2 || contract.componentCounts?.snow !== 1
      || contract.componentCounts?.splash !== 1) throw new TypeError("native precipitation source contract is unavailable");
    this.contract = contract;
    this.padding = nativeFloat32FromWord(contract.heightPaddingWord);
    if (!Number.isFinite(this.padding) || this.padding < 0) throw new TypeError("native precipitation padding is unavailable");
    this.fields = new Map();
  }

  activateDefault() {
    if (this.fields.has("default")) return false;
    this.register({ id: "default", kind: 1, factoryFlags: this.contract.defaultFactoryFlags,
      components: this.contract.componentCounts });
    return true;
  }

  register({ id, kind, factoryFlags, components }) {
    if (typeof id !== "string" || !id || this.fields.has(id) || !Number.isInteger(kind)
      || kind < 0 || kind > 6 || !Number.isInteger(factoryFlags) || factoryFlags < 0 || factoryFlags > 0xffffffff
      || Object.keys(components || {}).length !== 3
      || ["rain", "snow", "splash"].some(k => !Number.isInteger(components?.[k]) || components[k] < 0 || components[k] > 2)) {
      throw new TypeError("native precipitation field ownership is malformed");
    }
    this.fields.set(id, { id, kind, factoryFlags,
      regions: Object.fromEntries(Object.entries(components).map(([k, count]) => [k, Array(count).fill(null)])) });
  }

  apply(detail) {
    if (detail.operationId !== 0x0179 || detail.mode !== 38
      || detail.vectorWordGroups?.length !== 4 || detail.scalarFloatWords?.length !== 2) {
      return { status: "stopped", reason: "native-precipitation-field-route-unproved" };
    }
    const vertices = detail.vectorWordGroups.map(group => group.map(nativeFloat32FromWord));
    const [lower, upper] = detail.scalarFloatWords.map(nativeFloat32FromWord);
    const volume = prepareNativePrecipitationExclusion({ vertices,
      lower: f32(lower - this.padding), upper: f32(upper + this.padding) });
    const affected = [];
    for (const field of this.fields.values()) {
      if (field.kind !== this.contract.affectedFieldKind) continue;
      if (!Object.values(field.regions).some(regions => regions.length > 0)) continue;
      for (const regions of Object.values(field.regions)) {
        for (let i = 0; i < regions.length; i += 1) regions[i] = volume;
      }
      affected.push(field.id);
    }
    return { nativeNoOp: affected.length === 0, mutation: { affectedFields: affected, volume } };
  }

  readExclusions() {
    // The browser has one rain system, not two native rain-layer systems.
    // Their first exclusion receives exactly the same four vertices/heights.
    return Object.fromEntries(["rain", "snow"].map(weather => [weather,
      [...this.fields.values()].flatMap(field => field.regions[weather]?.[0] ? [field.regions[weather][0]] : [])]));
  }

  snapshot() { return structuredClone([...this.fields]); }
  restore(snapshot) { this.fields = new Map(structuredClone(snapshot)); }
}

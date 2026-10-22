/** Source-initialized module data, owned by a personal room session.
 * Addresses are normalized MAPINFO file offsets, never native RAM addresses.
 * The compiler verifies the source/pool hashes; the program loader verifies
 * the containing package before synchronous transaction preparation.
 */
export class NativeProgramDataMemory {
  constructor() { this.source = null; this.bytes = null; }

  prepare(source) {
    if (source?.schema !== "new-yokosuka-native-program-data-v1" || source.encoding !== "base64"
      || !/^[0-9a-f]{64}$/.test(source.sourceSha256 ?? "") || !/^[0-9a-f]{64}$/.test(source.sha256 ?? "")
      || !Number.isInteger(source.baseFileOffset) || source.baseFileOffset < 0
      || !Number.isInteger(source.byteLength) || source.byteLength < 1
      || source.baseFileOffset + source.byteLength > 0x100000000 || typeof source.data !== "string") {
      throw new TypeError("native program-data descriptor is malformed");
    }
    if (this.source) {
      if (["schema", "sourceSha256", "baseFileOffset", "byteLength", "sha256", "encoding", "data"]
        .some(key => this.source[key] !== source[key])) throw new Error("native program data belongs to a different source; reload its area first");
      return false; // Existing script writes survive a repeat program start.
    }
    const decoded = Uint8Array.from(atob(source.data), char => char.charCodeAt(0));
    if (decoded.length !== source.byteLength) throw new Error("native program-data byte length does not match its source");
    this.source = { ...source };
    this.bytes = decoded;
    return true;
  }

  access(pointer, index, width) {
    if (![1, 2, 4].includes(width)) throw new TypeError("native data access width is invalid");
    if (!this.source || !this.bytes) throw new Error("native program data is unavailable");
    for (const [name, value] of [["pointer", pointer], ["index", index]]) {
      if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) throw new TypeError(`native data ${name} must be a 32-bit word`);
    }
    const base = pointer >>> 0;
    const address = (base + Math.imul(index, width)) >>> 0;
    const start = this.source.baseFileOffset, end = start + this.bytes.length;
    if (base < start || base >= end || address < start || address + width > end || address % width !== 0) {
      throw new RangeError(`native data access outside its owned/aligned range: 0x${address.toString(16)}, width ${width}`);
    }
    return { view: new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength), offset: address - start };
  }

  read(pointer, index, width) {
    const { view, offset } = this.access(pointer, index, width);
    return width === 1 ? view.getUint8(offset) : width === 2 ? view.getUint16(offset, true) : view.getUint32(offset, true);
  }

  write(pointer, index, width, word) {
    if (!Number.isInteger(word) || word < -0x80000000 || word > 0xffffffff) throw new TypeError("native data write requires a 32-bit word");
    const { view, offset } = this.access(pointer, index, width);
    if (width === 1) view.setUint8(offset, word & 255);
    else if (width === 2) view.setUint16(offset, word & 65535, true);
    else view.setUint32(offset, word >>> 0, true);
  }
}

export function createNativeTypedTableSemanticHandlers() {
  const widths = { 1: 1, 2: 2, 4: 4, 5: 4, 8: 4, 11: 1, 12: 2, 14: 4, 15: 4, 18: 4 };
  return {
    "typed-indexed-table-access": async ({ action, context, readArgument }) => {
      try {
        const rawMode = readArgument(1);
        if (!Number.isInteger(rawMode) || rawMode < -0x80000000 || rawMode > 0xffffffff) throw new TypeError("native typed-table mode must be a 32-bit word");
        const mode = rawMode >>> 0, width = widths[mode];
        if (!width) return { status: "continued", result: 0, nativeNoOp: true };
        const memory = context.getNativeProgramDataMemory?.();
        if (!(memory instanceof NativeProgramDataMemory)) return { status: "stopped", reason: "native typed-table memory is unavailable" };
        const pointer = readArgument(0), index = readArgument(2);
        if (mode < 10) {
          if (action.arguments.length !== 3) throw new Error("native typed-table read shape is invalid");
          const word = memory.read(pointer, index, width);
          // Native float returns preserve the original bits in the VM cell.
          // Mode eight adds the module's static-data base to a relative word.
          return { status: "continued", result: mode === 8 ? (memory.source.baseFileOffset + word) >>> 0 : word };
        }
        if (action.arguments.length !== 4) throw new Error("native typed-table write shape is invalid");
        const word = readArgument(3);
        memory.write(pointer, index, width, word);
        return { status: "continued", result: 0, mutation: { pointer, index, mode, word: word >>> 0 } };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}

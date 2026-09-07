const TABLE_BASE_ADDRESS = 0x0c21c7c4;
const RECORD_STRIDE_BYTES = 96;
const RECORD_COUNT = 17;

function stopped(reason) {
  return { status: "stopped", reason };
}

export class NativeOperation01adState {
  constructor() {
    this.values = new Uint32Array(RECORD_COUNT);
  }

  write(index, value) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= RECORD_COUNT) {
      throw new RangeError("native fixed-stride record index is out of range");
    }
    const previous = this.values[index];
    this.values[index] = value >>> 0;
    return { previous, value: this.values[index] };
  }

  read(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= RECORD_COUNT) {
      return null;
    }
    return this.values[index];
  }

  clear() {
    this.values.fill(0);
  }
}

export function createNativeOperation01adState() {
  return new NativeOperation01adState();
}

export function createNativeOperation01adSemanticHandlers({
  state = createNativeOperation01adState(),
  writeNativeFixedStrideRecordDword,
} = {}) {
  return {
    "native-fixed-stride-record-dword-write": async ({ context, readArgument }) => {
      const index = readArgument(0);
      const value = readArgument(1);
      if (!Number.isSafeInteger(index) || index < 0 || index >= RECORD_COUNT) {
        return stopped("native-operation-01ad-index-unproved");
      }
      if (value !== 0 && value !== 1) {
        return stopped("native-operation-01ad-value-unproved");
      }
      const address = TABLE_BASE_ADDRESS + index * RECORD_STRIDE_BYTES;
      const write = writeNativeFixedStrideRecordDword
        || context.writeNativeFixedStrideRecordDword;
      const mutation = typeof write === "function"
        ? await write({ index, address, value })
        : state.write(index, value);
      if (
        !mutation
        || !Number.isInteger(mutation.previous)
        || !Number.isInteger(mutation.value)
      ) {
        return stopped("native-operation-01ad-write-result-invalid");
      }
      return {
        status: "continued",
        mutation: {
          index,
          address,
          previous: mutation.previous >>> 0,
          value: mutation.value >>> 0,
        },
      };
    },
  };
}

export const NATIVE_OPERATION_01AD_TABLE = Object.freeze({
  baseAddress: TABLE_BASE_ADDRESS,
  recordStrideBytes: RECORD_STRIDE_BYTES,
  recordCount: RECORD_COUNT,
});

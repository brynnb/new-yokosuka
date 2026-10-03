const PARAMETER_BYTE_LENGTH = 32;
const RECORD_BYTE_LENGTH = 48;

function requireByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`native operation 0x01c7 ${name} must be a byte`);
  }
  return value;
}

function requireBytes(values, length, name) {
  if (
    !Array.isArray(values)
    && !(values instanceof Uint8Array)
  ) {
    throw new TypeError(
      `native operation 0x01c7 ${name} must be byte-oriented`,
    );
  }
  if (
    values.length !== length
    || Array.from(values).some(
      value => !Number.isInteger(value) || value < 0 || value > 0xff,
    )
  ) {
    throw new RangeError(
      `native operation 0x01c7 ${name} must contain ${length} bytes`,
    );
  }
  return Uint8Array.from(values);
}

function requireOffset(offset, width) {
  if (
    !Number.isInteger(offset)
    || offset < 0
    || offset + width > PARAMETER_BYTE_LENGTH
  ) {
    throw new RangeError(
      `native operation 0x01c7 ${width}-byte parameter offset is out of range`,
    );
  }
  return offset;
}

export class NativeOperation01c7State {
  constructor() {
    this.statusByte = undefined;
    this.booleanDword = undefined;
    this.parameterBytes = undefined;
    this.recordBytes = undefined;
    this.consumableLoadByte = undefined;
  }

  // Explicit cold-image startup, not a replacement for loading a saved game.
  // The hashed executable has zeros here. Its status reset does NOT zero the
  // saved parameters: see tools/evidence/operation-01c7-evidence.json.
  initializeColdState() {
    this.statusByte = 0;
    this.consumableLoadByte = 0;
    this.booleanDword = 0;
    this.parameterBytes = new Uint8Array(PARAMETER_BYTE_LENGTH);
    this.recordBytes = new Uint8Array(RECORD_BYTE_LENGTH);
  }

  importSaveSections({ recordBytes, parameterBytes }) {
    // 0xc14aa86 copies both sections; marking the load is a separate native
    // helper. Validate both before replacing either, and own their storage.
    const record = requireBytes(recordBytes, RECORD_BYTE_LENGTH, "record");
    const parameters = requireBytes(parameterBytes, PARAMETER_BYTE_LENGTH, "parameters");
    this.recordBytes = record;
    this.parameterBytes = parameters;
  }

  markLoaded() {
    if (!this.recordBytes || !this.parameterBytes) {
      throw new Error("native-operation-01c7-save-state-unavailable");
    }
    this.consumableLoadByte = 1;
    this.statusByte = 1;
  }

  resetLoadStatus() {
    this.consumableLoadByte = 0;
    this.statusByte = 0;
  }

  consumeLoaded() {
    if (this.consumableLoadByte === undefined) {
      throw new Error("native-operation-01c7-load-state-unavailable");
    }
    if (this.consumableLoadByte === 0) return 0;
    this.consumableLoadByte -= 1;
    return 1;
  }

  readRecordBytes() {
    if (!this.recordBytes) {
      throw new Error("native-operation-01c7-record-state-unavailable");
    }
    return Array.from(this.recordBytes);
  }

  snapshot() {
    return {
      statusByte: this.statusByte,
      consumableLoadByte: this.consumableLoadByte,
      booleanDword: this.booleanDword,
      parameterBytes: this.readParameterBytes(),
      recordBytes: this.recordBytes ? Array.from(this.recordBytes) : undefined,
    };
  }

  restore(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new TypeError("native operation 0x01c7 snapshot must be an object");
    }
    const next = {};
    for (const key of ["statusByte", "consumableLoadByte"]) {
      next[key] = snapshot[key] === undefined
        ? undefined : requireByte(snapshot[key], key);
    }
    if (snapshot.booleanDword !== undefined
      && snapshot.booleanDword !== 0 && snapshot.booleanDword !== 1) {
      throw new RangeError("native operation 0x01c7 Boolean must be zero or one");
    }
    next.booleanDword = snapshot.booleanDword;
    next.parameterBytes = snapshot.parameterBytes === undefined ? undefined
      : requireBytes(snapshot.parameterBytes, PARAMETER_BYTE_LENGTH, "parameters");
    next.recordBytes = snapshot.recordBytes === undefined ? undefined
      : requireBytes(snapshot.recordBytes, RECORD_BYTE_LENGTH, "record");
    Object.assign(this, next);
  }

  configureStatusByte(value) {
    this.statusByte = requireByte(value, "status");
  }

  configureParameterBytes(values) {
    this.parameterBytes = requireBytes(values, PARAMETER_BYTE_LENGTH, "parameters");
  }

  queryStatus() {
    if (this.statusByte === undefined) {
      throw new Error("native-operation-01c7-status-state-unavailable");
    }
    return this.statusByte === 0 ? 0 : -1;
  }

  writeBooleanDword(value) {
    this.booleanDword = value === 0 ? 0 : 1;
    return this.booleanDword;
  }

  readBooleanDword() {
    return this.booleanDword;
  }

  readParameterByte(offset) {
    if (!this.parameterBytes) {
      throw new Error("native-operation-01c7-parameter-state-unavailable");
    }
    return this.parameterBytes[requireOffset(offset, 1)];
  }

  writeParameterByte(offset, value) {
    if (!this.parameterBytes) {
      throw new Error("native-operation-01c7-parameter-state-unavailable");
    }
    this.parameterBytes[requireOffset(offset, 1)] = value & 0xff;
  }

  readParameterFloat(offset) {
    if (!this.parameterBytes) {
      throw new Error("native-operation-01c7-parameter-state-unavailable");
    }
    return new DataView(
      this.parameterBytes.buffer,
      this.parameterBytes.byteOffset,
      this.parameterBytes.byteLength,
    ).getFloat32(requireOffset(offset, 4), true);
  }

  writeParameterFloat(offset, value) {
    if (!this.parameterBytes) {
      throw new Error("native-operation-01c7-parameter-state-unavailable");
    }
    if (typeof value !== "number") {
      throw new TypeError(
        "native operation 0x01c7 float parameter must be numeric",
      );
    }
    new DataView(
      this.parameterBytes.buffer,
      this.parameterBytes.byteOffset,
      this.parameterBytes.byteLength,
    ).setFloat32(requireOffset(offset, 4), value, true);
  }

  readParameterBytes() {
    return this.parameterBytes
      ? Array.from(this.parameterBytes)
      : undefined;
  }
}

export function createNativeOperation01c7State() {
  return new NativeOperation01c7State();
}

export function createNativeOperation01c7SemanticHandlers({
  applyNativeRecord01c7,
} = {}) {
  return {
    "native-operation-01c7-control": async ({
      context,
      readArgument,
    }) => {
      const mode = readArgument(0);
      try {
        if (mode === 0) {
          if (typeof context.queryNativeOperation01c7Status !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-01c7-state-missing",
            };
          }
          return { result: context.queryNativeOperation01c7Status() };
        }
        if (mode === 1) {
          const applyRecord = (
            applyNativeRecord01c7
            || context.applyNativeRecord01c7
          );
          if (typeof applyRecord !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-01c7-record-apply-adapter-missing",
            };
          }
          if (typeof context.readNativeOperation01c7Record !== "function") {
            return { status: "stopped", reason: "native-operation-01c7-state-missing" };
          }
          const accepted = await applyRecord({
            recordAddress: 0x0c220370,
            parameterBufferAddress: 0x0c2203a3,
            recordBytes: context.readNativeOperation01c7Record(),
          });
          if (accepted !== true) {
            return { status: "stopped", reason: "native-operation-01c7-record-apply-rejected" };
          }
          return { status: "continued" };
        }
        if (mode === 2) {
          if (typeof context.writeNativeOperation01c7Boolean !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-01c7-state-missing",
            };
          }
          const value = context.writeNativeOperation01c7Boolean(
            readArgument(1),
          );
          return { mutation: { mode, value } };
        }
        if (mode !== 3) {
          return {
            status: "stopped",
            reason: "native-operation-01c7-mode-unproved",
          };
        }

        const submode = readArgument(1);
        const offset = readArgument(2);
        if (submode === 0 || submode === 1) {
          if (
            typeof context.readNativeOperation01c7ParameterByte !== "function"
            || (
              submode === 1
              && typeof context.writeNativeOperation01c7ParameterByte
                !== "function"
            )
          ) {
            return {
              status: "stopped",
              reason: "native-operation-01c7-state-missing",
            };
          }
          const result = context.readNativeOperation01c7ParameterByte(offset);
          if (submode === 1) {
            const value = readArgument(3) & 0xff;
            context.writeNativeOperation01c7ParameterByte(offset, value);
            return { result, mutation: { mode, submode, offset, value } };
          }
          return { result };
        }
        if (submode === 2 || submode === 3) {
          if (
            typeof context.readNativeOperation01c7ParameterFloat !== "function"
            || (
              submode === 3
              && typeof context.writeNativeOperation01c7ParameterFloat
                !== "function"
            )
          ) {
            return {
              status: "stopped",
              reason: "native-operation-01c7-state-missing",
            };
          }
          const result = context.readNativeOperation01c7ParameterFloat(offset);
          if (submode === 3) {
            const value = readArgument(3);
            context.writeNativeOperation01c7ParameterFloat(offset, value);
            return { result, mutation: { mode, submode, offset, value } };
          }
          return { result };
        }
        return {
          status: "stopped",
          reason: "native-operation-01c7-submode-unproved",
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}

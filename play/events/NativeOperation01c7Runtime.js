const PARAMETER_BYTE_LENGTH = 32;

function requireByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`native operation 0x01c7 ${name} must be a byte`);
  }
  return value;
}

function requireParameterBytes(values) {
  if (
    !Array.isArray(values)
    && !(values instanceof Uint8Array)
  ) {
    throw new TypeError(
      "native operation 0x01c7 parameters must be byte-oriented",
    );
  }
  if (
    values.length !== PARAMETER_BYTE_LENGTH
    || Array.from(values).some(
      value => !Number.isInteger(value) || value < 0 || value > 0xff,
    )
  ) {
    throw new RangeError(
      `native operation 0x01c7 parameters must contain ${
        PARAMETER_BYTE_LENGTH
      } bytes`,
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
  }

  configureStatusByte(value) {
    this.statusByte = requireByte(value, "status");
  }

  configureParameterBytes(values) {
    this.parameterBytes = requireParameterBytes(values);
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
          await applyRecord({
            recordAddress: 0x0c220370,
            parameterBufferAddress: 0x0c2203a3,
          });
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

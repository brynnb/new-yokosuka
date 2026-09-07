const OPERATION_018E_ADDRESS = 0x0c201fe0;
const OPERATION_0054_ADDRESS = 0x0c201c40;

function stopped(reason) {
  return { status: "stopped", reason };
}

export function createNativeFixedGlobalByteSemanticHandlers({
  writeNativeFixedGlobalByte,
} = {}) {
  return {
    "fixed-global-byte-0c201c40-bit-six-control": async ({
      context,
      readArgument,
    }) => {
      let selector;
      try {
        selector = readArgument(0) >> 0;
      } catch (error) {
        return stopped(error.message);
      }
      if (selector !== 0 && selector !== 1) {
        return stopped("fixed-global-byte-0c201c40-selector-unproved");
      }
      const read = context.readSceneField;
      const write = context.writeSceneField;
      if (typeof read !== "function" || typeof write !== "function") {
        return stopped("fixed-global-byte-0c201c40-field-adapter-missing");
      }
      let previous;
      try {
        previous = read({ offset: OPERATION_0054_ADDRESS, width: 1 });
      } catch (error) {
        return stopped(error.message);
      }
      if (!Number.isInteger(previous)) {
        return stopped("fixed-global-byte-0c201c40-value-unavailable");
      }
      const value = selector === 0
        ? (previous | 0x40)
        : (previous & 0xbf);
      const mutation = {
        offset: OPERATION_0054_ADDRESS,
        width: 1,
        previous,
        value,
      };
      await write({
        offset: mutation.offset,
        width: mutation.width,
        value: mutation.value,
      });
      return { status: "continued", mutation };
    },
    "fixed-global-byte-0c201fe0-write": async ({
      context,
      readArgument,
    }) => {
      let value;
      try {
        value = readArgument(0);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (value !== 0 && value !== 1) {
        return {
          status: "stopped",
          reason: "fixed-global-byte-0c201fe0-value-unproved",
        };
      }
      const write = (
        writeNativeFixedGlobalByte
        || context.writeNativeFixedGlobalByte
        || context.writeSceneField
      );
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "fixed-global-byte-0c201fe0-write-adapter-missing",
        };
      }
      const detail = {
        offset: OPERATION_018E_ADDRESS,
        width: 1,
        value,
      };
      await write(detail);
      return {
        status: "continued",
        mutation: detail,
      };
    },
  };
}

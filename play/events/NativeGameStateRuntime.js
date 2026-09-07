const FIXED_BYTE_ROUTES = {
  14: { address: 0x0c220a5b, operation: "write" },
  15: { address: 0x0c220a5b, operation: "read" },
  57: { address: 0x0c220a58, operation: "write" },
  58: { address: 0x0c220a58, operation: "read" },
  73: { address: 0x0c2218ed, operation: "write" },
  74: { address: 0x0c2218ed, operation: "read" },
  75: { address: 0x0c2218ec, operation: "write" },
  76: { address: 0x0c2218ec, operation: "read" },
};

const INDEXED_BYTE_BASE = 0x0c2218cc;
const INCREMENTED_BYTE_BASE = 0x0c221440;
const SIGNED_WORD_44_ADDRESS = 0x0c220d14;
const REGISTERED_CODE_ARRAY_ADDRESS = 0x0c221e0c;
const REGISTERED_CODE_COUNT_ADDRESS = 0x0c22220c;
const REGISTERED_CODE_CAPACITY = 0x200;
const MODE_42_REGISTERED_CODES = new Map([
  [15, [0x02be, 0x02bf, 0x02c0]],
  [19, [0x02be, 0x02bf, 0x02c0]],
  [79, [0x00fb]],
  [90, [0x00cb, 0x011c]],
  [92, [0x00d0, 0x00d3]],
  [99, [0x02c0, 0x007d, 0x00fd]],
  [100, [0x02bd, 0x02c1, 0x0322, 0x0323, 0x0076]],
]);

function requireInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native game-state ${name} is unavailable`);
  }
  return value;
}

function nativeClampedByte(value) {
  const word = requireInteger(value, "byte value") | 0;
  return word > 0xff ? 0xff : word & 0xff;
}

function indexedByteAddress(index) {
  const word = requireInteger(index, "byte index") >>> 0;
  return (INDEXED_BYTE_BASE + word) >>> 0;
}

function incrementedByteAddress(index) {
  const word = requireInteger(index, "increment byte index") >>> 0;
  return (INCREMENTED_BYTE_BASE + word) >>> 0;
}

async function registerMode42Codes({ codes, read, write }) {
  if (!codes) return;
  let count = await read({
    offset: REGISTERED_CODE_COUNT_ADDRESS,
    width: 2,
    signedLoad: true,
  });
  if (count === undefined) count = 0;
  if (!Number.isInteger(count) || count < 0 || count > REGISTERED_CODE_CAPACITY) {
    throw new Error("native game-state registered-code count is invalid");
  }
  for (const code of codes) {
    let found = false;
    for (let index = 0; index < count; index += 1) {
      const stored = await read({
        offset: REGISTERED_CODE_ARRAY_ADDRESS + index * 2,
        width: 2,
        signedLoad: true,
      });
      if (!Number.isInteger(stored)) {
        throw new Error("native game-state registered code is unavailable");
      }
      if ((stored << 16 >> 16) === (code << 16 >> 16)) {
        found = true;
        break;
      }
    }
    if (found || count >= REGISTERED_CODE_CAPACITY) continue;
    count += 1;
    await write({
      offset: REGISTERED_CODE_COUNT_ADDRESS,
      width: 2,
      value: count,
    });
    await write({
      offset: REGISTERED_CODE_ARRAY_ADDRESS + (count - 1) * 2,
      width: 2,
      value: code & 0xffff,
    });
  }
}

export function createNativeGameStateSemanticHandlers({
  readNativeGameStateField,
  writeNativeGameStateField,
  readNativeGameStatePairByte,
  writeNativeGameStatePairByte,
} = {}) {
  return {
    "native-game-state-byte-control": async ({
      context,
      readArgument,
    }) => {
      let mode;
      try {
        mode = readArgument(0);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }

      const fixed = FIXED_BYTE_ROUTES[mode];
      if (fixed) {
        if (fixed.operation === "read") {
          const read = (
            readNativeGameStateField
            || context.readNativeGameStateField
            || context.readSceneField
          );
          if (typeof read !== "function") {
            return {
              status: "stopped",
              reason: "native-game-state-byte-reader-missing",
            };
          }
          const value = await read({ offset: fixed.address, width: 1 });
          if (!Number.isInteger(value)) {
            return {
              status: "stopped",
              reason: "native-game-state-byte-result-invalid",
            };
          }
          return { result: value & 0xff };
        }

        const write = (
          writeNativeGameStateField
          || context.writeNativeGameStateField
          || context.writeSceneField
        );
        if (typeof write !== "function") {
          return {
            status: "stopped",
            reason: "native-game-state-byte-writer-missing",
          };
        }
        let value;
        try {
          value = nativeClampedByte(readArgument(1));
        } catch (error) {
          return { status: "stopped", reason: error.message };
        }
        const mutation = { offset: fixed.address, width: 1, value };
        await write(mutation);
        return { result: value, mutation };
      }

      if (mode === 42) {
        const read = (
          readNativeGameStateField
          || context.readNativeGameStateField
          || context.readSceneField
        );
        const write = (
          writeNativeGameStateField
          || context.writeNativeGameStateField
          || context.writeSceneField
        );
        if (typeof read !== "function") {
          return {
            status: "stopped",
            reason: "native-game-state-byte-reader-missing",
          };
        }
        if (typeof write !== "function") {
          return {
            status: "stopped",
            reason: "native-game-state-byte-writer-missing",
          };
        }
        let index;
        let address;
        try {
          index = requireInteger(readArgument(1), "increment byte index");
          address = incrementedByteAddress(index);
          await registerMode42Codes({
            codes: MODE_42_REGISTERED_CODES.get(index),
            read,
            write,
          });
        } catch (error) {
          return { status: "stopped", reason: error.message };
        }
        let previous = await read({ offset: address, width: 1 });
        if (previous === undefined) previous = 0;
        if (!Number.isInteger(previous)) {
          return {
            status: "stopped",
            reason: "native-game-state-byte-result-invalid",
          };
        }
        const value = Math.min((previous & 0xff) + 1, 0xff);
        const mutation = { offset: address, width: 1, value };
        await write(mutation);
        return { result: value, mutation };
      }

      if (mode === 44) {
        const read = (
          readNativeGameStateField
          || context.readNativeGameStateField
          || context.readSceneField
        );
        if (typeof read !== "function") {
          return {
            status: "stopped",
            reason: "native-game-state-signed-word-reader-missing",
          };
        }
        const value = await read({
          offset: SIGNED_WORD_44_ADDRESS,
          width: 2,
          signedLoad: true,
        });
        if (!Number.isInteger(value)) {
          return {
            status: "stopped",
            reason: "native-game-state-signed-word-result-invalid",
          };
        }
        return { result: value << 16 >> 16 };
      }

      if (mode === 71 || mode === 72) {
        let address;
        try {
          address = indexedByteAddress(readArgument(1));
        } catch (error) {
          return { status: "stopped", reason: error.message };
        }
        if (mode === 72) {
          const read = (
            readNativeGameStateField
            || context.readNativeGameStateField
            || context.readSceneField
          );
          if (typeof read !== "function") {
            return {
              status: "stopped",
              reason: "native-game-state-byte-reader-missing",
            };
          }
          const value = await read({ offset: address, width: 1 });
          if (!Number.isInteger(value)) {
            return {
              status: "stopped",
              reason: "native-game-state-byte-result-invalid",
            };
          }
          return { result: value & 0xff };
        }

        const write = (
          writeNativeGameStateField
          || context.writeNativeGameStateField
          || context.writeSceneField
        );
        if (typeof write !== "function") {
          return {
            status: "stopped",
            reason: "native-game-state-byte-writer-missing",
          };
        }
        let value;
        try {
          value = nativeClampedByte(readArgument(2));
        } catch (error) {
          return { status: "stopped", reason: error.message };
        }
        const mutation = { offset: address, width: 1, value };
        await write(mutation);
        return { result: value, mutation };
      }

      if (mode === 55 || mode === 56) {
        let firstKey;
        let secondKey;
        try {
          firstKey = requireInteger(readArgument(1), "first pair key");
          secondKey = requireInteger(readArgument(2), "second pair key");
        } catch (error) {
          return { status: "stopped", reason: error.message };
        }
        if (mode === 56) {
          const read = (
            readNativeGameStatePairByte
            || context.readNativeGameStatePairByte
          );
          if (typeof read !== "function") {
            return {
              status: "stopped",
              reason: "native-game-state-pair-byte-reader-missing",
            };
          }
          const result = await read({ firstKey, secondKey });
          if (!Number.isInteger(result)) {
            return {
              status: "stopped",
              reason: "native-game-state-pair-byte-result-invalid",
            };
          }
          return { result: result & 0xff };
        }

        const write = (
          writeNativeGameStatePairByte
          || context.writeNativeGameStatePairByte
        );
        if (typeof write !== "function") {
          return {
            status: "stopped",
            reason: "native-game-state-pair-byte-writer-missing",
          };
        }
        let value;
        try {
          value = nativeClampedByte(readArgument(3));
        } catch (error) {
          return { status: "stopped", reason: error.message };
        }
        const mutation = { firstKey, secondKey, value };
        await write(mutation);
        return { result: value, mutation };
      }

      return {
        status: "stopped",
        reason: "native-game-state-byte-mode-unproved",
      };
    },
  };
}

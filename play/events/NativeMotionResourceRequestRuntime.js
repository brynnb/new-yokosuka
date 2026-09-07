const GLOBAL_MOTION_FILENAMES = new Set([
  "M_MOBJ.BIN",
  "M_MDOR.BIN",
]);

function stopped(reason) {
  return { status: "stopped", reason };
}

function requireWord(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

function requireSignedWord(value, label) {
  return requireWord(value, label) | 0;
}

function requireFilename(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("native MOTI filename must be a non-empty string");
  }
  return value;
}

export function nativeFourCcFromWord(value) {
  const word = requireWord(value, "native MOTI area word");
  return String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  );
}

function nativeWidthTwoDecimal(value) {
  const signed = requireSignedWord(value, "native MOTI disc number");
  const decimal = String(signed);
  return decimal.length >= 2 ? decimal : decimal.padStart(2, "0");
}

export function planNativeMotionResourceRequest({
  discNumber,
  areaWord,
  filename,
}) {
  const name = requireFilename(filename);
  const global = GLOBAL_MOTION_FILENAMES.has(name);
  return Object.freeze({
    path: global
      ? "misc"
      : `scene/${nativeWidthTwoDecimal(discNumber)}/${
        nativeFourCcFromWord(areaWord)}`,
    name,
    resourceType: "MOTI",
    global,
  });
}

export function createNativeMotionResourceRequestSemanticHandlers({
  queueNativeMotionResource,
} = {}) {
  return {
    "native-motion-resource-request": async ({
      action,
      context,
      readArgument,
    }) => {
      if (action.arguments?.[2]?.kind !== "static-pointer") {
        return stopped("native-motion-resource-filename-pointer-unproved");
      }
      const resolveStaticString = context.resolveNativeStaticString;
      if (typeof resolveStaticString !== "function") {
        return stopped("native-motion-resource-static-string-resolver-missing");
      }
      let discNumber;
      let areaWord;
      let filenamePointer;
      try {
        discNumber = readArgument(0);
        areaWord = readArgument(1);
        filenamePointer = readArgument(2);
      } catch (error) {
        return stopped(error.message);
      }
      const filename = resolveStaticString(filenamePointer);
      if (typeof filename !== "string") {
        return stopped(
          `native-motion-resource-filename-unavailable:${filenamePointer}`,
        );
      }
      let request;
      try {
        request = planNativeMotionResourceRequest({
          discNumber,
          areaWord,
          filename,
        });
      } catch (error) {
        return stopped({
          kind: "native-motion-resource-request-contract-failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      const queue = (
        queueNativeMotionResource
        || context.queueNativeMotionResource
      );
      if (typeof queue !== "function") {
        return stopped("native-motion-resource-queue-missing");
      }
      let queued;
      try {
        queued = await queue({
          ...request,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
      } catch (error) {
        return stopped(error.message);
      }
      if (
        !queued
        || !Number.isInteger(queued.handle)
        || queued.handle < -0x80000000
        || queued.handle > 0xffffffff
      ) {
        return stopped("native-motion-resource-handle-unavailable");
      }
      return {
        status: "continued",
        result: queued.handle >>> 0,
        request,
        ...(Object.hasOwn(queued, "resource")
          ? { resource: queued.resource }
          : {}),
      };
    },
  };
}

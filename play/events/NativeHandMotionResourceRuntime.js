import {
  nativeFourCcFromWord,
} from "./NativeMotionResourceRequestRuntime.js";

function stopped(reason) {
  return { status: "stopped", reason };
}

function requireDiscNumber(value) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError("native HMOT disc number must be a 32-bit word");
  }
  return value | 0;
}

function nativeWidthTwoDecimal(value) {
  const decimal = String(requireDiscNumber(value));
  return decimal.length >= 2 ? decimal : decimal.padStart(2, "0");
}

function requireFilename(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("native HMOT filename must be a non-empty string");
  }
  return value;
}

export function planNativeHandMotionResourceRequest({
  discNumber,
  areaWord,
  filename,
}) {
  return Object.freeze({
    path: `scene/${nativeWidthTwoDecimal(discNumber)}/${
      nativeFourCcFromWord(areaWord)}`,
    name: requireFilename(filename),
    resourceType: "HNDM",
    global: false,
  });
}

export function createNativeHandMotionResourceSemanticHandlers({
  queueNativeHandMotionResource,
} = {}) {
  return {
    "native-hand-motion-resource-request": async ({
      action,
      context,
      readArgument,
    }) => {
      if (action.arguments?.[2]?.kind !== "static-pointer") {
        return stopped("native-hand-motion-filename-pointer-unproved");
      }
      const resolveStaticString = context.resolveNativeStaticString;
      if (typeof resolveStaticString !== "function") {
        return stopped("native-hand-motion-static-string-resolver-missing");
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
          `native-hand-motion-filename-unavailable:${filenamePointer}`,
        );
      }
      let request;
      try {
        request = planNativeHandMotionResourceRequest({
          discNumber,
          areaWord,
          filename,
        });
      } catch (error) {
        return stopped(error instanceof Error ? error.message : String(error));
      }
      const queue = (
        queueNativeHandMotionResource
        || context.queueNativeHandMotionResource
      );
      if (typeof queue !== "function") {
        return stopped("native-hand-motion-resource-queue-missing");
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
        return stopped(error instanceof Error ? error.message : String(error));
      }
      if (
        !queued
        || !Number.isInteger(queued.handle)
        || queued.handle < -0x80000000
        || queued.handle > 0xffffffff
      ) {
        return stopped("native-hand-motion-resource-handle-unavailable");
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

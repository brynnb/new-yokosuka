const SLOT_COUNT = 8;
const FREE_SENTINEL = "FREE";

function stopped(reason) {
  return { status: "stopped", reason };
}

export function createNativeSoundBankSemanticHandlers({
  reconcileSoundBankSlots,
} = {}) {
  return {
    "native-sound-bank-slot-reconcile": async ({
      action,
      context,
      readArgument,
    }) => {
      const resolveString = context.resolveNativeStaticString;
      if (typeof resolveString !== "function") {
        return stopped("native-sound-bank-static-string-resolver-missing");
      }
      const requests = [];
      for (let index = 0; index < SLOT_COUNT; index += 1) {
        let pointer;
        try {
          pointer = readArgument(index);
        } catch (error) {
          return stopped(error.message);
        }
        if (pointer === 0) {
          requests.push(null);
          continue;
        }
        const value = resolveString(pointer);
        if (typeof value !== "string") {
          return stopped(`native-sound-bank-string-unavailable:${pointer}`);
        }
        requests.push(value);
      }
      const reconcile = (
        reconcileSoundBankSlots
        || context.reconcileNativeSoundBankSlots
      );
      if (typeof reconcile !== "function") {
        return stopped("native-sound-bank-state-adapter-missing");
      }
      try {
        const mutation = await reconcile(requests, {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        });
        return { status: "continued", mutation };
      } catch (error) {
        return stopped(error.message);
      }
    },
  };
}

export function reconcileNativeSoundBankSlots(currentSlots, requests) {
  if (!Array.isArray(currentSlots) || currentSlots.length !== SLOT_COUNT) {
    throw new TypeError("native sound-bank state requires eight slots");
  }
  if (!Array.isArray(requests) || requests.length !== SLOT_COUNT) {
    throw new TypeError("native sound-bank request requires eight slots");
  }
  const previous = [...currentSlots];
  const slots = [...currentSlots];
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const request = requests[index];
    if (request === null) continue;
    if (typeof request !== "string") {
      throw new TypeError("native sound-bank request must be a string or null");
    }
    slots[index] = request === FREE_SENTINEL ? null : request;
  }
  return { previous, requests: [...requests], slots };
}

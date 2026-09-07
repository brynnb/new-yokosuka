const INDEX_SCHEMA = "new-yokosuka-native-event-program-index-v1";
const PACK_SCHEMA = "new-yokosuka-native-event-program-pack-v1";

function abortError(reason = "native event program load cancelled") {
  if (reason instanceof Error) return reason;
  return new DOMException(String(reason), "AbortError");
}

function timeoutError(programId, timeoutMs) {
  const error = new Error(
    `native event program ${programId} did not load within ${timeoutMs}ms`,
  );
  error.name = "TimeoutError";
  return error;
}

function requireIndex(index) {
  if (index?.schema !== INDEX_SCHEMA || !Array.isArray(index.programs)) {
    throw new TypeError("native event program index is required");
  }
  const ids = new Set();
  for (const descriptor of index.programs) {
    if (
      typeof descriptor?.id !== "string"
      || !descriptor.id
      || ids.has(descriptor.id)
      || typeof descriptor.area !== "string"
      || !descriptor.area
      || typeof descriptor.entryFunction !== "string"
      || !descriptor.entryFunction
    ) {
      throw new TypeError("native event program index contains an invalid program");
    }
    ids.add(descriptor.id);
  }
  return index;
}

function requireFetchedDescriptor(descriptor) {
  const asset = descriptor?.asset;
  if (
    typeof asset?.path !== "string"
    || !asset.path.startsWith("/data/native-event-programs/")
    || typeof asset.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(asset.sha256)
    || !Number.isSafeInteger(asset.byteLength)
    || asset.byteLength <= 0
  ) {
    throw new TypeError(
      `native event program ${descriptor?.id || "<unknown>"} has invalid asset metadata`,
    );
  }
  return asset;
}

function validateLoadedProgram(program, descriptor) {
  if (
    !program
    || typeof program !== "object"
    || Array.isArray(program)
    || program.id !== descriptor.id
    || program.area !== descriptor.area
    || program.entryFunction !== descriptor.entryFunction
    || !Array.isArray(program.functions)
    || program.functions.length === 0
  ) {
    throw new TypeError(
      `native event program ${descriptor.id} does not match its index`,
    );
  }
  return program;
}

async function sha256Hex(bytes, cryptoImpl) {
  if (typeof cryptoImpl?.subtle?.digest !== "function") {
    throw new TypeError("Web Crypto is required to verify native event programs");
  }
  const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

function waitForCaller(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  let onAbort;
  const cancelled = new Promise((resolve, reject) => {
    onAbort = () => reject(abortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([promise, cancelled]).finally(() => {
    signal.removeEventListener("abort", onAbort);
  });
}

/**
 * Content-addressed, session-cached source for browser event programs. Caller
 * cancellation does not abort a shared request: it only stops that caller from
 * consuming the result, while another pending consumer may still need it.
 */
export class NativeEventProgramSource {
  constructor({
    index,
    // Browser fetch requires its Window receiver when stored on another object.
    fetchImpl = globalThis.fetch?.bind(globalThis),
    cryptoImpl = globalThis.crypto,
    timeoutMs = 15000,
  } = {}) {
    this.index = requireIndex(index);
    if (typeof fetchImpl !== "function") {
      throw new TypeError("native event program fetch adapter is required");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("native event program timeout must be a positive integer");
    }
    this.programs = this.index.programs;
    this.fetchImpl = fetchImpl;
    this.cryptoImpl = cryptoImpl;
    this.timeoutMs = timeoutMs;
    this.descriptors = new Map(
      this.programs.map(descriptor => [descriptor.id, descriptor]),
    );
    this.cache = new Map();
    this.inFlight = new Map();
  }

  descriptor(programId) {
    return this.descriptors.get(String(programId || "")) || null;
  }

  cachedProgram(programId) {
    return this.cache.get(String(programId || "")) || null;
  }

  loadProgram(programId, { signal = null } = {}) {
    const descriptor = this.descriptor(programId);
    if (!descriptor) return Promise.resolve(null);
    const cached = this.cachedProgram(descriptor.id);
    if (cached) return waitForCaller(Promise.resolve(cached), signal);
    let loading = this.inFlight.get(descriptor.id);
    if (!loading) {
      loading = this.fetchProgram(descriptor);
      this.inFlight.set(descriptor.id, loading);
      void loading.finally(() => {
        if (this.inFlight.get(descriptor.id) === loading) {
          this.inFlight.delete(descriptor.id);
        }
      }).catch(() => {});
    }
    return waitForCaller(loading, signal);
  }

  async fetchProgram(descriptor) {
    const asset = requireFetchedDescriptor(descriptor);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(timeoutError(descriptor.id, this.timeoutMs));
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(asset.path, {
        signal: controller.signal,
        cache: "force-cache",
      });
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!response?.ok || typeof response.text !== "function") {
        throw new Error(
          `native event program ${descriptor.id} request failed with HTTP ${response?.status ?? "unknown"}`,
        );
      }
      const text = await response.text();
      if (controller.signal.aborted) throw controller.signal.reason;
      const bytes = new TextEncoder().encode(text);
      if (bytes.byteLength !== asset.byteLength) {
        throw new Error(
          `native event program ${descriptor.id} byte length does not match its index`,
        );
      }
      const actualSha256 = await sha256Hex(bytes, this.cryptoImpl);
      if (controller.signal.aborted) throw controller.signal.reason;
      if (actualSha256 !== asset.sha256) {
        throw new Error(
          `native event program ${descriptor.id} hash does not match its index`,
        );
      }
      let program;
      try {
        program = JSON.parse(text);
      } catch (error) {
        throw new SyntaxError(
          `native event program ${descriptor.id} is not valid JSON: ${error.message}`,
        );
      }
      validateLoadedProgram(program, descriptor);
      this.cache.set(descriptor.id, program);
      return program;
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createNativeEventProgramSource(options) {
  return new NativeEventProgramSource(options);
}

/** A source adapter for focused tests and offline tools with an in-memory pack. */
export function createInMemoryNativeEventProgramSource(programPack) {
  if (
    programPack?.schema !== PACK_SCHEMA
    || !Array.isArray(programPack.programs)
  ) {
    throw new TypeError("native event program pack is required");
  }
  const programs = programPack.programs.map(program => ({
    ...program,
    entryFunction: program.entryFunction ?? program.functions?.[0]?.id,
  }));
  const byId = new Map(programs.map(program => [program.id, program]));
  const index = requireIndex({
    schema: INDEX_SCHEMA,
    programs,
    eventCamerasByArea: Object.fromEntries(
      [...new Set(programs.map(program => program.area))]
        .map(area => [
          area,
          programs
            .filter(program => program.area === area)
            .flatMap(program => program.eventCameras?.records || []),
        ])
        .filter(([, records]) => records.length > 0),
    ),
  });
  return {
    index,
    programs: index.programs,
    descriptor: programId => byId.get(String(programId || "")) || null,
    cachedProgram: programId => byId.get(String(programId || "")) || null,
    loadProgram: async programId => (
      byId.get(String(programId || "")) || null
    ),
  };
}

export const nativeEventProgramIndexSchema = INDEX_SCHEMA;

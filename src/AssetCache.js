// Cache immutable asset data, not Babylon objects or live actor state. These
// budgets cap retained data; a caller may still hold an evicted buffer in use.
export class AssetDataCache {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value, bytes) {
    this.delete(key);
    if (bytes > this.maxBytes) return value;
    this.entries.set(key, {value, bytes});
    this.bytes += bytes;
    while (this.bytes > this.maxBytes) this.delete(this.entries.keys().next().value);
    return value;
  }

  delete(key) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}

export class AssetRequestCache {
  constructor({maxBytes = 64 * 1024 * 1024, concurrency = 4, timeoutMs = 30000,
    retries = 1, fetch: read = (...args) => fetch(...args)} = {}) {
    this.cache = new AssetDataCache(maxBytes);
    this.concurrency = concurrency;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.fetch = read;
    this.pending = new Map();
    this.queue = [];
    this.active = 0;
  }

  read(url, {signal, priority = 0} = {}) {
    signal?.throwIfAborted();
    const key = String(url);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    let entry = this.pending.get(key);
    if (!entry) {
      entry = {key, priority, controller: new AbortController(), users: new Set()};
      this.pending.set(key, entry);
      this.queue.push(entry);
    }
    entry.priority = Math.max(entry.priority, priority);
    const result = new Promise((resolve, reject) => {
      const user = {resolve, reject, signal};
      user.abort = () => {
        entry.users.delete(user);
        reject(signal.reason);
        if (entry.users.size === 0) {
          // Do not let a new caller subscribe to a request already aborted by
          // the previous world's last subscriber.
          if (this.pending.get(key) === entry) this.pending.delete(key);
          entry.controller.abort();
        }
      };
      entry.users.add(user);
      signal?.addEventListener("abort", user.abort, {once: true});
    });
    this.pump();
    return result;
  }

  pump() {
    this.queue.sort((a, b) => b.priority - a.priority);
    while (this.active < this.concurrency && this.queue.length) {
      const entry = this.queue.shift();
      if (entry.controller.signal.aborted) continue;
      this.active++;
      void this.run(entry);
    }
  }

  async run(entry) {
    let value;
    let failure;
    try {
      for (let attempt = 0; ; attempt++) {
        const controller = new AbortController();
        const abort = () => controller.abort(entry.controller.signal.reason);
        entry.controller.signal.addEventListener("abort", abort, {once: true});
        const timer = setTimeout(() => controller.abort(
          new Error(`Asset request timed out: ${entry.key}`),
        ), this.timeoutMs);
        try {
          entry.controller.signal.throwIfAborted();
          const response = await this.fetch(entry.key, {signal: controller.signal});
          if (!response.ok) {
            const error = new Error(`${entry.key} returned HTTP ${response.status}`);
            error.retryable = response.status === 429 || response.status >= 500;
            throw error;
          }
          if (response.headers.get("content-type")?.includes("text/html")) {
            const error = new Error(`${entry.key} returned HTML instead of asset data`);
            error.retryable = false;
            throw error;
          }
          const buffer = await response.arrayBuffer();
          controller.signal.throwIfAborted();
          value = {buffer, headers: [...response.headers.entries()]};
          break;
        } catch (error) {
          if (entry.controller.signal.aborted || attempt >= this.retries || error.retryable === false) throw error;
        } finally {
          clearTimeout(timer);
          entry.controller.signal.removeEventListener("abort", abort);
        }
      }
      entry.controller.signal.throwIfAborted();
      this.cache.set(entry.key, value, value.buffer.byteLength);
    } catch (error) {
      failure = error;
    } finally {
      if (this.pending.get(entry.key) === entry) this.pending.delete(entry.key);
      for (const user of entry.users) {
        user.signal?.removeEventListener("abort", user.abort);
        if (failure) user.reject(failure);
        else user.resolve(value);
      }
      this.active--;
      this.pump();
    }
  }
}

export const assetRequests = new AssetRequestCache();
export async function fetchAssetBuffer(url, options) {
  return (await assetRequests.read(url, options)).buffer;
}
export async function fetchAssetResponse(url, options) {
  // Catalogs are mutable (especially newly extracted local viewer content).
  // Let HTTP revalidation, not the binary asset LRU, govern their freshness.
  if (/\.json(?:[?#]|$)/i.test(String(url))) return fetch(url, {signal: options?.signal});
  const {buffer, headers} = await assetRequests.read(url, options);
  return new Response(buffer, {headers});
}

// CPU-side decoded texture pixels survive scene disposal. No cached texture
// objects retain a WebGL context, and callers receive their own mutable copy.
export const decodedAssetData = new AssetDataCache(32 * 1024 * 1024);
const bufferIds = new WeakMap();
let nextBufferId = 0;
export function assetBufferId(buffer) {
  if (!bufferIds.has(buffer)) bufferIds.set(buffer, ++nextBufferId);
  return bufferIds.get(buffer);
}

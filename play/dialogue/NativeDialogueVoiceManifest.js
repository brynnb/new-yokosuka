import { DIALOGUE_VOICE_URL } from "../../src/constants.js";
import { resolveRuntimeAssetUrl } from "../../src/RuntimeAssets.js";

function normalizedVoiceId(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export class NativeDialogueVoiceManifest {
  constructor({
    baseUrl = DIALOGUE_VOICE_URL,
    url = "/audio/dialogue/manifest.json",
    preferLocal = true,
    fetchJson = async (sourceUrl) => {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(
          `Dialogue voice manifest returned HTTP ${response.status}`,
        );
      }
      return response.json();
    },
    fetchAudio = async (sourceUrl) => {
      const response = await fetch(resolveRuntimeAssetUrl(sourceUrl), {
        cache: "force-cache",
        mode: "cors",
      });
      if (!response.ok) {
        throw new Error(
          `Dialogue voice returned HTTP ${response.status}`,
        );
      }
      await response.arrayBuffer();
    },
  } = {}) {
    this.baseUrl = typeof baseUrl === "string"
      ? baseUrl.replace(/\/+$/, "")
      : "";
    this.url = url;
    this.preferLocal = Boolean(preferLocal);
    this.fetchJson = fetchJson;
    this.fetchAudio = fetchAudio;
    this.loading = null;
    this.urls = null;
    this.prefetches = new Map();
  }

  async load() {
    if (this.urls) return this.urls;
    if (!this.loading) {
      this.loading = this.fetchJson(this.url).then((manifest) => {
        if (![
          "new-yokosuka-dialogue-voice-pack-v1",
          "new-yokosuka-dialogue-voice-pack-v2",
        ].includes(manifest?.schema)) {
          throw new Error("Unsupported dialogue voice manifest schema");
        }
        const urls = new Map();
        for (const line of manifest.lines || []) {
          const voiceId = normalizedVoiceId(line?.voiceId);
          const sourceUrl = typeof line?.url === "string" ? line.url : "";
          if (!voiceId || !sourceUrl) continue;
          const previous = urls.get(voiceId);
          if (previous && previous !== sourceUrl) {
            throw new Error(
              `Dialogue voice ${voiceId} maps to conflicting URLs`,
            );
          }
          urls.set(voiceId, sourceUrl);
        }
        this.urls = urls;
        return urls;
      });
    }
    return this.loading;
  }

  async urlFor(voiceId) {
    const key = normalizedVoiceId(voiceId);
    if (!key) return null;
    if (this.preferLocal) {
      try {
        const local = (await this.load()).get(key);
        if (local) return local;
      } catch (error) {
        if (!this.baseUrl) throw error;
      }
    }
    if (this.baseUrl) {
      return `${this.baseUrl}/${encodeURIComponent(key)}.m4a`;
    }
    const urls = await this.load();
    return urls.get(key) ?? null;
  }

  prefetchOne(voiceId) {
    const key = normalizedVoiceId(voiceId);
    if (!key) return Promise.resolve(false);
    if (!this.prefetches.has(key)) {
      const request = this.urlFor(key)
        .then(async (sourceUrl) => {
          if (!sourceUrl) return false;
          await this.fetchAudio(sourceUrl);
          return true;
        })
        .catch((error) => {
          this.prefetches.delete(key);
          throw error;
        });
      this.prefetches.set(key, request);
    }
    return this.prefetches.get(key);
  }

  async prefetch(voiceIds) {
    const results = [];
    const seen = new Set();
    for (const voiceId of voiceIds || []) {
      const key = normalizedVoiceId(voiceId);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      try {
        results.push(await this.prefetchOne(key));
      } catch {
        results.push(false);
      }
    }
    return results;
  }
}

export function createNativeDialogueVoiceManifest(options) {
  return new NativeDialogueVoiceManifest(options);
}

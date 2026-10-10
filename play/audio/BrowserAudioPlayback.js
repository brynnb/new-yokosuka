import { subscribeToAudioGesture } from "./UserActivation.js";

// Silent PCM, not a muted player: muted autoplay permission does not prove
// permission to play subsequent audible media in WebKit.
const SILENT_WAV = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==";
const MEDIA_EVENTS = ["loadedmetadata", "canplay", "ended", "error", "pause"];
const failure = (name, message) => new DOMException(message, name);
export const isAudioPermissionError = error => error?.name === "NotAllowedError";

function within(promise, milliseconds) {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure("TimeoutError", "Audio priming timed out")), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

// Reuse the streaming backend with bounded physical players. Logical clips
// never share listeners/ownership. Music is not decoded wholesale into RAM,
// and this does not introduce a second WebAudio mixer beside Babylon's.
export class BrowserAudioPlayback {
  constructor({ audioFactory = () => new Audio(), capacity = 24, primeTimeoutMs = 10_000,
    subscribeGesture = subscribeToAudioGesture, document = globalThis.document,
    window = globalThis.window } = {}) {
    this.audioFactory = audioFactory;
    this.capacity = capacity;
    this.primeTimeoutMs = primeTimeoutMs;
    this.slots = [];
    this.blocked = new Set();
    this.contexts = new Set();
    this.contextReleases = new Set();
    this.blockedContexts = new Set();
    this.recoveryListeners = new Set();
    this.stateListeners = new Set();
    this.document = document;
    this.window = window;
    this.disposed = false;
    this.unsubscribeGesture = subscribeGesture(() => this.unlock());
    this.onVisibility = () => {
      if (document?.hidden) {
        for (const slot of this.slots) slot.owner?.suspend();
      } else { this.resumeContexts(); this.recover(); }
    };
    document?.addEventListener("visibilitychange", this.onVisibility);
    window?.addEventListener("pageshow", this.onVisibility);
  }

  create(source = "", { recovery = "drop" } = {}) {
    return new PlaybackClip(this, source, recovery);
  }
  subscribe = listener => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };
  needsGesture = () => this.blocked.size > 0 || this.blockedContexts.size > 0;
  registerContext(context) {
    const changed = () => {
      if (context.state === "running" || context.state === "closed") this.blockedContexts.delete(context);
      else if (!this.document?.hidden) this.blockedContexts.add(context);
      this.publish();
    };
    this.contexts.add(context);
    context.addEventListener("statechange", changed);
    this.resumeContexts();
    const release = () => {
      context.removeEventListener("statechange", changed);
      this.contexts.delete(context);
      this.blockedContexts.delete(context);
      this.contextReleases.delete(release);
      this.publish();
    };
    this.contextReleases.add(release);
    return release;
  }
  resumeContexts() {
    for (const context of this.contexts) {
      if (context.state === "running" || context.state === "closed") continue;
      this.blockedContexts.add(context);
      this.publish();
      // Resume Babylon's existing spatial context; do not allocate a parallel
      // context. Its state is authoritative, not a permanent "unlocked" flag.
      void context.resume().then(() => {
        if (!this.contexts.has(context) || this.disposed) return;
        if (context.state === "running") this.blockedContexts.delete(context);
        this.publish();
      }, () => {
        if (!this.contexts.has(context) || this.disposed) return;
        this.blockedContexts.add(context); this.publish();
      });
    }
  }
  subscribeRecovery(listener) {
    this.recoveryListeners.add(listener);
    return () => this.recoveryListeners.delete(listener);
  }
  markBlocked(clip) { this.blocked.add(clip); this.publish(); }
  clearBlocked(clip) { if (this.blocked.delete(clip)) this.publish(); }
  publish() { for (const listener of this.stateListeners) listener(); }

  unlock() {
    if (this.disposed) return;
    this.resumeContexts();
    // Prime in the actual gesture, not after awaiting a manifest. Later async
    // voices/music change the sources of these already-authorized players.
    while (this.slots.length < this.capacity) {
      this.slots.push({ audio: this.audioFactory(), owner: null, priming: null, primed: false });
    }
    for (const slot of this.slots) {
      if (slot.owner || slot.priming || (slot.primed && !this.needsGesture())) continue;
      slot.audio.src = SILENT_WAV;
      slot.audio.loop = false;
      slot.audio.muted = false;
      slot.audio.volume = 0;
      try {
        const result = slot.audio.play();
        slot.priming = within(result, this.primeTimeoutMs).then(() => {
          slot.audio.pause();
          slot.primed = !this.disposed;
          slot.error = null;
        }, error => {
          slot.audio.pause();
          slot.primed = false;
          slot.error = error;
        }).finally(() => { slot.priming = null; });
      } catch (error) { slot.primed = false; slot.error = error; }
    }
    this.recover();
  }

  recover() {
    if (this.disposed || this.document?.hidden) return;
    for (const clip of [...this.blocked]) {
      if (clip.recovery === "resume") void clip.play().catch(() => {});
    }
    for (const listener of this.recoveryListeners) listener();
  }

  async acquire(clip, revision) {
    const available = () => this.slots.find(candidate => !candidate.owner && !candidate.priming && candidate.primed);
    let slot = available();
    while (!slot && !this.disposed) {
      const priming = this.slots.filter(candidate => candidate.priming).map(candidate => candidate.priming);
      if (!priming.length) break;
      // One slow/unsupported player must not hold up every otherwise-ready
      // channel. Lease the first available success; each prime is time-bounded.
      await Promise.race(priming);
      slot = available();
    }
    if (this.disposed) throw failure("AbortError", "Audio backend disposed");
    if (!slot) {
      if (!this.slots.some(candidate => candidate.primed)) {
        const resourceError = this.slots.find(candidate => candidate.error && !isAudioPermissionError(candidate.error))?.error;
        if (resourceError) throw resourceError;
        throw failure("NotAllowedError", "Audio needs a user gesture");
      }
      throw failure("QuotaExceededError", "All game audio channels are in use");
    }
    slot.owner = clip;
    slot.leaseRevision = revision;
    return slot;
  }

  dispose() {
    this.disposed = true;
    this.unsubscribeGesture();
    this.document?.removeEventListener("visibilitychange", this.onVisibility);
    this.window?.removeEventListener("pageshow", this.onVisibility);
    for (const slot of this.slots) {
      slot.owner?.pause();
      slot.audio.pause();
      slot.audio.removeAttribute("src");
    }
    this.blocked.clear();
    for (const release of [...this.contextReleases]) release();
    this.blockedContexts.clear();
    this.recoveryListeners.clear();
    this.stateListeners.clear();
  }
}

class PlaybackClip extends EventTarget {
  constructor(backend, source, recovery) {
    super();
    this.backend = backend;
    this.recovery = recovery;
    this.source = source;
    this.slot = null;
    this.offset = 0;
    this.savedDuration = NaN;
    this.gain = 1;
    this.hardMuted = false;
    this.loop = false;
    this.preload = "auto";
    this.wanted = false;
    this.revision = 0;
    this.error = null;
    this.forward = event => {
      const media = this.slot?.audio;
      if (!media) return;
      // A queued event from the prior source can arrive after player reuse.
      // Its current native state, rather than the old event, is authoritative.
      if (event.type === "loadedmetadata" && media.readyState === 0) return;
      if (event.type === "error" && !media.error) return;
      if (event.type === "ended" && media.ended === false) return;
      if (event.type === "loadedmetadata") {
        this.savedDuration = media.duration;
        media.currentTime = Math.min(this.offset, Number.isFinite(media.duration) ? media.duration : this.offset);
      }
      if (event.type === "pause" && this.wanted && media.paused && !media.ended) {
        this.suspend();
        if (!this.backend.document?.hidden) this.backend.recover();
        return;
      }
      if (event.type === "ended" || event.type === "error") {
        this.error = media.error;
        this.pause();
      }
      this.dispatchEvent(new Event(event.type));
      this[`on${event.type}`]?.(event);
    };
  }
  get src() { return this.source; }
  set src(source) { this.pause(); this.source = source; this.offset = 0; this.savedDuration = NaN; }
  get currentTime() { return this.slot?.audio.currentTime ?? this.offset; }
  set currentTime(value) {
    this.offset = value;
    if (this.slot?.audio.readyState > 0) this.slot.audio.currentTime = value;
  }
  get duration() { return this.slot?.audio.duration ?? this.savedDuration; }
  get paused() { return this.slot?.audio.paused ?? true; }
  get volume() { return this.gain; }
  set volume(value) { this.gain = value; if (this.slot) this.slot.audio.volume = value; }
  get muted() { return this.hardMuted; }
  set muted(value) { this.hardMuted = value; if (this.slot) this.slot.audio.muted = value; }
  removeAttribute(name) {
    if (name !== "src") return;
    this.src = "";
  }
  load() {
    if (!this.source) return;
    void this.ensureSlot().catch(error => {
      if (!isAudioPermissionError(error) && error.name !== "AbortError") {
        this.error = error;
        this.dispatchEvent(new Event("error"));
      }
    });
  }

  async ensureSlot() {
    if (this.slot) return this.slot;
    if (this.acquiring) return this.acquiring;
    const revision = this.revision;
    const acquiring = this.backend.acquire(this, revision).then(slot => {
      if (revision !== this.revision) {
        if (slot.owner === this && slot.leaseRevision === revision) slot.owner = null;
        throw failure("AbortError", "Audio clip cancelled");
      }
      this.slot = slot;
      const media = slot.audio;
      for (const type of MEDIA_EVENTS) media.addEventListener(type, this.forward);
      media.preload = this.preload;
      media.loop = this.loop;
      media.muted = this.hardMuted;
      media.volume = this.gain;
      media.src = this.source;
      media.load();
      return slot;
    }).finally(() => { if (this.acquiring === acquiring) this.acquiring = null; });
    this.acquiring = acquiring;
    return acquiring;
  }

  play() {
    if (!this.source) return Promise.reject(failure("NotSupportedError", "Audio clip has no source"));
    if (this.playing) return this.playing;
    this.wanted = true;
    const revision = this.revision;
    const start = slot => {
      if (revision !== this.revision || !this.wanted) throw failure("AbortError", "Audio clip cancelled");
      slot.audio.loop = this.loop;
      return slot.audio.play();
    };
    let result;
    try {
      // A blocked leased player can be retried directly in the recovery tap.
      result = this.slot ? start(this.slot) : this.ensureSlot().then(start);
    } catch (error) { result = Promise.reject(error); }
    const pending = Promise.resolve(result).then(() => {
      // An old play promise must not pause a player already leased by a newer
      // clip. Cancellation detached it synchronously and removed its listeners.
      if (revision !== this.revision || !this.wanted) return;
      this.backend.clearBlocked(this);
    }, error => {
      if (revision !== this.revision || !this.wanted) throw error;
      if (isAudioPermissionError(error) && this.recovery !== "drop") {
        this.backend.markBlocked(this);
      } else this.pause();
      throw error;
    }).finally(() => { if (this.playing === pending) this.playing = null; });
    this.playing = pending;
    return pending;
  }

  suspend() {
    if (!this.wanted) return;
    this.detach();
    this.revision++;
    this.playing = null;
    this.acquiring = null;
    if (this.recovery === "drop") {
      this.wanted = false;
      // Notify the existing effect owners to remove their finished one-shot;
      // otherwise their preference registries retain a silent clip forever.
      this.dispatchEvent(new Event("ended"));
      this.onended?.();
    } else {
      this.backend.markBlocked(this);
      this.dispatchEvent(new Event("interrupted"));
    }
  }
  pause() {
    this.wanted = false;
    this.revision++;
    this.playing = null;
    this.acquiring = null;
    this.backend.clearBlocked(this);
    this.detach();
  }
  detach() {
    const slot = this.slot;
    if (!slot) {
      // acquire() reserves synchronously but attaches after a microtask. A
      // cancellation must release that reservation without waiting for it.
      for (const reserved of this.backend.slots) {
        if (reserved.owner === this) reserved.owner = null;
      }
      return;
    }
    this.offset = slot.audio.currentTime || 0;
    this.savedDuration = slot.audio.duration;
    for (const type of MEDIA_EVENTS) slot.audio.removeEventListener(type, this.forward);
    this.slot = null;
    slot.audio.pause();
    slot.audio.removeAttribute("src");
    slot.audio.load();
    slot.owner = null;
  }
}

let sharedPlayback;
export function getBrowserAudioPlayback() {
  return sharedPlayback ??= new BrowserAudioPlayback();
}

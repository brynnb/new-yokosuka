export const ARCADE_SCORE_MACHINE_IDS = Object.freeze([
  "qte-0",
  "qte-1",
  "darts-0",
  "darts-1",
]);

const MACHINE_ID_SET = new Set(ARCADE_SCORE_MACHINE_IDS);

export class ArcadeScoreClient {
  constructor({
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = () => Date.now(),
    cacheDurationMs = 60_000,
    requestTimeoutMs = 10_000,
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cacheDurationMs = cacheDurationMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.scores = new Map();
    this.loadedAt = null;
    this.loading = null;
    this.listeners = new Set();
  }

  highScore(machineId, fallback = 0) {
    const score = this.scores.get(machineId);
    return Number.isFinite(score) ? score : fallback;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener(this);
  }

  applyHighScore(machineId, score) {
    const normalized = Number(score);
    if (
      !MACHINE_ID_SET.has(machineId)
      || !Number.isFinite(normalized)
      || normalized < 0
      || normalized <= this.highScore(machineId, -1)
    ) return false;
    this.scores.set(machineId, normalized);
    this.loadedAt = this.now();
    this.notify();
    return true;
  }

  async refresh({ force = false } = {}) {
    if (
      !force
      && this.loadedAt !== null
      && this.now() - this.loadedAt < this.cacheDurationMs
    ) return this.scores;
    if (this.loading) return this.loading;
    this.loading = this.fetchImpl("/api/arcade-scores", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Arcade scores failed (${response.status})`);
      const body = await response.json();
      const nextScores = new Map();
      for (const entry of body?.scores || []) {
        const score = Number(entry?.score);
        if (MACHINE_ID_SET.has(entry?.machineId) && Number.isFinite(score)) {
          nextScores.set(entry.machineId, Math.max(0, score));
        }
      }
      if (
        ARCADE_SCORE_MACHINE_IDS.some((machineId) => (
          !nextScores.has(machineId)
        ))
      ) throw new Error("Arcade score response is incomplete");
      this.scores = nextScores;
      this.loadedAt = this.now();
      this.notify();
      return this.scores;
    }).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async requestJSON(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException(
      "Arcade request timed out", "TimeoutError",
    )), this.requestTimeoutMs);
    try {
      const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
      const response = await this.fetchImpl(url, {
        credentials: "same-origin", ...options, signal,
      });
      if (!response.ok) throw new Error(`Arcade request failed (${response.status})`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async leaderboard(machineId, { signal } = {}) {
    if (!MACHINE_ID_SET.has(machineId)) throw new Error("Invalid arcade machine");
    const body = await this.requestJSON(
      `/api/arcade-scores?${new URLSearchParams({ machineId })}`,
      { signal, cache: "no-store", headers: { Accept: "application/json" } },
    );
    const ids = new Set();
    if (body?.machineId !== machineId || !Array.isArray(body.entries)
      || body.entries.length > 30 || body.entries.some(entry => {
        const invalid = !Number.isSafeInteger(entry?.characterId) || entry.characterId <= 0
          || ids.has(entry.characterId) || typeof entry.playerName !== "string" || !entry.playerName
          || !Number.isFinite(entry.score) || entry.score < 0
          || typeof entry.achievedAt !== "string" || !Number.isFinite(Date.parse(entry.achievedAt));
        ids.add(entry?.characterId);
        return invalid;
      })) throw new Error("Arcade leaderboard response is invalid");
    return body.entries;
  }

  async submit(machineId, score, characterId) {
    if (
      !MACHINE_ID_SET.has(machineId)
      || !Number.isFinite(score)
      || score < 0
      || !Number.isSafeInteger(characterId)
      || characterId <= 0
    ) {
      return null;
    }
    const result = await this.requestJSON("/api/arcade-scores", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ characterId, machineId, score }),
    });
    const highScore = Number(result?.score);
    if (
      result?.machineId !== machineId
      || !Number.isFinite(highScore)
      || highScore < 0
    ) {
      throw new Error("Arcade score response is invalid");
    }
    this.scores.set(machineId, highScore);
    this.loadedAt = this.now();
    this.notify();
    return result;
  }
}

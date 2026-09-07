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
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cacheDurationMs = cacheDurationMs;
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
    const response = await this.fetchImpl("/api/arcade-scores", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ characterId, machineId, score }),
    });
    if (!response.ok) throw new Error(`Arcade score failed (${response.status})`);
    const result = await response.json();
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

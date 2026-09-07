const DEFAULT_POLL_INTERVAL_MS = 3000;

export function accountConnectionStatusText(state) {
  if (state === "connected") return "Server Online";
  if (state === "checking") return "Checking Server...";
  return "Server Offline";
}

export class AccountConnectionStatus {
  constructor({
    request = async () => {
      const response = await fetch("/api/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`status returned ${response.status}`);
      return response.json();
    },
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (handle) => clearTimeout(handle),
  } = {}) {
    this.request = request;
    this.pollIntervalMs = pollIntervalMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.running = false;
    this.onChange = () => {};
  }

  start(onChange) {
    this.stop();
    this.running = true;
    this.onChange = onChange;
    this.#emit("checking");
    void this.#poll();
  }

  stop() {
    this.running = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  async #poll() {
    try {
      const result = await this.request();
      if (!this.running) return;
      this.#emit("connected");
    } catch {
      if (!this.running) return;
      this.#emit("offline");
    }
    if (!this.running) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.#poll();
    }, this.pollIntervalMs);
  }

  #emit(state) {
    this.onChange({
      state,
      text: accountConnectionStatusText(state),
    });
  }
}

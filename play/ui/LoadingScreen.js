const MINIMUM_VISIBLE_MS = 2_000;
const FADE_TO_BLACK_MS = 220;

export class LoadingScreen {
  constructor({
    dom,
    getDate,
    worldHud,
    onFinished,
    clock = performance,
    timers = window,
  }) {
    this.dom = dom;
    this.getDate = getDate;
    this.worldHud = worldHud;
    this.onFinished = onFinished;
    this.clock = clock;
    this.timers = timers;
    this.startedAt = clock.now();
    this.completed = 0;
    this.total = 1;
    this.error = null;
  }

  render() {
    this.dom.loadingProgress.hidden = Boolean(this.error);
    this.dom.loadingError.hidden = !this.error;
    this.dom.loadingError.textContent = this.error || "";
    this.dom.loadingCount.textContent = `(${this.completed}/${this.total})`;
  }

  setProgress(completed, total) {
    this.error = null;
    this.total = Math.max(1, Math.trunc(total));
    this.completed = Math.min(
      this.total,
      Math.max(0, Math.trunc(completed)),
    );
    this.render();
  }

  advance(amount = 1) {
    this.setProgress(this.completed + amount, this.total);
  }

  setError(message) {
    this.error = message;
    this.render();
  }

  setWorld(world) {
    this.dom.loadingPlaceJapanese.textContent = world.japaneseLabel;
    this.dom.loadingPlaceEnglish.textContent = world.label;
    this.worldHud.setLoadingDate(this.getDate());
  }

  begin(world) {
    this.dom.loading.classList.remove("day-rollover-fade");
    this.startedAt = this.clock.now();
    this.dom.loadingWord.textContent = "Loading";
    this.setProgress(0, 1);
    this.setWorld(world);
    this.dom.loading.classList.remove("awaiting-server");
    this.dom.loading.classList.remove("hidden");
  }

  async waitUntilPainted(signal = null) {
    // A single animation-frame callback runs before paint. Waiting for the
    // following frame guarantees the newly-visible overlay was composited
    // before synchronous world teardown can occupy the main thread.
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((resolve) => this.timers.requestAnimationFrame(resolve));
      if (signal?.aborted) return false;
    }
    return true;
  }

  async beginDayRollover(world, date, signal = null) {
    this.dom.loadingWord.textContent = "Loading";
    this.setProgress(1, 1);
    this.setWorld(world);
    this.worldHud.setLoadingDate(date);
    this.dom.loading.classList.remove("awaiting-server");
    this.dom.loading.classList.add("day-rollover-fade");
    this.dom.loading.classList.remove("hidden");

    await new Promise((resolve) => {
      let timeoutId = null;
      const finishWait = () => {
        if (timeoutId !== null) this.timers.clearTimeout(timeoutId);
        signal?.removeEventListener("abort", finishWait);
        resolve();
      };
      timeoutId = this.timers.setTimeout(finishWait, FADE_TO_BLACK_MS);
      signal?.addEventListener("abort", finishWait, { once: true });
    });
    if (signal?.aborted) {
      this.dom.loading.classList.remove("day-rollover-fade");
      return false;
    }

    this.startedAt = this.clock.now();
    this.dom.loading.classList.remove("day-rollover-fade");
    return true;
  }

  async showDayRollover(world, date, signal = null) {
    if (!await this.beginDayRollover(world, date, signal)) return false;
    return this.finish(signal);
  }

  async finish(signal = null) {
    const remaining = MINIMUM_VISIBLE_MS - (
      this.clock.now() - this.startedAt
    );
    if (remaining > 0) {
      await new Promise((resolve) => {
        let timeoutId = null;
        const finishWait = () => {
          if (timeoutId !== null) this.timers.clearTimeout(timeoutId);
          signal?.removeEventListener("abort", finishWait);
          resolve();
        };
        timeoutId = this.timers.setTimeout(finishWait, remaining);
        signal?.addEventListener("abort", finishWait, { once: true });
      });
    }
    if (signal?.aborted) return false;
    // World readiness enables rendering. Keep the cover through the next
    // paint so the first frame is prepared before we reveal the canvas.
    if (!await this.waitUntilPainted(signal)) return false;
    this.dom.loading.classList.add("hidden");
    this.timers.requestAnimationFrame(this.onFinished);
    return true;
  }

  refreshDate() {
    this.worldHud.setLoadingDate(this.getDate());
  }

  dispose() {}
}

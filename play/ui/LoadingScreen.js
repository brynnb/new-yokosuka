export const FADE_TO_BLACK_MS = 1_000;
export const REVEAL_MS = 500;

export class LoadingScreen {
  constructor({
    dom,
    getDate,
    worldHud,
    onFinished,
    timers = window,
  }) {
    this.dom = dom;
    this.getDate = getDate;
    this.worldHud = worldHud;
    this.onFinished = onFinished;
    this.timers = timers;
    this.phase = "loading";
    this.operation = null;
    this.disposed = false;
    this.completed = 0;
    this.total = 1;
    this.error = null;
    this.presentation = null;
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
    this.replaceOperation();
    this.setPhase("loading");
    this.releaseFrame();
    this.error = message;
    this.render();
  }

  setWorld(world, presentation = null) {
    this.presentation = presentation;
    this.dom.loadingPlaceJapanese.textContent = presentation?.japaneseLabel ?? world.japaneseLabel;
    this.dom.loadingPlaceEnglish.textContent = presentation?.label ?? world.label;
    this.refreshDate();
  }

  get canRender() {
    return ["hidden", "preparing-reveal", "revealing"].includes(this.phase);
  }

  setPhase(phase) {
    if (["covered", "loading", "hidden"].includes(phase)) {
      // Timers can run just before the compositor's final transition frame.
      // Commit the endpoint before teardown/loading; otherwise even after
      // two paints Chromium can report opacity 0.999878 rather than black.
      for (const animation of this.dom.loading.getAnimations()) animation.finish();
    }
    this.phase = phase;
    for (const name of ["hidden", "covering", "covered", "revealing"]) {
      this.dom.loading.classList.toggle(name, phase === name);
    }
    this.dom.loading.style.setProperty("--loading-cover-ms", `${FADE_TO_BLACK_MS}ms`);
    this.dom.loading.style.setProperty("--loading-reveal-ms", `${REVEAL_MS}ms`);
  }

  replaceOperation(signal) {
    this.operation?.abort();
    const controller = new AbortController();
    this.operation = controller;
    return signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  }

  wait(ms, signal, frame = false) {
    if (signal?.aborted || this.disposed) return Promise.resolve(false);
    return new Promise(resolve => {
      const done = () => {
        if (frame) this.timers.cancelAnimationFrame(id);
        else this.timers.clearTimeout(id);
        signal?.removeEventListener("abort", done);
        resolve(!signal?.aborted && !this.disposed);
      };
      const id = frame
        ? this.timers.requestAnimationFrame(done)
        : this.timers.setTimeout(done, ms);
      signal?.addEventListener("abort", done, { once: true });
    });
  }

  captureFrame() {
    const frame = this.dom.transitionFrame;
    const canvas = this.dom.canvas;
    if (!frame || !canvas) return;
    // Callers must cover BEFORE releasing scene ownership. Snapshot the last
    // presented frame so a render already in progress cannot change the fade.
    frame.width = canvas.width;
    frame.height = canvas.height;
    frame.getContext("2d").drawImage(canvas, 0, 0);
    frame.hidden = false;
  }

  releaseFrame() {
    const frame = this.dom.transitionFrame;
    if (!frame) return;
    frame.hidden = true;
    frame.width = frame.height = 0;
  }

  async cover(signal = null) {
    if (signal?.aborted || this.disposed) return false;
    const operation = this.replaceOperation(signal);
    if (!["loading", "covered"].includes(this.phase)) {
      if (this.phase !== "covering") this.captureFrame();
      this.setPhase("covering");
      if (!await this.wait(FADE_TO_BLACK_MS, operation)) return false;
    }
    if (operation.aborted) return false;
    this.setPhase("covered");
    this.releaseFrame();
    return true;
  }

  async begin(world, signal = null, presentation = null) {
    const covering = this.cover(signal);
    const operation = this.operation;
    if (!await covering || operation !== this.operation || signal?.aborted) return false;
    this.dom.loadingWord.textContent = "Loading";
    this.setProgress(0, 1);
    this.setWorld(world, presentation);
    this.dom.loading.classList.remove("awaiting-server");
    this.setPhase("loading");
    return this.waitUntilPainted(signal
      ? AbortSignal.any([signal, operation.signal]) : operation.signal);
  }

  async waitUntilPainted(signal = null) {
    // A single animation-frame callback runs before paint. Waiting for the
    // following frame guarantees the newly-visible overlay was composited
    // before synchronous world teardown can occupy the main thread.
    for (let frame = 0; frame < 2; frame += 1) {
      if (!await this.wait(0, signal, true)) return false;
    }
    return true;
  }

  async beginDayRollover(world, date, signal = null) {
    if (!await this.begin(world, signal)) return false;
    this.setProgress(1, 1);
    this.worldHud.setLoadingDate(date);
    return true;
  }

  async showDayRollover(world, date, signal = null) {
    if (!await this.beginDayRollover(world, date, signal)) return false;
    return this.finish(signal);
  }

  async finish(signal = null) {
    if (signal?.aborted || this.disposed) return false;
    const operation = this.replaceOperation(signal);
    // Start rendering/simulation behind the cover. The reveal runs alongside
    // the new scene, never as a delay before its timeline is allowed to start.
    this.setPhase("preparing-reveal");
    if (!await this.waitUntilPainted(operation)) return false;
    this.setPhase("revealing");
    if (!await this.wait(REVEAL_MS, operation)) return false;
    this.setPhase("hidden");
    this.onFinished();
    return true;
  }

  refreshDate() {
    // A loading caption is not a world-clock override. Keep it through server
    // refreshes, and reset it when the next load begins without a presentation.
    this.worldHud.setLoadingDate(this.presentation?.dateTime
      ? new Date(this.presentation.dateTime) : this.getDate());
  }

  dispose() {
    this.disposed = true;
    this.operation?.abort();
    this.releaseFrame();
  }
}

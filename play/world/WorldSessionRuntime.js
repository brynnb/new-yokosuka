export class WorldSessionRuntime {
  constructor({ invalidatePendingLoads, isCancellation }) {
    this.invalidatePendingLoads = invalidatePendingLoads;
    this.isCancellation = isCancellation;
    this.switching = false;
    this.activeController = null;
    this.queuedRequest = null;
  }

  async run(request) {
    if (this.switching) return this.queue(request);
    this.switching = true;
    const controller = new AbortController();
    this.activeController = controller;
    let cancelled = false;
    let failed = false;
    let result = true;
    let queuedPromise = null;
    try {
      request.onStart?.();
      result = await request.load(controller.signal);
    } catch (error) {
      cancelled = this.isCancellation(error, controller.signal);
      if (!cancelled) {
        failed = true;
        await request.onError?.(error);
      }
    } finally {
      await request.onFinally?.({ cancelled, failed });
      this.switching = false;
      if (this.activeController === controller) this.activeController = null;
      const queued = this.queuedRequest;
      this.queuedRequest = null;
      if (queued) {
        queuedPromise = this.run(queued.request);
        queuedPromise.then(queued.resolve, queued.reject);
      }
    }
    return queuedPromise || (!cancelled && !failed ? result : false);
  }

  queue(request) {
    request.onQueue?.();
    this.activeController?.abort();
    this.invalidatePendingLoads();
    this.queuedRequest?.resolve(false);
    return new Promise((resolve, reject) => {
      this.queuedRequest = { request, resolve, reject };
    });
  }

  cancel() {
    this.activeController?.abort();
    this.activeController = null;
    this.invalidatePendingLoads();
    this.queuedRequest?.resolve(false);
    this.queuedRequest = null;
    this.switching = false;
  }
}

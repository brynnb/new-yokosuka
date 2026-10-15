function defaultRequestId() {
  return crypto.randomUUID();
}

const TERMINAL_EVENTS = new Set(["complete", "cancelled", "declined"]);

function waitForPresentation(promise, signal) {
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  // Closing a line must unblock the ordered reply queue even if its voice or
  // activity promise has not settled. Observe the late promise, but never let
  // it delay cancellation or mutate a subsequent conversation's controller.
  return Promise.race([promise, cancelled]).finally(() => signal.removeEventListener("abort", abort));
}

export class ScriptEventController {
  constructor({
    client,
    presentation,
    dialogue,
    prepareStart = null,
    requestTimeoutMs = 15000,
    createRequestId = defaultRequestId,
    onStateChanged = () => {},
    onStarted = () => {},
    onError = () => {},
  } = {}) {
    if (
      typeof client?.startScriptEvent !== "function"
      || typeof client?.advanceScriptEvent !== "function"
      || typeof presentation?.begin !== "function"
      || typeof presentation?.execute !== "function"
      || typeof dialogue?.show !== "function"
      || typeof dialogue?.showOptions !== "function"
      || typeof dialogue?.hide !== "function"
    ) {
      throw new TypeError("script event controller requires client and presentation adapters");
    }
    this.client = client;
    this.presentation = presentation;
    this.dialogue = dialogue;
    this.prepareStart = prepareStart;
    this.requestTimeoutMs = requestTimeoutMs;
    this.abandonedStarts = new Set();
    this.createRequestId = createRequestId;
    this.onStateChanged = onStateChanged;
    this.onStarted = onStarted;
    this.onError = onError;
    this.pendingStart = null;
    this.active = null;
    this.processing = Promise.resolve();
    this.runEndWaiters = new Map();
  }

  get status() {
    if (this.pendingStart) return "starting";
    if (!this.active) return "idle";
    if (this.active.cancelling) return "cancelling";
    if (this.active.awaitingLine) return "line";
    if (this.active.optionIds) return "options";
    return "running";
  }

  get ownsPlayerPresentation() {
    return Boolean(this.active?.presentationStarted && this.presentation.ownsPlayerPresentation);
  }

  start(selector, context = {}) {
    if (this.pendingStart || this.active) {
      return Promise.reject(new Error("a script event is already active"));
    }
    const requestId = this.createRequestId();
    let resolve;
    let reject;
    const result = new Promise((resolve_, reject_) => {
      resolve = resolve_;
      reject = reject_;
    });
    const pending = this.pendingStart = {
      requestId,
      selector: { ...selector },
      context: { ...context },
      resolve,
      reject,
      releaseState: null,
      sent: false,
      controller: new AbortController(),
    };
    this.armRequestTimeout(pending);
    if (this.prepareStart) {
      this.emitState();
      void this.preparePendingStart(pending);
    } else this.sendStart(pending);
    return result;
  }

  async preparePendingStart(pending) {
    try {
      const release = await this.prepareStart({ signal: pending.controller.signal });
      if (typeof release !== "function") throw new Error("script state ownership did not provide cleanup");
      if (this.pendingStart !== pending) {
        release();
        return;
      }
      pending.releaseState = release;
      this.sendStart(pending);
    } catch (error) {
      if (this.pendingStart !== pending) return;
      this.clearRequestTimeout(pending);
      this.pendingStart = null;
      pending.releaseState?.();
      pending.reject(error);
      this.emitState();
    }
  }

  sendStart(pending) {
    const { selector, requestId } = pending;
    if (this.client.startScriptEvent(selector, requestId) !== true) {
      this.clearRequestTimeout(pending);
      this.pendingStart = null;
      pending.releaseState?.();
      const error = new Error("script event requires a server connection");
      error.code = "connection_unavailable";
      pending.reject(error);
      this.emitState();
      return;
    }
    pending.sent = true;
    this.armRequestTimeout(pending);
    this.emitState();
  }

  clearRequestTimeout(owner) {
    if (owner?.timer) clearTimeout(owner.timer);
    if (owner) owner.timer = null;
  }

  abandonStart(pending) {
    this.clearRequestTimeout(pending);
    pending.controller.abort(new DOMException("script start abandoned", "AbortError"));
    if (!pending.sent) return;
    this.abandonedStarts.add(pending.requestId);
    // Only retain recent requests; the server also expires abandoned leases.
    if (this.abandonedStarts.size > 32) this.abandonedStarts.delete(this.abandonedStarts.values().next().value);
  }

  armRequestTimeout(owner) {
    this.clearRequestTimeout(owner);
    owner.timer = setTimeout(() => {
      const error = new Error("script event response timed out; its result is not known");
      error.code = "script_timeout";
      if (this.pendingStart === owner) {
        this.abandonStart(owner);
        this.pendingStart = null;
        owner.releaseState?.();
        owner.reject(error);
        this.emitState();
      } else if (this.active === owner) void this.fail(error);
    }, this.requestTimeoutMs);
    owner.timer.unref?.();
  }

  handleYield(message) {
    this.processing = this.processing
      .then(() => this.processYield(message))
      .catch(error => this.fail(error));
    return this.processing;
  }

  handleRejected(message) {
    const pending = this.pendingStart;
    if (pending && message?.requestId === pending.requestId) {
      this.clearRequestTimeout(pending);
      this.pendingStart = null;
      pending.releaseState?.();
      const error = new Error(message.message || "script event was rejected");
      error.code = message.code;
      pending.resolve({ outcome: "rejected", error, message });
      this.emitState();
      return true;
    }
    if (!this.active || message?.requestId !== this.active.requestId) {
      return false;
    }
    this.clearRequestTimeout(this.active);
    const error = new Error(message.message || "script event advance was rejected");
    error.code = message.code;
    void this.fail(error);
    return true;
  }

  advanceLine() {
    if (!this.active?.awaitingLine) return false;
    this.dialogue.hide();
    this.active.awaitingLine = false;
    return this.sendAdvance("continue");
  }

  selectOption(optionId) {
    if (!this.active?.optionIds?.has(optionId)) return false;
    this.dialogue.hide();
    this.active.optionIds = null;
    return this.sendAdvance("select", { optionId });
  }

  challengeResponse(action,token,button=null) {
    const active=this.active;
    if(!active?.challengePrompt || active.cancelling || active.challengeInputPending || token!==active.challengePrompt.token)return false;
    active.challengeInputPending=true;
    return this.sendAdvance(action,{challengeToken:token,...(button ? {button}: {})});
  }
  combatResponse(action,token,intent=null) {
    const active=this.active;
    if(!active?.combatView || active.cancelling || active.combatInputPending || token!==active.combatView.token)return false;
    active.combatInputPending=true;
    return this.sendAdvance(action,{combatToken:token,...(intent?{combat:intent}:{})});
  }
  navigationResponse(action,token,intent=null){
    const a=this.active;if(!a?.challengePrompt?.navigation||a.cancelling||a.challengeInputPending||token!==a.challengePrompt.token)return false;
    a.challengeInputPending=true;return this.sendAdvance(action,{challengeToken:token,...(intent?{navigation:intent}:{})});
  }

  cancel(reason = "user-cancelled") {
    if (this.pendingStart) {
      const pending = this.pendingStart;
      this.abandonStart(pending);
      this.pendingStart = null;
      pending.releaseState?.();
      const error = new Error(`script event cancelled: ${reason}`);
      error.code = "start_cancelled";
      pending.reject(error);
      this.emitState();
      return true;
    }
    if (!this.active) return false;
    if (this.active.cancelling) return false;
    this.active.cancelling = true;
    this.active.controller.abort(new DOMException(reason, "AbortError"));
    this.dialogue.hide();
    this.rollbackPresentation(this.active, reason);
    return this.sendAdvance("cancel");
  }

  update(deltaSeconds) {
    if (!this.active?.presentationStarted) return false;
    try {
      if (this.presentation.update(deltaSeconds) !== true) {
        throw new Error("script presentation frame update was rejected");
      }
      return true;
    } catch (error) {
      void this.fail(error);
      return false;
    }
  }

  reset(reason = "reset") {
    if (this.pendingStart) {
      this.abandonStart(this.pendingStart);
      const error = new Error(`script event interrupted: ${reason}`);
      error.code = "start_interrupted";
      this.pendingStart.reject(error);
      this.pendingStart.releaseState?.();
    }
    this.pendingStart = null;
    this.clearRequestTimeout(this.active);
    this.active?.controller.abort(new DOMException(reason, "AbortError"));
    this.dialogue.hide();
    this.rollbackPresentation(this.active, reason);
    this.active?.releaseState?.();
    this.active = null;
    this.emitState();
  }

  async processYield(message) {
    if (this.abandonedStarts.delete(message?.requestId)) {
      if (Number.isSafeInteger(message.runId) && message.runId > 0 && !TERMINAL_EVENTS.has(message?.event?.type)) {
        this.client.advanceScriptEvent(message.runId, "cancel", { requestId: this.createRequestId() });
      }
      return false;
    }
    let active = this.active;
    const pending = this.pendingStart;
    if (pending && message?.requestId === pending.requestId) {
      this.clearRequestTimeout(pending);
      this.pendingStart = null;
      active = {
        runId: message.runId,
        requestId: message.requestId,
        scriptIdentity: {
          kind: "database",
          runId: message.runId,
          scriptId: message.scriptId,
          versionId: message.versionId,
          scriptSlug: message.scriptSlug,
          selector: pending.selector,
          context: pending.context,
        },
        context: pending.context,
        controller: new AbortController(),
        presentationStarted: false,
        cancelling: false,
        awaitingLine: false,
        optionIds: null,
        releaseState: pending.releaseState,
      };
      this.active = active;
      try {
        this.onStarted(active.scriptIdentity);
      } catch (error) {
        console.error("Database script start listener failed:", error);
      }
      pending.resolve({
        outcome: TERMINAL_EVENTS.has(message?.event?.type)
          ? message.event.type
          : "started",
        message,
      });
    } else if (!active || message?.requestId !== active.requestId) {
      return false;
    }
    this.clearRequestTimeout(active);
    const event = message?.event;
    if (!event?.type) throw new Error("server yielded an invalid script event");
    if(active.combatView && event.type!=="combat") {this.presentation.endCombat();this.dialogue.hide();active.combatView=null;active.combatInputPending=false;}
    if(active.challengePrompt?.navigation&&event.type!=="challenge"){this.presentation.endNavigation();this.dialogue.hide();active.challengePrompt=null;active.challengeInputPending=false;}
    if((active.challengePrompt?.delivery||active.challengePrompt?.race)&&event.type!=="challenge"){this.presentation.endForkliftChallenge();this.dialogue.hide();active.challengePrompt=null;active.challengeInputPending=false;}
    if (TERMINAL_EVENTS.has(event.type)) {
      active.controller.abort(new DOMException(event.type, "AbortError"));
      this.dialogue.hide();
      if (active.presentationStarted) {
        if (event.type === "complete") this.presentation.commit();
        else this.presentation.rollback(event.type);
      }
      active.releaseState?.();
      this.active = null;
      this.emitState();
      return true;
    }
    if (!active.presentationStarted) {
      this.presentation.begin(active.context);
      active.presentationStarted = true;
    }
    if(event.type==="combat") {
      const view=message.combat;
      if(!view || !/^[0-9a-f]{32}$/.test(view.token))throw new Error("Invalid combat snapshot");
      active.combatView=view;active.combatInputPending=false;
      if(!await this.present(active,()=>this.presentation.showCombat(view)))return false;
      this.dialogue.showCombat(view);this.emitState();return true;
    }
    if(event.type==="challenge") {
      const prompt=message.challenge;
      if(!prompt || !/^[0-9a-f]{32}$/.test(prompt.token))throw new Error("server challenge prompt is invalid");
      active.challengePrompt=prompt;active.challengeInputPending=false;
      if(prompt.delivery||prompt.race){
        if(!await this.present(active,()=>this.presentation.showForkliftChallenge(prompt)))return false;
        if(prompt.race)this.dialogue.showRace(prompt);else this.dialogue.showDelivery(prompt);this.emitState();return true;
      }
      if(prompt.navigation){
        if(!await this.present(active,()=>this.presentation.showNavigation(prompt)))return false;
        this.dialogue.showNavigation(prompt);this.emitState();return true;
      }
      if(!await this.present(active,()=>this.dialogue.showChallenge(prompt)))return false;
      this.emitState();return true;
    }
    if(active.challengePrompt){this.dialogue.hide();active.challengePrompt=null;active.challengeInputPending=false;}
    if (event.type === "command") {
      if (!await this.present(active, () => this.presentation.execute(event))) return false;
      return this.sendAdvance("continue");
    }
    if (event.type === "line") {
      if (!message.line) throw new Error("script line content is unavailable");
      active.awaitingLine = true;
      if (!await this.present(active, () => this.dialogue.show(message.line, event))) return false;
      this.emitState();
      return true;
    }
    if (event.type === "options") {
      const options = message.options;
      if (!Array.isArray(options) || options.length === 0) {
        throw new Error("server did not provide compiled script options");
      }
      active.optionIds = new Set(
        options.filter(option => option.isAvailable === true).map(option => option.id),
      );
      if (active.optionIds.size === 0) {
        throw new Error("script event has no available options");
      }
      if (!await this.present(active, () => this.dialogue.showOptions(options, event))) return false;
      this.emitState();
      return true;
    }
    throw new Error(`unsupported script event ${event.type}`);
  }

  async present(active, action) {
    try {
      await waitForPresentation(action(), active.controller.signal);
    } catch (error) {
      if (this.active !== active || active.controller.signal.aborted) return false;
      throw error;
    }
    return this.active === active && !active.cancelling;
  }

  sendAdvance(action, options = {}) {
    const active = this.active;
    if (!active) return false;
    const requestId = this.createRequestId();
    if (
      this.client.advanceScriptEvent(active.runId, action, {
        requestId,
        ...options,
      })
      !== true
    ) {
      void this.fail(new Error("script event lost its server connection"));
      return false;
    }
    active.requestId = requestId;
    this.armRequestTimeout(active);
    this.emitState();
    return true;
  }

  async fail(error) {
    const active = this.active;
    this.clearRequestTimeout(active);
    active?.controller.abort(error);
    this.dialogue.hide();
    this.rollbackPresentation(active, "client-error");
    active?.releaseState?.();
    this.active = null;
    if (active) {
      this.client.advanceScriptEvent(active.runId, "cancel", {
        requestId: this.createRequestId(),
      });
    }
    this.onError(error);
    this.emitState();
    return false;
  }

  rollbackPresentation(active, reason) {
    if (!active?.presentationStarted) return;
    active.presentationStarted = false;
    try {
      this.presentation.rollback(reason);
    } catch (error) {
      // A failed visual cleanup must not retain a native-state owner or prevent
      // the server cancellation request from releasing its run lease.
      console.error("Script presentation rollback failed:", error);
    }
  }

  emitState() {
    this.onStateChanged(this.status);
    for (const [runId, waiters] of this.runEndWaiters) {
      if (this.active?.runId === runId) continue;
      this.runEndWaiters.delete(runId);
      for (const resolve of waiters) resolve();
    }
  }

  waitForRunEnd(runId) {
    if (this.active?.runId !== runId) return Promise.resolve();
    return new Promise(resolve => {
      const waiters = this.runEndWaiters.get(runId) || [];
      waiters.push(resolve);
      this.runEndWaiters.set(runId, waiters);
    });
  }
}

export function createScriptEventController(options) {
  return new ScriptEventController(options);
}

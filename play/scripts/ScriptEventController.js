function defaultRequestId() {
  return crypto.randomUUID();
}

const TERMINAL_EVENTS = new Set(["complete", "cancelled", "declined"]);

export class ScriptEventController {
  constructor({
    client,
    presentation,
    dialogue,
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
    this.createRequestId = createRequestId;
    this.onStateChanged = onStateChanged;
    this.onStarted = onStarted;
    this.onError = onError;
    this.pendingStart = null;
    this.active = null;
    this.processing = Promise.resolve();
  }

  get status() {
    if (this.pendingStart) return "starting";
    if (!this.active) return "idle";
    if (this.active.cancelling) return "cancelling";
    if (this.active.awaitingLine) return "line";
    if (this.active.optionIds) return "options";
    return "running";
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
    this.pendingStart = {
      requestId,
      selector: { ...selector },
      context: { ...context },
      resolve,
      reject,
    };
    if (this.client.startScriptEvent(selector, requestId) !== true) {
      this.pendingStart = null;
      const error = new Error("script event requires a server connection");
      error.code = "connection_unavailable";
      reject(error);
      return result;
    }
    this.emitState();
    return result;
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
      this.pendingStart = null;
      const error = new Error(message.message || "script event was rejected");
      error.code = message.code;
      pending.resolve({ outcome: "rejected", error, message });
      this.emitState();
      return true;
    }
    if (!this.active || message?.requestId !== this.active.requestId) {
      return false;
    }
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

  cancel(reason = "user-cancelled") {
    if (this.pendingStart) {
      const pending = this.pendingStart;
      this.pendingStart = null;
      const error = new Error(`script event cancelled: ${reason}`);
      error.code = "start_cancelled";
      pending.reject(error);
      this.emitState();
      return true;
    }
    if (!this.active) return false;
    if (this.active.cancelling) return false;
    this.active.cancelling = true;
    this.dialogue.hide();
    this.presentation.rollback(reason);
    this.active.presentationStarted = false;
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
      const error = new Error(`script event interrupted: ${reason}`);
      error.code = "start_interrupted";
      this.pendingStart.reject(error);
    }
    this.pendingStart = null;
    this.dialogue.hide();
    if (this.active?.presentationStarted) this.presentation.rollback(reason);
    this.active = null;
    this.emitState();
  }

  async processYield(message) {
    let active = this.active;
    const pending = this.pendingStart;
    if (pending && message?.requestId === pending.requestId) {
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
        presentationStarted: false,
        cancelling: false,
        awaitingLine: false,
        optionIds: null,
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
    const event = message?.event;
    if (!event?.type) throw new Error("server yielded an invalid script event");
    if (TERMINAL_EVENTS.has(event.type)) {
      this.dialogue.hide();
      if (active.presentationStarted) {
        if (event.type === "complete") this.presentation.commit();
        else this.presentation.rollback(event.type);
      }
      this.active = null;
      this.emitState();
      return true;
    }
    if (!active.presentationStarted) {
      this.presentation.begin(active.context);
      active.presentationStarted = true;
    }
    if (event.type === "command") {
      try {
        await this.presentation.execute(event);
      } catch (error) {
        if (this.active !== active || active.cancelling) return false;
        throw error;
      }
      if (this.active !== active || active.cancelling) return false;
      return this.sendAdvance("continue");
    }
    if (event.type === "line") {
      if (!message.line) throw new Error("script line content is unavailable");
      active.awaitingLine = true;
      await this.dialogue.show(message.line, event);
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
      await this.dialogue.showOptions(options, event);
      this.emitState();
      return true;
    }
    throw new Error(`unsupported script event ${event.type}`);
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
    this.emitState();
    return true;
  }

  async fail(error) {
    const active = this.active;
    this.dialogue.hide();
    if (active?.presentationStarted) {
      try {
        this.presentation.rollback("client-error");
      } catch (rollbackError) {
        console.error("Script presentation rollback failed:", rollbackError);
      }
    }
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

  emitState() {
    this.onStateChanged(this.status);
  }
}

export function createScriptEventController(options) {
  return new ScriptEventController(options);
}

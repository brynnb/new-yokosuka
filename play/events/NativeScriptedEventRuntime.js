import {
  createNativeActorByteState,
} from "./NativeActorByteState.js";
import {
  createNativeChildCoroutineRuntime,
} from "./NativeChildCoroutineRuntime.js";
import {
  createNativeEventInterpreter,
} from "./NativeEventInterpreter.js";
import {
  createInMemoryNativeEventProgramSource,
} from "./NativeEventProgramSource.js";
import {
  createNativeRuntimeInterfaceExecutor,
} from "./NativeRuntimeInterface.js";
import {
  createNativeRoomControllerLifecycle,
} from "./NativeRoomControllerLifecycle.js";
import {
  evaluateNativeScriptedInteractionGate,
} from "./NativeScriptedInteractionGate.js";
import {
  createNativeActorByteStateSemanticHandlers,
  createNativeCoroutineSemanticHandlers,
  createNativeDialogueChannelSemanticHandlers,
  createNativeEventOperationExecutor,
} from "./NativeEventOperationRuntime.js";

function programInteractions(programs) {
  const interactions = [];
  for (const program of programs || []) {
    for (const interaction of program.scriptedInteractions || []) {
      interactions.push({ program, interaction });
    }
  }
  return interactions;
}

function programAutomaticEvents(programs) {
  const events = [];
  for (const program of programs || []) {
    for (const event of program.automaticEvents || []) {
      events.push({ program, event });
    }
  }
  return events;
}

function roomControllerForEventCode(program, eventCode) {
  const code = String(eventCode || "").toUpperCase();
  const matches = (program.roomControllers || []).filter(controller => (
    (controller.dispatches || []).some(dispatch => (
      (dispatch.eventCodes || []).includes(code)
    ))
  ));
  return matches.length === 1 ? matches[0] : null;
}

function exactDialogueRequest(detail, actorCode) {
  const region = detail.dialogueRegion;
  const selectedActorCode = actorCode || (
    Array.isArray(region?.actorTags) && region.actorTags.length === 1
      ? region.actorTags[0]
      : null
  );
  if (
    !Array.isArray(region?.voiceIds)
    || region.voiceIds.length === 0
    || !Array.isArray(region.actorTags)
    || !selectedActorCode
    || !region.actorTags.includes(selectedActorCode)
  ) {
    return null;
  }
  return {
    kind: "dialogue",
    actorCode: selectedActorCode,
    voiceIds: [...region.voiceIds],
    source: detail.source,
    resourcePointer: detail.resourcePointer,
  };
}

function nativeStaticStringResolver(program) {
  const strings = new Map(
    (program.staticStrings || []).map(item => [item.pointer, item.value]),
  );
  return pointer => strings.get(pointer) ?? null;
}

function nativeStaticVectorResolver(program) {
  const vectors = new Map(
    (program.staticVectors || []).map(item => [item.pointer, item.words]),
  );
  return pointer => {
    const vector = vectors.get(pointer);
    return vector ? [...vector] : undefined;
  };
}

export class NativeScriptedEventRuntime {
  constructor({
    programSource = null,
    programPack = null,
    actorByteState = null,
    getActorByteState = null,
    handlers = {},
    createHandlers = null,
    createContext = null,
    createExecution = null,
    createProbe = null,
    roomControllerLifecycle = createNativeRoomControllerLifecycle(),
    maxSteps = 10000,
    onStarted = () => {},
    onDialogueRequest = () => {},
    onComplete = () => {},
    onStopped = () => {},
    onCancelled = () => {},
  }) {
    const source = programSource
      ?? createInMemoryNativeEventProgramSource(programPack);
    if (
      !Array.isArray(source?.programs)
      || typeof source.descriptor !== "function"
      || typeof source.loadProgram !== "function"
    ) throw new TypeError("native event program source is required");
    if (!actorByteState && typeof getActorByteState !== "function") {
      throw new TypeError("native actor byte state is required");
    }
    this.programSource = source;
    this.interactions = programInteractions(source.programs);
    this.automaticEvents = programAutomaticEvents(source.programs);
    this.actorByteState = actorByteState;
    this.getActorByteState = getActorByteState;
    this.handlers = handlers;
    this.createHandlers = createHandlers;
    this.createContext = createContext;
    this.createExecution = createExecution;
    this.createProbe = createProbe;
    this.roomControllerLifecycle = roomControllerLifecycle;
    this.maxSteps = maxSteps;
    this.callbacks = {
      onStarted,
      onDialogueRequest,
      onComplete,
      onStopped,
      onCancelled,
    };
    this.settlementListeners = new Set();
    this.status = "idle";
    this.current = null;
    this.pendingStart = null;
    this.automaticPoll = null;
  }

  onSettled(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("native event settlement listener must be a function");
    }
    this.settlementListeners.add(listener);
    return () => this.settlementListeners.delete(listener);
  }

  notifySettled(kind, result) {
    for (const listener of [...this.settlementListeners]) {
      try {
        listener({ kind, result });
      } catch (error) {
        console.error("Native event settlement listener failed:", error);
      }
    }
  }

  notifyCallback(name, result) {
    try {
      this.callbacks[name](result);
    } catch (error) {
      console.error(`Native event ${name} callback failed:`, error);
    }
  }

  interactionFor(area, actorCode) {
    const key = String(actorCode || "").toUpperCase();
    const matches = this.interactions.filter(({ program, interaction }) => (
      program.area === area
      && !interaction.objectTag
      && interaction.actorCode === key
    ));
    return matches.length === 1 ? matches[0] : null;
  }

  objectInteractionFor(area, objectTag) {
    const key = String(objectTag || "").toUpperCase();
    const matches = this.interactions.filter(({ program, interaction }) => (
      program.area === area && interaction.objectTag === key
    ));
    if (matches.length !== 1) return null;
    const selected = matches[0];
    return {
      ...selected,
      roomController: roomControllerForEventCode(
        selected.program,
        selected.interaction.objectTag,
      ),
    };
  }

  roomControllerForObject(area, objectTag) {
    return this.objectInteractionFor(area, objectTag)?.roomController ?? null;
  }

  hasInteraction(area, actorCode) {
    return Boolean(this.interactionFor(area, actorCode));
  }

  hasObjectInteraction(area, objectTag) {
    return Boolean(this.objectInteractionFor(area, objectTag));
  }

  hasAutomaticEvents(area) {
    return this.automaticEvents.some(({ program }) => program.area === area);
  }

  program(programId) {
    return this.programSource.descriptor(programId);
  }

  loadProgram(programId, options) {
    return this.programSource.loadProgram(programId, options);
  }

  async startProgram({
    programId,
    entryFunction = null,
    area = null,
    context = {},
  } = {}) {
    const program = this.program(programId);
    if (!program) {
      return this.stopResult("scripted-event-program-missing", { programId });
    }
    const entry = entryFunction || program.entryFunction;
    const reviewedEntries = new Set([
      program.entryFunction,
      ...(program.directEntries || []),
    ]);
    if (!reviewedEntries.has(entry)) {
      return this.stopResult("scripted-event-entry-missing", {
        programId: program.id,
        entryFunction: entry,
      });
    }
    const selectedArea = String(area || program.area).toUpperCase();
    if (selectedArea !== program.area) {
      return this.stopResult("scripted-event-area-mismatch", {
        programId: program.id,
        area: selectedArea,
        programArea: program.area,
      });
    }
    return this.startSelectedInteraction({
      area: selectedArea,
      selected: {
        program,
        interaction: {
          entryFunction: entry,
          actorCode: null,
          directProgram: true,
        },
      },
      context,
      activationResult: {
        resolved: true,
        matched: true,
        reason: null,
      },
    });
  }

  pollAutomaticEvents(detail) {
    if (this.automaticPoll) return this.automaticPoll.promise;
    const operation = { cancellation: null, promise: null };
    operation.promise = this.runAutomaticEventPoll(detail, operation);
    this.automaticPoll = operation;
    return operation.promise.finally(() => {
      if (this.automaticPoll === operation) this.automaticPoll = null;
    });
  }

  async runAutomaticEventPoll({ area, context = {} }, operation) {
    if (this.current || this.pendingStart) {
      return this.stopResult("scripted-event-already-running");
    }
    const candidates = this.automaticEvents.filter(
      ({ program }) => program.area === area,
    );
    if (candidates.length === 0) {
      return this.stopResult("automatic-event-route-missing", { area });
    }
    for (const selected of candidates) {
      let program;
      try {
        program = await this.loadProgram(selected.program.id);
      } catch (error) {
        if (operation.cancellation) return operation.cancellation;
        return this.stopResult("scripted-event-program-load-failed", {
          programId: selected.program.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (operation.cancellation) return operation.cancellation;
      if (!program) {
        return this.stopResult("scripted-event-program-missing", {
          programId: selected.program.id,
        });
      }
      const loadedSelected = { ...selected, program };
      const gate = await this.evaluateAutomaticEventGate({
        area,
        selected: loadedSelected,
        context,
      });
      if (operation.cancellation) return operation.cancellation;
      if (gate.status !== "completed") return gate;
      if (gate.returnValue !== selected.event.matchedReturnValue) continue;
      return this.startSelectedInteraction({
        area,
        selected: {
          program,
          interaction: selected.event,
        },
        context,
        activationResult: {
          resolved: true,
          matched: true,
          reason: null,
          nativeReturnValue: gate.returnValue,
          gateEntryFunction: selected.event.gateEntryFunction,
        },
      });
    }
    return {
      status: "not-matched",
      reason: "automatic-event-gate",
      area,
    };
  }

  async evaluateAutomaticEventGate({ area, selected, context }) {
    const actorByteState = this.getActorByteState?.() || this.actorByteState;
    if (
      !actorByteState
      || typeof actorByteState.toJSON !== "function"
      || typeof actorByteState.replace !== "function"
    ) {
      return this.stopResult("native-actor-byte-state-missing");
    }
    let probe = {};
    if (typeof this.createProbe === "function") {
      try {
        probe = await this.createProbe({
          area,
          actorCode: selected.event.actorCode,
          program: selected.program,
          route: selected.event,
          context,
        });
      } catch (error) {
        return this.stopResult("automatic-event-probe-factory-failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (!probe || typeof probe !== "object") {
      return this.stopResult("automatic-event-probe-factory-invalid");
    }
    const runtimeContext = { ...context, ...(probe.context || {}) };
    const probeHandlers = probe.handlers || {};
    if (!probeHandlers || typeof probeHandlers !== "object") {
      return this.stopResult("automatic-event-probe-handlers-invalid");
    }
    const workingActorByteState = createNativeActorByteState(
      actorByteState.toJSON(),
    );
    const executeOperation = createNativeEventOperationExecutor({
      handlers: {
        ...this.handlers,
        ...probeHandlers,
        ...createNativeActorByteStateSemanticHandlers({
          actorByteState: workingActorByteState,
        }),
      },
    });
    const interpreter = createNativeEventInterpreter({
      program: selected.program,
      executeOperation,
      executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
      maxSteps: this.maxSteps,
    });
    try {
      const result = await interpreter.run(null, {
        ...runtimeContext,
        entryFunction: selected.event.gateEntryFunction,
        actorByteState: workingActorByteState,
      });
      return result.status === "completed"
        ? result
        : this.stopResult("automatic-event-gate-stopped", { result });
    } catch (error) {
      return this.stopResult("automatic-event-gate-execution-error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  evaluateInteraction({ area, actorCode, context = {} }) {
    const selected = this.interactionFor(area, actorCode);
    if (!selected) {
      return this.stopResult("scripted-interaction-route-missing", {
        area,
        actorCode: String(actorCode || "").toUpperCase(),
      });
    }
    return {
      ...evaluateNativeScriptedInteractionGate(
        selected.interaction.activation,
        context,
      ),
      programId: selected.program.id,
      entryFunction: selected.interaction.entryFunction,
      actorCode: selected.interaction.actorCode,
    };
  }

  evaluateObjectInteraction({ area, objectTag, context = {} }) {
    const selected = this.objectInteractionFor(area, objectTag);
    if (!selected) {
      return this.stopResult("scripted-object-interaction-route-missing", {
        area,
        objectTag: String(objectTag || "").toUpperCase(),
      });
    }
    return {
      ...evaluateNativeScriptedInteractionGate(
        selected.interaction.activation,
        context,
      ),
      programId: selected.program.id,
      entryFunction: selected.interaction.entryFunction,
      actorCode: selected.interaction.actorCode,
      objectTag: selected.interaction.objectTag,
      roomControllerId: selected.roomController?.id ?? null,
    };
  }

  async startActorInteraction({
    area,
    actorCode,
    sceneActor = null,
    context = {},
  }) {
    const selected = this.interactionFor(area, actorCode);
    if (!selected) {
      return this.stopResult("scripted-interaction-route-missing", {
        area,
        actorCode: String(actorCode || "").toUpperCase(),
      });
    }
    return this.startSelectedInteraction({
      area,
      selected,
      sceneActor,
      context,
    });
  }

  async startObjectInteraction({
    area,
    objectTag,
    sceneObject = null,
    context = {},
  }) {
    const selected = this.objectInteractionFor(area, objectTag);
    if (!selected) {
      return this.stopResult("scripted-object-interaction-route-missing", {
        area,
        objectTag: String(objectTag || "").toUpperCase(),
      });
    }
    return this.startSelectedInteraction({
      area,
      selected,
      sceneObject,
      context,
    });
  }

  async startSelectedInteraction({
    area,
    selected,
    sceneActor = null,
    sceneObject = null,
    context = {},
    activationResult = null,
  }) {
    if (this.current || this.pendingStart) {
      return this.stopResult("scripted-event-already-running");
    }
    const activation = activationResult ?? evaluateNativeScriptedInteractionGate(
      selected.interaction.activation,
      context,
    );
    if (!activation.resolved) {
      return this.stopResult("scripted-interaction-gate-unresolved", {
        detail: activation.reason,
      });
    }
    if (!activation.matched) {
      return {
        status: "not-matched",
        reason: activation.reason,
        programId: selected.program.id,
        entryFunction: selected.interaction.entryFunction,
        actorCode: selected.interaction.actorCode,
      };
    }
    const pendingStart = {
      area,
      selected,
      cancellation: null,
    };
    this.pendingStart = pendingStart;
    this.status = "loading";
    let program = this.programSource.cachedProgram?.(selected.program.id);
    try {
      if (!program) program = await this.loadProgram(selected.program.id);
    } catch (error) {
      if (pendingStart.cancellation) {
        this.releasePendingStart(pendingStart);
        return pendingStart.cancellation;
      }
      this.releasePendingStart(pendingStart);
      return this.stopResult("scripted-event-program-load-failed", {
        programId: selected.program.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (pendingStart.cancellation) {
      this.releasePendingStart(pendingStart);
      return pendingStart.cancellation;
    }
    if (!program) {
      this.releasePendingStart(pendingStart);
      return this.stopResult("scripted-event-program-missing", {
        programId: selected.program.id,
      });
    }
    selected = { ...selected, program };
    pendingStart.selected = selected;
    let controllerExecution = null;
    if (selected.roomController) {
      try {
        controllerExecution = this.roomControllerLifecycle.prepare(selected);
      } catch (error) {
        this.releasePendingStart(pendingStart);
        return this.stopResult("native-room-controller-route-invalid", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const actorByteState = this.getActorByteState?.() || this.actorByteState;
    if (
      !actorByteState
      || typeof actorByteState.toJSON !== "function"
      || typeof actorByteState.replace !== "function"
    ) {
      this.releasePendingStart(pendingStart);
      return this.stopResult("native-actor-byte-state-missing");
    }
    const workingActorByteState = createNativeActorByteState(
      actorByteState.toJSON(),
    );
    let dialogueActive = false;
    let dialogueHandle = 0;
    const dialogueHandlers = createNativeDialogueChannelSemanticHandlers({
      startDialogue: (detail) => {
        const request = exactDialogueRequest(
          detail,
          selected.interaction.actorCode,
        );
        if (!request) {
          return {
            status: "stopped",
            reason: "scripted-dialogue-region-unresolved",
          };
        }
        dialogueActive = true;
        dialogueHandle += 1;
        return {
          handle: dialogueHandle,
          request,
        };
      },
      isDialogueActive: () => dialogueActive,
    });
    const executionDetail = {
      area,
      actorCode: selected.interaction.actorCode,
      program: selected.program,
      route: selected.interaction,
      gate: activation,
      sceneActor,
      sceneObject,
      context,
      workingActorByteState,
      roomController: selected.roomController ?? null,
    };
    this.status = "preparing";
    let execution = null;
    if (typeof this.createExecution === "function") {
      try {
        const createdExecution = this.createExecution(executionDetail);
        execution = (
          createdExecution
          && typeof createdExecution.then === "function"
        )
          ? await createdExecution
          : createdExecution;
      } catch (error) {
        if (pendingStart.cancellation) {
          this.releasePendingStart(pendingStart);
          return pendingStart.cancellation;
        }
        this.releasePendingStart(pendingStart);
        return this.stopResult("native-event-execution-factory-failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (pendingStart.cancellation) {
        this.rollbackExecution(execution, {
          kind: "cancelled",
          reason: pendingStart.cancellation.reason,
        });
        this.releasePendingStart(pendingStart);
        return pendingStart.cancellation;
      }
      if (
        !execution
        || typeof execution !== "object"
        || Array.isArray(execution)
      ) {
        this.releasePendingStart(pendingStart);
        return this.stopResult("native-event-execution-factory-invalid");
      }
    }
    let eventContext;
    try {
      eventContext = execution?.context ?? (
        typeof this.createContext === "function"
          ? this.createContext(executionDetail)
          : {}
      );
    } catch (error) {
      this.rollbackExecution(execution, {
        kind: "native-event-context-factory-failed",
        message: error instanceof Error ? error.message : String(error),
      });
      this.releasePendingStart(pendingStart);
      return this.stopResult("native-event-context-factory-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (pendingStart.cancellation) {
      this.rollbackExecution(execution, {
        kind: "cancelled",
        reason: pendingStart.cancellation.reason,
      });
      this.releasePendingStart(pendingStart);
      return pendingStart.cancellation;
    }
    if (
      !eventContext
      || typeof eventContext !== "object"
      || Array.isArray(eventContext)
      || typeof eventContext.then === "function"
    ) {
      this.rollbackExecution(execution, {
        kind: "native-event-context-factory-invalid",
      });
      this.releasePendingStart(pendingStart);
      return this.stopResult("native-event-context-factory-invalid");
    }
    const resolveStaticVector = nativeStaticVectorResolver(selected.program);
    const runtimeContext = {
      ...context,
      ...eventContext,
      readNativeVector: async pointer => (
        await eventContext.readNativeVector?.(pointer)
        ?? resolveStaticVector(pointer)
      ),
      resolveNativeStaticString: nativeStaticStringResolver(
        selected.program,
      ),
    };
    let eventHandlers;
    try {
      eventHandlers = execution?.handlers ?? (
        typeof this.createHandlers === "function"
          ? this.createHandlers({
            area,
            actorCode: selected.interaction.actorCode,
            sceneActor,
            sceneObject,
            context: runtimeContext,
            workingActorByteState,
          })
          : {}
      );
    } catch (error) {
      this.rollbackExecution(execution, {
        kind: "native-event-handler-factory-failed",
        message: error instanceof Error ? error.message : String(error),
      });
      this.releasePendingStart(pendingStart);
      return this.stopResult("native-event-handler-factory-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (pendingStart.cancellation) {
      this.rollbackExecution(execution, {
        kind: "cancelled",
        reason: pendingStart.cancellation.reason,
      });
      this.releasePendingStart(pendingStart);
      return pendingStart.cancellation;
    }
    if (
      !eventHandlers
      || typeof eventHandlers !== "object"
      || Array.isArray(eventHandlers)
      || typeof eventHandlers.then === "function"
    ) {
      this.rollbackExecution(execution, {
        kind: "native-event-handler-factory-invalid",
      });
      this.releasePendingStart(pendingStart);
      return this.stopResult("native-event-handler-factory-invalid");
    }
    let childCoroutines;
    let interpreter;
    try {
      const executeOperation = createNativeEventOperationExecutor({
        handlers: {
          ...this.handlers,
          ...eventHandlers,
          ...createNativeActorByteStateSemanticHandlers({
            actorByteState: workingActorByteState,
          }),
          ...dialogueHandlers,
          ...createNativeCoroutineSemanticHandlers({
            deactivateCoroutine: detail => childCoroutines?.deactivate(detail)
              ?? false,
          }),
        },
      });
      interpreter = createNativeEventInterpreter({
        program: selected.program,
        executeOperation,
        executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
        launchCoroutine: (action, launchContext) => (
          childCoroutines.launch(action, launchContext)
        ),
        maxSteps: this.maxSteps,
      });
      childCoroutines = createNativeChildCoroutineRuntime({
        program: selected.program,
        interpreter,
        context: {
          ...runtimeContext,
          actorByteState: workingActorByteState,
        },
      });
    } catch (error) {
      this.rollbackExecution(execution, {
        kind: "native-event-runtime-preparation-failed",
        message: error instanceof Error ? error.message : String(error),
      });
      this.releasePendingStart(pendingStart);
      return this.stopResult("native-event-runtime-preparation-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (this.pendingStart !== pendingStart) {
      this.rollbackExecution(execution, {
        kind: "native-event-start-superseded",
      });
      return this.stopResult("native-event-start-superseded", {
        programId: selected.program.id,
        entryFunction: selected.interaction.entryFunction,
      });
    }
    this.pendingStart = null;
    this.current = {
      ...selected,
      actorCode: selected.interaction.actorCode,
      sceneActor,
      sceneObject,
      context: runtimeContext,
      interpreter,
      interpreterState: null,
      workingActorByteState,
      actorByteState,
      execution,
      childCoroutines,
      controllerExecution,
      setDialogueActive(value) {
        dialogueActive = value;
      },
    };
    if (controllerExecution) {
      if (typeof runtimeContext.enqueueGlobalControllerEvent !== "function") {
        return this.stop("native-room-controller-event-queue-missing");
      }
      try {
        runtimeContext.enqueueGlobalControllerEvent(
          controllerExecution.eventWord,
        );
      } catch (error) {
        return this.stop("native-room-controller-event-enqueue-failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      this.current.interpreterState = controllerExecution.interpreterState;
    }
    try {
      this.callbacks.onStarted({
        kind: "native",
        area,
        programId: selected.program.id,
        ownerEntryFunction: controllerExecution?.entryFunction
          ?? selected.interaction.entryFunction,
        interactionEntryFunction: selected.interaction.entryFunction,
        roomControllerId: selected.roomController?.id ?? null,
        actorCode: selected.interaction.actorCode ?? null,
        objectTag: selected.interaction.objectTag ?? null,
      });
    } catch (error) {
      console.error("Native script start listener failed:", error);
    }
    this.status = "running";
    return this.run({
      entryFunction: controllerExecution?.entryFunction
        ?? selected.interaction.entryFunction,
    });
  }

  async run(initialContext = {}) {
    const current = this.current;
    if (!current) return this.stopResult("scripted-event-not-running");
    let result;
    try {
      result = await current.interpreter.run(
        current.interpreterState,
        {
          ...current.context,
          ...initialContext,
          actorByteState: current.workingActorByteState,
        },
      );
    } catch (error) {
      return this.stop("scripted-event-execution-error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (this.current !== current) {
      return this.stopResult("scripted-event-superseded");
    }
    if (result.status === "yielded" && result.request?.kind === "dialogue") {
      current.interpreterState = result.state;
      this.status = "dialogue";
      const request = {
        ...result.request,
        sceneActor: current.sceneActor,
        programId: current.program.id,
        entryFunction: current.interaction.entryFunction,
      };
      try {
        await this.callbacks.onDialogueRequest(request, result);
      } catch (error) {
        return this.stop("scripted-dialogue-start-failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (this.current !== current) {
        return this.stopResult(
          "scripted-event-cancelled-during-dialogue-start",
        );
      }
      return { ...result, request };
    }
    if (
      result.status === "yielded"
      && result.request?.kind === "native-coroutine-continuation"
      && Number.isSafeInteger(result.request.scheduler?.ticks)
      && result.request.scheduler.ticks > 0
    ) {
      if (
        this.roomControllerLifecycle.isInteractionBoundary(
          current.controllerExecution,
          result,
        )
      ) {
        return this.complete(current, result, {
          controllerCheckpoint: result.state,
        });
      }
      current.interpreterState = result.state;
      current.continuationTicks = result.request.scheduler.ticks;
      this.status = "continuation";
      return result;
    }
    if (result.status === "completed") {
      return this.complete(current, result);
    }
    return this.stop("scripted-event-interpreter-stopped", { result });
  }

  async complete(current, result, { controllerCheckpoint = null } = {}) {
    try {
      await current.execution?.commit?.({
        result,
        context: current.context,
      });
      if (current.execution) current.execution.finished = true;
    } catch (error) {
      return this.stop("native-event-execution-commit-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (controllerCheckpoint) {
      this.roomControllerLifecycle.commit(
        current.controllerExecution,
        controllerCheckpoint,
      );
    }
    current.actorByteState.replace(current.workingActorByteState.toJSON());
    this.current = null;
    this.status = "complete";
    const completed = {
      ...result,
      status: "completed",
      ...(controllerCheckpoint
        ? {
            roomControllerId: current.controllerExecution.controller.id,
            roomControllerCheckpoint: true,
          }
        : {}),
      programId: current.program.id,
      entryFunction: current.interaction.entryFunction,
      actorCode: current.actorCode,
    };
    this.notifyCallback("onComplete", completed);
    this.notifySettled("completed", completed);
    return completed;
  }

  resumeDialogue() {
    if (!this.current || this.status !== "dialogue") {
      return Promise.resolve(
        this.stopResult("scripted-dialogue-is-not-waiting"),
      );
    }
    this.current.setDialogueActive(false);
    this.status = "running";
    return this.run();
  }

  diagnosticSnapshot() {
    const current = this.current;
    if (!current) return { status: this.status, active: false };
    const state = current.interpreterState;
    const frame = Array.isArray(state?.frames) ? state.frames.at(-1) : null;
    return {
      status: this.status,
      active: true,
      programId: current.program?.id ?? null,
      entryFunction: current.interaction?.entryFunction ?? null,
      continuationTicks: current.continuationTicks ?? null,
      frame: frame ? {
        functionId: frame.functionId ?? null,
        blockId: frame.blockId ?? null,
        actionIndex: frame.actionIndex ?? null,
        operationResults: frame.operationResults ?? null,
      } : null,
      children: current.childCoroutines?.diagnosticSnapshot?.() ?? [],
    };
  }

  update(deltaSeconds = 0) {
    if (!this.current) return false;
    const current = this.current;
    let executionUpdated = false;
    try {
      if (typeof current.execution?.update === "function") {
        current.execution.update({
          deltaSeconds,
          status: this.status,
        });
        executionUpdated = true;
      }
    } catch (error) {
      this.stop("native-event-execution-update-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
    void current.childCoroutines.update().then((result) => {
      if (result.status === "stopped" && this.current === current) {
        this.stop("scripted-child-coroutine-stopped", { result });
      }
    }).catch((error) => {
      if (this.current === current) {
        this.stop("scripted-child-coroutine-execution-error", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
    if (this.status !== "continuation") return executionUpdated;
    this.current.continuationTicks -= 1;
    if (this.current.continuationTicks > 0) return true;
    this.status = "running";
    void this.run();
    return true;
  }

  seekBySeconds(seconds) {
    const duration = Number(seconds);
    if (
      !this.current
      || this.status !== "continuation"
      || !Number.isFinite(duration)
      || duration <= 0
      || typeof this.current.execution?.update !== "function"
    ) return false;

    const current = this.current;
    let remaining = duration;
    try {
      // Native activity clocks intentionally clamp large render deltas. Feed
      // the requested seek through that same clock in bounded chunks so all
      // intervening camera, motion, sound, and presentation frames execute.
      while (remaining > 0 && this.current === current) {
        const deltaSeconds = Math.min(0.25, remaining);
        current.execution.update({
          deltaSeconds,
          status: this.status,
        });
        remaining -= deltaSeconds;
      }
    } catch (error) {
      this.stop("native-event-execution-update-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    if (this.current !== current || this.status !== "continuation") return true;
    current.continuationTicks = 0;
    this.status = "running";
    void this.run();
    return true;
  }

  cancel(reason = "cancelled") {
    const automaticPoll = this.automaticPoll;
    if (automaticPoll && !automaticPoll.cancellation) {
      automaticPoll.cancellation = {
        status: "cancelled",
        reason,
      };
    }
    const pendingStart = this.pendingStart;
    if (!this.current && !pendingStart) return Boolean(automaticPoll);
    if (pendingStart) {
      if (pendingStart.cancellation) return false;
      const cancelled = {
        status: "cancelled",
        reason,
        programId: pendingStart.selected.program.id,
        entryFunction: pendingStart.selected.interaction.entryFunction,
        actorCode: pendingStart.selected.interaction.actorCode ?? null,
      };
      pendingStart.cancellation = cancelled;
      // Keep the reservation until an asynchronous factory settles. Its late
      // execution scope may still need rollback and must not overlap a newer
      // event that owns the same room resources.
      this.status = "stopping";
      this.notifyCallback("onCancelled", cancelled);
      this.notifySettled("cancelled", cancelled);
      return true;
    }
    const current = this.current;
    const cancelled = {
      status: "cancelled",
      reason,
      programId: current.program.id,
      entryFunction: current.interaction.entryFunction,
      actorCode: current.actorCode,
    };
    this.current = null;
    this.status = "idle";
    current.childCoroutines.clear();
    this.rollbackExecution(current.execution, {
      kind: "cancelled",
      reason,
    });
    this.notifyCallback("onCancelled", cancelled);
    this.notifySettled("cancelled", cancelled);
    return true;
  }

  releasePendingStart(pendingStart) {
    if (this.pendingStart !== pendingStart) return false;
    this.pendingStart = null;
    this.status = "idle";
    return true;
  }

  resetRoomControllers(controllerId = null) {
    if (
      this.current?.controllerExecution
      || this.pendingStart?.selected?.roomController
    ) {
      throw new Error("cannot reset a running native room controller");
    }
    return this.roomControllerLifecycle.reset(controllerId);
  }

  stop(kind, detail = {}) {
    const current = this.current;
    const stopped = {
      ...this.stopResult(kind, detail),
      ...(current ? {
        programId: current.program.id,
        entryFunction: current.interaction.entryFunction,
        actorCode: current.actorCode,
      } : {}),
    };
    this.current = null;
    this.status = "stopped";
    current?.childCoroutines.clear();
    this.rollbackExecution(current?.execution, stopped.reason);
    this.notifyCallback("onStopped", stopped);
    this.notifySettled("stopped", stopped);
    return stopped;
  }

  rollbackExecution(execution, reason) {
    if (!execution || execution.finished === true) return;
    execution.finished = true;
    try {
      execution.rollback?.({ reason });
    } catch (error) {
      console.error("Native event execution rollback failed:", error);
    }
  }

  stopResult(kind, detail = {}) {
    return {
      status: "stopped",
      reason: { kind, ...detail },
    };
  }
}

export function createNativeScriptedEventRuntime(options) {
  return new NativeScriptedEventRuntime(options);
}

const INITIAL_STATE_BY_SELECTOR = Object.freeze([
  3,
  1,
  6,
  1,
  1,
  3,
  6,
]);

function requireActorTag(value) {
  const actorTag = String(value || "").toUpperCase();
  if (!/^[A-Z0-9_]{4}$/.test(actorTag)) {
    throw new TypeError(
      "native XMPT actor must be a four-character identifier",
    );
  }
  return actorTag;
}

function requireVector(value) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(component => !Number.isFinite(component))
  ) {
    throw new TypeError("native XMPT target must contain three finite values");
  }
  return value.map(component => Math.fround(component));
}

function requireWord(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native XMPT ${label} must be an integer`);
  }
  return value & 0xffff;
}

function requireDword(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native XMPT ${label} must be an integer`);
  }
  return value >>> 0;
}

function requireSelector(value) {
  if (
    !Number.isInteger(value)
    || value < 0
    || value >= INITIAL_STATE_BY_SELECTOR.length
  ) {
    throw new RangeError("native XMPT selector must be from zero through six");
  }
  return value;
}

function publicRecord(record) {
  if (!record) return undefined;
  return {
    target: [...record.target],
    requestWord: record.requestWord,
    requestDword: record.requestDword,
    motionRequest: record.motionRequest,
    selector: record.selector,
    state: record.state,
    controllerRequestWord: record.controllerRequestWord,
    routeKind: record.routeKind ?? null,
    revision: record.revision,
  };
}

function requireSelectorFiveRoute(value) {
  if (!value || !["near", "far"].includes(value.kind)) return null;
  try {
    return {
      kind: value.kind,
      target: requireVector(value.target),
    };
  } catch {
    return null;
  }
}

export class NativeActorXmptState {
  constructor() {
    this.records = new Map();
    this.revision = 0;
  }

  clear() {
    this.records.clear();
    this.revision = 0;
  }

  request({
    actorTag,
    target,
    requestWord,
    requestDword,
    stateSelector,
  }) {
    const key = requireActorTag(actorTag);
    const selector = requireSelector(stateSelector);
    const dword = requireDword(requestDword, "request dword");
    const record = {
      target: requireVector(target),
      requestWord: requireWord(requestWord, "request word"),
      requestDword: dword,
      motionRequest: dword & 0xffff,
      selector,
      // Request core 0x0c0febc0 invokes the XMPT controller callback before
      // returning. That synchronous first dispatch maps +0x18 from zero to the
      // selector's initial state, so an immediately following 0x016e query
      // observes the request as active.
      state: INITIAL_STATE_BY_SELECTOR[selector],
      controllerRequestWord: 0,
      routeKind: null,
      preparedTarget: null,
      motionPhase: null,
      motionCommitted: false,
      revision: ++this.revision,
    };
    this.records.set(key, record);
    return publicRecord(record);
  }

  read(actorTag) {
    return publicRecord(this.records.get(requireActorTag(actorTag)));
  }

  stateZeroQuery(actorTag) {
    return this.selectorActiveQuery(actorTag, 0);
  }

  selectorActiveQuery(actorTag, selector) {
    const expectedSelector = requireSelector(selector);
    const record = this.records.get(requireActorTag(actorTag));
    return Boolean(
      record
      && record.state !== 0
      && record.selector === expectedSelector,
    );
  }

  updateActor(actorTag, controller = {}) {
    const key = requireActorTag(actorTag);
    const record = this.records.get(key);
    if (!record) return { updated: false, reason: "xmpt-record-missing" };
    const previousState = record.state;

    if (record.selector === 5) {
      return this.updateSelectorFive(key, record, controller, previousState);
    }

    // Selector zero is the statically recovered path used by D000/Hato.
    // Other selectors remain installed but fail closed until their complete
    // controller paths are recovered.
    if (record.selector !== 0) {
      return {
        updated: false,
        reason: "xmpt-selector-update-unimplemented",
        record: publicRecord(record),
      };
    }

    if (record.state === 3) {
      const accepted = controller.startMotion?.({
        actorTag: key,
        phase: "approach",
        target: [...record.target],
        facing: { kind: "target-bearing" },
        request: record.motionRequest,
        requestDword: record.requestDword,
        requestWord: record.requestWord,
      });
      if (accepted !== true) {
        return {
          updated: false,
          reason: "xmpt-approach-motion-rejected",
          record: publicRecord(record),
        };
      }
      record.controllerRequestWord = record.motionRequest;
      record.state = 4;
      return this.transition(record, previousState);
    }

    if (record.state === 4) {
      const requestWord = controller.readMotionRequestWord?.({
        actorTag: key,
        phase: "approach",
      });
      if (!Number.isInteger(requestWord) || (requestWord & 0xffff) !== 0) {
        return {
          updated: false,
          reason: "xmpt-approach-motion-active",
          record: publicRecord(record),
        };
      }
      record.controllerRequestWord = 0;
      if (controller.commitTarget?.({
        actorTag: key,
        phase: "approach",
      }) !== true) {
        return {
          updated: false,
          reason: "xmpt-approach-target-uncommitted",
          record: publicRecord(record),
        };
      }
      record.state = 5;
      return this.transition(record, previousState);
    }

    if (record.state === 5) {
      if (controller.convergeFacing?.({
        actorTag: key,
        target: [...record.target],
        finalFacingRaw: record.requestWord,
        maximumStepRaw: 2730,
      }) !== true) {
        return {
          updated: false,
          reason: "xmpt-facing-convergence-active",
          record: publicRecord(record),
        };
      }
      record.state = 7;
      return this.transition(record, previousState);
    }

    if (record.state === 7) {
      const accepted = controller.startMotion?.({
        actorTag: key,
        phase: "final-alignment",
        target: [...record.target],
        facing: {
          kind: "native-raw",
          value: record.requestWord,
        },
        request: record.motionRequest,
        requestDword: record.requestDword,
        requestWord: record.requestWord,
      });
      if (accepted !== true) {
        return {
          updated: false,
          reason: "xmpt-final-alignment-motion-rejected",
          record: publicRecord(record),
        };
      }
      record.controllerRequestWord = record.motionRequest;
      record.state = 8;
      return this.transition(record, previousState);
    }

    if (record.state === 8) {
      const requestWord = controller.readMotionRequestWord?.({
        actorTag: key,
        phase: "final-alignment",
      });
      if (!Number.isInteger(requestWord) || (requestWord & 0xffff) !== 0) {
        return {
          updated: false,
          reason: "xmpt-final-alignment-motion-active",
          record: publicRecord(record),
        };
      }
      record.controllerRequestWord = 0;
      if (controller.commitTarget?.({
        actorTag: key,
        phase: "final-alignment",
        target: [...record.target],
        facingRaw: record.requestWord,
      }) !== true) {
        return {
          updated: false,
          reason: "xmpt-final-target-uncommitted",
          record: publicRecord(record),
        };
      }
      record.state = 11;
      return this.transition(record, previousState);
    }

    if (record.state === 11) {
      controller.release?.({ actorTag: key });
      record.state = 0;
      return this.transition(record, previousState);
    }

    return {
      updated: false,
      reason: "xmpt-selector-zero-state-unimplemented",
      record: publicRecord(record),
    };
  }

  updateSelectorFive(key, record, controller, previousState) {
    if (record.state === 3) {
      const route = requireSelectorFiveRoute(
        controller.prepareSelectorFiveRoute?.({
          actorTag: key,
          target: [...record.target],
          request: record.motionRequest,
          requestDword: record.requestDword,
          requestWord: record.requestWord,
        }),
      );
      if (!route) {
        return {
          updated: false,
          reason: "xmpt-selector-five-route-unprepared",
          record: publicRecord(record),
        };
      }
      const accepted = controller.startMotion?.({
        actorTag: key,
        phase: "selector-five-route",
        routeKind: route.kind,
        target: [...route.target],
        sourceTarget: [...record.target],
        facing: { kind: "target-bearing" },
        request: record.motionRequest,
        requestDword: record.requestDword,
        requestWord: record.requestWord,
      });
      if (accepted !== true) {
        return {
          updated: false,
          reason: "xmpt-selector-five-motion-rejected",
          record: publicRecord(record),
        };
      }
      record.routeKind = route.kind;
      record.preparedTarget = route.target;
      record.motionPhase = "selector-five-route";
      record.motionCommitted = false;
      record.controllerRequestWord = record.motionRequest;
      record.state = route.kind === "far" ? 8 : 4;
      return this.transition(record, previousState);
    }

    if (record.state === 4) {
      const requestWord = controller.readMotionRequestWord?.({
        actorTag: key,
        phase: "selector-five-route",
      });
      if (!Number.isInteger(requestWord) || (requestWord & 0xffff) !== 0) {
        return {
          updated: false,
          reason: "xmpt-selector-five-near-motion-active",
          record: publicRecord(record),
        };
      }
      record.controllerRequestWord = 0;
      if (controller.commitTarget?.({
        actorTag: key,
        phase: "selector-five-route",
        target: [...record.preparedTarget],
      }) !== true) {
        return {
          updated: false,
          reason: "xmpt-selector-five-near-target-uncommitted",
          record: publicRecord(record),
        };
      }
      if (controller.releaseLookPoint?.({ actorTag: key }) !== true) {
        return {
          updated: false,
          reason: "xmpt-selector-five-look-point-unreleased",
          record: publicRecord(record),
        };
      }
      record.motionCommitted = true;
      record.state = 8;
      return this.transition(record, previousState);
    }

    if (record.state === 8) {
      const requestWord = controller.readMotionRequestWord?.({
        actorTag: key,
        phase: record.motionPhase,
      });
      if (!Number.isInteger(requestWord) || (requestWord & 0xffff) !== 0) {
        return {
          updated: false,
          reason: "xmpt-selector-five-motion-active",
          record: publicRecord(record),
        };
      }
      record.controllerRequestWord = 0;
      if (
        !record.motionCommitted
        && controller.commitTarget?.({
          actorTag: key,
          phase: record.motionPhase,
          target: record.motionPhase === "selector-five-route"
            ? [...record.preparedTarget]
            : [...record.target],
          facingRaw: record.motionPhase === "selector-five-final-alignment"
            ? record.requestWord
            : undefined,
        }) !== true
      ) {
        return {
          updated: false,
          reason: "xmpt-selector-five-target-uncommitted",
          record: publicRecord(record),
        };
      }
      record.motionCommitted = true;
      const aligned = controller.selectorFiveAlignmentComplete?.({
        actorTag: key,
        target: [...record.target],
        preparedTarget: [...record.preparedTarget],
        requestWord: record.requestWord,
        requestDword: record.requestDword,
      });
      if (typeof aligned !== "boolean") {
        return {
          updated: false,
          reason: "xmpt-selector-five-alignment-unavailable",
          record: publicRecord(record),
        };
      }
      record.state = aligned ? 11 : 7;
      return this.transition(record, previousState);
    }

    if (record.state === 7) {
      const accepted = controller.startMotion?.({
        actorTag: key,
        phase: "selector-five-final-alignment",
        target: [...record.target],
        preparedTarget: [...record.preparedTarget],
        facing: {
          kind: "native-raw",
          value: record.requestWord,
        },
        request: record.motionRequest,
        requestDword: record.requestDword,
        requestWord: record.requestWord,
      });
      if (accepted !== true) {
        return {
          updated: false,
          reason: "xmpt-selector-five-alignment-motion-rejected",
          record: publicRecord(record),
        };
      }
      record.motionPhase = "selector-five-final-alignment";
      record.motionCommitted = false;
      record.controllerRequestWord = record.motionRequest;
      record.state = 8;
      return this.transition(record, previousState);
    }

    if (record.state === 11) {
      if (controller.release?.({ actorTag: key }) === false) {
        return {
          updated: false,
          reason: "xmpt-selector-five-release-rejected",
          record: publicRecord(record),
        };
      }
      record.state = 0;
      return this.transition(record, previousState);
    }

    return {
      updated: false,
      reason: "xmpt-selector-five-state-unimplemented",
      record: publicRecord(record),
    };
  }

  transition(record, previousState) {
    return {
      updated: true,
      previousState,
      state: record.state,
      record: publicRecord(record),
    };
  }
}

export function createNativeActorXmptState() {
  return new NativeActorXmptState();
}

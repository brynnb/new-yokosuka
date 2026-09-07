const ROUTES = Object.freeze({
  0x0175: Object.freeze({
    1: { argumentCount: 1, helpers: ["0x0c1badbc"] },
    2: { argumentCount: 1, helpers: ["0x0c1baed0"] },
    15: { argumentCount: 2, helpers: ["0x0c1baf0c"], forwarded: [1] },
    21: { argumentCount: 2, helpers: ["0x0c1bc5f8"], forwarded: [1] },
    23: {
      argumentCount: 2,
      branchWord: 1,
      helpersByTruth: ["0x0c1bc5f8", "0x0c1bc5ee"],
      literalArguments: [0x0780],
    },
    24: {
      argumentCount: 2,
      branchWord: 1,
      helpersByTruth: ["0x0c1bc5f8", "0x0c1bc5ee"],
      literalArguments: [0x1800],
    },
    25: {
      argumentCount: 2,
      branchWord: 1,
      helpersByTruth: ["0x0c1bc5f8", "0x0c1bc5ee"],
      literalArguments: [12],
    },
    27: {
      argumentCount: 1,
      helpers: ["0x0c1baeee", "0x0c1bcb32"],
      forwardsPreviousResult: true,
    },
  }),
  0x0176: Object.freeze({
    1: {
      argumentCount: 2,
      branchWord: 1,
      helpersByTruth: ["0x0c1ba8fa", "0x0c1baae4"],
    },
  }),
  0x0178: Object.freeze({
    1: {
      argumentCount: 2,
      helpers: ["0x0c1c173c", "0x0c1bb2da", "0x0c0bb342"],
      forwarded: [1],
      returnsHandle: true,
    },
    6: {
      argumentCount: 7,
      helpers: ["0x0c1c1794", "0x0c1bb2da", "0x0c0bb342"],
      forwarded: [1, 2, 3, 4, 5, 6],
      vectorGroups: [[1, 2, 3], [4, 5, 6]],
      returnsHandle: true,
    },
    7: {
      argumentCount: 2,
      helpers: ["0x0c1bb514", "0x0c1c17d8"],
      forwarded: [1],
    },
    10: { argumentCount: 1, helpers: ["0x0c1bc0f2"] },
    13: {
      argumentCount: 2,
      helpers: ["0x0c1baf00"],
      forwarded: [1],
    },
    14: {
      argumentCount: 2,
      helpers: ["0x0c09b9c8"],
      forwarded: [1],
    },
  }),
  0x0179: Object.freeze({
    2: { argumentCount: 2, helpers: ["0x0c1bb6c4"], forwarded: [1] },
    3: { argumentCount: 1, helpers: ["0x0c1bb702"] },
    4: { argumentCount: 2, helpers: ["0x0c1bb79e"], forwarded: [1] },
    7: { argumentCount: 2, helpers: ["0x0c1bb83c"], forwarded: [1] },
    11: { argumentCount: 2, helpers: ["0x0c1bb9d6"], forwarded: [1] },
    12: { argumentCount: 1, helpers: ["0x0c1bba14"] },
    13: { argumentCount: 2, helpers: ["0x0c1bbab0"], forwarded: [1] },
    14: {
      argumentCount: 3,
      helpers: ["0x0c1bbaf6"],
      forwarded: [2, 1],
    },
    16: { argumentCount: 2, helpers: ["0x0c1bbb94"], forwarded: [1] },
    18: { argumentCount: 2, helpers: ["0x0c1bbbdc"], forwarded: [1] },
    36: {
      argumentCount: 7,
      helpers: ["0x0c1bb92e"],
      forwarded: [1, 2, 3, 4, 5, 6],
      vectorGroups: [[1, 2, 3], [4, 5, 6]],
    },
    37: {
      argumentCount: 7,
      helpers: ["0x0c1bbc24"],
      forwarded: [1, 2, 3, 4, 5, 6],
      vectorGroups: [[1, 2, 3], [4, 5, 6]],
    },
    38: {
      argumentCount: 11,
      helpers: ["0x0c1bb738", "0x0c1bba4a", "0x0c1bbd6c"],
      forwarded: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      vectorGroups: [[1, 2], [3, 4], [5, 6], [7, 8]],
      scalarFloatWords: [9, 10],
    },
    39: {
      argumentCount: 3,
      helpers: ["0x0c1bc43c"],
      forwarded: [1, 2],
      trailingLiteralArguments: [0],
    },
    41: {
      argumentCount: 2,
      helpers: ["0x0c1bc516"],
      forwarded: [1],
      trailingLiteralArguments: [0],
    },
    42: {
      argumentCount: 3,
      helpers: ["0x0c1bc4b6"],
      forwarded: [1, 2],
      trailingLiteralArguments: [0],
    },
    44: {
      argumentCount: 3,
      helpers: ["0x0c1bc43c"],
      forwarded: [1, 2],
      trailingLiteralArguments: [1],
    },
    47: {
      argumentCount: 3,
      helpers: ["0x0c1bc4b6"],
      forwarded: [1, 2],
      trailingLiteralArguments: [1],
    },
  }),
});

function requireAdapterCallback(callback) {
  if (callback !== undefined && typeof callback !== "function") {
    throw new TypeError(
      "native presentation-controller applyRoute adapter must be a function",
    );
  }
  return callback;
}

/**
 * Shared typed boundary between the native operation ABI and presentation.
 * All four adjacent dispatchers use one instance so handle-producing and
 * handle-consuming routes observe the same renderer-owned namespace.
 */
export class NativePresentationControllerFamilyAdapter {
  constructor({ applyRoute } = {}) {
    this.applyRouteCallback = requireAdapterCallback(applyRoute);
  }

  apply(detail) {
    if (!this.applyRouteCallback) return undefined;
    return this.applyRouteCallback(detail);
  }
}

export function createNativePresentationControllerFamilyAdapter(options) {
  if (options instanceof NativePresentationControllerFamilyAdapter) {
    return options;
  }
  return new NativePresentationControllerFamilyAdapter(options);
}

function routeDetail(operationId, readArgument) {
  const mode = readArgument(0);
  const route = ROUTES[operationId]?.[mode];
  if (!route) {
    return null;
  }

  const argumentWords = [];
  for (let index = 0; index < route.argumentCount; index += 1) {
    argumentWords.push(readArgument(index));
  }
  const truthyBranch = route.branchWord === undefined
    ? undefined
    : argumentWords[route.branchWord] !== 0;
  const helpers = route.helpersByTruth
    ? [route.helpersByTruth[truthyBranch ? 1 : 0]]
    : route.helpers;
  const forwardedWords = route.literalArguments
    ? [...route.literalArguments]
    : (route.forwarded || []).map(index => argumentWords[index]);
  forwardedWords.push(...(route.trailingLiteralArguments || []));

  return {
    operationId,
    operationHex: `0x${operationId.toString(16).padStart(4, "0")}`,
    mode,
    argumentWords,
    forwardedWords,
    helpers: [...helpers],
    ...(truthyBranch === undefined ? {} : { truthyBranch }),
    ...(route.forwardsPreviousResult ? { forwardsPreviousResult: true } : {}),
    ...(route.vectorGroups
      ? {
          vectorWordGroups: route.vectorGroups.map(group => (
            group.map(index => argumentWords[index])
          )),
        }
      : {}),
    ...(route.scalarFloatWords
      ? {
          scalarFloatWords: route.scalarFloatWords.map(
            index => argumentWords[index],
          ),
        }
      : {}),
    returnsHandle: route.returnsHandle === true,
  };
}

function createHandler(operationId, applyNativePresentationControllerRoute) {
  return async ({ context, readArgument }) => {
    let detail;
    try {
      detail = routeDetail(operationId, readArgument);
    } catch (error) {
      return { status: "stopped", reason: error.message };
    }
    if (!detail) {
      return {
        status: "stopped",
        reason: `native-operation-${operationId.toString(16).padStart(4, "0")}-mode-unproved`,
      };
    }

    const applyRoute = (
      applyNativePresentationControllerRoute
      || context.applyNativePresentationControllerRoute
    );
    if (typeof applyRoute !== "function") {
      return {
        status: "stopped",
        reason: "native-presentation-controller-adapter-missing",
      };
    }
    const response = await applyRoute(detail);
    if (detail.returnsHandle) {
      const result = Number.isInteger(response)
        ? response
        : response?.result;
      if (!Number.isInteger(result)) {
        return {
          status: "stopped",
          reason: "native-presentation-controller-handle-unavailable",
        };
      }
      return { result };
    }
    if (response === undefined) {
      return {
        status: "stopped",
        reason: "native-presentation-controller-result-unavailable",
      };
    }
    return {
      status: "continued",
      mutation: response?.mutation ?? response,
    };
  };
}

export function createNativePresentationControllerFamilySemanticHandlers({
  applyNativePresentationControllerRoute,
  adapter,
} = {}) {
  if (
    adapter !== undefined
    && !(adapter instanceof NativePresentationControllerFamilyAdapter)
  ) {
    throw new TypeError(
      "native presentation-controller adapter has an invalid type",
    );
  }
  const applyRoute = adapter
    ? detail => adapter.apply(detail)
    : applyNativePresentationControllerRoute;
  return {
    "native-operation-0175-control": createHandler(
      0x0175,
      applyRoute,
    ),
    "native-operation-0176-control": createHandler(
      0x0176,
      applyRoute,
    ),
    "native-operation-0178-control": createHandler(
      0x0178,
      applyRoute,
    ),
    "native-operation-0179-control": createHandler(
      0x0179,
      applyRoute,
    ),
  };
}

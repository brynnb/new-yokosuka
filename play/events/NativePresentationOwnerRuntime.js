function adapter(options, context, name) {
  return options[name] || context[name];
}

function requireOwnerKey(value) {
  if (
    value !== null
    && typeof value !== "string"
    && !Number.isInteger(value)
  ) {
    throw new TypeError(
      "native current presentation owner must be a stable string, integer, or null",
    );
  }
  return value;
}

export function createNativePresentationOwnerSemanticHandlers(options = {}) {
  return {
    "current-presentation-owner-install": async ({ context, readArgument }) => {
      const resolveOwner = adapter(
        options,
        context,
        "resolveCurrentPresentationOwner",
      );
      const planReset = adapter(
        options,
        context,
        "planPrimaryRuntimeTransition",
      );
      const commitReset = adapter(
        options,
        context,
        "commitPrimaryRuntimeTransition",
      );
      const installOwner = adapter(
        options,
        context,
        "installCurrentPresentationOwner",
      );
      if (typeof resolveOwner !== "function") {
        return {
          status: "stopped",
          reason: "current-presentation-owner-resolver-missing",
        };
      }
      if (typeof planReset !== "function" || typeof commitReset !== "function") {
        return {
          status: "stopped",
          reason: "current-presentation-owner-primary-reset-missing",
        };
      }
      if (typeof installOwner !== "function") {
        return {
          status: "stopped",
          reason: "current-presentation-owner-installer-missing",
        };
      }

      try {
        const operand = readArgument(0);
        const owner = requireOwnerKey(await resolveOwner(operand));
        const resetPlan = await planReset(0);
        const primaryRuntime = await commitReset(resetPlan);
        const previous = await installOwner(owner, {
          notificationTag: "CPCT",
          operand,
        });
        return {
          status: "continued",
          result: 1,
          mutation: {
            operand,
            owner,
            previous,
            primaryRuntime,
            notificationTag: "CPCT",
          },
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}

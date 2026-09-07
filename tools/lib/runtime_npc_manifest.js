function distance(left, right) {
  return Math.hypot(...left.map((value, axis) => value - right[axis]));
}

export function linkedRoutesByOffset(manifest) {
  const routes = new Map();
  for (const table of manifest.linkedRouteTables || []) {
    for (const rootDefinition of table.roots || []) {
      if (rootDefinition.route?.fileOffset) {
        routes.set(rootDefinition.route.fileOffset, rootDefinition.route.points);
      }
      for (const group of rootDefinition.groups || []) {
        for (const leaf of group.leaves || []) {
          for (const key of ["firstRoute", "secondRoute"]) {
            const route = leaf[key];
            if (route?.fileOffset && route.points?.length) {
              routes.set(route.fileOffset, route.points);
            }
          }
        }
      }
    }
  }
  return routes;
}

function stableRouteId(actor, journey, operation, suffix = null) {
  return [
    actor.instanceId,
    journey.startSecond,
    operation.fileOffset || "generated",
    suffix,
  ].filter(Boolean).join(":");
}

function nextAuthoredPosition(operations, operationIndex, currentArea) {
  let area = currentArea;
  for (let index = operationIndex + 1; index < operations.length; index++) {
    const operation = operations[index];
    if (operation.operation === 8) {
      area = operation.area;
      continue;
    }
    if (area !== currentArea) return null;
    if (operation.operation === 3 && operation.browserPosition?.length === 3) {
      return operation.browserPosition;
    }
    if (operation.operation === 1 && operation.points?.length) {
      return operation.points[0];
    }
  }
  return null;
}

export function runtimeJourneys(actor, selectedVariant, linkedRoutes) {
  return selectedVariant.journeys.map((journey) => {
    let area = actor.defaultArea || null;
    const operations = (journey.operations || []).map(
      (sourceOperation) => structuredClone(sourceOperation),
    );
    for (let index = 0; index < operations.length; index++) {
      const operation = operations[index];
      if (operation.operation === 8) {
        area = operation.area;
        continue;
      }
      if (operation.operation === 1 && operation.points?.length) {
        operation.routeId = stableRouteId(actor, journey, operation);
      }
      if (
        operation.operation === 0x1c
        && operation.secondaryRoute?.points?.length
      ) {
        operation.routeId = stableRouteId(
          actor,
          journey,
          operation,
          "secondary",
        );
      }
      if (
        operation.operation !== 0x16
        || !operation.linkedPlacement?.routeFileOffset
      ) {
        continue;
      }
      const points = linkedRoutes.get(
        operation.linkedPlacement.routeFileOffset,
      );
      if (!points?.length) continue;
      operation.linkedPlacement.controllerRouteId = stableRouteId(
        actor,
        journey,
        operation,
        operation.linkedPlacement.routeFileOffset,
      );
      const waiting = operation.waitingPlacement?.position;
      operation.linkedPlacement.controllerRoutePoints = (
        waiting?.length === 3 && distance(waiting, points[0]) > 0.01
          ? [waiting, ...points]
          : points
      );

      // A linked controller returns control immediately before the next
      // authored placement or route. Very short same-area gaps are a
      // controller handoff, not general pathfinding: preserve them as an
      // explicit generated segment so both runtimes use the same timing and
      // never collapse the handoff into a visible teleport.
      const endpoint = operation.linkedPlacement.controllerRoutePoints.at(-1);
      const target = nextAuthoredPosition(operations, index, area);
      if (!target) continue;
      const handoffDistance = distance(endpoint, target);
      if (
        handoffDistance <= 0.05
        || handoffDistance > 5
        || Math.abs(endpoint[1] - target[1]) > 0.5
      ) {
        continue;
      }
      operation.linkedPlacement.handoffRouteId = stableRouteId(
        actor,
        journey,
        operation,
        "handoff",
      );
      operation.linkedPlacement.handoffRoutePoints = [endpoint, target];
      operation.linkedPlacement.handoffClassification = (
        "short same-area linked-controller handoff"
      );
    }
    const secondaryRoutes = operations.filter((operation) => (
      operation.operation === 0x1c
      && operation.routeId
      && operation.secondaryRoute?.points?.length
    ));
    for (let index = 0; index < secondaryRoutes.length; index++) {
      const operation = secondaryRoutes[index];
      const next = secondaryRoutes[(index + 1) % secondaryRoutes.length];
      const endpoint = operation.secondaryRoute.points.at(-1);
      const target = next.secondaryRoute.points[0];
      const handoffDistance = Math.hypot(
        endpoint[0] - target[0],
        endpoint[2] - target[2],
      );
      if (handoffDistance <= 0.05 || handoffDistance > 10) continue;
      operation.secondaryHandoff = {
        routeId: stableRouteId(
          actor,
          journey,
          operation,
          `secondary-handoff-${next.fileOffset || index}`,
        ),
        points: [endpoint, target],
        targetFileOffset: next.fileOffset || null,
        targetObjectCode: next.secondaryObjectCode,
        targetControlWord: next.secondaryControlWord,
        targetStepPerUpdate: next.resolvedPathStepPerUpdate,
        classification: "native nearby secondary-controller handoff",
      };
    }
    return { ...journey, operations };
  });
}

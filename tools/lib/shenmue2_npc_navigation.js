const ROUTE_PARAMETER_SCALE = 64;
const MAX_NODE_ROUTE_OFFSET = 25;
const ROUTE_FLATTENING_TOLERANCE = 0.1;

function distanceXZ(left, right) {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function catmullRom(left, start, end, right, amount) {
  const amount2 = amount * amount;
  const amount3 = amount2 * amount;
  return 0.5 * (
    2 * start
    + (-left + end) * amount
    + (2 * left - 5 * start + 4 * end - right) * amount2
    + (-left + 3 * start - 3 * end + right) * amount3
  );
}

export function shenmue2RouteMaximumParameter(route) {
  return Math.max(0, route.points.length - 3) * ROUTE_PARAMETER_SCALE;
}

// Default.xbe 0x6231b converts the signed node parameter to a float with a
// 1/64 multiplier and evaluates four consecutive route control points. The
// curve begins at control point 1 and ends at count - 2, which is the standard
// uniform Catmull-Rom layout used here.
export function shenmue2RouteSplinePoint(route, nativeParameter) {
  const maximum = shenmue2RouteMaximumParameter(route);
  const parameter = Math.max(0, Math.min(maximum, nativeParameter));
  const curveParameter = parameter / ROUTE_PARAMETER_SCALE;
  const finalSegment = Math.max(0, route.points.length - 4);
  const segment = Math.min(finalSegment, Math.floor(curveParameter));
  const amount = parameter === maximum
    ? 1
    : curveParameter - segment;
  const controls = route.points.slice(segment, segment + 4);
  return [0, 1, 2].map((axis) => catmullRom(
    controls[0][axis],
    controls[1][axis],
    controls[2][axis],
    controls[3][axis],
    amount,
  ));
}

function routeSegment(route, fromParameter, toParameter) {
  if (fromParameter === toParameter) {
    return [shenmue2RouteSplinePoint(route, fromParameter)];
  }
  const direction = Math.sign(toParameter - fromParameter);
  const boundaries = [fromParameter];
  let boundary = direction > 0
    ? Math.ceil(fromParameter / ROUTE_PARAMETER_SCALE) * ROUTE_PARAMETER_SCALE
    : Math.floor(fromParameter / ROUTE_PARAMETER_SCALE) * ROUTE_PARAMETER_SCALE;
  if (boundary === fromParameter) boundary += direction * ROUTE_PARAMETER_SCALE;
  while (direction > 0 ? boundary < toParameter : boundary > toParameter) {
    boundaries.push(boundary);
    boundary += direction * ROUTE_PARAMETER_SCALE;
  }
  boundaries.push(toParameter);

  const result = [shenmue2RouteSplinePoint(route, boundaries[0])];
  const pointToLineDistance = (point, start, end) => {
    const delta = end.map((value, axis) => value - start[axis]);
    const lengthSquared = delta.reduce((sum, value) => sum + value ** 2, 0);
    if (lengthSquared === 0) {
      return Math.hypot(...point.map((value, axis) => value - start[axis]));
    }
    const amount = Math.max(0, Math.min(1, point.reduce(
      (sum, value, axis) => sum + (value - start[axis]) * delta[axis],
      0,
    ) / lengthSquared));
    return Math.hypot(...point.map(
      (value, axis) => value - (start[axis] + delta[axis] * amount),
    ));
  };
  const flatten = (startParameter, endParameter, depth = 0) => {
    const start = shenmue2RouteSplinePoint(route, startParameter);
    const end = shenmue2RouteSplinePoint(route, endParameter);
    const span = endParameter - startParameter;
    const samples = [0.25, 0.5, 0.75].map((amount) => (
      shenmue2RouteSplinePoint(route, startParameter + span * amount)
    ));
    if (
      depth >= 8
      || Math.max(...samples.map(
        (point) => pointToLineDistance(point, start, end),
      )) <= ROUTE_FLATTENING_TOLERANCE
    ) {
      result.push(end);
      return;
    }
    const middle = startParameter + span / 2;
    flatten(startParameter, middle, depth + 1);
    flatten(middle, endParameter, depth + 1);
  };
  for (let index = 1; index < boundaries.length; index += 1) {
    flatten(boundaries[index - 1], boundaries[index]);
  }
  return result;
}

function segmentLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
      points[index][2] - points[index - 1][2],
    );
  }
  return length;
}

function endpointKey(routeIndex, endpoint) {
  return `${routeIndex}:${endpoint}`;
}

function referenceEndpoint(reference) {
  // Every native reference's sign agrees with the authored junction geometry:
  // a clear sign selects the neighbor's start and bit 15 selects its end.
  // This is orientation metadata, not a signed route index.
  return reference < 0 ? 1 : 0;
}

function addEdge(adjacency, from, edge) {
  if (!adjacency.has(from)) adjacency.set(from, []);
  adjacency.get(from).push(edge);
}

function validNodeBinding(node, route) {
  if (!route || node.routeParameter < 0) return false;
  if (node.routeParameter > shenmue2RouteMaximumParameter(route)) return false;
  return distanceXZ(
    [node.x, node.y, node.z],
    shenmue2RouteSplinePoint(route, node.routeParameter),
  ) <= MAX_NODE_ROUTE_OFFSET;
}

export function buildShenmue2RouteGraph(routes, nodes) {
  const routeByIndex = new Map(routes.map((route) => [route.index, route]));
  const routeWorlds = new Map(routes.map((route) => [route.index, new Set()]));
  for (const node of nodes) {
    const route = routeByIndex.get(node.routeIndex);
    if (node.worldId && validNodeBinding(node, route)) {
      routeWorlds.get(route.index).add(node.worldId);
    }
  }

  const adjacency = new Map();
  for (const route of routes) {
    const maximum = shenmue2RouteMaximumParameter(route);
    const forward = routeSegment(route, 0, maximum);
    const length = segmentLength(forward);
    addEdge(adjacency, endpointKey(route.index, 0), {
      to: endpointKey(route.index, 1),
      cost: length,
      kind: "route",
      routeIndex: route.index,
      fromParameter: 0,
      toParameter: maximum,
    });
    addEdge(adjacency, endpointKey(route.index, 1), {
      to: endpointKey(route.index, 0),
      cost: length,
      kind: "route",
      routeIndex: route.index,
      fromParameter: maximum,
      toParameter: 0,
    });

    for (const [endpoint, references] of [
      [1, route.endRouteReferences],
      [0, route.startRouteReferences],
    ]) {
      for (const reference of references) {
        const neighborIndex = reference & 0x7fff;
        const neighbor = routeByIndex.get(neighborIndex);
        if (!neighbor || neighborIndex === route.index) continue;
        const neighborEndpoint = referenceEndpoint(reference);
        const from = endpointKey(route.index, endpoint);
        const to = endpointKey(neighborIndex, neighborEndpoint);
        const gap = Math.hypot(
          ...shenmue2RouteSplinePoint(
            route,
            endpoint ? maximum : 0,
          ).map((value, axis) => value - shenmue2RouteSplinePoint(
            neighbor,
            neighborEndpoint
              ? shenmue2RouteMaximumParameter(neighbor)
              : 0,
          )[axis]),
        );
        const edge = {
          to,
          cost: gap,
          kind: "connection",
          routeIndex: neighborIndex,
          endpoint: neighborEndpoint,
        };
        addEdge(adjacency, from, edge);
        // Route references describe a physical junction. Some records retain
        // only the preferred outgoing branch, but pedestrians may approach the
        // same junction from either side, so expose the same authored junction
        // in reverse rather than synthesizing a proximity connection.
        addEdge(adjacency, to, {
          ...edge,
          to: from,
          routeIndex: route.index,
          endpoint,
        });
      }
    }
  }
  return { routes, routeByIndex, routeWorlds, adjacency };
}

function routeAllowed(graph, routeIndex, worldId) {
  const worlds = graph.routeWorlds.get(routeIndex);
  return !worlds?.size || worlds.has(worldId);
}

function appendDistinct(points, additions) {
  for (const point of additions) {
    const previous = points.at(-1);
    if (!previous || point.some((value, axis) => (
      Math.abs(value - previous[axis]) > 1e-5
    ))) points.push(point);
  }
}

function nodePoint(graph, node) {
  const route = graph.routeByIndex.get(node.routeIndex);
  const routePoint = shenmue2RouteSplinePoint(route, node.routeParameter);
  return [node.x, routePoint[1], node.z];
}

export function shenmue2RoutePath(graph, fromNode, toNode, worldId) {
  if (fromNode.worldId !== worldId || toNode.worldId !== worldId) return null;
  const fromRoute = graph.routeByIndex.get(fromNode.routeIndex);
  const toRoute = graph.routeByIndex.get(toNode.routeIndex);
  if (
    !validNodeBinding(fromNode, fromRoute)
    || !validNodeBinding(toNode, toRoute)
    || !routeAllowed(graph, fromRoute.index, worldId)
    || !routeAllowed(graph, toRoute.index, worldId)
  ) return null;

  const source = "source";
  const target = "target";
  const adjacency = new Map(
    [...graph.adjacency].map(([key, edges]) => [key, [...edges]]),
  );
  const addPartial = (from, to, route, fromParameter, toParameter) => {
    const points = routeSegment(route, fromParameter, toParameter);
    addEdge(adjacency, from, {
      to,
      cost: segmentLength(points),
      kind: "route",
      routeIndex: route.index,
      fromParameter,
      toParameter,
    });
  };
  const fromMaximum = shenmue2RouteMaximumParameter(fromRoute);
  const toMaximum = shenmue2RouteMaximumParameter(toRoute);
  addPartial(
    source,
    endpointKey(fromRoute.index, 0),
    fromRoute,
    fromNode.routeParameter,
    0,
  );
  addPartial(
    source,
    endpointKey(fromRoute.index, 1),
    fromRoute,
    fromNode.routeParameter,
    fromMaximum,
  );
  addPartial(
    endpointKey(toRoute.index, 0),
    target,
    toRoute,
    0,
    toNode.routeParameter,
  );
  addPartial(
    endpointKey(toRoute.index, 1),
    target,
    toRoute,
    toMaximum,
    toNode.routeParameter,
  );
  if (fromRoute.index === toRoute.index) {
    addPartial(
      source,
      target,
      fromRoute,
      fromNode.routeParameter,
      toNode.routeParameter,
    );
  }

  const distances = new Map([[source, 0]]);
  const previous = new Map();
  const pending = new Set([source]);
  while (pending.size) {
    let current = null;
    for (const candidate of pending) {
      if (
        current === null
        || distances.get(candidate) < distances.get(current)
      ) current = candidate;
    }
    pending.delete(current);
    if (current === target) break;
    for (const edge of adjacency.get(current) || []) {
      if (
        edge.to !== target
        && edge.to !== source
        && !routeAllowed(
          graph,
          Number.parseInt(edge.to.split(":", 1)[0], 10),
          worldId,
        )
      ) continue;
      const distance = distances.get(current) + edge.cost;
      if (distance >= (distances.get(edge.to) ?? Infinity)) continue;
      distances.set(edge.to, distance);
      previous.set(edge.to, { from: current, edge });
      pending.add(edge.to);
    }
  }
  if (!previous.has(target)) return null;

  const edges = [];
  for (let key = target; key !== source;) {
    const step = previous.get(key);
    edges.push(step.edge);
    key = step.from;
  }
  edges.reverse();
  const points = [nodePoint(graph, fromNode)];
  const routeIndices = new Set([fromRoute.index]);
  for (const edge of edges) {
    const route = graph.routeByIndex.get(edge.routeIndex);
    routeIndices.add(route.index);
    if (edge.kind === "route") {
      appendDistinct(points, routeSegment(
        route,
        edge.fromParameter,
        edge.toParameter,
      ));
    } else {
      appendDistinct(points, [shenmue2RouteSplinePoint(
        route,
        edge.endpoint
          ? shenmue2RouteMaximumParameter(route)
          : 0,
      )]);
    }
  }
  appendDistinct(points, [nodePoint(graph, toNode)]);
  return { points, routeIndices: [...routeIndices] };
}

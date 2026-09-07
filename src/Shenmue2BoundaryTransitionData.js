import catalog from "../play/data/shenmue2-boundary-transitions.json" with {
  type: "json",
};

function freezePosition(position) {
  return Object.freeze([...position]);
}

function freezeTransition(transition) {
  return Object.freeze({
    ...transition,
    source: Object.freeze({
      ...transition.source,
      shape: Object.freeze({
        ...transition.source.shape,
        left: freezePosition(transition.source.shape.left),
        right: freezePosition(transition.source.shape.right),
        approach: freezePosition(transition.source.shape.approach),
      }),
    }),
    destination: Object.freeze({
      ...transition.destination,
      browserSpawn: Object.freeze({
        ...transition.destination.browserSpawn,
        position: freezePosition(transition.destination.browserSpawn.position),
      }),
    }),
    evidence: Object.freeze({ ...transition.evidence }),
  });
}

if (catalog.format !== "new-yokosuka-shenmue2-boundary-transitions-v1") {
  throw new Error(`Unsupported Shenmue II boundary catalog ${catalog.format}`);
}

const SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS = Object.freeze(
  catalog.transitions.map(freezeTransition),
);

export const SHENMUE2_TRAVERSABLE_WORLD_DATA = Object.freeze(
  catalog.worlds.map((world) => Object.freeze({
    ...world,
    spawn: Object.freeze({
      ...world.spawn,
      position: freezePosition(world.spawn.position),
    }),
  })),
);

export default SHENMUE2_OUTDOOR_BOUNDARY_TRANSITIONS;

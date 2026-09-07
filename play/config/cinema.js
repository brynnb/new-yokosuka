export const CINEMA_ASSET_URL = "/assets/cinema/cinema-v6.glb";
export const CINEMA_ASSET_FILENAME = "CUSTOM_CINEMA_V6.GLB";
export const CINEMA_WORLD_SCALE = 1.5;
// Measured from Building_primitive1's entrance-floor triangles after the GLB
// root transform and CINEMA_WORLD_SCALE have been applied. Spawn slightly
// above the surface so the controller can ray-snap its feet down onto it
// instead of beginning embedded below a floor that exceeds maxStepUp.
export const CINEMA_ENTRY_FLOOR_Y = 0.650597;
export const CINEMA_SPAWN_CLEARANCE = 0.1;

function scaledCinemaVector(values) {
  return Object.freeze(values.map((value) => (
    Number((value * CINEMA_WORLD_SCALE).toFixed(6))
  )));
}

const cinemaSpawnXZ = scaledCinemaVector([4.45, 0, -6.47]);
export const CINEMA_SPAWN = Object.freeze([
  cinemaSpawnXZ[0],
  CINEMA_ENTRY_FLOOR_Y + CINEMA_SPAWN_CLEARANCE,
  cinemaSpawnXZ[2],
]);

function frozenTransition({
  id,
  sourceWorldId,
  sourcePosition,
  destinationWorldId,
  destinationPosition,
  destinationYaw,
  evidence,
}) {
  return Object.freeze({
    id,
    source: Object.freeze({
      worldId: sourceWorldId,
      interaction: "click",
      browserPosition: Object.freeze([...sourcePosition]),
    }),
    destination: Object.freeze({
      worldId: destinationWorldId,
      entry: null,
      browserSpawn: Object.freeze({
        position: Object.freeze([...destinationPosition]),
        yaw: destinationYaw,
      }),
    }),
    evidence: Object.freeze({ ...evidence }),
  });
}

const DOBUITA_TO_CINEMA = frozenTransition({
  id: "dobuita-cinema-doors-to-cinema",
  sourceWorldId: "dobuita",
  sourcePosition: [40.392694, 1.122401, 49.474934],
  destinationWorldId: "cinema",
  // Babylon converts the glTF's right-handed X axis into its left-handed
  // scene, placing the authored entrance on +X at runtime.
  destinationPosition: CINEMA_SPAWN,
  destinationYaw: -Math.PI / 2,
  evidence: {
    kind: "user-selected-map-triangles",
    sourceModel: "S1_D000_MAP.MT5",
    sourceMesh: "mt5_tex_33",
    sourceFaces: Object.freeze([2, 3, 4, 5]),
  },
});

const CINEMA_TO_DOBUITA = frozenTransition({
  id: "cinema-doors-to-dobuita",
  sourceWorldId: "cinema",
  sourcePosition: [5.78, 1.26, -6.47],
  destinationWorldId: "dobuita",
  destinationPosition: [40.19, 0.07, 44.94],
  destinationYaw: Math.PI,
  evidence: {
    kind: "named-glb-door-panels",
    sourceModel: CINEMA_ASSET_FILENAME,
    sourceNodes: Object.freeze(["door_L", "door_R"]),
  },
});

function interactionAnchor(transition, position, size) {
  return Object.freeze({
    id: transition.id,
    position: Object.freeze([...position]),
    size: Object.freeze([...size]),
    transition,
  });
}

export const CINEMA_TRANSITION_INTERACTIONS = Object.freeze({
  dobuita: Object.freeze([
    interactionAnchor(
      DOBUITA_TO_CINEMA,
      [40.392694, 1.122401, 49.474934],
      [1.9, 2.2, 0.16],
    ),
  ]),
  cinema: Object.freeze([
    interactionAnchor(
      CINEMA_TO_DOBUITA,
      scaledCinemaVector([5.78, 1.26, -6.47]),
      scaledCinemaVector([0.16, 2.2, 2.2]),
    ),
  ]),
});

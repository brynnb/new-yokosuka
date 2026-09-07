export const MJQ_POOL_WORLD_ID = "djaz";
export const MJQ_POOL_TABLE_CENTER = Object.freeze([
  -3.1459919,
  0,
  -8.7110184,
]);

export const MJQ_POOL_EQUIPMENT_PLACEMENTS = Object.freeze([
  Object.freeze({
    model: "S1_DJAZ_BOLK5DYG.MT5",
    position: MJQ_POOL_TABLE_CENTER,
    runtime: Object.freeze({
      poolEquipment: "balls",
      placementSource: "native-mjq-pool-game",
    }),
  }),
  Object.freeze({
    model: "S1_DJAZ_CYUW1H1G.MT5",
    position: MJQ_POOL_TABLE_CENTER,
    runtime: Object.freeze({
      poolEquipment: "cue",
      placementSource: "native-mjq-pool-game",
    }),
  }),
]);

export const MJQ_POOL_INTERACTION = Object.freeze({
  gameId: "mjq-pool",
  label: "MJQ Nine-Ball",
  worldId: MJQ_POOL_WORLD_ID,
  position: Object.freeze([
    MJQ_POOL_TABLE_CENTER[0],
    0.92,
    MJQ_POOL_TABLE_CENTER[2],
  ]),
  size: Object.freeze([3.2, 0.9, 1.72]),
});

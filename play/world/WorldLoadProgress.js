export function worldLoadWorkCount(
  world,
  scheduledActorDefinitions,
  postLoadUnits = 1,
) {
  return (
    new Set((world.placements || []).map((placement) => placement.model)).size
    + scheduledActorDefinitions.length
    + postLoadUnits
  );
}

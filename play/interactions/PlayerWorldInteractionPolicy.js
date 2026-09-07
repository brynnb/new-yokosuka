export function playerWorldInteractionAllowed({
  world,
  presentationOwned = false,
} = {}) {
  return Boolean(
    world
    && world.cutsceneOnly !== true
    && presentationOwned !== true
  );
}

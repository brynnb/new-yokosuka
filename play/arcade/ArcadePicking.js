/** Resolve a cabinet from the visible world surface, never a proxy ray hit. */
export function pickArcadeInteraction(scene, camera) {
  const anchors = scene.meshes?.filter(mesh => (
    mesh.metadata?.interactiveArcade && mesh.isEnabled()
  )) || [];
  if (!anchors.length) return null;

  const surface = scene.pick(scene.pointerX, scene.pointerY, mesh => (
    mesh.isPickable && mesh.isVisible && mesh.visibility > 0
    && mesh.isEnabled()
    && !mesh.metadata?.arcadeSuppressedVariant
    && !mesh.metadata?.interactiveArcade
    && (mesh.metadata?.terrain || mesh.metadata?.cameraBlocker || mesh.metadata?.arcadeScreen)
  ), false, camera);
  if (!surface?.hit || !surface.pickedPoint) return null;

  const point = surface.pickedPoint;
  const matches = anchors.filter(anchor => {
    const { position, size } = anchor.metadata.interactiveArcade;
    // Open bounds exclude the floor at a cabinet's base and shared edges.
    // Float32 picking can put a floor hit microscopically above zero; use
    // 0.01 mm numerical tolerance, not an interaction-sized inset.
    // These regions classify a surface point; their nearer faces cannot
    // intercept a ray aimed at a neighboring machine from an oblique camera.
    return [point.x, point.y, point.z].every((value, axis) => (
      value > position[axis] - size[axis] / 2 + 0.00001
      && value < position[axis] + size[axis] / 2 - 0.00001
    ));
  });
  // Overlapping/ambiguous content should not silently choose an arbitrary game.
  return matches.length === 1 ? matches[0].metadata.interactiveArcade : null;
}

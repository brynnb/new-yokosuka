function parseNodeOffset(value) {
  const offset = Number.parseInt(value, 16);
  return Number.isFinite(offset) ? offset : null;
}

function mt7Node(root, offset) {
  return (root._mt7Nodes || []).find(
    ({ sourceNode }) => sourceNode.offset === offset,
  ) || null;
}

export function isDirectShenmue2DoorPick(door, directPick) {
  if (!door?.type?.startsWith("shenmue2-")) return true;
  return Boolean(
    directPick?.hit
    && directPick.pickedMesh?.metadata?.interactiveDoor === door
  );
}

export function bindShenmue2NativeDoors({
  currentMeshes,
  transitions,
  worldId,
  doorInteractions,
  setMetadata,
}) {
  if (!worldId?.startsWith("s2")) return [];
  const rootsByFilename = new Map(currentMeshes.map(
    (root) => [root._filename, root],
  ));
  const doors = [];
  for (const transition of transitions) {
    const binding = transition.source.worldId === worldId
      ? transition.source.nativeDoor
      : null;
    if (!binding) continue;
    const modelRoot = rootsByFilename.get(binding.model);
    if (!modelRoot) continue;
    const group = mt7Node(modelRoot, parseNodeOffset(binding.groupNodeOffset));
    const panels = binding.panelNodeOffsets.map((offset, index) => {
      const panel = mt7Node(modelRoot, parseNodeOffset(offset));
      return panel ? {
        ...panel,
        direction: binding.panelDirections?.[index],
      } : null;
    }).filter(Boolean);
    const pickNodes = (binding.pickNodeOffsets || binding.panelNodeOffsets).map(
      (offset) => mt7Node(modelRoot, parseNodeOffset(offset)),
    ).filter(Boolean);
    if (
      !group
      || panels.length !== binding.panelNodeOffsets.length
      || pickNodes.length !== (
        binding.pickNodeOffsets || binding.panelNodeOffsets
      ).length
    ) continue;

    // The group is the physical origin used for proximity and animation, but
    // only its authored moving leaves are clickable. Static storefront and
    // wall descendants deliberately receive no transition metadata.
    group.transform._filename = binding.model;
    const pairedSliding = binding.motion?.type === "paired-sliding";
    const door = pairedSliding
      ? doorInteractions.registerShenmue2PairedSliding(
        group.transform,
        pickNodes.map((panel, index) => ({
          ...panel,
          // The MT7 loader reflects source X into browser X.
          direction: -binding.motion.sourceDirections[index],
        })),
        transition,
        pickNodes.map(({ transform }) => transform),
      )
      : doorInteractions.registerShenmue2Hinged(
        group.transform,
        panels,
        transition,
        pickNodes.map(({ transform }) => transform),
      );
    if (!door) continue;
    for (const pickNode of pickNodes) {
      setMetadata(pickNode.transform, "interactiveMapTransition", {
        root: group.transform,
        transition,
      });
    }
    doors.push(door);
  }
  return doors;
}

const VENDING_MACHINE_VIEWER_MODEL = "G_VENDING_JIHS5KNG.MT5";

const DISPLAY_SLOTS = Object.freeze([
  Object.freeze({ x: -0.18, y: 1.46 }),
  Object.freeze({ x: -0.06, y: 1.46 }),
  Object.freeze({ x: 0.06, y: 1.46 }),
  Object.freeze({ x: 0.18, y: 1.46 }),
  Object.freeze({ x: -0.18, y: 1.22 }),
  Object.freeze({ x: -0.06, y: 1.22 }),
  Object.freeze({ x: 0.06, y: 1.22 }),
  Object.freeze({ x: 0.18, y: 1.22 }),
]);

function displayCanParents(root) {
  return (root?.getDescendants?.(false) || [])
    .filter((node) => (
      node.name?.startsWith("node_")
      && node.getChildren?.().some((child) => (
        /^mt5_tex_[2-6]$/.test(child.name || "")
        && child.getTotalVertices?.() > 0
      ))
    ))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function arrangeVendingMachineDisplay(filename, roots) {
  if (filename !== VENDING_MACHINE_VIEWER_MODEL) return 0;

  const cans = (roots || []).flatMap(displayCanParents);
  for (let index = 0; index < Math.min(cans.length, DISPLAY_SLOTS.length); index++) {
    const can = cans[index];
    const slot = DISPLAY_SLOTS[index];
    can.position.set(slot.x, slot.y, 0.302);
  }
  return Math.min(cans.length, DISPLAY_SLOTS.length);
}

const OLD_WAREHOUSE_DOOR_ROLES = Object.freeze({
  dor3: Object.freeze({
    kind: "warehouse-8-entrance",
    label: "Old Warehouse No. 8",
    evidence: "MKSG topology plus native MKSG -> MS08 entry 0 dispatch",
  }),
  dor8: Object.freeze({
    kind: "harbor-exit",
    label: "New Yokosuka Harbor",
    evidence: "MKSG compound entrance topology plus native MKSG -> MFSY entry 1 dispatch",
  }),
});

export function oldWarehouseDoorRole(objectTag) {
  if (typeof objectTag !== "string") return null;
  return OLD_WAREHOUSE_DOOR_ROLES[objectTag.toLowerCase()] || Object.freeze({
    kind: "locked-warehouse",
    label: "This warehouse is locked.",
    evidence: "Only Old Warehouse No. 8 is enterable during the native stealth route",
  });
}

export { OLD_WAREHOUSE_DOOR_ROLES };

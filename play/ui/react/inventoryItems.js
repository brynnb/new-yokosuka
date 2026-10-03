import catalog from "../../../artwork/inventory/catalog.json" with { type: "json" };

// This remains a display catalog, not a claim that the character owns these
// items. Reserve/demo-only art is never imported into the client asset graph.
export const INVENTORY_ITEMS = Object.freeze(
  catalog.assets.filter((item) => item.usage === "display").map(({ id, name }) => Object.freeze({
    id,
    name,
    iconUrl: new URL(`../assets/inventory/${id}.webp`, import.meta.url).href,
  })),
);

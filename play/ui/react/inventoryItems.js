import catalog from "../../../artwork/inventory/catalog.json" with { type: "json" };

// Artwork metadata only. Ownership and quantities come from server inventory.
// Reserve/demo-only art never enters the client asset graph.
export const INVENTORY_ITEMS = Object.freeze(
  catalog.assets.filter((item) => item.usage === "display").map(({ id, name }) => Object.freeze({
    id,
    name,
    iconUrl: new URL(`../assets/inventory/${id}.webp`, import.meta.url).href,
  })),
);

const artwork=new Map(INVENTORY_ITEMS.map(item=>[item.id,item]));
const itemArtworkIds=Object.freeze({chinese_letter:"letter-to-father"});

export function inventoryArtworkFor(key){
  return artwork.get(itemArtworkIds[key]||key.replaceAll("_","-"))||null;
}

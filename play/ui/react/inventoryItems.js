import catalog from "../../../artwork/inventory/catalog.json" with { type: "json" };
import {storyScrollForItem} from '../../combat/StoryMoveProgression.js';

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
  return artwork.get(storyScrollForItem(key)?'move-scroll':itemArtworkIds[key]||key.replaceAll("_","-"))||null;
}

export function inventoryWithScrollActions(state) {
  if(!Array.isArray(state.inventory))throw new Error('Invalid inventory response.');
  return state.inventory.map(item=>{
    const scroll=storyScrollForItem(item.key);
    if(!scroll)return item;
    const flags=state.character?.storyFlags||{};
    const learned=flags[scroll.flag]===true;
    const reason=state.character?.playMode!=='story'?'Read in Story mode':
      !state.character?.openingCompleted?'Finish the opening first':
      scroll.requiredFlag&&flags[scroll.requiredFlag]!==true?'Ask Master Chen to translate':null;
    return {...item,scrollLearned:learned,scrollReadable:!learned&&!reason,scrollReadReason:reason};
  });
}

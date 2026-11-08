import catalog from "../data/story-travel-restrictions.json" with {type:"json"};

// This is a personal Story presentation rule, not multiplayer authorization.
// Do not infer progress from missing flags: older saves must not be trapped.
export function storyTravelRestriction(transition, character, restrictions = catalog.restrictions) {
  if (character?.playMode !== "story" || character.openingCompleted !== true) return null;
  const flags = character.storyFlags;
  if (!flags || typeof flags !== "object") return null;
  const rule = restrictions.find(candidate => candidate.transitionId === transition?.id
    && candidate.requiredFlags.every(flag => flags[flag] === true)
    && !candidate.supersededByFlags.some(flag => flags[flag] === true));
  return rule ? {reason:"story_requirement", message:rule.message, voiceAsset:rule.voice?.asset} : null;
}

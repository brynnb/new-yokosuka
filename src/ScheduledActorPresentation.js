import storyPresence from "../play/data/story-actor-presence.json" with {type:"json"};
const presenceRules=new Map();
if(storyPresence.schema!=="new-yokosuka-story-actor-presence-v1")throw Error("Invalid Story actor presence schema");
for(const rule of storyPresence.rules){
  if(!/^[A-Z0-9_]{4}$/.test(rule.actorCode)||presenceRules.has(rule.actorCode)||!Array.isArray(rule.excludedFlags)
    ||!rule.excludedFlags.length||rule.excludedFlags.some(flag=>typeof flag!=="string"||!flag.startsWith("story.s1.")))throw Error("Invalid Story actor presence rule");
  presenceRules.set(rule.actorCode,rule);
}

// Read-only projection of the authoritative character flags; not another save
// or quest system. The same rule covers this person's residents in every area.
export function scheduledActorStoryVisible(definition,character){
  if(character?.playMode!=="story"||definition.activityOnly)return true;
  const rule=presenceRules.get(definition.actorCode);
  return !rule?.excludedFlags.some(flag=>character.storyFlags?.[flag]===true);
}

export function scheduledActorModelCode(definition, descriptorState) {
  const overrideCode = descriptorState?.modelOverrideCode;
  return definition?.modelOverrides?.some(
    (override) => override.modelCode === overrideCode,
  )
    ? overrideCode
    : definition?.modelCode || null;
}

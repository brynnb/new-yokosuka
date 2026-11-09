import storyPresence from "../play/data/story-actor-presence.json" with {type:"json"};
const presenceRules=new Map();
if(storyPresence.schema!=="new-yokosuka-story-actor-presence-v1")throw Error("Invalid Story actor presence schema");
for(const rule of storyPresence.rules){
  const replacement=rule.replacedWhen;
  const validFlags=flags=>Array.isArray(flags)&&flags.every(flag=>typeof flag==="string"&&flag.startsWith("story.s1."));
  if(!/^[A-Z0-9_]{4}$/.test(rule.actorCode)||presenceRules.has(rule.actorCode)||!validFlags(rule.excludedFlags)
    ||(!rule.excludedFlags.length&&!replacement)||replacement&&(!validFlags(replacement.requiredFlags)||!replacement.requiredFlags.length||!validFlags(replacement.excludedFlags)))throw Error("Invalid Story actor presence rule");
  presenceRules.set(rule.actorCode,rule);
}

// Read-only projection of the authoritative character flags; not another save
// or quest system. The same rule covers this person's residents in every area.
export function scheduledActorStoryVisible(definition,character,gameDate){
  const personal=definition.storyVisibility;
  if(personal){
    if(character?.playMode!=="story")return false;
    if((personal.requiredFlags||[]).some(flag=>character.storyFlags?.[flag]!==true))return false;
    if((personal.excludedFlags||[]).some(flag=>character.storyFlags?.[flag]===true))return false;
    if(personal.hours){
      if(!(gameDate instanceof Date)||Number.isNaN(gameDate.valueOf()))return false;
      const hour=gameDate.getUTCHours()+gameDate.getUTCMinutes()/60+gameDate.getUTCSeconds()/3600;
      const [start,end]=personal.hours;
      if(start<end ? hour<start||hour>=end : hour<start&&hour>=end)return false;
    }
  }
  if(character?.playMode!=="story"||definition.activityOnly)return true;
  const rule=presenceRules.get(definition.actorCode);
  // A personal placement replaces, rather than duplicates, its scheduled
  // resident only for the flags that make that personal placement active.
  if(!personal&&rule?.replacedWhen&&rule.replacedWhen.requiredFlags.every(flag=>character.storyFlags?.[flag]===true)
    &&rule.replacedWhen.excludedFlags.every(flag=>character.storyFlags?.[flag]!==true))return false;
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

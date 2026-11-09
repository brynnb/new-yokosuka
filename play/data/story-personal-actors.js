// Personal Story residents supplement the shared schedule; they never mutate
// the server's globally scheduled NPCs. Coordinates are browser-space poses
// from the named original scene, not a claim about its native daily routine.
export const storyPersonalActors = Object.freeze({
  sakuragaoka: Object.freeze([
    Object.freeze({
      actorCode:"KAME",instanceId:"KAME:story-park",label:"Kame Shibukawa",modelCode:"FUU_L",nativeDefaultMotionStateId:32957,
      position:Object.freeze([-19.2,0.7,-8.7]),rotationDegrees:Object.freeze([0,0,0]),
      storyVisibility:Object.freeze({requiredFlags:Object.freeze(["story.s1.yamamoto-request.completed"]),
        excludedFlags:Object.freeze(["story.s1.yamamoto-escort.completed"])}),
      provenance:"Authored standing position beside Sakura Park's swing. The original KAME callback at 0x5f2ac places her on the swing at native [19.4241,0.7,-9.6781]; the seated animation is not yet reconstructed.",
    }),
  ]),
  yamanose: Object.freeze([
    Object.freeze({
      actorCode:"MEGM",instanceId:"MEGM:story-shrine",label:"Megumi Mishima",modelCode:"SIA_L",nativeDefaultMotionStateId:32978,
      position:Object.freeze([34.380374908447266,2.5999999046325684,39.79695129394531]),
      rotationDegrees:Object.freeze([0,35,0]),
      storyVisibility:Object.freeze({requiredFlags:Object.freeze(["story.s1.first-kitten.completed"]),
        excludedFlags:Object.freeze(["story.s1.kitten-adopted.completed"]),hours:Object.freeze([8.5,19])}),
      provenance:"Authored daytime Story placement at CATA1's final-shot Megumi pose; original default idle 32978 is from scheduled-actor-default-idle-evidence.json. Not a recovered daily schedule.",
    }),
  ]),
});

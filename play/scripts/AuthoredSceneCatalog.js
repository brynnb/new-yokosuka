import base from "../data/authored-story-scenes.json" with {type:"json"};
import jimmy from "../data/story-jimmy-chase.generated.json" with {type:"json"};
import harbor from "../data/story-harbor-scenes.generated.json" with {type:"json"};
import biker from "../data/story-harbor-biker.generated.json" with {type:"json"};
import goro from "../data/story-harbor-goro.generated.json" with {type:"json"};

// One read-only catalog feeds scene presentation, private cast assembly and
// authoring tools. Chapter generation must not create a second actor registry.
const scenes=[...base.scenes,...jimmy.scenes,...harbor.scenes,...biker.scenes,...goro.scenes];
if([jimmy,harbor,biker,goro].some(c=>c.schema!==base.schema)||new Set(scenes.map(s=>s.id)).size!==scenes.length)throw Error("Invalid or duplicate authored story scene");
export default Object.freeze({...base,motionBanks:{...base.motionBanks,...jimmy.motionBanks,...harbor.motionBanks,...biker.motionBanks,...goro.motionBanks},scenes});

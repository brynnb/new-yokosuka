import base from "../data/authored-story-scenes.json" with {type:"json"};
import jimmy from "../data/story-jimmy-chase.generated.json" with {type:"json"};

// One read-only catalog feeds scene presentation, private cast assembly and
// authoring tools. Chapter generation must not create a second actor registry.
const scenes=[...base.scenes,...jimmy.scenes];
if(jimmy.schema!==base.schema||new Set(scenes.map(s=>s.id)).size!==scenes.length)throw Error("Invalid or duplicate authored story scene");
export default Object.freeze({...base,motionBanks:{...base.motionBanks,...jimmy.motionBanks},scenes});

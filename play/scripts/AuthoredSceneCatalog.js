import base from "../data/authored-story-scenes.json" with {type:"json"};
import jimmy from "../data/story-jimmy-chase.generated.json" with {type:"json"};
import harbor from "../data/story-harbor-scenes.generated.json" with {type:"json"};
import biker from "../data/story-harbor-biker.generated.json" with {type:"json"};
import goro from "../data/story-harbor-goro.generated.json" with {type:"json"};
import sailors from "../data/story-harbor-sailors.generated.json" with {type:"json"};
import nozomi from "../data/story-nozomi-rescue.generated.json" with {type:"json"};

// One read-only catalog feeds scene presentation, private cast assembly and
// authoring tools. Chapter generation must not create a second actor registry.
const chapters=[base,jimmy,harbor,biker,goro,sailors,nozomi],scenes=chapters.flatMap(c=>c.scenes);
if(chapters.some(c=>c.schema!==base.schema)||new Set(scenes.map(s=>s.id)).size!==scenes.length)throw Error("Invalid or duplicate authored story scene");
export default Object.freeze({...base,motionBanks:Object.assign({},...chapters.map(c=>c.motionBanks)),scenes});

import drunkard from "../data/story-dobuita-drunkard.generated.json" with {type:"json"};
import base from "../data/authored-story-scenes.json" with {type:"json"};
import jimmy from "../data/story-jimmy-chase.generated.json" with {type:"json"};
import harbor from "../data/story-harbor-scenes.generated.json" with {type:"json"};
import biker from "../data/story-harbor-biker.generated.json" with {type:"json"};
import goro from "../data/story-harbor-goro.generated.json" with {type:"json"};
import sailors from "../data/story-harbor-sailors.generated.json" with {type:"json"};
import nozomi from "../data/story-nozomi-rescue.generated.json" with {type:"json"};
import finalDay from "../data/story-final-day.generated.json" with {type:"json"};
import finalBattle from "../data/story-final-battle.generated.json" with {type:"json"};
import heartbeats from "../data/story-heartbeats.generated.json" with {type:"json"};
import kitten from "../data/story-kitten.generated.json" with {type:"json"};
import kittenSearch from "../data/story-kitten-search.generated.json" with {type:"json"};
import yamamoto from "../data/story-yamamoto-scenes.generated.json" with {type:"json"};
import football from "../data/story-yamanose-football.generated.json" with {type:"json"};
import eri from "../data/story-nozomi-eri.generated.json" with {type:"json"};
import maiAlley from "../data/story-mai-alley.generated.json" with {type:"json"};
import friendsBar from "../data/story-friends-bar.generated.json" with {type:"json"};

// One read-only catalog feeds scene presentation, private cast assembly and
// authoring tools. Chapter generation must not create a second actor registry.
const chapters=[base,drunkard,jimmy,harbor,biker,goro,sailors,nozomi,finalDay,finalBattle,heartbeats,kitten,kittenSearch,yamamoto,football,eri,friendsBar,maiAlley],scenes=chapters.flatMap(c=>c.scenes);
if(chapters.some(c=>c.schema!==base.schema)||new Set(scenes.map(s=>s.id)).size!==scenes.length)throw Error("Invalid or duplicate authored story scene");
export default Object.freeze({...base,motionBanks:Object.assign({},...chapters.map(c=>c.motionBanks)),scenes});

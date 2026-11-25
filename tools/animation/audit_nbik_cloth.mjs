// Compare actual Babylon garment vertices with original CLTH output at the
// previously reported NBIK close-up. All inputs stay local to the installation.
import fs from "node:fs";
import * as B from "@babylonjs/core";
import {Mt5Loader} from "../../src/Mt5Loader.js";
import {MotnLoader} from "../../src/MotnLoader.js";
import {parseAuthMovement,evaluateAuthActor} from "../../src/AuthMovement.js";
import {setSourceOrderRotation} from "../../src/Mt5InteractionRotation.js";
import {RYO_YK_RENDER_MATRIX_ROUTES} from "../../src/RuntimeMatrixRecording.js";
import {CharacterRuntime} from "../../play/characters/CharacterRuntime.js";
import {ScheduledActorMotionRuntime} from "../../play/characters/ScheduledActorMotionRuntime.js";
import {prepareNativeClothModelSurfaces} from "../../play/characters/NativeClothModel.js";
import {NativeClothModelState} from "../../play/characters/NativeClothBabylonPresentation.js";
import {parseNativeClothTrack} from "../../play/characters/NativeClothTrack.js";

const dir="play/assets/harbor/nozomi-home/", manifest=JSON.parse(fs.readFileSync(dir+"manifest.json"));
const reference=JSON.parse(fs.readFileSync("tools/evidence/nbik-nozomi-frame180.json"));
const slot=4, closeup=180, firstOutput=123;
const bytes = f=>{const b=fs.readFileSync(f);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const track=parseNativeClothTrack(bytes(manifest.clothTracks.HRSK.path));
const shot=manifest.activities[slot], poseTrack=parseAuthMovement(bytes(dir+shot.archiveMember)).actors.find(a=>a.tag==="HRSK");
const selection=shot.motions.find(m=>m.actorTag==="HRSK");
const bank=MotnLoader.parse(bytes(manifest.motionBanks[0].path),{sequenceIndices:[selection.sequenceIndex]});
const sequence=bank.sequences[0];
const engine=new B.NullEngine({renderWidth:1,renderHeight:1});
function distance(a,b) {return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
async function measure(mode,captured) {
  const scene=new B.Scene(engine);
  try {
    const loader=new Mt5Loader(scene,{characterRigMode:"gpu",mirrorCharacterX:true,backFaceCulling:false});
    const [renderRoot]=await loader.load(bytes(manifest.packageActors.HRSK.assetPath),null,{sourceFilename:"NZM_M.CHRM"});
    const surfaces=prepareNativeClothModelSurfaces(renderRoot);
    loader.mergeCharacterGpuRigMeshes(renderRoot,{preserveRenderKeySubtrees:surfaces.preservedRenderKeys});
    const root=new B.TransformNode("Nozomi",scene);renderRoot.parent=root;
    const model={loader,renderRoot,root,modelCode:"NZM_M",characterAssetFormat:"MT5",nativeClothRuntimeMode:mode};
    const routes=new Map(RYO_YK_RENDER_MATRIX_ROUTES);
    const runtime=new CharacterRuntime({scene,renderMatrixByKey:routes});
    const motion=new ScheduledActorMotionRuntime({characterRuntime:runtime,renderMatrixByKey:routes});
    const state=new NativeClothModelState(model), owner={};
    const group=state.groups.find(g=>g.group.controlType===-70);
    if (!group || !state.beginPresentation(owner,{activitySlot:slot,capturedTrack:captured?track:null})) throw Error("Riding garment is unavailable");
    const results=[];
    for(let frame=1;frame<=closeup;frame++) {
      const pose=evaluateAuthActor(poseTrack,Math.fround(frame/30));
      root.position.set(-pose.x,pose.y,pose.z);
      setSourceOrderRotation(root,[pose.rotationX,-pose.rotationY,-pose.rotationZ].map(B.Tools.ToRadians));
      root.computeWorldMatrix(true);
      if(frame===selection.frame && !motion.applyActivitySequence(model,{sequence,frame:selection.startFrame-1})) throw Error("Missing riding body pose");
      state.update(1/30,owner,{activityFrame:frame});
      if (![firstOutput,closeup].includes(frame)) continue;
      const native=track.frameAt(slot,frame);
      const rig=renderRoot._mt5CharacterWorldMatrices || loader.characterRigWorldMatrices(renderRoot,model.latestRetargetedRoutes);
      const outputMetrics=[];
      let maxTriangleEdge=0, maxStretch=0;
      for(const [side,output,node,floatVertices] of [
        ["exterior",group.exteriorOutput,group.group.controlNode,reference.controlCurrent],
        ["lining",group.liningOutput,group.group.renderNode,reference.renderCurrent],
      ]) {
        const mat=B.Matrix.FromArray(rig.get(node.addr));
        const distinct=new Set();let emitted=0, maxError=0;
        for(const surface of output.meshes) {
          const mesh=surface.mesh, verts=mesh.getVerticesData(B.VertexBuffer.PositionKind);
          const xyz=i=>verts.slice(i*3,i*3+3);
          const sourceIndices=mesh._mt5SourceVertexIndices;
          for(let i=0;i<sourceIndices.length;i++) {
            const n=sourceIndices[i]-node.model.vertexBase;
            // Signed boundary indices belong to the animated body, outside the 40 CLTH vertices.
            if(n<0 || n>=track.vertexCount) continue;
            const input=frame===reference.nativeFrame?B.Vector3.FromArray(floatVertices[n]):B.Vector3.FromArray(native,n*6);
            const expected=B.Vector3.TransformCoordinates(input,mat).asArray();
            maxError=Math.max(maxError,distance(expected,xyz(i)));
            emitted++;distinct.add(n);
          }
          const indices=mesh.getIndices();
          for(let i=0;i<indices.length;i+=3) for(let e=0;e<3;e++) {
            const a=indices[i+e], b=indices[i+(e+1)%3];
            const length=distance(xyz(a),xyz(b));
            const rest=distance(surface.positions.slice(a*3,a*3+3),surface.positions.slice(b*3,b*3+3));
            maxTriangleEdge=Math.max(maxTriangleEdge,length);
            if(rest>.02)maxStretch=Math.max(maxStretch,length/rest);
          }
        }
        outputMetrics.push({side,emitted,distinctNativeVertices:distinct.size,maxError});
      }
      results.push({frame,maxTriangleEdge,maxStretch,surfaces:outputMetrics});
    }
    state.endPresentation(owner);
    return results;
  } finally {scene.dispose();}
}
try {
  const former=await measure(0,false),correctedMode=await measure(7,false),originalTrack=await measure(7,true);
  console.log(JSON.stringify({slot,former,correctedMode,originalTrack},null,2));
  if(originalTrack.some(r=>r.surfaces.some(s=>s.distinctNativeVertices!==30 || s.emitted!==60 || s.maxError>0.00013))) throw Error("Rendered skirt diverges from native control vertices");
} finally {engine.dispose();}

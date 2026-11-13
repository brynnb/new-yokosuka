import {expect} from "@playwright/test";
import nativeMapTransitions from "../../play/data/native-map-transitions.json" with {type:"json"};
import jomoPlacements from "../../play/data/jomo-runtime-placements.json" with {type:"json"};
import storyDestinations from "../../play/data/story-destinations.json" with {type:"json"};

export async function verifyBasementTravel(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();expect(before.character.storyFlags["story.s1.dojo-sword-switch.completed"]).toBe(true);
  expect(before.character.storyFlags["story.s1.basement-visited"]).not.toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const approach=async(which)=>{
    await page.evaluate(which=>{
      const l=window.storyProbe.lifecycle,c=l.getController();
      // Shorten the walk, not its trigger or result: actual W/collision crosses
      // the authored approach from outside, with accepted server presence.
      const p=which==="descent"?[9.5,.96,-22.5]:[-.758,-.005110997706651688,6];
      l.resetPlayer(l.vectorFromArray(p),which==="descent"?-Math.PI/2:0,{persist:false});
      c.setFirstPerson(true);c.cameraYaw=which==="descent"?-Math.PI/2:Math.PI;c.cameraPitch=0;c.updateCamera(1);
    },which);
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(id=>window.storyProbe.authoredScene?.active?.scene.id===id||window.storyProbe.sceneErrors.length,
      which==="descent"?"s1.jhd0.basement-descent":"s1.ydb1.basement-return",{timeout:25_000});}
    finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  const confirm=async(label)=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("line");
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active);
    await page.keyboard.press("Space");await page.getByRole("button",{name:label,exact:true}).click();
  };
  const arrived=async world=>{
    await page.waitForFunction(world=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id===world&&window.storyProbe.lifecycle.worldRuntime.ready,world,{timeout:90_000});
    await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await idle();await noErrors();
  };
  if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=="exterior")await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("exterior"));
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await idle();
  await approach("descent");await page.waitForTimeout(600);
  await page.screenshot({path:testInfo.outputPath("basement-descent-approach.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-basement-descent"));await idle();
  expect((await saved()).character.worldId).toBe("exterior");expect((await saved()).character.storyFlags["story.s1.basement-visited"]).not.toBe(true);
  await approach("descent");await confirm("Leave it for now");await idle();
  expect((await saved()).character.storyFlags["story.s1.basement-visited"]).not.toBe(true);
  await approach("descent");await confirm("Descend into the basement");await arrived("ydb1");
  await page.waitForTimeout(1500);await page.screenshot({path:testInfo.outputPath("basement-arrival.png")});
  const initial=await saved();expect(initial.character.worldId).toBe("ydb1");expect(initial.character.storyFlags["notebook.s1.basement"]).toBe(true);
  const arrival=storyDestinations.destinations.find(d=>d.id==="s1.home.basement-entry");
  const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
  for(let axis=0;axis<3;axis++)expect(position[axis]).toBeCloseTo(arrival.position[axis],1);
  await page.evaluate(()=>{const c=window.storyProbe.lifecycle.getController();c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{await page.waitForFunction(()=>window.storyProbe.lifecycle.getController().collider.position.z<3,null,{timeout:12_000});}
  finally{await page.keyboard.up("KeyW");}
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.y)).toBeGreaterThan(-1);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.z)).toBeLessThan(position[2]-.5);
  await page.screenshot({path:testInfo.outputPath("basement-main-room-movement.png")});
  await approach("return");await page.waitForTimeout(500);await page.screenshot({path:testInfo.outputPath("basement-return-approach.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-basement-return"));await idle();expect((await saved()).character.worldId).toBe("ydb1");
  await approach("return");await confirm("Return to the dojo");await arrived("exterior");
  expect((await saved()).character.storyFlags["story.s1.basement-returned"]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.x)).toBeCloseTo(9.5,1);
  // The visited flag must not turn this entrance into a one-shot dead end.
  await approach("descent");await confirm("Descend into the basement");await arrived("ydb1");
  const after=await saved();expect(after.inventory).toEqual(before.inventory);expect(after.character.yen).toBe(character.yen);expect(after.character.currentHp).toBe(character.currentHp);
  expect(after.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await arrived("ydb1");
  await page.screenshot({path:testInfo.outputPath("basement-saved-reload.png")});
}

export async function verifyDojoSwitches(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  for(const key of ["sword_handguard","dojo_sword"])expect(before.inventory.some(item=>item.key===key)).toBe(true);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const objectState=tag=>page.evaluate(tag=>{
    const root=window.storyProbe.lifecycle.scene.meshes.find(m=>m.metadata?.runtimeObject?.objectTag===tag)?.metadata.runtimeObject.root;
    if(!root)throw Error(`Missing original object ${tag}`);
    return {enabled:root.isEnabled(false),position:root.position.asArray()};
  },tag);
  const click=async(tag,position)=>{
    const point=await page.evaluate(async({tag,position})=>{
      const {runtimePlacementBounds}=await import("/src/RuntimePlacementAudit.js"),l=window.storyProbe.lifecycle;
      l.resetPlayer(l.vectorFromArray(position),0,{persist:false});
      const entry=l.scene.meshes.find(m=>m.metadata?.interactiveInspectable?.objectTag===tag)?.metadata.interactiveInspectable;
      if(!entry)throw Error(`Missing original scroll ${tag}`);
      const b=runtimePlacementBounds(entry.root),p=b.min.add(b.max).scale(.5),c=l.getController();
      c.setFirstPerson(true);c.cameraYaw=Math.atan2(-(p.x-c.collider.position.x),-(p.z-c.collider.position.z));
      c.cameraPitch=Math.atan2(c.collider.position.y+c.options.firstPersonHeadHeight-p.y,Math.hypot(p.x-c.collider.position.x,p.z-c.collider.position.z));c.updateCamera(1);
      const rect=l.engine.getRenderingCanvas().getBoundingClientRect(),v=l.scene.activeCamera.getViewMatrix(true).multiply(l.scene.activeCamera.getProjectionMatrix(true));
      const s=p.constructor.Project(p,v.constructor.Identity(),v,l.scene.activeCamera.viewport.toGlobal(l.engine.getRenderWidth(),l.engine.getRenderHeight()));
      return {x:rect.x+s.x*rect.width/l.engine.getRenderWidth(),y:rect.y+s.y*rect.height/l.engine.getRenderHeight()};
    },{tag,position});
    await page.waitForTimeout(250);await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:15_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);await page.keyboard.press("Space");
  };
  if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=="exterior")await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("exterior"));
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await idle();
  const wallBefore=await objectState("SKAB");
  for(const sw of [{tag:"KAK2",position:[9.2,1,-21.937],choice:"Lift the scroll and fit the handguard",scene:"s1.jhd0.handguard-switch",flag:"story.s1.dojo-handguard-switch.completed"},
    {tag:"KAK1",position:[9.2,1,-22.947],choice:"Lift the scroll and insert the sword",scene:"s1.jhd0.sword-switch",flag:"story.s1.dojo-sword-switch.completed"}]){
    expect((await saved()).character.storyFlags[sw.flag]).not.toBe(true);
    await click(sw.tag,sw.position);await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    expect((await objectState(sw.tag)).enabled).toBe(true);
    await click(sw.tag,sw.position);await page.getByRole("button",{name:sw.choice,exact:true}).click();
    await page.waitForFunction(scene=>window.storyProbe.authoredScene?.active?.scene.id===scene||window.storyProbe.sceneErrors.length,sw.scene,{timeout:20_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);await page.waitForTimeout(800);
    await page.screenshot({path:testInfo.outputPath(`${sw.tag}-recess-inspection.png`)});
    expect((await objectState(sw.tag)).enabled).toBe(false);
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-switch"));await idle();
    expect((await saved()).character.storyFlags[sw.flag]).not.toBe(true);expect((await objectState(sw.tag)).enabled).toBe(true);
    expect((await objectState("SKAB")).position).toEqual(wallBefore.position);
    await click(sw.tag,sw.position);await page.getByRole("button",{name:sw.choice,exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active&&window.storyProbe.authoredScene?.active,null,{timeout:20_000});await page.keyboard.press("Space");
    await expect.poll(async()=>(await saved()).character.storyFlags[sw.flag]).toBe(true);await idle();
    await expect.poll(async()=>(await objectState(sw.tag)).enabled).toBe(false);
  }
  const after=await saved();expect(after.inventory).toEqual(before.inventory);expect(after.character.yen).toBe(before.character.yen);expect(after.character.currentHp).toBe(before.character.currentHp);
  expect(after.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);
  await page.screenshot({path:testInfo.outputPath("dojo-switches-saved.png")});
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await idle();
  for(const tag of ["KAK1","KAK2"])expect((await objectState(tag)).enabled).toBe(false);
  expect((await objectState("SKAB")).position[2]).toBeCloseTo(wallBefore.position[2]+2.15,5);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}

export async function verifyDojoItems(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  expect((await saved()).inventory.some(i=>["mysterious_key","dojo_sword"].includes(i.key))).toBe(false);
  const travel=async world=>{if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!==world)await page.evaluate(async world=>window.storyProbe.lifecycle.travelToWorld(world),world);await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await idle();};
  const point=async(tag,kind,position)=>{
    await page.evaluate(async({tag,kind,position})=>{
      const {runtimePlacementBounds}=await import("/src/RuntimePlacementAudit.js");
      const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray(position),0,{persist:false});
      const entry=l.scene.meshes.find(m=>m.metadata?.[kind]?.objectTag===tag)?.metadata[kind];
      if(!entry)throw Error(`Missing real ${kind} ${tag}`);
      const b=runtimePlacementBounds(entry.root),p=b.min.add(b.max).scale(.5),c=l.getController();
      c.setFirstPerson(true);c.cameraYaw=Math.atan2(-(p.x-c.collider.position.x),-(p.z-c.collider.position.z));
      c.cameraPitch=Math.atan2(c.collider.position.y+c.options.firstPersonHeadHeight-p.y,Math.hypot(p.x-c.collider.position.x,p.z-c.collider.position.z));c.updateCamera(1);
    },{tag,kind,position});
    await page.waitForTimeout(400);
    return page.evaluate(async({tag,kind})=>{
      const {runtimePlacementBounds}=await import("/src/RuntimePlacementAudit.js");
      const l=window.storyProbe.lifecycle,entry=l.scene.meshes.find(m=>m.metadata?.[kind]?.objectTag===tag)?.metadata[kind];
      const b=runtimePlacementBounds(entry.root),p=b.min.add(b.max).scale(.5),rect=l.engine.getRenderingCanvas().getBoundingClientRect();
      const v=l.scene.activeCamera.getViewMatrix(true).multiply(l.scene.activeCamera.getProjectionMatrix(true));
      const s=p.constructor.Project(p,v.constructor.Identity(),v,l.scene.activeCamera.viewport.toGlobal(l.engine.getRenderWidth(),l.engine.getRenderHeight()));
      const pick=l.scene.pick(s.x*rect.width/l.engine.getRenderWidth(),s.y*rect.height/l.engine.getRenderHeight(),m=>window.storyProbe.interactions.isInteractiveMesh(m),false,l.scene.activeCamera);
      return {x:rect.x+s.x*rect.width/l.engine.getRenderWidth(),y:rect.y+s.y*rect.height/l.engine.getRenderHeight(),target:p.asArray(),player:l.getController().collider.position.asArray(),handle:!!entry.handleNode,container:entry.root._runtimeContainerObjectTag,state:entry.state,
        pickedDrawer:pick?.pickedMesh?.metadata?.interactiveDrawer?.objectTag,pickedInspectable:pick?.pickedMesh?.metadata?.interactiveInspectable?.objectTag};
    },{tag,kind});
  };
  const click=async(...args)=>{const p=await point(...args);await page.mouse.click(p.x,p.y);return p;};
  await travel("interior");
  const drawer=await point("IWWH","interactiveDrawer",[.5,0,-.49]);console.info("Iwao drawer pick",drawer);
  expect(drawer.pickedDrawer).toBe("IWWH");
  if(drawer.state==="closed")await page.mouse.click(drawer.x,drawer.y);
  await page.waitForFunction(()=>window.storyProbe.lifecycle.scene.meshes.find(m=>m.metadata?.interactiveDrawer?.objectTag==="IWWH")?.metadata.interactiveDrawer.state==="open");
  const casePoint=await point("ihko","interactiveInspectable",[.5,0,-.49]);expect(casePoint.container).toBe("IWWH");
  const begin=async(tag,position)=>{
    await click(tag,"interactiveInspectable",position);
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:15_000});await noErrors();
    await page.keyboard.press("Space");
  };
  await begin("ihko",[.5,0,-.49]);await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
  expect((await saved()).inventory.some(i=>i.key==="mysterious_key")).toBe(false);
  for(const pickup of [{tag:"ihko",position:[.5,0,-.49],choice:"Open the gray case",scene:"s1.jomo.iwao-key",item:"mysterious_key",flag:"notebook.s1.mysterious-key"},
    {tag:"KHKS",position:[9.2,1.05,-24.5],choice:"Unlock the sword case",scene:"s1.jhd0.sword-case",item:"dojo_sword",flag:"notebook.s1.dojo-sword"}]){
    if(pickup.item==="dojo_sword")await travel("exterior");
    await begin(pickup.tag,pickup.position);await page.getByRole("button",{name:pickup.choice,exact:true}).click();
    await page.waitForFunction(scene=>window.storyProbe.authoredScene?.active?.scene.id===scene||window.storyProbe.sceneErrors.length,pickup.scene,{timeout:20_000});await noErrors();
    await page.waitForTimeout(1200);await page.screenshot({path:testInfo.outputPath(`${pickup.item}-inspection.png`)});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-quest-pickup"));await idle();
    expect((await saved()).inventory.some(i=>i.key===pickup.item)).toBe(false);
    await begin(pickup.tag,pickup.position);await page.getByRole("button",{name:pickup.choice,exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active&&window.storyProbe.authoredScene?.active,null,{timeout:20_000});
    await page.keyboard.press("Space");
    await expect.poll(async()=>(await saved()).character.storyFlags[pickup.flag]).toBe(true);await idle();await noErrors();
    expect((await saved()).inventory.filter(i=>i.key===pickup.item)).toMatchObject([{quantity:1,category:"key_item",usable:false}]);
  }
  const after=await saved();expect(after.character.yen).toBe(character.yen);expect(after.character.currentHp).toBe(character.currentHp);
  expect(after.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);
  await page.locator("#inventory-button").click();const dialog=page.getByRole("dialog",{name:"Inventory",exact:true});
  await expect(dialog.getByText("Mysterious Key",{exact:true})).toBeVisible();await expect(dialog.getByText("Hazuki Sword",{exact:true})).toBeVisible();
  await expect(dialog.getByRole("img",{name:"Hazuki Sword",exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("dojo-owned-quest-items.png")});await dialog.getByRole("button",{name:"Close inventory"}).click();
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await idle();await noErrors();
  for(const item of ["mysterious_key","dojo_sword"])expect((await saved()).inventory.filter(i=>i.key===item)).toMatchObject([{quantity:1}]);
  await click("KHKS","interactiveInspectable",[9.2,1.05,-24.5]);await page.waitForTimeout(800);await idle();
  expect((await saved()).inventory.filter(i=>i.key==="dojo_sword")).toMatchObject([{quantity:1}]);
}

export async function verifyHandguardFamily(page,testInfo,character){
  expect(character.storyFlags["story.s1.gui-zhang-street.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.ine-family-crest.completed"]).not.toBe(true);
  const saved=async()=>{
    const url=`/api/characters/${character.id}/state`,response=await page.request.get(url);
    const body=await response.text(),contentType=response.headers()["content-type"]||"missing Content-Type";
    const diagnostic=`GET ${url}: HTTP ${response.status()} ${response.statusText()}; ${contentType}; body ${JSON.stringify(body.slice(0,800))}`;
    expect(response.ok(),diagnostic).toBe(true);
    expect(contentType,diagnostic).toMatch(/^application\/json(?:;|$)/i);
    try{return JSON.parse(body);}
    catch(error){throw new Error(`Invalid character-state JSON: ${diagnostic}`,{cause:error});}
  };
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const enter=async()=>{
    await page.evaluate(async()=>window.storyProbe.lifecycle.travelToWorld("interior"));
    await expect(page.locator("#loading")).toBeHidden({timeout:90_000});
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.jomo.fuku-handguard-home"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();
  };
  if(!character.storyFlags["story.s1.fuku-handguard-home.completed"]){
  if(character.worldId!=="interior")await enter();
  else await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.jomo.fuku-handguard-home"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:20_000});
  await page.screenshot({path:testInfo.outputPath("handguard-fuku-referral.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-handguard-referral"));await idle();
  expect((await saved()).character.storyFlags["notebook.s1.ine-handguard"]).not.toBe(true);
  await page.evaluate(async()=>window.storyProbe.lifecycle.travelToWorld("exterior"));await expect(page.locator("#loading")).toBeHidden({timeout:90_000});
  await enter();
  for(let i=0;i<20;i++){
    if((await saved()).character.storyFlags["notebook.s1.ine-handguard"])break;
    await page.keyboard.press("Space");await page.waitForTimeout(300);
  }
  await expect.poll(async()=>(await saved()).character.storyFlags["notebook.s1.ine-handguard"]).toBe(true);await idle();await noErrors();
  }
  const altarDoor=jomoPlacements.placements.find(p=>p.runtime?.staticDoorIndex===4);
  const approach=async()=>{
    // Approach the original south altar-room door from the supported hallway,
    // click its real picker, then enter with ordinary input/collision.
    const opening=await page.evaluate(placement=>{
      const l=window.storyProbe.lifecycle,d=l.doorInteractions.entries.find(e=>e.root._filename===placement.model&&e.root.position.equalsWithEpsilon(l.vectorFromArray(placement.position),.001));
      if(!d)throw Error("Original south altar-room door is missing");
      const n=d.nodes[0],b=n.getHierarchyBoundingVectors(true),p=b.min.add(b.max).scale(.5);
      p.subtractInPlace(n.getAbsolutePosition().subtract(d.collisionBindPositions[0]));
      return [p.x,0,p.z+1.3];
    },altarDoor);
    await page.evaluate(position=>{
      const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray(position),Math.PI,{persist:false});
      const c=l.getController();c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);
    },opening);
    await page.waitForTimeout(400);
    const doorPoint=await page.evaluate(placement=>{
      const l=window.storyProbe.lifecycle,d=l.doorInteractions.entries.find(e=>e.root._filename===placement.model&&e.root.position.equalsWithEpsilon(l.vectorFromArray(placement.position),.001));
      if(!d)throw Error("Original south altar-room door is missing");
      const b=d.root.getHierarchyBoundingVectors(true),p=b.min.add(b.max).scale(.5),c=l.getController();
      c.cameraYaw=Math.atan2(-(p.x-c.collider.position.x),-(p.z-c.collider.position.z));
      c.cameraPitch=Math.atan2(c.collider.position.y+c.options.firstPersonHeadHeight-p.y,Math.hypot(p.x-c.collider.position.x,p.z-c.collider.position.z));c.updateCamera(1);
      const rect=l.engine.getRenderingCanvas().getBoundingClientRect(),v=l.scene.activeCamera.getViewMatrix(true).multiply(l.scene.activeCamera.getProjectionMatrix(true));
      const s=p.constructor.Project(p,v.constructor.Identity(),v,l.scene.activeCamera.viewport.toGlobal(l.engine.getRenderWidth(),l.engine.getRenderHeight()));
      return {state:d.state,x:rect.x+s.x*rect.width/l.engine.getRenderWidth(),y:rect.y+s.y*rect.height/l.engine.getRenderHeight()};
    },altarDoor);
    if(doorPoint.state==="closed")await page.mouse.click(doorPoint.x,doorPoint.y);
    await page.waitForFunction(placement=>{const l=window.storyProbe.lifecycle;return l.doorInteractions.entries.find(e=>e.root._filename===placement.model&&e.root.position.equalsWithEpsilon(l.vectorFromArray(placement.position),.001))?.state==="open";},altarDoor);
    // Picking aims at the movable door panel, not the now-open doorway.
    // Restore the hallway walking heading before continuing through it.
    await page.evaluate(placement=>{
      const l=window.storyProbe.lifecycle,d=l.doorInteractions.entries.find(e=>e.root._filename===placement.model&&e.root.position.equalsWithEpsilon(l.vectorFromArray(placement.position),.001));
      const n=d.nodes[0],b=n.getHierarchyBoundingVectors(true),offset=n.getAbsolutePosition().subtract(d.collisionBindPositions[0]);
      // Aim through the vacated strip, not the closed leaf's center: sliding
      // leaves overlap when open, and the player cylinder needs both margins.
      if(Math.abs(offset.x)<.1)throw Error("Altar door has no horizontal opening");
      const oldMin=b.min.x-offset.x,oldMax=b.max.x-offset.x;
      const x=offset.x>0?(oldMin+Math.min(oldMax,b.min.x))/2:(Math.max(oldMin,b.max.x)+oldMax)/2;
      const z=(b.min.z+b.max.z)/2;
      l.resetPlayer(l.vectorFromArray([x,0,z+1.3]),Math.PI,{persist:false});l.getController().setFirstPerson(false);
    },altarDoor);
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-ine-family-crest"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});}
    finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  testInfo.setTimeout(Math.max(testInfo.timeout,360_000));
  const skip=process.env.NEW_YOKOSUKA_HANDGUARD_FAMILY_SKIP_E2E==="true";
  const done="story.s1.ine-family-crest.completed",notebook="notebook.s1.hazuki-family-crest";
  const beforeCrest=await saved(),samples=[];
  const walkOutside=async()=>{
    const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyS");
    try{await page.waitForTimeout(500);}finally{await page.keyboard.up("KeyS");}
    const moved=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
    expect(Math.hypot(moved[0]-position[0],moved[2]-position[2])).toBeGreaterThan(.2);
    expect(moved[0]<-6||moved[0]>-2.5||moved[2]<-3||moved[2]>1).toBe(true);
    // Reload outside the unfinished trigger, otherwise entering the saved
    // region may correctly launch a fresh attempt before the test approaches.
    await page.waitForTimeout(700);
  };
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await idle();await noErrors();
  };
  const clean=async()=>{
    await idle();await noErrors();
    const state=await page.evaluate(()=>{
      const p=window.storyProbe,r=window.handguardFamilyRuntime,l=p.lifecycle;
      const root=r?.attachedObjects?.objects.get("TUBA")?.root;
      return {active:!!r?.active,attachments:!!r?.attachedObjects?.active,hands:!!r?.presentation?.hands?.active,
        propReleased:!root||root.isDisposed()||!root.isEnabled(),
        visibleProps:l.scene.meshes.filter(m=>m.metadata?.nativeAseqAttachedObject==="TUBA"&&m.isEnabled()).length,
        firstPerson:l.getController().firstPerson};
    });
    expect(state).toEqual({active:false,attachments:false,hands:false,propReleased:true,visibleProps:0,firstPerson:false});
  };
  const sample=async(frame,owner,controlId,name,visible=true)=>{
    // Wait for the original clock. No seek, frozen animation, diagnostic camera
    // or altered prop placement is used for these gameplay screenshots.
    await page.waitForFunction(frame=>{
      const p=window.storyProbe;
      return p.sceneErrors.length||p.director?.activeCutscene?.packageRuntime.activityRuntime.active?.currentFrame>=frame;
    },frame,{timeout:60_000});await noErrors();
    const state=await page.evaluate(()=>{
      const p=window.storyProbe,r=p.director.activeCutscene.packageRuntime,l=p.lifecycle;
      window.handguardFamilyRuntime=r;
      const a=r.attachedObjects,record=a?.objects.get("TUBA"),root=record?.root;
      if(!root)throw Error("The family-crest package did not load the original handguard");
      const selected=a.active.bindings.filter(b=>b.actorTag==="TUBA"&&b.frame<=a.active.frame).sort((x,y)=>y.frame-x.frame)[0];
      const parentTag=["AKIR","INE_"].find(tag=>r.actors.activeActor(tag)?.model.renderRoot===root.parent)||null;
      const meshes=root.getChildMeshes(false).filter(m=>m.getTotalVertices()>0);
      const textures=new Set(meshes.flatMap(m=>m.material?.getActiveTextures?.()||[]));
      const b=root.getHierarchyBoundingVectors(true),v=l.scene.activeCamera.getViewMatrix(true).multiply(l.scene.activeCamera.getProjectionMatrix(true));
      const viewport=l.scene.activeCamera.viewport.toGlobal(l.engine.getRenderWidth(),l.engine.getRenderHeight());
      const points=[];
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])
        points.push(b.min.constructor.Project(l.vectorFromArray([x,y,z]),v.constructor.Identity(),v,viewport));
      const round=value=>Number(value.toFixed(4));
      return {frame:a.active.frame,action:selected?.action,owner:selected?.parentActorTag,controlId:selected?.controlId,parentTag,
        enabled:root.isEnabled(),activeMeshes:meshes.filter(m=>m.isEnabled()&&m.isVisible&&l.scene.isActiveMesh(m)).length,
        meshCount:meshes.length,vertexCount:meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0),
        textureCount:textures.size,readyTextures:[...textures].filter(t=>t.isReady()).length,
        worldPosition:root.getAbsolutePosition().asArray().map(round),worldBounds:[b.min.asArray().map(round),b.max.asArray().map(round)],
        screenBounds:[Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))].map(round),
        screenDepth:[Math.min(...points.map(p=>p.z)),Math.max(...points.map(p=>p.z))].map(round),
        viewport:[l.engine.getRenderWidth(),l.engine.getRenderHeight()],
        handActors:[...(r.presentation.hands?.active?.hands.keys()||[])].sort()};
    });
    samples.push({name,...state});
    await testInfo.attach(`handguard-crest-${name}-state`,{body:JSON.stringify(state,null,2),contentType:"application/json"});
    // Capture before assertions so a regression retains the actual failed view.
    await page.screenshot({path:testInfo.outputPath(`handguard-crest-${name}.png`)});
    expect(state.frame).toBeGreaterThanOrEqual(frame);
    expect(state.handActors).toEqual(["AKIR","INE_"]);
    expect(state.meshCount).toBeGreaterThan(0);expect(state.vertexCount).toBeGreaterThan(0);
    expect(state.textureCount).toBeGreaterThan(0);expect(state.readyTextures).toBe(state.textureCount);
    if(owner==="world"){
      expect(state.action).toBe("detach");expect(state.parentTag).toBe(null);expect(state.enabled).toBe(true);
      // This validates the documented standalone-pose interpretation. The
      // original additive-vector/FIXO restore semantics remain an approximation.
      for(const [index,value]of [-4.8504,.3408,.3143].entries())expect(state.worldPosition[index]).toBeCloseTo(value,3);
    }else if(owner){
      expect(state.action).toBe("attach");expect(state.owner).toBe(owner);expect(state.controlId).toBe(controlId);
      expect(state.parentTag).toBe(owner);expect(state.enabled).toBe(visible);
    }else{
      expect(state.action).toBe("detach");expect(state.enabled).toBe(false);
    }
    // Projection and active-mesh counts are bounded diagnostics, not proof of
    // visible pixels. Review the corresponding unmodified rendered screenshot.
    return state;
  };
  await approach();
  await sample(250,"AKIR",18,"cancel-attempt-ryo");
  await sample(650,"INE_",12,"cancel-attempt-ine");
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-family-crest"));await clean();
  let state=await saved();
  expect(state.character.storyFlags[done]).not.toBe(true);expect(state.character.storyFlags[notebook]).not.toBe(true);
  expect(state.inventory).toEqual(beforeCrest.inventory);
  await walkOutside();await reload();
  state=await saved();expect(state.character.storyFlags[done]).not.toBe(true);expect(state.character.storyFlags[notebook]).not.toBe(true);
  await approach();
  if(skip){
    await sample(650,"INE_",12,"before-explicit-skip");
    await page.keyboard.press("KeyX");
  }else{
    for(const [frame,owner,controlId,name,visible]of [
      [250,"AKIR",18,"ryo-offer"],[350,"world",null,"table-rest"],[416,"INE_",18,"ine-right-hand"],
      [450,"INE_",18,"ine-between-grips",false],[650,"INE_",12,"ine-left-hand"],
      [940,"AKIR",18,"ryo-return"],[1140,"AKIR",18,"ryo-adjusted-grip"],[1450,null,null,"released"],
    ])await sample(frame,owner,controlId,name,visible);
  }
  await expect.poll(async()=>(await saved()).character.storyFlags[notebook],{timeout:65_000,intervals:[1000]}).toBe(true);
  await clean();const after=await saved();
  expect(after.character.storyFlags[done]).toBe(true);
  expect(after.character.worldId).toBe("interior");expect(after.character.avatarId).toBe("ryo");
  expect(after.character.yen).toBe(character.yen);expect(after.character.currentHp).toBe(character.currentHp);
  expect(after.inventory).toEqual(beforeCrest.inventory);
  expect(after.inventory.filter(i=>i.key==="sword_handguard")).toMatchObject([{quantity:1}]);
  expect(after.inventory.some(i=>i.key==="phoenix_mirror")).toBe(false);
  await walkOutside();
  await testInfo.attach("handguard-crest-render-evidence",{body:JSON.stringify({mode:skip?"explicit-skip":"natural",samples},null,2),contentType:"application/json"});
  await reload();
  expect((await saved()).character.storyFlags[done]).toBe(true);
  expect((await saved()).character.storyFlags[notebook]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.director?.activeCutscene||window.storyProbe.authoredScene?.active)).toBeFalsy();
}

export async function verifyGuiZhangEncounter(page,testInfo,character){
  expect(character.storyFlags["story.s1.bunkado-handguard.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.gui-zhang-street.completed"]).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  await page.evaluate(async()=>window.storyProbe.lifecycle.travelToWorld("sakuragaoka"));
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});
  const approach=async()=>{
    // Shorten walking to the source-backed street approach, not the outcome.
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([7.76,0,18.7]),0,{persist:false});l.getController().setFirstPerson(false);});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-gui-zhang-introduction"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});}
    finally{await page.keyboard.up("KeyW");}
    await noErrors();
  };
  const combatReady=async()=>{await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready||window.storyProbe.sceneErrors.length,null,{timeout:75_000});await noErrors();};
  await approach();await page.waitForTimeout(2500);
  await page.screenshot({path:testInfo.outputPath("gui-zhang-original-introduction.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-gui-introduction"));await idle();
  expect((await saved()).character.storyFlags["notebook.s1.gui-zhang-bodyguard"]).not.toBe(true);
  await approach();await combatReady();
  expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.id)).toBe("s1.jd00.gui-zhang-first");
  expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.definition.actorDefinitions[0].modelCode)).toBe("KIS_M");
  await page.waitForTimeout(2000);
  const target=await page.evaluate(()=>{const o=window.storyProbe.combatRuntime.active;return o.indicator.projectTargets([o.encounter.selectedEnemy])[0];});
  expect(target.visible).toBe(true);expect(target.screenX).toBeGreaterThan(.22);expect(target.screenX).toBeLessThan(.8);
  await page.screenshot({path:testInfo.outputPath("gui-zhang-combat-ready.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-gui-combat"));await idle();
  expect((await saved()).character.storyFlags["story.s1.gui-zhang-street.completed"]).not.toBe(true);
  await approach();
  // The preceding attempt proved natural introduction-to-combat handoff.
  // Explicit movie skip on retry must still require the real timed encounter.
  await page.keyboard.press("KeyX");await combatReady();
  await page.locator("#renderCanvas").focus();
  const bindings=await page.evaluate(()=>window.storyProbe.combatRuntime.active.input.getBindings());
  await page.keyboard.down(bindings.guard);
  try{
    for(let i=0;i<70&&await page.evaluate(()=>!!window.storyProbe.combatRuntime?.active);i++){
      await page.keyboard.press(bindings.leg);await page.waitForTimeout(500);
    }
  }finally{await page.keyboard.up(bindings.guard);}
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-gui-zhang-bodyguard"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();
  expect(await page.evaluate(()=>window.storyProbe.combatInputs.some(i=>i.action==="leg"))).toBe(true);
  expect((await saved()).character.storyFlags["notebook.s1.gui-zhang-bodyguard"]).not.toBe(true);
  await page.waitForTimeout(9000);await page.screenshot({path:testInfo.outputPath("gui-zhang-bodyguard-explanation.png")});
  await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
    .some(r=>r.kind==="voice"&&r.command.audio.voiceId==="A0167C001"&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:75_000});
  await page.screenshot({path:testInfo.outputPath("gui-zhang-chai-rooftop.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags["notebook.s1.gui-zhang-bodyguard"],{timeout:30_000,intervals:[1000]}).toBe(true);
  await idle();await noErrors();
  const after=await saved();
  expect(after.character.worldId).toBe("sakuragaoka");expect(after.character.avatarId).toBe("ryo");
  expect(after.character.yen).toBe(character.yen);expect(after.character.currentHp).toBe(character.currentHp);
  expect(after.inventory.filter(i=>i.key==="sword_handguard")).toMatchObject([{quantity:1}]);
  expect(after.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().firstPerson)).toBe(false);
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");await page.waitForTimeout(500);await page.keyboard.up("KeyW");
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await idle();await noErrors();
  expect((await saved()).character.storyFlags["story.s1.gui-zhang-street.completed"]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.director?.activeCutscene)).toBeFalsy();
}

export async function verifyBunkadoHandguard(page,testInfo,character,enterInteriorDoor){
  expect(character.storyFlags["story.s1.family-mirror-lead.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.bunkado-handguard.completed"]).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  // Direct-table dispatchValue 25 is a script argument, NOT physical door 25
  // (Asia Travel). The exact DKTY return to D000 Entry 7 binds physical door 35.
  const doorstep=nativeMapTransitions.interiorReturnTransitions.find(t=>t.id==="dkty-door-to-d000-entry-7").destination.browserSpawn;
  const enter=()=>enterInteriorDoor(page,{world:"dkty",filename:"S1_D000_DR15_011.MT5",doorSelector:35,position:doorstep.position,yaw:doorstep.yawRadians});
  const scene=async(part="arrival")=>{
    await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-bunkado-handguard-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:75_000});
    await noErrors();
  };
  // A saved, unfinished shop arrival already starts its automatic event.
  // Do not force test travel while that legitimate preparation is in flight.
  if(character.worldId!=="dkty")await enter();
  await scene();await page.waitForTimeout(3000);
  await page.screenshot({path:testInfo.outputPath("handguard-original-arrival.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-handguard"));
  await idle();expect((await saved()).inventory.some(i=>i.key==="sword_handguard")).toBe(false);
  await enter();await scene();
  await page.waitForTimeout(70_000);await noErrors();
  await page.screenshot({path:testInfo.outputPath("handguard-original-handover.png")});
  expect((await saved()).inventory.some(i=>i.key==="sword_handguard")).toBe(false);
  await scene("remembrance");await page.waitForTimeout(4500);
  await page.screenshot({path:testInfo.outputPath("handguard-original-remembrance.png")});
  await scene("phoenix-question");await page.waitForTimeout(6500);
  await page.screenshot({path:testInfo.outputPath("handguard-original-phoenix-question.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags["notebook.s1.sword-handguard"],{timeout:60_000,intervals:[1000]}).toBe(true);
  await idle();await noErrors();
  let after=await saved();
  expect(after.inventory.filter(i=>i.key==="sword_handguard")).toMatchObject([{quantity:1,category:"key_item",usable:false}]);
  expect(after.character.worldId).toBe("dkty");expect(after.character.avatarId).toBe("ryo");
  expect(after.character.yen).toBe(character.yen);expect(after.character.currentHp).toBe(character.currentHp);
  expect(after.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);
  await page.locator("#inventory-button").click();
  const dialog=page.getByRole("dialog",{name:"Inventory",exact:true});
  await expect(dialog.getByText("Sword Handguard",{exact:true})).toBeVisible();
  await expect(dialog.getByRole("img",{name:"Sword Handguard",exact:true})).toBeVisible();
  await expect(dialog.getByText("Chinese Letter",{exact:true})).toBeVisible();
  const bounds=await dialog.boundingBox();
  for(const name of ["Sword Handguard","Chinese Letter"]){
    const label=await dialog.getByText(name,{exact:true}).boundingBox();
    expect(label.y+label.height).toBeLessThan(bounds.y+bounds.height);
  }
  await expect(dialog.getByText("Phoenix Mirror",{exact:true})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("handguard-owned-inventory.png")});
  await dialog.getByRole("button",{name:"Close inventory"}).click();
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");await page.waitForTimeout(600);await page.keyboard.up("KeyW");
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await idle();await noErrors();
  after=await saved();expect(after.inventory.filter(i=>i.key==="sword_handguard")).toMatchObject([{quantity:1}]);
  expect(await page.evaluate(()=>window.storyProbe.director?.activeCutscene)).toBeFalsy();
}

export async function verifyFamilyMirrorLead(page,testInfo,character,residentClickPoint){
  expect(character.storyFlags["story.s1.master-chen.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.family-mirror-lead.completed"]).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  };
  // Exercise an ordinary click on the actual home NPC, not a scripted trigger
  // injected from the test. The clue remains optional for the courtyard event.
  await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("INE_"),null,{timeout:30_000});
  const point=await residentClickPoint(page,"INE_");
  await page.mouse.click(point.x,point.y);
  await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:15_000});
  await noErrors();
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:15_000});
  await page.screenshot({path:testInfo.outputPath("mirror-search-ine-hint.png")});
  for(let i=0;i<15;i++){
    if((await saved()).character.storyFlags["notebook.s1.fuku-looking"])break;
    await page.keyboard.press("Space");await page.waitForTimeout(300);
  }
  await expect.poll(async()=>(await saved()).character.storyFlags["notebook.s1.fuku-looking"]).toBe(true);
  await idle();
  await page.evaluate(async()=>window.storyProbe.lifecycle.travelToWorld("exterior"));
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});
  const approach=async()=>{
    // Nearby positioning isolates the earned approach, not a story outcome.
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([-3.1,0,-20.5]),Math.PI,{persist:false});l.getController().setFirstPerson(false);});
    await page.waitForTimeout(300);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-family-fuku-approach"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});
    }finally{await page.keyboard.up("KeyW");}
    await noErrors();
  };
  await approach();await page.waitForTimeout(1200);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-family"));
  await idle();expect((await saved()).character.storyFlags["notebook.s1.antique-shop-lead"]).not.toBe(true);
  await approach();
  for(const [part,sampleMs] of [["family-fuku-approach",2500],["family-fuku-conversation",9000],["family-ine-conversation",25_000]]){
    await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:90_000});
    await noErrors();await page.waitForTimeout(sampleMs);
    await page.screenshot({path:testInfo.outputPath(`mirror-search-${part}.png`)});
    expect((await saved()).character.storyFlags["notebook.s1.antique-shop-lead"]).not.toBe(true);
  }
  await expect.poll(async()=>(await saved()).character.storyFlags["notebook.s1.antique-shop-lead"],{timeout:100_000,intervals:[1000]}).toBe(true);
  await idle();await noErrors();
  const after=await saved();
  expect(after.character.worldId).toBe("exterior");
  expect(after.character.avatarId).toBe("ryo");
  expect(after.character.yen).toBe(character.yen);
  expect(after.character.currentHp).toBe(character.currentHp);
  expect(after.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);
  // Ordinary control must move Ryo after the last cinematic cleans up.
  const before=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");await page.waitForTimeout(500);await page.keyboard.up("KeyW");
  const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
  expect(Math.hypot(position[0]-before[0],position[2]-before[2])).toBeGreaterThan(.2);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});
  await idle();await noErrors();
  expect((await saved()).character.storyFlags["notebook.s1.antique-shop-lead"]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.director?.activeCutscene)).toBeFalsy();
}

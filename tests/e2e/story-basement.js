import {expect} from "@playwright/test";

// Continue the earned descent save through real mouse picks and the normal
// WebSocket/Yarn transaction. Resetting the test pose shortens walking only;
// no future flag, reward, controller outcome or runtime event is fabricated.
export async function verifyBasementMirrorSearch(page, testInfo, character) {
  const saved = () => page.request.get(`/api/characters/${character.id}/state`).then(r => r.json());
  const before = await saved();
  expect(before.character.worldId).toBe("ydb1");
  expect(before.character.storyFlags["story.s1.basement-visited"]).toBe(true);
  expect(before.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);
  const noErrors = async () => expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  const idle = async () => {
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await noErrors();
  };
  const objectState = tag => page.evaluate(tag => {
    const root = window.storyProbe.lifecycle.scene.meshes.find(m => m.metadata?.runtimeObject?.objectTag === tag)?.metadata.runtimeObject.root;
    if (!root) throw Error(`Missing basement prop ${tag}`);
    return {enabled: root.isEnabled(false), position: root.position.asArray()};
  }, tag);
  expect((await objectState("HOKY")).enabled).toBe(false);
  expect((await objectState("KABE")).enabled).toBe(false);
  const shelfBefore = await objectState("SHEF");
  const shelfBase = [...shelfBefore.position];
  if (before.character.storyFlags["story.s1.basement-shelf.completed"]) shelfBase[2] -= 1.9;
  await page.evaluate(()=>{
    const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-2,0,6]),0,{persist:false});
    c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);
  });
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{await page.waitForFunction(()=>window.storyProbe.lifecycle.getController().collider.position.z<4.9,null,{timeout:8000});}
  finally{await page.keyboard.up("KeyW");}
  expect(await page.evaluate(()=>Math.abs(window.storyProbe.lifecycle.getController().collider.position.y))).toBeLessThan(.1);
  const click = async (tag, position, surfacePoint) => {
    const point = await page.evaluate(async ({tag, position, surfacePoint}) => {
      const {runtimePlacementBounds} = await import("/src/RuntimePlacementAudit.js");
      const l = window.storyProbe.lifecycle, c = l.getController();
      l.resetPlayer(l.vectorFromArray(position), 0, {persist: false});
      let p;
      if (surfacePoint) p = l.vectorFromArray(surfacePoint);
      else {
        const entry = l.scene.meshes.find(m => m.metadata?.interactiveInspectable?.objectTag === tag)?.metadata.interactiveInspectable;
        if (!entry || !entry.root.isEnabled()) throw Error(`Missing visible basement target ${tag}`);
        const b = runtimePlacementBounds(entry.root); p = b.min.add(b.max).scale(.5);
        // A thin axe's bounding-box center is empty air between its blade and
        // handle. Aim at actual triangle geometry, not an imaginary box hit.
        const candidates=[];
        for(const mesh of entry.root.getChildMeshes()) {
          const vertices=mesh.getVerticesData("position"),indices=mesh.getIndices();
          if(!vertices||!indices)continue;
          for(let i=0;i<indices.length&&candidates.length<100;i+=3){
            const v=l.vectorFromArray([0,0,0]);
            for(let j=0;j<3;j++)v.addInPlace(l.vectorFromArray(Array.from(vertices.slice(indices[i+j]*3,indices[i+j]*3+3))));
            candidates.push(v.constructor.TransformCoordinates(v.scale(1/3),mesh.computeWorldMatrix(true)));
          }
        }
        c.setFirstPerson(true);
        p=candidates.find(target=>{
          c.cameraYaw=Math.atan2(-(target.x-c.collider.position.x),-(target.z-c.collider.position.z));
          c.cameraPitch=Math.atan2(c.collider.position.y+c.options.firstPersonHeadHeight-target.y,Math.hypot(target.x-c.collider.position.x,target.z-c.collider.position.z));c.updateCamera(1);
          const pick=l.scene.pick(l.engine.getRenderWidth()/2,l.engine.getRenderHeight()/2,m=>window.storyProbe.interactions.isInteractiveMesh(m),false,l.scene.activeCamera);
          return pick?.pickedMesh?.metadata?.interactiveInspectable?.objectTag===tag;
        });
        if(!p)throw Error(`No unobstructed real triangle for basement prop ${tag}`);
      }
      c.setFirstPerson(true);
      c.cameraYaw = Math.atan2(-(p.x - c.collider.position.x), -(p.z - c.collider.position.z));
      c.cameraPitch = Math.atan2(c.collider.position.y + c.options.firstPersonHeadHeight - p.y, Math.hypot(p.x - c.collider.position.x, p.z - c.collider.position.z));
      c.updateCamera(1);
      const rect = l.engine.getRenderingCanvas().getBoundingClientRect();
      const v = l.scene.activeCamera.getViewMatrix(true).multiply(l.scene.activeCamera.getProjectionMatrix(true));
      const s = p.constructor.Project(p, v.constructor.Identity(), v, l.scene.activeCamera.viewport.toGlobal(l.engine.getRenderWidth(), l.engine.getRenderHeight()));
      return {x: rect.x + s.x * rect.width / l.engine.getRenderWidth(), y: rect.y + s.y * rect.height / l.engine.getRenderHeight()};
    }, {tag, position, surfacePoint});
    await page.waitForTimeout(350);
    const actualPick=await page.evaluate(({point,tag})=>{
      const d=window.storyProbe.interactions,l=window.storyProbe.lifecycle,rect=l.engine.getRenderingCanvas().getBoundingClientRect();
      const pick=l.scene.pick(point.x-rect.x,point.y-rect.y,m=>d.isInteractiveMesh(m),false,l.scene.activeCamera);
      const all=l.scene.pick(point.x-rect.x,point.y-rect.y,undefined,false,l.scene.activeCamera);
      const root=l.scene.meshes.find(m=>m.metadata?.runtimeObject?.objectTag===tag)?.metadata.runtimeObject.root;
      return {tag,screen:point,player:l.getController().collider.position.asArray(),picked:pick?.pickedMesh?.name,pickedTag:pick?.pickedMesh?.metadata?.interactiveInspectable?.objectTag,surface:d.storyObjects.pickSurface(pick)?.objectTag,point:pick?.pickedPoint?.asArray(),visibleHit:all?.pickedMesh?.name,root:root?.position.asArray(),childNames:root?.getChildMeshes().slice(0,3).map(m=>m.name)};
    },{point,tag});
    expect(actualPick.pickedTag||actualPick.surface).toBe(tag);
    console.info("Basement pick",tag,actualPick.pickedTag||actualPick.surface);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.storyProbe.dialogue?.active || window.storyProbe.sceneErrors.length, null, {timeout: 15_000});
    await noErrors();
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("line");
    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.storyProbe.regions.controller.status === "options");
  };
  const steps = [
    {tag:"FLOR", flag:"story.s1.basement-floor.completed", scene:"s1.ydb1.floor", choice:"Examine the floor", position:[-5.6,0,3.1], point:[-6.1,0,2]},
    {tag:"SHEF", flag:"story.s1.basement-shelf.completed", scene:"s1.ydb1.shelf", choice:"Pull the shelf aside", position:[-5.7,0,2.8]},
    {tag:"AXE_", flag:"story.s1.basement-axe.completed", scene:"s1.ydb1.axe", choice:"Take the axe", position:[-3.5,0,4.1]},
    {tag:"WALL", flag:"story.s1.basement-wall.completed", scene:"s1.ydb1.wall", choice:"Break it open with the axe", position:[-6.2,0,2], point:[-8,.8,2]},
    {tag:"HOKY", flag:"story.s1.phoenix-mirror.completed", scene:"s1.ydb1.mirror", choice:"Take the Phoenix Mirror", position:[-6.2,0,2.2]},
  ];
  for (const step of steps) {
    const previous = await saved();
    if (previous.character.storyFlags[step.flag]) continue;
    const unchanged = async () => {
      const state = await saved();
      expect(state.character.storyFlags[step.flag]).not.toBe(true);
      expect(state.inventory).toEqual(previous.inventory);
      expect(state.character.yen).toBe(before.character.yen);
    };
    await click(step.tag, step.position, step.point);
    await page.getByRole("button",{name:"Leave it for now",exact:true}).click();
    await idle(); await unchanged();
    await click(step.tag, step.position, step.point);
    await page.getByRole("button",{name:step.choice,exact:true}).click();
    await page.waitForFunction(id => window.storyProbe.authoredScene?.active?.scene.id === id || window.storyProbe.sceneErrors.length, step.scene);
    await noErrors();
    await page.waitForTimeout(800);
    await page.screenshot({path:testInfo.outputPath(`${step.tag}-original-presentation.png`)});
    await page.evaluate(() => window.storyProbe.regions.controller.cancel("basement-rendered-check"));
    await idle(); await unchanged();
    if (step.tag === "SHEF") expect(await objectState("SHEF")).toEqual(shelfBefore);
    if (step.tag === "AXE_") expect((await objectState("AXE_")).enabled).toBe(true);
    if (step.tag === "WALL") expect((await objectState("HOKY")).enabled).toBe(false);
    await click(step.tag, step.position, step.point);
    await page.getByRole("button",{name:step.choice,exact:true}).click();
    await page.waitForFunction(id=>window.storyProbe.authoredScene?.active?.scene.id===id||window.storyProbe.sceneErrors.length,step.scene);
    await page.waitForTimeout(step.tag==="HOKY"?10_000:step.tag==="AXE_"?5000:800);
    await page.screenshot({path:testInfo.outputPath(`${step.tag}-natural-presentation.png`)});
    await page.waitForFunction(() => window.storyProbe.regions.controller.status === "line" || window.storyProbe.sceneErrors.length, null, {timeout:45_000});
    await noErrors();
    // The original selected motion finishes before this receipt. It is not a
    // reward until the actual final line and scene-cleanup acknowledgement.
    await unchanged(); await page.keyboard.press("Space"); await idle();
    await expect.poll(async () => (await saved()).character.storyFlags[step.flag]).toBe(true);
  }
  const after = await saved();
  for (const key of ["basement_axe", "phoenix_mirror"]) {
    const item = after.inventory.find(item => item.key === key);
    expect(item?.quantity).toBe(1);
  }
  expect(after.character.storyFlags["notebook.s1.phoenix-mirror"]).toBe(true);
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.character.currentHp).toBe(before.character.currentHp);
  expect((await objectState("AXE_")).enabled).toBe(false);
  expect((await objectState("HOKY")).enabled).toBe(false);
  expect((await objectState("KABE")).enabled).toBe(true);
  expect((await objectState("SHEF")).position[2]).toBeCloseTo(shelfBase[2]+1.9,5);
  console.info("Basement cleanup UI",await page.evaluate(()=>{
    const button=document.querySelector("#inventory-button"),ancestors=[];
    for(let node=button;node;node=node.parentElement)if(node.getAttribute("aria-hidden"))ancestors.push({tag:node.tagName,id:node.id,hidden:node.getAttribute("aria-hidden")});
    return {dialogue:!!window.storyProbe.dialogue?.active,controller:window.storyProbe.regions.controller.status,ancestors};
  }));
  await page.locator("#inventory-button").click();
  await expect(page.getByRole("dialog").getByText("Phoenix Mirror",{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("mirror-saved-inventory.png")});
  await page.keyboard.press("Escape");
  await page.locator("#journal-button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("mirror-saved-notebook.png")});
  await page.keyboard.press("Escape");
  await page.reload(); await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(() => window.storyProbe.ready, null, {timeout:90_000});
  const reloaded = await saved(); expect(reloaded.inventory).toEqual(after.inventory);
  expect((await objectState("HOKY")).enabled).toBe(false);
  expect((await objectState("SHEF")).position).toEqual([shelfBase[0],shelfBase[1],shelfBase[2]+1.9]);
  await noErrors(); await page.screenshot({path:testInfo.outputPath("basement-mirror-saved-reload.png")});
}

import {expect} from '@playwright/test';
import fs from 'node:fs';

export async function verifySavedScrollLearning(page, testInfo, character, {moveId='twinBlades'}={}) {
  const catalog=JSON.parse(fs.readFileSync('play/data/story-move-learning.json'));
  const move=catalog.moves.find(move=>move.id===moveId);
  const regions=JSON.parse(fs.readFileSync('play/data/story-regions.json')).regions;
  const region=regions.find(region=>region.id===`s1.jomo.${move.slug}-scroll`);
  const flag=`story.s1.${move.slug}.learned`;
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(response=>response.json());
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  const mode=async(value,label)=>{
    await page.locator('[role="radio"]').filter({hasText:label}).click();
    await page.waitForFunction(value=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.playMode===value,value,{timeout:100_000});
    await idle();
  };
  if((await saved()).character.playMode!=='story')await mode('story','Story mode');
  const initial=await saved();
  expect(initial.character.storyFlags['notebook.s1.chinese-community']).toBe(true);
  expect(initial.inventory.some(item=>item.key===move.itemKey)).toBe(false);
  expect(initial.character.storyFlags[flag]).not.toBe(true);
  const slot=()=>page.getByText(`${move.name} Scroll`,{exact:true}).locator('..');
  // A pre-departure earned save offers sailing immediately. Decline through
  // its real UI before using the bounded test travel, as a player must do.
  if(initial.character.worldId==='mend'&&initial.character.storyFlags['story.s1.nozomi-amulet.completed']
    &&!initial.character.storyFlags['story.s1.departure.completed']){
    await page.getByRole('button',{name:'Not yet',exact:true}).click();await idle();
  }
  // Use the actual world, dispatch volume and Yarn choices. Resetting near the
  // authored room approach bounds test time without granting any Story state.
  if(initial.character.worldId!==region.worldId)await page.evaluate(async world=>window.storyProbe.lifecycle.travelToWorld(world),region.worldId);
  const inside=await page.evaluate(region=>{
    const position=window.storyProbe.lifecycle.getController().collider.position.asArray();
    return position.every((value,index)=>value>=region.min[index]&&value<=region.max[index]);
  },region);
  // Reloading a saved approach correctly offers its uncollected scroll again.
  if(!inside){
    await idle();
    await page.evaluate(region=>{
      const life=window.storyProbe.lifecycle;
      life.resetPlayer(life.vectorFromArray(region.min.map((value,index)=>(value+region.max[index])/2)),0,{persist:false});
    },region);
  }
  await page.waitForFunction(()=>window.storyProbe.regions.controller.status==='line');
  await page.keyboard.press('Space');
  await page.getByRole('button',{name:'Take the move scroll',exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.regions.controller.status==='line');
  expect((await saved()).inventory.some(item=>item.key===move.itemKey)).toBe(false);
  await page.keyboard.press('Space');await idle();
  const found=await saved();
  expect(found.inventory.find(item=>item.key===move.itemKey)?.quantity).toBe(1);
  expect(found.character.storyFlags[flag]).not.toBe(true);
  expect(found.character.yen).toBe(initial.character.yen);

  await page.locator('#inventory-button').click();
  await page.getByRole('button',{name:`Read ${move.name} Scroll`,exact:true}).click();
  await expect.poll(async()=>(await saved()).character.storyFlags[flag]).toBe(true);
  await expect(slot().getByText('Learned',{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('story-scroll-read-and-saved.png')});
  await page.getByRole('button',{name:'Close inventory',exact:true}).click();
  const learned=await saved();
  expect(learned.inventory).toEqual(found.inventory);
  expect(learned.character.yen).toBe(initial.character.yen);

  await mode('free_roam','Free roam');
  // The API omits empty maps in a fresh Free roam context.
  expect((await saved()).character.storyFlags?.[flag]).not.toBe(true);
  expect((await saved()).inventory).toEqual(learned.inventory);
  await mode('story','Story mode');
  expect((await saved()).character.storyFlags[flag]).toBe(true);
  expect((await saved()).inventory).toEqual(learned.inventory);
  await page.locator('#inventory-button').click();
  await expect(slot().getByText('Learned',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:`Read ${move.name} Scroll`,exact:true})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('story-scroll-after-mode-round-trip.png')});
  await page.getByRole('button',{name:'Close inventory',exact:true}).click();
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}

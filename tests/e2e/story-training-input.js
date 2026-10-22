// Real combat keyboard input only: never set an outcome, action, health or flag.
// Share this between the focused renderer test and the earned Story walkthrough.
export async function performTrainingMove(page, move, {probe="storyProbe", onMove=async()=>{}}={}) {
  await page.locator("#renderCanvas").focus();
  const bindings=await page.evaluate(probe=>{
    const p=window[probe],r=p.combatRuntime||p.scripts.combatRuntime;
    return r.active.input.getBindings();
  },probe);
  if(move==="tornadoKickFinish"){
    for(const key of [bindings.up,bindings.up,bindings.leg,bindings.leg])await page.keyboard.press(key);
  }else{
    await page.waitForFunction(probe=>{
      const p=window[probe],r=p.combatRuntime||p.scripts.combatRuntime,e=r.encounter;
      if(e.player.action?.moveId==="swallowFlipThrow")return true;
      if(e.enemy.action?.moveId!=="tigerKnuckle"||e.enemy.action.tick>1||e.player.action||e.player.reaction||p.lastTeachingStrike===e.enemy.action)return false;
      p.lastTeachingStrike=e.enemy.action;
      const b=r.active.input.getBindings();
      const tap=code=>{for(const type of ["keydown","keyup"])window.dispatchEvent(new KeyboardEvent(type,{code,key:code.replace(/^Key/,"").toLowerCase(),bubbles:true}));};
      tap(b.down);tap(b.hand);
      // Punch then kick, not the distinct simultaneous punch+kick chord.
      setTimeout(()=>{if(r.encounter===e&&r.active?.prepared)tap(b.leg);},90);
      return false;
    },probe,{timeout:30_000});
  }
  await page.waitForFunction(({probe,move})=>{
    const p=window[probe],r=p.combatRuntime||p.scripts.combatRuntime;
    return r.encounter?.player.action?.moveId===move;
  },{probe,move});
  await onMove();
}

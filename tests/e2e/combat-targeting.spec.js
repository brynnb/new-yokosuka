import { expect, test } from "@playwright/test";
import { WORLDS } from "../../play/config/worlds.js";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { performTrainingMove } from "./story-training-input.js";

// The existing dialogue overlay aria-hides sibling HUDs, including the
// visually interactive move list. Check its actual buttons, not that tree.
const moveButton = (page, name) => page.locator("#combat-move-list button")
  .filter({ hasText: new RegExp(`^${name}$`) });

export async function openCombatApp(page) {
  const errors = [];
  page.on("console", message => { if(message.type()==="error")console.error("Browser:",message.text()); });
  page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  // Unpublished Story assets can be regenerated locally. Serve only exact
  // content-addressed matches, never a dummy or another character's textures.
  await page.route("**/r2-assets/shenmue/runtime/**", async route => {
    const match = /\/runtime\/([a-f0-9]{64})\/(.+)$/.exec(new URL(route.request().url()).pathname);
    if (match && !match[2].split("/").includes("..")) {
      for (const root of [process.cwd(), process.env.NEW_YOKOSUKA_TEST_ASSET_ROOT].filter(Boolean)) {
        const filename = path.join(root, match[2]);
        if (fs.existsSync(filename) && createHash("sha256").update(fs.readFileSync(filename)).digest("hex") === match[1]) {
          return route.fulfill({ path: filename });
        }
      }
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3");
    window.combatProbe = { ready: false, errors: [] };
  });
  const world = WORLDS.mfbt;
  const character = { id: 42, name: "Targettester", avatarId: "ryo", playMode: "free_roam",
    worldId: world.id, x: world.spawn.x, y: world.spawn.y, z: world.spawn.z, yaw: world.yaw,
    lastLoginAt: "2026-01-01T00:00:00Z" };
  // Mock account/transport only; models, animations, input, camera, combat,
  // scene loading and travel all run through the actual application.
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/guest", route => route.fulfill({ json: { account: { id: 1, accountType: "guest" } } }));
  await page.route("**/api/world-state", route => route.fulfill({ json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 11, 3, 12),
  } }));
  await page.route("**/api/characters", route => route.fulfill({ json: { characters: [character] } }));
  await page.route("**/api/characters/42/state", route => route.fulfill({ json: { character, inventory: [] } }));
  const instrument = (path, body) => page.route(`**/${path}*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n${body}` });
  });
  await instrument("play/world/PlayWorldLifecycle.js", `
    const initialize = PlayWorldLifecycle.prototype.initialize;
    PlayWorldLifecycle.prototype.initialize = function(...args) {
      window.combatProbe.lifecycle = this;
      return initialize.apply(this, args);
    };
  `);
  await instrument("play/characters/PlayerCombatRuntime.js", `
    const activate = PlayerCombatRuntime.prototype.setActive;
    PlayerCombatRuntime.prototype.setActive = function(...args) {
      window.combatProbe.runtime = this;
      return activate.apply(this, args);
    };
  `);
  await instrument("play/multiplayer/MultiplayerSession.js", `
    MultiplayerSession.prototype.connect = function() {};
  `);
  await instrument("play/scripts/ScriptEventAssembly.js", `
    const assemble = createScriptEventAssembly;
    createScriptEventAssembly = function(...args) {
      const assembly = assemble(...args);
      window.combatProbe.scripts = assembly;
      return assembly;
    };
  `);
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    const probe = window.combatProbe;
    probe.application = new PlayApplication();
    probe.application.start().then(() => { probe.ready = true; }).catch(error => {
      probe.errors.push(error.message); probe.application.showStartupError(error);
    });
  ` }));
  await page.goto("/play/");
  console.info("Combat browser check: opening account menu");
  await page.locator(".account-intro-prompt").waitFor();
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".account-shell-characters button").filter({ hasText: /^Enter World$/ }).click();
  await page.waitForFunction(() => window.combatProbe.ready || window.combatProbe.errors.length,
    null, { timeout: 150_000 });
  expect(await page.evaluate(() => window.combatProbe.errors)).toEqual([]);
  await expect(page.locator("#loading")).toHaveClass(/hidden/);
  return errors;
}

test("Story QTEs judge locally and move lessons use rendered regular combat", async ({page},testInfo)=>{
  test.setTimeout(360_000);
  const errors=await openCombatApp(page);
  await expect(moveButton(page, "Tornado Kick")).toBeVisible();
  await page.evaluate(()=>{
    const p=window.combatProbe,c=p.scripts.controller;p.runtime.setActive(false);p.intents=[];c.prepareStart=null;
    let id,token,run=0,ready=false,kind;
    const yieldAttempt=requestId=>queueMicrotask(()=>c.handleYield({requestId,runId:run,event:{type:"challenge"},challenge:{id,label:"Practice",token,ready,kind}}));
    c.client={startScriptEvent(selector,requestId){id=selector.activity;kind=id.includes("heartbeats")?undefined:"training";token=(++run).toString(16).padStart(32,"0");ready=false;yieldAttempt(requestId);return true;},
      advanceScriptEvent(runId,action,args){p.intents.push({action,...args});
        if(action==="challenge_ready"){ready=true;setTimeout(()=>yieldAttempt(args.requestId),2500);}
        else if(action==="challenge_result"||action==="cancel")queueMicrotask(()=>c.handleYield({requestId:args.requestId,runId,event:{type:action==="cancel"?"cancelled":"complete"}}));
        else yieldAttempt(args.requestId);return true;}};
  });
  const start=async(id,area)=>{
    await page.evaluate(({id,area})=>window.combatProbe.scripts.controller.start({kind:"activity",activity:id},{area}),{id,area});
  };
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.combatProbe.scripts.controller.status)).toBe("idle");
  await start("s1.heartbeats.alley","MFBT");
  await expect(page.locator("#dialogue-source")).toContainText("Press B");
  await page.keyboard.press("Shift");
  await expect(page.locator("#dialogue-source")).toContainText("Press A");
  await page.screenshot({path:testInfo.outputPath("local-qte-button-prompt.png")});
  await page.keyboard.press("Enter");await idle();
  expect(await page.evaluate(()=>window.combatProbe.intents.map(i=>i.action))).toEqual(["challenge_ready","challenge_result"]);
  expect(await page.evaluate(()=>window.combatProbe.intents.at(-1).challengeOutcome)).toBe("success");

  for(const [id,world,area] of [["s1.mfsy.tornado-kick","mfsy","MFSY"],["s1.mend.swallow-flip","mend","MEND"]]){
    console.info("Rendering training",id);
    await page.evaluate(world=>window.combatProbe.lifecycle.travelToWorld(world),world);
    await expect(page.locator("#loading")).toHaveClass(/hidden/,{timeout:30_000});
    await start(id,area);
    await page.waitForFunction(()=>window.combatProbe.scripts.combatRuntime.active?.serverView.ready,null,{timeout:90_000});
    const taught = world === "mfsy" ? "Tornado Kick" : "Swallow Flip";
    const other = world === "mfsy" ? "Swallow Flip" : "Tornado Kick";
    await expect(moveButton(page, taught)).toBeVisible();
    await expect(moveButton(page, other)).toHaveCount(0);
    await expect(page.locator("#dialogue-source")).toContainText("No time limit");
    await performTrainingMove(page,world==="mfsy"?"tornadoKickFinish":"swallowFlipThrow",{probe:"combatProbe",
      onMove:()=>page.screenshot({path:testInfo.outputPath(`${world}-lesson-real-move.png`)})});
    await idle();
    expect(await page.evaluate(()=>window.combatProbe.intents.at(-1).challengeOutcome)).toBe("success");
    expect(await page.evaluate(()=>window.combatProbe.scripts.combatRuntime.active)).toBeNull();
  }
  expect(errors).toEqual([]);
});

test('Optional Story lessons render their teachers and Inventory reads move scrolls',async({page},testInfo)=>{
  test.setTimeout(360_000);
  const errors=await openCombatApp(page);
  await page.evaluate(()=>{
    const p=window.combatProbe,c=p.scripts.controller;p.runtime.setActive(false);c.prepareStart=null;p.intents=[];
    let id,token,run=0,ready=false;
    const yieldAttempt=requestId=>queueMicrotask(()=>c.handleYield({requestId,runId:run,event:{type:'challenge'},challenge:{id,label:'Practice',token,ready,kind:'training'}}));
    c.client={startScriptEvent(selector,requestId){id=selector.activity;token=(++run).toString(16).padStart(32,'0');ready=false;yieldAttempt(requestId);return true;},
      advanceScriptEvent(runId,action,args){p.intents.push({action,...args});
        if(action==='challenge_ready'){ready=true;yieldAttempt(args.requestId);}
        else if(action==='challenge_result'||action==='cancel')queueMicrotask(()=>c.handleYield({requestId:args.requestId,runId,event:{type:action==='cancel'?'cancelled':'complete'}}));
        else yieldAttempt(args.requestId);return true;}};
  });
  for(const [slug,move,world,area]of [['pit-blow','pitBlow','exterior','JHD0'],['double-blow','doubleBlow','dobuita','D000'],
    ['swallow-dive','swallowDive','mfsy','MFSY'],['shadow-step','shadowStep','mfsy','MFSY'],['shadow-blade','shadowBlade','mfsy','MFSY'],['cross-charge','crossCharge','mfsy','MFSY']]){
    console.info('Optional lesson',slug);
    await page.evaluate(async({slug,world,area})=>{
      const p=window.combatProbe;await p.lifecycle.travelToWorld(world);
      await p.scripts.controller.start({kind:'activity',activity:`s1.${area.toLowerCase()}.${slug}`},{area});
    },{slug,world,area});
    await page.waitForFunction(()=>window.combatProbe.scripts.combatRuntime.active?.serverView.ready,null,{timeout:90_000});
    await expect(page.locator('#dialogue-source')).toContainText('No time limit');
    await page.screenshot({path:testInfo.outputPath(`${slug}-ready.png`)});
    // Send physical keyboard events through the actual input mapper. Chord
    // modifiers are held together, and counters wait for the teacher's wind-up.
    await page.evaluate(async move=>{
      const {MARTIAL_ARTS_MOVES}=await import('/src/MartialArtsCombat.js');
      window.combatProbe.teachingInput={move,tokens:MARTIAL_ARTS_MOVES[move].nativeInput,entered:false};
    },move);
    await page.waitForFunction(()=>{
      const p=window.combatProbe,r=p.scripts.combatRuntime,e=r.encounter,input=p.teachingInput;
      if(!r.active)return p.intents.at(-1)?.challengeOutcome==='success';
      if(e.player.action?.moveId===input.move)return true;
      if(input.entered){if(performance.now()-input.at>1500&&!e.enemy.action&&!e.player.action)input.entered=false;return false;}
      if(r.active.definition.training.attackMoveId&&(e.enemy.action?.moveId!=='tigerKnuckle'||e.enemy.action.tick>1||e.player.action||e.player.reaction))return false;
      input.entered=true;input.at=performance.now();const b=r.active.input.getBindings();
      const send=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,key:code.replace(/^Key/,'').toLowerCase(),bubbles:true}));
      for(let i=0;i<input.tokens.length;i++){
        const token=input.tokens[i];if(token==='plus')continue;
        const chord=input.tokens[i+1]==='plus';send('keydown',b[token]);
        if(chord){const next=input.tokens[i+2];send('keydown',b[next]);send('keyup',b[next]);i+=2;}
        send('keyup',b[token]);
      }
      return false;
    },null,{timeout:30_000}).catch(async error=>{
      console.info('Teaching failure state',await page.evaluate(()=>{
        const r=window.combatProbe.scripts.combatRuntime;return {player:r.encounter?.player,input:r.active?.input.pressed,events:r.encounter?.lastEvents};
      }));throw error;
    });
    await page.screenshot({path:testInfo.outputPath(`${slug}-move.png`)});
    await expect.poll(()=>page.evaluate(()=>window.combatProbe.scripts.controller.status)).toBe('idle');
    expect(await page.evaluate(()=>window.combatProbe.intents.at(-1).challengeOutcome)).toBe('success');
  }
  let learned=false;
  const character={id:42,playMode:'story',modeRevision:0,openingCompleted:true};
  const snapshot=()=>({character:{...character,storyFlags:learned?{'story.s1.twin-blades.learned':true}:{},scriptStateRevision:learned?1:0},
    inventory:[{key:'scroll_twin_blades',name:'Twin Blades Scroll',category:'move_scroll',quantity:1}]});
  await page.route('**/api/characters/42/state',route=>route.fulfill({json:snapshot()}));
  await page.route('**/api/characters/42/use-item',route=>{
    expect(route.request().postDataJSON()).toEqual({itemKey:'scroll_twin_blades',modeRevision:0});
    learned=true;return route.fulfill({json:snapshot()});
  });
  await page.evaluate(async character=>{
    const {accountSession}=await import('/play/account/AccountSession.js');accountSession.applyWelcome({...character,storyFlags:{},scriptStateRevision:0});
    const {openInventory}=await import('/play/ui/react/inventoryStore.js');openInventory();
  },character);
  await page.getByRole('button',{name:'Read Twin Blades Scroll'}).click();
  await expect(page.locator('#inventory-overlay')).toContainText('Learned');
  await expect(page.getByRole('button',{name:'Read Twin Blades Scroll'})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('inventory-scroll-learned.png')});
  expect(await page.evaluate(async()=>{
    const {accountSession}=await import('/play/account/AccountSession.js');return accountSession.character.storyFlags['story.s1.twin-blades.learned'];
  })).toBe(true);
  expect(errors).toEqual([]);
});

test("Combat Practice renders four opponents and switches targets in camera space", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = await openCombatApp(page);
  console.info("Combat browser check: arena loaded, checking targets");
  await page.evaluate(() => {
    const controller = window.combatProbe.runtime.getController();
    controller.cameraDistance = 6;
  });
  await expect(page.locator(".combat-target-indicator")).toBeVisible();
  expect(await page.evaluate(() => window.combatProbe.runtime.enemies.filter(entry =>
    entry.root.isEnabled() && entry.modelRoot.getChildMeshes().some(mesh => mesh.isEnabled() && mesh.isVisible)
  ).length)).toBe(4);
  await page.screenshot({ path: testInfo.outputPath("combat-four-opponents.png") });

  const switchTarget = async direction => {
    const expected = await page.evaluate(direction => {
      const runtime = window.combatProbe.runtime, encounter = runtime.encounter;
      const candidates = runtime.targetIndicator.projectTargets(encounter.enemies)
        .filter(entry => entry.visible && !entry.defeated).sort((a, b) => a.screenX - b.screenX || a.id.localeCompare(b.id));
      const current = candidates.findIndex(entry => entry.id === encounter.player.targetId);
      const index = current < 0 ? (direction === "left" ? candidates.length - 1 : 0)
        : (current + (direction === "left" ? -1 : 1) + candidates.length) % candidates.length;
      return candidates[index].id;
    }, direction);
    await page.keyboard.press(direction === "left" ? "KeyQ" : "KeyE");
    await expect(page.locator("#combat-enemy-gauge")).toHaveAttribute("data-target-id", expected);
    return expected;
  };
  for (const direction of ["right", "right", "left", "left", "left"]) {
    await switchTarget(direction);
    await expect.poll(() => page.evaluate(() => {
      const { encounter } = window.combatProbe.runtime;
      const delta = encounter.playerActor.yaw() - encounter.playerTargetYaw();
      return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
    })).toBeLessThan(0.01);
  }
  await page.screenshot({ path: testInfo.outputPath("combat-selected-partner.png") });

  // Orbit the real gameplay camera to the other side: world-X/spawn order
  // implementations would now select in the wrong visual direction.
  const initialOrder = await page.evaluate(() => {
    const runtime = window.combatProbe.runtime;
    return runtime.targetIndicator.projectTargets(runtime.encounter.enemies).sort((a, b) => a.screenX - b.screenX).map(e => e.id);
  });
  await page.evaluate(() => { window.combatProbe.runtime.getController().cameraYaw += Math.PI; });
  await page.waitForTimeout(400);
  const orbitOrder = await page.evaluate(() => {
    const runtime = window.combatProbe.runtime;
    return runtime.targetIndicator.projectTargets(runtime.encounter.enemies).sort((a, b) => a.screenX - b.screenX).map(e => e.id);
  });
  expect(orbitOrder).not.toEqual(initialOrder);
  await switchTarget("right");
  await switchTarget("left");
  await page.screenshot({ path: testInfo.outputPath("combat-camera-orbit.png") });

  // Control exit hides targeting; keys in exploration must not queue a later switch.
  await page.keyboard.press("KeyX");
  await expect(page.locator("#combat-enemy-gauge")).toBeHidden();
  await expect(page.locator(".combat-target-indicator")).toBeHidden();
  const previous = await page.evaluate(() => window.combatProbe.runtime.encounter.player.targetId);
  await page.keyboard.press("KeyE");
  await page.keyboard.press("KeyX");
  await expect(page.locator("#combat-enemy-gauge")).toBeVisible();
  await expect(page.locator("#combat-enemy-gauge")).toHaveAttribute("data-target-id", previous);
  await page.evaluate(() => { window.combatProbe.runtime.getController().cameraYaw -= Math.PI; });

  await page.keyboard.press("KeyR");
  await expect.poll(() => page.evaluate(() => window.combatProbe.runtime.getController().firstPerson)).toBe(true);
  await switchTarget("right");
  await expect.poll(() => page.evaluate(() => {
    const runtime = window.combatProbe.runtime;
    const delta = runtime.getController().cameraYaw - runtime.encounter.playerTargetYaw() - Math.PI;
    return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
  })).toBeLessThan(0.01);
  await page.screenshot({ path: testInfo.outputPath("combat-first-person-target.png") });
  await page.keyboard.press("KeyR");

  console.info("Combat browser check: selected throw recipient and animation handoff");
  // Stage a controlled two-recipient range check. Keep real animations and
  // command processing, but prevent AI interruption from making it random.
  await page.evaluate(() => {
    const runtime = window.combatProbe.runtime, encounter = runtime.encounter;
    encounter.resetCombatants();
    const p = encounter.playerActor.position(), yaw = encounter.playerActor.yaw();
    for (const entry of encounter.enemies) entry.ai = null;
    encounter.player.targetId = "partner-left";
    encounter.enemies.find(e => e.id === "partner-left").actor.setCombatPosition(
      p.x + Math.sin(yaw) * 0.9, p.z + Math.cos(yaw) * 0.9, yaw + Math.PI);
    encounter.enemies.find(e => e.id === "enemy").actor.setCombatPosition(
      p.x + Math.cos(yaw) * 0.65, p.z - Math.sin(yaw) * 0.65, yaw + Math.PI);
    runtime.getController().cameraYaw = yaw + Math.PI;
  });
  await page.keyboard.press("KeyW");
  await page.keyboard.press("KeyS");
  await page.keyboard.press("KeyL");
  await page.waitForFunction(() => {
    const action = window.combatProbe.runtime.encounter.player.action;
    return action?.lockedTargetId === "partner-left" && !action.acquisitionStage;
  });
  await switchTarget("right");
  expect(await page.evaluate(() => window.combatProbe.runtime.encounter.player.action.lockedTargetId)).toBe("partner-left");
  await page.screenshot({ path: testInfo.outputPath("combat-throw-keeps-original-partner.png") });
  await page.waitForFunction(() => !window.combatProbe.runtime.encounter.playerMovementLocked);
  const health = await page.evaluate(() => Object.fromEntries(window.combatProbe.runtime.encounter.enemies.map(e => [e.id, e.combatant.health / e.combatant.maxHealth])));
  expect(health["partner-left"]).toBeLessThan(1);
  expect(health.enemy).toBe(1);

  // Travel out and back uses real world ownership; no duplicate actors/labels.
  await page.evaluate(() => window.combatProbe.lifecycle.travelToWorld("exterior"));
  await expect(page.locator(".combat-target-indicator")).toBeHidden();
  expect(await page.evaluate(() => window.combatProbe.runtime.enemies.every(entry => !entry.root.isEnabled()))).toBe(true);
  await page.evaluate(() => window.combatProbe.lifecycle.travelToWorld("mfbt"));
  await expect(page.locator(".combat-target-indicator")).toHaveCount(1);
  await expect(page.locator(".combat-target-indicator")).toBeVisible();
  expect(errors).toEqual([]);
  await testInfo.attach("runtime-errors", { body: JSON.stringify(errors), contentType: "application/json" });
});

test("Story borrows its original cast and uses full client combat, then restores ownership", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = await openCombatApp(page);
  // Only the transport is a fixture. The production controller, preparation,
  // original models, shared animation engine, input, HUD and cleanup are real.
  await page.evaluate(async () => {
    const probe = window.combatProbe, scripts = probe.scripts, c = scripts.controller;
    probe.runtime.setActive(false);
    probe.intents = [];
    c.prepareStart = null;
    let definition, run = 0, ready = false, token;
    const yieldCombat = requestId => queueMicrotask(() => c.handleYield({ requestId, runId: run,
      event: { type: "combat" }, combat: { id: definition, token, ready, remainingMs: 900_000 } }));
    c.client = {
      startScriptEvent(selector, requestId) {
        definition = selector.activity; run++; token = run.toString(16).padStart(32, "0"); ready = false;
        yieldCombat(requestId); return true;
      },
      advanceScriptEvent(runId, action, args) {
        probe.intents.push({ action, ...args });
        if (action === "combat_ready") ready = true;
        if (action === "combat_result" || action === "cancel") queueMicrotask(() => c.handleYield({
          requestId: args.requestId, runId, event: { type: action === "cancel" ? "cancelled" : "complete" },
        }));
        else yieldCombat(args.requestId);
        return true;
      },
    };
    probe.before = scripts.combatRuntime.getController().position?.clone?.();
    await c.start({ kind: "activity", activity: "s1.mfbt.final-spar" }, { area: "MFBT" });
  });
  await page.waitForFunction(() => window.combatProbe.scripts.combatRuntime.active?.view?.ready || window.combatProbe.errors.length, null, { timeout: 90_000 });
  await expect(page.locator(".combat-target-indicator").filter({ visible: true })).toHaveCount(1);
  await expect(page.locator("#combat-enemy-gauge")).toHaveAttribute("data-target-id", "KISY");
  await expect(moveButton(page, "Tornado Kick")).toHaveCount(0);
  await expect(moveButton(page, "Swallow Flip")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("story-original-gui-zhang-client-combat.png") });
  await page.locator("#renderCanvas").focus();
  await page.keyboard.press("KeyK");
  await expect.poll(() => page.evaluate(() => window.combatProbe.scripts.combatRuntime.encounter.playerCommandFeedback().moveLabel || "")).not.toBe("");
  await expect.poll(() => page.evaluate(() => window.combatProbe.scripts.combatRuntime.encounter.player.health), {timeout:15_000}).toBeLessThan(100);
  await page.screenshot({ path: testInfo.outputPath("story-gui-zhang-ai-exchange.png") });
  await page.evaluate(() => window.combatProbe.scripts.controller.cancel("render-check"));
  await expect(page.locator("#combat-enemy-gauge")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.combatProbe.scripts.controller.status)).toBe("idle");
  expect(await page.evaluate(() => window.combatProbe.intents.filter(i => i.action === "combat_result"))).toEqual([]);

  // Emulate a refreshed persisted character, not a temporary lesson loan.
  await page.evaluate(async () => {
    const { accountSession } = await import("/play/account/AccountSession.js");
    accountSession.character.storyFlags = { "story.s1.tornado-kick.learned": true, "story.s1.swallow-flip.learned": true };
    await window.combatProbe.scripts.controller.start(
      { kind: "activity", activity: "s1.mfbt.seventy-man" }, { area: "MFBT" });
  });
  await page.waitForFunction(() => window.combatProbe.scripts.combatRuntime.active?.view?.ready, null, { timeout: 90_000 });
  const cast = await page.evaluate(() => {
    const r = window.combatProbe.scripts.combatRuntime;
    return { opponents: r.encounter.opponents.length,
      visible: [...r.active.records].filter(([tag, a]) => a.root.isEnabled() && a.model.renderRoot.getChildMeshes().some(m => m.isEnabled() && m.isVisible)).map(([tag]) => tag),
      ally: r.encounter.enemies.find(e => e.id === "KISY").combatant.team };
  });
  expect(cast.opponents).toBe(8);
  expect(cast.visible).toHaveLength(10);
  expect(cast.ally).toBe("player");
  await expect(moveButton(page, "Tornado Kick")).toBeVisible();
  await expect(moveButton(page, "Swallow Flip")).toBeVisible();
  await expect(moveButton(page, "Shadow Step")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("story-seventy-original-cast-and-ally.png") });
  await page.locator("#renderCanvas").focus();
  const firstTarget=await page.locator("#combat-enemy-gauge").getAttribute("data-target-id");
  await page.keyboard.press("KeyE");
  await expect(page.locator("#combat-enemy-gauge")).not.toHaveAttribute("data-target-id", firstTarget);
  await expect(page.locator("#combat-enemy-gauge")).not.toHaveAttribute("data-target-id", "KISY");
  // A deterministic paired-animation check: place just the selected original
  // fighter in throw range; all damage/animation still uses real keyboard input.
  await page.evaluate(() => {
    const e=window.combatProbe.scripts.combatRuntime.encounter;
    e.resetCombatants();for(const entry of e.enemies)entry.ai=null;
    const p=e.playerActor.position(),yaw=e.playerActor.yaw();
    e.enemyActor.setCombatPosition(p.x+Math.sin(yaw)*.9,p.z+Math.cos(yaw)*.9,yaw+Math.PI);
  });
  await page.keyboard.press("KeyW");await page.keyboard.press("KeyS");await page.keyboard.press("KeyL");
  await page.waitForFunction(() => {
    const a=window.combatProbe.scripts.combatRuntime.encounter.player.action;
    return a?.lockedTargetId&&!a.acquisitionStage;
  }, null, {timeout:5000}).catch(async error=>{
    console.info("Story throw state",JSON.stringify(await page.evaluate(()=>{
      const e=window.combatProbe.scripts.combatRuntime.encounter;
      return {player:e.player,target:e.enemy,feedback:e.playerCommandFeedback(),controls:e.controlsActive,commands:e.input.pressed};
    })));throw error;
  });
  await page.screenshot({path:testInfo.outputPath("story-original-fighter-shared-throw.png")});
  await page.waitForFunction(()=>!window.combatProbe.scripts.combatRuntime.encounter.playerMovementLocked);
  expect(await page.evaluate(()=>window.combatProbe.scripts.combatRuntime.encounter.opponents.some(e=>e.combatant.health<e.combatant.maxHealth))).toBe(true);
  await page.evaluate(() => window.combatProbe.scripts.controller.cancel("render-check"));
  await expect.poll(() => page.evaluate(() => window.combatProbe.scripts.controller.status)).toBe("idle");
  expect(await page.evaluate(() => window.combatProbe.intents.some(i => i.action === "combat_input"))).toBe(false);
  // Returning to the sandbox restores the full scroll, without teaching
  // its optional moves to the saved character.
  await page.evaluate(() => window.combatProbe.runtime.setActive(true));
  await expect(moveButton(page, "Shadow Step")).toBeVisible();
  await expect(moveButton(page, "Pit Blow")).toBeVisible();
  await moveButton(page, "Pit Blow").click();
  await expect.poll(() => page.evaluate(() => window.combatProbe.runtime.encounter.playerCommandFeedback().moveLabel)).toBe("Pit Blow");
  expect(await page.evaluate(async () => {
    const { accountSession } = await import("/play/account/AccountSession.js");
    return accountSession.character.storyFlags;
  })).toEqual({ "story.s1.tornado-kick.learned": true, "story.s1.swallow-flip.learned": true });
  expect(errors).toEqual([]);
});

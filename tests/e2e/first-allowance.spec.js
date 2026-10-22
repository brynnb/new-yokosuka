import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {verifyOldDistrictEntry,verifyOldDistrictStealth,verifyFirstChenMeeting} from "./story-harbor.js";
import {verifyFamilyMirrorLead,verifyBunkadoHandguard,verifyGuiZhangEncounter,verifyHandguardFamily,verifyDojoItems,verifyDojoSwitches,verifyBasementTravel} from "./story-mirror-search.js";
import {verifyBasementMirrorSearch} from "./story-basement.js";
import {verifyMirrorReturn} from "./story-mirror-return.js";
import {verifyHomeTicketPreparation,verifyAgencyQuotesAndFunds,verifyBoatTicketJourney,verifyTicketActorReplacement} from "./story-home-ticket.js";
import {verifyJimmyMorningCall,verifyChaiArcade} from "./story-arcade-ticket.js";
import {verifyJimmyChase} from "./story-jimmy-chase.js";
import {verifyHarborHiring} from "./story-harbor-hiring.js";
import {verifyForkliftTraining} from "./story-forklift-training.js";
import {verifyChickenRace} from "./story-chicken-race.js";
import {verifyPersonalCalendar} from "./story-calendar.js";
import {verifyMorningRace,verifyMorningRaceSaved} from "./story-morning-race.js";
import {verifyMorningCargo,verifyMarkLunch,verifyFirstAfternoon} from "./story-workday-one.js";
import {verifyWorkdayNight,verifySecondWorkday,verifyMarkAfterWork} from "./story-workday-two.js";
import {verifyThirdWorkday} from "./story-workday-three.js";
import {verifyHarborBikers} from "./story-harbor-bikers.js";
import {verifyFourthMorning,verifyFourthLunch,verifyFourthAfternoon} from "./story-workday-four.js";
import {verifyFifthMorning,verifyFifthSailorChase,verifyFifthAfternoon,verifyWarningLetter,verifyChenWarning} from "./story-workday-five.js";
import {verifyNozomiNightCall,verifyNozomiTransport} from "./story-nozomi-rescue.js";
import {verifyMotorcycleRide} from "./story-motorcycle-ride.js";
import {verifyNozomiWarehouse} from "./story-nozomi-warehouse.js";
import {verifyNozomiHome} from "./story-nozomi-home.js";
import {verifyFinalDayMorning,verifyTomLessonAndFarewell,verifyFinalNight} from "./story-final-day.js";
import {verifySeventyManBattle} from "./story-seventy-man.js";
import {verifyFinalAftermath} from "./story-final-aftermath.js";
import {verifyFamilyDeparture} from "./story-family-departure.js";
import {verifySwallowFlip,verifySwallowPresentation,verifyFinalChai,verifyFinalChaiPresentation,verifyIntroductionLetter,verifyEarnedIntroductionLetter,verifyNozomiAmulet,verifyShipDeparture} from "./story-final-departure.js";
import {useStoryInspectable} from "./story-object-input.js";
import {verifySavedScrollLearning} from "./story-move-learning.js";

test.skip(process.env.NEW_YOKOSUKA_STORY_E2E !== "true", "requires the isolated Story prototype server and offline assets");

const resumeId = Number(process.env.NEW_YOKOSUKA_STORY_RESUME_ID || 0);
test.afterEach(async({page},info)=>{
  if(info.status===info.expectedStatus)return;
  const state=await page.evaluate(()=>{const p=window.storyProbe,l=p?.lifecycle;return{notices:p?.notices,errors:p?.errors,sceneErrors:p?.sceneErrors,status:p?.regions?.controller.status,world:l?.worldRuntime.activeWorld.id,ready:l?.worldRuntime.ready,switching:l?.worldRuntime.switching,movementLocked:l?.getController()?.movementLocked,actorLeases:p?.actorLeases?.slice(-4),rejected:p?.scriptRejections,presence:p?.presencePublishes?.slice(-5)};}).catch(()=>null);
  console.info("Story failure state:",JSON.stringify(state));
});
const variants = resumeId ? [["resume", false]] : [["complete", false], ["skip", false], ["complete", true]];
for (const [ending, freshOpening] of variants) test(resumeId ? "investigation continues from an earned saved checkpoint" : `first allowance renders and persists after ${ending}${freshOpening ? " from a fresh opening" : ""}`, async ({ page }, testInfo) => {
  test.setTimeout(process.env.NEW_YOKOSUKA_MIRROR_RETURN_E2E === "true" ? 600_000 : process.env.NEW_YOKOSUKA_CHEN_E2E === "true" || process.env.NEW_YOKOSUKA_FAMILY_E2E === "true" || process.env.NEW_YOKOSUKA_HANDGUARD_E2E === "true" || process.env.NEW_YOKOSUKA_GUI_ZHANG_E2E === "true" ? 360_000 : process.env.NEW_YOKOSUKA_INVESTIGATION_E2E === "true" ? 900_000 : process.env.NEW_YOKOSUKA_KITTEN_E2E === "true" ? 600_000 : freshOpening ? 480_000 : 240_000);
  const errors = [];
  const musicResponses = [];
  page.on("response", response => { if(/bgm119|bgm063|bgm064|bgm032|bgm067|bgm070|bgm095|bgm200|bgm084|bgm013|bgm120|bgm106|bgm107|nozomi-home-cdda05/.test(response.url())) musicResponses.push({url:response.url(),status:response.status()}); });
  page.on("pageerror", error => {errors.push(error.message);console.info("Story page error:",error.message);});
  if(process.env.NEW_YOKOSUKA_SECOND_MORNING_E2E==="true"||process.env.NEW_YOKOSUKA_THIRD_WORKDAY_E2E==="true")page.on("pageerror",error=>console.info("Working morning page error:",error.message));
  if(process.env.NEW_YOKOSUKA_FORKLIFT_TRAINING_E2E==="true"||process.env.NEW_YOKOSUKA_MORNING_CARGO_E2E==="true"||process.env.NEW_YOKOSUKA_MARK_LUNCH_E2E==="true"||process.env.NEW_YOKOSUKA_FIRST_AFTERNOON_E2E==="true"){
    page.on("pageerror",error=>console.info("Story page error:",error.message));
    page.on("console",message=>{if(message.type()==="error")console.info("Story console error:",message.text().slice(0,500));});
  }
  if(process.env.NEW_YOKOSUKA_BUS_E2E === "true")page.on("console",message=>{if(message.type()==="error")console.info("Story travel browser error:",message.text());});
  const guestToken = resumeId ? process.env.NEW_YOKOSUKA_STORY_RESUME_TOKEN : randomUUID();
  expect(guestToken).toBeTruthy();
  const auth = await page.request.post("/api/auth/guest", { data: { guestToken } });
  expect(auth.ok(), await auth.text()).toBe(true);
  const name = "Scene" + randomUUID().slice(0, 6).replace(/[0-9]/g, digit => String.fromCharCode(103 + Number(digit)));
  const response = resumeId ? await page.request.get(`/api/characters/${resumeId}/state`)
    : await page.request.post("/api/characters", { data: { name, avatarId: "ryo" } });
  expect(response.ok(), await response.text()).toBe(true);
  const detail = await response.json();
  const character = resumeId ? detail.character : detail;
  if (!freshOpening && !resumeId) {
    const opening = await page.request.post(`/api/characters/${character.id}/opening-complete`, { data: { revision: 0 } });
    expect(opening.ok()).toBe(true);
  } else if (freshOpening) {
    expect(character.playMode).toBe("story");
    expect(character.openingCompleted).toBe(false);
    // No gameplay writer may start with the pre-opening clock and location.
    const earlyConnection = await page.request.get(`/ws?characterId=${character.id}`);
    expect(earlyConnection.status()).toBe(409);
  }
  await page.addInitScript(token => {
    localStorage.setItem("new-yokosuka.guest-token.v1", token);
    localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3");
  }, guestToken);
  if (process.env.NEW_YOKOSUKA_FIFTH_SAILORS_LOST_RECEIPT_E2E === "true") await page.addInitScript(() => {
    const add = WebSocket.prototype.addEventListener, send = WebSocket.prototype.send;
    const probe = window.storyLostArrival = { dropped: false, welcomes: [], presence: [] };
    let droppedSocket;
    WebSocket.prototype.addEventListener = function(type, listener, options) {
      if (type !== "message") return add.call(this, type, listener, options);
      return add.call(this, type, event => {
        let message; try { message = JSON.parse(event.data); } catch { return listener.call(this, event); }
        if (!probe.dropped && message.type === "script_event_committed"
          && message.state?.destination?.id === "s1.work.sailor-smith-alley") {
          probe.dropped = true; droppedSocket = this;
          probe.destination = message.state.destination;
          probe.revision = message.state.revision;
          probe.before = window.storyProbe.lifecycle.getController().actorRoot.position.asArray();
          // The server has committed, but the application never receives its
          // reply. Exercise the real socket reconnect, not a page reload.
          this.close(4001, "test lost Story completion reply");
          return;
        }
        if (probe.dropped && this !== droppedSocket && message.type === "welcome") probe.welcomes.push(message.character);
        return listener.call(this, event);
      }, options);
    };
    WebSocket.prototype.send = function(data) {
      if (probe.dropped && this !== droppedSocket) {
        const message = JSON.parse(data);
        if (message.type === "presence") probe.presence.push(message);
      }
      return send.call(this, data);
    };
  });
  // Instrument the actual served modules, including HMR timestamp variants.
  // Importing a bare second copy can observe a different prototype from /play.
  for (const [file, hook] of [
    ["events/NativeAseqBabylonPresentation", `const probeActorBegin = NativeAseqBabylonActors.prototype.begin;
      NativeAseqBabylonActors.prototype.begin=function(...args){
        const p=window.storyProbe,c=p?.lifecycle?.getController();
        if(p&&c)(p.actorLeases||=[]).push({scene:p.director?.activeCutscene?.cutscene.id,position:c.collider.position.asArray(),tags:args[1]});
        return probeActorBegin.apply(this,args);
      };`],
    ["multiplayer/PlayMultiplayerRuntime", `const probePresence=PlayMultiplayerRuntime.prototype.publishPresence;
      PlayMultiplayerRuntime.prototype.publishPresence=function(force){const result=probePresence.call(this,force);if(window.storyProbe){window.storyProbe.presencePublishes||=[];window.storyProbe.presencePublishes.push({at:performance.now(),force:!!force,sent:result,allowed:this.canPublishPresence(),connected:this.client?.connected,welcomed:this.client?.welcomed,presence:this.client?.latestPresence});if(window.storyProbe.presencePublishes.length>30)window.storyProbe.presencePublishes.shift();}return result;};`],
    ["ui/TransientNotice", `const probeNoticeShow = TransientNotice.prototype.show;
      TransientNotice.prototype.show = function(text,...args) { if(window.storyProbe) { (window.storyProbe.notices ||= []).push(text); console.info('Story notice:',text); } return probeNoticeShow.call(this,text,...args); };`],
    ["world/WorldClock", `const probeWorldState = WorldClock.prototype.setWorldState;
      WorldClock.prototype.setWorldState = function(...args) { window.storyProbe.clock=this; return probeWorldState.apply(this,args); };`],
    ["scripts/ScriptEventController", `const probeFailure = ScriptEventController.prototype.fail;
      ScriptEventController.prototype.fail = function(error,...args) { window.storyProbe.sceneErrors.push(error.message); return probeFailure.call(this,error,...args); };
      const probeRejected=ScriptEventController.prototype.handleRejected;
      ScriptEventController.prototype.handleRejected=function(message,...args){if(window.storyProbe)(window.storyProbe.scriptRejections||=[]).push({at:performance.now(),message,frame:window.storyProbe.lastRegionFrame,presence:window.storyProbe.presencePublishes?.slice(-5)});return probeRejected.call(this,message,...args);};`],
    ["interactions/WorldInteractionDispatcher", `const probeDispatcherStart = WorldInteractionDispatcher.prototype.start;
      WorldInteractionDispatcher.prototype.start = function(...args) { window.storyProbe.interactions=this; return probeDispatcherStart.apply(this,args); };`],
    ["scripts/StoryCombatRuntime", `const probeCombatShow = StoryCombatRuntime.prototype.show;
      StoryCombatRuntime.prototype.show = function(...args) {
        window.storyProbe.combatRuntime = this;
        if(!this.probeIntent) {
          this.probeIntent = true; const publish = this.onViewChanged;
          this.onViewChanged = view => {
            window.storyProbe.lastCombatView = view;
            const input=this.active?.input;
            if(input&&!input.probeCommands){
              input.probeCommands=true;const consume=input.consumeCommands.bind(input);
              input.consumeCommands=()=>{
                const commands=consume(),b=input.getBindings();
                for(const action of commands.length?commands:[""])window.storyProbe.combatInputs.push({
                  action,guard:input.guarding,time:performance.now(),
                  moveX:Number(input.held.has(b.right))-Number(input.held.has(b.left)),
                  moveZ:Number(input.held.has(b.up))-Number(input.held.has(b.down)),
                });
                return commands;
              };
            }
            return publish(view);
          };
        }
        return probeCombatShow.apply(this,args);
      };`],
    ["scripts/StoryNavigationRuntime", `const probeNavigationShow = StoryNavigationRuntime.prototype.show;
      StoryNavigationRuntime.prototype.show = function(...args) { window.storyProbe.navigation = this; return probeNavigationShow.apply(this,args); };`],
    ["scripts/StoryDrivingRuntime", `const probeDrivingShow = StoryDrivingRuntime.prototype.show;
      StoryDrivingRuntime.prototype.show = function(...args) { window.storyProbe.driving = this; return probeDrivingShow.apply(this,args); };`],
    ["ui/MusicControls", `const probeMusicInitialize = MusicControls.prototype.initialize;
      MusicControls.prototype.initialize = function(...args) { window.storyMusic = this; return probeMusicInitialize.apply(this,args); };`],
    ["events/NativeAseqActivityRuntime", `const probeAuthStart = NativeAseqActivityRuntime.prototype.startActivity;
      NativeAseqActivityRuntime.prototype.startActivity = async function(...args) {
        const result = await probeAuthStart.apply(this,args), record = this.active?.record;
        if(record?.activityId?.startsWith('NBIK/NBIK')) (window.storyProbe.homeActivities ||= []).push({slot:args[0].slot,id:record.activityId});
        return result;
      };`],
    ["scripts/StoryForkliftChallengeRuntime", `const probeDeliveryShow = StoryForkliftChallengeRuntime.prototype.show;
      StoryForkliftChallengeRuntime.prototype.show = function(...args) { window.storyProbe.delivery = this; return probeDeliveryShow.apply(this,args); };`],
    ["dialogue/NativeDialogueOverlayRuntime", `window.nativeDialogueHookInstalled = true;
      const probeNativeStart = NativeDialogueOverlayRuntime.prototype.start;
      NativeDialogueOverlayRuntime.prototype.start = function(options,...args) { window.storyProbe.nativeStarts.push(options.actorCode); return probeNativeStart.call(this,options,...args); };`],
    ["interactions/ScriptedInteractionRuntime", `const probeNativeObject = ScriptedInteractionRuntime.prototype.startNativeObject;
      ScriptedInteractionRuntime.prototype.startNativeObject = function(inspectable,objectTag,...args) {
        window.storyProbe.nativeStarts.push('object:' + objectTag);
        return probeNativeObject.call(this,inspectable,objectTag,...args);
      };`],
    ["scripts/ScriptEventDialoguePresenter", `const probeShow = ScriptEventDialoguePresenter.prototype.show;
      ScriptEventDialoguePresenter.prototype.show = function(...args) { window.storyProbe.dialogue = this; return probeShow.apply(this,args); };`],
    ["world/PlayWorldLifecycle", `const probeInitialize = PlayWorldLifecycle.prototype.initialize;
      PlayWorldLifecycle.prototype.initialize = function(...args) { window.storyProbe.lifecycle = this; return probeInitialize.apply(this,args); };`],
    ["scripts/AuthoredSceneStagingRuntime", `const probeStage = AuthoredSceneStagingRuntime.prototype.play;
      AuthoredSceneStagingRuntime.prototype.play = function(...args) { window.storyProbe.authoredScene = this; return probeStage.apply(this,args); };`],
    ["scripts/ScriptAutomaticEventRuntime", `const probeAutomatic = ScriptAutomaticEventRuntime.prototype.update;
      ScriptAutomaticEventRuntime.prototype.update = function(...args) { window.storyProbe.automatic = this; return probeAutomatic.apply(this,args); };`],
    ["cutscenes/NativeCutsceneDirector", `const probeActivityAdapter = NativeCutsceneDirector.prototype.nativeActivityAdapter;
      NativeCutsceneDirector.prototype.nativeActivityAdapter = function(...args) { window.storyProbe.director = this; return probeActivityAdapter.apply(this,args); };
      const probeStart = NativeCutsceneDirector.prototype.start;
      NativeCutsceneDirector.prototype.start = function(cutscene,...args) { window.storyProbe.director = this; window.storyProbe.starts.push(cutscene.id); return probeStart.call(this,cutscene,...args).catch(error => { window.storyProbe.sceneErrors.push(error.message); throw error; }); };`],
    ["scripts/StoryRegionRuntime", `const probeUpdate = StoryRegionRuntime.prototype.update;
      StoryRegionRuntime.prototype.update = function(...args) { window.storyProbe.regions = this; window.storyProbe.lastRegionFrame = args[0]; return probeUpdate.apply(this,args); };`],
    ["scripts/NativeStoryRuntime", `const probeStoryAutomatic = NativeStoryRuntime.prototype.updateAutomatic;
      NativeStoryRuntime.prototype.updateAutomatic = function(...args) { window.storyProbe.nativeAutomatic = {enabled:args[0].enabled,status:this.scriptedEvents.status,busy:this.scriptedEvents.busy,startup:this.isStartupPresentationActive()}; return probeStoryAutomatic.apply(this,args); };`],
  ]) await page.route(`**/play/${file}.js*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + "\n" + hook });
  });
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    import { ArcadeAttractScreens } from '/play/arcade/ArcadeAttractScreens.js';
    window.storyProbe = { starts: [], nativeStarts: [], combatInputs: [], ready: false, errors: [], sceneErrors: [] };
    const create = ArcadeAttractScreens.prototype.create;
    ArcadeAttractScreens.prototype.create = function(id) { return this.definitions[id]?.audioChannel === 'tv' ? null : create.call(this,id); };
    const application = new PlayApplication();
    application.start().then(() => window.storyProbe.ready = true).catch(error => { window.storyProbe.errors.push(error.message); application.showStartupError(error); });
  ` }));
  await page.goto("/play/");
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({ hasText: /^Enter World$/ }).click();
  const openingScenes = ["S1-OP02-00", "S1-000", "S1-OP00-MAIL", "S1-OP00-DREAM"];
  if (freshOpening) {
    // Exercise real loading and the explicit player skip, not the completion
    // API or a fake director result. Natural intro timing is a separate check.
    for (const id of openingScenes) {
      await page.waitForFunction(id => window.storyProbe.director?.activeCutscene?.cutscene.id === id
        || window.storyProbe.errors.length || window.storyProbe.sceneErrors.length, id, { timeout: 120_000 });
      expect(await page.evaluate(() => [...window.storyProbe.errors, ...window.storyProbe.sceneErrors])).toEqual([]);
      const before = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(before.character.openingCompleted).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`${id}-before-skip.png`) });
      await page.keyboard.press("KeyX");
    }
  }
  await page.waitForFunction(() => window.storyProbe.ready || window.storyProbe.errors.length, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.storyProbe.errors)).toEqual([]);
  await page.waitForFunction(() => window.storyProbe.regions?.getCharacter()?.id);
  if (resumeId) {
    if(process.env.NEW_YOKOSUKA_SCROLL_LEARNING_E2E === "true"){
      test.setTimeout(300_000);await verifySavedScrollLearning(page,testInfo,character,{moveId:process.env.NEW_YOKOSUKA_SCROLL_MOVE_ID||'twinBlades'});expect(errors).toEqual([]);return;
    }
    expect(character.storyFlags["notebook.s1.chinese-community"]).toBe(true);
    if(process.env.NEW_YOKOSUKA_SHIP_DEPARTURE_E2E === "true"){
      test.setTimeout(540_000);await verifyShipDeparture(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_NOZOMI_AMULET_E2E === "true"){
      test.setTimeout(420_000);await verifyNozomiAmulet(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_LETTER_INVENTORY_E2E === "true"){
      await verifyEarnedIntroductionLetter(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_INTRODUCTION_LETTER_E2E === "true"){
      test.setTimeout(360_000);await verifyIntroductionLetter(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FINAL_CHAI_RENDER_E2E === "true"){
      await verifyFinalChaiPresentation(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FINAL_CHAI_E2E === "true"){
      test.setTimeout(700_000);await verifyFinalChai(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SWALLOW_RENDER_E2E === "true"){
      await verifySwallowPresentation(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SWALLOW_FLIP_E2E === "true"){
      test.setTimeout(600_000);await verifySwallowFlip(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FAMILY_DEPARTURE_E2E === "true"){
      test.setTimeout(360_000);await verifyFamilyDeparture(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FINAL_AFTERMATH_E2E === "true"){
      test.setTimeout(900_000);await verifyFinalAftermath(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SEVENTY_MAN_E2E === "true"){
      test.setTimeout(1000_000);await verifySeventyManBattle(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FINAL_NIGHT_E2E === "true"){
      test.setTimeout(900_000);await verifyFinalNight(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_TOM_FAREWELL_E2E === "true"){
      test.setTimeout(900_000);await verifyTomLessonAndFarewell(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FINAL_DAY_MORNING_E2E === "true"){
      test.setTimeout(660_000);await verifyFinalDayMorning(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_NOZOMI_HOME_E2E === "true"){
      test.setTimeout(600_000);await verifyNozomiHome(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_NOZOMI_WAREHOUSE_E2E === "true"){
      test.setTimeout(900_000);await verifyNozomiWarehouse(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_NOZOMI_RIDE_E2E === "true"){
      test.setTimeout(420_000);await verifyMotorcycleRide(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_NOZOMI_TRANSPORT_E2E === "true"){
      test.setTimeout(420_000);await verifyNozomiTransport(page,testInfo,character,{residentClickPoint,enterInteriorDoor,musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_NOZOMI_CALL_E2E === "true"){
      test.setTimeout(360_000);await verifyNozomiNightCall(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHEN_WARNING_E2E === "true"){
      test.setTimeout(480_000);await verifyChenWarning(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_WARNING_LETTER_E2E === "true"){
      test.setTimeout(300_000);await verifyWarningLetter(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FIFTH_AFTERNOON_E2E === "true"){
      test.setTimeout(900_000);await verifyFifthAfternoon(page,testInfo,character,{musicResponses});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FIFTH_SAILORS_E2E === "true"){
      test.setTimeout(900_000);await verifyFifthSailorChase(page,testInfo,character,{reconnectOnly:process.env.NEW_YOKOSUKA_FIFTH_SAILORS_RECONNECT_E2E==="true",arrivalOnly:process.env.NEW_YOKOSUKA_FIFTH_SAILORS_ARRIVAL_E2E==="true",lostReceipt:process.env.NEW_YOKOSUKA_FIFTH_SAILORS_LOST_RECEIPT_E2E==="true"});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FIFTH_MORNING_E2E === "true"){
      test.setTimeout(1_800_000);await verifyFifthMorning(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FOURTH_AFTERNOON_E2E === "true"){
      test.setTimeout(900_000);await verifyFourthAfternoon(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FOURTH_LUNCH_E2E === "true"){
      test.setTimeout(300_000);await verifyFourthLunch(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FOURTH_MORNING_E2E === "true"){
      test.setTimeout(1_800_000);await verifyFourthMorning(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_HARBOR_BIKERS_E2E === "true"){
      test.setTimeout(900_000);await verifyHarborBikers(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_THIRD_WORKDAY_E2E === "true"){
      test.setTimeout(1_800_000);await verifyThirdWorkday(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MARK_AFTER_WORK_E2E === "true"){
      test.setTimeout(660_000);await verifyMarkAfterWork(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SECOND_WORKDAY_E2E === "true"){
      test.setTimeout(900_000);
      if(!character.storyFlags["story.s1.workday-two-morning.completed"])await verifyMorningCargo(page,testInfo,character,{day:"two"});
      await verifySecondWorkday(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SECOND_MORNING_E2E === "true"){
      test.setTimeout(1_260_000);
      await verifyWorkdayNight(page,testInfo,character);
      const current=await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      if(!current.character.storyFlags["story.s1.workday-two-race.completed"])await verifyMorningRace(page,testInfo,character,{day:"two"});
      await verifyMorningRaceSaved(page,testInfo,character,{day:"two"});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FIRST_AFTERNOON_E2E === "true"){
      test.setTimeout(660_000);
      await verifyFirstAfternoon(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MARK_LUNCH_E2E === "true"){
      test.setTimeout(360_000);
      await verifyMarkLunch(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MORNING_CARGO_E2E === "true"){
      test.setTimeout(480_000);
      await verifyMorningCargo(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MORNING_RACE_RELOAD_E2E === "true"){
      await verifyMorningRaceSaved(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MORNING_RACE_E2E === "true"){
      test.setTimeout(1_200_000);
      await verifyMorningRace(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CALENDAR_E2E === "true"){
      await verifyPersonalCalendar(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHICKEN_RACE_E2E === "true"){
      test.setTimeout(360_000);
      await verifyChickenRace(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FORKLIFT_TRAINING_E2E === "true"){
      test.setTimeout(540_000);
      await verifyForkliftTraining(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_HARBOR_HIRING_E2E === "true"){
      test.setTimeout(540_000);
      await verifyHarborHiring(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_JIMMY_CHASE_E2E === "true"){
      test.setTimeout(540_000);
      await verifyJimmyChase(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHAI_ARCADE_E2E === "true"){
      test.setTimeout(480_000);
      await verifyChaiArcade(page,testInfo,character,enterInteriorDoor);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_JIMMY_CALL_E2E === "true"){
      test.setTimeout(420_000);
      await verifyJimmyMorningCall(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_BOAT_VISIBILITY_E2E === "true"){
      test.setTimeout(360_000);
      await verifyTicketActorReplacement(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_BOAT_TICKET_E2E === "true"){
      test.setTimeout(720_000);
      await verifyBoatTicketJourney(page,testInfo,character,enterInteriorDoor,residentClickPoint);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_AGENCY_E2E === "true"){
      test.setTimeout(600_000);
      await verifyAgencyQuotesAndFunds(page,testInfo,character,enterInteriorDoor);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_HOME_TICKET_E2E === "true"){
      test.setTimeout(600_000);
      await verifyHomeTicketPreparation(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MIRROR_RETURN_E2E === "true"){
      await verifyMirrorReturn(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_BASEMENT_MIRROR_E2E === "true"){
      await verifyBasementMirrorSearch(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_BASEMENT_TRAVEL_E2E === "true"){
      await verifyBasementTravel(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_DOJO_SWITCHES_E2E === "true"){
      await verifyDojoSwitches(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_DOJO_ITEMS_E2E === "true"){
      await verifyDojoItems(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_HANDGUARD_FAMILY_E2E === "true"){
      await verifyHandguardFamily(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_GUI_ZHANG_E2E === "true"){
      await verifyGuiZhangEncounter(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_HANDGUARD_E2E === "true"){
      await verifyBunkadoHandguard(page,testInfo,character,enterInteriorDoor);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FAMILY_E2E === "true"){
      await verifyFamilyMirrorLead(page,testInfo,character,residentClickPoint);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHEN_E2E === "true") {
      await verifyFirstChenMeeting(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_STEALTH_E2E === "true") {
      await verifyOldDistrictStealth(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_GORO_E2E === "true") {
      await verifyFirstGoro(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_WAREHOUSE_E2E === "true") {
      await verifyWarehouseEight(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_OLD_DISTRICT_E2E === "true") {
      await verifyOldDistrictEntry(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_BUS_E2E === "true") {
      await verifyHarborBus(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_DIRECTORY_E2E === "true") {
      await verifyAmihamaDirectory(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_PHONE_E2E === "true") {
      await verifyMasterChenPhone(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_XIA_E2E === "true") {
      await verifyXiaTranslation(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_GAO_E2E === "true") {
      await verifyGaoRescue(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_FUKU_GATE_E2E === "true") {
      await verifyFukuLetterGate(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_LETTER_E2E === "true") {
      await verifyDojoAndChineseLetter(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_CHARLIE_INQUIRIES_E2E === "true") {
      await verifyCharlieInquiries(page, testInfo, character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_AMBUSH_E2E === "true") {
      await verifyParkingLotAmbush(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_TATTOO_E2E === "true") {
      await verifyTattooFirstVisit(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_CHARLIE_QTE_E2E === "true") {
      await verifyCharlieConfrontation(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_NOZOMI_PARLOR_E2E === "true") {
      await verifyNozomiAfterParlor(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_BAR_QTE_E2E === "true") {
      await verifyBarQte(page, testInfo, character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    await continueWitnesses(page, testInfo, character, character.yen, true);
    if(process.env.NEW_YOKOSUKA_ALLEY_QTE_E2E === "true") {
      await page.locator("#journal-close").click();
      await verifyAlleyQte(page,testInfo,character);
    }
    if (process.env.NEW_YOKOSUKA_NIGHT_STORY_E2E === "true") {
      await page.locator("#journal-close").click();
      await continueNightWitnesses(page,testInfo,character);
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    return;
  }
  if (freshOpening) {
    const arrival = await page.evaluate(() => ({
      position: window.storyProbe.lifecycle.getController().collider.position.asArray(),
      locked: window.storyProbe.lifecycle.getController().movementLocked,
      character: window.storyProbe.regions.getCharacter(),
    }));
    expect(arrival.character.openingCompleted).toBe(true);
    expect(arrival.character.storyTimeMs).toBe(Date.UTC(1986, 11, 3, 8, 55));
    expect(arrival.character.worldId).toBe("interior");
    expect(Math.hypot(arrival.position[0] + 17.6, arrival.position[2] - 4.1)).toBeLessThan(0.2);
    expect(arrival.locked).toBe(false);
    expect(await page.evaluate(() => window.storyProbe.starts)).toEqual(openingScenes);
    await page.screenshot({ path: testInfo.outputPath("fresh-bedside.png") });
    // Project the actual bedroom door into the canvas, click it through the
    // normal picker, then walk out with normal collisions. No hallway teleport.
    const doorPoint = await page.evaluate(() => {
      const life = window.storyProbe.lifecycle;
      const door = life.doorInteractions.entries.find(entry => entry.objectTag === "dor7");
      if (!door) throw new Error("Bedroom door dor7 is unavailable");
      const bounds = door.root.getHierarchyBoundingVectors(true);
      const point = bounds.min.add(bounds.max).scale(0.5);
      const canvas = life.engine.getRenderingCanvas();
      const rect = canvas.getBoundingClientRect();
      const screen = point.constructor.Project(point, life.scene.getTransformMatrix().constructor.Identity(), life.scene.getTransformMatrix(),
        life.scene.activeCamera.viewport.toGlobal(life.engine.getRenderWidth(), life.engine.getRenderHeight()));
      return { state: door.state, x: rect.x + screen.x * rect.width / life.engine.getRenderWidth(),
        y: rect.y + screen.y * rect.height / life.engine.getRenderHeight() };
    });
    if (doorPoint.state === "closed") await page.mouse.click(doorPoint.x, doorPoint.y);
    await page.waitForFunction(() => window.storyProbe.lifecycle.doorInteractions.entries
      .find(entry => entry.objectTag === "dor7")?.state === "open");
    await page.locator("#renderCanvas").focus();
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(() => window.storyProbe.starts.includes("story-s1-first-allowance"), null, { timeout: 15_000 });
    } finally { await page.keyboard.up("KeyW"); }
  } else {
    await page.evaluate(() => {
      const life = window.storyProbe.lifecycle;
      life.resetPlayer(life.vectorFromArray([-16.75, 0, 1]), Math.PI, { persist: false });
    });
  }
  try {
    await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-allowance" || window.storyProbe.sceneErrors.length, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  } catch (error) {
    console.log(await page.evaluate(() => ({ frame: window.storyProbe.lastRegionFrame,
      character: window.storyProbe.regions?.getCharacter(), inside: [...(window.storyProbe.regions?.inside || [])],
      status: window.storyProbe.regions?.controller.status, starts: window.storyProbe.starts })));
    throw error;
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: testInfo.outputPath("allowance-playing.png") });
  if (ending === "skip") await page.keyboard.press("KeyX");
  else {
    await page.waitForTimeout(7000);
    await page.screenshot({ path: testInfo.outputPath("allowance-conversation.png") });
    await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 90_000 });
  }
  await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.allowance"]), { timeout: 30_000 }).toBe(true);
  const stateResponse = await page.request.get(`/api/characters/${character.id}/state`);
  expect(stateResponse.ok()).toBe(true);
  const state = await stateResponse.json();
  expect(state.character.yen).toBe(character.yen + 500);
  expect(state.character.storyFlags["story.s1.first-allowance.completed"]).toBe(true);
  expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const continuation = await page.evaluate(() => ({
    position: window.storyProbe.lifecycle.getController().collider.position.asArray(),
    avatar: window.storyProbe.lifecycle.playerRuntime.activeCharacterId,
  }));
  expect(continuation.avatar).toBe("ryo");
  if (freshOpening) {
    // Held walking input can continue while the request and scene prepare.
    // Prove exact restoration of the borrowed gameplay pose, rather than
    // assuming every machine stops at the first frame of the trigger volume.
    const borrowed = await page.evaluate(() => window.storyProbe.actorLeases
      .find(lease => lease.scene === "story-s1-first-allowance")?.position);
    expect(borrowed).toHaveLength(3);
    expect(Math.hypot(...continuation.position.map((value,index)=>value-borrowed[index]))).toBeLessThan(0.02);
  }
  expect(await page.evaluate(() => window.storyProbe.starts)).toEqual([
    ...(freshOpening ? openingScenes : []), "story-s1-first-allowance",
  ]);
  await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
  for (let index = 0; index < 5; index++) await page.locator("#journal-next").click();
  await expect(page.getByText(/Ine-san leaves.*500/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("earned-notebook.png") });
  await page.locator("#journal-close").click();
  if (ending === "complete") {
    await page.reload();
    await page.keyboard.press("Enter");
    await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();
    await page.locator("button").filter({ hasText: /^Enter World$/ }).click();
    await page.waitForFunction(() => window.storyProbe.ready || window.storyProbe.errors.length, null, { timeout: 120_000 });
    await page.waitForFunction(() => window.storyProbe.regions?.getCharacter()?.storyFlags?.["notebook.s1.allowance"]);
    expect(await page.evaluate(() => window.storyProbe.starts)).toEqual([]);
    expect(await page.evaluate(() => window.storyProbe.regions.getCharacter().yen)).toBe(character.yen + 500);
    const resumed = await page.evaluate(() => ({
      position: window.storyProbe.lifecycle.getController().collider.position.asArray(),
      locked: window.storyProbe.lifecycle.getController().movementLocked,
      avatar: window.storyProbe.lifecycle.playerRuntime.activeCharacterId,
    }));
    expect(Math.hypot(...resumed.position.map((value, index) => value - continuation.position[index]))).toBeLessThan(0.2);
    expect(resumed.locked).toBe(false);
    expect(resumed.avatar).toBe("ryo");
    await page.screenshot({ path: testInfo.outputPath("saved-continuation.png") });
  }
  expect(errors).toEqual([]);
  if (ending === "complete" && process.env.NEW_YOKOSUKA_DOJO_E2E === "true") {
    // Bounded continuation check: use real world loading, then place just
    // outside the dojo volume. Walking triggers it; no direct event start.
    await page.evaluate(async () => {
      const life = window.storyProbe.lifecycle;
      await life.travelToWorld("exterior");
      life.resetPlayer(life.vectorFromArray([4.6, 0.97, -17.8]), Math.PI, { persist: false });
    });
    await page.locator("#renderCanvas").focus();
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(() => window.storyProbe.starts.includes("story-s1-first-dojo"), null, { timeout: 20_000 });
    } finally { await page.keyboard.up("KeyW"); }
    await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-dojo"
      || window.storyProbe.sceneErrors.length, null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: testInfo.outputPath("first-dojo-dialogue.png") });
    await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 120_000 });
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.first-dojo.completed"])).toBe(true);
    const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(saved.character.storyFlags["notebook.s1.men-in-black"]).toBe(true);
    expect(saved.character.yen).toBe(character.yen + 500);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
    await page.locator("#journal-next").click();
    await expect(page.getByText(/Ask around to find out/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("first-dojo-notebook.png") });
    await page.locator("#journal-close").click();
    expect(errors).toEqual([]);
    if (process.env.NEW_YOKOSUKA_KITTEN_E2E === "true") {
      await page.evaluate(async () => {
        const life = window.storyProbe.lifecycle;
        await life.travelToWorld("yamanose");
        life.resetPlayer(life.vectorFromArray([36, 2.6, 45.3]), Math.PI, { persist: false });
      });
      await page.locator("#renderCanvas").focus();
      await page.keyboard.down("KeyW");
      try {
        await page.waitForFunction(() => window.storyProbe.starts.includes("story-s1-first-kitten-introduction"), null, { timeout: 20_000 });
      } finally { await page.keyboard.up("KeyW"); }
      await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-kitten-introduction", null, { timeout: 60_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: testInfo.outputPath("first-kitten-introduction.png") });
      // A permitted scene skip must lead to a real choice, not automatically
      // award the fish-only witness clue or play both incompatible endings.
      await page.keyboard.press("KeyX");
      await expect(page.getByRole("button", { name: "Dried fish", exact: true })).toBeVisible();
      const beforeChoice = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(beforeChoice.character.storyFlags["notebook.s1.yamagishi-witness"]).not.toBe(true);
      await page.screenshot({ path: testInfo.outputPath("first-kitten-food-choice.png") });
      await page.getByRole("button", { name: "Dried fish", exact: true }).click();
      await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-kitten-fish", null, { timeout: 60_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: testInfo.outputPath("first-kitten-fish.png") });
      await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 120_000 });
      await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.first-kitten.completed"])).toBe(true);
      const final = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(final.character.storyFlags["notebook.s1.black-car"]).toBe(true);
      expect(final.character.storyFlags["notebook.s1.yamagishi-witness"]).toBe(true);
      expect(final.character.yen).toBe(character.yen + 500);
      expect(await page.evaluate(() => window.storyProbe.starts.some(id => id === "story-s1-first-kitten-tofu"))).toBe(false);
      expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
      await page.locator("#journal-next").click();
      await page.locator("#journal-next").click();
      await expect(page.getByText(/Visit him at home in Sakuragaoka/)).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("first-kitten-notebook.png") });
      await page.locator("#journal-close").click();
      if (process.env.NEW_YOKOSUKA_INVESTIGATION_E2E === "true") {
        await continueWitnesses(page, testInfo, character, character.yen + 500);
      }
      expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
      expect(errors).toEqual([]);
    }
  }
});

async function continueWitnesses(page, testInfo, character, expectedYen, resumeAfterTom = false) {
  for (const [actor, world, flag] of [
    ...(resumeAfterTom ? [] : [
      ["SUMI", "sakuragaoka", "story.s1.sumiya-witness.completed"],
      ["YAMA", "sakuragaoka", "notebook.s1.dobuita-black-car"],
      ["HRSK", "dobuita", "notebook.s1.tom-witness"],
      ["TOM_", "dobuita", "notebook.s1.chinese-community"],
    ]),
    ...(process.env.NEW_YOKOSUKA_THREE_BLADES_E2E === "true" ? [
      ["UNO_", "dcha", "notebook.s1.three-blades"],
      ["ITOI", "dobuita", "notebook.s1.liu-barber"],
      ["MADA", "dtky", "story.s1.maeda-liu-referral.completed"],
      ["KYUR", "drht", "notebook.s1.liu-senior"],
      ["RKKI", "dobuita", "notebook.s1.sailors"],
    ] : []),
  ]) {
    if (resumeAfterTom && character.storyFlags?.[flag]) continue;
    if (actor === "UNO_") {
      // Use the advancing personal clock; don't bypass opening hours.
      const state = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      const target = new Date(state.worldState.gameTimeMs);
      target.setUTCHours(10, 0, 0, 0);
      const remainingGameMs = Math.max(0, target.getTime() - state.worldState.gameTimeMs);
      const remainingRealMs = remainingGameMs * state.worldState.dayLengthMs / 86_400_000;
      await expect.poll(async () => {
        const state = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
        return state.worldState.gameTimeMs;
      }, { timeout: remainingRealMs + 30_000, intervals: [2000] }).toBeGreaterThanOrEqual(target.getTime());
    }
    await page.evaluate(async world => { await window.storyProbe.lifecycle.travelToWorld(world); }, world);
    await page.waitForFunction(actor => window.storyProbe.lifecycle.scheduledActors.dialogueActor(actor), actor, { timeout: 60_000 });
    if (actor === "RKKI") {
      const position = await page.evaluate(() => window.storyProbe.lifecycle.scheduledActors.dialogueActor("RKKI").position);
      expect(Math.hypot(position[0] + 13.35, position[2] - 47.71)).toBeLessThan(0.3);
    }
    const point = await residentClickPoint(page, actor);
    await page.screenshot({ path: testInfo.outputPath(`${actor}-before-talk.png`) });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.storyProbe.dialogue?.active, null, { timeout: 15_000 });
    await page.waitForFunction(() => {
      const audio = window.storyProbe.dialogue?.audio;
      return audio && !audio.paused && audio.currentTime > 0;
    }, null, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: testInfo.outputPath(`${actor}-dialogue.png`) });
    // First voice really plays; advance the remaining original lines
    // with the supported Space control to keep this smoke test bounded.
    for (let line = 0; line < 100; line++) {
      if (await page.evaluate(flag => !!window.storyProbe.regions.getCharacter()?.storyFlags?.[flag], flag)) break;
      await page.keyboard.press("Space");
      await page.waitForTimeout(250);
    }
    await expect.poll(() => page.evaluate(flag => window.storyProbe.regions.getCharacter()?.storyFlags?.[flag], flag)).toBe(true);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(saved.character.storyFlags[flag]).toBe(true);
    expect(saved.character.yen).toBe(expectedYen);
    if (actor === "KYUR") {
      const snapshot = await (await page.request.get(`/api/characters/${character.id}/dialogue`)).json();
      expect(Buffer.from(snapshot.state.banks[2], "base64")[8] & 2).toBe(2);
    }
  }
  if (process.env.NEW_YOKOSUKA_THREE_BLADES_E2E === "true") {
    await page.evaluate(async () => { await window.storyProbe.lifecycle.travelToWorld("dobuita"); });
    await page.waitForFunction(() => window.storyProbe.lifecycle.scheduledActors.dialogueActor("RKKI"));
    const point = await residentClickPoint(page, "RKKI");
    expect(await page.evaluate(() => window.nativeDialogueHookInstalled)).toBe(true);
    const beforeNative = await page.evaluate(() => window.storyProbe.nativeStarts.length);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByText("This conversation is not available right now. Check your notebook for the next lead.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.storyProbe.nativeStarts.length)).toBe(beforeNative);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
    for (let index = 0; index < 30 && await page.locator("#journal-next").isEnabled(); index++) await page.locator("#journal-next").click();
    for(let index=0;index<30 && !await page.getByText(/Ask sailors who travel to Hong Kong or Shanghai/).isVisible() && await page.locator("#journal-previous").isEnabled();index++)await page.locator("#journal-previous").click();
    await expect(page.getByText(/Ask sailors who travel to Hong Kong or Shanghai/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("sailors-notebook.png") });
  }
}

async function residentClickPoint(page, actor) {
  // Bound travel time without fabricating a talk result: position by the
  // real scheduled NPC, then project its visible mesh for a normal click.
  await page.evaluate(actor => {
    const life = window.storyProbe.lifecycle;
    const [x, y, z] = life.scheduledActors.dialogueActor(actor).position;
    life.resetPlayer(life.vectorFromArray([x, y, z + 2]), Math.PI, { persist: false });
    const controller = life.getController();
    controller.setFirstPerson(true);
    controller.cameraYaw = 0;
    controller.cameraPitch = 0;
  }, actor);
  await page.waitForTimeout(1200);
  return page.evaluate(actor => {
    const life = window.storyProbe.lifecycle;
    const model = life.scheduledActors.dialogueActorModel(actor);
    if (!model?.renderRoot) throw new Error(`No visible body for ${actor}`);
    const bounds = model.renderRoot.getHierarchyBoundingVectors(true);
    const point = bounds.min.add(bounds.max).scale(.5);
    // Walking residents can move between positioning the player and clicking.
    // Aim at the current rendered body, not a stale root + guessed head height.
    const controller = life.getController(), position = controller.collider.position;
    controller.cameraYaw = Math.atan2(-(point.x - position.x), -(point.z - position.z));
    controller.cameraPitch = Math.atan2(position.y + controller.options.firstPersonHeadHeight - point.y,
      Math.hypot(point.x - position.x, point.z - position.z));
    controller.updateCamera(1);
    const rect = life.engine.getRenderingCanvas().getBoundingClientRect();
    const viewProjection = life.scene.activeCamera.getViewMatrix(true).multiply(life.scene.activeCamera.getProjectionMatrix(true));
    const screen = point.constructor.Project(point, viewProjection.constructor.Identity(), viewProjection,
      life.scene.activeCamera.viewport.toGlobal(life.engine.getRenderWidth(), life.engine.getRenderHeight()));
    return { x: rect.x + screen.x * rect.width / life.engine.getRenderWidth(),
      y: rect.y + screen.y * rect.height / life.engine.getRenderHeight(),
      modelCode: model.modelCode, actorPosition: life.scheduledActors.dialogueActor(actor).position,
      renderedCenter: point.asArray(), playerPosition: position.asArray(), bounds: [bounds.min.asArray(), bounds.max.asArray()] };
  }, actor);
}

async function continueNightWitnesses(page,testInfo,character) {
  const state=await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  if (new Date(state.worldState.gameTimeMs).getUTCHours()<19) {
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
    await expect(page.getByRole("button",{name:"Wait until 7 p.m.",exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath("wait-evening-choice.png")});
    await page.getByRole("button",{name:"Keep exploring",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    const declined=await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(new Date(declined.worldState.gameTimeMs).getUTCHours()).toBeLessThan(19);
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
    await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
    await expect.poll(async()=>new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs).getUTCHours()).toBe(19);
  }
  for(const [actor,world,flag] of [["JUKY","drme","notebook.s1.yong-wu"],["GRKN","dbyo","story.s1.yong-wu-liu-referral.completed"],["SAJO","dbyo","notebook.s1.heartbeats"]]) {
    await page.evaluate(async world=>{await window.storyProbe.lifecycle.travelToWorld(world);},world);
    await page.waitForFunction(actor=>window.storyProbe.lifecycle.scheduledActors.dialogueActor(actor),actor,{timeout:60_000});
    const point=await residentClickPoint(page,actor);await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
    await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:15_000});
    await page.screenshot({path:testInfo.outputPath(`${actor}-night-dialogue.png`)});
    for(let line=0;line<100;line++){if(await page.evaluate(flag=>!!window.storyProbe.regions.getCharacter()?.storyFlags?.[flag],flag))break;await page.keyboard.press("Space");await page.waitForTimeout(250);}
    await expect.poll(()=>page.evaluate(flag=>window.storyProbe.regions.getCharacter()?.storyFlags?.[flag],flag)).toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  while(await page.locator("#journal-next").isEnabled())await page.locator("#journal-next").click();
  await expect(page.getByText(/Heartbeats is in the alley across from Knocking Motorcycle Shop/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("heartbeats-notebook.png")});
  await page.locator("#journal-close").click();
  const evening=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  await page.locator("#story-wait-button").click();
  await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
  await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
  await expect.poll(async()=>new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs).getUTCDate()).toBe(new Date(evening.worldState.gameTimeMs).getUTCDate()+1);
  const morning=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(new Date(morning.worldState.gameTimeMs).getUTCHours()).toBe(8);
  expect(morning.character.storyFlags["notebook.s1.heartbeats"]).toBe(true);
  expect(morning.character.yen).toBe(character.yen);
}

async function verifyAlleyQte(page,testInfo,character) {
  const state=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  if(new Date(state.worldState.gameTimeMs).getUTCHours()<19){
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
    await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  }
  await page.evaluate(async()=>{const life=window.storyProbe.lifecycle;await life.travelToWorld("dobuita");life.resetPlayer(life.vectorFromArray([124.56,-1.8,67.4]),Math.PI,{persist:false});});
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{await page.waitForFunction(()=>window.storyProbe.starts.includes("story-s1-heartbeats-introduction")||window.storyProbe.sceneErrors.length,null,{timeout:20_000});}
  finally{await page.keyboard.up("KeyW");}
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-introduction.png")});
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready,null,{timeout:90_000});
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-prompt.png")});
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible();
  const failed=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(failed.character.storyFlags["story.s1.heartbeats-alley.completed"]).not.toBe(true);
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready&&window.storyProbe.regions.controller.dialogue.qte?.active?.steps[window.storyProbe.regions.controller.dialogue.qte.active.index]?.buttons[0]==="B",null,{timeout:90_000});
  await page.keyboard.press("Shift");
  await page.waitForFunction(()=>window.storyProbe.regions.controller.dialogue.qte?.active?.steps[window.storyProbe.regions.controller.dialogue.qte.active.index]?.buttons[0]==="A",null,{timeout:5000});
  await page.keyboard.press("Enter");
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.heartbeats-alley.completed"])).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  expect(saved.character.yen).toBe(character.yen);
}

async function verifyBarQte(page, testInfo, character) {
  expect(character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  const state = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  if (new Date(state.worldState.gameTimeMs).getUTCHours() < 19) {
    await page.locator("#story-wait-button").click();
    await page.getByRole("option", { name: "Wait until 7 p.m.", exact: true }).click();
    await page.getByRole("button", { name: "Wait until 7 p.m.", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
  }
  if (await page.evaluate(() => window.storyProbe.lifecycle.worldRuntime.activeWorld.id !== "dbhb")) {
    await enterInteriorDoor(page,{world:"dbhb",filename:"S1_D000_DR02_016.MT5",position:[124.56,-1.8,64.41],yaw:-.955742});
  }
  await page.waitForFunction(() => window.storyProbe.dialogue?.active || window.storyProbe.sceneErrors.length, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  await page.waitForFunction(() => window.storyProbe.dialogue?.audio?.currentTime > 0, null, { timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath("heartbeats-bar-introduction.png") });
  // Read the rendered cast and perform the real challenge. Space only skips
  // voice lines; it must not answer or bypass a challenge prompt.
  for (let i = 0; i < 20 && !await page.evaluate(() => !!window.storyProbe.regions.controller.active?.challengePrompt); i++) {
    await page.keyboard.press("Space"); await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => window.storyProbe.regions.controller.active?.challengePrompt?.ready);
  await page.screenshot({ path: testInfo.outputPath("heartbeats-bar-prompt.png") });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  let saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["notebook.s1.charlie"]).not.toBe(true);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  for (let i = 0; i < 20 && !await page.evaluate(() => !!window.storyProbe.regions.controller.active?.challengePrompt); i++) {
    await page.keyboard.press("Space"); await page.waitForTimeout(150);
  }
  for (const [index, button] of ["B", "A", "B", "A"].entries()) {
    await page.waitForFunction(({ index, button }) => {
      const p = window.storyProbe.regions.controller.active?.challengePrompt;
      return p?.ready && window.storyProbe.regions.controller.dialogue.qte?.active?.index === index && window.storyProbe.regions.controller.dialogue.qte?.active?.steps[window.storyProbe.regions.controller.dialogue.qte.active.index]?.buttons[0] === button;
    }, { index, button });
    await page.keyboard.press(button === "B" ? "Shift" : "Enter");
  }
  await page.waitForFunction(() => window.storyProbe.regions.controller.status === "line");
  for (let i = 0; i < 30 && !await page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie"]); i++) {
    await page.keyboard.press("Space"); await page.waitForTimeout(200);
  }
  await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie"])).toBe(true);
  expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.yen).toBe(character.yen);
  expect(saved.character.storyFlags["story.s1.heartbeats-bar.completed"]).toBe(true);
  const returned = await page.evaluate(() => ({
    position: window.storyProbe.lifecycle.getController().collider.position.asArray(),
    firstPerson: window.storyProbe.lifecycle.getController().firstPerson,
    avatar: window.storyProbe.lifecycle.playerRuntime.activeCharacterId,
    owners: window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size,
  }));
  expect(returned.avatar).toBe("ryo");
  expect(returned.owners).toBe(0);
  expect(returned.firstPerson).toBe(true);
  expect(Math.hypot(returned.position[0] + .68, returned.position[2] + 7.32)).toBeLessThan(.1);
  await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
  for (let i = 0; i < 30 && !await page.getByText(/Hato at Heartbeats told me about Charlie/).isVisible(); i++) await page.locator("#journal-next").click();
  await expect(page.getByText(/Hato at Heartbeats told me about Charlie/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("charlie-notebook.png") });
  await page.locator("#journal-close").click();
  // Room reload must not replay the encounter or leave its event-only cast.
  await page.evaluate(async () => { const life = window.storyProbe.lifecycle; await life.travelToWorld("dobuita"); await life.travelToWorld("dbhb"); });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await page.evaluate(() => window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
}

async function enterInteriorDoor(page,{world,filename,doorSelector,position,yaw=0,fromWorld="dobuita"}) {
    await page.evaluate(async ({filename,doorSelector,position,yaw,fromWorld}) => {
      const life = window.storyProbe.lifecycle;
      if(life.worldRuntime.activeWorld.id!==fromWorld)await life.travelToWorld(fromWorld);
      life.resetPlayer(life.vectorFromArray(position), yaw, { persist: false });
      // Storefronts can share one original door model. A physical selector
      // identifies its placement; a filename alone can pick another shop.
      const door = life.doorInteractions.entries.find(entry => Number.isInteger(doorSelector)
        ? entry.doorSelector===doorSelector : entry.root._filename === filename);
      if (!door) throw new Error(`Interior door ${filename} is missing`);
      const bounds = door.root.getHierarchyBoundingVectors(true), center = bounds.min.add(bounds.max).scale(.5);
      const controller = life.getController();
      controller.setFirstPerson(true);
      controller.cameraYaw = Math.atan2(-(center.x - position[0]), -(center.z - position[2]));
      controller.cameraPitch = Math.atan2(position[1]+controller.options.firstPersonHeadHeight-center.y,
        Math.hypot(center.x-position[0],center.z-position[2]));
      controller.updateCamera(1);
    },{filename,doorSelector,position,yaw,fromWorld});
    await page.waitForTimeout(800);
    const point = await page.evaluate(({filename,doorSelector}) => {
      const life = window.storyProbe.lifecycle;
      const door = life.doorInteractions.entries.find(entry => Number.isInteger(doorSelector)
        ? entry.doorSelector===doorSelector : entry.root._filename === filename);
      if (!door) throw new Error(`Interior door ${filename} is missing`);
      const bounds = door.root.getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(.5), canvas = life.engine.getRenderingCanvas(), rect = canvas.getBoundingClientRect();
      const viewProjection=life.scene.activeCamera.getViewMatrix(true).multiply(life.scene.activeCamera.getProjectionMatrix(true));
      const screen = center.constructor.Project(center, viewProjection.constructor.Identity(), viewProjection,
        life.scene.activeCamera.viewport.toGlobal(life.engine.getRenderWidth(), life.engine.getRenderHeight()));
      const pick=life.scene.pick(screen.x*rect.width/life.engine.getRenderWidth(),screen.y*rect.height/life.engine.getRenderHeight(),mesh=>Object.keys(mesh.metadata||{}).some(key=>key.startsWith('interactive')),false,life.scene.activeCamera);
      return { x: rect.x + screen.x * rect.width / life.engine.getRenderWidth(), y: rect.y + screen.y * rect.height / life.engine.getRenderHeight(),
        depth:screen.z,doorCenter:center.asArray(),playerPosition:life.getController().collider.position.asArray(),
        filename:door.root._filename,selector:door.doorSelector,type:door.type,state:door.state,
        picked:pick?.pickedMesh?.name,pickedSelector:pick?.pickedMesh?.metadata?.interactiveDoor?.doorSelector,
        transition:pick?.pickedMesh?.metadata?.interactiveMapTransition?.transition?.id };
    },{filename,doorSelector});
    console.info("Door pick",point);
    expect(point.x).toBeGreaterThan(280);expect(point.x).toBeLessThan(1025);
    expect(point.y).toBeGreaterThan(0);expect(point.y).toBeLessThan(720);
    if(Number.isInteger(doorSelector))expect(point.pickedSelector).toBe(doorSelector);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(world => window.storyProbe.lifecycle.worldRuntime.activeWorld.id === world, world, { timeout: 30_000 });
    await page.waitForFunction(()=>{const life=window.storyProbe.lifecycle;return life.worldRuntime.ready&&!life.worldRuntime.switching&&!life.playerRuntime.characterSwitching;});
}

async function verifyCharlieInquiries(page, testInfo, character) {
  expect(character.storyFlags["notebook.s1.charlie"]).toBe(true);
  const waitUntil = async (option, expectedHour) => {
    await expect.poll(() => page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.locator("#story-wait-button").click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await page.getByRole("button", { name: option, exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
    await expect.poll(() => page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    const state = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(new Date(state.worldState.gameTimeMs).getUTCHours()).toBe(expectedHour);
    expect(state.character.yen).toBe(character.yen);
  };
  // Resume the bar-earned clue, then advance the real personal clock. No
  // fabricated flags, NPC routes or script completion replies are injected.
  await waitUntil("Wait until tomorrow morning", 8);
  await waitUntil("Wait until 10 a.m.", 10);
  const talks = [
    ["ONO_", "dobuita", "story.s1.ono-charlie-jackets.completed"],
    ["TURU", "dobuita", "story.s1.tsuruoka-charlie-evening.completed"],
    ["KURI", "dobuita", "story.s1.kurita-charlie-evening.completed"],
    ["FKSM", "dobuita", "story.s1.kinuyo-nagai-referral.completed"],
    ["NGAI", "dykz", "story.s1.nagai-charlie-inquiry.completed"],
    ["TYHG", "dykz", "story.s1.hasegawa-charlie-inquiry.completed"],
    ["TOSK", "dykz", "story.s1.toshiki-charlie-hangouts.completed"],
  ];
  for (const [actor, world, flag] of talks) {
    if (actor === "NGAI") await waitUntil("Wait until 1 p.m.", 13);
    if (character.storyFlags[flag]) continue;
    await page.evaluate(async world => { await window.storyProbe.lifecycle.travelToWorld(world); }, world);
    await page.waitForFunction(actor => window.storyProbe.lifecycle.scheduledActors.dialogueActor(actor), actor, { timeout: 60_000 });
    const point = await residentClickPoint(page, actor);
    expect(point.x).toBeGreaterThan(280);
    expect(point.x).toBeLessThan(1025);
    await page.screenshot({ path: testInfo.outputPath(`charlie-${actor}-before-talk.png`) });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.storyProbe.dialogue?.active || window.storyProbe.sceneErrors.length);
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForFunction(() => {
      const audio = window.storyProbe.dialogue?.audio;
      return audio && !audio.paused && audio.currentTime > 0;
    }, null, { timeout: 15_000 });
    await page.screenshot({ path: testInfo.outputPath(`charlie-${actor}-voiced.png`) });
    for (let i = 0; i < 30 && !await page.evaluate(flag => window.storyProbe.regions.getCharacter()?.storyFlags?.[flag], flag); i++) {
      await page.keyboard.press("Space"); await page.waitForTimeout(180);
    }
    await expect.poll(() => page.evaluate(flag => window.storyProbe.regions.getCharacter()?.storyFlags?.[flag], flag)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
    await expect.poll(() => page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
  const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.yen).toBe(character.yen);
  expect(saved.character.storyFlags["notebook.s1.charlie-evening"]).toBe(true);
  expect(saved.character.storyFlags["notebook.s1.charlie-hangouts"]).toBe(true);
  await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
  for (let i = 0; i < 30 && await page.locator("#journal-next").isEnabled(); i++) await page.locator("#journal-next").click();
  await expect(page.getByText(/Charlie was seen around the jacket shop at about 7 p.m./)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("charlie-evening-notebook.png") });
  await page.locator("#journal-close").click();
  await page.reload();
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({ hasText: /^Enter World$/ }).click();
  await page.waitForFunction(() => window.storyProbe.ready, null, { timeout: 120_000 });
  const reloaded = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  for (const [, , flag] of talks) expect(reloaded.character.storyFlags[flag]).toBe(true);
  expect(reloaded.character.yen).toBe(character.yen);
  expect(reloaded.character.avatarId).toBe("ryo");
  expect(reloaded.character.worldId).toBe("dykz");
  expect(new Date(reloaded.worldState.gameTimeMs).getUTCDate()).toBe(new Date(saved.worldState.gameTimeMs).getUTCDate());
  expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

async function verifyParkingLotAmbush(page,testInfo,character) {
  expect(character.storyFlags["notebook.s1.charlie-evening"]).toBe(true);
  if(character.storyFlags["story.s1.parking-lot-ambush.completed"]) {
    await verifySavedAmbush(page,testInfo,character);
    return;
  }
  const wait=async label=> {
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.locator("#story-wait-button").click();await page.getByRole("option",{name:label,exact:true}).click();
    await page.getByRole("button",{name:label,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  };
  const hour=new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs).getUTCHours();
  if(hour>=23){await wait("Wait until tomorrow morning");await wait("Wait until 7 p.m.");}
  else if(hour<19)await wait("Wait until 7 p.m.");
  const approach=async()=> {
    await page.evaluate(async()=>{const life=window.storyProbe.lifecycle;await life.travelToWorld("dobuita");life.resetPlayer(life.vectorFromArray([-19.76,0,32]),Math.PI,{persist:false});});
    await page.waitForTimeout(500);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.status!=="idle" || window.storyProbe.starts.includes("story-parking-lot-introduction") || window.storyProbe.sceneErrors.length,null,{timeout:15_000});}
    finally{await page.keyboard.up("KeyW");}
  };
  await approach();
  await page.waitForFunction(()=>window.storyProbe.dialogue?.active || window.storyProbe.starts.includes("story-parking-lot-introduction") || window.storyProbe.sceneErrors.length);
  if(await page.getByText(/This older Story save has no date/).isVisible()) {
    await page.keyboard.press("Space");await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    const before=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(before.character.storyFlags["story.s1.parking-lot-ambush.completed"]).not.toBe(true);
    await approach();await page.waitForTimeout(1500);
    expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-parking-lot-introduction"))).toBe(false,"dating baseline cannot permit a same-night ambush");
    await wait("Wait until tomorrow morning");await wait("Wait until 7 p.m.");await approach();
  }
  for(const part of ["introduction","trap"]) {
    await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-parking-lot-${part}` || window.storyProbe.sceneErrors.length,part,{timeout:90_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForTimeout(2000);await page.screenshot({path:testInfo.outputPath(`ambush-${part}.png`)});
    await page.keyboard.press("KeyX");
  }
  await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready || window.storyProbe.sceneErrors.length,null,{timeout:60_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("ambush-fight.png")});
  // Let the real client-controlled opponents defeat an idle player, then retry.
  await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible({timeout:60_000});
  let saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["notebook.s1.tattoo-parlor"]).not.toBe(true);
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready,null,{timeout:60_000});
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyI");
  try {
    for(let i=0;i<400 && await page.evaluate(()=>!!window.storyProbe.combatRuntime?.active?.view);i++) {
      await page.keyboard.press("KeyK");await page.waitForTimeout(250);
    }
  } finally {await page.keyboard.up("KeyI");}
  const intents=await page.evaluate(()=>window.storyProbe.combatInputs);
  await testInfo.attach("combat-inputs",{body:JSON.stringify(intents),contentType:"application/json"});
  expect(intents.some(intent=>intent.guard&&intent.action==="leg")).toBe(true);
  await expect(page.getByRole("button",{name:"Ask about Charlie",exact:true})).toBeVisible({timeout:30_000});
  saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["notebook.s1.tattoo-parlor"]).not.toBe(true,"winning alone does not settle an unfinished clue conversation");
  await page.getByRole("button",{name:"Ask about Charlie",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0);await page.screenshot({path:testInfo.outputPath("ambush-interrogation.png")});
  for(let i=0;i<30 && !await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.tattoo-parlor"]);i++){await page.keyboard.press("Space");await page.waitForTimeout(200);}
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.tattoo-parlor"])).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<40 && await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.getByText(/Tony says there is a tattoo parlor in Yokosuka/)).toBeVisible();await page.screenshot({path:testInfo.outputPath("ambush-notebook.png")});
  await page.locator("#journal-close").click();
  await verifySavedAmbush(page,testInfo,character);
}

async function verifySavedAmbush(page,testInfo,character) {
  const before=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(before.character.storyFlags["story.s1.parking-lot-ambush.completed"]).toBe(true);
  expect(before.character.storyFlags["notebook.s1.tattoo-parlor"]).toBe(true);
  const starts=await page.evaluate(()=>window.storyProbe.starts.length);
  // Walk over the real trigger again. Completed progress must not replay it.
  await page.evaluate(async()=>{
    const life=window.storyProbe.lifecycle;await life.travelToWorld("dobuita");
    life.resetPlayer(life.vectorFromArray([-19.76,0,32]),Math.PI,{persist:false});
  });
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  await page.waitForTimeout(800);await page.keyboard.up("KeyW");await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>window.storyProbe.starts.length)).toBe(starts);
  expect(await page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  await page.reload();await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  const saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["notebook.s1.tattoo-parlor"]).toBe(true);
  expect(saved.character.storyFlags["story.s1.parking-lot-ambush.completed"]).toBe(true);
  expect(saved.character.avatarId).toBe("ryo");expect(saved.character.worldId).toBe("dobuita");
  expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
  expect(new Date(saved.worldState.gameTimeMs).getUTCDate()).toBe(new Date(before.worldState.gameTimeMs).getUTCDate());
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  await page.screenshot({path:testInfo.outputPath("ambush-saved-return.png")});
}

async function verifyTattooFirstVisit(page,testInfo,character) {
  expect(character.storyFlags["notebook.s1.tattoo-parlor"]).toBe(true);
  if(!character.storyFlags["story.s1.first-tattoo-visit.completed"]) {
    const state=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
    const hour=new Date(state.worldState.gameTimeMs).getUTCHours();
    if(hour<17) {
      await page.locator("#story-wait-button").click();
      await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
      await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    }
    for(const [actor,world,flag]of [["SAJO","dbyo","notebook.s1.okayama-heights"],["KURI","dobuita","notebook.s1.okayama-second-floor"]]) {
      if(character.storyFlags[flag])continue;
      await page.evaluate(async world=>window.storyProbe.lifecycle.travelToWorld(world),world);
      await page.waitForFunction(actor=>window.storyProbe.lifecycle.scheduledActors.dialogueActor(actor),actor,{timeout:60_000});
      const point=await residentClickPoint(page,actor);await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:15_000});
      await page.screenshot({path:testInfo.outputPath(`tattoo-location-${actor}.png`)});
      for(let i=0;i<30&&!await page.evaluate(flag=>window.storyProbe.regions.getCharacter()?.storyFlags?.[flag],flag);i++) {
        await page.keyboard.press("Space");await page.waitForTimeout(180);
      }
      await expect.poll(()=>page.evaluate(flag=>window.storyProbe.regions.getCharacter()?.storyFlags?.[flag],flag)).toBe(true);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    }
    // Use the actual upstairs door, transition authorization, arrival and
    // automatic room-entry trigger. Only the exterior approach is shortened.
    // A resumed checkpoint may already be inside with its automatic event
    // starting. Let that owned entry continue instead of racing it with a
    // test-only travel reset. The retry below still exercises the actual door.
    if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id!=="tatq")) {
      await enterInteriorDoor(page,{world:"tatq",filename:"S1_D000_DR01_007.MT5",position:[100.4,2.7724,99.9],yaw:2.181661565});
    }
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    expect(await page.evaluate(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug)).toBe("story-s1-first-tattoo-visit");
    expect(await page.evaluate(()=>!!window.storyProbe.lifecycle.scheduledActors.dialogueActor("HORS"))).toBe(true);
    const artist=await page.evaluate(()=>{
      const actor=window.storyProbe.authoredScene.actors.activeActor("HORS"),model=actor.model;
      const bounds=model.renderRoot.getHierarchyBoundingVectors(true);
      return {position:actor.root.position.asArray(),rootEnabled:actor.root.isEnabled(),renderEnabled:model.renderRoot.isEnabled(),
        occlusionCulled:model.occlusionRenderCulled,modelCode:model.modelCode,bounds:[bounds.min.asArray(),bounds.max.asArray()]};
    });
    console.info("Staged tattoo artist",artist);expect(artist.renderEnabled).toBe(true);
    await page.screenshot({path:testInfo.outputPath("tattoo-first-visit.png")});
    await page.keyboard.press("KeyX");
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    const cancelled=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(cancelled.character.storyFlags["notebook.s1.charlie-return-tomorrow"]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
    await enterInteriorDoor(page,{world:"tatq",filename:"S1_D000_DR01_007.MT5",position:[100.4,2.7724,99.9],yaw:2.181661565});
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    for(let i=0;i<35&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie-return-tomorrow"]);i++) {
      await page.keyboard.press("Space");await page.waitForTimeout(180);
    }
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie-return-tomorrow"])).toBe(true);
  }
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.worldId).toBe("tatq");expect(saved.character.yen).toBe(character.yen);
  expect(saved.character.currentHp).toBe(character.currentHp);
  expect(saved.character.storyFlags["story.s1.first-tattoo-visit.completed"]).toBe(true);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<40&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.getByText(/Takashiro told me to come back tomorrow/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("tattoo-tomorrow-notebook.png")});
  await page.locator("#journal-close").click();
  await page.reload();await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const reloaded=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(reloaded.character.storyFlags["notebook.s1.charlie-return-tomorrow"]).toBe(true);
  expect(reloaded.character.worldId).toBe("tatq");expect(reloaded.character.avatarId).toBe("ryo");
}

async function verifyCharlieConfrontation(page,testInfo,character) {
  expect(character.storyFlags["notebook.s1.tattoo-parlor"]).toBe(true);
  const waitUntil=async label=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.locator("#story-wait-button").click();await page.getByRole("option",{name:label,exact:true}).click();
    await page.getByRole("button",{name:label,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  };
  await page.waitForFunction(()=>window.storyProbe.automatic?.attempted&&!window.storyProbe.automatic.pending,null,{timeout:60_000});
  if(await page.evaluate(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug!=="story-s1-charlie-tattoo-confrontation")) {
    await waitUntil("Wait until tomorrow morning");await waitUntil("Wait until 2 p.m.");
    await enterInteriorDoor(page,{world:"tatq",filename:"S1_D000_DR01_007.MT5",position:[100.4,2.7724,99.9],yaw:2.181661565});
  }
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("charlie-parlor-introduction.png")});
  const toChallenge=async()=>{
    for(let i=0;i<30&&!await page.evaluate(()=>window.storyProbe.regions.controller.active?.challengePrompt||window.storyProbe.sceneErrors.length);i++) {
      await page.keyboard.press("Space");await page.waitForTimeout(200);
    }
    await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  await toChallenge();await page.screenshot({path:testInfo.outputPath("charlie-parlor-challenge.png")});
  await page.keyboard.press("ArrowRight");await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible();
  let saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["notebook.s1.charlie-cartel-appointment"]).not.toBe(true);
  await page.getByRole("button",{name:"Try again",exact:true}).click();await toChallenge();
  for(const [index,button,key]of [[0,"Left","ArrowLeft"],[1,"A","Enter"]]) {
    await page.waitForFunction(({index,button})=>{
      const p=window.storyProbe.regions.controller.active?.challengePrompt;return p?.ready&&window.storyProbe.regions.controller.dialogue.qte?.active?.index===index&&window.storyProbe.regions.controller.dialogue.qte?.active?.steps[window.storyProbe.regions.controller.dialogue.qte.active.index]?.buttons[0]===button;
    },{index,button});await page.keyboard.press(key);
  }
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0);
  await page.screenshot({path:testInfo.outputPath("charlie-parlor-appointment.png")});
  for(let i=0;i<30&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie-cartel-appointment"]);i++) {
    await page.keyboard.press("Space");await page.waitForTimeout(200);
  }
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie-cartel-appointment"])).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<50&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.getByText(/Charlie promised to arrange a meeting/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("charlie-cartel-notebook.png")});
}

async function verifyNozomiAfterParlor(page,testInfo,character) {
  expect(character.storyFlags["story.s1.charlie-tattoo-confrontation.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.nozomi-after-parlor.completed"]).not.toBe(true);
  const before=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  // Real return-door authorization when resuming in the parlor. A previous
  // interrupted check may have saved the eligible Dobuita approach instead:
  // let its already-starting scene continue, don't race it with test travel.
  if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="tatq")) {
    await enterInteriorDoor(page,{world:"dobuita",fromWorld:"tatq",filename:"S1_TATQ_DR01_017.MT5",position:[-2.2,0,1.5]});
  }
  const walkIntoRegion=async()=>{
    // Shorten the stair traversal to its lower approach, then use actual W
    // movement and the spatial trigger. No script reply/flag is injected.
    await page.evaluate(()=>{
      const life=window.storyProbe.lifecycle;
      life.resetPlayer(life.vectorFromArray([101.3,0,100.8]),Math.PI,{persist:false});
      const controller=life.getController();controller.setFirstPerson(true);
      controller.cameraYaw=0;controller.cameraPitch=.1;controller.updateCamera(1);
    });
    await page.waitForFunction(()=>!window.storyProbe.regions.inside.has("s1.d000.nozomi-after-parlor"));
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-nozomi-after-parlor"
        ||window.storyProbe.sceneErrors.length,null,{timeout:20_000});
    } catch(error) {
      console.info("Nozomi approach",await page.evaluate(()=>({frame:window.storyProbe.lastRegionFrame,
        region:window.storyProbe.regions.regions.find(r=>r.id==="s1.d000.nozomi-after-parlor"),
        eligible:window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.charlie-tattoo-confrontation.completed"],inside:[...window.storyProbe.regions.inside],
        status:window.storyProbe.regions.controller.status,starts:window.storyProbe.starts})));
      throw error;
    } finally {await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  if(await page.evaluate(()=>window.storyProbe.regions.inside.has("s1.d000.nozomi-after-parlor"))) {
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-nozomi-after-parlor"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  } else await walkIntoRegion();
  await page.waitForTimeout(3500);
  await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
    .some(record=>record.kind==="voice"&&record.command.audio.voiceId.startsWith("01YOB")&&record.audio.currentTime>0&&!record.audio.paused),null,{timeout:15_000});
  await page.screenshot({path:testInfo.outputPath("nozomi-after-parlor-before-cancel.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-owned-scene"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const cancelled=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(cancelled.character.storyFlags["notebook.s1.nozomi-worried"]).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  await walkIntoRegion();await page.waitForTimeout(7000);
  await page.screenshot({path:testInfo.outputPath("nozomi-after-parlor-original-scene.png")});
  // Natural ending verifies the actual timeline, not a test-forged success.
  // A separate replay from the earned pre-scene checkpoint also covers the
  // supported explicit cinematic skip; it is not substituted for that check.
  if(process.env.NEW_YOKOSUKA_NOZOMI_PARLOR_SKIP==="true")await page.keyboard.press("KeyX");
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.nozomi-worried"]),{timeout:100_000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const returned=await page.evaluate(()=>({position:window.storyProbe.lifecycle.getController().collider.position.asArray(),
    firstPerson:window.storyProbe.lifecycle.getController().firstPerson,
    owners:window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size}));
  expect(returned.firstPerson).toBe(true);expect(returned.owners).toBe(0);
  expect(returned.position[0]).toBeCloseTo(101.3,1);
  expect(returned.position[2]).toBeGreaterThan(99.5);
  const saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["story.s1.nozomi-after-parlor.completed"]).toBe(true);
  expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
  expect(new Date(saved.worldState.gameTimeMs).getUTCDate()).toBe(new Date(before.worldState.gameTimeMs).getUTCDate());
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<60&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.getByText(/Nozomi came looking for me near Okayama Heights/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("nozomi-concern-notebook.png")});
  await page.locator("#journal-close").click();
  await page.reload();await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-nozomi-after-parlor"))).toBe(false);
  const reloaded=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(reloaded.character.storyFlags["notebook.s1.nozomi-worried"]).toBe(true);
  expect(reloaded.character.worldId).toBe("dobuita");expect(reloaded.character.avatarId).toBe("ryo");
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

async function verifyDojoAndChineseLetter(page,testInfo,character) {
  expect(character.storyFlags["story.s1.charlie-tattoo-confrontation.completed"]).toBe(true);
  const savedState=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const waitScene=async id=>{
    await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
      .some(r=>r.kind==="voice"&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:30_000});
  };
  if(!character.storyFlags["story.s1.cartel-dojo.completed"]) {
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
    await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("exterior"));
    const enterDojo=async()=>{
      await page.evaluate(()=>{
        const life=window.storyProbe.lifecycle;life.resetPlayer(life.vectorFromArray([4.6,1,-16.8]),Math.PI,{persist:false});
        const c=life.getController();c.setFirstPerson(true);c.cameraYaw=0;c.updateCamera(1);
      });
      await page.waitForFunction(()=>!window.storyProbe.regions.inside.has("s1.jhd0.cartel-dojo.entrance"));
      await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
      try{await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready||window.storyProbe.sceneErrors.length,null,{timeout:30_000});}
      finally{await page.keyboard.up("KeyW");}
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    };
    await enterDojo();await page.screenshot({path:testInfo.outputPath("fuku-dojo-practice.png")});
    expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.practice)).toBe(true);
    await page.keyboard.press("KeyX");
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    let saved=await savedState();expect(saved.character.storyFlags["story.s1.ine-letter-invitation"]).not.toBe(true);
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await enterDojo();
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyI");
    try {
      for(let i=0;i<65&&await page.evaluate(()=>!!window.storyProbe.combatRuntime?.active?.view);i++) {
        await page.keyboard.press("KeyK");await page.waitForTimeout(500);
      }
    } finally {await page.keyboard.up("KeyI");}
    await waitScene("story-s1-fuku-resolve");
    expect(await page.evaluate(()=>window.storyProbe.combatInputs.some(i=>i.action==="leg"))).toBe(true);
    await page.screenshot({path:testInfo.outputPath("fuku-cartel-resolve.png")});await page.keyboard.press("KeyX");
    await waitScene("story-s1-ine-letter-invitation");
    await page.screenshot({path:testInfo.outputPath("ine-letter-invitation.png")});await page.keyboard.press("KeyX");
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.ine-letter-invitation"])).toBe(true);
    saved=await savedState();expect(saved.character.storyFlags["story.s1.cartel-dojo.completed"]).toBe(true);
    expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
  }
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("interior"));
  await waitScene("story-s1-chinese-letter");
  await page.screenshot({path:testInfo.outputPath("chinese-letter-before-cancel.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-letter"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect((await savedState()).character.storyFlags["notebook.s1.chinese-letter"]).not.toBe(true);
  await page.evaluate(async()=>{const life=window.storyProbe.lifecycle;await life.travelToWorld("exterior");await life.travelToWorld("interior");});
  await waitScene("story-s1-chinese-letter");
  await page.screenshot({path:testInfo.outputPath("chinese-letter-original-handoff.png")});
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.chinese-letter"]),{timeout:100_000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<60&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.getByText(/Ine-san gave me a mysterious letter/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("chinese-letter-notebook.png")});await page.locator("#journal-close").click();
  await page.reload();await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  await page.waitForTimeout(1000);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-chinese-letter"))).toBe(false);
  const saved=await savedState();expect(saved.character.storyFlags["notebook.s1.chinese-letter"]).toBe(true);
  expect(saved.character.worldId).toBe("interior");expect(saved.character.avatarId).toBe("ryo");
  expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

async function verifyFukuLetterGate(page,testInfo,character) {
  expect(character.storyFlags["story.s1.chinese-letter.completed"]).toBe(true);
  // A separately selected presentation check replays only the already-earned
  // scene. It is not a fake server completion or evidence of new progression.
  if(process.env.NEW_YOKOSUKA_FUKU_GATE_PRESENTATION_E2E === "true") {
    await page.evaluate(async()=>{
      const {createScriptEventPresentationCatalog}=await import('/play/scripts/ScriptEventPresentationCatalog.js');
      const cutscene=createScriptEventPresentationCatalog().activity('s1.jhd0.fuku-letter-gate.scene').cutscene;
      window.storyProbe.director.start(cutscene).catch(e=>window.storyProbe.sceneErrors.push(e.message));
    });
    await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.presentation?.active?.currentFrame>425,null,{timeout:30_000});
    expect(await page.evaluate(()=>{
      const r=window.storyProbe.director.activeCutscene.packageRuntime;
      return r.attachedObjects.objects.get('TEGS').root.isEnabled()&&r.attachedObjects.active.frame>=425;
    })).toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.director.activeCutscene.packageRuntime.attachedObjects.objects.get('TEGS').root.getChildMeshes()
      .filter(m=>m.getTotalVertices()>0).every(m=>!!m.material?.diffuseTexture))).toBe(true);
    await page.screenshot({path:testInfo.outputPath('fuku-gate-letter-probe.png')});
    await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.presentation?.active?.currentFrame>560,null,{timeout:10_000});
    await page.screenshot({path:testInfo.outputPath('fuku-gate-letter-front.png')});
    await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.presentation?.active?.currentFrame>805,null,{timeout:20_000});
    expect(await page.evaluate(()=>window.storyProbe.director.activeCutscene.packageRuntime.attachedObjects.objects.get('TEGS').root.isEnabled())).toBe(false);
    await page.keyboard.press('KeyX');
    await expect.poll(()=>page.evaluate(()=>!!window.storyProbe.director.activeCutscene)).toBe(false);
    return;
  }
  expect(character.storyFlags["story.s1.fuku-letter-gate.completed"]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("exterior"));
  const enter=async()=>{
    await page.evaluate(()=>{
      const life=window.storyProbe.lifecycle;
      // Bound the walk, not its outcome: actual movement/collision/presence
      // must cross the authored gate volume and start the server event.
      life.resetPlayer(life.vectorFromArray([.8,0,1]),0,{persist:false});
      const c=life.getController();c.setFirstPerson(true);c.cameraYaw=Math.PI;c.updateCamera(1);
    });
    await page.waitForFunction(()=>!window.storyProbe.regions.inside.has("s1.jhd0.fuku-letter-gate"));
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-fuku-letter-gate"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});}
    finally{await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
      .some(r=>r.kind==="voice"&&r.command.audio.voiceId.startsWith("A0139")&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:15_000});
  };
  await enter();await page.screenshot({path:testInfo.outputPath("fuku-letter-gate-before-cancel.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-gate"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  const state=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  expect((await state()).character.storyFlags["story.s1.fuku-letter-gate.completed"]).not.toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await enter();await page.waitForTimeout(14000);
  await page.screenshot({path:testInfo.outputPath("fuku-letter-gate-original-scene.png")});
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.fuku-letter-gate.completed"]),{timeout:60_000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().firstPerson)).toBe(true);
  const saved=await state();expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
  expect(saved.inventory.filter(i=>i.key==="chinese_letter").map(i=>i.quantity)).toEqual([1]);
  await page.reload();await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  await page.waitForTimeout(1000);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-fuku-letter-gate"))).toBe(false);
  expect((await state()).character.storyFlags["story.s1.fuku-letter-gate.completed"]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

async function verifyGaoRescue(page,testInfo,character) {
  expect(character.storyFlags["story.s1.fuku-letter-gate.completed"]).toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const scene=async id=>{
    await page.waitForFunction(id=>window.storyProbe.authoredScene?.active?.scene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:60_000});
    await noErrors();
  };
  const advanceTo=async type=>{
    for(let i=0;i<40&&!await page.evaluate(type=>type==="combat"?!!window.storyProbe.combatRuntime?.active?.view:!!window.storyProbe.regions.controller.active?.challengePrompt,type);i++){
      await page.keyboard.press('Space');await page.waitForTimeout(180);
    }
    await page.waitForFunction(type=>(type==="combat"?window.storyProbe.combatRuntime?.active?.view?.ready:window.storyProbe.regions.controller.active?.challengePrompt?.ready)||window.storyProbe.sceneErrors.length,type,{timeout:30_000});
    await noErrors();
  };
  if(!character.storyFlags["story.s1.gao-rescue.completed"]){
    const hour=new Date((await saved()).worldState.gameTimeMs).getUTCHours();
    if(hour>=23||hour<8){
      await page.locator('#story-wait-button').click();await page.getByRole('option',{name:'Wait until tomorrow morning',exact:true}).click();
      await page.getByRole('button',{name:'Wait until tomorrow morning',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    }
    await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld('sakuragaoka'));
    await scene('s1.jd00.gao-introduction');
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:20_000});
    await page.screenshot({path:testInfo.outputPath('gao-original-cast.png')});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-gao'));
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
    expect((await saved()).character.storyFlags['notebook.s1.gao-wen']).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
    await page.evaluate(async()=>{await window.storyProbe.lifecycle.travelToWorld('yamanose');await window.storyProbe.lifecycle.travelToWorld('sakuragaoka');});
    await scene('s1.jd00.gao-introduction');await advanceTo('combat');
    await page.screenshot({path:testInfo.outputPath('gao-three-opponent-fight.png')});
    expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.actors.length)).toBe(4);
    const lostToken=await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.token);
    await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible({timeout:60_000});
    expect((await saved()).character.storyFlags['notebook.s1.gao-wen']).not.toBe(true);
    await page.getByRole('button',{name:'Try again',exact:true}).click();await advanceTo('combat');
    await page.waitForFunction(old=>{
      const view=window.storyProbe.combatRuntime?.active?.view,owner=window.storyProbe.combatRuntime.active;
      return view?.ready&&view.token!==old&&owner?.token===view.token&&owner.view.ready&&!!owner.input;
    },lostToken,{timeout:30_000});
    await page.locator('#renderCanvas').focus();await page.keyboard.down('KeyI');
    await page.keyboard.down('KeyS');await page.waitForTimeout(350);await page.keyboard.up('KeyS');
    const heldMovement=new Set();
    try {
      for(let i=0;i<1600&&await page.evaluate(()=>!!window.storyProbe.combatRuntime?.active?.view);i++) {
        // Read the authoritative positions, then use physical keyboard input.
        // Standing still against three attackers is not a guaranteed victory.
        const keys=await page.evaluate(()=>{
          const runtime=window.storyProbe.combatRuntime,view=runtime.active?.view;
          if(!view)return [];
          const player=view.actors[0];
          const opponents=view.actors.slice(1).filter(actor=>actor.health>0)
            .sort((a,b)=>Math.hypot(player.x-a.x,player.z-a.z)-Math.hypot(player.x-b.x,player.z-b.z));
          const enemy=opponents[0];if(!enemy)return [];
          const distance=Math.hypot(player.x-enemy.x,player.z-enemy.z);if(distance>=.9)return [];
          const x=(player.x-enemy.x)/Math.max(.01,distance),z=(player.z-enemy.z)/Math.max(.01,distance);
          const yaw=runtime.encounter.playerTargetYaw()+Math.PI,bindings=runtime.active.input.getBindings();
          const forward=-Math.sin(yaw)*x-Math.cos(yaw)*z,side=Math.cos(yaw)*x-Math.sin(yaw)*z;
          return [Math.abs(forward)>.25?(forward>0?bindings.up:bindings.down):null,
            Math.abs(side)>.25?(side>0?bindings.right:bindings.left):null].filter(Boolean);
        });
        for(const key of heldMovement)if(!keys.includes(key)){await page.keyboard.up(key);heldMovement.delete(key);}
        for(const key of keys)if(!heldMovement.has(key)){await page.keyboard.down(key);heldMovement.add(key);}
        await page.keyboard.press('KeyK');await page.waitForTimeout(80);
      }
    } finally {
      await page.keyboard.up('KeyI');for(const key of heldMovement)await page.keyboard.up(key);
    }
    await testInfo.attach('gao-combat-inputs',{body:JSON.stringify(await page.evaluate(()=>({
      intents:window.storyProbe.combatInputs.slice(-12),view:window.storyProbe.combatRuntime?.active?.view,
      held:[...(window.storyProbe.combatRuntime.active?.input?.held||[])],errors:window.storyProbe.sceneErrors,
    }))),contentType:'application/json'});
    await noErrors();
    expect(await page.evaluate(()=>window.storyProbe.combatInputs.some(intent=>intent.guard&&intent.action==='leg'))).toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.combatInputs.some(intent=>Math.hypot(intent.moveX,intent.moveZ)>0))).toBe(true);
    await scene('s1.jd00.gao-hostage');await page.screenshot({path:testInfo.outputPath('gao-hostage-with-ball.png')});await advanceTo('challenge');
    expect((await saved()).character.storyFlags['notebook.s1.gao-wen']).not.toBe(true);
    await page.keyboard.press('Shift');
    await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Try again',exact:true}).click();await advanceTo('challenge');
    await page.locator('button[data-challenge-button="A"]').click();await scene('s1.jd00.gao-kick');
    await page.waitForTimeout(4900);await page.screenshot({path:testInfo.outputPath('gao-original-kick.png')});
    await scene('s1.jd00.gao-aftermath');await page.screenshot({path:testInfo.outputPath('gao-original-thanks.png')});
    for(let i=0;i<30&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.gao-wen']);i++){
      await page.keyboard.press('Space');await page.waitForTimeout(200);
    }
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.gao-wen'])).toBe(true);
  }
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  const hour=new Date((await saved()).worldState.gameTimeMs).getUTCHours();
  if(hour>=19||hour<9){
    await page.locator('#story-wait-button').click();await page.getByRole('option',{name:'Wait until tomorrow morning',exact:true}).click();
    await page.getByRole('button',{name:'Wait until tomorrow morning',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld('dobuita'));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor('KKBN'),null,{timeout:60_000});
  const point=await residentClickPoint(page,'KKBN');await page.mouse.click(point.x,point.y);
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:15_000});
  await page.screenshot({path:testInfo.outputPath('gao-russiya-referral.png')});
  for(let i=0;i<30&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.russiya-translator']);i++){
    await page.keyboard.press('Space');await page.waitForTimeout(200);
  }
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.russiya-translator'])).toBe(true);
  const state=await saved();expect(state.character.yen).toBe(character.yen);expect(state.character.currentHp).toBe(character.currentHp);
  expect(state.inventory.filter(i=>i.key==='chinese_letter').map(i=>i.quantity)).toEqual([1]);
  await page.locator('button').filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<60&&await page.locator('#journal-next').isEnabled();i++)await page.locator('#journal-next').click();
  await expect(page.getByText(/Gao Wen's grandmother, Xia Xiu Yu/)).toBeVisible();await page.screenshot({path:testInfo.outputPath('gao-translator-notebook.png')});
  await page.locator('#journal-close').click();await page.reload();await page.keyboard.press('Enter');
  await page.locator('.account-entry-actions button').filter({hasText:'Quick Play'}).click();await page.locator('.character-slot-button:not(.empty)').first().click();
  await page.locator('button').filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags['notebook.s1.russiya-translator']).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

async function verifyXiaTranslation(page,testInfo,character) {
  expect(character.storyFlags['story.s1.gao-rescue.completed']).toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  if(!character.storyFlags['story.s1.xia-letter-translation.completed']){
  const hour=new Date((await saved()).worldState.gameTimeMs).getUTCHours();
  if(hour>=21||hour<9){
    await page.locator('#story-wait-button').click();await page.getByRole('option',{name:'Wait until tomorrow morning',exact:true}).click();
    await page.getByRole('button',{name:'Wait until tomorrow morning',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
  const enter=()=>enterInteriorDoor(page,{world:'drsa',filename:'S1_D000_DR15_011.MT5',doorSelector:1,position:[40.5,.0724,75.6]});
  const scene=async()=>{
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==='story-s1-xia-letter-translation'||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    await noErrors();
    await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
      .some(r=>r.kind==='voice'&&r.command.audio.voiceId.startsWith('A0142B')&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:25_000});
  };
  // A restored pre-translation save may already be inside the shop. Let its
  // automatic entry finish starting before cancelling/re-entering; don't
  // force test travel concurrently with that legitimate startup event.
  if(character.worldId!=='drsa')await enter();
  await scene();await page.screenshot({path:testInfo.outputPath('xia-original-greeting.png')});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-xia'));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
  expect((await saved()).character.storyFlags['notebook.s1.translated-letter']).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await enter();await scene();
  await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.presentation?.active?.currentFrame>1920||window.storyProbe.sceneErrors.length,null,{timeout:100_000});
  await noErrors();await page.screenshot({path:testInfo.outputPath('xia-original-letter-presented.png')});
  await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.presentation?.active?.currentFrame>2100||window.storyProbe.sceneErrors.length,null,{timeout:100_000});
  await noErrors();
  const prop=await page.evaluate(()=>{
    const runtime=window.storyProbe.director.activeCutscene.packageRuntime,root=runtime.attachedObjects.objects.get('TEGS').root;
    return {enabled:root.isEnabled(),frame:runtime.attachedObjects.active.frame,
      textured:root.getChildMeshes().filter(m=>m.getTotalVertices()>0).every(m=>!!m.material?.diffuseTexture)};
  });
  expect(prop.enabled).toBe(true);expect(prop.frame).toBeGreaterThan(2100);expect(prop.textured).toBe(true);
  await page.screenshot({path:testInfo.outputPath('xia-original-letter-handover.png')});
  await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.presentation?.active?.currentFrame>3350||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
  await noErrors();await page.screenshot({path:testInfo.outputPath('xia-original-translation.png')});
  await page.waitForFunction(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.translated-letter']||window.storyProbe.sceneErrors.length,null,{timeout:100_000});
  await noErrors();const state=await saved();
  expect(state.character.storyFlags['story.s1.xia-letter-translation.completed']).toBe(true);
  expect(state.character.yen).toBe(character.yen);expect(state.character.currentHp).toBe(character.currentHp);
  expect(state.inventory.filter(i=>i.key==='chinese_letter').map(i=>i.quantity)).toEqual([1]);
  expect(state.character.worldId).toBe('drsa');expect(state.character.avatarId).toBe('ryo');
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().firstPerson)).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
  expect(Math.hypot(position[0]+3.2,position[2]+.75)).toBeLessThan(.1);
  }
  const committed=await saved();
  expect(committed.character.storyFlags['notebook.s1.translated-letter']).toBe(true);
  expect(committed.character.worldId).toBe('drsa');expect(committed.character.yen).toBe(character.yen);
  expect(committed.inventory.filter(i=>i.key==='chinese_letter').map(i=>i.quantity)).toEqual([1]);
  await page.locator('button').filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<60&&await page.locator('#journal-next').isEnabled();i++)await page.locator('#journal-next').click();
  await expect(page.getByText(/Master Chen: 0468-61-5647/)).toBeVisible();await page.screenshot({path:testInfo.outputPath('xia-password-notebook.png')});
  await page.locator('#journal-previous').click();await expect(page.getByText(/Signed: Zhu Yuan Da/)).toBeVisible();
  await page.locator('#journal-close').click();await page.reload();await page.keyboard.press('Enter');
  await page.locator('.account-entry-actions button').filter({hasText:'Quick Play'}).click();await page.locator('.character-slot-button:not(.empty)').first().click();
  await page.locator('button').filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  await page.waitForTimeout(1000);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes('story-s1-xia-letter-translation'))).toBe(false);
  expect((await saved()).character.storyFlags['notebook.s1.translated-letter']).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

async function verifyWarehouseEight(page,testInfo,character) {
  expect(character.storyFlags['story.s1.goro-harbor.completed']).toBe(true);
  expect(character.storyFlags['story.s1.warehouse-eight-refusal.completed']).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const advanceUntil=async(flag)=>{for(let i=0;i<35&&!await page.evaluate(flag=>window.storyProbe.regions.getCharacter()?.storyFlags?.[flag]||window.storyProbe.sceneErrors.length,flag);i++){await page.keyboard.press('Space');await page.waitForTimeout(150);}await noErrors();await expect.poll(()=>page.evaluate(flag=>window.storyProbe.regions.getCharacter()?.storyFlags?.[flag],flag)).toBe(true);await idle();};
  const approach=async(position,yaw,slug)=>{
    await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});l.getController().setFirstPerson(false);},{position,yaw});
    await page.waitForTimeout(300);await page.locator('#renderCanvas').focus();await page.keyboard.down('KeyW');
    try{await page.waitForFunction(slug=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug===slug||window.storyProbe.sceneErrors.length,slug,{timeout:20_000});}finally{await page.keyboard.up('KeyW');}
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await noErrors();
  };
  await approach([-6,0,128],0,'story-s1-warehouse-eight-refusal');
  await page.screenshot({path:testInfo.outputPath('warehouse-front-guard.png')});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-warehouse-refusal'));await idle();
  expect((await saved()).character.storyFlags['notebook.s1.warehouse-eight-rear']).not.toBe(true);
  await approach([-6,0,128],0,'story-s1-warehouse-eight-refusal');await advanceUntil('notebook.s1.warehouse-eight-rear');
  const windowChoice=async()=>{await approach([-18.5,0,162],Math.PI,'story-s1-warehouse-eight-window');await page.keyboard.press('Space');await expect(page.getByRole('button',{name:'Climb through the rear window',exact:true})).toBeVisible();};
  await windowChoice();await page.screenshot({path:testInfo.outputPath('warehouse-rear-window-choice.png')});
  await page.getByRole('button',{name:'Leave it for now',exact:true}).click();await idle();
  expect((await saved()).character.worldId).toBe('mfsy');expect((await saved()).character.storyFlags['story.s1.warehouse-eight-window.completed']).not.toBe(true);
  await windowChoice();await page.getByRole('button',{name:'Climb through the rear window',exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==='s1.mfsy.warehouse-eight-climb'||window.storyProbe.sceneErrors.length);await noErrors();
  await page.waitForTimeout(3_000);await page.screenshot({path:testInfo.outputPath('warehouse-original-window-motion.png')});
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==='s1.ms8s.warehouse-eight-overheard'||window.storyProbe.sceneErrors.length,null,{timeout:90_000});await noErrors();
  await expect(page.locator('#loading')).toBeHidden({timeout:90_000});
  await page.screenshot({path:testInfo.outputPath('warehouse-overheard-office.png')});
  expect((await saved()).character.worldId).toBe('ms8s');
  expect((await saved()).character.storyFlags['notebook.s1.old-warehouse-eight']).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-overheard'));await idle();
  await page.reload();await page.keyboard.press('Enter');await page.locator('.account-entry-actions button').filter({hasText:'Quick Play'}).click();await page.locator('.character-slot-button:not(:disabled)').filter({hasText:character.name}).click();await page.locator('button').filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==='s1.ms8s.warehouse-eight-overheard'||window.storyProbe.sceneErrors.length,null,{timeout:90_000});await noErrors();
  await advanceUntil('notebook.s1.old-warehouse-eight');
  const final=await saved();expect(final.character.yen).toBe(character.yen);expect(final.character.currentHp).toBe(character.currentHp);expect(final.character.worldId).toBe('ms8s');
  await page.locator('button').filter({hasText:/^Notebook$/}).click();for(let i=0;i<80&&await page.locator('#journal-next').isEnabled();i++)await page.locator('#journal-next').click();
  await expect(page.getByText(/There are two Warehouse No. 8s/)).toBeVisible();await page.screenshot({path:testInfo.outputPath('warehouse-old-district-notebook.png')});await page.locator('#journal-close').click();
}

async function verifyFirstGoro(page,testInfo,character) {
  expect(character.storyFlags['story.s1.harbor-arrival.completed']).toBe(true);
  expect(character.storyFlags['story.s1.goro-harbor.completed']).not.toBe(true);
  expect(character.worldId).toBe('mfsy');
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);};
  const approach=async()=>{
    await page.evaluate(()=>{const life=window.storyProbe.lifecycle;life.resetPlayer(life.vectorFromArray([116,0,129]),Math.PI,{persist:false});life.getController().setFirstPerson(false);});
    await page.waitForTimeout(300);await page.locator('#renderCanvas').focus();await page.keyboard.down('KeyW');
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug==='story-s1-goro-harbor-encounter'||window.storyProbe.sceneErrors.length,null,{timeout:20_000});}finally{await page.keyboard.up('KeyW');}
    await noErrors();
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();
  };
  const toChallenge=async()=>{
    for(let i=0;i<40&&!await page.evaluate(()=>window.storyProbe.regions.controller.active?.challengePrompt||window.storyProbe.sceneErrors.length);i++){await page.keyboard.press('Space');await page.waitForTimeout(150);}
    await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();
  };
  await approach();await page.screenshot({path:testInfo.outputPath('goro-original-cast-introduction.png')});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-goro-introduction'));await idle();
  expect((await saved()).character.storyFlags['notebook.s1.goro-directions']).not.toBe(true);
  await approach();await toChallenge();await page.screenshot({path:testInfo.outputPath('goro-left-a-b-prompt.png')});
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
  expect((await saved()).character.storyFlags['notebook.s1.goro-directions']).not.toBe(true);
  await page.getByRole('button',{name:'Try again',exact:true}).click();await toChallenge();
  for(const [index,button,key]of [[0,'Left','ArrowLeft'],[1,'A','Enter'],[2,'B','Shift']]){
    await page.waitForFunction(({index,button})=>{const p=window.storyProbe.regions.controller.active?.challengePrompt;return p?.ready&&window.storyProbe.regions.controller.dialogue.qte?.active?.index===index&&window.storyProbe.regions.controller.dialogue.qte?.active?.steps[window.storyProbe.regions.controller.dialogue.qte.active.index]?.buttons[0]===button;},{index,button});
    await page.keyboard.press(key);
  }
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==='s1.mfsy.goro-success'||window.storyProbe.sceneErrors.length,null,{timeout:20_000});await noErrors();
  await page.waitForTimeout(900);await page.screenshot({path:testInfo.outputPath('goro-original-winning-motion.png')});
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==='s1.mfsy.goro-aftermath'||window.storyProbe.sceneErrors.length,null,{timeout:20_000});await noErrors();
  await page.screenshot({path:testInfo.outputPath('goro-original-warehouse-directions.png')});
  for(let i=0;i<30&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.goro-directions']);i++){await page.keyboard.press('Space');await page.waitForTimeout(150);await noErrors();}
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.goro-directions'])).toBe(true);await idle();
  const state=await saved();expect(state.character.yen).toBe(character.yen);expect(state.character.currentHp).toBe(character.currentHp);expect(state.character.worldId).toBe('mfsy');
  await page.locator('button').filter({hasText:/^Notebook$/}).click();for(let i=0;i<80&&await page.locator('#journal-next').isEnabled();i++)await page.locator('#journal-next').click();
  await expect(page.getByText(/Goro gave me directions/)).toBeVisible();await page.screenshot({path:testInfo.outputPath('goro-saved-notebook.png')});await page.locator('#journal-close').click();
  await page.reload();await page.keyboard.press('Enter');await page.locator('.account-entry-actions button').filter({hasText:'Quick Play'}).click();await page.locator('.character-slot-button:not(.empty)').first().click();
  await page.locator('button').filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});await expect(page.locator('#loading')).toHaveClass(/\bhidden\b/);
  expect((await saved()).character.storyFlags['notebook.s1.goro-directions']).toBe(true);expect(await page.evaluate(()=>window.storyProbe.starts.includes('story-s1-goro-harbor-encounter'))).toBe(false);
}

async function verifyHarborBus(page,testInfo,character) {
  expect(character.storyFlags['story.s1.amihama-directory.completed']).toBe(true);
  expect(character.storyFlags['story.s1.harbor-arrival.completed']).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const bus={world:'dobuita',tag:'BUS_',position:[-47,0,8],expectedChoice:'Board the bus to Amihama'};
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
  await useStoryInspectable(page,bus);
  await page.getByRole('button',{name:'Stay in Dobuita',exact:true}).click();await idle();
  expect((await saved()).character.storyFlags['story.s1.harbor-arrival.completed']).not.toBe(true);
  await useStoryInspectable(page,bus);await page.getByRole('button',{name:bus.expectedChoice,exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==='story-s1-harbor-bus'||window.storyProbe.sceneErrors.length);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath('harbor-bus-original-boarding.png')});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-bus'));await idle();
  expect((await saved()).character.storyFlags['story.s1.harbor-arrival.completed']).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await useStoryInspectable(page,bus);await page.getByRole('button',{name:bus.expectedChoice,exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==='mfsy'&&window.storyProbe.ready||window.storyProbe.sceneErrors.length,null,{timeout:120_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);await idle();
  await expect(page.locator('#loading')).toHaveClass(/\bhidden\b/);
  await page.waitForTimeout(1500);await page.screenshot({path:testInfo.outputPath('harbor-bus-saved-arrival.png')});
  await expect(page.locator('#loading-error')).not.toBeVisible();
  const arrival=await saved();expect(arrival.character.worldId).toBe('mfsy');
  expect(arrival.character.storyFlags['story.s1.harbor-arrival.completed']).toBe(true);
  expect(arrival.character.yen).toBe(character.yen);expect(arrival.character.currentHp).toBe(character.currentHp);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.actorRoot.position.y)).toBeGreaterThan(-1);
  await page.reload();await page.keyboard.press('Enter');
  await page.locator('.account-entry-actions button').filter({hasText:'Quick Play'}).click();await page.locator('.character-slot-button:not(.empty)').first().click();
  await page.locator('button').filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe('mfsy');
  await expect(page.locator('#loading')).toHaveClass(/\bhidden\b/);
  expect((await saved()).character.storyFlags['story.s1.harbor-arrival.completed']).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes('story-s1-harbor-bus'))).toBe(false);
}

async function verifyMasterChenPhone(page,testInfo,character) {
  expect(character.storyFlags['story.s1.xia-letter-translation.completed']).toBe(true);
  expect(character.storyFlags['story.s1.master-chen-phone.completed']).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  };
  const fourChoices=async()=>{
    for(let i=0;i<16&&!await page.evaluate(()=>window.storyProbe.regions.controller.active?.optionIds?.size===4);i++){
      await page.keyboard.press('Space');await page.waitForTimeout(200);await noErrors();
    }
    await expect(page.locator('#dialogue-options .dialogue-option')).toHaveCount(4);
  };
  const dobuita={world:'dobuita',tag:'TEL0',position:[-37.4,0,10.2]},home={world:'interior',tag:'TEL_',position:[-15.1,0,2.7]};
  await useStoryInspectable(page,dobuita);await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-dial'));await idle();
  expect((await saved()).character.storyFlags['notebook.s1.warehouse-eight-phone']).not.toBe(true);
  await useStoryInspectable(page,dobuita);await page.getByRole('button',{name:'Call 0468-61-5647',exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:25_000});await noErrors();
  await page.screenshot({path:testInfo.outputPath('chen-phone-dobuita-original-voice.png')});
  await fourChoices();await page.screenshot({path:testInfo.outputPath('chen-phone-password-options.png')});
  await page.locator('#dialogue-options .dialogue-option').nth(1).click();
  for(let i=0;i<10&&!await page.getByRole('button',{name:'Try again',exact:true}).isVisible();i++){await page.keyboard.press('Space');await page.waitForTimeout(200);}
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
  expect((await saved()).character.storyFlags['notebook.s1.warehouse-eight-phone']).not.toBe(true);
  await page.getByRole('button',{name:'Leave the telephone',exact:true}).click();await idle();
  await useStoryInspectable(page,home);await page.getByRole('button',{name:'Call 0468-61-5647',exact:true}).click();await fourChoices();
  await page.locator('#dialogue-options .dialogue-option').first().click();await fourChoices();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-after-password'));await idle();
  expect((await saved()).character.storyFlags['notebook.s1.warehouse-eight-phone']).not.toBe(true);
  await useStoryInspectable(page,home);await page.getByRole('button',{name:'Call 0468-61-5647',exact:true}).click();await fourChoices();
  await page.locator('#dialogue-options .dialogue-option').first().click();await fourChoices();
  await page.screenshot({path:testInfo.outputPath('chen-phone-home-second-password.png')});
  await page.locator('#dialogue-options .dialogue-option').first().click();
  for(let i=0;i<16&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.warehouse-eight-phone']);i++){await page.keyboard.press('Space');await page.waitForTimeout(200);await noErrors();}
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.warehouse-eight-phone'])).toBe(true);await idle();
  const state=await saved();expect(state.character.yen).toBe(character.yen);expect(state.character.currentHp).toBe(character.currentHp);
  expect(state.inventory.filter(i=>i.key==='chinese_letter').map(i=>i.quantity)).toEqual([1]);
  expect(state.character.worldId).toBe('interior');expect(state.character.avatarId).toBe('ryo');
  await page.locator('button').filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<60&&await page.locator('#journal-next').isEnabled();i++)await page.locator('#journal-next').click();
  await expect(page.getByText(/The man said Warehouse No. 8/)).toBeVisible();await page.screenshot({path:testInfo.outputPath('chen-phone-notebook.png')});
  await page.locator('#journal-close').click();await page.reload();await page.keyboard.press('Enter');
  await page.locator('.account-entry-actions button').filter({hasText:'Quick Play'}).click();await page.locator('.character-slot-button:not(.empty)').first().click();
  await page.locator('button').filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});await idle();
  expect((await saved()).character.storyFlags['story.s1.master-chen-phone.completed']).toBe(true);
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  const before=await page.evaluate(()=>window.storyProbe.nativeStarts.length);
  // A completed translated object declines, and cannot re-enter native state.
  await useStoryInspectable(page,{...home,expectedChoice:null});
  await idle();expect(await page.evaluate(()=>window.storyProbe.nativeStarts.length)).toBe(before);
}

async function verifyAmihamaDirectory(page,testInfo,character) {
  expect(character.storyFlags['story.s1.master-chen-phone.completed']).toBe(true);
  expect(character.storyFlags['story.s1.amihama-directory.completed']).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const book={world:'dobuita',tag:'TBK1',position:[-37.4,0,10.2],expectedChoice:null};
  const scene=async()=>{
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==='story-s1-amihama-directory'||window.storyProbe.sceneErrors.length,null,{timeout:45_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  };
  await useStoryInspectable(page,book);await scene();
  await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
    .some(r=>r.kind==='voice'&&r.command.audio.voiceId.startsWith('01TEL')&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:30_000});
  await page.screenshot({path:testInfo.outputPath('directory-original-reading-before-cancel.png')});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-directory'));await idle();
  expect((await saved()).character.storyFlags['notebook.s1.amihama']).not.toBe(true);
  await useStoryInspectable(page,book);await scene();
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.packageRuntime.presentation?.active?.currentFrame>500||window.storyProbe.sceneErrors.length,null,{timeout:30_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const opened=await page.evaluate(()=>{
    const runtime=window.storyProbe.director.activeCutscene.packageRuntime;
    const root=runtime.attachedObjects.objects.get('TBK3').root;
    const meshes=root.getChildMeshes().filter(m=>m.getTotalVertices()>0);
    return{enabled:root.isEnabled(),meshes:meshes.length,textured:meshes.every(m=>!!m.material?.diffuseTexture),
      minimumY:root.getHierarchyBoundingVectors(true).min.y,
      counterY:runtime.sceneObjects.objects.get('TBK1').explorationSnapshot.position[1]};
  });
  expect(opened.enabled).toBe(true);expect(opened.meshes).toBeGreaterThan(0);expect(opened.textured).toBe(true);
  // Reusing the standalone LOOK loop's left-hand binding placed the movie's
  // book under the counter. Its presence/material checks still passed.
  expect(opened.minimumY).toBeGreaterThan(opened.counterY);
  await page.screenshot({path:testInfo.outputPath('directory-original-open-book.png')});
  await page.waitForFunction(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.amihama']||window.storyProbe.sceneErrors.length,null,{timeout:40_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);await idle();
  const state=await saved();expect(state.character.storyFlags['story.s1.amihama-directory.completed']).toBe(true);
  expect(state.character.yen).toBe(character.yen);expect(state.character.currentHp).toBe(character.currentHp);
  expect(state.inventory.filter(i=>i.key==='chinese_letter').map(i=>i.quantity)).toEqual([1]);
  expect(state.character.worldId).toBe('dobuita');expect(state.character.avatarId).toBe('ryo');
  const restored=await page.evaluate(()=>{
    const root=window.storyProbe.lifecycle.scene.meshes.find(m=>m.metadata?.interactiveInspectable?.objectTag==='TBK1')?.metadata.interactiveInspectable.root;
    return{enabled:root?.isEnabled(),pickable:root?.getChildMeshes().some(m=>m.isPickable)};
  });
  expect(restored.enabled).toBe(true);expect(restored.pickable).toBe(true);
  await page.locator('button').filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<60&&await page.locator('#journal-next').isEnabled();i++)await page.locator('#journal-next').click();
  await expect(page.getByText(/The telephone directory lists the 61 prefix in Amihama/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('directory-amihama-notebook.png')});await page.locator('#journal-close').click();
  await page.reload();await page.keyboard.press('Enter');await page.locator('.account-entry-actions button').filter({hasText:'Quick Play'}).click();
  await page.locator('.character-slot-button:not(.empty)').first().click();await page.locator('button').filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});await idle();
  const starts=await page.evaluate(()=>window.storyProbe.nativeStarts.length);
  await useStoryInspectable(page,book);await idle();
  expect(await page.evaluate(()=>window.storyProbe.nativeStarts.length)).toBe(starts);
  expect((await saved()).character.storyFlags['notebook.s1.amihama']).toBe(true);
}

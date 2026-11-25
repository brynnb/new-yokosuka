import {verifyDobuitaDrunkard} from "./story-dobuita-drunkard.js";
import {verifyMaiAlley} from "./story-mai-alley.js";
import {verifyHisaka} from "./story-hisaka.js";
import {verifyYamagishiMirror} from "./story-yamagishi-mirror.js";
import {verifyGoroGuard} from "./story-goro-guard.js";
import {verifyHarborConversation} from "./story-harbor-conversations.js";
import {verifyFukuReturn} from "./story-fuku-return.js";
import {verifyPoetryReading} from "./story-poetry.js";
import {verifyScrollTranslation} from "./story-scroll-translation.js";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {verifyOldDistrictEntry,verifyOldDistrictStealth,verifyFirstChenMeeting} from "./story-harbor.js";
import {verifyFamilyMirrorLead,verifyBunkadoHandguard,verifyGuiZhangEncounter,verifyHandguardFamily,verifyDojoItems,verifyDojoSwitches,verifyBasementTravel} from "./story-mirror-search.js";
import {verifyBasementMirrorSearch} from "./story-basement.js";
import {verifyMirrorReturn} from "./story-mirror-return.js";
import {verifyHomeTicketPreparation,verifyAgencyQuotesAndFunds,verifyBoatTicketJourney,verifyTicketActorReplacement} from "./story-home-ticket.js";
import {verifyJimmyMorningCall,verifyChaiArcade,verifyChaiRecoveryBody,verifyChaiRecoveryReload} from "./story-arcade-ticket.js";
import {verifyJimmyChase} from "./story-jimmy-chase.js";
import {verifyHarborHiring,verifyGoroLeadNatural} from "./story-harbor-hiring.js";
import {verifyForkliftTraining} from "./story-forklift-training.js";
import {verifyChickenRace} from "./story-chicken-race.js";
import {verifyClosingCredits} from "./story-closing-credits.js";
import {verifyCalendarDeadline} from "./story-calendar-deadline.js";
import {verifyPersonalCalendar} from "./story-calendar.js";
import {verifyMorningRace,verifyMorningRaceSaved,verifyMorningRaceFromEvening} from "./story-morning-race.js";
import {verifyMorningCargo,verifyMarkLunch,verifyFirstAfternoon} from "./story-workday-one.js";
import {reviewSalaryPresentation} from "./story-salary-review.js";
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
import {verifyKittenCare} from "./story-kitten-care.js";
import {verifyKittenRoof} from "./story-kitten-roof.js";
import {verifyKittenAdoption} from "./story-kitten-adoption.js";
import {verifyKittenNozomi} from "./story-kitten-nozomi.js";
import {verifyKittenSearch} from "./story-kitten-search.js";
import {verifyYamanoseFootball} from "./story-yamanose-football.js";
import {verifyNozomiParkConfession} from "./story-nozomi-park-confession.js";
import {verifyNozomiFlowers} from "./story-nozomi-flowers.js";
import {verifyNozomiParkTears} from "./story-nozomi-park-tears.js";
import {verifyEriNozomiPark} from "./story-eri-nozomi-park.js";
import {verifyFriendsVisit} from "./story-friends-visit.js";
import {verifyFriendsBar} from "./story-friends-bar.js";
import {verifyHarborArrivalFilm} from "./story-harbor-arrival-film.js";
import { verifyEarnedHarborBus } from "./story-earned-harbor-bus.js";
import {verifyDailyAllowance} from "./story-daily-allowance.js";
import {verifyIwaoFarewellLetter} from "./story-iwao-letter.js";
import {verifyChildhoodMeal} from "./story-childhood-meal.js";
import {verifyCherryMemory} from "./story-cherry-memory.js";
import {verifyDojoFriendshipMemory} from "./story-dojo-friendship-memory.js";
import {verifyYamamotoStory} from "./story-yamamoto.js";
import {verifySavedScrollLearning} from "./story-move-learning.js";
import {placeAtHeartbeatsApproach,reviewHeartbeatsPresentation,inspectHeartbeatsMotions,inspectHeartbeatsBarMotions,reviewHeartbeatsSecondExchange} from "./story-heartbeats-presentation.js";
import { reviewStoryFaces } from "./story-face-presentation.js";
import { reviewStoryAmbient } from "./story-ambient-review.js";
import { reviewTattooIntroduction } from "./story-tattoo-presentation.js";
import { reviewStoryFight } from "./story-combat-review.js";
import { fightStoryAmbush } from "./story-fight-input.js";
import {reviewKittenChoice,verifyKittenChoice,verifyKittenHandoffCancellation} from "./story-kitten-choice.js";
import { reviewNozomiPhotoPlanes,verifyNozomiPhotoProgression } from "./story-photo-plane-review.js";

test.skip(process.env.NEW_YOKOSUKA_STORY_E2E !== "true", "requires the isolated Story prototype server and offline assets");

const resumeId = Number(process.env.NEW_YOKOSUKA_STORY_RESUME_ID || 0);
const naturalOpening = process.env.NEW_YOKOSUKA_NATURAL_OPENING_E2E === "true";
async function enterStoryWorld(page, characterName) {
  await expect(page.getByLabel("Open the New Yokosuka menu")).toBeVisible({ timeout: process.env.NEW_YOKOSUKA_FOOTBALL_E2E === "true" ? 30_000 : 120_000 });
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".character-slot-button:not(.empty)").filter({hasText:characterName}).click();
  await page.locator("button").filter({ hasText: /^Enter World$/ }).click();
}
test.afterEach(async({page},info)=>{
  if(info.status===info.expectedStatus)return;
  const state=await page.evaluate(()=>{const p=window.storyProbe,l=p?.lifecycle;return{notices:p?.notices,errors:p?.errors,sceneErrors:p?.sceneErrors,status:p?.regions?.controller.status,world:l?.worldRuntime.activeWorld.id,ready:l?.worldRuntime.ready,switching:l?.worldRuntime.switching,movementLocked:l?.getController()?.movementLocked,actorLeases:p?.actorLeases?.slice(-4),dispatches:p?.regionDispatches?.slice(-5),rejected:p?.scriptRejections,presence:p?.presencePublishes?.slice(-5)};}).catch(()=>null);
  console.info("Story failure state:",JSON.stringify(state));
});
const variants = naturalOpening ? [["complete", true]] : resumeId ? [["resume", false]] : [["complete", false], ["skip", false], ["complete", true]];
for (const [ending, freshOpening] of variants) test(resumeId ? "investigation continues from a saved checkpoint" : `first allowance renders and persists after ${ending}${freshOpening ? " from a fresh opening" : ""}`, async ({ page }, testInfo) => {
  test.setTimeout(naturalOpening ? 1_800_000 : process.env.NEW_YOKOSUKA_MIRROR_RETURN_E2E === "true" ? 600_000 : process.env.NEW_YOKOSUKA_CHEN_E2E === "true" || process.env.NEW_YOKOSUKA_FAMILY_E2E === "true" || process.env.NEW_YOKOSUKA_HANDGUARD_E2E === "true" || process.env.NEW_YOKOSUKA_GUI_ZHANG_E2E === "true" ? 360_000 : process.env.NEW_YOKOSUKA_INVESTIGATION_E2E === "true" ? 900_000 : process.env.NEW_YOKOSUKA_KITTEN_E2E === "true" ? 600_000 : freshOpening ? 480_000 : 240_000);
  if(naturalOpening&&resumeId)throw Error("Natural opening requires a newly created isolated Story character");
  const errors = [];
  if(process.env.NEW_YOKOSUKA_FOOTBALL_E2E === "true"){
    page.on("console",message=>{if(message.type()==="error")console.info("Football browser error:",message.text().slice(0,500));});
    page.on("requestfailed",request=>console.info("Football request failed:",request.url().split("?")[0],request.failure()?.errorText));
  }
  const musicResponses = [];
  if (process.env.NEW_YOKOSUKA_PHOTO_CONNECTED_E2E === "true") {
    page.on("console", message => { if (message.type() === "error") console.info("Photo test browser error:", message.text().slice(0, 500)); });
    page.on("requestfailed", request => console.info("Photo test request failed:", request.url(), request.failure()?.errorText));
  }
  page.on("response", response => { if(/bgm119|bgm063|bgm064|bgm032|bgm067|bgm070|bgm095|bgm200|bgm084|bgm013|bgm120|bgm106|bgm107|nozomi-home-cdda05/.test(response.url())) musicResponses.push({url:response.url(),status:response.status()}); });
  page.on("pageerror", error => {errors.push(error.message);console.info("Story page error:",error.message);});
  if(process.env.NEW_YOKOSUKA_SECOND_MORNING_E2E==="true"||process.env.NEW_YOKOSUKA_THIRD_WORKDAY_E2E==="true")page.on("pageerror",error=>console.info("Working morning page error:",error.message));
  if(process.env.NEW_YOKOSUKA_FORKLIFT_TRAINING_E2E==="true"||process.env.NEW_YOKOSUKA_MORNING_CARGO_E2E==="true"||process.env.NEW_YOKOSUKA_MARK_LUNCH_E2E==="true"||process.env.NEW_YOKOSUKA_FIRST_AFTERNOON_E2E==="true"){
    page.on("pageerror",error=>console.info("Story page error:",error.message));
    page.on("console",message=>{if(message.type()==="error")console.info("Story console error:",message.text().slice(0,500));});
  }
  if(process.env.NEW_YOKOSUKA_BUS_E2E === "true")page.on("console",message=>{if(message.type()==="error")console.info("Story travel browser error:",message.text());});
  const guestToken = resumeId ? process.env.NEW_YOKOSUKA_STORY_RESUME_TOKEN : process.env.NEW_YOKOSUKA_STORY_GUEST_TOKEN || randomUUID();
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
  if (process.env.NEW_YOKOSUKA_FIRST_GATE_E2E === "true") await page.addInitScript(() => {
    window.storyGateVoices=[];
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){
      if (this.src.includes("SA1082A005")) {
        const attempt={playing:false,ended:false,muted:this.muted,volume:this.volume,error:null};
        window.storyGateVoices.push(attempt);
        this.addEventListener("playing",()=>{attempt.playing=true;},{once:true});
        this.addEventListener("ended",()=>{attempt.ended=true;},{once:true});
        const result=play.apply(this,args);
        Promise.resolve(result).catch(error=>{attempt.error=error.name;});
        return result;
      }
      return play.apply(this,args);
    };
  });
  if (process.env.NEW_YOKOSUKA_GAMEPAD_QTE_E2E === "true" || process.env.NEW_YOKOSUKA_CONNECTED_GAMEPAD_QTE_E2E === "true") await page.addInitScript(() => {
    localStorage.setItem("new-yokosuka.gamepad-preferences.v1", JSON.stringify({enabled:true}));
    window.storyTestPad={id:"Standard Story Test Pad",index:0,connected:true,mapping:"standard",axes:[0,0,0,0],
      buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>[window.storyTestPad]});
  });
  if(process.env.NEW_YOKOSUKA_CARGO_TRACE_E2E === "true")await page.addInitScript(()=>{
    const original=WebSocket.prototype.send,seen=new WeakSet();
    const trace=window.storyCargoTrace={sent:[],received:[]};
    const remember=(list,value)=>{list.push(value);if(list.length>30)list.shift();};
    WebSocket.prototype.send=function(data){
      if(!seen.has(this)){
        seen.add(this);this.addEventListener("message",event=>{
          try{const m=JSON.parse(event.data);if(m.type==="cargo_state"&&m.cargo?.id?.startsWith("cargo-story-"))remember(trace.received,m.cargo);}catch{}
        });
      }
      try{const m=JSON.parse(data);if(m.type==="cargo_update"&&m.id?.startsWith("cargo-story-"))remember(trace.sent,m);}catch{}
      return original.call(this,data);
    };
  });
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
      ScriptEventController.prototype.handleRejected=function(message,...args){if(window.storyProbe)(window.storyProbe.scriptRejections||=[]).push({at:performance.now(),message,selector:this.pendingStart?.selector,frame:window.storyProbe.lastRegionFrame,presence:window.storyProbe.presencePublishes?.slice(-5)});return probeRejected.call(this,message,...args);};`],
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
      AuthoredSceneStagingRuntime.prototype.play = function(...args) {
        const p=window.storyProbe;p.authoredScene=this;
        if(p.delayKittenChoice&&args[0]?.scene?.id==='s1.ju00.first-kitten.choice'){
          const originalFactory=this.createActorSet;
          this.createActorSet=(...params)=>{this.createActorSet=originalFactory;const set=originalFactory(...params),load=set.load;
            set.load=async()=>{p.choicePreparationWaiting=true;await new Promise(resolve=>p.releaseChoicePreparation=resolve);
              try{return await load();}finally{p.choicePreparationSettled=true;}};return set;};
        }
        return probeStage.apply(this,args);
      };`],
    ["scripts/ScriptAutomaticEventRuntime", `const probeAutomatic = ScriptAutomaticEventRuntime.prototype.update;
      ScriptAutomaticEventRuntime.prototype.update = function(...args) { window.storyProbe.automatic = this; return probeAutomatic.apply(this,args); };`],
    ["cutscenes/NativeCutsceneDirector", `const probeActivityAdapter = NativeCutsceneDirector.prototype.nativeActivityAdapter;
      NativeCutsceneDirector.prototype.nativeActivityAdapter = function(...args) { window.storyProbe.director = this; return probeActivityAdapter.apply(this,args); };
      const probeStart = NativeCutsceneDirector.prototype.start;
      NativeCutsceneDirector.prototype.start = function(cutscene,...args) { window.storyProbe.director = this; window.storyProbe.starts.push(cutscene.id); return probeStart.call(this,cutscene,...args).catch(error => { window.storyProbe.sceneErrors.push(error.message); throw error; }); };`],
    ["scripts/StoryRegionRuntime", `const probeUpdate = StoryRegionRuntime.prototype.update;
      StoryRegionRuntime.prototype.update = function(...args) {
        const p=window.storyProbe,f=args[0],v=f.playerPosition,before=new Set(this.inside);
        p.regions=this;p.lastRegionFrame={...f,playerPosition:v?[v.x,v.y,v.z]:null};
        const result=probeUpdate.apply(this,args);
        if(result)(p.regionDispatches||=[]).push({at:performance.now(),frame:p.lastRegionFrame,
          entered:[...this.inside].filter(id=>!before.has(id)),flags:{...this.getCharacter()?.storyFlags}});
        return result;
      };`],
    ["scripts/NativeStoryRuntime", `const probeStoryAutomatic = NativeStoryRuntime.prototype.updateAutomatic;
      NativeStoryRuntime.prototype.updateAutomatic = function(...args) { window.storyProbe.nativeAutomatic = {enabled:args[0].enabled,status:this.scriptedEvents.status,busy:this.scriptedEvents.busy,startup:this.isStartupPresentationActive()}; return probeStoryAutomatic.apply(this,args); };`],
  ]) await page.route(`**/play/${file}.js*`, async route => {
    const response = await route.fetch({
      maxRetries: route.request().method() === "GET" ? 2 : 0,
    });
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
  // React mounts the splash asynchronously; navigation completion alone does
  // not mean its activation listener exists yet (especially on a cold Vite).
  await enterStoryWorld(page,character.name);
  const openingScenes = ["S1-OP02-00", "S1-000", "S1-OP00-MAIL", "S1-OP00-DREAM"];
  if (freshOpening) {
    // Both modes use the real director and server. The opt-in long run lets
    // each film advance without seeking or skipping, sampling rendered frames.
    for (const [index,id] of openingScenes.entries()) {
      await page.waitForFunction(id => window.storyProbe.director?.activeCutscene?.cutscene.id === id
        || window.storyProbe.errors.length || window.storyProbe.sceneErrors.length, id, { timeout: 120_000 });
      expect(await page.evaluate(() => [...window.storyProbe.errors, ...window.storyProbe.sceneErrors])).toEqual([]);
      const before = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(before.character.openingCompleted).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`${id}-${naturalOpening?"start":"before-skip"}.png`) });
      if(!naturalOpening){await page.keyboard.press("KeyX");continue;}
      const started=Date.now(),next=openingScenes[index+1];let sample=0;
      console.info(`Natural opening started ${id}`);
      while(true){
        await page.waitForTimeout(15_000);
        const state=await page.evaluate(next=>{
          const p=window.storyProbe,a=p.director?.activeCutscene,r=a?.packageRuntime;
          return {id:a?.cutscene?.id,activity:r?.activityRuntime?.active?.record?.activityId,
            frame:r?.activityRuntime?.active?.currentFrame,sceneFrame:p.lifecycle?.scene?.getFrameId(),
            nextStarted:next?p.starts.includes(next):p.ready,errors:[...p.errors,...p.sceneErrors]};
        },next);
        expect(state.errors).toEqual([]);
        if(state.nextStarted)break;
        if(Date.now()-started>900_000)throw Error(`Natural opening ${id} exceeded 15 minutes`);
        if(state.id===id){
          console.info(`Natural opening ${id}`,JSON.stringify({elapsed:Math.round((Date.now()-started)/1000),...state}));
          await page.screenshot({path:testInfo.outputPath(`${id}-natural-${String(++sample).padStart(2,"0")}.png`)});
        }
      }
    }
  }
  await page.waitForFunction(() => window.storyProbe.ready || window.storyProbe.errors.length, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.storyProbe.errors)).toEqual([]);
  await page.waitForFunction(() => window.storyProbe.regions?.getCharacter()?.id);
  if (resumeId) {
    if (process.env.NEW_YOKOSUKA_EARNED_BUS_E2E === "true") {
      test.setTimeout(720_000);
      await verifyEarnedHarborBus(page, testInfo, character, {
        walkToLandmark, verifyDirectory: verifyAmihamaDirectory, enterStoryWorld,
      });
      expect(errors).toEqual([]); return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_SWORD_INVENTORY_E2E === "true"){
      expect(detail.inventory.some(item=>item.key==="dojo_sword")).toBe(true);
      await page.locator('#inventory-button').click();
      const dialog=page.getByRole('dialog',{name:'Inventory',exact:true});
      const sword=dialog.getByRole('img',{name:'Hazuki Sword',exact:true});
      await expect(sword).toBeVisible();
      await expect.poll(()=>sword.evaluate(img=>img.complete&&img.naturalWidth)).toBe(256);
      await page.screenshot({path:testInfo.outputPath('earned-hazuki-sword-inventory.png')});
      await dialog.getByRole('button',{name:'Close inventory'}).click();
      return;
    }
    if(process.env.NEW_YOKOSUKA_TELEPHONE_MATERIAL_AUDIT_E2E === "true"){
      test.setTimeout(180_000);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe('dobuita');
      const audit=await page.evaluate(()=>{
        const roots=window.storyProbe.lifecycle.sceneState.currentMeshes.filter(root=>root._runtimePlacementRecord?.runtime?.objectTag==='TEL0');
        return roots.map(root=>({name:root.name,meshes:root.getChildMeshes().map(mesh=>({name:mesh.name,vertices:mesh.getTotalVertices(),
          textureId:mesh.metadata?.mt5TextureId,hasTexture:!!mesh.material?.diffuseTexture,
          material:mesh.material?.name,color:mesh.material?.diffuseColor?.asArray(),
          vertexColor:mesh.isVerticesDataPresent('color')}))}));
      });
      console.info('Telephone material audit:',JSON.stringify(audit));expect(audit.length).toBeGreaterThan(0);
      const visibleMeshes=audit.flatMap(root=>root.meshes).filter(mesh=>mesh.vertices>0);
      expect(visibleMeshes.length).toBeGreaterThan(0);
      expect(visibleMeshes.every(mesh=>mesh.textureId&&mesh.hasTexture)).toBe(true);
      await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController(),root=l.sceneState.currentMeshes.find(r=>r._runtimePlacementRecord?.runtime?.objectTag==='TEL0');
        const b=root.getHierarchyBoundingVectors(true),center=b.min.add(b.max).scale(.5),p=c.collider.position;
        c.setFirstPerson(true);c.cameraYaw=Math.atan2(p.x-center.x,p.z-center.z);
        c.cameraPitch=Math.atan2(p.y+c.options.firstPersonHeadHeight-center.y,Math.hypot(center.x-p.x,center.z-p.z));c.updateCamera(1);
      });
      await page.waitForTimeout(500);await page.screenshot({path:testInfo.outputPath('dobuita-original-phone-textures.png')});
      return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_DIRECTORY_E2E === "true"){
      test.setTimeout(720_000);
      await verifyAmihamaDirectory(page,testInfo,character,{earned:true});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHEN_PHONE_PRESENTATION_E2E === "true"){
      test.setTimeout(180_000);
      expect(character.storyFlags['story.s1.master-chen-phone.completed']).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe('interior');
      await page.evaluate(async()=>{const p=window.storyProbe.regions.controller.presentation;
        const root=window.storyProbe.lifecycle.sceneState.currentMeshes.find(r=>r._runtimePlacement===true&&r._runtimePlacementRecord?.runtime?.objectTag==='TEL_');
        const receiver=root?._mt5Nodes?.find(node=>(node.flag&0xffff)===3)?.mesh;
        if(!receiver)throw Error('Missing original TEL_ receiver');
        window.chenReceiverSnapshot={receiver,parent:receiver.parent,position:receiver.position.clone()};
        p.begin({area:'JOMO'});await p.execute({name:'play_sequence',arguments:[{type:'string',isStatic:true,value:'s1.jomo.master-chen-phone.start'}]});
        window.chenPhoneObserver=window.storyProbe.lifecycle.scene.onBeforeRenderObservable.add(()=>p.update(1/60));
      });
      await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath('chen-phone-held-pose.png')});
      expect(await page.evaluate(()=>{const stage=window.storyProbe.authoredScene.active,s=window.chenReceiverSnapshot;
        return stage.receiverAttached&&stage.telephoneReceiver.active.receiver===s.receiver&&s.receiver.parent!==s.parent;})).toBe(true);
      await page.evaluate(async()=>{const p=window.storyProbe.regions.controller.presentation;
        window.storyProbe.lifecycle.scene.onBeforeRenderObservable.remove(window.chenPhoneObserver);
        await p.execute({name:'play_sequence',arguments:[{type:'string',isStatic:true,value:'s1.jomo.master-chen-phone.finish'}]});p.rollback('presentation-check');
      });
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(await page.evaluate(()=>{const s=window.chenReceiverSnapshot;return s.receiver.parent===s.parent&&s.receiver.position.equalsWithEpsilon(s.position);})).toBe(true);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_CHEN_PHONE_E2E === "true"){
      test.setTimeout(720_000);
      await verifyEarnedChenPhone(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_XIA_E2E === "true"){
      test.setTimeout(720_000);
      expect(character.storyFlags['notebook.s1.russiya-translator']).toBe(true);
      await verifyXiaTranslation(page,testInfo,character,{earned:true});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_GAO_AFTERMATH_REPLAY_E2E === "true"){
      test.setTimeout(240_000);
      expect(character.storyFlags["story.s1.gao-rescue.completed"]).toBe(true);
      if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=='sakuragaoka'){
        await page.locator('#travel-button').click();await page.getByRole('option',{name:'Sakuragaoka',exact:true}).click();
      }
      await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==='sakuragaoka'&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
      // Presentation-only replay: do not alter the already committed rescue.
      await page.evaluate(async()=>{const presentation=window.storyProbe.regions.controller.presentation;
        presentation.begin({area:'JD00'});
        await presentation.execute({name:'play_sequence',arguments:[{type:'string',isStatic:true,value:'s1.jd00.gao-aftermath.start'}]});
        const scene=window.storyProbe.lifecycle.scene;
        window.gaoAftermathObserver=scene.onBeforeRenderObservable.add(()=>presentation.update(1/60));
      });
      await page.waitForTimeout(1000);
      await page.screenshot({path:testInfo.outputPath('gao-aftermath-reframed.png')});
      await page.evaluate(async()=>{const presentation=window.storyProbe.regions.controller.presentation;
        window.storyProbe.lifecycle.scene.onBeforeRenderObservable.remove(window.gaoAftermathObserver);
        await presentation.execute({name:'play_sequence',arguments:[{type:'string',isStatic:true,value:'s1.jd00.gao-aftermath.finish'}]});
        presentation.rollback('presentation-check');
      });
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(saved.character.storyFlags["story.s1.gao-rescue.completed"]).toBe(true);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_GAO_E2E === "true"){
      test.setTimeout(720_000);
      await verifyGaoRescue(page,testInfo,character,{earned:true});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_FUKU_GATE_E2E === "true"){
      test.setTimeout(420_000);
      expect(character.storyFlags["story.s1.chinese-letter.completed"]).toBe(true);
      expect(character.storyFlags["story.s1.fuku-letter-gate.completed"]).not.toBe(true);
      await page.locator("#story-wait-button").click();
      await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
      await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await enterInteriorDoor(page,{world:"exterior",filename:"S1_JOMO_DR15_016.MT5",fromWorld:"interior",reposition:false});
      await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
      await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
      const positions=[];let started=false;
      try{for(let i=0;i<100;i++){
        const state=await page.evaluate(()=>{const p=window.storyProbe,c=p.lifecycle.getController(),v=c.collider.position;
          if(p.regions.controller.status==="idle"){c.cameraYaw=Math.atan2(-(.8-v.x),-(3.2-v.z));c.updateCamera(1);}
          return {position:v.asArray(),id:p.director?.activeCutscene?.cutscene.id,errors:p.sceneErrors};});
        positions.push(state.position);expect(state.errors).toEqual([]);
        if(state.id==="story-s1-fuku-letter-gate"){started=true;break;}
        await page.waitForTimeout(300);
      }}finally{await page.keyboard.up("KeyW");}
      expect(started,`Walking from the house to the gate starts Fuku's conversation: ${JSON.stringify(positions.slice(-5))}`).toBe(true);
      console.info("Natural Fuku gate approach:",JSON.stringify({start:positions[0],end:positions.at(-1),samples:positions.length}));
      await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
        .some(r=>r.kind==="voice"&&r.command.audio.voiceId.startsWith("A0139")&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:30_000});
      await page.screenshot({path:testInfo.outputPath("earned-fuku-letter-gate.png")});
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.fuku-letter-gate.completed"]),{timeout:120_000}).toBe(true);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      let saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(saved.inventory.filter(item=>item.key==="chinese_letter").map(item=>item.quantity)).toEqual([1]);
      expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(saved.character.storyFlags["story.s1.fuku-letter-gate.completed"]).toBe(true);
      expect(saved.inventory.filter(item=>item.key==="chinese_letter").map(item=>item.quantity)).toEqual([1]);
      expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-fuku-letter-gate"))).toBe(false);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_CHINESE_LETTER_E2E === "true"){
      test.setTimeout(420_000);
      expect(character.storyFlags["story.s1.ine-letter-invitation"]).toBe(true);
      expect(character.storyFlags["story.s1.chinese-letter.completed"]).not.toBe(true);
      await walkToLandmark(page,testInfo,{world:"exterior",label:"Hazuki house door",targets:[[-1,-22.5],[-7,-22.5],[-7,4],[3,4],[3,2]]});
      await enterInteriorDoor(page,{world:"interior",filename:"S1_JHD0_DR15_016.MT5",fromWorld:"exterior",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-chinese-letter"||window.storyProbe.sceneErrors.length,null,{timeout:90_000});
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
        .some(r=>r.kind==="voice"&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:30_000});
      await page.screenshot({path:testInfo.outputPath("earned-chinese-letter.png")});
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.chinese-letter"]),{timeout:150_000}).toBe(true);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      let saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(saved.character.storyFlags["story.s1.chinese-letter.completed"]).toBe(true);
      expect(saved.inventory.filter(item=>item.key==="chinese_letter").map(item=>item.quantity)).toEqual([1]);
      expect(saved.character.yen).toBe(character.yen);expect(saved.character.currentHp).toBe(character.currentHp);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(saved.character.storyFlags["notebook.s1.chinese-letter"]).toBe(true);
      expect(saved.inventory.filter(item=>item.key==="chinese_letter").map(item=>item.quantity)).toEqual([1]);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_CARTEL_DOJO_E2E === "true"){
      test.setTimeout(720_000);
      expect(character.storyFlags["story.s1.charlie-tattoo-confrontation.completed"]).toBe(true);
      expect(character.storyFlags["story.s1.cartel-dojo.completed"]).not.toBe(true);
      const before=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs;
      await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
      await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
      await expect.poll(async()=>new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs).getUTCHours()).toBe(8);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const afterWait=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs;
      expect(Math.floor(afterWait/86_400_000)).toBe(Math.floor(before/86_400_000)+1);
      // Use the actual player-facing fast-travel picker; no test-only world or
      // position reset is used to approach the dojo.
      await page.locator("#travel-button").click();await page.getByRole("option",{name:"Hazuki Residence Grounds",exact:true}).click();
      await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="exterior"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
      const targets=[[-7,-22.5],[2,-22.5]],samples=[];let next=0,started=false;
      await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
      await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
      try{for(let i=0;i<200;i++){
        const state=await page.evaluate(([x,z])=>{const p=window.storyProbe,c=p.lifecycle.getController(),v=c.collider.position;
          if(p.regions.controller.status==="idle"){c.cameraYaw=Math.atan2(-(x-v.x),-(z-v.z));c.updateCamera(1);}
          return {position:v.asArray(),status:p.regions.controller.status,combat:!!p.combatRuntime?.active?.view?.ready,errors:p.sceneErrors};},targets[next]);
        samples.push(state.position);expect(state.errors).toEqual([]);if(state.combat){started=true;break;}
        if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<.8)next++;
        if(i>20&&state.status==="idle"&&Math.hypot(state.position[0]-samples[i-10][0],state.position[2]-samples[i-10][2])<.15)
          throw Error(`Natural cartel-dojo approach stopped: ${JSON.stringify({state,target:targets[next]})}`);
        await page.waitForTimeout(300);
      }}finally{await page.keyboard.up("KeyW");}
      expect(started,"walking onto the dojo floor starts practice").toBe(true);
      console.info("Earned cartel-dojo approach:",JSON.stringify({start:samples[0],end:samples.at(-1),samples:samples.length}));
      expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.practice)).toBe(true);
      await page.screenshot({path:testInfo.outputPath("earned-cartel-dojo-practice.png")});
      await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyI");
      try{for(let i=0;i<70&&await page.evaluate(()=>!!window.storyProbe.combatRuntime?.active?.view);i++){
        await page.keyboard.press("KeyK");await page.waitForTimeout(500);
      }}finally{await page.keyboard.up("KeyI");}
      for(const id of ["story-s1-fuku-resolve","story-s1-ine-letter-invitation"]){
        await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:150_000});
        expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
        await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
          .some(r=>r.kind==="voice"&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:30_000});
        await page.screenshot({path:testInfo.outputPath(`earned-${id}.png`)});
      }
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.ine-letter-invitation"]),{timeout:120_000}).toBe(true);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.cartel-dojo.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);expect(saved.currentHp).toBe(character.currentHp);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["story.s1.ine-letter-invitation"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_NOZOMI_DESCENT_E2E === "true"){
      test.setTimeout(420_000);
      expect(character.storyFlags["story.s1.charlie-tattoo-confrontation.completed"]).toBe(true);
      expect(character.storyFlags["notebook.s1.nozomi-worried"]).not.toBe(true);
      await enterInteriorDoor(page,{world:"dobuita",filename:"S1_TATQ_DR01_017.MT5",fromWorld:"tatq",reposition:false});
      const targets=[[101.5,101],[102.5,102.3],[103.25,103.35],[104.2,103.35],[104.2,102.45],[102.8,100.65],[101.8,99.4],[101.22,96.49]];
      await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
      await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
      const samples=[];let next=0,triggered=false;
      try{
        for(let i=0;i<300;i++){
          const state=await page.evaluate(([x,z])=>{const p=window.storyProbe,c=p.lifecycle.getController(),v=c.collider.position;
            if(p.regions.controller.status==="idle"){c.cameraYaw=Math.atan2(-(x-v.x),-(z-v.z));c.updateCamera(1);}
            return {position:v.asArray(),world:p.lifecycle.worldRuntime.activeWorld.id,status:p.regions.controller.status,
              cutscene:p.director?.activeCutscene?.cutscene.id,errors:p.sceneErrors};},targets[next]);
          samples.push(state.position);expect(state.errors).toEqual([]);expect(state.world).toBe("dobuita");
          if(state.cutscene==="story-s1-nozomi-after-parlor"){triggered=true;break;}
          if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<.45)next++;
          if(i>20&&state.status==="idle"&&Math.hypot(state.position[0]-samples[i-10][0],state.position[2]-samples[i-10][2])<.15)
            throw Error(`Natural Nozomi descent stopped: ${JSON.stringify({state,target:targets[next]})}`);
          await page.waitForTimeout(300);
        }
      }finally{await page.keyboard.up("KeyW");}
      expect(triggered,"walking down the stairs starts Nozomi's scene").toBe(true);
      console.info("Natural Nozomi descent:",JSON.stringify({start:samples[0],end:samples.at(-1),samples:samples.length}));
      await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
        .some(record=>record.kind==="voice"&&record.command.audio.voiceId.startsWith("01YOB")&&record.audio.currentTime>0&&!record.audio.paused),null,{timeout:30_000});
      await page.screenshot({path:testInfo.outputPath("earned-nozomi-parlor-scene.png")});
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.nozomi-worried"]),{timeout:150_000}).toBe(true);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.nozomi-after-parlor.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);expect(saved.currentHp).toBe(character.currentHp);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.nozomi-worried"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_CHARLIE_RETURN_E2E === "true"){
      test.setTimeout(900_000);
      expect(character.storyFlags["notebook.s1.charlie-return-tomorrow"]).toBe(true);
      expect(character.storyFlags["story.s1.charlie-tattoo-confrontation.completed"]).not.toBe(true);
      await enterInteriorDoor(page,{world:"dobuita",filename:"S1_TATQ_DR01_017.MT5",fromWorld:"tatq",reposition:false});
      // Returning on the same night must not start tomorrow's encounter.
      await enterInteriorDoor(page,{world:"tatq",doorSelector:46,fromWorld:"dobuita",reposition:false});
      await page.waitForTimeout(2500);
      expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-tattoo-introduction"))).toBe(false);
      expect(await page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
      await enterInteriorDoor(page,{world:"dobuita",filename:"S1_TATQ_DR01_017.MT5",fromWorld:"tatq",reposition:false});
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Okayama downstairs",arrivalRadius:.45,targets:[[101.5,101],[102.5,102.3],
        [103.25,103.35],[104.2,103.35],[104.2,102.45],[102.8,100.65],[101.8,99.4],[101.22,96.49]]});
      const time=async()=>new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs);
      const originalDay=(await time()).getUTCDate();
      for(const [label,hour] of [["Wait until tomorrow morning",8],["Wait until 2 p.m.",14]]){
        await page.locator("#story-wait-button").click();await page.getByRole("option",{name:label,exact:true}).click();
        await page.getByRole("button",{name:label,exact:true}).click();
        await expect.poll(async()=>(await time()).getUTCHours(),{timeout:30_000}).toBe(hour);
        await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
        await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      }
      expect((await time()).getUTCDate()).toBe(originalDay+1);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Charlie return upstairs",arrivalRadius:.45,targets:[[101.8,99.4],
        [102.8,100.65],[104.2,102.45],[104.2,103.35],[103.25,103.35],[102.5,102.3],[101.5,101],[100.4,99.9]]});
      await enterInteriorDoor(page,{world:"tatq",doorSelector:46,fromWorld:"dobuita",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-tattoo-introduction"||window.storyProbe.sceneErrors.length,null,{timeout:90_000});
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime?.activityRuntime.active?.currentFrame>=200,null,{timeout:60_000});
      await page.screenshot({path:testInfo.outputPath("earned-charlie-introduction.png")});
      // Play the original introduction without seeking; answer only the real
      // prompts, then allow the complete aftermath to finish naturally.
      await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready||window.storyProbe.sceneErrors.length,null,{timeout:180_000});
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      for(const [index,button,key]of [[0,"Left","ArrowLeft"],[1,"A","Enter"]]){
        await page.waitForFunction(({index,button})=>{const q=window.storyProbe.regions.controller.dialogue.qte?.active;
          return window.storyProbe.regions.controller.active?.challengePrompt?.ready&&q?.index===index&&q.steps[q.index]?.buttons[0]===button;},{index,button},{timeout:15_000});
        await page.keyboard.press(key);
      }
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-tattoo-aftermath"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime?.activityRuntime.active?.currentFrame>=150,null,{timeout:60_000});
      await page.screenshot({path:testInfo.outputPath("earned-charlie-aftermath.png")});
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie-cartel-appointment"]),{timeout:180_000}).toBe(true);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.charlie-tattoo-confrontation.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);expect(saved.currentHp).toBe(character.currentHp);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.charlie-cartel-appointment"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_STAIR_ROUNDTRIP_E2E === "true"){
      test.setTimeout(240_000);
      const base=await page.evaluate(async()=>{const l=window.storyProbe.lifecycle,c=l.getController(),p=c.collider.position.clone(),
        {nativeCollisionDisplacementAllowed}=await import('/src/ThirdPersonControllerRules.js'),{Vector3}=await import('/node_modules/@babylonjs/core/Maths/math.vector.js');
        const delta=new Vector3(-5,0,0),meshes=c.collisionCandidates(p,p.add(delta));
        return {handoffs:c.nativeCollisionHandoffs,roles:[...new Set(meshes.map(m=>m.metadata?.nativeCollisionFieldRole).filter(Boolean))],
          throughWall:nativeCollisionDisplacementAllowed(meshes,p,delta,c.options.playerRadius)};});
      expect(base.handoffs.length).toBeGreaterThan(0);expect(base.roles).toContain("base");expect(base.roles).not.toContain("alternate");expect(base.throughWall).toBe(false);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"stair midpoint",arrivalRadius:.4,targets:[[101.8,99.4],[102.8,100.65]]});
      const side=await page.evaluate(async()=>{const c=window.storyProbe.lifecycle.getController(),p=c.collider.position.clone(),
        {nativeCollisionDisplacementAllowed}=await import('/src/ThirdPersonControllerRules.js'),{Vector3}=await import('/node_modules/@babylonjs/core/Maths/math.vector.js');
        const delta=new Vector3(1.574,0,-1.234),meshes=c.collisionCandidates(p,p.add(delta));
        return {roles:[...new Set(meshes.map(m=>m.metadata?.nativeCollisionFieldRole).filter(Boolean))],
          throughSide:nativeCollisionDisplacementAllowed(meshes,p,delta,c.options.playerRadius)};});
      expect(side.roles).toContain("alternate");expect(side.roles).not.toContain("base");expect(side.throughSide).toBe(false);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"stair roundtrip ascent",arrivalRadius:.45,targets:[
        [104.2,102.45],[104.2,103.35],[103.25,103.35],[102.5,102.3],[101.5,101],[100.4,99.9]]});
      const top=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());expect(top[1]).toBeGreaterThan(2.5);
      await page.screenshot({path:testInfo.outputPath("stair-roundtrip-top.png")});
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"stair roundtrip descent",arrivalRadius:.45,targets:[[101.5,101],[102.5,102.3],
        [103.25,103.35],[104.2,103.35],[104.2,102.45],[102.8,100.65],[101.8,99.4],[101.22,96.49]]});
      const ground=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());expect(ground[1]).toBeLessThan(.2);
      const roles=await page.evaluate(()=>{const c=window.storyProbe.lifecycle.getController(),p=c.collider.position;return [...new Set(c.collisionCandidates(p,p).map(m=>m.metadata?.nativeCollisionFieldRole).filter(Boolean))];});
      expect(roles).toContain("base");expect(roles).not.toContain("alternate");
      await page.evaluate(()=>{const c=window.storyProbe.lifecycle.getController();c.cameraYaw=Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
      await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");await page.waitForTimeout(3500);await page.keyboard.up("KeyW");
      const stopped=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
      expect(stopped[0]).toBeLessThan(ground[0]-.5);expect(stopped[0]).toBeGreaterThan(97.2);
      await page.screenshot({path:testInfo.outputPath("stair-roundtrip-ground-wall.png")});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_TATTOO_VISIT_E2E === "true"){
      test.setTimeout(480_000);
      expect(character.storyFlags["notebook.s1.tattoo-parlor"]).toBe(true);
      expect(character.storyFlags["story.s1.first-tattoo-visit.completed"]).not.toBe(true);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Okayama upstairs",arrivalRadius:.45,targets:[[101.8,99.4],[102.8,100.65],
        [104.2,102.45],[104.2,103.35],[103.25,103.35],[102.5,102.3],[101.5,101],[100.4,99.9]]});
      const upstairs=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
      expect(upstairs[1]).toBeGreaterThan(2.5);
      await observeStoryDialogueFace(page,"HORS");
      await enterInteriorDoor(page,{world:"tatq",doorSelector:46,fromWorld:"dobuita",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug)).toBe("story-s1-first-tattoo-visit");
      await verifyObservedStoryDialogueFace(page,testInfo,"earned-tattoo-artist-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie-return-tomorrow"]),{timeout:240_000}).toBe(true);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.first-tattoo-visit.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.charlie-return-tomorrow"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_TATTOO_APPROACH_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["notebook.s1.okayama-second-floor"]).toBe(true);
      expect(character.storyFlags["story.s1.first-tattoo-visit.completed"]).not.toBe(true);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Okayama Heights stairs",maxSteps:800,targets:[[16,33],[19,35],[22,37],
        [25,39],[29,40],[39,40],[49,40],[51,43],[54,45],[58,46],[61,48],[64,50],[66,53],[67,57],
        [69,60],[69,65],[69,70],[69,75],[69,80],[73,81],[78,81],[83,81],[87,82],[91,83],[93,86],
        [97,87],[100,89],[102,92],[102,95],[101,97]]});
      await page.screenshot({path:testInfo.outputPath("earned-okayama-stairs.png")});
      console.info("Okayama approach position:",JSON.stringify(await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray())));
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_KURITA_LOCATION_E2E === "true"){
      test.setTimeout(720_000);
      expect(character.storyFlags["notebook.s1.okayama-heights"]).toBe(true);
      expect(character.storyFlags["notebook.s1.okayama-second-floor"]).not.toBe(true);
      await enterInteriorDoor(page,{world:"dobuita",filename:"S1_DBYO_DR02_017.MT5",fromWorld:"dbyo",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("KURI"),null,{timeout:60_000});
      console.info("Kurita from Saijo lead:",JSON.stringify(await page.evaluate(()=>({player:window.storyProbe.lifecycle.getController().collider.position.asArray(),actor:window.storyProbe.lifecycle.scheduledActors.dialogueActor("KURI").position}))));
      await walkToScheduledWitness(page,testInfo,"KURI","Kurita",[[101,90],[97,87],[93,86],[91,83],[87,82],[83,81],[78,81],
        [73,81],[69,80],[69,75],[69,70],[69,65],[69,60],[67,57],[66,53],[64,50],[61,48],[58,46],[54,45],[51,43],
        [49,40],[39,40],[29,40],[25,39],[19,35],[16,33],[15,31]],"dobuita",{maxSteps:800});
      const point=await residentClickPoint(page,"KURI",{reposition:false});expect(point.pickedActor).toBe("KURI");
      await observeStoryDialogueFace(page,"KURI");await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"earned-kurita-tattoo-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.okayama-second-floor"]),{timeout:180_000}).toBe(true);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.kurita-okayama-location.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.okayama-second-floor"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_SAIJO_TATTOO_E2E === "true"){
      test.setTimeout(720_000);
      expect(character.storyFlags["notebook.s1.tattoo-parlor"]).toBe(true);
      expect(character.storyFlags["notebook.s1.okayama-heights"]).not.toBe(true);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Bar Yokosuka",maxSteps:800,targets:[[-17,31],[-12,31],[-7,31],[-2,31],
        [3,31],[8,31],[13,31],[16,33],[19,35],[22,37],[25,39],[29,40],[39,40],[49,40],[51,43],[54,45],
        [58,46],[61,48],[64,50],[66,53],[67,57],[69,60],[69,65],[69,70],[69,75],[69,80],[73,81],[78,81],
        [83,81],[87,82],[91,83],[93,86],[97,87],[100,89],[102,92],[104,93]]});
      await enterInteriorDoor(page,{world:"dbyo",doorSelector:63,fromWorld:"dobuita",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("SAJO"),null,{timeout:60_000});
      await walkToLandmark(page,testInfo,{world:"dbyo",label:"Bar Yokosuka counter",targets:[[-3.6,-2.25]]});
      const point=await residentClickPoint(page,"SAJO",{reposition:false});expect(point.pickedActor).toBe("SAJO");
      await observeStoryDialogueFace(page,"SAJO");await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"earned-saijo-tattoo-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.okayama-heights"]),{timeout:180_000}).toBe(true);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.saijo-tattoo-location.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.okayama-heights"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_AMBUSH_E2E === "true"){
      test.setTimeout(900_000);
      expect(character.storyFlags["notebook.s1.charlie-evening"]).toBe(true);
      expect(character.storyFlags["story.s1.parking-lot-ambush.completed"]).not.toBe(true);
      const state=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
      if(new Date(state.worldState.gameTimeMs).getUTCHours()<19){
        await walkToLandmark(page,testInfo,{world:"dobuita",label:"Arcade ambush region",targets:[[-4,31],[-8,31],[-12,31],[-16,31.5],[-19,29.5]]});
        await page.waitForTimeout(1200);
        expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-parking-lot-introduction"))).toBe(false);
        expect(await page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
        await page.locator("#story-wait-button").click();
        await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
        await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
      }
      // Remain in the region: the personal clock, not a manufactured exit,
      // must re-arm the eligible encounter.
      for(const part of ["introduction","trap"]){
        await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-parking-lot-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:180_000});
        expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
        await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=15,null,{timeout:60_000});
        await page.screenshot({path:testInfo.outputPath(`earned-ambush-${part}.png`)});
      }
      await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready||window.storyProbe.sceneErrors.length,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      await page.screenshot({path:testInfo.outputPath("earned-ambush-fight.png")});
      for(let attempt=0;attempt<3;attempt++){
        await fightStoryAmbush(page,testInfo,{nextButton:null,artifactPrefix:`earned-ambush-${attempt+1}`});
        const outcome=page.getByRole("button",{name:/^(Ask about Charlie|Try again)$/}).first();
        await expect(outcome).toBeVisible({timeout:30_000});
        if(await page.getByRole("button",{name:"Ask about Charlie",exact:true}).isVisible())break;
        expect((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["notebook.s1.tattoo-parlor"]).not.toBe(true);
        if(attempt===2)throw new Error("Three ordinary fight attempts did not defeat the ambush");
        await page.getByRole("button",{name:"Try again",exact:true}).click();
        await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready,null,{timeout:60_000});
      }
      expect((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["notebook.s1.tattoo-parlor"]).not.toBe(true);
      await page.getByRole("button",{name:"Ask about Charlie",exact:true}).click();
      await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:15_000});
      await page.screenshot({path:testInfo.outputPath("earned-ambush-interrogation.png")});
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.tattoo-parlor"]),{timeout:180_000}).toBe(true);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.parking-lot-ambush.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);expect(saved.currentHp).toBe(character.currentHp);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.tattoo-parlor"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_TSURUOKA_E2E === "true"){
      test.setTimeout(720_000);
      expect(character.storyFlags["notebook.s1.charlie-jackets"]).toBe(true);
      expect(character.storyFlags["notebook.s1.charlie-evening"]).not.toBe(true);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("TURU"),null,{timeout:60_000});
      console.info("Tsuruoka at earned checkpoint:",JSON.stringify(await page.evaluate(()=>({player:window.storyProbe.lifecycle.getController().collider.position.asArray(),actor:window.storyProbe.lifecycle.scheduledActors.dialogueActor("TURU").position}))));
      const path=[[119,84],[118,82],[117,80],[115,77],[113,74],[111,71],[111,70],[110,70],[109,70],[108.5,70],
        [108,69],[105,68.5],[103,66.5],[102,66.5],[101,66.5],[100,66],[97,64.5],[95,64],[93,63],[88,62],[80,61],[73,61],[70,60],
        [67,57],[66,53],[64,50],[61,48],[58,46],[54,45],[51,43],[49,40],[39,40],[29,40],[25,39],[19,35],
        [16,33],[13,31],[8,31],[3,31],[-1,30]];
      const current=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
      const closest=path.reduce((best,p,index)=>Math.hypot(p[0]-current[0],p[1]-current[2])<Math.hypot(path[best][0]-current[0],path[best][1]-current[2])?index:best,0);
      await walkToScheduledWitness(page,testInfo,"TURU","Tsuruoka",path.slice(closest),"dobuita",{maxSteps:800,arrivalRadius:.5,approachRadius:3});
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Jupitor's Jackets counter",arrivalRadius:.4,targets:[[.6,31.25],[-.91,31.08]]});
      const point=await residentClickPoint(page,"TURU",{reposition:false});expect(point.pickedActor).toBe("TURU");
      await observeStoryDialogueFace(page,"TURU");await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"earned-tsuruoka-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie-evening"]),{timeout:180_000}).toBe(true);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["notebook.s1.charlie-evening"]).toBe(true);expect(saved.yen).toBe(character.yen);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.charlie-evening"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_ONO_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["notebook.s1.charlie"]).toBe(true);
      expect(character.storyFlags["notebook.s1.charlie-jackets"]).not.toBe(true);
      if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="dbhb"))
        await enterInteriorDoor(page,{world:"dobuita",filename:"S1_DBHB_DR02_016.MT5",fromWorld:"dbhb",reposition:false});
      const time=async()=>new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs);
      const labels=(await time()).getUTCHours()>=21?["Wait until tomorrow morning","Wait until 10 a.m."]:
        (await time()).getUTCHours()<10?["Wait until 10 a.m."]:[];
      for(const label of labels){
        await page.locator("#story-wait-button").click();
        await page.getByRole("option",{name:label,exact:true}).click();
        await page.getByRole("button",{name:label,exact:true}).click();
        await expect.poll(async()=>(await time()).getUTCHours(),{timeout:30_000}).toBe(label==="Wait until 10 a.m."?10:8);
        await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
        await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      }
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("ONO_"),null,{timeout:60_000});
      console.info("Ono after morning wait:",JSON.stringify(await page.evaluate(()=>({player:window.storyProbe.lifecycle.getController().collider.position.asArray(),actor:window.storyProbe.lifecycle.scheduledActors.dialogueActor("ONO_").position}))));
      await walkToScheduledWitness(page,testInfo,"ONO_","Ono",[[122,64.5],[121,65],[119.5,66],[119.5,68],[120,70],[121,72],
        [121.5,74],[122,76.5],[122,77.25],[121,77.5],[120,78.5],[119,79.5],[119,82],[119,84],[121,88]],"dobuita");
      const point=await residentClickPoint(page,"ONO_",{reposition:false});expect(point.pickedActor).toBe("ONO_");
      await observeStoryDialogueFace(page,"ONO_");await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"earned-ono-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie-jackets"]),{timeout:180_000}).toBe(true);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["notebook.s1.charlie-jackets"]).toBe(true);expect(saved.yen).toBe(character.yen);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.charlie-jackets"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_EARNED_BAR_E2E === "true"){
      test.setTimeout(480_000);
      expect(character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
      expect(character.storyFlags["notebook.s1.charlie"]).not.toBe(true);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Heartbeats door",targets:[[124,64.6]]});
      await enterInteriorDoor(page,{world:"dbhb",doorSelector:30,fromWorld:"dobuita",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:15_000});
      await page.screenshot({path:testInfo.outputPath("earned-heartbeats-bar-dialogue.png")});
      // Let the voiced introduction and aftermath run at their natural pace;
      // only the actual QTE inputs are supplied by the test.
      await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready,null,{timeout:180_000});
      for(const [index,button] of ["B","A","B","A"].entries()){
        await page.waitForFunction(({index,button})=>{const q=window.storyProbe.regions.controller.dialogue.qte?.active;
          return window.storyProbe.regions.controller.active?.challengePrompt?.ready&&q?.index===index&&q.steps[q.index]?.buttons[0]===button;},{index,button},{timeout:15_000});
        await page.keyboard.press(button==="B"?"Shift":"Enter");
      }
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie"]),{timeout:180_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.heartbeats-bar.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.charlie"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_ALLEY_WALK_E2E === "true"){
      test.setTimeout(720_000);
      expect(character.storyFlags["notebook.s1.heartbeats"]).toBe(true);
      expect(character.storyFlags["story.s1.heartbeats-alley.completed"]).not.toBe(true);
      if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="dbyo")){
        await walkToLandmark(page,testInfo,{world:"dbyo",label:"Bar Yokosuka exit",targets:[[-3.6,-1.2]]});
        await enterInteriorDoor(page,{world:"dobuita",filename:"S1_DBYO_DR02_017.MT5",fromWorld:"dbyo",reposition:false});
        await walkToLandmark(page,testInfo,{world:"dobuita",label:"Heartbeats street",maxSteps:800,targets:[[101,90],[97,87],[93,86],[91,83],
          [87,82],[83,81],[78,81],[73,81],[69,80],[69,75],[69,70],[69,65],[70,60],[73,61],[80,61],[88,62],[93,63]]});
      }
      const path=[[95,64],[97,64.5],[100,66],[103,66.5],[105,68.5],[108,69],[108.5,70],[110,70],
        [111,70],[111.5,71.5],[112.5,73],[113.5,74.5],[114.5,75.5],[115.5,77],[116.5,78],[117.5,79.5],
        [119,79.5],[120,78.5],[121,77.5],[122,77.25],[122,76.5],[121.5,74],[121,72],[120,70],[119.5,68],[119.5,66],[121,65],[121.5,64.5]];
      const current=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
      const closest=path.reduce((best,p,index)=>Math.hypot(p[0]-current[0],p[1]-current[2])<Math.hypot(path[best][0]-current[0],path[best][1]-current[2])?index:best,0);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Heartbeats approach",maxSteps:500,arrivalRadius:.5,targets:path.slice(closest)});
      await page.evaluate(()=>{const c=window.storyProbe.lifecycle.getController();c.cameraYaw=Math.atan2(-1,0);c.cameraPitch=0;c.updateCamera(1);});
      await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
      try{await page.waitForFunction(()=>window.storyProbe.starts.includes("story-s1-heartbeats-introduction")||window.storyProbe.sceneErrors.length,null,{timeout:30_000});}
      finally{await page.keyboard.up("KeyW");}
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=15,null,{timeout:60_000});
      await page.screenshot({path:testInfo.outputPath("earned-heartbeats-alley-introduction.png")});
      await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.heartbeats.alley.defend"&&window.storyProbe.regions.controller.active.challengePrompt.ready,null,{timeout:120_000});
      await page.keyboard.press("Shift");
      await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.heartbeats.alley.finish"&&window.storyProbe.regions.controller.active.challengePrompt.ready,null,{timeout:30_000});
      await page.keyboard.press("Enter");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.heartbeats-alley.completed"]),{timeout:60_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const saved=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(saved.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);expect(saved.yen).toBe(character.yen);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SAIJO_TALK_E2E === "true"){
      test.setTimeout(480_000);
      expect(character.storyFlags["notebook.s1.sailors"]).toBe(true);
      expect(character.storyFlags["notebook.s1.heartbeats"]).not.toBe(true);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("SAJO"),null,{timeout:60_000});
      // Saijo is behind the bar; the counter prevents a close approach.
      // Interact from the naturally reached customer side instead.
      await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
      const point=await residentClickPoint(page,"SAJO",{reposition:false});expect(point.pickedActor).toBe("SAJO");
      await observeStoryDialogueFace(page,"SAJO");await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await page.waitForTimeout(1500);
      await page.screenshot({path:testInfo.outputPath("natural-saijo-dialogue-start.png")});
      console.info("Saijo dialogue view:",JSON.stringify(await page.evaluate(()=>{const l=window.storyProbe.lifecycle,m=l.scheduledActors.dialogueActorModel("SAJO");return {camera:l.scene.activeCamera.position.asArray(),renderEnabled:m.renderRoot.isEnabled(),occlusionCulled:m.occlusionRenderCulled,occluded:m.occlusionMesh?.isOccluded,root:m.root.getAbsolutePosition().asArray()};})));
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-saijo-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.heartbeats"]),{timeout:240_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.heartbeats"]).toBe(true);expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.heartbeats"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_BAR_WALK_E2E === "true"){
      test.setTimeout(720_000);
      expect(character.storyFlags["notebook.s1.sailors"]).toBe(true);
      expect(character.storyFlags["notebook.s1.heartbeats"]).not.toBe(true);
      await page.locator("#story-wait-button").click();
      await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
      await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
      await expect.poll(async()=>new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs).getUTCHours()).toBe(19);
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Bar Yokosuka",maxSteps:800,targets:[[-17,44],[-18,40],[-18,35],[-17,31],
        [-12,31],[-7,31],[-2,31],[3,31],[8,31],[13,31],[16,33],[19,35],[22,37],[25,39],
        [29,40],[39,40],[49,40],[51,43],[54,45],[58,46],[61,48],[64,50],[66,53],
        [67,57],[69,60],[69,65],[69,70],[69,75],[69,80],[73,81],[78,81],[83,81],
        [87,82],[91,83],[93,86],[97,87],[100,89],[102,92],[104,93]]});
      await enterInteriorDoor(page,{world:"dbyo",doorSelector:63,fromWorld:"dobuita",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("SAJO"),null,{timeout:60_000});
      console.info("Saijo at bar:",JSON.stringify(await page.evaluate(()=>{const l=window.storyProbe.lifecycle;return {player:l.getController().collider.position.asArray(),actor:l.scheduledActors.dialogueActor("SAJO").position};})));
      await page.screenshot({path:testInfo.outputPath("natural-bar-arrival.png")});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_LIU_SENIOR_WALK_E2E === "true"){
      test.setTimeout(720_000);
      expect(character.storyFlags["notebook.s1.liu-senior"]).toBe(true);
      expect(character.storyFlags["notebook.s1.sailors"]).not.toBe(true);
      await walkToLandmark(page,testInfo,{world:"drht",label:"Liu Barber exit",targets:[[1,1.8]]});
      await enterInteriorDoor(page,{world:"dobuita",filename:"S1_DRHT_DR02_019.MT5",fromWorld:"drht",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("RKKI"),null,{timeout:60_000});
      const seniorPosition=await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("RKKI").position);
      expect(Math.hypot(seniorPosition[0]+13.35,seniorPosition[2]-47.71)).toBeLessThan(.3);
      await walkToScheduledWitness(page,testInfo,"RKKI","Liu Senior",[[-3,84],[2,81],[7,78],[20,77],
        [32,77],[43,77],[48,80],[53,82],[56,84],[58,83],[59,80],[64,80],[65,77],
        [66,70],[66,60],[66,50],[62,50],[58,46],[53,43],[48,40],[40,40],[32,40],[25,40],
        [20,36],[16,33],[14,31],[5,31],[-5,31],[-14,31],[-18,31],[-18,36],[-18,39],[-16,45],[-13,46],[-13,48]],"dobuita",{maxSteps:800});
      const point=await residentClickPoint(page,"RKKI",{reposition:false});expect(point.pickedActor).toBe("RKKI");
      await observeStoryDialogueFace(page,"RKKI");await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-liu-senior-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.sailors"]),{timeout:180_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.sailors"]).toBe(true);expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.sailors"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_LIU_EXIT_E2E === "true"){
      test.setTimeout(240_000);
      expect(character.storyFlags["notebook.s1.liu-senior"]).toBe(true);
      await walkToLandmark(page,testInfo,{world:"drht",label:"Liu Barber exit",targets:[[1,1.8]]});
      await enterInteriorDoor(page,{world:"dobuita",filename:"S1_DRHT_DR02_019.MT5",fromWorld:"drht",reposition:false});
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.liu-senior"])).toBe(true);
      await page.screenshot({path:testInfo.outputPath("natural-liu-exit.png")});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_LIU_TALK_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["notebook.s1.liu-barber"]).toBe(true);
      expect(character.storyFlags["notebook.s1.liu-senior"]).not.toBe(true);
      if(process.env.NEW_YOKOSUKA_LIU_ENTRY_E2E === "true"){
        await enterInteriorDoor(page,{world:"drht",doorSelector:51,fromWorld:"dobuita",reposition:false});
      }
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("KYUR")&&window.storyProbe.lifecycle.scheduledActors.dialogueActor("ONRR"),null,{timeout:60_000});
      await walkToScheduledWitness(page,testInfo,"KYUR","Liu",[[1.1,2.5],[1.5,1],[2.6,-.79]],"drht");
      const point=await residentClickPoint(page,"KYUR",{reposition:false});
      expect(point.pickedActor).toBe("KYUR");
      await observeStoryDialogueFace(page,"KYUR");await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-liu-speaking");
      await lookAtResident(page,"ONRR");await observeStoryDialogueFace(page,"ONRR");
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-liu-spouse-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.liu-senior"]),{timeout:240_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.liu-senior"]).toBe(true);expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.liu-senior"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_LIU_WALK_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["notebook.s1.liu-barber"]).toBe(true);
      expect(character.storyFlags["notebook.s1.liu-senior"]).not.toBe(true);
      await walkToLandmark(page,testInfo,{world:"dobuita",label:"Liu Barber",targets:[[12,28],[15,31],[18,34],[20,36],[25,39],
        [32,40],[40,40],[48,40],[53,43],[58,46],[62,50],[66,50],[66,60],[66,70],[65,77],
        [64,80],[60,80],[59,83],[56,84],[51,81],[45,79],[43,77],[32,77],[20,77],
        [10,77],[5,79],[0,82],[-5,85],[-6,85]]});
      await enterInteriorDoor(page,{world:"drht",doorSelector:51,fromWorld:"dobuita",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("KYUR")&&window.storyProbe.lifecycle.scheduledActors.dialogueActor("ONRR"),null,{timeout:60_000});
      console.info("Liu Barber actors:",JSON.stringify(await page.evaluate(()=>{const l=window.storyProbe.lifecycle;return {player:l.getController().collider.position.asArray(),liu:l.scheduledActors.dialogueActor("KYUR").position,spouse:l.scheduledActors.dialogueActor("ONRR").position};})));
      await page.screenshot({path:testInfo.outputPath("natural-liu-arrival.png")});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_ITOI_TALK_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["notebook.s1.three-blades"]).toBe(true);
      expect(character.storyFlags["notebook.s1.liu-barber"]).not.toBe(true);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("ITOI"),null,{timeout:60_000});
      if(process.env.NEW_YOKOSUKA_ITOI_AT_WITNESS_E2E!=="true"){
        await walkToScheduledWitness(page,testInfo,"ITOI","Itoi",[[93,63],[88,62],[80,61],[72,61],[70,58],
          [67,57],[66,54],[66,50],[62,50],[58,46],[53,43],[48,40],[40,40],[32,40],[25,40],
          [20,36],[18,33],[15,31],[13,28],[9,27]]);
      } else await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
      let point=await residentClickPoint(page,"ITOI",{reposition:false});
      console.info("Itoi click details:",JSON.stringify(point));
      await page.screenshot({path:testInfo.outputPath("natural-itoi-before-talk.png")});
      if(process.env.NEW_YOKOSUKA_ITOI_OCCLUSION_E2E==="true"||!point.pickedActor){
        expect(point.pickedActor).toBeUndefined();
        await page.mouse.click(point.x,point.y);await page.waitForTimeout(1500);
        expect(await page.evaluate(()=>!!window.storyProbe.dialogue?.active)).toBe(false);
        expect((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["notebook.s1.liu-barber"]).not.toBe(true);
        // Step sideways around the display, rather than repositioning Ryo.
        await walkToLandmark(page,testInfo,{world:"dobuita",label:"Itoi clear view",targets:[[8.9,26.75]]});
        point=await residentClickPoint(page,"ITOI",{reposition:false});
        await page.screenshot({path:testInfo.outputPath("natural-itoi-clear-view.png")});
      }
      expect(point.pickedActor).toBe("ITOI");
      await observeStoryDialogueFace(page,"ITOI");await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-itoi-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.liu-barber"]),{timeout:180_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.liu-barber"]).toBe(true);expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.liu-barber"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_ITOI_WALK_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["notebook.s1.three-blades"]).toBe(true);
      expect(character.storyFlags["notebook.s1.liu-barber"]).not.toBe(true);
      await walkToLandmark(page,testInfo,{world:"dcha",label:"Ajiichi exit",targets:[[.5,-1],[0,-3]]});
      await enterInteriorDoor(page,{world:"dobuita",filename:"S1_DCHA_DR15_025.MT5",fromWorld:"dcha",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("ITOI"),null,{timeout:60_000});
      console.info("Itoi next witness:",JSON.stringify(await page.evaluate(()=>({actor:window.storyProbe.lifecycle.scheduledActors.dialogueActor("ITOI").position,player:window.storyProbe.lifecycle.getController().collider.position.asArray()}))));
      await page.screenshot({path:testInfo.outputPath("natural-ajiichi-exit.png")});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_AJIICHI_TALK_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["notebook.s1.chinese-community"]).toBe(true);
      expect(character.storyFlags["notebook.s1.three-blades"]).not.toBe(true);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("UNO_")&&window.storyProbe.lifecycle.scheduledActors.dialogueActor("RNKT"),null,{timeout:60_000});
      await walkToScheduledWitness(page,testInfo,"UNO_","Tao",[[.5,-1],[1,0],[1.55,2.33]],"dcha");
      const point=await residentClickPoint(page,"UNO_",{reposition:false});
      expect(point.pickedActor).toBe("UNO_");
      await observeStoryDialogueFace(page,"UNO_");
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-tao-speaking");
      await lookAtResident(page,"RNKT");await observeStoryDialogueFace(page,"RNKT");
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-lin-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.three-blades"]),{timeout:240_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.three-blades"]).toBe(true);
      expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.three-blades"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_AJIICHI_WALK_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["notebook.s1.chinese-community"]).toBe(true);
      expect(character.storyFlags["notebook.s1.three-blades"]).not.toBe(true);
      await walkToAjiichi(page,testInfo);
      await enterInteriorDoor(page,{world:"dcha",doorSelector:28,fromWorld:"dobuita",reposition:false});
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("UNO_")&&window.storyProbe.lifecycle.scheduledActors.dialogueActor("RNKT"),null,{timeout:60_000});
      console.info("Ajiichi actors:",JSON.stringify(await page.evaluate(()=>{const l=window.storyProbe.lifecycle;return {player:l.getController().collider.position.asArray(),tao:l.scheduledActors.dialogueActor("UNO_").position,lin:l.scheduledActors.dialogueActor("RNKT").position};})));
      await page.screenshot({path:testInfo.outputPath("natural-ajiichi-arrival.png")});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_TOM_WALK_E2E === "true"){
      test.setTimeout(480_000);
      expect(character.storyFlags["notebook.s1.tom-witness"]).toBe(true);
      expect(character.storyFlags["notebook.s1.chinese-community"]).not.toBe(true);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("TOM_"),null,{timeout:60_000});
      await walkToTom(page,testInfo);
      const point=await residentClickPoint(page,"TOM_",{reposition:false});
      expect(point.pickedActor).toBe("TOM_");
      await observeStoryDialogueFace(page,"TOM_");
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-tom-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.chinese-community"]),{timeout:180_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.chinese-community"]).toBe(true);
      expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.chinese-community"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_NOZOMI_WALK_E2E === "true"){
      test.setTimeout(480_000);
      expect(character.storyFlags["story.s1.yamagishi-black-car.completed"]).toBe(true);
      expect(character.storyFlags["notebook.s1.tom-witness"]).not.toBe(true);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("HRSK"),null,{timeout:60_000});
      await walkToNozomi(page,testInfo);
      const point=await residentClickPoint(page,"HRSK",{reposition:false});
      expect(point.pickedActor).toBe("HRSK");
      await observeStoryDialogueFace(page,"HRSK");
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-nozomi-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.tom-witness"]),{timeout:180_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.tom-witness"]).toBe(true);
      expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.tom-witness"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_DOBUITA_WITNESS_WALK_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["story.s1.yamagishi-black-car.completed"]).toBe(true);
      expect(character.storyFlags["notebook.s1.tom-witness"]).not.toBe(true);
      await walkToDobuita(page,testInfo);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("HRSK"),null,{timeout:60_000});
      console.info("Dobuita next witness:",JSON.stringify(await page.evaluate(()=>({actor:window.storyProbe.lifecycle.scheduledActors.dialogueActor("HRSK").position,player:window.storyProbe.lifecycle.getController().collider.position.asArray()}))));
      await page.screenshot({path:testInfo.outputPath("natural-dobuita-arrival.png")});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_YAMAGISHI_WALK_E2E === "true"){
      test.setTimeout(600_000);
      expect(character.storyFlags["story.s1.sumiya-witness.completed"]).toBe(true);
      expect(character.storyFlags["notebook.s1.yamagishi-witness"]).toBe(true);
      expect(character.storyFlags["notebook.s1.dobuita-black-car"]).not.toBe(true);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("YAMA"),null,{timeout:60_000});
      await walkToYamagishi(page,testInfo);
      // At this morning checkpoint Yamagishi stands behind his garden wall.
      // Wait through the real personal clock for his 10 a.m. street route.
      await page.locator("#story-wait-button").click();
      await page.getByRole("option",{name:"Wait until 10 a.m.",exact:true}).click();
      await page.getByRole("button",{name:"Wait until 10 a.m.",exact:true}).click();
      await page.waitForFunction(()=>{
        const l=window.storyProbe.lifecycle,p=l.getController().collider.position,a=l.scheduledActors.dialogueActor("YAMA")?.position;
        return a&&a[2]<32.4&&Math.hypot(a[0]-p.x,a[2]-p.z)<2.8;
      },null,{timeout:120_000});
      const point=await residentClickPoint(page,"YAMA",{reposition:false});
      expect(point.pickedActor).toBe("YAMA");
      await observeStoryDialogueFace(page,"YAMA");
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await verifyObservedStoryDialogueFace(page,testInfo,"natural-yamagishi-speaking");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.yamagishi-black-car.completed"]),{timeout:180_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.dobuita-black-car"]).toBe(true);
      expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.dobuita-black-car"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_WITNESS_WALK_E2E === "true") {
      test.setTimeout(360_000);
      expect(character.storyFlags["story.s1.first-kitten.completed"]).toBe(true);
      expect(character.storyFlags["notebook.s1.yamagishi-witness"]).not.toBe(true);
      expect(character.storyFlags["story.s1.sumiya-witness.completed"]).not.toBe(true);
      await walkToSakuragaoka(page,testInfo);
      await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("SUMI"),null,{timeout:60_000});
      await page.screenshot({path:testInfo.outputPath("natural-sakuragaoka-arrival.png")});
      await walkToSumiya(page,testInfo);
      const point=await residentClickPoint(page,"SUMI",{reposition:false});
      expect(point.pickedActor).toBe("SUMI");
      await page.screenshot({path:testInfo.outputPath("natural-sumiya-approach.png")});
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
      await page.waitForFunction(()=>window.storyProbe.dialogue?.audio&&!window.storyProbe.dialogue.audio.paused&&window.storyProbe.dialogue.audio.currentTime>0,null,{timeout:15_000});
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.sumiya-witness.completed"]),{timeout:180_000}).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["story.s1.sumiya-witness.completed"]).toBe(true);
      expect(after.storyFlags["notebook.s1.yamagishi-witness"]).toBe(true);
      expect(after.yen).toBe(character.yen);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["story.s1.sumiya-witness.completed"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["notebook.s1.yamagishi-witness"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_KITTEN_WALK_E2E === "true") {
      test.setTimeout(480_000);
      expect(character.storyFlags["story.s1.first-dojo.completed"]).toBe(true);
      expect(character.storyFlags["story.s1.first-kitten.completed"]).not.toBe(true);
      await enterInteriorDoor(page,{world:"yamanose",fromWorld:"exterior",filename:"S1_JHD0_DR29_000.MT5",position:[1,0,9.4]});
      await walkToKitten(page,testInfo);
      await expect(page.getByRole("button",{name:"Dried fish",exact:true})).toBeVisible({timeout:150_000});
      const beforeChoice=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(beforeChoice.storyFlags["story.s1.first-kitten.completed"]).not.toBe(true);
      await page.screenshot({path:testInfo.outputPath("natural-kitten-choice.png")});
      await page.getByRole("button",{name:"Dried fish",exact:true}).click();
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-first-kitten-fish",null,{timeout:60_000});
      await page.waitForFunction(()=>!window.storyProbe.director.active,null,{timeout:120_000});
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.first-kitten.completed"])).toBe(true);
      const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
      expect(after.storyFlags["notebook.s1.black-car"]).toBe(true);
      expect(after.storyFlags["notebook.s1.yamagishi-witness"]).toBe(true);
      expect(after.yen).toBe(character.yen);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().firstPerson)).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
      await page.reload(); await enterStoryWorld(page);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["story.s1.first-kitten.completed"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_DOJO_WALK_E2E === "true") {
      expect(character.storyFlags["story.s1.first-allowance.completed"]).toBe(true);
      expect(character.storyFlags["story.s1.first-dojo.completed"]).not.toBe(true);
      await enterInteriorDoor(page,{world:"exterior",fromWorld:"interior",filename:"S1_JOMO_DR15_016.MT5",position:[-14.718089,0,5.410742]});
      await walkToDojo(page,testInfo);
      await page.waitForTimeout(3000);
      const during=await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(during.character.storyFlags["story.s1.first-dojo.completed"]).not.toBe(true);
      await page.screenshot({path:testInfo.outputPath("natural-dojo-dialogue.png")});
      await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="idle"&&!window.storyProbe.director.active,null,{timeout:150_000});
      const after=await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(after.character.storyFlags["story.s1.first-dojo.completed"]).toBe(true);
      expect(after.character.storyFlags["notebook.s1.men-in-black"]).toBe(true);
      expect(after.character.yen).toBe(character.yen);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().firstPerson)).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
      expect((await (await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["notebook.s1.men-in-black"]).toBe(true);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_GATE_VOICE_ONLY_E2E === "true") {
      await enterInteriorDoor(page,{world:"yamanose",fromWorld:"exterior",filename:"S1_JHD0_DR29_000.MT5",position:[1,0,9.4],blocked:true});
      expect(errors).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_GORO_LEAD_NATURAL_E2E === "true"){
      test.setTimeout(360_000);
      await verifyGoroLeadNatural(page,testInfo,character);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      const flags=await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags);
      expect(flags["story.s1.goro-job-lead.completed"]).toBe(true);
      expect(flags["notebook.s1.harbor-job-promise"]).toBe(true);
      expect(flags["story.s1.goro-job-appointment.completed"]).not.toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_YAMAMOTO_E2E === "true"){
      test.setTimeout(360_000);await verifyYamamotoStory(page,testInfo,character,residentClickPoint,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_DOJO_FRIENDSHIP_MEMORY_E2E === "true"){
      test.setTimeout(300_000);await verifyDojoFriendshipMemory(page,testInfo,character,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHERRY_MEMORY_E2E === "true"){
      test.setTimeout(300_000);await verifyCherryMemory(page,testInfo,character,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHILDHOOD_MEAL_E2E === "true"){
      test.setTimeout(240_000);
      await verifyChildhoodMeal(page,testInfo,character,enterStoryWorld);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_IWAO_LETTER_E2E === "true"){
      test.setTimeout(240_000);
      await verifyIwaoFarewellLetter(page,testInfo,character,enterStoryWorld);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_DAILY_ALLOWANCE_E2E === "true"){
      test.setTimeout(240_000);
      await verifyDailyAllowance(page,testInfo,character,enterStoryWorld);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_KITTEN_CARE_E2E === "true"){
      test.setTimeout(480_000);
      await verifyKittenCare(page,testInfo,character,residentClickPoint,enterStoryWorld);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_KITTEN_CHECK_IN_E2E === "true"){
      test.setTimeout(180_000);
      const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json()),before=await saved();
      await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="yamanose"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
      for(let attempt=0;attempt<2;attempt++){
        const point=await residentClickPoint(page,"MEGM");expect(point.pickedActor).toBe("MEGM");await page.mouse.click(point.x,point.y);
        await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:30_000});
        expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
        await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});
        expect(await page.getByRole("button",{name:"Tama",exact:true}).isVisible()).toBe(false);
        for(let i=0;i<15&&await page.evaluate(()=>window.storyProbe.regions.controller.status!=="idle");i++){await page.keyboard.press("Space");await page.waitForTimeout(250);}
        await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
      }
      const after=await saved();expect(after.character.storyFlags).toEqual(before.character.storyFlags);
      expect(after.inventory).toEqual(before.inventory);expect(after.character.yen).toBe(before.character.yen);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_KITTEN_NAME_E2E === "true"){
      test.setTimeout(300_000);
      const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
      await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="yamanose"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
      if(process.env.NEW_YOKOSUKA_KITTEN_WAIT_NEXT_DAY_E2E === "true"){
        const oldTime=(await saved()).worldState.gameTimeMs;
        await page.locator("#story-wait-button").click();
        await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
        await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
        await expect.poll(async()=>(await saved()).worldState.gameTimeMs,{timeout:30_000}).toBeGreaterThan(oldTime);
      }
      const before=await saved();
      await page.waitForFunction(()=>{const a=window.storyProbe.lifecycle.scheduledActors.dialogueActorModel("MEGM");return a?.root?.isEnabled()&&a.renderRoot.getChildMeshes().some(m=>m.isEnabled()&&window.storyProbe.lifecycle.scene.isActiveMesh(m));},null,{timeout:30_000});
      const talk=async()=>{
        const point=await residentClickPoint(page,"MEGM");expect(point.pickedActor).toBe("MEGM");
        await page.screenshot({path:testInfo.outputPath("kitten-megumi-shrine.png")});
        await page.mouse.click(point.x,point.y);
        await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:30_000});
        expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
        await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});
        for(let i=0;i<15&&!await page.getByRole("button",{name:"Tama",exact:true}).isVisible();i++){await page.keyboard.press("Space");await page.waitForTimeout(250);}
        await expect(page.getByRole("button",{name:"Tama",exact:true})).toBeVisible({timeout:15_000});
      };
      await talk();await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-kitten-name-cancel"));
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
      expect((await saved()).character.storyFlags["story.s1.kitten-name.completed"]).not.toBe(true);
      await talk();await page.getByRole("button",{name:"Tama",exact:true}).click();
      for(let i=0;i<35&&!(await saved()).character.storyFlags["story.s1.kitten-name.completed"];i++){await page.keyboard.press("Space");await page.waitForTimeout(200);}
      await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.kitten-name.completed"],{timeout:30_000}).toBe(true);
      let after=await saved();expect(after.character.storyFlags["story.s1.kitten-name.tama"]).toBe(true);
      expect(after.character.storyFlags["story.s1.kitten-name.sasuke-rejected"]).not.toBe(true);
      expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
      after=await saved();expect(after.character.storyFlags["story.s1.kitten-name.tama"]).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_PHOTO_CONNECTED_E2E === "true"){
      test.setTimeout(300_000);
      await verifyNozomiPhotoProgression(page,testInfo,character);
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      const flags=await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags);
      expect(flags["story.s1.nozomi-photos.completed"]).toBe(true);
      const chosenPhoto = process.env.NEW_YOKOSUKA_PHOTO_CHOICE || "apart";
      expect(flags[`story.s1.nozomi-photo.${chosenPhoto}`]).toBe(true);
      expect(flags[`story.s1.nozomi-photo.${chosenPhoto === "apart" ? "together" : "apart"}`]).not.toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_PHOTO_PLANES_E2E === "true"){
      test.setTimeout(240_000);
      await reviewNozomiPhotoPlanes(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_KITTEN_HANDOFF_CANCEL_E2E === "true"){
      await verifyKittenHandoffCancellation(page,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_KITTEN_CHOICE_REVIEW_E2E === "true"){
      await reviewKittenChoice(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_KITTEN_CHOICE_CONNECTED_E2E === "true"){
      test.setTimeout(300_000);
      await verifyKittenChoice(page,testInfo,character,process.env.NEW_YOKOSUKA_KITTEN_FOOD||"tofu");
      if(process.env.NEW_YOKOSUKA_KITTEN_GAP_ONLY_E2E==="true"){expect(errors).toEqual([]);return;}
      await page.reload();await enterStoryWorld(page);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["story.s1.first-kitten.completed"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_FOOTBALL_E2E === "true") {
      test.setTimeout(300_000);await verifyYamanoseFootball(page,testInfo,character,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_NOZOMI_PARK_E2E === "true") {
      test.setTimeout(480_000);await verifyNozomiParkConfession(page,testInfo,character,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_NOZOMI_TEARS_E2E === "true") {
      test.setTimeout(480_000);await verifyNozomiParkTears(page,testInfo,character,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_ERI_NOZOMI_E2E === "true") {
      test.setTimeout(600_000);await verifyEriNozomiPark(page,testInfo,character,enterStoryWorld);
      if(process.env.NEW_YOKOSUKA_ERI_TO_TEARS === "true")await verifyNozomiParkTears(page,testInfo,character,enterStoryWorld);
      expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_FRIENDS_VISIT_E2E === "true") {
      test.setTimeout(480_000);await verifyFriendsVisit(page,testInfo,character,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_FRIENDS_BAR_E2E === "true") {
      test.setTimeout(300_000);await verifyFriendsBar(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_HARBOR_ARRIVAL_FILM_E2E === "true") {
      test.setTimeout(360_000);await verifyHarborArrivalFilm(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_KITTEN_SEARCH_E2E === "true") {
      test.setTimeout(360_000);await verifyKittenSearch(page,testInfo,character,residentClickPoint,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_KITTEN_NOZOMI_E2E === "true") {
      test.setTimeout(300_000);await verifyKittenNozomi(page,testInfo,character,residentClickPoint,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_KITTEN_ADOPTION_E2E === "true") {
      test.setTimeout(240_000);await verifyKittenAdoption(page,testInfo,character,residentClickPoint,enterStoryWorld);expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_KITTEN_ROOF_E2E === "true") {
      test.setTimeout(480_000);await verifyKittenRoof(page,testInfo,character,residentClickPoint,enterStoryWorld);
      if(process.env.NEW_YOKOSUKA_KITTEN_ROOF_TO_ADOPTION === "true")await verifyKittenAdoption(page,testInfo,character,residentClickPoint,enterStoryWorld);
      expect(errors).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_STORY_FACES_E2E === "true") {
      test.setTimeout(540_000);
      await reviewStoryFaces(page, testInfo, character);
      expect(errors).toEqual([]); return;
    }
    if (process.env.NEW_YOKOSUKA_STORY_AMBIENT_E2E === "true") {
      await reviewStoryAmbient(page, testInfo, character);
      expect(errors).toEqual([]); return;
    }
    if(process.env.NEW_YOKOSUKA_SCROLL_LEARNING_E2E === "true"){
      test.setTimeout(300_000);await verifySavedScrollLearning(page,testInfo,character,{moveId:process.env.NEW_YOKOSUKA_SCROLL_MOVE_ID||'twinBlades'});expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_HARBOR_HIRING_E2E === "true"){
      test.setTimeout(540_000);
      await verifyHarborHiring(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FORKLIFT_TRAINING_E2E === "true"){
      test.setTimeout(540_000);
      await verifyForkliftTraining(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHICKEN_RACE_E2E === "true"){
      test.setTimeout(360_000);
      await verifyChickenRace(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_STORY_SKY_REVIEW_E2E === "true"){
      const sky = async hour => {
        await page.evaluate(hour => window.storyProbe.clock.setDebugHour(hour),hour);
        await expect.poll(()=>page.evaluate(async()=>{
          const state=(await import('/src/state.js')).default;
          return state.currentSkybox?.material?._floats?.brightness;
        })).toBeCloseTo(hour===19 ? 0.2/1.5 : 1,4);
        await page.waitForTimeout(500);
        const source=await page.evaluate(async()=>{
          const state=(await import('/src/state.js')).default;
          return state.currentSkybox?.material?._textures?.fromTexture?.url;
        });
        expect(source).toContain('air65.png');
        await page.screenshot({path:testInfo.outputPath(`story-cloud-sky-${hour}.png`)});
      };
      await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([1.7,0,95]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=.12;c.updateCamera(1);});
      await sky(8);await sky(19);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MORNING_FROM_EVENING_E2E === "true"){
      test.setTimeout(1_200_000);
      await verifyMorningRaceFromEvening(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SECOND_MORNING_FROM_EVENING_E2E === "true"){
      test.setTimeout(1_200_000);
      await verifyMorningRaceFromEvening(page,testInfo,character,{day:"two"});
      await verifyMorningRaceSaved(page,testInfo,character,{day:"two"});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SECOND_MORNING_RACE_E2E === "true"){
      test.setTimeout(1_200_000);
      await verifyMorningRace(page,testInfo,character,{day:"two"});
      await verifyMorningRaceSaved(page,testInfo,character,{day:"two"});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MORNING_RACE_E2E === "true"){
      test.setTimeout(1_200_000);
      await verifyMorningRace(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MORNING_RACE_RELOAD_E2E === "true"){
      await verifyMorningRaceSaved(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SALARY_REVIEW_E2E === "true"){
      test.setTimeout(240_000);
      await reviewSalaryPresentation(page,testInfo,character);
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
    if(process.env.NEW_YOKOSUKA_SECOND_MORNING_CARGO_E2E === "true"){
      test.setTimeout(480_000);
      await verifyMorningCargo(page,testInfo,character,{day:"two"});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SECOND_WORKDAY_E2E === "true"){
      test.setTimeout(1_200_000);
      if(!character.storyFlags["story.s1.workday-two-morning.completed"])await verifyMorningCargo(page,testInfo,character,{day:"two"});
      await verifySecondWorkday(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_MARK_AFTER_WORK_E2E === "true"){
      test.setTimeout(1_200_000);await verifyMarkAfterWork(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_THIRD_WORKDAY_E2E === "true"){
      test.setTimeout(1_800_000);await verifyThirdWorkday(page,testInfo,character);expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_FIRST_AFTERNOON_E2E === "true"){
      test.setTimeout(660_000);
      await verifyFirstAfternoon(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
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
    if(process.env.NEW_YOKOSUKA_FIRST_WORKDAY_NIGHT_E2E === "true"){
      test.setTimeout(540_000);
      await verifyWorkdayNight(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_SECOND_MORNING_E2E === "true"){
      test.setTimeout(1_260_000);
      await verifyWorkdayNight(page,testInfo,character);
      const current=await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      if(!current.character.storyFlags["story.s1.workday-two-race.completed"])await verifyMorningRace(page,testInfo,character,{day:"two"});
      await verifyMorningRaceSaved(page,testInfo,character,{day:"two"});
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CALENDAR_E2E === "true"){
      await verifyPersonalCalendar(page,testInfo,character);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_JIMMY_CHASE_E2E === "true"){
      test.setTimeout(540_000);
      await verifyJimmyChase(page,testInfo,character);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_CHAI_ARCADE_E2E === "true"){
      test.setTimeout(480_000);
      await verifyChaiArcade(page,testInfo,character,enterInteriorDoor,{fightStoryAmbush});
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    if (process.env.NEW_YOKOSUKA_DRUNKARD_E2E) {
      test.setTimeout(300_000);
      await verifyDobuitaDrunkard(page, testInfo, character, enterStoryWorld, process.env.NEW_YOKOSUKA_DRUNKARD_E2E);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_MAI_ALLEY_E2E) {
      test.setTimeout(480_000);
      await verifyMaiAlley(page, testInfo, character, enterStoryWorld, process.env.NEW_YOKOSUKA_MAI_ALLEY_E2E);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_HISAKA_E2E) {
      test.setTimeout(300_000);
      await verifyHisaka(page, testInfo, character, enterStoryWorld, process.env.NEW_YOKOSUKA_HISAKA_E2E);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_YAMAGISHI_MIRROR_E2E) {
      test.setTimeout(400_000);
      await verifyYamagishiMirror(page,testInfo,character,enterStoryWorld,residentClickPoint);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_GORO_GUARD_E2E) {
      test.setTimeout(440_000);
      await verifyGoroGuard(page,testInfo,character,enterStoryWorld,process.env.NEW_YOKOSUKA_GORO_GUARD_E2E);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_HARBOR_CONVERSATION_E2E) {
      test.setTimeout(300_000);
      await verifyHarborConversation(page,testInfo,character,enterStoryWorld,process.env.NEW_YOKOSUKA_HARBOR_CONVERSATION_E2E);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_FUKU_RETURN_E2E) {
      test.setTimeout(360_000);
      await verifyFukuReturn(page, testInfo, character, enterStoryWorld, process.env.NEW_YOKOSUKA_FUKU_RETURN_E2E);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_MYSTERIOUS_SCROLL_E2E === "true") {
      test.setTimeout(540_000);
      await verifyPoetryReading(page, testInfo, character, enterStoryWorld);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_STAB_TRANSLATION_E2E === "true") {
      test.setTimeout(300_000);
      await verifyScrollTranslation(page, testInfo, character, enterStoryWorld);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_CHAI_BODY_E2E === "true") {
      await verifyChaiRecoveryBody(page, testInfo, character);
      expect(errors).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_CHAI_RECOVERY_RELOAD_E2E === "true"){
      await verifyChaiRecoveryReload(page,character);
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
    if (process.env.NEW_YOKOSUKA_CREDITS_E2E) {
      test.setTimeout(1_100_000);
      await verifyClosingCredits(page, testInfo, character, enterStoryWorld, process.env.NEW_YOKOSUKA_CREDITS_E2E);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_DEADLINE_E2E) {
      test.setTimeout(540_000);
      await verifyCalendarDeadline(page, testInfo, character, enterStoryWorld, process.env.NEW_YOKOSUKA_DEADLINE_E2E);
      expect(errors).toEqual([]);
      return;
    }
    if (process.env.NEW_YOKOSUKA_NOZOMI_FLOWERS_E2E === "true") {
      test.setTimeout(420_000);
      await verifyNozomiFlowers(page, testInfo, character, enterStoryWorld);
      expect(errors).toEqual([]);
      return;
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
      test.setTimeout(420_000);
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
    if(process.env.NEW_YOKOSUKA_TATTOO_PRESENTATION_E2E === "true") {
      await reviewTattooIntroduction(page,testInfo,character);
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
    if(process.env.NEW_YOKOSUKA_BAR_MOTIONS_E2E === "true") {
      await inspectHeartbeatsBarMotions(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_ALLEY_SECOND_REVIEW_E2E === "true") {
      await reviewHeartbeatsSecondExchange(page,testInfo,character);
      await page.reload();await enterStoryWorld(page);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
      expect(await page.evaluate(()=>window.storyProbe.regions.getCharacter().storyFlags?.["story.s1.heartbeats-alley.completed"])).toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      expect(errors).toEqual([]);return;
    }
    if(process.env.NEW_YOKOSUKA_ALLEY_MOTIONS_E2E === "true") {
      await inspectHeartbeatsMotions(page,testInfo,character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    if(process.env.NEW_YOKOSUKA_ALLEY_PRESENTATION_E2E === "true") {
      await reviewHeartbeatsPresentation(page,testInfo,character);
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
    if(process.env.NEW_YOKOSUKA_POST_ALLOWANCE_E2E === "true"){
      // Continue the same earned fresh-character save. The shared helper never
      // inserts prerequisites or repeats completed dojo/kitten milestones.
      await continueAfterAllowance(page,testInfo,character,character.yen,errors);
      expect(errors).toEqual([]);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return;
    }
    // This is a prerequisite for the witness continuation, not for every
    // independently resumed scene above (some use partially seeded saves).
    expect(character.storyFlags["notebook.s1.chinese-community"]).toBe(true);
    await continueWitnesses(page, testInfo, character, character.yen, true);
    if(process.env.NEW_YOKOSUKA_ALLEY_QTE_E2E === "true") {
      // Only the optional three-blades route above opens the notebook.
      if(await page.locator("#journal-close").isVisible())await page.locator("#journal-close").click();
      await verifyAlleyQte(page,testInfo,character);
    }
    if (process.env.NEW_YOKOSUKA_NIGHT_STORY_E2E === "true") {
      if (await page.locator("#journal-close").isVisible()) await page.locator("#journal-close").click();
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
  if (process.env.NEW_YOKOSUKA_OWNER_RESTART_E2E === "true") {
    // This opt-in test targets only the dedicated local service created for
    // it. Killing its exact main process simulates a crash, not a clean close.
    const unit = "ny-story-owner-restart-e2e.service";
    const pid = () => execFileSync("systemctl", ["--user", "show", unit, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim();
    const before = pid();
    expect(Number(before)).toBeGreaterThan(0);
    execFileSync("systemctl", ["--user", "kill", "--kill-whom=main", "--signal=SIGKILL", unit]);
    await expect.poll(() => { const current = pid(); return current !== "0" && current !== before; }, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await page.request.get("/api/status").catch(() => null))?.ok() === true, { timeout: 30_000 }).toBe(true);
    const unchanged = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(unchanged.character.yen).toBe(character.yen);
    expect(unchanged.character.storyFlags?.["story.s1.first-allowance.completed"]).not.toBe(true);
    await page.reload();
    await enterStoryWorld(page, character.name);
    await page.waitForFunction(id => window.storyProbe?.ready && window.storyProbe.regions?.getCharacter()?.id === id, character.id, { timeout: 120_000 });
    await page.evaluate(() => {
      const life = window.storyProbe.lifecycle;
      life.resetPlayer(life.vectorFromArray([-16.75, 0, 1]), Math.PI, { persist: false });
    });
    await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-allowance" || window.storyProbe.sceneErrors.length, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    await page.keyboard.press("KeyX");
    await expect.poll(async () => (await (await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags?.["story.s1.first-allowance.completed"], { timeout: 30_000 }).toBe(true);
    const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(saved.character.yen).toBe(character.yen + 500);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.reload();
    await enterStoryWorld(page, character.name);
    await page.waitForFunction(id => window.storyProbe?.ready && window.storyProbe.regions?.getCharacter()?.id === id, character.id, { timeout: 120_000 });
    await page.waitForTimeout(1500);
    const reloaded = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(reloaded.character.yen).toBe(character.yen + 500);
    expect(reloaded.character.storyFlags?.["story.s1.first-allowance.completed"]).toBe(true);
    expect(await page.evaluate(() => window.storyProbe.starts.includes("story-s1-first-allowance"))).toBe(false);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    expect(errors).toEqual([]);
    return;
  }
  if (ending === "skip") await page.keyboard.press("KeyX");
  else {
    // Sample the real rendered FACE buffers throughout both speakers' lines.
    // Body/head motion cannot satisfy this: these are model-local positions,
    // excluding seam vertices borrowed from the moving body attachment.
    await page.evaluate(() => {
      const runtime = window.storyProbe.director.activeCutscene.packageRuntime;
      const samples = window.storyProbe.allowanceFaces = new Map();
      let nextSample = 0;
      const observer = window.storyProbe.lifecycle.scene.onAfterRenderObservable.add(() => {
        if (performance.now() < nextSample) return;
        nextSample = performance.now() + 200;
        for (const [tag, face] of runtime.presentation.faces?.active?.faces || []) {
          const sample = samples.get(tag) || { faceCode: face.entry.definition.faceCode, frames: 0,
            visibleFrames: 0, vertices: new Set(), mouths: new Set() };
          sample.frames++;
          if (face.entry.root.isEnabled()) sample.visibleFrames++;
          sample.mouths.add(JSON.stringify(Array.from(face.mouth.current)));
          sample.vertices.add(JSON.stringify(face.entry.primaryMeshes.flatMap(mesh => {
            const positions = mesh.getVerticesData("position");
            return Array.from(mesh._mt5SourceVertexIndices).flatMap((source, index) => {
              const local = source - face.entry.primaryVertexBase;
              return mesh._mt5ExternalParentVertexOffsets?.[index] < 0
                || local < 0 || local >= face.entry.table.vertexCount ? []
                : Array.from(positions.slice(index * 3, index * 3 + 3));
            });
          })));
          samples.set(tag, sample);
        }
      });
      window.storyProbe.stopAllowanceFaceProbe = () => window.storyProbe.lifecycle.scene.onAfterRenderObservable.remove(observer);
    });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: testInfo.outputPath("allowance-conversation.png") });
    await page.waitForTimeout(12000);
    await page.screenshot({ path: testInfo.outputPath("allowance-later-conversation.png") });
    await page.waitForFunction(() => {
      const r = window.storyProbe.director.activeCutscene?.packageRuntime;
      return r?.activityRuntime.active?.currentFrame >= 1000;
    }, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.storyProbe.director.activeCutscene.packageRuntime
      .sceneObjects.objects.get("KOZU").root.isEnabled())).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("allowance-envelope-handover.png") });
    await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 90_000 });
    const faces = await page.evaluate(() => {
      window.storyProbe.stopAllowanceFaceProbe();
      return Object.fromEntries([...window.storyProbe.allowanceFaces].map(([tag, sample]) => [tag, {
        faceCode: sample.faceCode, frames: sample.frames, visibleFrames: sample.visibleFrames,
        vertexStates: sample.vertices.size, mouthStates: sample.mouths.size,
      }]));
    });
    await testInfo.attach("allowance-face-motion", { body: JSON.stringify(faces, null, 2), contentType: "application/json" });
    console.info("Allowance rendered FACE motion:", JSON.stringify(faces));
    for (const [tag, code] of [["AKIR", "YKC"], ["INE_", "INE"]]) {
      expect(faces[tag]?.faceCode).toBe(code);
      expect(faces[tag].visibleFrames).toBeGreaterThan(1);
      expect(faces[tag].vertexStates).toBeGreaterThan(1);
      expect(faces[tag].mouthStates).toBeGreaterThan(1);
    }
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
  await expectNotebookEntry(page,/Ine-san leaves.*500/);
  await page.screenshot({ path: testInfo.outputPath("earned-notebook.png") });
  await page.locator("#journal-close").click();
  // Explicit skip and natural completion must both survive reconnect without
  // replaying the scene or granting a second allowance.
  {
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
  if (ending === "complete" && process.env.NEW_YOKOSUKA_GAMEPAD_QTE_E2E === "true") {
    // Exercise the actual application wiring with a virtual standard pad;
    // this isolated prompt deliberately does not submit a Story outcome.
    await page.evaluate(() => {
      const presenter=window.storyProbe.regions.controller.dialogue;
      window.storyQteOldResponse=presenter.onChallengeResponse;
      window.storyQteResponses=[];
      presenter.onChallengeResponse=(...args)=>window.storyQteResponses.push(args);
      presenter.showChallenge({id:"s1.heartbeats.bar",label:"Defend yourself",token:"f".repeat(32),ready:true});
    });
    await page.waitForTimeout(150);
    for(const index of [1,0,1,0]) {
      await page.evaluate(index=>{window.storyTestPad.buttons[index]={pressed:true,value:1};},index);
      await page.waitForTimeout(100);
      await page.evaluate(index=>{window.storyTestPad.buttons[index]={pressed:false,value:0};},index);
      await page.waitForTimeout(100);
    }
    await expect.poll(() => page.evaluate(() => window.storyQteResponses)).toEqual([["challenge_result","f".repeat(32),"success"]]);
    await page.screenshot({path:testInfo.outputPath("gamepad-qte-success.png")});
    await page.evaluate(() => {
      const presenter=window.storyProbe.regions.controller.dialogue;
      presenter.hide();presenter.onChallengeResponse=window.storyQteOldResponse;
    });
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
  if (ending === "complete" && process.env.NEW_YOKOSUKA_DOJO_E2E === "true") {
    await continueAfterAllowance(page,testInfo,character,character.yen+500,errors);
  }
});

async function expectNotebookEntry(page, pattern, {present=true}={}) {
  const overlay=page.locator("#journal-overlay");
  if(!await overlay.isVisible())await page.locator("#journal-button").click();
  await expect(overlay).toBeVisible();
  const copy=page.locator("#journal-page-copy"),number=page.locator("#journal-page-number");
  const previous=page.locator("#journal-previous"),next=page.locator("#journal-next");
  const counter=(await number.innerText()).match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  expect(counter,"Notebook exposes its current page and finite page count").not.toBeNull();
  const total=Number(counter[2]);
  expect(total).toBeGreaterThan(0);expect(total).toBeLessThanOrEqual(256);
  const turn=async button=>{
    const old=await number.innerText();await button.click();await expect(number).not.toHaveText(old);
  };
  // The UI remembers a stable page ID per character. Use only real paging
  // controls; neither a new browser nor another saved page implies page one.
  for(let step=0;step<total&&await previous.isEnabled();step++)await turn(previous);
  await expect(previous).toBeDisabled();
  let found=false,visited=0;
  for(let index=0;index<total;index++){
    visited++;
    if(await copy.filter({hasText:pattern}).isVisible()){found=true;break;}
    if(!await next.isEnabled())break;
    await turn(next);
  }
  if(!found){
    expect(visited,"A missing entry is checked across every advertised notebook page").toBe(total);
    await expect(next).toBeDisabled();
  }
  expect(found,"Notebook entry "+pattern+" after inspecting "+visited+" of "+total+" pages").toBe(present);
}

async function continueAfterAllowance(page,testInfo,character,expectedYen,errors){
  test.setTimeout(Math.max(testInfo.timeout, 900_000));
  const readState=async()=>{
    const response=await page.request.get("/api/characters/"+character.id+"/state");
    expect(response.ok(),"Story continuation state HTTP "+response.status()+": "+(await response.text()).slice(0,600)).toBe(true);
    return response.json();
  };
  const before=await readState();
  expect(before.character.openingCompleted).toBe(true);
  expect(before.character.storyFlags["story.s1.first-allowance.completed"]).toBe(true);
  expect(before.character.yen).toBe(expectedYen);
  const dojoEarned=before.character.storyFlags["story.s1.first-dojo.completed"]===true;
  if(dojoEarned)expect(before.character.storyFlags["notebook.s1.men-in-black"]).toBe(true);
  if(!dojoEarned){
    if (process.env.NEW_YOKOSUKA_FRONT_DOOR_E2E === "true") {
      // Exercise the authored door and transition; placing Ryo nearby avoids
      // turning this bounded check into a route-finding test through the house.
      await enterInteriorDoor(page, { fromWorld: "interior", world: "exterior",
        filename: "S1_JOMO_DR15_016.MT5", position: [-14.718089, 0, 5.410742] });
      // Wait for the destination's own frame before the bounded placement.
      await page.waitForFunction(() => window.storyProbe.lastRegionFrame?.area === "JHD0"
        && window.storyProbe.lastRegionFrame?.worldId === "exterior"
        && window.storyProbe.lastRegionFrame?.enabled);
    } else {
      await page.evaluate(async () => window.storyProbe.lifecycle.travelToWorld("exterior"));
    }
    if (process.env.NEW_YOKOSUKA_FIRST_GATE_E2E === "true") {
      await enterInteriorDoor(page,{world:"yamanose",fromWorld:"exterior",filename:"S1_JHD0_DR29_000.MT5",
        position:[1,0,9.4],blocked:true});
      expect((await (await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["story.s1.first-dojo.completed"]).not.toBe(true);
    }
    // Place just outside the dojo volume. Walking triggers the actual event;
    // no direct event start or server-side flag insertion is used.
    const enterDojo = async () => {
      const previousRejections=await page.evaluate(()=>window.storyProbe.scriptRejections?.length||0);
      await page.evaluate(() => {
        const life = window.storyProbe.lifecycle;
        life.resetPlayer(life.vectorFromArray([4.6, 0.97, -17.8]), Math.PI, { persist: false });
      });
      await page.waitForFunction(() => !window.storyProbe.regions.inside.has("s1.jhd0.first-dojo.entrance"));
      await page.locator("#renderCanvas").focus();
      await page.keyboard.down("KeyW");
      try {
        // Room-entry automatic script checks can briefly own the controller;
        // they are not the dojo trigger and must not stop the approach.
        await page.waitForFunction(previous=>{
          const p=window.storyProbe;
          return p.director?.activeCutscene?.cutscene.id === "story-s1-first-dojo"||p.sceneErrors.length
            ||p.scriptRejections?.slice(previous).some(r=>r.selector?.kind==="enter");
        },previousRejections,{timeout:60_000});
      } finally { await page.keyboard.up("KeyW"); }
      const rejected=await page.evaluate(previous=>(window.storyProbe.scriptRejections||[]).slice(previous)
        .filter(r=>r.selector?.kind==="enter").map(r=>({code:r.message.code,message:r.message.message})),previousRejections);
      expect(rejected,"The earned dojo approach must resolve one eligible published event").toEqual([]);
      expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    };
    await enterDojo();
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.storyProbe.regions.controller.cancel("verify-dojo-cancellation"));
    await page.waitForFunction(() => window.storyProbe.regions.controller.status === "idle" && !window.storyProbe.director.active);
    const cancelled = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(cancelled.character.storyFlags["story.s1.first-dojo.completed"]).not.toBe(true);
    expect(cancelled.character.storyFlags["notebook.s1.men-in-black"]).not.toBe(true);
    expect(cancelled.character.yen).toBe(expectedYen);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await enterDojo();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: testInfo.outputPath("first-dojo-dialogue.png") });
    await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 120_000 });
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.first-dojo.completed"])).toBe(true);
    const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(saved.character.storyFlags["notebook.s1.men-in-black"]).toBe(true);
    expect(saved.character.yen).toBe(expectedYen);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    const returned = await page.evaluate(() => {
      const p = window.storyProbe;
      return { position: p.lifecycle.getController().collider.position.asArray(),
        borrowed: p.actorLeases.filter(lease => lease.scene === "story-s1-first-dojo").at(-1).position,
        leases: p.lifecycle.scheduledActors.activityActorOwners.size };
    });
    expect(Math.hypot(...returned.position.map((v, i) => v - returned.borrowed[i]))).toBeLessThan(0.02);
    expect(returned.leases).toBe(0);
    expect(errors).toEqual([]);
    await page.reload(); await page.keyboard.press("Enter");
    await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();
    await page.locator("button").filter({ hasText: /^Enter World$/ }).click();
    await page.waitForFunction(() => window.storyProbe.ready, null, { timeout: 120_000 });
    expect(await page.evaluate(() => window.storyProbe.starts)).toEqual([]);
    expect((await (await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["notebook.s1.men-in-black"]).toBe(true);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    if (process.env.NEW_YOKOSUKA_FIRST_GATE_E2E === "true") {
      await enterInteriorDoor(page,{world:"yamanose",fromWorld:"exterior",filename:"S1_JHD0_DR29_000.MT5",position:[1,0,9.4]});
      expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    }
  }
  // Check the earned journal receipt even when resuming after the dojo movie.
  await expectNotebookEntry(page,/Ask around to find out/);
  await page.screenshot({path:testInfo.outputPath("first-dojo-notebook.png")});
  await page.locator("#journal-close").click();
  await expect(page.locator("#journal-overlay")).toBeHidden();
  if (process.env.NEW_YOKOSUKA_KITTEN_E2E === "true") {
    const beforeKitten=await readState();
    const kittenEarned=beforeKitten.character.storyFlags["story.s1.first-kitten.completed"]===true;
    if(kittenEarned)expect(beforeKitten.character.storyFlags["notebook.s1.black-car"]).toBe(true);
    if(!kittenEarned){
      const food = process.env.NEW_YOKOSUKA_KITTEN_FOOD || "fish";
      expect(["fish", "tofu"]).toContain(food);
      const naturalIntroduction = process.env.NEW_YOKOSUKA_KITTEN_NATURAL_INTRO === "true";
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
      await page.evaluate(() => {
        const scene = window.storyProbe.lifecycle.scene;
        const samples = window.storyProbe.kittenMouth = { vertices: new Set(), weights: new Set(), renderedFrames: 0 };
        const observer = scene.onAfterRenderObservable.add(() => {
          const faces = window.storyProbe.director.activeCutscene?.packageRuntime.presentation.faces;
          const face = faces?.active?.genericFaces.get("MEGM");
          if (!face?.voiceCue) return;
          const meshes = face.speech.controller.binding.meshes.map(record => record.mesh);
          if (!meshes.some(mesh => mesh.isEnabled() && scene.isActiveMesh(mesh))) return;
          samples.renderedFrames++;
          samples.weights.add(face.speech.controller.weight);
          samples.vertices.add(JSON.stringify(meshes.flatMap(mesh => Array.from(mesh.getVerticesData("position")))));
        });
        window.storyProbe.stopKittenMouthProbe = () => scene.onAfterRenderObservable.remove(observer);
      });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: testInfo.outputPath("first-kitten-introduction.png") });
      await page.waitForFunction(() => window.storyProbe.kittenMouth.vertices.size > 2
        && window.storyProbe.director.activeCutscene?.packageRuntime.presentation.faces.active?.genericFaces.get("MEGM")?.speech.controller.weight > 0.5,
      null, { timeout: 45_000 });
      await page.screenshot({ path: testInfo.outputPath("first-kitten-speaking.png") });
      const mouth = await page.evaluate(() => {
        window.storyProbe.stopKittenMouthProbe();
        const sample = window.storyProbe.kittenMouth;
        return { renderedFrames: sample.renderedFrames, vertexStates: sample.vertices.size, mouthStates: sample.weights.size };
      });
      await testInfo.attach("kitten-generic-mouth", { body: JSON.stringify(mouth, null, 2), contentType: "application/json" });
      console.info("Megumi rendered generic mouth:", JSON.stringify(mouth));
      expect(mouth.renderedFrames).toBeGreaterThan(2);
      expect(mouth.mouthStates).toBeGreaterThan(2);
      // Either a natural ending or an explicit skip must lead to the real
      // choice, without awarding a branch-specific clue before the choice.
      if (naturalIntroduction) {
        await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 120_000 });
      } else await page.keyboard.press("KeyX");
      await expect(page.getByRole("button", { name: "Dried fish", exact: true })).toBeVisible();
      const beforeChoice = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(beforeChoice.character.storyFlags["notebook.s1.yamagishi-witness"]).not.toBe(true);
      await page.screenshot({ path: testInfo.outputPath("first-kitten-food-choice.png") });
      await page.getByRole("button", { name: food === "fish" ? "Dried fish" : "Tofu", exact: true }).click();
      await page.waitForFunction(food => window.storyProbe.director?.activeCutscene?.cutscene.id === `story-s1-first-kitten-${food}`, food, { timeout: 60_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: testInfo.outputPath(`first-kitten-${food}.png`) });
      await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 120_000 });
      await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.first-kitten.completed"])).toBe(true);
      const final = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(final.character.storyFlags["notebook.s1.black-car"]).toBe(true);
      expect(Boolean(final.character.storyFlags["notebook.s1.yamagishi-witness"])).toBe(food === "fish");
      expect(final.character.yen).toBe(expectedYen);
      expect(await page.evaluate(food => window.storyProbe.starts.some(id =>
        id === `story-s1-first-kitten-${food === "fish" ? "tofu" : "fish"}`), food)).toBe(false);
      expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.reload(); await page.keyboard.press("Enter");
      await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
      await page.locator(".character-slot-button:not(.empty)").first().click();
      await page.locator("button").filter({ hasText: /^Enter World$/ }).click();
      await page.waitForFunction(() => window.storyProbe.ready, null, { timeout: 120_000 });
      const reloaded = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(reloaded.character.storyFlags).toEqual(final.character.storyFlags);
      expect(reloaded.character.yen).toBe(final.character.yen);
      expect(await page.evaluate(() => window.storyProbe.starts)).toEqual([]);
      expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    }
    // Both fresh completion and an earned resume must display the saved clues.
    // An absent tofu-branch clue is checked across every page, not just the
    // currently remembered one; the original choice assertion remains above.
    const kittenState=await readState();
    expect(kittenState.character.storyFlags["notebook.s1.black-car"]).toBe(true);
    await expectNotebookEntry(page,/Ask about the black car/);
    const witnessEarned=kittenState.character.storyFlags["notebook.s1.yamagishi-witness"]===true;
    await expectNotebookEntry(page,/Visit him at home in Sakuragaoka/,{present:witnessEarned});
    if(!witnessEarned)await expectNotebookEntry(page,/Ask about the black car/);
    await page.screenshot({path:testInfo.outputPath("first-kitten-notebook.png")});
    await page.locator("#journal-close").click();
    await expect(page.locator("#journal-overlay")).toBeHidden();
    if (process.env.NEW_YOKOSUKA_INVESTIGATION_E2E === "true") {
      const current=await readState();
      await continueWitnesses(page, testInfo, current.character, expectedYen);
    }
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    expect(errors).toEqual([]);
  }
}

async function continueWitnesses(page, testInfo, character, expectedYen, resumeAfterTom = false) {
  const witnesses = [
    ["SUMI", "sakuragaoka", "story.s1.sumiya-witness.completed"],
    ["YAMA", "sakuragaoka", "notebook.s1.dobuita-black-car"],
    ["HRSK", "dobuita", "notebook.s1.tom-witness"],
    ["TOM_", "dobuita", "notebook.s1.chinese-community"],
  ];
  if (process.env.NEW_YOKOSUKA_NOZOMI_FIRST_E2E === "true") {
    const flags=await page.evaluate(() => window.storyProbe.regions.getCharacter().storyFlags);
    expect(flags["story.s1.first-dojo.completed"]).toBe(true);
    expect(flags["notebook.s1.yamagishi-witness"]).not.toBe(true);
    expect(flags["story.s1.yamagishi-black-car.completed"]).not.toBe(true);
    witnesses.push(...witnesses.splice(0,2));
  }
  for (const [actor, world, flag, spouse] of [
    ...(resumeAfterTom ? [] : witnesses),
    ...(process.env.NEW_YOKOSUKA_THREE_BLADES_E2E === "true" ? [
      ["UNO_", "dcha", "notebook.s1.three-blades", "RNKT"],
      ["ITOI", "dobuita", "notebook.s1.liu-barber"],
      ["MADA", "dtky", "story.s1.maeda-liu-referral.completed"],
      ["KYUR", "drht", "notebook.s1.liu-senior", "ONRR"],
      ["RKKI", "dobuita", "notebook.s1.sailors"],
    ] : []),
  ]) {
    const alreadyComplete = character.storyFlags?.[flag] === true;
    if (alreadyComplete && process.env.NEW_YOKOSUKA_DIALOGUE_APPROACH_E2E !== "true") continue;
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
    for (const ending of spouse && !alreadyComplete ? ["cancel", "complete"] : ["complete"]) {
      const point = await residentClickPoint(page, actor);
      await testInfo.attach(`${actor}-approach`, { body: JSON.stringify(point, null, 2), contentType: "application/json" });
      console.info("Supported resident approach:", actor, JSON.stringify(point));
      expect(point.pickedActor, "the visible click must select the intended resident").toBe(actor);
      await page.screenshot({ path: testInfo.outputPath(`${actor}-before-talk.png`) });
      if (alreadyComplete) {
        // A completed talk must still be reachable by a real mesh click, but
        // must not be replayed by changing its earned progress in the test.
        await page.mouse.click(point.x, point.y);
        await expect(page.getByText("This conversation is not available right now. Check your notebook for the next lead.", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
        continue;
      }
      const before = await page.evaluate(() => ({
        position:window.storyProbe.lifecycle.getController().collider.position.asArray(),
        facing:Array.from(window.storyProbe.lifecycle.scheduledActors.dialogueFacingTargets),
      }));
      await observeStoryDialogueFace(page, actor);
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => window.storyProbe.dialogue?.active, null, { timeout: 15_000 });
      await page.waitForFunction(() => {
        const audio = window.storyProbe.dialogue?.audio;
        return audio && !audio.paused && audio.currentTime > 0;
      }, null, { timeout: 15_000 });
      const talkActors = spouse ? [actor, spouse] : [actor];
      await expect.poll(() => page.evaluate(async codes => {
        const { scheduledActorMotionSelection } = await import('/play/characters/ScheduledActorMotionRuntime.js');
        const runtime = window.storyProbe.lifecycle.scheduledActors;
        return codes.every(code => {
          const entry = runtime.entries.find(entry => entry.definition.actorCode === code);
          const motionId = entry.definition.nativeDefaultMotionStateId;
          const motion = scheduledActorMotionSelection({motionStateId:motionId});
          return runtime.dialogueFacingState(entry.definition.instanceId)?.defaultIdleMotionId === motionId
            && entry.motionKey?.includes(`:${motion.bank}:${motion.name}:`);
        });
      }, talkActors)).toBe(true);
      await verifyObservedStoryDialogueFace(page, testInfo, `${actor}-dialogue-${ending}`);
      if (spouse) {
        // Ordinary talks retain the gameplay view, not a cinematic camera.
        // Actually turn toward the other speaker; an active body mesh at the
        // edge of the viewport does not prove that its face is visible.
        await lookAtResident(page, spouse);
        await observeStoryDialogueFace(page, spouse);
        await verifyObservedStoryDialogueFace(page, testInfo, `${spouse}-dialogue-${ending}`);
      }
      const view = await page.evaluate(() => {
        const c=window.storyProbe.lifecycle.getController();
        return {firstPerson:c.firstPerson,yaw:c.cameraYaw,pitch:c.cameraPitch};
      });
      // Let every recording finish, including the other participant's lines.
      // Initial playback followed by Space-skipping missed hidden speakers.
      if (ending === "cancel") {
        await page.keyboard.press("KeyX");
        await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
      } else {
        await expect.poll(() => page.evaluate(flag => window.storyProbe.regions.getCharacter()?.storyFlags?.[flag], flag), { timeout: 240_000 }).toBe(true);
      }
      expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(Boolean(saved.character.storyFlags[flag])).toBe(ending === "complete");
      if (process.env.NEW_YOKOSUKA_NOZOMI_FIRST_E2E === "true" && ["HRSK", "TOM_"].includes(actor)) {
        expect(saved.character.storyFlags["story.s1.yamagishi-black-car.completed"]).not.toBe(true);
      }
      expect(saved.character.yen).toBe(expectedYen);
      const restored = await page.evaluate(() => {
        const life=window.storyProbe.lifecycle,c=life.getController();
        return {position:c.collider.position.asArray(),facing:Array.from(life.scheduledActors.dialogueFacingTargets),
          view:{firstPerson:c.firstPerson,yaw:c.cameraYaw,pitch:c.cameraPitch}};
      });
      expect(restored.facing).toEqual(before.facing);
      expect(restored.view).toEqual(view);
      restored.position.forEach((value,i) => expect(value).toBeCloseTo(before.position[i],3));
      await expect.poll(() => page.evaluate(async codes => {
        const { scheduledActorMotionSelection } = await import('/play/characters/ScheduledActorMotionRuntime.js');
        const runtime = window.storyProbe.lifecycle.scheduledActors;
        return codes.every(code => {
          const entry = runtime.entries.find(entry => entry.definition.actorCode === code);
          const state = runtime.networkState.stateFor(entry.definition.instanceId);
          const motion = scheduledActorMotionSelection({...state.visual, operation:state.operation,
            moving:state.mode === 'walking', movementMode:state.movementMode, motionStateId:state.motionStateId});
          return motion && entry.motionKey?.includes(`:${motion.bank}:${motion.name}:`);
        });
      }, talkActors)).toBe(true);
      if (actor === "KYUR" && ending === "complete") {
        const snapshot = await (await page.request.get(`/api/characters/${character.id}/dialogue`)).json();
        expect(Buffer.from(snapshot.state.banks[2], "base64")[8] & 2).toBe(2);
      }
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
    const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    await page.reload(); await enterStoryWorld(page);
    await page.waitForFunction(() => window.storyProbe?.ready, null, { timeout: 120_000 });
    const reloaded = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(reloaded.character.storyFlags).toEqual(saved.character.storyFlags);
    expect(reloaded.character.yen).toBe(expectedYen);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
}

async function lookAtResident(page, actor) {
  const target = await page.evaluate(actor => {
    const life=window.storyProbe.lifecycle,c=life.getController();
    const bounds=life.scheduledActors.dialogueActorModel(actor).renderRoot.getHierarchyBoundingVectors(true);
    const point=bounds.min.add(bounds.max).scale(.5);
    point.y=bounds.min.y+(bounds.max.y-bounds.min.y)*.8;
    const position=c.collider.position;
    const yaw=Math.atan2(-(point.x-position.x),-(point.z-position.z));
    const pitch=Math.atan2(position.y+c.options.firstPersonHeadHeight-point.y,Math.hypot(point.x-position.x,point.z-position.z));
    return {yaw,pitch,dx:Math.atan2(Math.sin(yaw-c.cameraYaw),Math.cos(yaw-c.cameraYaw))/c.options.cameraSensitivity,
      dy:(pitch-c.cameraPitch)/c.options.cameraSensitivity};
  },actor);
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(target.dx),Math.abs(target.dy))/180));
  for(let step=0;step<steps;step++) {
    await page.mouse.move(780,260);await page.mouse.down({button:"right"});
    await page.mouse.move(780+target.dx/steps,260+target.dy/steps,{steps:5});
    await page.mouse.up({button:"right"});
  }
  await expect.poll(() => page.evaluate(({yaw,pitch}) => {
    const c=window.storyProbe.lifecycle.getController();
    return Math.max(Math.abs(Math.atan2(Math.sin(c.cameraYaw-yaw),Math.cos(c.cameraYaw-yaw))),Math.abs(c.cameraPitch-pitch));
  },target)).toBeLessThan(.01);
}

async function observeStoryDialogueFace(page, actor) {
  await page.evaluate(actor => {
    const scene = window.storyProbe.lifecycle.scene;
    const sample = window.storyDialogueFaceSample = { actor, frames: 0, candidateFrames: 0, offscreenFrames: 0, missingBindingFrames: 0, vertices: new Set(), mouths: new Set() };
    const observer = scene.onAfterRenderObservable.add(() => {
      const owner = window.storyProbe.dialogue?.facialPresentation?.active;
      if (owner?.tag !== actor || !owner.ready || owner.audio.paused || owner.audio.currentTime <= 0) return;
      sample.candidateFrames++;
      sample.model = owner.model.modelCode;
      const detailed = owner.faces.active?.faces.get(actor);
      const generic = owner.faces.active?.genericFaces.get(actor);
      const meshes = detailed?.entry.primaryMeshes || generic?.speech.controller.binding.meshes.map(record => record.mesh);
      if (!meshes?.length) { sample.missingBindingFrames++; return; }
      if (!sample.presentation) sample.presentation = {
        root: owner.model.root.getAbsolutePosition().asArray(),
        meshes: meshes.map(mesh => ({name:mesh.name,enabled:mesh.isEnabled(),visible:mesh.isVisible,visibility:mesh.visibility,
          position:mesh.getAbsolutePosition().asArray(),bounds:[mesh.getBoundingInfo().boundingBox.minimumWorld.asArray(),mesh.getBoundingInfo().boundingBox.maximumWorld.asArray()]})),
      };
      if (!meshes.some(mesh => mesh.isEnabled() && scene.isActiveMesh(mesh))) { sample.offscreenFrames++; return; }
      sample.kind = detailed ? "detailed" : "generic";
      sample.frames++;
      sample.mouths.add(detailed ? JSON.stringify(Array.from(detailed.mouth.current)) : generic.speech.controller.weight);
      // Body motion cannot count: model-local mouth vertices only, excluding
      // seam vertices which deliberately follow the moving body attachment.
      sample.vertices.add(JSON.stringify(meshes.flatMap(mesh => {
        const positions = mesh.getVerticesData("position");
        if (!detailed) return Array.from(positions);
        return Array.from(mesh._mt5SourceVertexIndices).flatMap((source, index) => {
          const local = source - detailed.entry.primaryVertexBase;
          return mesh._mt5ExternalParentVertexOffsets?.[index] < 0 || local < 0 || local >= detailed.entry.table.vertexCount
            ? [] : Array.from(positions.slice(index * 3, index * 3 + 3));
        });
      })));
    });
    window.stopStoryDialogueFaceProbe = () => scene.onAfterRenderObservable.remove(observer);
  }, actor);
}

async function verifyObservedStoryDialogueFace(page, testInfo, name) {
  let failure;
  try { await page.waitForFunction(() => window.storyDialogueFaceSample.vertices.size > 2, null, { timeout: 60_000 }); }
  catch (error) { failure = error; }
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  const sample = await page.evaluate(() => {
    window.stopStoryDialogueFaceProbe();
    const s = window.storyDialogueFaceSample;
    return { actor: s.actor, model: s.model, kind: s.kind, frames: s.frames, candidateFrames: s.candidateFrames,
      offscreenFrames: s.offscreenFrames, missingBindingFrames: s.missingBindingFrames, vertices: s.vertices.size, mouths: s.mouths.size, presentation:s.presentation };
  });
  await testInfo.attach(`${name}-rendered-face`, { body: JSON.stringify(sample, null, 2), contentType: "application/json" });
  console.info("Story dialogue rendered face:", JSON.stringify(sample));
  if (failure) throw failure;
  expect(sample.frames).toBeGreaterThan(2);
  expect(sample.mouths).toBeGreaterThan(2);
}

async function residentClickPoint(page, actor, {reposition=true}={}) {
  // Bound travel time without fabricating a talk result: position by the
  // real scheduled NPC, then project its visible mesh for a normal click.
  if (reposition) await page.evaluate(async actor => {
    const { Ray } = await import('/node_modules/@babylonjs/core/Culling/ray.js');
    const life = window.storyProbe.lifecycle;
    const [x, y, z] = life.scheduledActors.dialogueActor(actor).position;
    const controller = life.getController();
    const model = life.scheduledActors.dialogueActorModel(actor);
    if (!model?.renderRoot) throw new Error(`No visible body for ${actor}`);
    const bounds = model.renderRoot.getHierarchyBoundingVectors(true);
    const target = bounds.min.add(bounds.max).scale(.5);
    target.y = bounds.min.y + (bounds.max.y - bounds.min.y) * .8;
    // A fixed +Z offset can be outside a narrow shop and drop below its floor.
    // Use the game's existing ground/volume validation, not no-clip or a
    // per-shop camera override. This bounds travel without inventing footing.
    let approach;
    const blockers = [];
    for (const distance of [2, 2.5, 3]) {
      for (let step = 0; step < 16; step++) {
        const angle = step * Math.PI / 8;
        // A newly loaded variant's root can still be above its eventual
        // grounded pose. This teleport accepts a lower real floor but still
        // requires full support and a clear standing volume there.
        approach = controller.recoveryCandidateAt(x + Math.sin(angle) * distance, z + Math.cos(angle) * distance, y, { constrainHeight: false });
        if (!approach) continue;
        // A valid standing volume can be behind a shop wall. Require the
        // visible body's sightline too; an NPC proxy alone can be picked
        // through scenery and cannot prove a rendered conversation.
        const eye = approach.clone(); eye.y += controller.options.firstPersonHeadHeight;
        const offset = target.subtract(eye), distanceToActor = offset.length();
        const ray = new Ray(eye, offset.scale(1 / distanceToActor), Math.max(0, distanceToActor - .25));
        const blocked = life.scene.pickWithRay(ray, mesh => {
          if (!mesh.isEnabled() || !mesh.isVisible || !mesh.isPickable || mesh.isDescendantOf(controller.actorRoot)) return false;
          for (let parent = mesh; parent; parent = parent.parent) if (parent.metadata?.scheduledActorInstanceId) return false;
          return true;
        });
        if (!blocked?.hit) break;
        if (blockers.length < 6) blockers.push({position:approach.asArray(),mesh:blocked.pickedMesh?.name,distance:blocked.distance,material:blocked.pickedMesh?.material?.name});
        approach = null;
      }
      if (approach) break;
    }
    if (!approach) throw new Error(`No visible supported test approach for ${actor}: ${JSON.stringify({position:[x,y,z],target:target.asArray(),bounds:[bounds.min.asArray(),bounds.max.asArray()],blockers})}`);
    life.resetPlayer(approach, Math.PI, { persist: false });
    controller.setFirstPerson(true);
    controller.cameraYaw = 0;
    controller.cameraPitch = 0;
  }, actor);
  await page.waitForTimeout(1200);
  return page.evaluate(async actor => {
    const { pickScheduledActorSelection, scheduledActorSelection } = await import('/play/characters/ScheduledActorRuntime.js');
    const life = window.storyProbe.lifecycle;
    const model = life.scheduledActors.dialogueActorModel(actor);
    if (!model?.renderRoot) throw new Error(`No visible body for ${actor}`);
    const bounds = model.renderRoot.getHierarchyBoundingVectors(true);
    const point = bounds.min.add(bounds.max).scale(.5);
    // Frame and click the upper body, keeping the mouth inside the viewport
    // for tall residents instead of centering the chest and clipping the face.
    point.y = bounds.min.y + (bounds.max.y - bounds.min.y) * .8;
    // Walking residents can move between positioning the player and clicking.
    // Aim at the current rendered body, not a stale root + guessed head height.
    const controller = life.getController(), position = controller.collider.position;
    const floor = controller.sampleTerrain(position.x, position.z, position.y);
    if (!floor || Math.abs(floor.height - position.y) > 0.15) throw new Error(`Unsupported test approach for ${actor}: ${position.asArray()}`);
    controller.cameraYaw = Math.atan2(-(point.x - position.x), -(point.z - position.z));
    controller.cameraPitch = Math.atan2(position.y + controller.options.firstPersonHeadHeight - point.y,
      Math.hypot(point.x - position.x, point.z - position.z));
    controller.updateCamera(1);
    // Visibility is evaluated during rendering. Picking immediately after
    // turning can otherwise test the prior view's disabled NPC bodies.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        life.scene.onAfterRenderObservable.remove(observer);
        reject(new Error(`No rendered body after aiming at ${actor}`));
      }, 5000);
      const observer = life.scene.onAfterRenderObservable.add(() => {
        if (!model.renderRoot.getChildMeshes(false).some(mesh =>
          mesh.isEnabled() && mesh.isVisible && life.scene.isActiveMesh(mesh))) return;
        clearTimeout(timer);
        life.scene.onAfterRenderObservable.remove(observer);
        resolve();
      });
    });
    const rect = life.engine.getRenderingCanvas().getBoundingClientRect();
    const viewProjection = life.scene.activeCamera.getViewMatrix(true).multiply(life.scene.activeCamera.getProjectionMatrix(true));
    const screen = point.constructor.Project(point, viewProjection.constructor.Identity(), viewProjection,
      life.scene.activeCamera.viewport.toGlobal(life.engine.getRenderWidth(), life.engine.getRenderHeight()));
    const pointerX = screen.x * rect.width / life.engine.getRenderWidth(), pointerY = screen.y * rect.height / life.engine.getRenderHeight();
    const direct = life.scene.pick(pointerX, pointerY, undefined, false, life.scene.activeCamera);
    const selected = pickScheduledActorSelection(life.scene, life.scene.activeCamera, pointerX, pointerY, direct);
    const proxy = life.scene.pick(pointerX, pointerY,
      mesh => mesh.isEnabled() && !!mesh.metadata?.scheduledActorDebugSelectionProxy,
      false, life.scene.activeCamera);
    return { x: rect.x + screen.x * rect.width / life.engine.getRenderWidth(),
      y: rect.y + screen.y * rect.height / life.engine.getRenderHeight(),
      pickedActor:selected?.actorCode,directActor:scheduledActorSelection(direct?.pickedMesh)?.actorCode,directMesh:direct?.pickedMesh?.name,
      proxyActor:scheduledActorSelection(proxy?.pickedMesh)?.actorCode,proxyDistance:proxy?.distance,directDistance:direct?.distance,
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
    if (character.storyFlags?.[flag]) continue;
    await page.evaluate(async world=>{await window.storyProbe.lifecycle.travelToWorld(world);},world);
    await page.waitForFunction(actor=>window.storyProbe.lifecycle.scheduledActors.dialogueActor(actor),actor,{timeout:60_000});
    for (const ending of actor === "GRKN" ? ["cancel", "complete"] : ["complete"]) {
    const point=await residentClickPoint(page,actor);
    const before=await page.evaluate(()=>{
      const c=window.storyProbe.lifecycle.getController();
      return {position:c.collider.position.asArray(),firstPerson:c.firstPerson,cameraYaw:c.cameraYaw,cameraPitch:c.cameraPitch};
    });
    await observeStoryDialogueFace(page,actor);
    await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
    await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:15_000});
    await verifyObservedStoryDialogueFace(page,testInfo,`${actor}-night-dialogue-${ending}`);
    if (actor === "GRKN") {
      // This original conversation has two resident speakers. Checking only
      // the clicked actor previously left Yong's lines completely unreviewed.
      await observeStoryDialogueFace(page,"ECHO");
      await verifyObservedStoryDialogueFace(page,testInfo,`ECHO-night-dialogue-${ending}`);
    }
    if (ending === "cancel") {
      await page.keyboard.press("KeyX");
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
      const cancelled=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(cancelled.character.storyFlags[flag]).not.toBe(true);
    } else {
    // Let all original lines finish. A Space-skipped smoke check cannot prove
    // the remaining recordings load or that a natural ending releases input.
    await expect.poll(()=>page.evaluate(flag=>window.storyProbe.regions.getCharacter()?.storyFlags?.[flag],flag),{timeout:180_000}).toBe(true);
    }
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    if (actor === "GRKN") {
      const restored=await page.evaluate(()=>{
        const p=window.storyProbe,c=p.lifecycle.getController();
        return {position:c.collider.position.asArray(),firstPerson:c.firstPerson,cameraYaw:c.cameraYaw,cameraPitch:c.cameraPitch,leases:p.lifecycle.scheduledActors.activityActorOwners.size};
      });
      expect(restored.leases).toBe(0);
      expect(restored.firstPerson).toBe(before.firstPerson);
      restored.position.forEach((value,i)=>expect(value).toBeCloseTo(before.position[i],3));
      expect(restored.cameraYaw).toBeCloseTo(before.cameraYaw,3);
      expect(restored.cameraPitch).toBeCloseTo(before.cameraPitch,3);
    }
    const saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
    if (ending === "complete") expect(saved.character.storyFlags[flag]).toBe(true);
    expect(saved.character.yen).toBe(character.yen);
    }
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
  await page.reload(); await enterStoryWorld(page);
  await page.waitForFunction(()=>window.storyProbe?.ready,null,{timeout:120_000});
  const reloaded=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(reloaded.character.storyFlags).toEqual(morning.character.storyFlags);
  expect(reloaded.character.yen).toBe(morning.character.yen);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

async function verifyAlleyQte(page,testInfo,character) {
  const state=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  if(new Date(state.worldState.gameTimeMs).getUTCHours()<19){
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
    await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  }
  await placeAtHeartbeatsApproach(page);
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{await page.waitForFunction(()=>window.storyProbe.starts.includes("story-s1-heartbeats-introduction")||window.storyProbe.sceneErrors.length,null,{timeout:20_000});}
  finally{await page.keyboard.up("KeyW");}
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=15,null,{timeout:60_000});
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-introduction.png")});
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready,null,{timeout:90_000});
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-prompt.png")});
  await page.keyboard.press("Enter");
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.heartbeats.alley.defense.failure"&&window.storyProbe.authoredScene.active.elapsed>=.5);
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-failed-defense.png")});
  await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible();
  const failed=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(failed.character.storyFlags["story.s1.heartbeats-alley.completed"]).not.toBe(true);
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready&&window.storyProbe.regions.controller.dialogue.qte?.active?.steps[window.storyProbe.regions.controller.dialogue.qte.active.index]?.buttons[0]==="B",null,{timeout:90_000});
  await page.keyboard.press("Shift");
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.heartbeats.alley.defense.success"&&window.storyProbe.authoredScene.active.elapsed>=.7,null,{timeout:15_000});
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-first-counter.png")});
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.elapsed>=2);
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-tony-falls.png")});
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.heartbeats.alley.finish"&&window.storyProbe.regions.controller.active.challengePrompt.ready,null,{timeout:15_000});
  // The first successful animation is not the event outcome. Failing the
  // second input must release its retained cast and still offer a full retry.
  await page.keyboard.press("Shift");
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.heartbeats.alley.defense.second-failure"&&window.storyProbe.authoredScene.active.elapsed>=.5);
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-second-failure.png")});
  await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.storyProbe.authoredScene.active)).toBeNull();
  expect((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["story.s1.heartbeats-alley.completed"]).not.toBe(true);
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.heartbeats.alley.defend"&&window.storyProbe.regions.controller.active.challengePrompt.ready,null,{timeout:90_000});
  await page.keyboard.press("Shift");
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.heartbeats.alley.defense.success"&&window.storyProbe.authoredScene.active.elapsed>=.5);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("verify-first-defense-cancellation"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await page.evaluate(()=>window.storyProbe.authoredScene.active)).toBeNull();
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["story.s1.heartbeats-alley.completed"]).not.toBe(true);
  const starts=await page.evaluate(()=>window.storyProbe.starts.length);
  await placeAtHeartbeatsApproach(page);
  await page.waitForTimeout(300);
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{await page.waitForFunction(count=>window.storyProbe.starts.length>count,starts,{timeout:20_000});}
  finally{await page.keyboard.up("KeyW");}
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.heartbeats.alley.defend"&&window.storyProbe.regions.controller.active.challengePrompt.ready,null,{timeout:90_000});
  await page.keyboard.press("Shift");
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.heartbeats.alley.finish"&&window.storyProbe.regions.controller.active.challengePrompt.ready,null,{timeout:15_000});
  await page.keyboard.press("Enter");
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.heartbeats.alley.defense.second-success"&&window.storyProbe.authoredScene.active.elapsed>=.6);
  expect((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character.storyFlags["story.s1.heartbeats-alley.completed"]).not.toBe(true);
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-second-counter.png")});
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.heartbeats.alley.defense.second-success"&&window.storyProbe.authoredScene.active.elapsed>=2);
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-smith-falls.png")});
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.heartbeats-alley.completed"])).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  expect(saved.character.yen).toBe(character.yen);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  const restored=await page.evaluate(()=>{const c=window.storyProbe.lifecycle.getController(),p=c.collider.position;return{firstPerson:c.firstPerson,y:p.y,floor:c.sampleTerrain(p.x,p.z,p.y)?.height};});
  expect(restored.firstPerson).toBe(true);expect(restored.floor).toBeCloseTo(restored.y,2);
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-controls-restored.png")});
}

async function verifyBarQte(page, testInfo, character) {
  const gamepad = process.env.NEW_YOKOSUKA_CONNECTED_GAMEPAD_QTE_E2E === "true";
  const press = async button => {
    if (!gamepad) return page.keyboard.press(button === "B" ? "Shift" : "Enter");
    const index = button === "B" ? 1 : 0;
    await page.evaluate(index => { window.storyTestPad.buttons[index] = {pressed:true,value:1}; }, index);
    await page.waitForTimeout(100);
    await page.evaluate(index => { window.storyTestPad.buttons[index] = {pressed:false,value:0}; }, index);
    await page.waitForTimeout(100);
  };
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
  await press("A");
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
    await press(button);
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

async function walkToDojo(page,testInfo) {
  // Waypoints follow the courtyard around the residence; all displacement
  // comes from the ordinary controller rather than test-only position resets.
  // Original JHD0 code-10 boundaries identify the dojo's west-facing stair
  // flight at x=-0.83..0.69, z=-23.50..-21.49.
  const targets=[[3,4],[-7,4],[-7,-22.5],[2,-22.5]];
  const positions=[];
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  try {
    let next=0;
    for(let step=0;step<240;step++){
      const state=await page.evaluate(([x,z])=>{
        const p=window.storyProbe,c=p.lifecycle.getController(),position=c.collider.position;
        c.cameraYaw=Math.atan2(-(x-position.x),-(z-position.z));c.updateCamera(1);
        return {position:position.asArray(),scene:p.director?.activeCutscene?.cutscene.id,
          status:p.regions.controller.status,locked:c.movementLocked};
      },targets[next]);
      positions.push(state.position);
      if(state.scene==="story-s1-first-dojo"){
        console.info("Natural dojo walk:",JSON.stringify({start:positions[0],end:state.position,samples:positions.length}));
        await page.screenshot({path:testInfo.outputPath("natural-dojo-walk.png")});
        return;
      }
      if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<.8){next++;}
      if(step>12){
        const old=positions[step-10],now=state.position;
        if(Math.hypot(now[0]-old[0],now[2]-old[2])<.15){
          await page.screenshot({path:testInfo.outputPath("natural-dojo-walk-blocked.png")});
          throw Error(`Natural dojo path stopped: ${JSON.stringify({target:targets[next],state,recent:positions.slice(-5)})}`);
        }
      }
      await page.waitForTimeout(300);
    }
    throw Error(`Natural dojo walk timed out: ${JSON.stringify(positions.slice(-5))}`);
  } finally {await page.keyboard.up("KeyW");}
}

async function walkToKitten(page,testInfo) {
  const targets=[[48,94],[47,92],[44,90],[42,87],[40,84],[38,81],[37,77],
    [36,73],[35,69],[37,66],[40,64],[42,61],[44,58],[45,54],
    [43,51],[40,49],[36,48],[35,44],[36,43]],positions=[];
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try {
    let next=0;
    for(let step=0;step<350;step++){
      const state=await page.evaluate(([x,z])=>{
        const p=window.storyProbe,c=p.lifecycle.getController(),position=c.collider.position;
        c.cameraYaw=Math.atan2(-(x-position.x),-(z-position.z));c.updateCamera(1);
        return {position:position.asArray(),scene:p.director?.activeCutscene?.cutscene.id,status:p.regions.controller.status,locked:c.movementLocked};
      },targets[next]);
      positions.push(state.position);
      if(state.scene==="story-s1-first-kitten-introduction"){
        console.info("Natural kitten walk:",JSON.stringify({start:positions[0],end:state.position,samples:positions.length}));
        await page.screenshot({path:testInfo.outputPath("natural-kitten-walk.png")});return;
      }
      if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<.8)next++;
      if(step>12){const old=positions[step-10],now=state.position;
        if(Math.hypot(now[0]-old[0],now[2]-old[2])<.15){
          await page.screenshot({path:testInfo.outputPath("natural-kitten-walk-blocked.png")});
          throw Error(`Natural kitten path stopped: ${JSON.stringify({target:targets[next],state,recent:positions.slice(-5)})}`);
        }
      }
      await page.waitForTimeout(300);
    }
    throw Error(`Natural kitten walk timed out: ${JSON.stringify(positions.slice(-5))}`);
  } finally {await page.keyboard.up("KeyW");}
}

async function walkToSakuragaoka(page,testInfo) {
  const targets=[[35,46],[32,46],[30,45],[29,43],[26,43],[24,42],
    [21,42],[18,42],[15,42],[12,42],[10,41]],positions=[];
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try {
    let next=0;
    for(let step=0;step<300;step++){
      const state=await page.evaluate(([x,z])=>{
        const p=window.storyProbe,l=p.lifecycle,c=l.getController(),position=c.collider.position;
        if(l.worldRuntime.activeWorld.id==="yamanose"){
          c.cameraYaw=Math.atan2(-(x-position.x),-(z-position.z));c.updateCamera(1);
        }
        return {position:position.asArray(),world:l.worldRuntime.activeWorld.id,ready:l.worldRuntime.ready,switching:l.worldRuntime.switching};
      },targets[next]);
      positions.push(state.position);
      if(state.world==="sakuragaoka"){
        await page.keyboard.up("KeyW");
        await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:90_000});
        console.info("Natural Yamanose road:",JSON.stringify({start:positions[0],end:state.position,samples:positions.length}));return;
      }
      if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<.8)next++;
      if(step>12&&!state.switching){const old=positions[step-10],now=state.position;
        if(Math.hypot(now[0]-old[0],now[2]-old[2])<.15){
          await page.screenshot({path:testInfo.outputPath("natural-yamanose-road-blocked.png")});
          throw Error(`Natural road stopped: ${JSON.stringify({target:targets[next],state,recent:positions.slice(-5)})}`);
        }
      }
      await page.waitForTimeout(300);
    }
    throw Error(`Natural road timed out: ${JSON.stringify(positions.slice(-5))}`);
  } finally {await page.keyboard.up("KeyW");}
}

async function walkToSumiya(page,testInfo) {
  const targets=[[8,28],[8,25],[8,22],[8,19],[8,16],[9,14],
    [11,13],[11,10],[11,7],[11,4],[14,4],[19,3],[24,2],[29,1]],positions=[];
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{
    let next=0;
    for(let step=0;step<400;step++){
      const state=await page.evaluate(({target,following})=>{
        const l=window.storyProbe.lifecycle,c=l.getController(),position=c.collider.position,actor=l.scheduledActors.dialogueActor("SUMI")?.position;
        const [x,z]=following&&actor?[actor[0],actor[2]]:target;
        c.cameraYaw=Math.atan2(-(x-position.x),-(z-position.z));c.updateCamera(1);
        return {position:position.asArray(),actor,world:l.worldRuntime.activeWorld.id};
      },{target:targets[next],following:next===targets.length-1});
      positions.push(state.position);
      if(state.actor&&Math.hypot(state.position[0]-state.actor[0],state.position[2]-state.actor[2])<2.4){
        console.info("Natural Sumiya approach:",JSON.stringify({start:positions[0],end:state.position,actor:state.actor,samples:positions.length}));return;
      }
      if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<.8)next++;
      if(step>12){const old=positions[step-10],now=state.position;
        if(Math.hypot(now[0]-old[0],now[2]-old[2])<.15){
          await page.screenshot({path:testInfo.outputPath("natural-sumiya-path-blocked.png")});
          throw Error(`Natural Sumiya path stopped: ${JSON.stringify({target:targets[next],state,recent:positions.slice(-5)})}`);
        }
      }
      await page.waitForTimeout(300);
    }
    throw Error(`Natural Sumiya path timed out: ${JSON.stringify(positions.slice(-5))}`);
  }finally{await page.keyboard.up("KeyW");}
}

async function walkToYamagishi(page,testInfo) {
  // Waypoints follow JD00's collision-free streets and avoid the native
  // Yamanose and Dobuita transition volumes; the final target is the actor.
  const targets=[[29,0],[24,1],[20,3],[15,3],[12,4],[11,7],[11,12],
    [10,14],[6,16],[1,18],[1,20],[-5,20],[-11,20],[-12,25],[-12,29],[-14,33]],positions=[];
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{
    let next=0;
    for(let step=0;step<650;step++){
      const state=await page.evaluate(({target,following})=>{
        const l=window.storyProbe.lifecycle,c=l.getController(),position=c.collider.position,actor=l.scheduledActors.dialogueActor("YAMA")?.position;
        const [x,z]=following&&actor?[actor[0],actor[2]]:target;
        c.cameraYaw=Math.atan2(-(x-position.x),-(z-position.z));c.updateCamera(1);
        return {position:position.asArray(),actor,world:l.worldRuntime.activeWorld.id};
      },{target:targets[next],following:next===targets.length-1});
      positions.push(state.position);
      if(state.world!=="sakuragaoka")throw Error(`Unexpected zone during Yamagishi walk: ${JSON.stringify(state)}`);
      if(state.actor&&Math.hypot(state.position[0]-state.actor[0],state.position[2]-state.actor[2])<2.4){
        console.info("Natural Yamagishi approach:",JSON.stringify({start:positions[0],end:state.position,actor:state.actor,samples:positions.length}));return;
      }
      if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<.8)next++;
      if(step>12){const old=positions[step-10],now=state.position;
        if(Math.hypot(now[0]-old[0],now[2]-old[2])<.15){
          await page.screenshot({path:testInfo.outputPath("natural-yamagishi-path-blocked.png")});
          throw Error(`Natural Yamagishi path stopped: ${JSON.stringify({target:targets[next],state,recent:positions.slice(-5)})}`);
        }
      }
      await page.waitForTimeout(300);
    }
    throw Error(`Natural Yamagishi path timed out: ${JSON.stringify(positions.slice(-5))}`);
  }finally{await page.keyboard.up("KeyW");}
}

async function walkToDobuita(page,testInfo) {
  const targets=[[-13,29],[-12,26],[-12,22],[-12,18],[-12,14],[-12,10],
    [-12,6],[-14,4],[-18,4],[-22,4],[-26,4],[-30,4],[-35,4]],positions=[];
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{
    let next=0;
    for(let step=0;step<350;step++){
      const state=await page.evaluate(([x,z])=>{
        const l=window.storyProbe.lifecycle,c=l.getController(),position=c.collider.position;
        if(l.worldRuntime.activeWorld.id==="sakuragaoka"){
          c.cameraYaw=Math.atan2(-(x-position.x),-(z-position.z));c.updateCamera(1);
        }
        return {position:position.asArray(),world:l.worldRuntime.activeWorld.id,switching:l.worldRuntime.switching};
      },targets[next]);
      positions.push(state.position);
      if(state.world==="dobuita"){
        await page.keyboard.up("KeyW");
        await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
        console.info("Natural Dobuita road:",JSON.stringify({start:positions[0],end:state.position,samples:positions.length}));return;
      }
      if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<.8)next++;
      if(step>12&&!state.switching){const old=positions[step-10],now=state.position;
        if(Math.hypot(now[0]-old[0],now[2]-old[2])<.15){
          await page.screenshot({path:testInfo.outputPath("natural-dobuita-road-blocked.png")});
          throw Error(`Natural Dobuita road stopped: ${JSON.stringify({target:targets[next],state,recent:positions.slice(-5)})}`);
        }
      }
      await page.waitForTimeout(300);
    }
    throw Error(`Natural Dobuita road timed out: ${JSON.stringify(positions.slice(-5))}`);
  }finally{await page.keyboard.up("KeyW");}
}

async function walkToNozomi(page,testInfo) {
  return walkToScheduledWitness(page,testInfo,"HRSK","Nozomi",[[-10,90],[-7,88],[-6,86],[2,81],[7,78],[20,77],
    [32,77],[44,77],[49,80],[57,84],[59,82],[64,80],[65,73]]);
}

async function walkToTom(page,testInfo) {
  return walkToScheduledWitness(page,testInfo,"TOM_","Tom",[[65,73],[66,70],[66,60],[66,50],[62,50],[58,46],
    [53,43],[48,40],[40,40],[32,40],[25,39],[21,39]]);
}

async function walkToScheduledWitness(page,testInfo,actorCode,label,targets,world="dobuita",{maxSteps=500,arrivalRadius=.8,approachRadius=2.4}={}) {
  const positions=[];
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{
    let next=0;
    for(let step=0;step<maxSteps;step++){
      const state=await page.evaluate(({target,following,actorCode})=>{
        const l=window.storyProbe.lifecycle,c=l.getController(),position=c.collider.position,actor=l.scheduledActors.dialogueActor(actorCode)?.position;
        const [x,z]=following&&actor?[actor[0],actor[2]]:target;
        c.cameraYaw=Math.atan2(-(x-position.x),-(z-position.z));c.updateCamera(1);
        return {position:position.asArray(),actor,world:l.worldRuntime.activeWorld.id};
      },{target:targets[next],following:next===targets.length-1,actorCode});
      positions.push(state.position);
      if(state.world!==world)throw Error(`Unexpected zone during ${label} walk: ${JSON.stringify(state)}`);
      if(state.actor&&Math.hypot(state.position[0]-state.actor[0],state.position[2]-state.actor[2])<approachRadius){
        console.info(`Natural ${label} approach:`,JSON.stringify({start:positions[0],end:state.position,actor:state.actor,samples:positions.length}));return;
      }
      if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<arrivalRadius)next++;
      if(step>12){const old=positions[step-10],now=state.position;
        if(Math.hypot(now[0]-old[0],now[2]-old[2])<.15){
          await page.screenshot({path:testInfo.outputPath(`natural-${label.toLowerCase()}-path-blocked.png`)});
          throw Error(`Natural ${label} path stopped: ${JSON.stringify({target:targets[next],state,recent:positions.slice(-5)})}`);
        }
      }
      await page.waitForTimeout(300);
    }
    throw Error(`Natural ${label} path timed out: ${JSON.stringify(positions.slice(-5))}`);
  }finally{await page.keyboard.up("KeyW");}
}

async function walkToAjiichi(page,testInfo) {
  return walkToLandmark(page,testInfo,{world:"dobuita",label:"Ajiichi",targets:[[25,39],[32,40],[40,40],[48,40],[53,43],[58,46],
    [62,50],[66,50],[66,54],[67,57],[70,58],[72,61],[80,61],[88,62],[93,63],[95,65]]});
}

async function walkToLandmark(page,testInfo,{world,label,targets,maxSteps=500,arrivalRadius=.8}) {
  const positions=[];
  await page.evaluate(()=>window.storyProbe.lifecycle.getController().setFirstPerson(true));
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{
    let next=0;
    for(let step=0;step<maxSteps;step++){
      const state=await page.evaluate(([x,z])=>{
        const l=window.storyProbe.lifecycle,c=l.getController(),position=c.collider.position;
        c.cameraYaw=Math.atan2(-(x-position.x),-(z-position.z));c.updateCamera(1);
        return {position:position.asArray(),world:l.worldRuntime.activeWorld.id};
      },targets[next]);
      positions.push(state.position);
      if(state.world!==world)throw Error(`Unexpected zone during ${label} walk: ${JSON.stringify(state)}`);
      if(next===targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<arrivalRadius){
        console.info(`Natural ${label} approach:`,JSON.stringify({start:positions[0],end:state.position,samples:positions.length}));return;
      }
      if(next<targets.length-1&&Math.hypot(state.position[0]-targets[next][0],state.position[2]-targets[next][1])<arrivalRadius)next++;
      if(step>12){const old=positions[step-10],now=state.position;
        if(Math.hypot(now[0]-old[0],now[2]-old[2])<.15){
          await page.screenshot({path:testInfo.outputPath(`natural-${label.toLowerCase().replaceAll(" ","-")}-path-blocked.png`)});
          throw Error(`Natural ${label} path stopped: ${JSON.stringify({target:targets[next],state,recent:positions.slice(-5)})}`);
        }
      }
      await page.waitForTimeout(300);
    }
    throw Error(`Natural ${label} path timed out: ${JSON.stringify(positions.slice(-5))}`);
  }finally{await page.keyboard.up("KeyW");}
}

async function enterInteriorDoor(page,{world,filename,doorSelector,position,yaw=0,fromWorld="dobuita",blocked=false,reposition=true}) {
    await page.evaluate(async ({filename,doorSelector,position,yaw,fromWorld,reposition}) => {
      const life = window.storyProbe.lifecycle;
      if(life.worldRuntime.activeWorld.id!==fromWorld){
        if(!reposition)throw new Error(`Expected ${fromWorld} before entering door`);
        await life.travelToWorld(fromWorld);
      }
      if(reposition)life.resetPlayer(life.vectorFromArray(position), yaw, { persist: false });
      // Storefronts can share one original door model. A physical selector
      // identifies its placement; a filename alone can pick another shop.
      const door = life.doorInteractions.entries.find(entry => Number.isInteger(doorSelector)
        ? entry.doorSelector===doorSelector : entry.root._filename === filename);
      if (!door) throw new Error(`Interior door ${filename} is missing`);
      const bounds = door.root.getHierarchyBoundingVectors(true), center = bounds.min.add(bounds.max).scale(.5);
      const controller = life.getController();
      const location=controller.collider.position;
      controller.setFirstPerson(true);
      controller.cameraYaw = Math.atan2(-(center.x - location.x), -(center.z - location.z));
      controller.cameraPitch = Math.atan2(location.y+controller.options.firstPersonHeadHeight-center.y,
        Math.hypot(center.x-location.x,center.z-location.z));
      controller.updateCamera(1);
    },{filename,doorSelector,position,yaw,fromWorld,reposition});
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
      const centerX=screen.x*rect.width/life.engine.getRenderWidth(),centerY=screen.y*rect.height/life.engine.getRenderHeight();
      // A double door's bounding-box center can fall in the gap between its
      // leaves. Find a visible pixel on this same door, not a nearby object.
      let x=centerX,pick;
      for(const offset of Number.isInteger(doorSelector)?[0,-25,25,-50,50,-75,75]:[0]){
        const candidate=life.scene.pick(centerX+offset,centerY,mesh=>Object.keys(mesh.metadata||{}).some(key=>key.startsWith('interactive')),false,life.scene.activeCamera);
        if(!pick)pick=candidate;
        if(!Number.isInteger(doorSelector)||candidate?.pickedMesh?.metadata?.interactiveDoor?.doorSelector===doorSelector){x=centerX+offset;pick=candidate;break;}
      }
      return { x: rect.x + x, y: rect.y + centerY,
        depth:screen.z,doorCenter:center.asArray(),playerPosition:life.getController().collider.position.asArray(),
        filename:door.root._filename,selector:door.doorSelector,type:door.type,state:door.state,
        picked:pick?.pickedMesh?.name,pickedSelector:pick?.pickedMesh?.metadata?.interactiveDoor?.doorSelector,
        transition:pick?.pickedMesh?.metadata?.interactiveMapTransition?.transition?.id };
    },{filename,doorSelector});
    console.info("Door pick",point);
    await page.screenshot({path:test.info().outputPath(`${world}-door-approach.png`)});
    expect(point.x).toBeGreaterThan(280);expect(point.x).toBeLessThan(1025);
    expect(point.y).toBeGreaterThan(0);expect(point.y).toBeLessThan(720);
    if(Number.isInteger(doorSelector))expect(point.pickedSelector).toBe(doorSelector);
    await page.mouse.click(point.x, point.y);
    if(blocked){
      await expect(page.getByText("I should go and talk to Fuku-san.", {exact:true})).toBeVisible();
      try {
        await expect.poll(()=>page.evaluate(()=>window.storyGateVoices.some(voice=>voice.playing && voice.ended && !voice.muted && voice.volume>0)),{timeout:15000}).toBe(true);
      } catch(error) {
        console.info("Gate voice attempts:",JSON.stringify(await page.evaluate(()=>window.storyGateVoices)));
        throw error;
      }
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe(fromWorld);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.screenshot({path:test.info().outputPath("first-dojo-gate-reminder.png")});
      return;
    }
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
  // Ono's original 10:00 journey waits inside for 120 game-seconds before
  // walking out. Review during ordinary afternoon business, when the optional
  // Nagai office is open too; do not force actors through their shop walls.
  await waitUntil("Wait until 1 p.m.", 13);
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
    if (character.storyFlags[flag]) continue;
    await page.evaluate(async world => { await window.storyProbe.lifecycle.travelToWorld(world); }, world);
    await page.waitForFunction(actor => window.storyProbe.lifecycle.scheduledActors.dialogueActor(actor), actor, { timeout: 60_000 });
    const point = await residentClickPoint(page, actor);
    expect(point.x).toBeGreaterThan(280);
    expect(point.x).toBeLessThan(1025);
    await page.screenshot({ path: testInfo.outputPath(`charlie-${actor}-before-talk.png`) });
    await observeStoryDialogueFace(page, actor);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.storyProbe.dialogue?.active || window.storyProbe.sceneErrors.length);
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForFunction(() => {
      const audio = window.storyProbe.dialogue?.audio;
      return audio && !audio.paused && audio.currentTime > 0;
    }, null, { timeout: 15_000 });
    await verifyObservedStoryDialogueFace(page, testInfo, `charlie-${actor}-voiced`);
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
  if(process.env.NEW_YOKOSUKA_COMBAT_REVIEW_E2E === "true") {
    await reviewStoryFight(page,testInfo);
    return;
  }
  // Let the real client-controlled opponents defeat an idle player, then retry.
  await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible({timeout:60_000});
  let saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["notebook.s1.tattoo-parlor"]).not.toBe(true);
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready,null,{timeout:60_000});
  await fightStoryAmbush(page,testInfo);
  const intents=await page.evaluate(()=>window.storyProbe.combatInputs);
  await testInfo.attach("combat-inputs",{body:JSON.stringify(intents),contentType:"application/json"});
  // The distance-based strategy can legitimately win with Elbow Assaults;
  // require consumed attack input without prescribing a leg attack.
  expect(intents.some(intent=>["hand","leg","throw"].includes(intent.action)),"the fight consumes real attack input").toBe(true);
  expect(intents.some(intent=>intent.guard)).toBe(true);
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
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-tattoo-introduction"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.waitForFunction(()=>window.storyProbe.director.activeCutscene.packageRuntime?.activityRuntime.active?.currentFrame>=200);
  await page.screenshot({path:testInfo.outputPath("charlie-parlor-introduction.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("tattoo-introduction-cancel-check"));
  await page.waitForFunction(()=>{
    const p=window.storyProbe;return p.regions.controller.status==="idle"&&!p.director.active&&p.lifecycle.worldRuntime.ready&&!p.lifecycle.getController().movementLocked;
  },null,{timeout:60_000});
  const cancelled=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(cancelled.character.storyFlags["notebook.s1.charlie-cartel-appointment"]).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  await enterInteriorDoor(page,{world:"tatq",filename:"S1_D000_DR01_007.MT5",position:[100.4,2.7724,99.9],yaw:2.181661565});
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-tattoo-introduction",null,{timeout:60_000});
  const toChallenge=async()=>{
    await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime?.activityRuntime.active?.currentFrame>0);
    const before=await page.evaluate(()=>({frame:window.storyProbe.director.activeCutscene.packageRuntime.activityRuntime.active.currentFrame,
      focus:{tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,80),hidden:Boolean(document.activeElement?.closest("[hidden]"))}}));
    console.info("Charlie intro keyboard skip",before);
    await page.keyboard.press("Space");
    await page.waitForFunction(frame=>window.storyProbe.regions.controller.active?.challengePrompt
      || window.storyProbe.director.activeCutscene?.packageRuntime?.activityRuntime.active?.currentFrame>=frame+100,before.frame,{timeout:1500});
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
  const winChallenge=async()=>{
  for(const [index,button,key]of [[0,"Left","ArrowLeft"],[1,"A","Enter"]]) {
    await page.waitForFunction(({index,button})=>{
      const p=window.storyProbe.regions.controller.active?.challengePrompt;return p?.ready&&window.storyProbe.regions.controller.dialogue.qte?.active?.index===index&&window.storyProbe.regions.controller.dialogue.qte?.active?.steps[window.storyProbe.regions.controller.dialogue.qte.active.index]?.buttons[0]===button;
    },{index,button});await page.keyboard.press(key);
  }
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-tattoo-aftermath",null,{timeout:60_000});
  await page.waitForFunction(()=>window.storyProbe.director.activeCutscene.packageRuntime?.activityRuntime.active?.currentFrame>=150);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  await winChallenge();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("tattoo-aftermath-cancel-after-win"));
  await page.waitForFunction(()=>{
    const p=window.storyProbe;return p.regions.controller.status==="idle"&&!p.director.active&&p.lifecycle.worldRuntime.ready&&!p.lifecycle.getController().movementLocked;
  },null,{timeout:60_000});
  saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["notebook.s1.charlie-cartel-appointment"]).not.toBe(true);
  expect(saved.character.storyFlags["story.s1.charlie-tattoo-confrontation.completed"]).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  await enterInteriorDoor(page,{world:"tatq",filename:"S1_D000_DR01_007.MT5",position:[100.4,2.7724,99.9],yaw:2.181661565});
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-tattoo-introduction",null,{timeout:60_000});
  await toChallenge();await winChallenge();
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
  await page.locator("#journal-close").click();
  await page.reload();await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:120_000});
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-tattoo-introduction"))).toBe(false);
  const reloaded=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(reloaded.character.storyFlags["notebook.s1.charlie-cartel-appointment"]).toBe(true);
  expect(reloaded.character.worldId).toBe("tatq");
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
    // Fuku's native follow-up runs for 2,000 frames before Ine-san enters.
    // Allow that real timeline to finish instead of skipping to the next film.
    await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:120_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
      .some(r=>r.kind==="voice"&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:30_000});
  };
  if(!character.storyFlags["story.s1.cartel-dojo.completed"]) {
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
    await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    // Morning arrival is 08:00; the real dojo trigger opens at 08:30.
    // Advance through the supported clock UI before entering its region.
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until 10 a.m.",exact:true}).click();
    await page.getByRole("button",{name:"Wait until 10 a.m.",exact:true}).click();
    await expect.poll(async()=>new Date((await savedState()).worldState.gameTimeMs).getUTCHours()).toBe(10);
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
    await page.screenshot({path:testInfo.outputPath("fuku-cartel-resolve.png")});
    await waitScene("story-s1-ine-letter-invitation");
    await page.screenshot({path:testInfo.outputPath("ine-letter-invitation.png")});
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.ine-letter-invitation"]),{timeout:60_000}).toBe(true);
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
  expect(saved.inventory.filter(item=>item.key==="chinese_letter").map(item=>item.quantity)).toEqual([1]);
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

async function verifyGaoRescue(page,testInfo,character,{earned=false}={}) {
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
    if(earned){
      if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=='sakuragaoka'){
        await page.locator('#travel-button').click();await page.getByRole('option',{name:'Sakuragaoka',exact:true}).click();
      }
    }else await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld('sakuragaoka'));
    await scene('s1.jd00.gao-introduction');
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:20_000});
    await page.screenshot({path:testInfo.outputPath('gao-original-cast.png')});
    if(!earned){
      await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-gao'));
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
      expect((await saved()).character.storyFlags['notebook.s1.gao-wen']).not.toBe(true);
      expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
      await page.evaluate(async()=>{await window.storyProbe.lifecycle.travelToWorld('yamanose');await window.storyProbe.lifecycle.travelToWorld('sakuragaoka');});
      await scene('s1.jd00.gao-introduction');
    }
    await advanceTo('combat');
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
    const gaoInputStart=await page.evaluate(()=>window.storyProbe.combatInputs.length);
    const gaoPlayerId=await page.evaluate(()=>window.storyProbe.combatRuntime.encounter.player.id);
    for(let attempt=0;attempt<4;attempt++){
      // Use the same real directional commands and crowd movement as the
      // ambush. Releasing guard before W,W,J or S,K avoids repeatedly asking
      // for a guard+kick chord while three opponents surround Ryo.
      await fightStoryAmbush(page,testInfo,{nextButton:null,artifactPrefix:`gao-attempt-${attempt+1}`});
      const retry=page.getByRole('button',{name:'Try again',exact:true});
      await expect.poll(async()=>await retry.isVisible()||await page.evaluate(()=>window.storyProbe.authoredScene?.active?.scene.id==='s1.jd00.gao-hostage'),{timeout:30_000}).toBe(true);
      if(!await retry.isVisible())break;
      console.info(`Gao fight attempt ${attempt+1} lost:`,JSON.stringify(await page.evaluate(()=>{
        const view=window.storyProbe.lastCombatView;
        return {outcome:view?.outcome,actors:view?.actors?.map(actor=>({tag:actor.tag,health:actor.health}))};
      })));
      expect((await saved()).character.storyFlags['notebook.s1.gao-wen']).not.toBe(true);
      if(attempt===3)throw Error('Gao fight was lost after four ordinary retries');
      await retry.click();await advanceTo('combat');
    }
    await testInfo.attach('gao-combat-inputs',{body:JSON.stringify(await page.evaluate(()=>({
      intents:window.storyProbe.combatInputs.slice(-12),view:window.storyProbe.combatRuntime?.active?.view,
      held:[...(window.storyProbe.combatRuntime.active?.input?.held||[])],errors:window.storyProbe.sceneErrors,
    }))),contentType:'application/json'});
    await noErrors();
    const gaoInputs=await page.evaluate(start=>window.storyProbe.combatInputs.slice(start),gaoInputStart);
    // A distance-based strategy can win with Elbow Assaults alone; require
    // consumed attack, guard, and movement input without prescribing a kick.
    expect(gaoInputs.some(intent=>['hand','leg','throw'].includes(intent.action)), 'Gao fight consumes real attack input').toBe(true);
    expect(gaoInputs.some(intent=>intent.guard), 'Gao fight consumes real guard input').toBe(true);
    expect(gaoInputs.some(intent=>Math.hypot(intent.moveX,intent.moveZ)>0), 'Gao fight consumes real movement input').toBe(true);
    expect(await page.evaluate(playerId=>window.storyProbe.fightEvents.some(event=>
      event.type==='hit'&&event.attackerId===playerId&&event.damage>0),gaoPlayerId), 'Gao victory includes a real player hit').toBe(true);
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
  if(earned){
    await page.locator('#travel-button').click();await page.getByRole('option',{name:'Dobuita',exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==='dobuita'&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  }else await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld('dobuita'));
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

async function verifyXiaTranslation(page,testInfo,character,{earned=false}={}) {
  expect(character.storyFlags['story.s1.gao-rescue.completed']).toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  if(!character.storyFlags['story.s1.xia-letter-translation.completed']){
  const time=new Date((await saved()).worldState.gameTimeMs);
  const hour=time.getUTCHours()+time.getUTCMinutes()/60;
  if(hour>=21||hour<8.5){
    await page.locator('#story-wait-button').click();await page.getByRole('option',{name:'Wait until tomorrow morning',exact:true}).click();
    await page.getByRole('button',{name:'Wait until tomorrow morning',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
  const enter=()=>enterInteriorDoor(page,{world:'drsa',filename:'S1_D000_DR15_011.MT5',doorSelector:1,position:[40.5,.0724,75.6],reposition:!earned});
  const scene=async()=>{
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==='story-s1-xia-letter-translation'||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    await noErrors();
    await page.waitForFunction(()=>[...(window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements||[])]
      .some(r=>r.kind==='voice'&&r.command.audio.voiceId.startsWith('A0142B')&&r.audio.currentTime>0&&!r.audio.paused),null,{timeout:25_000});
  };
  // A restored pre-translation save may already be inside the shop. Let its
  // automatic entry finish starting before cancelling/re-entering; don't
  // force test travel concurrently with that legitimate startup event.
  if(character.worldId!=='drsa'){
    if(earned){
      if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=='dobuita'){
        await page.locator('#travel-button').click();await page.getByRole('option',{name:'Dobuita',exact:true}).click();
        await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==='dobuita'&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
      }
      const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
      if(Math.hypot(position[0]-40.5,position[2]-75.6)>4){
        await walkToLandmark(page,testInfo,{world:'dobuita',label:'Russiya China Shop street',maxSteps:500,targets:[[69,65],[69,70],[69,75],[69,80],
          [66,82],[63,84],[60,85],[56,84],[52,82],[48,80],[44,78]]});
      }
      await walkToLandmark(page,testInfo,{world:'dobuita',label:'Russiya China Shop door',arrivalRadius:.25,targets:[[40.5,75.6]]});
    }
    await enter();
  }
  await scene();await page.screenshot({path:testInfo.outputPath('xia-original-greeting.png')});
  if(!earned){
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-xia'));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
  expect((await saved()).character.storyFlags['notebook.s1.translated-letter']).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await enter();await scene();
  }
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
    // Wait for ordinary gameplay updates to observe the exit before walking
    // back in; a fixed delay can cross the boundary while scene cleanup is busy.
    await page.waitForFunction(()=>{const p=window.storyProbe,f=p.lastRegionFrame;
      return f?.enabled&&f.playerPosition?.[2]>128&&!p.regions.inside.has('s1.mfsy.goro-encounter');
    },null,{timeout:20_000});
    await page.locator('#renderCanvas').focus();await page.keyboard.down('KeyW');
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
  expect((await saved()).character.storyFlags['story.s1.harbor-arrival-film.pending']).not.toBe(true);
  await useStoryInspectable(page,bus);await page.getByRole('button',{name:bus.expectedChoice,exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==='story-s1-harbor-bus'||window.storyProbe.sceneErrors.length);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath('harbor-bus-original-boarding.png')});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-bus'));await idle();
  expect((await saved()).character.storyFlags['story.s1.harbor-arrival.completed']).not.toBe(true);
  expect((await saved()).character.storyFlags['story.s1.harbor-arrival-film.pending']).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await useStoryInspectable(page,bus);await page.getByRole('button',{name:bus.expectedChoice,exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==='mfsy'&&window.storyProbe.ready||window.storyProbe.sceneErrors.length,null,{timeout:120_000});
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==='story-s1-harbor-bus-arrival'||window.storyProbe.sceneErrors.length,null,{timeout:120_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const arriving=await saved();expect(arriving.character.storyFlags['story.s1.harbor-arrival-film.pending']).toBe(true);
  expect(arriving.character.storyFlags['story.s1.harbor-arrival-film.completed']).not.toBe(true);
  await page.keyboard.press('KeyX');await idle();
  await expect.poll(async()=>(await saved()).character.storyFlags['story.s1.harbor-arrival-film.completed']).toBe(true);
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
  expect((await saved()).character.storyFlags['story.s1.harbor-arrival-film.completed']).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes('story-s1-harbor-bus'))).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes('story-s1-harbor-bus-arrival'))).toBe(false);
}

async function verifyEarnedChenPhone(page,testInfo,character) {
  expect(character.storyFlags['story.s1.xia-letter-translation.completed']).toBe(true);
  expect(character.storyFlags['story.s1.master-chen-phone.completed']).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const world=await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id);
  if(world==='drsa')await enterInteriorDoor(page,{world:'dobuita',filename:'S1_DRSA_DR03_000.MT5',fromWorld:'drsa',reposition:false});
  if(world!=='interior'){
    await page.locator('#travel-button').click();await page.getByRole('option',{name:'Hazuki Residence Grounds',exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==='exterior'&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
    await walkToLandmark(page,testInfo,{world:'exterior',label:'Hazuki house',targets:[[-7,-22.5],[-7,4],[3,4],[3,2]]});
    await enterInteriorDoor(page,{world:'interior',filename:'S1_JHD0_DR15_016.MT5',fromWorld:'exterior',reposition:false});
  }
  await walkToLandmark(page,testInfo,{world:'interior',label:'Hazuki telephone',targets:[[-15.1,2.7]]});
  const phone={world:'interior',tag:'TEL_',reposition:false};
  const fourChoices=async()=>{for(let i=0;i<16&&!await page.evaluate(()=>window.storyProbe.regions.controller.active?.optionIds?.size===4);i++){
    await page.keyboard.press('Space');await page.waitForTimeout(200);
  }await expect(page.locator('#dialogue-options .dialogue-option')).toHaveCount(4);};
  await useStoryInspectable(page,phone);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-cancel-dial'));await idle();
  expect((await saved()).character.storyFlags['notebook.s1.warehouse-eight-phone']).not.toBe(true);
  await useStoryInspectable(page,phone);await page.getByRole('button',{name:'Call 0468-61-5647',exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:25_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('earned-chen-phone.png')});
  await fourChoices();await page.locator('#dialogue-options .dialogue-option').nth(1).click();
  for(let i=0;i<10&&!await page.getByRole('button',{name:'Try again',exact:true}).isVisible();i++){await page.keyboard.press('Space');await page.waitForTimeout(200);}
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
  expect((await saved()).character.storyFlags['notebook.s1.warehouse-eight-phone']).not.toBe(true);
  await page.getByRole('button',{name:'Try again',exact:true}).click();await fourChoices();
  await page.locator('#dialogue-options .dialogue-option').first().click();await fourChoices();
  await page.locator('#dialogue-options .dialogue-option').first().click();
  for(let i=0;i<16&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.warehouse-eight-phone']);i++){
    await page.keyboard.press('Space');await page.waitForTimeout(200);
  }
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.['notebook.s1.warehouse-eight-phone'])).toBe(true);await idle();
  let state=await saved();expect(state.character.yen).toBe(character.yen);expect(state.character.currentHp).toBe(character.currentHp);
  expect(state.inventory.filter(i=>i.key==='chinese_letter').map(i=>i.quantity)).toEqual([1]);
  await page.locator('button').filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<60&&await page.locator('#journal-next').isEnabled();i++)await page.locator('#journal-next').click();
  await expect(page.getByText(/The man said Warehouse No. 8/)).toBeVisible();await page.screenshot({path:testInfo.outputPath('earned-chen-phone-notebook.png')});
  await page.locator('#journal-close').click();await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});await idle();
  state=await saved();expect(state.character.storyFlags['story.s1.master-chen-phone.completed']).toBe(true);
  expect(state.inventory.filter(i=>i.key==='chinese_letter').map(i=>i.quantity)).toEqual([1]);
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

async function verifyAmihamaDirectory(page,testInfo,character,{earned=false}={}) {
  expect(character.storyFlags['story.s1.master-chen-phone.completed']).toBe(true);
  expect(character.storyFlags['story.s1.amihama-directory.completed']).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const book={world:'dobuita',tag:'TBK1',position:[-37.4,0,10.2],expectedChoice:null,reposition:!earned};
  const scene=async()=>{
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==='story-s1-amihama-directory'||window.storyProbe.sceneErrors.length,null,{timeout:45_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe('idle');
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  };
  if(earned){
    if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=='dobuita'){
      await page.locator('#travel-button').click();await page.getByRole('option',{name:'Dobuita',exact:true}).click();
      await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==='dobuita'&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
    }
    const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
    if(position[0]>-20){
      await walkToLandmark(page,testInfo,{world:'dobuita',label:'telephone street',maxSteps:800,targets:[[69,60],[67,57],[66,53],[64,50],[61,48],[58,46],
        [54,45],[51,43],[49,40],[39,40],[29,40],[25,39],[19,35],[16,33],[13,31],[8,31],[3,31],[-2,31],[-7,31],[-12,31],[-17,31],[-22,30]]});
    }
    const near=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
    if(Math.hypot(near[0]+37.4,near[2]-10.2)>2)
      await walkToLandmark(page,testInfo,{world:'dobuita',label:'telephone directory',maxSteps:300,arrivalRadius:1.8,targets:[[-27,28],[-27,23],[-27,18],[-31,15],[-35,12],[-37.4,10.2]]});
  }
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

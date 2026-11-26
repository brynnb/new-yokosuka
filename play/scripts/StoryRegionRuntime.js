import { warehouseInvestigationActive, WarehouseVisitClock } from "./WarehouseVisitClock.js";
import { storyWeatherClassAt } from "../world/StoryWeatherClass.js";
import {NATIVE_DIALOGUE_PREDICATE_DATA} from "../data/dialogue/nativePredicateValues.generated.js";
import catalog from "../data/story-regions.json" with { type: "json" };

// Order of 0x26b84 modes 1, 2 and 3 in the MS8S room director.
const warehouseInspectionSlugs = new Map([
  ["MS8S.empty-floor", "story-s1-warehouse-eight-empty-floor"],
  ["MS8S.office-door", "story-s1-warehouse-eight-office-door"],
  ["MS8S.inner-office", "story-s1-warehouse-eight-inner-office"],
]);

// Region boxes use browser coordinates. The recovered encounter tests below
// use native coordinates and 16-bit turn angles at the accepted player pose.
export function matchesEncounterApproach(approach, position, playerYaw) {
  if (!approach) return true;
  const [x, y, z] = [-position[0], position[1], position[2]].map(Math.fround);
  if (approach.minYExclusive != null && y <= approach.minYExclusive) return false;
  const [cx, cy, cz] = approach.center.map(Math.fround);
  const dx = Math.fround(x - cx);
  const dy = Math.fround(y - cy);
  const dz = Math.fround(z - cz);
  if (Math.fround(Math.hypot(dx, dy, dz)) > approach.radius) return false;

  const turnUnits = 65536 / (2 * Math.PI);
  const bearing = Math.trunc(Math.atan2(dx, dz) * turnUnits);
  const difference = ((bearing - approach.bearing + 32768) & 65535) - 32768;
  if (Math.abs(difference) >= approach.tolerance) return false;
  if (approach.facing) {
    if (!Number.isFinite(playerYaw)) return false;
    const yaw = Math.trunc(-playerYaw * turnUnits) & 65535;
    if (yaw <= approach.facing[0] || yaw >= approach.facing[1]) return false;
  }
  if (!approach.plane) return true;
  const [slope, intercept] = approach.plane.map(Math.fround);
  return z > Math.fround(Math.fround(slope * x) + intercept);
}

function containsPlayer(region, position, playerYaw) {
  if (region.nativeStreetStrip) {
    const [maximumZ, lowerSlope, lowerIntercept, upperSlope, upperIntercept] = region.nativeStreetStrip;
    const x = Math.fround(-position[0]), z = Math.fround(position[2]);
    const height = (slope, intercept) => Math.fround(Math.fround(x * slope) + intercept);
    return z < maximumZ && z > height(lowerSlope, lowerIntercept) && z < height(upperSlope, upperIntercept);
  }
  if (region.nativeFacingRange) {
    if (!Number.isFinite(playerYaw)) return false;
    const yaw = Math.trunc(-playerYaw / (2 * Math.PI) * 65536) & 65535;
    const [start, end] = region.nativeFacingRange;
    const matches = start <= end ? yaw >= start && yaw <= end : yaw >= start || yaw <= end;
    if (!matches) return false;
  }
  const coordinates = region.nativeFloatBounds ? position.map(Math.fround) : position;
  return coordinates.every((value, axis) => (axis === 1 && region.horizontalOnly)
    || (value >= region.min[axis] && value <= region.max[axis]))
    && matchesEncounterApproach(region.nativeApproach, position, playerYaw);
}

/** Poll small authored areas; the server independently validates position and
 * eligibility. No native-room fallback is permitted for this dispatch family.
 */
export class StoryRegionRuntime {
  constructor({ controller, getCharacter, getGameDate = () => null, hasNativeFlag = () => false, publishPresence, hasPrimaryControl = () => false, warehouseControls = () => ({}), acquireMovementLock = () => () => {}, onError = console.error, regions = catalog.regions }) {
    this.controller = controller;
    this.getCharacter = getCharacter;
    this.getGameDate = getGameDate;
    this.hasNativeFlag = hasNativeFlag;
    this.publishPresence = publishPresence;
    this.hasPrimaryControl = hasPrimaryControl;
    this.warehouseControls = warehouseControls;
    this.warehouseClock = null;
    this.acquireMovementLock = acquireMovementLock;
    this.onError = onError;
    this.regions = regions;
    this.warehouseInspections = [...warehouseInspectionSlugs.keys()].map(object =>
      regions.find(region => region.area === "MS8S" && region.trigger === "use" && region.object === object)
    ).filter(Boolean);
    for(const region of regions)if(region.hours&&(!Array.isArray(region.hours)||region.hours.length!==2
      ||region.hours.some(hour=>!Number.isFinite(hour)||hour<0||hour>24)||region.hours[0]===24||region.hours[0]===region.hours[1]))throw new Error(`Invalid story region hours: ${region.id}`);
    this.inside = new Set();
    this.contextKey = null;
    this.calendarDay = null;
    this.generation = 0;
  }
  reset() { this.warehouseClock = null; this.generation++; this.inside.clear(); this.contextKey = null; this.calendarDay = null; }
  warehouseInspectionAt(clock, position, playerYaw) {
    let selected = null;
    for (const region of this.warehouseInspections) {
      if (!containsPlayer(region, position, playerYaw)) {
        this.inside.delete(region.id);
        continue;
      }
      if (selected || this.inside.has(region.id) || clock.completedInspections.has(region.object)) continue;
      // The light hint sets both 0x208 and 0x209. The floor inspection sets only 0x209.
      if (region.object === "MS8S.empty-floor" && clock.lightingSeen) continue;
      selected = region;
    }
    return selected;
  }
  update({ area, worldId, playerPosition, playerYaw, enabled, roomRunning = enabled, deltaSeconds = 0 }) {
    const position = Array.isArray(playerPosition) ? playerPosition
      : playerPosition ? [playerPosition.x, playerPosition.y, playerPosition.z] : null;
    const character = this.getCharacter();
    const date = this.getGameDate();
    const calendarDay = date instanceof Date && Number.isFinite(date.getTime())
      ? Math.floor(date.getTime() / 86_400_000) : "unknown";
    const key = character ? `${character.id}:${character.modeRevision}:${worldId || ""}:${area}` : null;
    if (key !== this.contextKey) { this.reset(); this.contextKey = key; }
    if (!character || character.playMode !== "story" || !character.openingCompleted || !roomRunning
      || !position || position.length !== 3 || !position.every(Number.isFinite)) return false;
    // Cinematics/combat temporarily move the render actor away from the
    // gameplay approach. Updating occupancy from those poses manufactured an
    // exit/re-entry and immediately replayed a cancelled encounter. Preserve
    // the entry latch until gameplay ownership returns; context changes above
    // still reset it on world, character or mode changes.
    let clock = null;
    let warehouseIdle = false;
    let timerReady = false;
    if (area === "MS8S" && worldId === "ms8s"
      && warehouseInvestigationActive(character) && !this.hasNativeFlag(242)) {
      clock = this.warehouseClock ??= new WarehouseVisitClock();
      const {paused, occupied, input, freeConversation, schedulerSlot, directorAvailable} = this.warehouseControls();
      if (!paused) {
        const controlsOwned = Boolean(occupied) || !enabled || this.controller.status !== "idle";
        clock.update(deltaSeconds, Boolean(input), Boolean(freeConversation), controlsOwned);
      }
      warehouseIdle = !paused && !occupied && directorAvailable !== false;
      timerReady = warehouseIdle && (schedulerSlot == null || (schedulerSlot | 0) === -1);
    }
    if (!enabled || this.controller.status !== "idle" || (clock && !warehouseIdle)) return false;
    // Re-arm date-gated appointments, not every region: an ordinary overnight
    // opening-hours window stays occupied across midnight. Yarn still decides
    // whether a saved appointment is eligible on the new personal day.
    if(calendarDay!==this.calendarDay){
      for(const region of this.regions)if(region.recheckOnDayChange)this.inside.delete(region.id);
      this.calendarDay=calendarDay;
      this.dateKey = calendarDay === "unknown" ? null : date.toISOString().slice(0,10);
    }
    let nativeStep;
    const entered=[];
    for (const region of this.regions) {
      // Use-only bounds authorize a selected world object on the server; merely
      // walking nearby must not start its interaction or consume entry dispatch.
      if (region.trigger === "use") continue;
      if (region.area !== area || (region.worldId && region.worldId !== worldId)) continue;
      if (region.earliestDate && (!this.dateKey || this.dateKey < region.earliestDate)) continue;
      if (region.latestDate && (!this.dateKey || this.dateKey > region.latestDate)) continue;
      if (region.hours) {
        const hour=date instanceof Date ? date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600 : NaN;
        const [start,end]=region.hours;
        const eligible=Number.isFinite(hour)&&(start<end ? hour>=start&&hour<end : hour>=start||hour<end);
        // A declined daytime request must not consume tomorrow/nighttime
        // eligibility while the player waits in the same physical volume.
        // This is dispatch only; Yarn independently checks the personal clock.
        if(!eligible){this.inside.delete(region.id);continue;}
      }
      const inside = containsPlayer(region, position, playerYaw);
      if (!inside) { this.inside.delete(region.id); continue; }
      if (region.requiresPrimaryControl && !this.hasPrimaryControl()) {
        this.inside.delete(region.id);
        continue;
      }
      if (region.nativeWeatherMask != null && (!(date instanceof Date) || !Number.isFinite(date.getTime()) || !(region.nativeWeatherMask & (1 << storyWeatherClassAt(date))))) {
        this.inside.delete(region.id);
        continue;
      }
      if (region.nativeStep) {
        nativeStep ??= NATIVE_DIALOGUE_PREDICATE_DATA.storyStep.records.find(({bank2Bit}) => {
          const receipt = catalog.nativeStepReceipts[bank2Bit];
          return this.hasNativeFlag(bank2Bit) || (receipt && character.storyFlags?.[receipt] === true);
        })?.step ?? 0;
        if (nativeStep < region.nativeStep[0] || nativeStep > region.nativeStep[1]) {
          this.inside.delete(region.id);
          continue;
        }
      }
      if (this.inside.has(region.id) || (!region.repeatable && character.storyFlags?.[region.completedFlag])
        || (region.requiredFlags || []).some(flag => character.storyFlags?.[flag] !== true)
        || (region.excludedFlags || []).some(flag => character.storyFlags?.[flag] === true)) continue;
      // New saves and imported native saves may encode the same earned
      // milestone differently. Suppress ineligible foyer visits locally
      // before acquiring the movement lock or publishing an enter request.
      if (region.requiredMilestones?.some(({flag, nativeFlag}) =>
        character.storyFlags?.[flag] !== true && !this.hasNativeFlag(nativeFlag))) continue;
      if (region.requiredNativeFlags?.some(index => !this.hasNativeFlag(index))) continue;
      if (region.excludedNativeFlags?.some(index => this.hasNativeFlag(index))) continue;
      entered.push(region.id);
    }
    // Within MS8S the listening approach and both timers precede the three inspection comments.
    const inspection = warehouseIdle ? this.warehouseInspectionAt(clock, position, playerYaw) : null;
    const timedObject = !entered.length && timerReady ? clock.selector(position[1]) : null;
    const offeredInspection = !entered.length && !timedObject ? inspection : null;
    if (!entered.length && !timedObject && !offeredInspection) return false;
    // All overlapping bounds share one server-arbitrated "enter" selector.
    // Latching only the first would issue another offer as soon as the chosen
    // scene returned, even though the player had never left the same approach.
    // Ineligible bounds are not latched: earning a prerequisite still unlocks
    // their event without requiring a manufactured exit.
    if (this.publishPresence() !== true) return false;
    // The accepted position must remain the approach while native state is
    // flushed and the server chooses its event. Otherwise a walking player can
    // cross several volumes before the eventual dialogue acquires its lock.
    // The presentation takes its own lease before start() resolves; all other
    // outcomes release this request-only lease, including cancellation/timeouts.
    const releaseMovement = this.acquireMovementLock();
    for(const id of entered)this.inside.add(id);
    const generation = this.generation;
    try {
      let selector = {kind: "enter"};
      const context = {area};
      if (offeredInspection) {
        const {object, id} = offeredInspection;
        selector = {kind: "use", object};
        // On cancellation the player can leave and approach again. Successful
        // comments stay consumed until the native room is loaded afresh.
        this.inside.add(id);
        context.onStoryComplete = identity => {
          if (generation === this.generation && identity.scriptSlug === warehouseInspectionSlugs.get(object)) {
            clock.completedInspections.add(object);
          }
        };
      } else if (timedObject) {
        selector = {kind: "use", object: timedObject};
        clock.attempted = timedObject;
        if (timedObject === "MS8S.light-timeout") {
          context.onStoryComplete = identity => {
            if (generation === this.generation && identity.scriptSlug === "story-s1-warehouse-eight-light-timeout") {
              clock.lightingSeen = true;
              clock.attempted = null;
            }
          };
        }
      }
      void this.controller.start(selector, context).then(result => {
        if (generation === this.generation && result?.outcome === "rejected") this.onError(result.error);
      }).catch(error => { if (generation === this.generation) this.onError(error); }).finally(releaseMovement);
    } catch(error) {
      releaseMovement();
      this.onError(error);
    }
    return true;
  }
}

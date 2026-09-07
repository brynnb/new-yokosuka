import * as BABYLON from "@babylonjs/core";
import shenmue2Exploration from '../data/shenmue2-exploration-worlds.json' with { type: 'json' };
import shenmue2BoundaryTransitions, {
  SHENMUE2_TRAVERSABLE_WORLD_DATA,
} from "../../src/Shenmue2BoundaryTransitionData.js";
import { nativeLightingArea, sceneWaterHeight, shenmue2TimedMapLayers } from "../../src/rendering/SceneEnvironmentProfiles.js";
import {
  includeDobuitaMapFile,
  includeForkliftRaceMapFile,
  includeHazukiExteriorMapFile,
  includeNewYokosukaHarborMapFile,
  includeOldWarehouseEightMapFile,
  includeOldWarehouseDistrictMapFile,
  includeSakuragaokaMapFile,
  includeSeventyManBattleMapFile,
  includeYamanoseMapFile,
} from "../../src/WorldMapFiles.js";
import {
  sceneCompositionIncludes,
  timedMapLayersForSource,
} from "../../src/SceneCompositions.js";
import {
  supportedDobuitaInteriorTransitions,
} from "../../src/DobuitaInteriorTransitions.js";
import d000RuntimePlacementManifest from "../data/d000-runtime-placements.json" with {
  type: "json",
};
import dgctRuntimePlacementManifest from "../data/dgct-runtime-placements.json" with {
  type: "json",
};
import jd00RuntimePlacementManifest from "../data/jd00-runtime-placements.json" with {
  type: "json",
};
import jhd0RuntimePlacementManifest from "../data/jhd0-runtime-placements.json" with {
  type: "json",
};
import jomoRuntimePlacementManifest from "../data/jomo-runtime-placements.json" with {
  type: "json",
};
import ju00RuntimePlacementManifest from "../data/ju00-runtime-placements.json" with {
  type: "json",
};
import ma00RaceRuntimePlacementManifest from "../data/ma00-race-runtime-placements.json" with {
  type: "json",
};
import mfsyRuntimePlacementManifest from "../data/mfsy-runtime-placements.json" with {
  type: "json",
};
import mksgRuntimePlacementManifest from "../data/mksg-runtime-placements.json" with {
  type: "json",
};
import ms08RuntimePlacementManifest from "../data/ms08-runtime-placements.json" with {
  type: "json",
};
import nativeMapTransitionData from "../data/native-map-transitions.json" with {
  type: "json",
};
import op00IntroductionScene from "../data/events/op00-introduction-scene.json" with {
  type: "json",
};
import {
  HARBOR_FORKLIFT_CONFIG,
  FORKLIFT_PLAYGROUND_CARGO_ID,
  FORKLIFT_PLAYGROUND_CARGO_ENABLED,
  FORKLIFT_PLAYGROUND_CARGO_SPAWN,
  FORKLIFT_PLAYGROUND_CARGO_SPAWNS,
  FORKLIFT_PLAYGROUND_SPAWNS,
  FORKLIFT_RACE_CARGO_ENABLED,
  FORKLIFT_RACE_SPAWNS,
} from "./forklifts.js";
import {
  DOBUITA_PREFIX,
  DOBUITA_SPAWN,
  FORKLIFT_PLAYGROUND_SPAWN,
  FORKLIFT_RACE_PLAYER_SPAWN,
  FORKLIFT_RACE_PREFIX,
  HAZUKI_EXTERIOR_PREFIX,
  HAZUKI_INTERIOR_PREFIX,
  HAZUKI_INTERIOR_SPAWN,
  HAZUKI_SPAWN,
  NEW_YOKOSUKA_HARBOR_PREFIX,
  NEW_YOKOSUKA_HARBOR_SPAWN,
  OLD_WAREHOUSE_DISTRICT_PREFIX,
  OLD_WAREHOUSE_DISTRICT_SPAWN,
  OLD_WAREHOUSE_EIGHT_PREFIX,
  SAKURAGAOKA_PREFIX,
  SAKURAGAOKA_SPAWN,
  YAMANOSE_ENTRY_YAW,
  YAMANOSE_PREFIX,
  YAMANOSE_SPAWN,
  YOU_ARCADE_PREFIX,
} from "./locations.js";
import {
  MJQ_POOL_EQUIPMENT_PLACEMENTS,
} from "./pool.js";
import {
  CINEMA_ASSET_FILENAME,
  CINEMA_ASSET_URL,
  CINEMA_SPAWN,
  CINEMA_TRANSITION_INTERACTIONS,
  CINEMA_WORLD_SCALE,
} from "./cinema.js";

function hasRuntimePlacement(position) {
  return !(
    Array.isArray(position)
    && position.length === 3
    && position.every((value) => value === 0)
  );
}

const rawPlacements = Object.freeze({
  // Exact-origin TASK transforms in this capture are uninitialized object
  // slots, not authored world placements. Rendering them produces a pile of
  // unrelated interaction props at the map origin.
  exterior: Object.freeze(
    jhd0RuntimePlacementManifest.placements.filter(
      (placement) => hasRuntimePlacement(placement.position),
    ),
  ),
  interior: Object.freeze(jomoRuntimePlacementManifest.placements),
  yamanose: Object.freeze(ju00RuntimePlacementManifest.placements),
  sakuragaoka: Object.freeze(jd00RuntimePlacementManifest.placements),
  dobuita: Object.freeze(d000RuntimePlacementManifest.placements),
  mfsy: Object.freeze(mfsyRuntimePlacementManifest.placements),
  mksg: Object.freeze(mksgRuntimePlacementManifest.placements),
  ms08: Object.freeze(ms08RuntimePlacementManifest.placements),
  arcade: Object.freeze(dgctRuntimePlacementManifest.placements),
  ma00race: Object.freeze(ma00RaceRuntimePlacementManifest.placements),
});

function nativeModelStem(model) {
  return String(model || "")
    .toUpperCase()
    .replace(/^S\d+_[A-Z0-9]{4}_/, "");
}

function withNativeDoorMetadata(nativeArea, sourcePlacements) {
  const transitions = (
    nativeMapTransitionData.allExactDoorTransitions || []
  ).filter((transition) => transition.source.area === nativeArea);
  return Object.freeze(sourcePlacements.map((placement) => {
    const transition = transitions.find((candidate) => (
      nativeModelStem(candidate.source.model)
        === nativeModelStem(placement.model)
      && candidate.source.nativeDoorObject.position.every(
        (value, index) => (
          Math.abs(value - placement.position[index]) < 0.0001
        ),
      )
    ));
    if (!transition) return placement;
    return Object.freeze({
      ...placement,
      runtime: Object.freeze({
        ...(placement.runtime || {}),
        objectTag: transition.source.objectTag,
        nativeInteriorDoor: true,
        nativeControllerWords: Object.freeze([
          ...transition.source.nativeDoorObject.controllerWords,
        ]),
        nativeRecordFileOffset: transition.evidence.recordFileOffset,
        placementSource: (
          `${placement.runtime?.placementSource || "native-placement"}`
          + "+native-door-controller-record"
        ),
      }),
    });
  }));
}

function withStaticDoorSelectors(sourcePlacements, selectorsByIndex) {
  return Object.freeze(sourcePlacements.map((placement) => {
    const selector = selectorsByIndex.get(
      placement.runtime?.staticDoorIndex,
    );
    if (!Number.isInteger(selector)) return placement;
    return Object.freeze({
      ...placement,
      runtime: Object.freeze({
        ...(placement.runtime || {}),
        doorSelector: selector,
        placementSource: (
          `${placement.runtime?.placementSource || "native-placement"}`
          + "+browser-reverse-door-association"
        ),
      }),
    });
  }));
}

const placements = Object.freeze({
  ...rawPlacements,
  arcade: withNativeDoorMetadata("DGCT", rawPlacements.arcade),
  sakuragaoka: withStaticDoorSelectors(
    rawPlacements.sakuragaoka,
    new Map([[0, 0]]),
  ),
  mfsy: withStaticDoorSelectors(
    rawPlacements.mfsy,
    new Map([[18, 18], [26, 26]]),
  ),
});

// Exact Japanese location strings from the Shenmue I bilingual text dump's
// loading-location block:
// https://vgtextdump.neocities.org/shenmue/sm1 (lines 108-196)
const DOBUITA_INTERIOR_LABELS = Object.freeze({
  ARAR: Object.freeze(["Asia Travel Company", "アジア旅行社"]),
  DAZA: Object.freeze(["Asia Travel Company", "アジア旅行社"]),
  DBHB: Object.freeze(["Heartbeats Bar", "ハートビーツ"]),
  DHQB: Object.freeze(["Heartbeats Bar", "ハートビーツ"]),
  DGCT: Object.freeze(["YOU Arcade", "ゲームセンター"]),
  GMCT: Object.freeze(["YOU Arcade", "ゲームセンター"]),
  DKPA: Object.freeze(["Nana's Karaoke Bar", "カラオケパブ ナナ"]),
  DKTY: Object.freeze(["Antique Shop", "骨董屋"]),
  DMAJ: Object.freeze(["Daisangen Mahjong Parlor", "大三元"]),
  DSKI: Object.freeze(["Global Travel Agency", "世界旅行社"]),
  DTKY: Object.freeze(["Maeda Barber Shop", "理容マエダ"]),
  DCHA: Object.freeze(["Ajiichi Chinese Restaurant", "中華 味壱"]),
  TATQ: Object.freeze(["Tattoo Parlor", "タトゥショップ"]),
  DBYO: Object.freeze(["Bar Yokosuka", "BAR ヨコスカ"]),
  DJAZ: Object.freeze(["MJQ Jazz Bar", "MJQ"]),
  DPIZ: Object.freeze(["Bob's Pizzeria", "ボブズ ピザ"]),
  DRME: Object.freeze(["Manpukuken Ramen", "満福軒"]),
  DRHT: Object.freeze(["Liu's Barber and Hair Salon", "バーバー劉"]),
  DRSA: Object.freeze(["Russiya China Shop", "陶器屋ロシヤ"]),
  TOKI: Object.freeze(["Russiya China Shop", "陶器屋ロシヤ"]),
  DSBA: Object.freeze(["Yamaji Soba Noodles", "そば屋 やま路"]),
  DSLI: Object.freeze(["Bar Linda", "リンダ"]),
  DSLT: Object.freeze(["Slot House", "スロットハウス"]),
  DSUS: Object.freeze(["Takara Sushi", "宝ずし"]),
  DURN: Object.freeze(["Lapis Fortune Teller", "ラピス"]),
  DYKZ: Object.freeze(["Nagai Industries", "永井興業"]),
  DCBN: Object.freeze(["Convenience Store", "トマトマート"]),
});

// Exact native location strings from the Shenmue II bilingual text dump.
// Outdoor names use the UIMAPD location block, interiors use UIHELPL, and
// AR01 uses the opening loading-screen entry UILOADLOC004:
// https://vgtextdump.neocities.org/downloads/Shenmue2.csv
export const SHENMUE2_JAPANESE_AREA_LABELS = Object.freeze({
  AK00: "開運碼頭",
  AR02: "労湾碼頭",
  AR03: "クイーンズストリート",
  WB00: "紅華台",
  WE00: "詠黄街",
  WK00: "紅南街",
  WN00: "福仙街",
  WR00: "白秦街",
  WS00: "菜珍街",
  WT00: "太老街",
  AKA3: "不要銭宿",
  AKS0: "開運食堂",
  AKS1: "ブルースカイ",
  AKT0: "６番倉庫",
  AKT1: "１０番倉庫",
  AKT2: "１２番倉庫",
  AKT3: "９番倉庫",
  AKY0: "Ｆ倉庫",
  AR01: "香港",
  ARA0: "スイング",
  ARC0: "鳩汀珈琲",
  ARM0: "香港的特産",
  ARSF: "闘屋上",
  ARZ0: "東風雑貨",
  WB01: "文武廟",
  WECF: "ムーンカフェ",
  WEG0: "松電子遊戯中央",
  WEM1: "エスアイシー",
  WES1: "スロットハウスダブリュー",
  WESM: "詠黄百貨",
  WET0: "トマトコンビニ",
  WKA0: "恩田楼",
  WRS2: "リバプール",
  WSG1: "光武館",
  WSY0: "方来旅社",
  WTA0: "大元楼",
});

function shenmue2JapaneseLabel(area, fallback) {
  return SHENMUE2_JAPANESE_AREA_LABELS[area] || fallback;
}

function dobuitaInteriorWorlds() {
  const worlds = {};
  for (const transition of supportedDobuitaInteriorTransitions(
    nativeMapTransitionData,
  )) {
    const { area, browserSpawn } = transition.destination;
    const canonicalName = nativeMapTransitionData.areaNames?.[area] || area;
    const labels = (
      DOBUITA_INTERIOR_LABELS[area]
      || [canonicalName, canonicalName]
    );
    const prefix = `S1_${area}`;
    const returnTransition = (
      nativeMapTransitionData.allExactDoorTransitions || []
    ).find((candidate) => candidate.source.area === area);
    const doorObject = returnTransition?.source?.nativeDoorObject;
    const doorPlacements = (
      returnTransition?.supported
      && returnTransition.source.model
      && doorObject
    )
      ? [Object.freeze({
        model: returnTransition.source.model,
        position: Object.freeze([...doorObject.position]),
        rotationDegrees: Object.freeze([
          0,
          doorObject.yawDegrees,
          0,
        ]),
        scale: Object.freeze([...doorObject.scale]),
        runtime: Object.freeze({
          objectTag: returnTransition.source.objectTag,
          nativeInteriorDoor: true,
          nativeControllerWords: Object.freeze([
            ...doorObject.controllerWords,
          ]),
          nativeRecordFileOffset: (
            returnTransition.evidence.recordFileOffset
          ),
          placementSource: "native-door-controller-record",
        }),
      })]
      : [];
    const interiorPlacements = Object.freeze([
      ...doorPlacements,
      ...(area === "DJAZ" ? MJQ_POOL_EQUIPMENT_PLACEMENTS : []),
    ]);
    worlds[area.toLowerCase()] = Object.freeze({
      id: area.toLowerCase(),
      label: labels[0],
      japaneseLabel: labels[1],
      interior: true,
      fixedTimeOfDayIndex: 0,
      nativeArea: area,
      nativePointLightingArea: nativeLightingArea(area),
      assetArea: area,
      prefix,
      spawn: BABYLON.Vector3.FromArray(browserSpawn.position),
      yaw: browserSpawn.yawRadians,
      includeFile: (filename) => (
        filename.toUpperCase() === `${prefix}_MAP.MT5`
        || new RegExp(`^${prefix}_MAP\\d+\\.MT5$`, "i").test(filename)
      ),
      placements: Object.freeze(interiorPlacements),
      evidence: Object.freeze({
        source: nativeMapTransitionData.generatedFrom,
        nativeEntry: transition.destination.entry,
        doorSelector: transition.source.doorSelector ?? null,
        inboundKind: Number.isInteger(transition.source.eventId)
          ? "native-event-volume"
          : "native-door-selector",
        returnDoor: returnTransition
          ? Object.freeze({
            supported: returnTransition.supported,
            model: returnTransition.source.model,
            modelResolution: (
              returnTransition.evidence.modelResolution
            ),
            nativeRecordFileOffset: (
              returnTransition.evidence.recordFileOffset
            ),
          })
          : null,
      }),
    });
  }
  return Object.freeze(worlds);
}

const DOBUITA_INTERIOR_WORLDS = dobuitaInteriorWorlds();

const ADDITIONAL_SHENMUE1_INTERIOR_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "jabe",
    area: "JABE",
    label: "Abe Store Candy Shop",
    japaneseLabel: "阿部商店",
    prefix: "S1_JABE",
    spawn: Object.freeze([0.699999988079071, 0, 1.309999942779541]),
    yaw: 0,
  }),
  Object.freeze({
    id: "mkyu",
    area: "MKYU",
    label: "Harbor Lounge",
    japaneseLabel: "港湾休憩所",
    prefix: "S2_MKYU",
    spawn: Object.freeze([82.80000305175781, 0, 59]),
    yaw: Math.PI / 4,
    staticTransitionDoor: true,
  }),
  Object.freeze({
    id: "ms8s",
    area: "MS8S",
    label: "Warehouse No. 8",
    japaneseLabel: "第８倉庫",
    prefix: "S2_MS8S",
    spawn: Object.freeze([
      -17,
      4.275000095367432,
      152.24000549316406,
    ]),
    yaw: -0.5410520681182421,
  }),
]);

function additionalShenmue1InteriorWorlds() {
  return Object.freeze(Object.fromEntries(
    ADDITIONAL_SHENMUE1_INTERIOR_DEFINITIONS.map((definition) => {
      const returnTransition = (
        nativeMapTransitionData.allExactDoorTransitions || []
      ).find((candidate) => (
        candidate.supported
        && candidate.source.area === definition.area
      ));
      if (!returnTransition?.source?.nativeDoorObject) {
        throw new Error(
          `Missing exact return door for ${definition.area}`,
        );
      }
      const doorObject = returnTransition.source.nativeDoorObject;
      const returnDoor = Object.freeze({
        model: returnTransition.source.model,
        position: Object.freeze([...doorObject.position]),
        rotationDegrees: Object.freeze([0, doorObject.yawDegrees, 0]),
        scale: Object.freeze([...doorObject.scale]),
        runtime: Object.freeze({
          objectTag: returnTransition.source.objectTag,
          nativeInteriorDoor: true,
          nativeStaticTransition: definition.staticTransitionDoor === true,
          nativeControllerWords: Object.freeze([
            ...doorObject.controllerWords,
          ]),
          nativeRecordFileOffset: returnTransition.evidence.recordFileOffset,
          placementSource: "native-door-controller-record",
        }),
      });
      const world = Object.freeze({
        id: definition.id,
        label: definition.label,
        japaneseLabel: definition.japaneseLabel,
        interior: true,
        fixedTimeOfDayIndex: 0,
        nativeArea: definition.area,
        assetArea: definition.area,
        prefix: definition.prefix,
        spawn: BABYLON.Vector3.FromArray(definition.spawn),
        yaw: definition.yaw,
        includeFile: (filename) => (
          filename.toUpperCase() === `${definition.prefix}_MAP.MT5`
          || new RegExp(
            `^${definition.prefix}_MAP\\d+\\.MT5$`,
            "i",
          ).test(filename)
        ),
        placements: Object.freeze([returnDoor]),
        evidence: Object.freeze({
          source: nativeMapTransitionData.generatedFrom,
          hiddenFromTravelMenu: true,
          nativeEntry: 0,
          inboundKind: "browser-reverse-exact-return-door",
          returnDoor: Object.freeze({
            model: returnTransition.source.model,
            modelResolution: returnTransition.evidence.modelResolution,
            nativeRecordFileOffset: returnTransition.evidence.recordFileOffset,
            staticTransition: definition.staticTransitionDoor === true,
          }),
        }),
      });
      return [definition.id, world];
    }),
  ));
}

const ADDITIONAL_SHENMUE1_INTERIOR_WORLDS = (
  additionalShenmue1InteriorWorlds()
);

function shenmue2OutdoorWorld({
  id,
  area,
  label,
  defaultEntryTransitionId,
}) {
  const entryTransition = shenmue2BoundaryTransitions.find(
    (transition) => transition.id === defaultEntryTransitionId,
  );
  if (
    !entryTransition
    || entryTransition.activation !== "crossing"
    || entryTransition.source.worldId === id
    || entryTransition.destination.worldId !== id
  ) {
    throw new Error(
      `Invalid adjacent entry ${defaultEntryTransitionId} for ${id}`,
    );
  }
  const browserSpawn = entryTransition.destination.browserSpawn;
  const prefix = `S2DC_D1_${area}_MPK00`;
  return Object.freeze({
    id,
    label,
    japaneseLabel: shenmue2JapaneseLabel(area, label),
    nativeArea: area,
    assetArea: area,
    assetFormat: "MT7",
    prefix,
    timedMapLayers: shenmue2TimedMapLayers(area, prefix),
    spawn: BABYLON.Vector3.FromArray(browserSpawn.position),
    yaw: browserSpawn.yaw,
    nativeWarp: Object.freeze({
      source: "Shenmue II FLDD/AREATBL1 transition catalog",
      transitionId: entryTransition.id,
      sourceWorldId: entryTransition.source.worldId,
      destinationEntry: entryTransition.destination.entry,
      routeRecordFileOffset: (
        entryTransition.evidence.routeRecordFileOffset
      ),
      destinationRecordFileOffset: (
        entryTransition.evidence.destinationRecordFileOffset
      ),
    }),
    placements: Object.freeze([]),
  });
}

const SHENMUE2_TRAVERSABLE_WORLDS = Object.freeze(Object.fromEntries(
  SHENMUE2_TRAVERSABLE_WORLD_DATA.map((definition) => [
    definition.id,
    Object.freeze({
      id: definition.id,
      label: definition.label,
      japaneseLabel: shenmue2JapaneseLabel(
        definition.area,
        definition.label,
      ),
      interior: definition.interior,
      fixedTimeOfDayIndex: definition.interior ? 0 : undefined,
      nativeArea: definition.area,
      assetArea: definition.area,
      assetFormat: "MT7",
      prefix: definition.prefix,
      timedMapLayers: shenmue2TimedMapLayers(
        definition.area,
        definition.prefix,
      ),
      spawn: BABYLON.Vector3.FromArray(definition.spawn.position),
      yaw: definition.spawn.yaw,
      placements: Object.freeze([]),
      evidence: Object.freeze({
        source: "Shenmue II FLDD/AREATBL1 traversal catalog",
        hiddenFromTravelMenu: true,
      }),
    }),
  ]),
));

export const WORLDS = Object.freeze({
  op00: Object.freeze({
    id: "op00",
    label: "Introduction — Iwao's Murder",
    japaneseLabel: "オープニング",
    interior: true,
    fixedTimeOfDayIndex: 0,
    fixedSeason: op00IntroductionScene.environment.season,
    fixedWeather: op00IntroductionScene.environment.weather,
    weatherExposure: "outdoor",
    skyExposure: "outdoor",
    sceneComposition: "op00-introduction",
    loadInactiveEnvironmentVariants: false,
    nativeArea: "OP00",
    assetArea: "OP00",
    prefix: "S1_OP00",
    // Exact initial AKIR AMOV position from the first A0114 AUTH track.
    spawn: new BABYLON.Vector3(
      -10.919500350952148,
      -5.04640007019043,
      41.149757385253906,
    ),
    yaw: BABYLON.Tools.ToRadians(-29.41950035095215),
    includeFile: filename => sceneCompositionIncludes(
      "op00-introduction",
      filename,
    ),
    placements: Object.freeze([]),
    cutsceneOnly: true,
  }),
  op02: Object.freeze({
    id: "op02",
    label: "Opening Vision — Shenhua and the Hawk",
    japaneseLabel: "オープニング",
    interior: false,
    fixedTimeOfDayIndex: 0,
    weatherExposure: "outdoor",
    skyExposure: "outdoor",
    sceneComposition: "op02-opening",
    loadInactiveEnvironmentVariants: false,
    nativeArea: "OP02",
    assetArea: "OP02",
    prefix: "S1_OP02",
    // Exact initial SINF AMOV position is established when the first Shenhua
    // AUTH begins. This loading spawn remains outside every authored shot.
    spawn: new BABYLON.Vector3(0, 0, 0),
    yaw: 0,
    includeFile: filename => sceneCompositionIncludes(
      "op02-opening",
      filename,
    ),
    placements: Object.freeze([]),
    cutsceneOnly: true,
  }),
  exterior: Object.freeze({
    id: "exterior",
    label: "Hazuki Residence Grounds",
    japaneseLabel: "芭月家",
    nativeArea: "JHD0",
    assetArea: "JHD0",
    prefix: HAZUKI_EXTERIOR_PREFIX,
    sceneComposition: "JHD0",
    spawn: HAZUKI_SPAWN,
    yaw: 0,
    includeFile: includeHazukiExteriorMapFile,
    placements: placements.exterior,
  }),
  interior: Object.freeze({
    id: "interior",
    label: "Hazuki Residence Interior",
    japaneseLabel: "芭月家母屋",
    interior: true,
    dynamicTimeOfDay: true,
    nativeArea: "JOMO",
    nativePointLightingArea: nativeLightingArea("JOMO"),
    prefix: HAZUKI_INTERIOR_PREFIX,
    spawn: HAZUKI_INTERIOR_SPAWN,
    yaw: -1.137,
    terrainMaxHeight: 2,
    includeFile: (filename) => (
      /^S1_JOMO_MAP(?:\d+)?\.MT5$/i.test(filename)
    ),
    placements: placements.interior,
  }),
  yamanose: Object.freeze({
    id: "yamanose",
    label: "Yamanose",
    japaneseLabel: "山の瀬",
    nativeArea: "JU00",
    nativePointLightingArea: nativeLightingArea("JU00"),
    prefix: YAMANOSE_PREFIX,
    sceneComposition: "JU00",
    spawn: YAMANOSE_SPAWN,
    yaw: YAMANOSE_ENTRY_YAW,
    includeFile: includeYamanoseMapFile,
    timedMapLayers: timedMapLayersForSource("JU00"),
    placements: placements.yamanose,
  }),
  sakuragaoka: Object.freeze({
    id: "sakuragaoka",
    label: "Sakuragaoka",
    japaneseLabel: "桜ヶ丘",
    nativeArea: "JD00",
    nativePointLightingArea: nativeLightingArea("JD00"),
    prefix: SAKURAGAOKA_PREFIX,
    sceneComposition: "JD00",
    spawn: SAKURAGAOKA_SPAWN,
    yaw: 0,
    includeFile: includeSakuragaokaMapFile,
    timedMapLayers: timedMapLayersForSource("JD00"),
    placements: placements.sakuragaoka,
  }),
  dnoz: Object.freeze({
    id: "dnoz",
    label: "Sakuragaoka — Nozomi Scenes",
    japaneseLabel: "桜ヶ丘",
    nativeArea: "DNOZ",
    assetArea: "DNOZ",
    prefix: "S1_DNOZ",
    spawn: new BABYLON.Vector3(0, 0, 0),
    yaw: 0,
    includeFile: filename => /^S1_DNOZ_MAP(?:\d+)?\.MT5$/i.test(filename),
    placements: Object.freeze([]),
    cutsceneOnly: true,
  }),
  dobuita: Object.freeze({
    id: "dobuita",
    label: "Dobuita",
    japaneseLabel: "ドブ板",
    nativeArea: "D000",
    prefix: DOBUITA_PREFIX,
    sceneComposition: "D000",
    spawn: DOBUITA_SPAWN,
    yaw: Math.PI,
    includeFile: includeDobuitaMapFile,
    nativePointLightingArea: nativeLightingArea("D000"),
    placements: placements.dobuita,
    transitionInteractions: CINEMA_TRANSITION_INTERACTIONS.dobuita,
  }),
  yq14: Object.freeze({
    id: "yq14",
    label: "Heartbeats Bar Exterior Alley QTE",
    japaneseLabel: "ハートビーツ裏路地",
    fixedTimeOfDayIndex: 3,
    nativeArea: "YQ14",
    assetArea: "YQ14",
    prefix: "S1_YQ14",
    spawn: new BABYLON.Vector3(
      121.72822570800781,
      -1.882580041885376,
      76.07537841796875,
    ),
    yaw: BABYLON.Tools.ToRadians(63),
    includeFile: filename => /^S1_YQ14_MAP(?:\d+)?\.MT5$/i.test(filename),
    placements: Object.freeze([]),
    cutsceneOnly: true,
  }),
  yd01: Object.freeze({
    id: "yd01",
    label: "Iwao Trains Young Ryo",
    japaneseLabel: "稽古の記憶",
    fixedTimeOfDayIndex: 0,
    nativeArea: "YD01",
    assetArea: "YD01",
    prefix: "S1_YD01",
    // Exact initial IWAO AMOV position from SAKR/SEQDATA0.AUTH. Gameplay
    // placement is irrelevant while the package owns both actors, but the
    // authored coordinate keeps world framing deterministic during loading.
    spawn: new BABYLON.Vector3(
      7.511159896850586,
      0,
      -26.878936767578125,
    ),
    yaw: BABYLON.Tools.ToRadians(90),
    includeFile: filename => /^S1_YD01_MAP(?:\d+)?\.MT5$/i.test(filename),
    placements: Object.freeze([]),
    cutsceneOnly: true,
  }),
  cinema: Object.freeze({
    id: "cinema",
    label: "Cinema",
    japaneseLabel: "映画館",
    interior: true,
    fixedTimeOfDayIndex: 2,
    nativeArea: "CINM",
    assetArea: "CINM",
    assetFormat: "GLB",
    assetUrl: CINEMA_ASSET_URL,
    assetFilename: CINEMA_ASSET_FILENAME,
    assetScale: CINEMA_WORLD_SCALE,
    spawn: BABYLON.Vector3.FromArray(CINEMA_SPAWN),
    yaw: -Math.PI / 2,
    terrainMaxHeight: 6.2 * CINEMA_WORLD_SCALE,
    placements: Object.freeze([]),
    transitionInteractions: CINEMA_TRANSITION_INTERACTIONS.cinema,
  }),
  mfbt: Object.freeze({
    id: "mfbt",
    label: "Combat Practice",
    japaneseLabel: "戦闘練習",
    nativeArea: "MFBT",
    nativePointLightingArea: nativeLightingArea("MFBT"),
    prefix: "S3_MFBT",
    // Combat Practice spawn selected for a clear starting position in MFBT.
    // The extracted CHRS AKIR default is retained in the combat research doc.
    spawn: new BABYLON.Vector3(
      -23.4,
      0,
      65.8,
    ),
    yaw: Math.PI / 4,
    waterHeight: sceneWaterHeight("MFBT"),
    includeFile: includeSeventyManBattleMapFile,
    placements: Object.freeze([]),
  }),
  ...DOBUITA_INTERIOR_WORLDS,
  ...ADDITIONAL_SHENMUE1_INTERIOR_WORLDS,
  arcade: Object.freeze({
    id: "arcade",
    label: "You Arcade",
    japaneseLabel: "ゲームセンター",
    interior: true,
    fixedTimeOfDayIndex: 2,
    nativeArea: "DGCT",
    prefix: YOU_ARCADE_PREFIX,
    spawn: new BABYLON.Vector3(-2.855272, 0, -0.833205),
    yaw: BABYLON.Tools.ToRadians(10),
    includeFile: (filename) => (
      /^S3_DGCT_MAP(?:0[1-3])?\.MT5$/i.test(filename)
    ),
    placements: placements.arcade,
  }),
  mfsy: Object.freeze({
    id: "mfsy",
    label: "New Yokosuka Harbor",
    japaneseLabel: "新横須賀港",
    nativeArea: "MFSY",
    nativePointLightingArea: nativeLightingArea("MFSY"),
    prefix: NEW_YOKOSUKA_HARBOR_PREFIX,
    sceneComposition: "MFSY",
    spawn: NEW_YOKOSUKA_HARBOR_SPAWN,
    yaw: Math.PI,
    waterHeight: sceneWaterHeight("MFSY"),
    vehicle: "forklift",
    ...HARBOR_FORKLIFT_CONFIG,
    includeFile: includeNewYokosukaHarborMapFile,
    timedMapLayers: timedMapLayersForSource("MFSY"),
    placements: placements.mfsy,
  }),
  mksg: Object.freeze({
    id: "mksg",
    label: "Old Warehouse District",
    japaneseLabel: "旧倉庫街",
    nativeArea: "MKSG",
    nativePointLightingArea: nativeLightingArea("MKSG"),
    prefix: OLD_WAREHOUSE_DISTRICT_PREFIX,
    sceneComposition: "MKSG",
    spawn: OLD_WAREHOUSE_DISTRICT_SPAWN,
    yaw: 0,
    waterHeight: sceneWaterHeight("MKSG"),
    includeFile: includeOldWarehouseDistrictMapFile,
    placements: placements.mksg,
  }),
  ms08: Object.freeze({
    id: "ms08",
    label: "Old Warehouse No. 8",
    japaneseLabel: "第８倉庫",
    nativeArea: "MS08",
    nativePointLightingArea: nativeLightingArea("MS08"),
    prefix: OLD_WAREHOUSE_EIGHT_PREFIX,
    spawn: new BABYLON.Vector3(26.5, 0, -2.299999952316284),
    yaw: 0.8727391949443528,
    includeFile: includeOldWarehouseEightMapFile,
    placements: placements.ms08,
  }),
  ma00: Object.freeze({
    id: "ma00",
    label: "Forklift Playground",
    japaneseLabel: "フォークリフト遊び場",
    nativeArea: "MA00",
    nativePointLightingArea: nativeLightingArea("MFSY"),
    // The playground reuses the harbor scene rather than MA00 race geometry.
    collisionArea: "MFSY",
    prefix: NEW_YOKOSUKA_HARBOR_PREFIX,
    sceneComposition: "MFSY",
    spawn: FORKLIFT_PLAYGROUND_SPAWN,
    yaw: Math.PI,
    waterHeight: sceneWaterHeight("MA00"),
    vehicle: "forklift",
    forkliftSpawns: FORKLIFT_PLAYGROUND_SPAWNS,
    cargoSpawn: FORKLIFT_PLAYGROUND_CARGO_SPAWN,
    cargoSpawns: FORKLIFT_PLAYGROUND_CARGO_SPAWNS,
    cargoId: FORKLIFT_PLAYGROUND_CARGO_ID,
    cargoEnabled: FORKLIFT_PLAYGROUND_CARGO_ENABLED,
    includeFile: includeNewYokosukaHarborMapFile,
    timedMapLayers: timedMapLayersForSource("MFSY"),
    placements: placements.mfsy,
  }),
  ma00race: Object.freeze({
    id: "ma00race",
    label: "Forklift Races",
    japaneseLabel: "フォークリフトレース",
    nativeArea: "MA00",
    nativePointLightingArea: nativeLightingArea("MA00"),
    prefix: FORKLIFT_RACE_PREFIX,
    spawn: FORKLIFT_RACE_PLAYER_SPAWN,
    yaw: Math.PI / 2,
    waterHeight: sceneWaterHeight("MA00"),
    vehicle: "forklift",
    forkliftSpawns: FORKLIFT_RACE_SPAWNS,
    cargoEnabled: FORKLIFT_RACE_CARGO_ENABLED,
    includeFile: includeForkliftRaceMapFile,
    placements: placements.ma00race,
  }),
  // Native S2 interiors and special scenes stay out of the sidebar but are
  // addressable by FLDD/AREATBL traversal transitions and saved locations.
  ...SHENMUE2_TRAVERSABLE_WORLDS,
  ...Object.fromEntries(shenmue2Exploration.worlds.map(definition => [definition.id,
    Object.freeze({
      id: definition.id,
      label: definition.label,
      japaneseLabel: shenmue2JapaneseLabel(definition.area, definition.label),
      nativeArea: definition.area,
      assetArea: definition.area,
      assetFormat: 'MT7',
      prefix: definition.prefix,
      scenePrefixes: Object.freeze(definition.scenePrefixes),
      nativeCollisionField: definition.nativeCollisionField,
      collisionDisc: definition.disc,
      requireNativeCollision: true,
      spawn: BABYLON.Vector3.FromArray(definition.spawn.position),
      yaw: definition.spawn.yaw,
      placements: Object.freeze([]),
      evidence: Object.freeze({source: definition.spawn.source, explorationOnly: true}),
    })])),
  // Each travel-menu default is an exact inbound transition from an adjacent
  // outdoor zone. These entry records are also used by normal boundary travel,
  // so menu travel and native traversal share the same coordinate system.
  s2ak00: shenmue2OutdoorWorld({
    id: "s2ak00",
    area: "AK00",
    label: "Fortune's Pier",
    defaultEntryTransitionId: "s2-ar02-fldd-exit-2-to-ak00-entry-1",
  }),
  s2ar02: shenmue2OutdoorWorld({
    id: "s2ar02",
    area: "AR02",
    label: "Worker's Pier",
    defaultEntryTransitionId: "s2-ak00-fldd-exit-1-to-ar02-entry-2",
  }),
  s2ar03: shenmue2OutdoorWorld({
    id: "s2ar03",
    area: "AR03",
    label: "Queen's Street",
    defaultEntryTransitionId: "s2-ar02-fldd-exit-28-to-ar03-entry-28",
  }),
  s2wb00: shenmue2OutdoorWorld({
    id: "s2wb00",
    area: "WB00",
    label: "Scarlet Hills",
    defaultEntryTransitionId: "s2-wt00-fldd-exit-2-to-wb00-entry-1",
  }),
  s2we00: shenmue2OutdoorWorld({
    id: "s2we00",
    area: "WE00",
    label: "Golden Quarter",
    defaultEntryTransitionId: "s2-wr00-fldd-exit-2-to-we00-entry-2",
  }),
  s2wk00: shenmue2OutdoorWorld({
    id: "s2wk00",
    area: "WK00",
    label: "South Carmain Quarter",
    defaultEntryTransitionId: "s2-wr00-fldd-exit-3-to-wk00-entry-2",
  }),
  s2wn00: shenmue2OutdoorWorld({
    id: "s2wn00",
    area: "WN00",
    label: "Lucky Charm Quarter",
    defaultEntryTransitionId: "s2-wr00-fldd-exit-1-to-wn00-entry-5",
  }),
  s2wr00: shenmue2OutdoorWorld({
    id: "s2wr00",
    area: "WR00",
    label: "White Dynasty Quarter",
    defaultEntryTransitionId: "s2-wk00-fldd-exit-2-to-wr00-entry-3",
  }),
  s2ws00: shenmue2OutdoorWorld({
    id: "s2ws00",
    area: "WS00",
    label: "Green Market Quarter",
    defaultEntryTransitionId: "s2-ar03-fldd-exit-3-to-ws00-entry-1",
  }),
  s2wt00: shenmue2OutdoorWorld({
    id: "s2wt00",
    area: "WT00",
    label: "Wise Men's Quarter",
    defaultEntryTransitionId: "s2-wk00-fldd-exit-3-to-wt00-entry-1",
  }),
});

export function worldLabelForId(worldId) {
  const rawId = String(worldId || "").trim();
  if (!rawId) return "Unknown Location";
  return WORLDS[rawId.toLowerCase()]?.label || rawId;
}

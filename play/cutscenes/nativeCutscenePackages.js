import { runtimeAssetGroup, runtimeAssetUrl } from "../../src/RuntimeAssets.js";
import nativeActivityActorManifest from "../data/events/nativeActivityActors.json";
import op00ActivityActorManifest from "../data/events/op00ActivityActors.json";
import op00AssetInventory from "../assets/introduction/op00/asset-inventory.generated.json";
import op00ActivityManifest from "../assets/introduction/op00/manifest.json";
import drauthActivityManifest from "../assets/dobuita/drauth/manifest.json";
import nativeFaceManifest from "../assets/cutscenes/native-faces/manifest.generated.json";
import drauthAudioManifest from "../../public/audio/world/drauth/manifest.json";
import yq14ActivityManifest from "../assets/dobuita/yq14/manifest.json";
import yq14AudioManifest from "../../public/audio/world/yq14/manifest.json";
import ybhnActivityManifest from "../assets/dobuita/ybhn/manifest.json";
import ybhnAudioManifest from "../../public/audio/world/ybhn/manifest.json";
import djhnActivityManifest from "../assets/dobuita/djhn/manifest.json";
import djhnAudioManifest from "../../public/audio/world/djhn/manifest.json";
import d0w0ActivityManifest from "../assets/dobuita/d0w0/manifest.json";
import d0w0AudioManifest from "../../public/audio/world/d0w0/manifest.json";
import dnozActivityManifest from "../assets/sakuragaoka/dnoz/manifest.json";
import dnozAudioManifest from "../../public/audio/world/dnoz/manifest.json";
import dnozSkiActivityManifest from "../assets/sakuragaoka/dnoz-ski/manifest.json";
import dnozSkiAudioManifest from "../../public/audio/world/dnoz-ski/manifest.json";
import jhw0ActivityManifest from "../assets/hazuki/jhw0/manifest.json";
import jhw0AudioManifest from "../../public/audio/world/jhw0/manifest.json";
import tgmaActivityManifest from "../assets/hazuki/tgma/manifest.json";
import tgmaAudioManifest from "../../public/audio/world/tgma/manifest.json";
import mskaActivityManifest from "../assets/hazuki/mska/manifest.json";
import mskaAudioManifest from "../../public/audio/world/mska/manifest.json";
import kakgActivityManifest from "../assets/hazuki/kakg/manifest.json";
import kakgFukuAudioManifest from "../../public/audio/world/kakg-fuku/manifest.json";
import kakgIneAudioManifest from "../../public/audio/world/kakg-ine/manifest.json";
import hihyActivityManifest from "../assets/hazuki/hihy/manifest.json";
import hihyAudioManifest from "../../public/audio/world/hihy/manifest.json";
import bussActivityManifest from "../assets/dobuita/buss/manifest.json";
import bussAudioManifest from "../../public/audio/world/buss/manifest.json";
import bebfActivityManifest from "../assets/hazuki/bebf/manifest.json";
import bebfAudioManifest from "../../public/audio/world/bebf/manifest.json";
import sakrActivityManifest from "../assets/yd01/sakr/manifest.json";
import sakrAudioManifest from "../../public/audio/world/sakr/manifest.json";
import houoActivityManifest from "../assets/hazuki/houo/manifest.json";
import houoAudioManifest from "../../public/audio/world/houo/manifest.json";
import tokiActivityManifest from "../assets/dobuita/toki/manifest.json";
import tokiAudioManifest from "../../public/audio/world/toki/manifest.json";
import kkyaActivityManifest from "../assets/hazuki/kkya/manifest.json";
import kkybActivityManifest from "../assets/hazuki/kkyb/manifest.json";
import kkycActivityManifest from "../assets/hazuki/kkyc/manifest.json";
import kkydActivityManifest from "../assets/hazuki/kkyd/manifest.json";
import kkyeActivityManifest from "../assets/hazuki/kkye/manifest.json";
import kkyfActivityManifest from "../assets/hazuki/kkyf/manifest.json";
import cata1ActivityManifest from "../assets/yamanose/cata1/manifest.json";
import cata1AudioManifest from "../../public/audio/world/cata1/manifest.json";
import evsnActivityManifest from "../assets/sakuragaoka/evsn/manifest.json";
import evsnAudioManifest from "../../public/audio/world/evsn/manifest.json";
const iwaTextureUrl = runtimeAssetUrl("play/assets/characters/IWA_textures.bin");
const fubModelUrl = runtimeAssetUrl("play/assets/characters/FUB_M.CHRM");
const fubTextureUrl = runtimeAssetUrl("play/assets/characters/FUB_textures.bin");
const kokModelUrl = runtimeAssetUrl("play/assets/characters/KOK_M.CHRM");
const jomoHawkModelUrl = runtimeAssetUrl("play/assets/introduction/op02/models/TAK02M7G.CHRM");
const jomoHawkMotionUrl = runtimeAssetUrl("play/assets/introduction/op02/M_TORI.MOTN");
const mZakoMotionUrl = runtimeAssetUrl("play/assets/account/M_ZAKO.MOTN");
import op00AudioManifest from "../../public/audio/world/op00/manifest.json";
import op02ActivityManifest from "../assets/introduction/op02/manifest.json";
import op02AudioManifest from "../../public/audio/world/op02/manifest.json";
import {
  createNativeActivityActorCatalog,
} from "../events/NativeActivityActorCatalog.js";

const bundledDrauthActivityAssets = runtimeAssetGroup("play/assets/dobuita/drauth/*.{AUTH,MOTN}");
const bundledNativeFacialAssets = runtimeAssetGroup("play/assets/cutscenes/native-faces/*.{MT5,BIN,json}");
const bundledYq14Assets = runtimeAssetGroup("play/assets/dobuita/yq14/*.{AUTH,CHRM}");
const bundledYbhnAssets = runtimeAssetGroup("play/assets/dobuita/ybhn/*.{AUTH,MOTN}");
const bundledDjhnAssets = runtimeAssetGroup("play/assets/dobuita/djhn/*.{AUTH,MOTN,CHRM}");
const bundledD0w0Assets = runtimeAssetGroup("play/assets/dobuita/d0w0/*.{AUTH,MOTN,CHRM}");
const bundledDnozAssets = runtimeAssetGroup("play/assets/sakuragaoka/dnoz/*.{AUTH,MOTN}");
const bundledDnozSkiAssets = runtimeAssetGroup("play/assets/sakuragaoka/dnoz-ski/*.{AUTH,MOTN,MT5,BIN}");
const bundledDnozEnvironmentAssets = runtimeAssetGroup("play/assets/sakuragaoka/dnoz-environment/*.MAPM");
const bundledJhw0Assets = runtimeAssetGroup("play/assets/hazuki/jhw0/*.{AUTH,MOTN}");
const bundledTgmaAssets = runtimeAssetGroup("play/assets/hazuki/tgma/*.{AUTH,MOTN,CHRM,MT5,BIN}");
const bundledMskaAssets = runtimeAssetGroup("play/assets/hazuki/mska/*.{AUTH,MOTN}");
const bundledKakgAssets = runtimeAssetGroup("play/assets/hazuki/kakg/*.{AUTH,MOTN}");
const bundledHihyAssets = runtimeAssetGroup("play/assets/hazuki/hihy/*.{AUTH,MOTN,CHRM,MAPM,SPR}");
const bundledBussAssets = runtimeAssetGroup("play/assets/dobuita/buss/*.{AUTH,MOTN,CHRM}");
const bundledBebfAssets = runtimeAssetGroup("play/assets/hazuki/bebf/*.{AUTH,MOTN}");
const bundledSakrAssets = runtimeAssetGroup("play/assets/yd01/sakr/*.{AUTH,MOTN}");
const bundledHouoAssets = runtimeAssetGroup("play/assets/hazuki/houo/*.{AUTH,MOTN,CHRM,bin}");
const bundledTokiAssets = runtimeAssetGroup("play/assets/dobuita/toki/*.{AUTH,MOTN,MT5,BIN}");
const bundledKkyaAssets = runtimeAssetGroup("play/assets/hazuki/kkya/*.{AUTH,MOTN,CHRM,MAPM}");
const bundledKkybAssets = runtimeAssetGroup("play/assets/hazuki/kkyb/*.{AUTH,MOTN,CHRM,MAPM}");
const bundledKkycAssets = runtimeAssetGroup("play/assets/hazuki/kkyc/*.{AUTH,MOTN,CHRM,MAPM}");
const bundledKkydAssets = runtimeAssetGroup("play/assets/hazuki/kkyd/*.{AUTH,MOTN,CHRM,MAPM}");
const bundledKkyeAssets = runtimeAssetGroup("play/assets/hazuki/kkye/*.{AUTH,MOTN,CHRM,MAPM}");
const bundledKkyfAssets = runtimeAssetGroup("play/assets/hazuki/kkyf/*.{AUTH,MOTN,CHRM,MAPM}");
const bundledCata1Assets = runtimeAssetGroup("play/assets/yamanose/cata1/*.{AUTH,MOTN,CHRM}");
const bundledEvsnAssets = runtimeAssetGroup("play/assets/sakuragaoka/evsn/*.{AUTH,MOTN,CHRM}");
const bundledOp00FacialAssets = runtimeAssetGroup("play/assets/introduction/op00/faces/*.{MT5,BIN,json}");
const bundledOp00HandAssets = runtimeAssetGroup("play/assets/introduction/op00/hands/*.{MT5,BIN}");
const bundledOp00ActivityAssets = runtimeAssetGroup("play/assets/introduction/op00/*.{AUTH,BIN}");
const bundledOp02Assets = runtimeAssetGroup("play/assets/introduction/op02/**/*.{AUTH,MOTN,MAPM,CHRM,BIN,bin,json,PNG,png,SCR0,SCR1,SCR2}");

function sourceAssetMap(...sources) {
  const assets = {};
  for (const source of sources) {
    for (const [sourcePath, url] of Object.entries(source)) {
      if (assets[sourcePath] && assets[sourcePath] !== url) {
        throw new Error(`cutscene asset ${sourcePath} has conflicting URLs`);
      }
      assets[sourcePath] = url;
    }
  }
  return Object.freeze(assets);
}

const nativeActors = createNativeActivityActorCatalog(nativeActivityActorManifest);
const op00Actors = createNativeActivityActorCatalog(op00ActivityActorManifest);
const op00FaceAssets = sourceAssetMap(bundledOp00FacialAssets);
const op00HandAssets = sourceAssetMap(bundledOp00HandAssets);

const jomoVisionAssets = Object.freeze({
  ...sourceAssetMap(
    bundledKkyaAssets,
    bundledKkybAssets,
    bundledKkycAssets,
    bundledKkydAssets,
    bundledKkyeAssets,
    bundledKkyfAssets,
  ),
  ...sourceAssetMap(bundledNativeFacialAssets),
  ...op00FaceAssets,
  "play/assets/characters/KOK_M.CHRM": kokModelUrl,
  "play/assets/introduction/op02/models/TAK02M7G.CHRM": jomoHawkModelUrl,
  "play/assets/introduction/op02/M_TORI.MOTN": jomoHawkMotionUrl,
});
const disc3Shenhua = Object.freeze({
  ...kkycActivityManifest.packageActors.SINF,
  browserFilename: "S3_JOMO_SIN_M.MT5",
});
const disc3Hawk = Object.freeze({
  ...kkybActivityManifest.packageActors.HAWK,
  browserFilename: "S3_JOMO_TAK02M7G.MT5",
});
const jomoVisionPackage = ({
  id,
  manifest,
  packageActors,
  facialAssets,
  nodeMotion,
  trackId,
}) => (
  Object.freeze({
    id,
    worldId: "interior",
    actorDefinitions: nativeActors.forWorld("interior"),
    actorTags: manifest.actorTags,
    assets: jomoVisionAssets,
    actors: Object.freeze({
      requirePlayer: false,
      preservePlayerOnComplete: false,
    }),
    ...(facialAssets || nodeMotion ? {
      presentation: Object.freeze({
        ...(facialAssets ? { facialAssets: Object.freeze(facialAssets) } : {}),
        ...(nodeMotion ? { nodeMotion } : {}),
      }),
    } : {}),
    environment: Object.freeze({
      ...(manifest.sceneObjects ? { sceneObjects: manifest.sceneObjects } : {}),
      ...(packageActors ? { packageActors: Object.freeze(packageActors) } : {}),
    }),
    playback: Object.freeze({ manifest }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({ trackId, startActivity: true, loop: true })]),
      gain: 1,
    }),
  })
);
const jomoVisionPackages = Object.freeze([
  jomoVisionPackage({ id: "kkya", manifest: kkyaActivityManifest, trackId: "bgm079" }),
  jomoVisionPackage({
    id: "kkyb",
    manifest: kkybActivityManifest,
    packageActors: kkybActivityManifest.packageActors,
    nodeMotion: op02ActivityManifest.nodeMotion,
    trackId: "bgm079",
  }),
  jomoVisionPackage({
    id: "kkyc",
    manifest: kkycActivityManifest,
    packageActors: kkycActivityManifest.packageActors,
    facialAssets: { SINF: nativeFaceManifest.facialAssets.SINF },
    trackId: "bgm079",
  }),
  jomoVisionPackage({
    id: "kkyd",
    manifest: kkydActivityManifest,
    packageActors: { SINF: disc3Shenhua },
    facialAssets: { SINF: nativeFaceManifest.facialAssets.SINF },
    trackId: "bgm079",
  }),
  jomoVisionPackage({
    id: "kkye",
    manifest: kkyeActivityManifest,
    packageActors: { SINF: disc3Shenhua, HAWK: disc3Hawk },
    facialAssets: { SINF: nativeFaceManifest.facialAssets.SINF },
    nodeMotion: op02ActivityManifest.nodeMotion,
    trackId: "bgm079",
  }),
  jomoVisionPackage({
    id: "kkyf",
    manifest: kkyfActivityManifest,
    packageActors: kkyfActivityManifest.packageActors,
    facialAssets: { SORY: op00AssetInventory.facialAssets.SORY },
    trackId: "bgm201",
  }),
]);

const nativeSilentActivityMusic = resource => Object.freeze({
  cues: Object.freeze([]),
  authoredSilence: Object.freeze({
    classification: "native-owner-silent-during-activity",
    resource,
    evidence: "tools/evidence/selectable-cutscene-music-audit.json",
  }),
});

export const NATIVE_CUTSCENE_PACKAGES = Object.freeze([
  ...jomoVisionPackages,
  Object.freeze({
    id: "houo",
    worldId: "exterior",
    actorDefinitions: nativeActors.forWorld("exterior").filter(
      definition => definition.actorCode === "FUKU",
    ),
    actorTags: Object.freeze(houoActivityManifest.actorTags),
    assets: Object.freeze({
      ...sourceAssetMap(bundledHouoAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
      ...op00HandAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        FUKU: nativeFaceManifest.facialAssets.FUKU,
      }),
      handAssets: Object.freeze({
        AKIR: op00AssetInventory.handAssets.AKIR,
        FUKU: op00AssetInventory.handAssets.FUKU,
      }),
    }),
    environment: Object.freeze({
      sceneObjects: houoActivityManifest.sceneObjects,
    }),
    playback: Object.freeze({
      manifest: houoActivityManifest,
      audioManifest: houoAudioManifest,
    }),
    music: nativeSilentActivityMusic("HOUO"),
  }),
  Object.freeze({
    id: "toki",
    worldId: "drsa",
    actorDefinitions: Object.freeze([Object.freeze({
      actorCode: "ASDA",
      label: "Xia Xiu Yu",
      modelCode: "KAS_L",
      activityOnly: true,
    })]),
    actorTags: Object.freeze(tokiActivityManifest.actorTags),
    assets: Object.freeze({
      ...sourceAssetMap(bundledTokiAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
      }),
      handAssets: tokiActivityManifest.handAssets,
    }),
    environment: Object.freeze({
      attachedObjects: tokiActivityManifest.attachedObjects,
    }),
    playback: Object.freeze({
      manifest: tokiActivityManifest,
      audioManifest: tokiAudioManifest,
    }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({
        trackId: "bgm050",
        startActivity: true,
        loop: true,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "cata1",
    worldId: "yamanose",
    actorDefinitions: nativeActors.forWorld("yamanose"),
    actorTags: Object.freeze([
      ...new Set(cata1ActivityManifest.activities.flatMap(
        activity => activity.actors,
      )),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledCata1Assets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
      }),
    }),
    environment: Object.freeze({
      sceneObjects: cata1ActivityManifest.sceneObjects,
      packageActors: cata1ActivityManifest.packageActors,
    }),
    playback: Object.freeze({
      manifest: cata1ActivityManifest,
      audioManifest: cata1AudioManifest,
    }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({
        trackId: "bgm051",
        startActivity: true,
        loop: true,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "evsn",
    worldId: "sakuragaoka",
    actorDefinitions: nativeActors.forWorld("sakuragaoka"),
    actorTags: Object.freeze([
      ...new Set(evsnActivityManifest.activities.flatMap(
        activity => activity.actors,
      )),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledEvsnAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        HRSK: nativeFaceManifest.facialAssets.HRSK,
      }),
    }),
    environment: Object.freeze({
      sceneObjects: evsnActivityManifest.sceneObjects,
      packageActors: evsnActivityManifest.packageActors,
    }),
    playback: Object.freeze({
      manifest: evsnActivityManifest,
      audioManifest: evsnAudioManifest,
    }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({
        trackId: "dobuita-selector-18",
        activitySlot: 2,
        loop: false,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "op00-opening",
    worldId: "op00",
    actorDefinitions: op00Actors.forWorld("op00"),
    actorTags: op00ActivityManifest.actorTags,
    assets: Object.freeze({
      ...op00FaceAssets,
      ...op00HandAssets,
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...sourceAssetMap(bundledOp00ActivityAssets),
    }),
    actors: Object.freeze({
      requirePlayer: false,
      preservePlayerOnComplete: false,
    }),
    presentation: Object.freeze({
      facialAssets: op00AssetInventory.facialAssets,
      handAssets: op00AssetInventory.handAssets,
    }),
    environment: Object.freeze({
      sceneObjects: op00AssetInventory.sceneObjects,
      mapLayers: op00AssetInventory.mapVisibilityModels,
      attachedObjects: op00AssetInventory.attachedObjects,
    }),
    playback: Object.freeze({
      manifest: op00ActivityManifest,
      audioManifest: op00AudioManifest,
    }),
    music: Object.freeze({
      cues: op00AudioManifest.music,
      gain: 0.82,
    }),
  }),
  Object.freeze({
    id: "op02-opening",
    worldId: "op02",
    // SINF and HAWK are archive-local package actors. AKIR uses the current
    // player presentation only in the first AUTH. None belong in the world's
    // scheduled-actor loader.
    actorDefinitions: Object.freeze([]),
    actorTags: Object.freeze([
      ...new Set(op02ActivityManifest.activities.flatMap(activity => activity.actors)),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledOp02Assets),
    }),
    actors: Object.freeze({
      requirePlayer: false,
      preservePlayerOnComplete: false,
    }),
    presentation: Object.freeze({
      facialAssets: op02ActivityManifest.facialAssets,
      clothTracks: op02ActivityManifest.clothTracks,
      nodeMotion: op02ActivityManifest.nodeMotion,
    }),
    environment: Object.freeze({
      packageActors: op02ActivityManifest.packageActors,
      mapLayers: op02ActivityManifest.mapLayers,
      mapGeometryMasks: op02ActivityManifest.mapGeometryMasks,
      scrollSprites: op02ActivityManifest.scrollSprites,
    }),
    playback: Object.freeze({
      manifest: op02ActivityManifest,
      audioManifest: op02AudioManifest,
      ownerAudioCommands: op02ActivityManifest.ownerAudioCommands,
    }),
  }),
  Object.freeze({
    id: "drauth",
    worldId: "dobuita",
    actorDefinitions: nativeActors.forWorld("dobuita"),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...drauthActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledDrauthActivityAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      // Presentation resources are selected by actor tag. Ryo's exact native
      // FACE data remains shared rather than duplicated in this package.
      facialAssets: nativeFaceManifest.facialAssets,
    }),
    playback: Object.freeze({
      manifest: drauthActivityManifest,
      audioManifest: drauthAudioManifest,
    }),
    music: Object.freeze({
      // The reviewed selector-18 owner installs BGM013 and starts its exact
      // A8250000 sequence before choosing either DRAUTH activity branch.
      cues: Object.freeze([Object.freeze({
        trackId: "dobuita-selector-18",
        startActivity: true,
        loop: false,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "yq14",
    worldId: "yq14",
    actorDefinitions: nativeActors.forWorld("dobuita").filter(
      definition => ["SMTH", "TONY"].includes(definition.actorCode),
    ),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...yq14ActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledYq14Assets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
      "play/assets/account/M_ZAKO.MOTN": mZakoMotionUrl,
    }),
    presentation: Object.freeze({
      facialAssets: nativeFaceManifest.facialAssets,
    }),
    environment: Object.freeze({
      sceneObjects: yq14ActivityManifest.sceneObjects,
    }),
    playback: Object.freeze({
      manifest: yq14ActivityManifest,
      audioManifest: yq14AudioManifest,
    }),
  }),
  Object.freeze({
    id: "ybhn",
    worldId: "dobuita",
    actorDefinitions: nativeActors.forWorld("dobuita").filter(
      definition => definition.actorCode === "HRSK",
    ),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...ybhnActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledYbhnAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: nativeFaceManifest.facialAssets,
    }),
    playback: Object.freeze({
      manifest: ybhnActivityManifest,
      audioManifest: ybhnAudioManifest,
    }),
    music: Object.freeze({
      // The native owner loads BGM018 immediately before A1_YOBI and YBHN.
      // Reuse the already hash-pinned BGM018 render from the world music pack.
      cues: Object.freeze([Object.freeze({
        trackId: "yamanose",
        startActivity: true,
        loop: true,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "djhn",
    worldId: "dobuita",
    actorDefinitions: nativeActors.forWorld("dobuita").filter(
      definition => definition.actorCode === "YKHI",
    ),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...djhnActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledDjhnAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
      }),
    }),
    environment: Object.freeze({
      attachedObjects: djhnActivityManifest.attachedObjects,
    }),
    playback: Object.freeze({
      manifest: djhnActivityManifest,
      audioManifest: djhnAudioManifest,
    }),
  }),
  Object.freeze({
    id: "d0w0",
    worldId: "dobuita",
    actorDefinitions: nativeActors.forWorld("dobuita").filter(
      definition => definition.actorCode === "YAMA",
    ),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...d0w0ActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledD0w0Assets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        YAMA: nativeFaceManifest.facialAssets.YAMA,
      }),
    }),
    environment: Object.freeze({
      sceneObjects: d0w0ActivityManifest.sceneObjects,
    }),
    playback: Object.freeze({
      manifest: d0w0ActivityManifest,
      audioManifest: d0w0AudioManifest,
    }),
  }),
  Object.freeze({
    id: "dnoz",
    worldId: "dnoz",
    actorDefinitions: nativeActors.forWorld("sakuragaoka"),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...dnozActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledDnozAssets),
      ...sourceAssetMap(bundledDnozEnvironmentAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        HRSK: nativeFaceManifest.facialAssets.HRSK,
      }),
    }),
    environment: Object.freeze({
      sceneObjects: dnozActivityManifest.sceneObjects,
    }),
    playback: Object.freeze({
      manifest: dnozActivityManifest,
      audioManifest: dnozAudioManifest,
    }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({
        trackId: "sakuragaoka",
        startActivity: true,
        loop: true,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "dnoz-ski",
    worldId: "dnoz",
    actorDefinitions: nativeActors.forWorld("sakuragaoka"),
    actorTags: Object.freeze([
      ...new Set(["AKIR", ...dnozSkiActivityManifest.activities.flatMap(activity => activity.actors)]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledDnozSkiAssets),
      ...sourceAssetMap(bundledDnozEnvironmentAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        HRSK: nativeFaceManifest.facialAssets.HRSK,
      }),
      handAssets: dnozSkiActivityManifest.handAssets,
    }),
    environment: Object.freeze({
      sceneObjects: dnozSkiActivityManifest.sceneObjects,
    }),
    playback: Object.freeze({
      manifest: dnozSkiActivityManifest,
      audioManifest: dnozSkiAudioManifest,
    }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({ trackId: "sakuragaoka", startActivity: true, loop: true })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "tgma",
    worldId: "exterior",
    actorDefinitions: nativeActors.forWorld("exterior"),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...tgmaActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledTgmaAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
      ...op00HandAssets,
      "play/assets/characters/FUB_M.CHRM": fubModelUrl,
      "play/assets/characters/FUB_textures.bin": fubTextureUrl,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        FUKU: tgmaActivityManifest.facialAssets.FUKU,
      }),
      handAssets: Object.freeze({
        ...op00AssetInventory.handAssets,
        ...tgmaActivityManifest.handAssets,
      }),
    }),
    environment: Object.freeze({
      packageActors: tgmaActivityManifest.packageActors,
      attachedObjects: tgmaActivityManifest.attachedObjects,
    }),
    playback: Object.freeze({
      manifest: tgmaActivityManifest,
      audioManifest: tgmaAudioManifest,
    }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({
        trackId: "hazuki-residence",
        startActivity: true,
        loop: true,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "jhw0",
    worldId: "exterior",
    actorDefinitions: nativeActors.forWorld("exterior"),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...jhw0ActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledJhw0Assets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        FUKU: nativeFaceManifest.facialAssets.FUKU,
      }),
    }),
    playback: Object.freeze({
      manifest: jhw0ActivityManifest,
      audioManifest: jhw0AudioManifest,
    }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({
        trackId: "bgm099",
        startActivity: true,
        loop: true,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "mska",
    worldId: "exterior",
    actorDefinitions: nativeActors.forWorld("exterior"),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...mskaActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledMskaAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        FUKU: nativeFaceManifest.facialAssets.FUKU,
      }),
    }),
    playback: Object.freeze({
      manifest: mskaActivityManifest,
      audioManifest: mskaAudioManifest,
    }),
    music: Object.freeze({
      cues: Object.freeze([Object.freeze({
        trackId: "bgm202",
        startActivity: true,
        loop: true,
      })]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "kakg",
    worldId: "exterior",
    actorDefinitions: nativeActors.forWorld("exterior"),
    actorTags: Object.freeze([
      ...new Set([
        "AKIR",
        ...kakgActivityManifest.activities.flatMap(activity => activity.actors),
      ]),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledKakgAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        FUKU: nativeFaceManifest.facialAssets.FUKU,
        INE_: nativeFaceManifest.facialAssets.INE_,
      }),
    }),
    playback: Object.freeze({
      manifest: kakgActivityManifest,
      audioManifests: Object.freeze([
        Object.freeze({ activitySlot: 2, manifest: kakgFukuAudioManifest }),
        Object.freeze({ activitySlot: 3, manifest: kakgIneAudioManifest }),
      ]),
    }),
    music: Object.freeze({
      cues: Object.freeze([
        Object.freeze({ activitySlot: 2, trackId: "bgm085", loop: true }),
        Object.freeze({ activitySlot: 3, trackId: "bgm049", loop: true }),
      ]),
      gain: 1,
    }),
  }),
  Object.freeze({
    id: "buss",
    worldId: "dobuita",
    actorDefinitions: nativeActors.forWorld("dobuita"),
    actorTags: Object.freeze([
      ...new Set(bussActivityManifest.activities.flatMap(activity => activity.actors)),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledBussAssets),
      "/motion/MOTION.BIN": "/motion/MOTION.BIN",
    }),
    environment: Object.freeze({
      packageActors: bussActivityManifest.packageActors,
      sceneObjects: bussActivityManifest.sceneObjects,
    }),
    playback: Object.freeze({
      manifest: bussActivityManifest,
      audioManifest: bussAudioManifest,
    }),
  }),
  Object.freeze({
    id: "hihy",
    worldId: "exterior",
    actorDefinitions: nativeActors.forWorld("exterior").filter(
      definition => definition.actorCode === "JAKR",
    ),
    actorTags: Object.freeze([
      ...new Set(hihyActivityManifest.activities.flatMap(activity => activity.actors)),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledHihyAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      "play/assets/characters/IWA_textures.bin": iwaTextureUrl,
    }),
    actors: Object.freeze({
      requirePlayer: false,
      preservePlayerOnComplete: false,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        IWAO: nativeFaceManifest.facialAssets.IWAO,
        JAKR: nativeFaceManifest.facialAssets.JAKR,
      }),
    }),
    environment: Object.freeze({
      packageActors: hihyActivityManifest.packageActors,
      sceneObjects: hihyActivityManifest.sceneObjects,
      scrollSprites: hihyActivityManifest.scrollSprites,
    }),
    playback: Object.freeze({
      manifest: hihyActivityManifest,
      audioManifest: hihyAudioManifest,
    }),
    music: nativeSilentActivityMusic("HIHY"),
  }),
  Object.freeze({
    id: "bebf",
    worldId: "interior",
    // AKID borrows the player root and SINF is loaded by packageActors below;
    // neither is an ordinary scheduled-world actor.
    actorDefinitions: Object.freeze([]),
    actorTags: Object.freeze([
      ...new Set(bebfActivityManifest.activities.flatMap(activity => activity.actors)),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledBebfAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
      ...op00FaceAssets,
    }),
    actors: Object.freeze({
      playerActorAliases: bebfActivityManifest.playerActorAliases,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        AKIR: nativeFaceManifest.facialAssets.AKIR,
        SINF: nativeFaceManifest.facialAssets.SINF,
      }),
      facialActorAliases: Object.freeze({ AKID: "AKIR" }),
    }),
    environment: Object.freeze({
      packageActors: bebfActivityManifest.packageActors,
    }),
    playback: Object.freeze({
      manifest: bebfActivityManifest,
      audioManifest: bebfAudioManifest,
      ownerAudioCommands: bebfActivityManifest.ownerAudioCommands,
    }),
  }),
  Object.freeze({
    id: "sakr",
    worldId: "yd01",
    // Both authored actors are package-owned MT5 roots, not scheduled-world
    // characters that require duplicate global CHRM assets.
    actorDefinitions: Object.freeze([]),
    actorTags: Object.freeze([
      ...new Set(sakrActivityManifest.activities.flatMap(activity => activity.actors)),
    ]),
    assets: Object.freeze({
      ...sourceAssetMap(bundledSakrAssets),
      ...sourceAssetMap(bundledNativeFacialAssets),
    }),
    actors: Object.freeze({
      requirePlayer: false,
      preservePlayerOnComplete: false,
    }),
    presentation: Object.freeze({
      facialAssets: Object.freeze({
        IWAO: nativeFaceManifest.facialAssets.IWAO,
        JAKR: nativeFaceManifest.facialVariants.JKB,
      }),
    }),
    environment: Object.freeze({
      packageActors: sakrActivityManifest.packageActors,
    }),
    playback: Object.freeze({
      manifest: sakrActivityManifest,
      audioManifest: sakrAudioManifest,
    }),
    music: nativeSilentActivityMusic("SAKR"),
  }),
]);

import {
  nativeDialogueActorDescriptor,
} from "./NativeDialogueActor.js";

// Canonical names for authored subtitle participants that are not represented
// by a labeled scheduled-actor resource. These identities are corroborated by
// their Japanese speaker labels and conversation context in the extracted SRF
// subtitles.
export const NATIVE_DIALOGUE_SPEAKER_LABELS = Object.freeze({
  AKIR: "Ryo Hazuki",
  UNO_: "Tao Duo Ji",
  RNKT: "Tao Lin Xia",
  ONO_: "Goro Ono",
  TOM_: "Tom Johnson",
  INE_: "Ine Hayata",
  FUKU: "Masayuki Fukuhara",
  IWAO: "Iwao Hazuki",
  KURA: "Man in Black",
  SORY: "Lan Di",
  SERA: "Takeshi Sera",
  JOE_: "Jou Higuchi",
  RBRT: "Robert Wells",
  HARY: "Harry Thompson",
  JONZ: "Jones Henders",
  DOOR: "Voice Behind Door",
});

const GENERIC_JAPANESE_SPEAKER_LABELS = Object.freeze({
  "フォーク作業員": "Forklift Operator",
  "作業員": "Worker",
  "釣り人": "Fisherman",
  "若い女": "Young Woman",
  "チンピラ": "Thug",
  "商社マン": "Trading Company Employee",
  "東南アジア系作業員": "Southeast Asian Worker",
  "女": "Woman",
  "外人": "Foreigner",
  "中年男Ｄ": "Middle-Aged Man D",
  "中年男Ｃ": "Middle-Aged Man C",
  "男の子": "Boy",
  "中年女": "Middle-Aged Woman",
  "中年男Ｂ": "Middle-Aged Man B",
  "老人": "Elderly Man",
  "若い男": "Young Man",
  "女の子": "Girl",
});

function normalizedCode(value) {
  return String(value || "").trim().toUpperCase();
}

function japaneseSpeakerLabel(sourceText) {
  const text = String(sourceText || "");
  const quote = text.indexOf("「");
  return quote > 0 ? text.slice(0, quote).trim() : "";
}

export function nativeDialogueDisplayText({
  displayText,
  sourceText,
} = {}) {
  if (typeof displayText === "string" && displayText.length) {
    return displayText;
  }
  let text = String(sourceText || "");
  const openingQuote = text.indexOf("「");
  const closingQuote = text.lastIndexOf("」");
  if (openingQuote >= 0) {
    text = text.slice(
      openingQuote + 1,
      closingQuote > openingQuote ? closingQuote : undefined,
    );
  }
  return text.replaceAll("＆", "\n").replaceAll("=@", "...");
}

export function isRyoDialogueSpeaker(value) {
  const code = typeof value === "object"
    ? normalizedCode(
      value?.speakerId || value?.nativeParticipantCode,
    )
    : normalizedCode(value);
  return code === "AKIR";
}

export function nativeDialogueSpeakerLabel({
  speakerId,
  speakerName,
  nativeParticipantCode,
  sourceText,
} = {}) {
  const speakerCode = normalizedCode(speakerId);
  const participantCode = normalizedCode(nativeParticipantCode);
  const explicitName = String(speakerName || "").trim();

  if (explicitName && explicitName !== speakerCode) return explicitName;

  const canonical = NATIVE_DIALOGUE_SPEAKER_LABELS[
    speakerCode || participantCode
  ];
  if (canonical) return canonical;

  if (speakerCode === "XXXX") {
    const genericLabel = GENERIC_JAPANESE_SPEAKER_LABELS[
      japaneseSpeakerLabel(sourceText)
    ];
    if (genericLabel) return genericLabel;
    return "Unknown Speaker";
  }

  const descriptor = nativeDialogueActorDescriptor(
    speakerCode || participantCode,
  );
  return descriptor?.actorLabel
    || NATIVE_DIALOGUE_SPEAKER_LABELS[participantCode]
    || explicitName
    || speakerCode
    || participantCode;
}

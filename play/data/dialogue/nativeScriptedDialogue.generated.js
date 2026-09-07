// Exact scripted-event dialogue recovered from the source AFS/SRF archive.
// This is separate from HUMANS.AFS NPC conversation resources because AKIR
// monologues are owned by scene scripts rather than an NPC progress record.
export const NATIVE_SCRIPTED_DIALOGUE_RESOURCES = Object.freeze([
  Object.freeze({
    id: "disc1-sa1071-phone-book",
    actorCode: "AKIR",
    actor: Object.freeze({
      actorCode: "AKIR",
      actorLabel: "Ryo Hazuki",
      participantFourccs: Object.freeze(["AKIR"]),
      participantFacingTargets: Object.freeze([]),
    }),
    participants: Object.freeze(["AKIR"]),
    source: Object.freeze({
      archive: "SA1071.AFS",
      sha256: "7587943ce2910d652a5a1674a8fcfa285fd9f6c8d2d6be2e58e6183541418340",
      subtitleMember: "SA1071.SRF",
      subtitleSha256: "372863300f40488b1b903e94366414ae08f61d8ac1b901951f73bcc6acb00fa9",
    }),
    messages: Object.freeze([
      Object.freeze({
        index: 0,
        voiceId: "SA1071A001",
        localCode: "A001",
        speakerId: "AKIR",
        sourceText: "It's not listed=@",
        displayText: "It's not listed...",
        decodedSampleCount: 12160,
        decodedSampleRate: 14000,
      }),
      Object.freeze({
        index: 1,
        voiceId: "SA1071A002",
        localCode: "A002",
        speakerId: "AKIR",
        sourceText: "It's not in here.",
        displayText: "It's not in here.",
        decodedSampleCount: 12160,
        decodedSampleRate: 14000,
      }),
      Object.freeze({
        index: 2,
        voiceId: "SA1071A003",
        localCode: "A003",
        speakerId: "AKIR",
        sourceText: "Guess I can't find it in the phone book.",
        displayText: "Guess I can't find it in the phone book.",
        decodedSampleCount: 24448,
        decodedSampleRate: 14000,
      }),
      Object.freeze({
        index: 3,
        voiceId: "SA1071A004",
        localCode: "A004",
        speakerId: "AKIR",
        sourceText: "Ahh, there's no time for this.",
        displayText: "Ahh, there's no time for this.",
        decodedSampleCount: 32640,
        decodedSampleRate: 14000,
      }),
    ]),
  }),
]);

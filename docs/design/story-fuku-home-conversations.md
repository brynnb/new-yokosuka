# Fuku-san at home

## The translated letter

After talking to Fuku at the Hazuki gate and having Xia translate Zhu's letter, return through the hall at home before completing the Master Chen phone call. Choose **Show Fuku-san the translated letter**. Ryo hands over the memo, and Fuku asks about the mirror and Master Chen. This is a separate visit from the conversation about the unopened letter at the gate.

Disc 1 JOMO tests native flags 180 and 155 for one, and 190 and 751 for zero, at 0x8c6d2–0x8c758. TOKI's translation sets 180 at 0x1cf6. The A0139 gate encounter sets 155 at 0x54d48 and the E1032 phone call sets 190. Earlier Story saves can use their corresponding named receipts. The game writes 751 when the original selector starts. Story records it on completion so a canceled conversation stays available.

JOMO owner 0x6ce90 launches callback 0x6d3a4 and selects slot 34. The original 01MEM track at 0xb22f8 spans 1,051 frames, with 11 recorded English lines, 14 sound cues and TYM001 music. The owner loads MMA0201G.MT5. The callback folds the memo at its two articulated nodes and changes Ryo's grip at frames 273 and 390. It releases the memo at 548. Five nested model nodes share signed key 14. The retail object transform handler at 0x0c15820a calls resolver 0x0c0924a0, which visits root, child and sibling and returns the first match. That selects the outer fold at model offset 0x24b8. The nested folds inherit its motion.

## After Jimmy

Return home from 19:00, after the Asia Travel interrogation and before Goro offers his first harbor job lead. Choose **Talk to Fuku-san about the trip**. Fuku asks how things went, and Ryo explains the difficulty of getting to Hong Kong.

Disc 3 JOMO's internal dispatcher at 0x8b2b8 checks the scene and mode, the evening hour, 400 set, and 410 and 780 clear. It writes entry 34 at 0x8b3c6 and sets the once-only bit 780 at 0x8b462. The D000 transition into the Asia Travel return sets 400. The GOROCOOP / 01GOHA first job-lead encounter sets 410. Story checks either the original earned prerequisite or the corresponding saved Jimmy receipt and records 780 after the film. The input prompt and hall bounds are Story adaptations. Declining or canceling preserves the opportunity.

Entry 34 calls 0x78b50, which launches 0x7b0e4 and selects slot 41. The 01JIB track at 0xaa6fc spans 1,150 frames and carries nine recorded English lines, 12 sound cues, original Fuku and Ryo facial cues and BGM085. The source owner's temporary name dor0 denotes static door 7. In the ordinary room the same DR01_015 model instance is called dor7. Its authored movement starts at native (16.3, 0, 1.8), opens from frame 993 through 1029, and closes by 1055.

## Connected checks

Both visits ran from the ordinary Story hall offer on independent Radeon fixtures. Their earlier quest milestones were seeded. For the letter the test observed the two actors and the paper, canceled, retried all 11 voice cues, and verified 751 and the saved receipt after reload. For the evening visit it observed both actors, all nine voices, and the bedroom door closed at frame 989, open at 1028 and closed again at 1057. Leaving either film restored the exploration state. The evening test also checked the door’s position, collision and pickability after canceling and finishing.

The [connected hardware runs](../../tools/evidence/story-cutscene-connected-2026-11-25.json) identify the fixture and local replay report for each case.

## Rebuilding the films

The profile definitions, original member lengths, SHA-256 values and disc locations live in `tools/cutscenes/build_home_ticket_pack.mjs`. Use `--profile fuku-translated-letter --audio` or `--profile fuku-after-jimmy --audio`. For Disc 1, set `SHENMUE_DISC1_EXTRACTED_ROOT` to the project’s `extracted_files` directory. The existing DTPK exporter uses Python 3.12 and vgmstream. The callback extracts in `tools/evidence/fuku-*-callback-ir.json` can be reproduced with `tools/cutscenes/extract_native_aseq_callback_ir.py` using JOMO map entry 0x88b70 and the respective owner and callback above.

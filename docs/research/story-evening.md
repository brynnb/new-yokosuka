# Shenmue I evening and exploration music

## Verified original rules

The recovered original is the US Dreamcast Disc 1 `1ST_READ.BIN`, SHA-256
`ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c`.
Weather comes from `SPRITE/WEATHER.BIN`, SHA-256
`bef583bdc80a3b2e7ed8167afca006b7da51f25950f6a2ab94919bbbaeb184ef`.
The deterministic extractor is `tools/worlds/extract_shenmue1_weather.py`;
its checked-in output is `play/data/shenmue1-native-weather.json`.

- Clear-sky resource boundaries are **05:30, 07:30, 16:30 and 18:00**.
  The successive resource indices are night 3, dawn 0, day 1, sunset 2, night 3.
  Rain/snow select sky 4; sufficiently cloudy weather selects sky 5.
- Weather curves use the packed **personal calendar date and minute**. WAIR
  lighting records interpolate seconds of day and blend clear/cloud/rain/snow
  tables. These recovered tables do **not** encode month-dependent sunset times.
- The clear light table has afternoon/evening keys at 16:00, 17:00, 18:00 and
  19:00. Its directional RGB values are respectively `(1,.98,.97)`,
  `(1,.70,.59)`, `(.93,.77,.75)` and `(.86,.85,.90)` (rounded).
- **Nightfall plays at 19:00**, independently of the sunset sky boundary.
  Original room scripts reference `BGM109.SND`: JHD0 target `0x4e904`,
  JU00 `0x41828`, D000 `0x7d3b0`, MKSG `0x2537c`. Composer Ryuji Iuchi
  also identifies the 7 pm cue in his own playthrough, transcribed at
  [57:14 in Phantom River Stone's commentary](https://www.phantomriverstone.com/2020/04/ryuji-iuchis-music-commentary-shenmue.html).

The executable's `SELECT` resolver at **0x0c17a65a** reads STEP through
`0x0c142944` and disc through `0x0c0200e4`. Raw SH-4 instructions establish:

| Disc | Clamp before selection |
| --- | --- |
| 1 | STEP >= 110 becomes 0 |
| 2 | STEP < 110 or >= 200 becomes 110 |
| 3 | STEP < 200 becomes 200 |

It then uses integer `STEP / 10` in `fre%02d00.snd`. Soundtrack names such
as “FREE 5” are **not** that number. Normal SELECT exploration starts group 0,
sequence 0. Bank identity includes the disc: Disc 1 FRE1100 and Disc 2 FRE1100
are different, as are Disc 1/3 YKM005 and Disc 2 YKM005.

Native STEP derives from an ordered table of bank-2 progress bits, recovered in
`play/data/dialogue/nativePredicateValues.generated.js`. Our authored Story
events mostly save named milestones instead, so consulting only native bits
would leave music stuck early in the game.

## Explicit Story adaptation

`play/audio/StoryExplorationMusic.js` maps **committed saved milestones** to
the recovered banks. The trigger associations below are supported by a
[first-hand original-game playthrough experiment](https://www.reddit.com/r/Shenmue/comments/1hz5gdc/event_triggers_for_the_free_background_music/),
not proven equivalent native bit writes. Later milestones win over earlier
optional events. No native flags, saves, or dates are manufactured or migrated.

| Latest completed event | Exploration music |
| --- | --- |
| Playable opening | FREE 1 |
| Three Blades at Ajiichi | FREE 5 |
| Liu senior's sailors lead | FREE 9 |
| Parking lot fight | FREE 15 |
| Charlie's tattoo confrontation | FREE 5 |
| Ine-san's Chinese letter | FREE 12 |
| Gao rescue | FREE 1 |
| Xia's translation | FREE 14 |
| Amihama directory | FREE 2 |
| Harbor arrival | FREE 6 |
| New Warehouse No. 8 overheard scene | FREE 8 |
| First Master Chen meeting | FREE 10 |
| Family mirror lead | FREE 5 |
| Bunkado handguard | FREE 2 |
| Phoenix Mirror found | FREE 3 |
| Home discussion with Fuku after Chen | FREE 13 |
| Jimmy's promise after the paid ticket | FREE 11 |
| Jimmy's morning call | FREE 4 |
| Jimmy's Mad Angels information | FREE 7 |

This selection follows the player across Yamanose, Sakuragaoka, Dobuita and
harbor exploration. Old Warehouse District uses its Disc 2 YKM005 stealth bank
before the first Chen meeting, then SELECT. Hazuki house/grounds retain BGM009;
dedicated interiors, forklift activities, fights and cinematics retain their
existing score ownership. You Arcade remains without a background track.
The final departure score is owned by its cinematic, not an outdoor loop.

Story Nightfall is a one-shot at a natural 19:00 crossing, once per date. It
does not catch up on login/time jumps or interrupt a cinematic/fight, and it
resumes the latest exploration selection afterward. Free roam remains at
21:00 with its existing fixed world assignments.

`WorldClock` samples the existing weather and WAIR implementations at Story's
personal date even when an authored event has not created a native room owner.
Explicit native-script environment owners and cinematic overrides retain
precedence. Sky resources and directional RGB come from source data. The
browser's ambient light, intensity and direction still use its four presets,
interpolated over the source 16/17/18/19-hour anchors; dawn uses 05:30–07:30.
This is a documented visual approximation, not full native lighting emulation.
Story has no Free roam 19:45 lighting cap. Fixed scene lighting, indoor exposure,
S2 presentation, clock speed and seasonal surface rules remain unchanged.

## Reproduction

Regenerate/check the small music-policy manifest without rendering or copying
audio:

```sh
node tools/audio/build_story_music.mjs
node tools/audio/build_story_music.mjs --check
```

The builder resolves original disc/file/group/sequence against the viewer
catalogue and verifies immutable asset registration. Existing Ogg files are
reused. `tests/StoryExplorationMusic.test.js` checks their actual local hashes,
saved milestone resolution, ownership, mode isolation and clock crossings.
`tests/WorldClock.test.js` checks clear dawn/dusk boundaries, dated rain/snow,
personal late-night lighting and unchanged Free roam behavior.

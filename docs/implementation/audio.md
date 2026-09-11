# Audio Implementation

This document describes the current browser implementation. Native format,
command, bank-ownership, and trigger evidence belongs in
[`../research/native-world-audio.md`](../research/shenmue1/native-world-audio.md) and
[`../research/dreamcast-music.md`](../research/dreamcast-music.md).

## Runtime Channels

Audio preferences are coordinated by `play/audio/AudioPreferences.js` and
applied by `play/ui/AudioSettingsControls.js`.

| Channel | Runtime | Independent controls |
| --- | --- | --- |
| Overall/master | `AudioPreferences` | Overall Volume, Mute |
| Background music | `PlayMusicDirector` through `MusicControls` | Volume, Mute |
| World ambience | `AmbientDirector` | Ambient Volume, Mute |
| Dialogue | `DialogueAudio` | Volume, Mute |
| Sound effects | `WorldSounds` and feature-specific runtimes | Volume, Mute |
| Arcade background and TV/cinema | Arcade-specific runtimes | Volume, Mute |

`AmbientDirector` reuses the music director's validated looping and crossfade
behavior while disabling music-preference persistence. Ambient state is owned by
`AudioPreferences` under `new-yokosuka.ambient-volume` and
`new-yokosuka.ambient-muted`, so changing ambience never changes music.

Both music and ambience wait for the shared user-activation gate before creating
audible playback. World teardown sets the ambient world to `null`; successful
world activation selects the next loop. Overall volume and master mute remain
multipliers over every channel.

## Background Music Assignments

`public/music/manifest.json` owns /play's background music. Until story
progression is implemented, ordinary exploration uses explicit defaults:

| Area | Music |
| --- | --- |
| Yamanose, Sakuragaoka, Dobuita | FREE 1 (Disc 1 FRE0100, sequence 0) |
| Harbor, including its combat-practice exploration variant | FREE 5 (Disc 2 FRE1400, sequence 0), user-selected |
| Old Warehouse District | FREE 10 (Disc 2 FRE1300, sequence 0) |
| Hazuki residence and grounds | Existing house music, BGM009 |
| You Arcade | No background music assignment; machine audio remains active |
| Other dedicated interiors and forklift activities | Existing dedicated selections |

These are presentation defaults, not simulated story flags. The native SELECT
resolver uses story STEP / 10 to choose a FREE bank, with disc-specific bounds.
The warehouse's early YKM005 stealth music is intentionally skipped; its normal
SELECT path starts after bank-2 flag 260 (at least STEP 13.1). Harbor's FREE 5
corresponds to STEP 14.x rather than its earliest FREE 6. FREE soundtrack numbers
are not filename numbers. Disc identity matters: identically named banks can
contain different music on different discs.

The shared director keeps FREE 1 playing across street-to-street assignments.
An absent arcade assignment uses its existing stop-playback behavior, without
muting sound effects or cabinet audio. BGM109 remains available under the
`old-warehouse-district` track ID for the unchanged **21:00** temporary Nightfall
cue; it is no longer the warehouse's exploration loop. Holiday behavior is
unchanged.

The three exploration files are registered under `public/music/free-roam/` in
the immutable runtime-asset manifest. FREE 1 reuses the existing FRE0100 render;
FREE 5 reuses FRE0200's render because its source bank is byte-identical to
Disc 2 FRE1400. FREE 10 is rendered from its Disc 2 original. To reproduce it:

```sh
python3 -m tools.audio.render_music_sequence \
  --bank /path/to/disc2/data/SCENE/02/SOUND/FRE1300.SND \
  --bank-sha256 421a1eaad2793011c6dfb2733a39b667f2163dcc29b5857f62146322fdf136d2 \
  --driver /path/to/disc1/data/SOUND/AICADRV.BIN \
  --driver-sha256 3f88553a52a6d1af0b988ea3f41800178988350721bd7422a570dc3e4e369915 \
  --renderer .audio-tools/dsf-renderer/dsf-renderer \
  --output public/music/free-roam/disc2-fre1300.ogg
```

The tool reuses the audio archive's sequence renderer and bit-exact encoder,
checks input hashes and complete non-silent PCM, and refuses to replace a
different existing output. Exact encoded hashes require matching codec versions.
Restore existing published files with `npm run assets:restore`; register new
renders and follow [runtime asset publication](../guides/runtime-assets.md).

## Ambient Assignments

`play/config/ambient.js` is the runtime source of truth. Audio labels and source
provenance are in `public/music/asset-viewer-manifest.json`.

| Browser zone | Native area | Ambient file | Notes |
| --- | --- | --- | --- |
| Hazuki Residence Interior | `JOMO` | `AMB037.SND` | Native assignment |
| Hazuki Residence Grounds | `JHD0` | `AMB037.SND` | Best audible fallback |
| Yamanose | `JU00` | `AMB018.SND` | Native assignment |
| Sakuragaoka | `JD00` | `AMB019.SND` | Native assignment |
| Dobuita | `D000` | `AMB022.SND` | Best current candidate |
| MJQ Jazz Bar | `DJAZ` | `AMB043.SND` | Also used for proven Dobuita bar family |
| New Yokosuka Harbor | `MFSY` | `AMB013.SND` | Native assignment |
| Old Warehouse District | `MKSG` | `AMB015.SND` | Native assignment |
| Forklift Playground | `MA00` | `AMB013.SND` | Browser world renders the MFSY harbor |
| Forklift Races | `MA00` | `AMB013.SND` | Current assignment |

Cinema, You Arcade, Combat Practice, and Old Warehouse No. 8 currently have no
ambient assignment.

Accessible Dobuita interiors currently map as follows:

| Interior | Native area | Ambient file |
| --- | --- | --- |
| Antique Shop | `DKTY` | `AMB023.SND` |
| Tomato Convenience Store | `DCBN` | `AMB028.SND` |
| Ajiichi Chinese Restaurant | `DCHA` | `AMB032.SND` |
| Slot House | `DSLT` | `AMB042.SND` |
| MJQ Jazz Bar | `DJAZ` | `AMB043.SND` |
| Heartbeats Bar family | `DBHB` / `DHQB` | `AMB043.SND` |

## Assets and Asset Viewer

The asset viewer has separate Shenmue I and Shenmue II audio catalogs. See
[Audio archive](audio-archive.md) for browsing, four-disc S2 extraction,
coverage limitations, rebuilding and publication. This does not change /play's
music or ambient assignments.

Ambient Ogg files are served from the existing R2 music prefix. Asset Viewer
keeps `AMB` banks in its Ambient category even when their human-readable labels
contain a location name. `E15` event-family audio is categorized as Event rather
than general ambience.

The checked-in AICA renderer produced valid audible output for `AMB013`,
`AMB015`, `AMB033`, and `AMB049`. It produced digital silence for `AMB024`,
`AMB031`, `AMB036`, `AMB050`, and `AMB051`; those silent outputs are not
published or referenced by the runtime. This is why You Arcade and Manpukuken
currently have no ambient assignment and Hazuki Grounds uses `AMB037`.

## World Effects

Positional effects, footsteps, doors, transitions, object cues, and forklift
audio use `WorldSounds` and bank-scoped manifests under `public/audio/world`.
They are separate from the non-positional ambient loop. Exact ownership,
commands, rebuild procedures, and unresolved native work are documented in
[`../research/native-world-audio.md`](../research/shenmue1/native-world-audio.md).

## Verification

Focused coverage lives in:

- `tests/AmbientDirector.test.js`
- `tests/AudioPreferences.test.js`
- `tests/AudioSettingsControls.test.js`
- `tests/PlayMusicDirector.test.js`

Run the focused suite with:

```sh
node --test \
  tests/AmbientDirector.test.js \
  tests/AudioPreferences.test.js \
  tests/AudioSettingsControls.test.js \
  tests/PlayMusicDirector.test.js
```

Run `npm run build` after changing settings markup, JSON manifests, or runtime
imports.

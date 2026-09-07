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

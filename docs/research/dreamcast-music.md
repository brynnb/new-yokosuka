# Dreamcast Music and Ambient-Bank Research

This document preserves research conclusions reviewed at commit `1a3af06`.
Some per-file provenance is also present in `public/music/manifest.json`, but
the interpretation and limitations below were not otherwise documented on
`main`.

## Native format and rendering path

Shenmue's music is sequenced by the Dreamcast AICA sound processor rather
than stored as finished soundtrack audio. The researched path is:

```text
original AICADRV.BIN + DTPK .SND bank
    -> temporary DSF RAM image
    -> original AICA driver running in a headless emulator core
    -> 44.1 kHz stereo PCM
    -> browser-ready Ogg Vorbis
```
The prototype renderer accepts only sequence groups whose command has the
`A8` high byte. It validates the selected group and track before building the
DSF image. The prototype used a pinned build of Highly Theoretical with
`psflib`, rendered 180 seconds per track, and encoded with FFmpeg's
`libvorbis` encoder at quality 4. The AICA driver used for the checked-in
native renders has SHA-256
`3f88553a52a6d1af0b988ea3f41800178988350721bd7422a570dc3e4e369915`.

The implementation and synthetic parser tests remain recoverable on the
audio branch at commit `1a3af06`. They were intentionally not copied to
`main` because the prototype rewrites the whole music manifest, does not
canonicalize FFmpeg's randomized Ogg stream serial, and records source hashes
after rendering instead of requiring known source hashes before it starts.
A future production renderer should correct those three boundaries and add a
known-input/known-PCM integration test.

## Identified banks and tracks

The research established the following human names and native selections.
“Native load” means the area's sound program explicitly loads that bank.
“Representative” means scripts in the area reference the bank, but the native
free-roam program uses story-state selection rather than a permanent one-map,
one-track assignment.

| Area or use | Native bank | Group / track | Evidence strength |
| --- | --- | ---: | --- |
| Hazuki Residence interior (`JOMO`) | `BGM009.SND` | 0 / 0 | Native load; JOMO `MAPINFO` loads the bank and starts sequence `A83F` |
| Hazuki grounds (`JHD0`) | `BGM012.SND` | 0 / 0 | Representative JHD0 script reference |
| Yamanose (`JU00`) | `BGM018.SND` | 0 / 0 | Representative; native program uses `SELECT` |
| Sakuragaoka (`JD00`) | `BGM068.SND` | 0 / 0 | Representative; native program uses `SELECT` |
| Dobuita (`D000`) | `BGM067.SND` | 0 / 0 | Representative; native program uses `SELECT` |
| You Arcade (`DGCT`) | `F1GAMECE.SND` | 0 / 2 | Native area sound program and its long music sequence |
| New Yokosuka Harbor (`MFSY`) | `BGM117.SND` | 0 / 0 | Representative; native program uses `SELECT` |
| Old Warehouse District (`MKSG`) | `BGM109.SND` | 0 / 0 | Representative; native program uses `SELECT` |
| Forklift area (`MA00`) | `BGM062.SND` | 0 / 0 | Native load; MA00 `MAPINFO` loads the bank and starts sequence `A83F` |

The browser's Forklift Playground and Forklift Races entries were both mapped
to the MA00 bank in the prototype because they share that native area. That
does not prove that the original game used one unconditional track throughout
every race or event state.

Main also contains music added after this research, including main-menu,
Dobuita free-quest, MJQ, and forklift-racing selections. Those later choices
are not conclusions from the audio branch and should not be treated as part
of this table's native evidence.

## Important model limitation

The original game does not consistently bind one music bank to one map.
Several free-roam sound programs issue `SELECT`, allowing story progress and
other runtime state to choose the music. A fixed map-to-track table is
therefore a stable browser presentation choice, not a complete recreation of
Shenmue's music logic.

Future fidelity work should retain the native bank/track facts above while
placing story and time rules above them. It should not infer those rules from
the representative labels. Music is also separate from dialogue, ambience,
footsteps, and other world effects; those use different evidence and runtime
paths documented in [native-world-audio.md](shenmue1/native-world-audio.md). Current
browser playback and assignments are documented in
[`../implementation/audio.md`](../implementation/audio.md).

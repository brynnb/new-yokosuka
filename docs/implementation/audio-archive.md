# Asset viewer audio archive

Open `/asset-viewer/?mode=audio`. The audio sidebar has a Shenmue I / Shenmue II
selector, search, and collapsible categories. Shenmue II also has an all-disc /
individual-disc filter. Shared tracks appear once, with all their source discs
listed. `/asset-viewer/?mode=audio&game=shenmue2` opens the second game directly.
Changing game stops playback. Failed catalog reads can be retried; late responses
cannot replace the selected game's catalog.

The player provides Ogg playback, seeking, volume, and Ogg/MP3 downloads. The
same asset resolver serves playback and downloads through the development R2
proxy, configured production asset host, or explicitly enabled offline paths.
The S1 manifest and existing /play music assignments are unchanged.

## What is included

The S2 archive scans the four original Dreamcast scene sound directories. It
renders the `A8` sequenced-music groups in standalone `DTPK` banks and DTPKs
embedded in `AMBS`, `AMSS`, and `SGTS` containers. Every track in each music
group is enumerated, not just track zero. Identical bank + driver + sequence
combinations across discs are rendered once, preserving every source location.

These are 180-second stereo renders, not measured complete songs or seamless
loops. Music and ambience play once by default. Bank IDs remain visible; they
are not invented song titles. Track titles come from Wulinshu Wiki's
[Music Tracks (SM2), revision 603](https://wulinshu.com/wiki/index.php?title=Music_Tracks_(SM2)&oldid=603),
based on Nameless Legacy's spreadsheet. The pinned structured snapshot is
`tools/data/shenmue2-music-titles.json`; credits also appear in the site's credits modal.
These are community labels, not a claim of official soundtrack titles.
Matching uses filename and zero-based subsong for standalone group-zero banks;
blank subsongs mean sequence zero only. Conflicting names and filename placeholders
remain unmapped, as do embedded banks and other groups. Descriptive/uncertain names
retain the source wording and a visible community-description label.
The current catalog has 326 community titles, 60 descriptions, and 39 unmapped entries.
Original bank IDs and sequence numbers remain visible and searchable by bank ID.
Where an unmapped bank filename contains a known area code,
the viewer reuses the scene browser's location name. The current extraction has
425 audible sequences and excludes 99 digitally silent sequences.
Wrapped ambience is grouped under Ambient;
sequenced cues from SGTS event containers are grouped under Event. These groups
describe the source container, not a recreation of the original game's triggers.

This is **not every sound in Shenmue II**: dialogue, streamed movies, arcade
audio, individual sound-effect commands, and the original event scheduling are
outside this music archive. Entirely silent sequences are excluded from the
player and recorded in the manifest's coverage report. That means the driver
produced zero PCM throughout this render window, not proof the original bank
could never make sound under another command or runtime context.

`SCENE/03/SOUND/3_TOBA_4.SND` declares 212,016 bytes but contains 212,002 bytes
on the supplied original disc-3 GDI as well as in the extracted copy. The scanner
reports and excludes that malformed bank; it does not pad or silently repair it.

## Rebuilding

To refresh only labels from the pinned mapping without rendering or uploading audio:

```sh
python3 -m tools.audio.render_shenmue2_audio --relabel-manifest public/music/shenmue2-asset-viewer-manifest.json
```

The source driver is `MISC/AICADRV.BIN` from each disc, not the arcade game's
driver under `OUTRUN`. The inspected S2 driver has SHA-256
`b775b13ab0df29a93cf98f8aff3beb1b7637c1952018dab706e2b3ad4d5f9887`.
Disc 1 was recovered from the local European multi-track disc archive; disc 2
uses the existing European extraction; discs 3 and 4 use the existing PAL GDI
extractions. The generated manifest records individual bank and driver hashes
and disc-relative paths, never local machine paths.

Build the existing headless AICA renderer (C compiler, Git, and zlib development
headers required), then render with Python 3 and FFmpeg with Vorbis/LAME support:

```sh
bash tools/audio-renderer/build.sh
python3 -m tools.audio.render_shenmue2_audio \
  --disc 1=/path/to/disc1/data \
  --disc 2=/path/to/disc2/data \
  --disc 3=/path/to/disc3/data \
  --disc 4=/path/to/disc4/data \
  --renderer .audio-tools/dsf-renderer/dsf-renderer \
  --workers 4
```

The RAM/command setup follows the pre-existing Shenmue I renderer and
[kingshriek's dsfdtpk](https://www.snesmusic.org/hoot/kingshriek/ssf/).
`tools/audio-renderer/build.sh` pins Highly Theoretical and psflib revisions.
The adapter retains its GPL-3.0-only notice. No driver or game bank is included
in the tool source. The known-input test verifies PCM against the original S2
driver; rebuilding the adapter reproduced that same PCM in local verification.

Outputs are ignored under `public/music/shenmue2/`; checksum-verified resume
receipts live under `.audio-tools/archive-cache/shenmue2/`. Temporary DSF/WAV
files use `/var/tmp` and are removed after each render. Both encoders are set to
bit-exact output, including the **output** Ogg muxer flag. Reproducibility assumes
the same renderer and FFmpeg/codec versions. The catalog is generated only after
the entire batch succeeds; rendering never rewrites the S1 or /play manifest.

Register the finished media and follow [runtime asset publication](../guides/runtime-assets.md)
before deploying a client that references it:

```sh
npm run assets:update -- public/music/shenmue2/*.ogg public/music/shenmue2/*.mp3
npm run upload:assets -- --game runtime --source-prefix public/music/shenmue2 --concurrency 4
```

The generated `public/music/shenmue2-asset-viewer-manifest.json` stays in Git.
The audio bytes are served from immutable R2 runtime-asset keys and are not
copied into the production client build.

## Verification

```sh
python3 tests/test_audio_archive.py
node --test tests/AudioArchive.test.js tests/RuntimeAssets.test.js
npx playwright test tests/e2e/audio-archive.spec.js --project=chromium
```

To enable the optional original-bank integration test, set `SHENMUE2_AUDIO_DATA`
to disc 2's extracted `data` directory. `SHENMUE_AUDIO_RENDERER` can select a
freshly rebuilt renderer. Without original files, synthetic parser, bounds,
deduplication and deterministic-encoding checks still run.

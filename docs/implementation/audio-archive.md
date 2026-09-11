# Asset viewer audio archive

Open `/asset-viewer/?mode=audio`. The audio sidebar has a Shenmue I / Shenmue II
selector, search, and collapsible categories. Both games have an all-disc /
individual-disc filter. Shared tracks appear once, with all their source discs
listed. `/asset-viewer/?mode=audio&game=shenmue2` opens the second game directly.
Changing game stops playback. Failed catalog reads can be retried; late responses
cannot replace the selected game's catalog.

The player provides Ogg playback, seeking, volume, and Ogg/MP3 downloads. The
same asset resolver serves playback and downloads through the development R2
proxy, configured production asset host, or explicitly enabled offline paths.
The catalogs are separate from /play's music assignments; rebuilding them does
not change gameplay music.

## What is included

The shared exporter scans three original Dreamcast scene sound directories for
S1 or four for S2. It
renders the `A8` sequenced-music groups in standalone `DTPK` banks and DTPKs
embedded in `AMBS`, `AMSS`, and `SGTS` containers. Every track in each music
group is enumerated, not just track zero. Identical bank + driver + sequence
combinations across discs are rendered once, preserving every source location.

### Shenmue I

The current three-disc scan covers 788 scene sound-bank files and 226 distinct
music sequences. It produced 221 non-silent sequences; with four supplemental
recordings, the viewer lists 225 entries. The five excluded sequences are
AMB024, AMB031, AMB036, AMB050 and AMB051. Each non-silent sequence has Ogg and
MP3 output (442 versioned media files). These counts describe the inspected
scene sound directories, not all audio stored anywhere on the discs.

S1 uses `SOUND/AICADRV.BIN` from each disc. The original source-bank hash and
sequence, rather than a filename, identify each entry. This preserves the
different Disc 1/2 FRE1100 banks, all FREE 1 alternate sequences, and the
later-disc FREE tracks. Search also matches alias filenames from every source
copy; FRE0800 finds the sequences shared with FRE0100.

`tools/data/shenmue1-audio-labels.json` preserves existing labels by bank hash
and sequence. The corrected FREE names are joined from Wulinshu's
[Music Tracks (SM1)](https://wulinshu.com/wiki/index.php/Music_Tracks_(SM1)), based
on Nameless Legacy's index. Other retained labels are not newly verified titles.
Unknown sequences keep their bank ID and sequence number. Four existing
supplemental entries (main menu and three supplied recordings) remain available
under All discs; they are outside the scene-bank extraction coverage.

This supersedes the ignored `.audio-tools/render_all_music.py` prototype:
do not use that Disc 1, filename-keyed, sequence-zero-only exporter. It can
overwrite the gameplay manifest. The shared maintained exporter writes only
the selected game's viewer catalog after the entire batch succeeds.

### Shenmue II

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

This is **not every sound in either game**: dialogue, streamed movies, arcade
audio, individual sound-effect commands, and the original event scheduling are
outside this music archive. Entirely silent sequences are excluded from the
player and recorded in the manifest's coverage report. That means the driver
produced zero PCM throughout this render window, not proof the original bank
could never make sound under another command or runtime context.

`SCENE/03/SOUND/3_TOBA_4.SND` declares 212,016 bytes but contains 212,002 bytes
on the supplied original disc-3 GDI as well as in the extracted copy. The scanner
reports and excludes that malformed bank; it does not pad or silently repair it.

## Rebuilding

For S1, build the renderer below if necessary, then run:

```sh
python3 -m tools.audio.render_shenmue2_audio --game shenmue1 \
  --disc 1=/path/to/disc1/data \
  --disc 2=/path/to/disc2/data \
  --disc 3=/path/to/disc3/data \
  --renderer .audio-tools/dsf-renderer/dsf-renderer --workers 4
npm run assets:update -- public/music/shenmue1/*.ogg public/music/shenmue1/*.mp3
npm run upload:assets -- --game runtime --source-prefix public/music/shenmue1 --concurrency 4
```

The existing exporter command name remains stable for S2 callers; `--game`
defaults to `shenmue2`. S1 outputs and checksum-verified receipts live under
`public/music/shenmue1/` and `.audio-tools/archive-cache/shenmue1/`. Its generated
catalog is `public/music/asset-viewer-manifest.json`. The `coverage` record lists
all inspected disc numbers, audible sequences and exclusions. Old hosted audio
objects are retained for older clients; no cleanup deletes them.

To refresh only labels from the pinned mapping without rendering or uploading audio:

```sh
python3 -m tools.audio.render_shenmue2_audio --relabel-manifest public/music/shenmue2-asset-viewer-manifest.json
python3 -m tools.audio.render_shenmue2_audio --relabel-manifest public/music/asset-viewer-manifest.json
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
the entire batch succeeds; S2 rendering never rewrites the S1 or /play manifest.

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

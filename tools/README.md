# Research and extraction tools

Runnable extraction, analysis, and generation code lives here. Documentation
lives under [docs](../docs/README.md); tool-specific components may keep a local
README beside their code.

## Command manuals

- [Asset extraction and texture export](../docs/guides/tooling/asset-extraction.md)
- [Experimental static MT5 to MT7 conversion](../docs/guides/tooling/mt5-to-mt7.md)
- [Shenmue I/II audio archive rendering](../docs/implementation/audio-archive.md)
- [Scheduled actor extraction](../docs/guides/tooling/scheduled-actors.md)
- [Animation, character diagnostics, and placement](../docs/guides/tooling/animation-and-placement.md)
- [Scene and event analysis](../docs/guides/tooling/scene-and-event-analysis.md)
- [Dialogue extraction](../docs/guides/tooling/dialogue-extraction.md)
- [Emulator capture and investigation](../docs/guides/emulator-research.md)

## Start here

To run the application with published assets, follow [runtime asset setup](../docs/guides/runtime-assets.md).
To extract your own source data, read the [Shenmue I](../docs/guides/shenmue1-extraction.md)
or [Shenmue II](../docs/guides/shenmue2-models.md) workflow first.
Commands and evidence builders have different source prerequisites; do not treat
`assets/extract_all.py` as a universal rebuild of every generated artifact.

Run Python tools as packages from the repository root, without changing
`PYTHONPATH` or adding import-path shims:

```sh
python3 -m tools.assets.extract_all --help
python3 -m tools.scripting.extract_event_camera_catalog --help
node tools/actors/build_playable_avatar_catalog.mjs
```

JavaScript commands use filesystem paths. Existing `npm run ...` command names
are unchanged and point to the new locations.

## Directory ownership

| Directory | Responsibility |
| --- | --- |
| [assets/](assets/) | Disc/archive extraction, model and texture processing, exports and model diagnostics |
| [animation/](animation/) | Skeletons, motion evaluation, FACE, cloth, and animation conformance |
| [actors/](actors/) | Scheduled NPCs, crowd data, controller manifests, and playable avatar catalogs |
| [worlds/](worlds/) | Placement, doors, travel, collision, lighting, and world registration |
| [scripting/](scripting/) | Dialogue and room-program recovery, compilation, and script translation |
| [scripting/operations/](scripting/operations/) | Source-backed proofs for native engine operations |
| [cutscenes/](cutscenes/) | Activity packages, scene ownership, cutscene audio, and readiness audits |
| [audio/](audio/) | World/interaction audio extraction, bank catalogs, and archive music rendering |
| [gameplay/](gameplay/) | Combat evidence and arcade preparation |
| [emulator/](emulator/) | Flycast capture, GDB communication, recording, and validation controls |
| [reference/](reference/) | Generated documentation indexes |

Organize by responsibility, not by language or by `extract`/`build`/`audit`
prefix. Related producers and validators belong together. The three root-level
asset restore/publishing entry points remain easy to find; their worker
components retain their existing dedicated directories.

- `lib/`: shared tooling primitives.
- `data/`: maintained tooling inputs.
- `evidence/`: bounded, machine-readable findings and generated audits used by tools/tests.
- `ghidra/`: static-analysis scripts.
- `patches/`: instrumented-emulator patches and their setup notes.
- `licenses/`: third-party tooling licenses and provenance.
- `audio-renderer/`: the native-audio rendering component.

Raw discs, large captures, extracted binaries, and local work notes remain ignored.
Evidence is not runtime-readiness proof: preserve source hashes, distinguish
observations from hypotheses, and regenerate outputs through their producer.
Published, hash-pinned packages retain the exact bytes and historical producer
names with which they were released. Relocating a tool is not a reason to rewrite
those artifacts or invalidate their checksums. New generations record the current
producer path; maintained evidence locators and documentation use current paths.
External reference text belongs in [docs/reference/external](../docs/reference/external/README.md),
not among our own findings.

## Origin and dependencies

These tools originated in a fork of [Shenmue-Export-Tools](https://github.com/seiche/Shenmue-Export-Tools)
by seiche/Benjamin Collins (2018), which provided PythonPVR, a Blender importer,
and Noesis plugins. New Yokosuka's extraction and analysis pipeline has since
been consolidated here. External reference material retains its own provenance
and ownership; it is not all project-authored documentation.

Most Python tools require Python 3 and Pillow; individual commands may need
additional dependencies. JavaScript tools use the repository's Node environment.
See each command's help and [third-party license provenance](licenses/README.md).

Run `npm run tools:check` and `npm run docs:check` after reorganizing tools.

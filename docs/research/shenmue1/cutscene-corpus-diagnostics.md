# Native cutscene corpus diagnostics

`tools/cutscenes/build_native_cutscene_corpus_diagnostics.py` produces the deterministic
research report at
`tools/evidence/native-cutscene-corpus-diagnostics.json`.

Run it after regenerating the native event IR or scripted-scene resource
inventory:

```bash
python3 -m tools.cutscenes.build_native_cutscene_corpus_diagnostics
```

The report accounts for two exact source populations:

- all 136 Shenmue I `MAPINFO.BIN` programs; and
- all 491 logical AUTH resources, including distinct archive or embedded
  identities that share an identical payload.

## Status meaning

A MAPINFO is `compiled` when its SCN3 initial-owner static closure has no
unresolved native operation, runtime interface, indirect control transfer, or
missing function boundary. The report joins the exact SCN3 container-encoding
evidence before classifying an absent native entry: a bounded marker
`0x00000100` instruction stream is reported as
`control-flow:unsupported-scn3-encoding`, not as an empty or missing function.
It remains blocked until the shared legacy SCN3 interpreter exists. An AUTH
resource is `compiled` when its indexed
payload parses completely without a format issue.

`compiled` is deliberately narrow. It does not mean that a record is a
player-facing cutscene, packaged, selectable, runtime-validated, or ready for
production. Those are separate ownership and integration questions. This
diagnostic never changes the catalog or supplies compatibility playback.

Each blocked record contains one deterministic `firstBlocker`. MAPINFO
provenance includes its disc, area, source path and hash, initial owner,
first function, and exact call offset. AUTH provenance includes its logical
resource ID, physical source identity, payload hash, and archive member or
embedded offset.

## Capability clusters

`firstBlockerClusters` groups records by the shared compiler responsibility
that would unlock them, such as `engine-operation:0x01af` or
`control-flow:unsupported-scn3-encoding`. Clusters are ordered by descending
affected-record count and then capability ID. This makes the next systemic
work visible without inventing per-scene fixes.

The generated artifact retains only the first boundary for prioritization.
The complete IR remains authoritative for every later blocker and must be
regenerated after a shared semantic capability changes.

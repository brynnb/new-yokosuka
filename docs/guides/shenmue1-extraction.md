# Shenmue I extraction

Run commands from the repository root. This guide covers isolated Disc 3
processing; see [tools](../../tools/README.md) for the command catalog.

## Disc 3 Isolated Extraction and Processing

Disc 3 stores its zone content under `SCENE/03`, not `SCENE/02`. It must be
processed under an `S3_` namespace so a filename also present on Disc 2 remains
a distinct asset. The legacy `tools/assets/sync_models.py` must not be used for this
job: it removes `public/models/` before rebuilding Disc 1/2, which is unsafe
when the original extraction roots are unavailable.

The GDI descriptor and all generated data live in gitignored working paths:

```bash
python3 -m tools.assets.gditools3 \
  -i .disc-work/disc3.gdi \
  -o extracted_disc3_v2 \
  --extract-all

test -d extracted_disc3_v2/data/SCENE/03
python3 -m tools.assets.process_disc3
```

`tools/assets/process_disc3.py` reads only the extracted Disc 3 tree during scene
processing. Its default output is `.disc-work/disc3-processed/`, where it writes
a Disc 3-only catalog and a source-to-output audit before any optional merge.
It never clears `public/models/`. The optional `--merge` path is additive,
checks all destination hashes before writing, refuses byte-different
overwrites, and appends catalog names while preserving the complete existing
catalog prefix and order.

The USA Disc 3 extraction audited here contains:

| Inventory | Exact count |
|---|---:|
| Extracted files | 2,790 |
| Extracted bytes | 731,234,915 |
| `SCENE/03` directories | 55 |
| MAPINFO-backed zones | 50 |
| Loose zone model paths | 266 |
| Loose paths without a Disc 1/2 catalog counterpart | 113 |
| Loose paths with a Disc 1/2 counterpart, still preserved as `S3_` | 153 |
| Zone PKS archives | 199 |
| Zone PKF archives | 199 |
| `MAPINFO.BIN` files | 50 |
| Animation candidate BIN files | 142 |
| `SCENE/03/MODEL` MT5 files (inventory only) | 464 |
| Top-level global `MODEL` MT5 files | 326 |

The processor found 1,735 model members inside zone archives. Together with
the 266 loose models, that yielded 2,001 candidates. It collapsed 88
byte-identical repeats. Forty-six byte-different collisions were preserved with
stable archive-qualified names, producing 1,913 scene models. Along with 54
texture packs, the isolated stage contains 1,967 generated files and
165,999,952 bytes.

MA00 includes the real forklift work/race resources:
`ALLMAP.PKS/PKF`, `FLRC.PKS/PKF`, `PK_BOX*`, `PK_CTS*`, `PK_SHUKI*`, and
`MAPINFO.BIN`. NBIK supplies 41 loose motorcycle models. MFBT contains the
70-person battle resources and `BATTLE70.AFS`; MEND contains the ending packs;
MFSY contains Disc 3-specific harbor members. For example, MFSY has 12
byte-different same-name archive variants that the processor retains rather
than silently overwriting.

The 326 global MT5 names all match existing global catalog names. Because the
corresponding local `public/models` binaries are not available in this
workspace, the audit reports those 326 comparisons as name-matched but
byte-unverified. It records byte-identical and byte-different global versions
separately whenever a local comparison binary exists, and never stages a
catalog duplicate as a new global model.

No extraction, staging, auditing, or merge command uploads to R2 or deploys the
site.

---

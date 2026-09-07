# Collection model names

## Result

The US Dreamcast executable contains an authoritative English collection-item
table. Each entry stores an internal resource code beside the name presented to
the player:

```text
GACIAK1  Akira 1
GACIAK2  Akira 2
...
GACS5N1  Forklift No.1
```

The MT5 filename adds a final graphics/model suffix, so `GACIAK1` joins to
`MODEL/ITEM/GACIAK1G.MT5`, represented in the web catalog as
`G_ITEM_GACIAK1G.MT5`.

For the local US `1ST_READ.BIN`, the relevant packed string table begins at
decimal file offset `2496772` (`0x261904`). The following
`MT2K6GO / GOGO` record at offset `2500021` marks the start of the cassette
records and is excluded. The offsets are recorded as
evidence in the generated JSON; they are file offsets, not emulated RAM
addresses.

The web viewer's Collection Models section contains:

- 167 models with an exact English name in the executable's collection table.
- `GACK6SP`, cross-referenced as Space Harrier from complete external
  collection lists.

The audit additionally retains 34 alternate-size GAC models which are omitted
from the visible Collection Models list.

The exact records include 154 GAC models and 13 collection models with other
prefixes: the two Yukawa figures, Delivery Moped, three Super Balls, three Dice,
and four arcade prize/token models.

The generated JSON labels the 34 copies after their canonical counterparts,
such as `Akira 1 (Alternate)`, and marks them as `alternate-size-model`. This
preserves the research relationship without presenting differently scaled
copies as additional collectibles in the asset viewer.

## Reproducing the mapping

With the US Dreamcast executable extracted at
`.disc-work/exact/1ST_READ.BIN`, run:

```bash
python3 -m tools.assets.extract_collection_model_names
```

This regenerates `src/data/collection-model-names.json` by:

1. Locating the table using its content markers rather than a hard-coded file
   offset.
2. Reading resource/name string pairs.
3. Removing the MT5 filename's final `G` suffix to join it to the resource code.
4. Joining every named collection record to `G_ITEM` models from
   `public/models.json`.
5. Pairing alternate-size models with their canonical named resources.

The source executable is not committed. The generated mapping contains only the
short resource codes, English item names, source offsets, and audit status.

## Alternate-size model resources

These 34 resources exist as models but are absent from the executable's
collection name table. Binary comparison groups them with named model families,
and visual inspection indicates that they reproduce the canonical models at
different sizes:

- `GACIAA1–2` → `Akira 1–2 (Alternate)`
- `GACGJJ1–2` → `Jeffry 1–2 (Alternate)`
- `GACK6XO/XH/XY/XB/XG` → `Hang On 1–5 (Alternate)`
- `GACK6XK` → `Hang On G (Alternate)`
- `GACOKK1/K4/K5/K6` → `Wagon 1–4 (Alternate)`
- `GACOKK2/K3/K7/K8/K9` → `Coupe 1–5 (Alternate)`
- `GACGTXX/GACOTT1/GACOTT2/GACH5TT` → `Truck 1–4 (Alternate)`
- The remaining resources use their canonical name plus `(Alternate)`.

Each record includes its canonical resource in `basedOnResourceCode`. They are
retained for research and individual filename access, but the Collection Models
section filters out the `alternate-size-model` status.

`GACK6SP` is the one special case that occurs inside the collection string
region but has no following name; the next string is another resource code.
Complete external lists contain a Space Harrier raffle toy with no other model
counterpart, and `SP` corroborates that match. The generated audit labels this
as `cross-referenced`, not `collection-table`, so its different evidence level
remains machine-readable.

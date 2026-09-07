# State banks and flags

The native persistent representation is authoritative. Names in the registry
below are research labels and never replace a bank/index pair.

The [complete generated persistent-state index](state-banks-and-flags.generated.md)
enumerates all 1,120 addressable entries across banks 2–4 and joins exact
literal reads/writes from the current all-map inventory. Researched aliases
live in `researched-flags.json`. Regenerate with
`node tools/reference/generate_identifier_state_reference.mjs`, or add `--check` to
validate freshness; do not edit the generated Markdown.

## Confirmed persistent storage

| Bank | Storage | Capacity | Runtime address | Reader / writer | Save offset | Reset |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | bitfield | 1,024 bits / 128 bytes | `0x0c223ef8` | `0x0c15904c` / `0x0c159076` | `0x130` | all zero by `0x0c159290` |
| 3 | bitfield | 64 bits / 8 bytes | `0x0c223ef0` | `0x0c1590f4` / `0x0c15911e` | `0x128` | all zero by `0x0c159290` |
| 4 | byte array | 32 bytes | `0x0c223f78` | `0x0c159154` / `0x0c159168` | `0x230` | all zero by `0x0c159290` |

Source: `tools/evidence/dialogue-predicate-values.json`, whose executable
evidence also identifies descriptor routine `0x0c158c72`, export
`0x0c09c854`, and import `0x0c09c8b4`. Operation `0x0051` subcommands 11/12,
13/14, and 15/16 read/write banks 2, 3, and 4 respectively. `0x0051` is the
larger free-conversation API, not a generic flag operation.

The verified free-roam bootstrap in
`tools/evidence/native-dialogue-free-roam-bootstrap.json` preserves exact
post-opening values. That save is evidence of state, not proof that any one set
bit alone means "free roam."

## Early-story researched flags

| Bank/index | Research label | Proven selection behavior | Setter | Confidence |
| --- | --- | --- | --- | --- |
| 2/10 | `B2_0010_YAMAGISHI_TESTIMONY_BODY` | Selects Yamagishi's testimony body | `unresolved` | `high` |
| 2/20 | `B2_0020_YAMAGISHI_POST_TESTIMONY_BODY` | Selects Yamagishi's post-testimony body | exact Disc 1 setter `unresolved` | `high` |
| 2/30 | `B2_0030_NOZOMI_RETROSPECTIVE_TOM_ADVANCING` | Selects Nozomi's retrospective body and Tom's advancing black-car body | exact Disc 1 setter `unresolved` | `high` |
| 2/40 | `B2_0040_POST_TOM_CHINESE_COMMUNITY_DIALOGUE` | Selects post-Tom/Chinese-community dialogue | exact Disc 1 setter `unresolved` | `high` |

These labels describe observed consumers, not exclusive global meanings. In
particular, Nozomi's initial black-car dialogue does **not** read bank-2 flags
10 or 20. Exact selectors and body routes are generated in
`play/data/dialogue/nativeActorSelectors.generated.js` and supported by
`tools/evidence/dialogue-predicate-values.json`; identity joins come from the
actor reference, not abbreviations.

New registry rows should use: bank/index, provisional alias, exact read/write
evidence, consumers, competing interpretations, evidence paths, and one
controlled confidence label. Unknown semantics are `unresolved`.

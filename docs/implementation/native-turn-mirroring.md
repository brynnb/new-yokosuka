# Native turn mirroring

Ryo's left/right turn names alias the same MOTION.BIN curve block. Their
action-metadata setup differs: the right-hand entries contain opcode `0x13`.
Reversing playback is not equivalent: it leaves the head and torso looking
in the original direction.

## Source and implementation

Evidence is from the retail Shenmue 1 `1ST_READ.BIN` with SHA-256
`ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c`.
Addresses below are runtime addresses, with file base `0x0c010000`.

- Dispatch table `0x0c29f5e4`, entry `0x13`, points to `0x0c1adc72`.
  That handler XORs actor flags at `+4` with `0x40` and advances four bytes.
- `0x0c10c460` scans metadata setup records using the length table at
  `0x0c29423c`, stopping at opcode `0` or `8`. The motion installer checks
  for opcode `0x13` and combines it with controller direction state.
- `0x0c107c00` swaps translation/rotation curve pointers at control offsets
  `+0x1c`/`+0x20` using the authored paired-control byte at `+5`.
- `0x0c107d6c` copies that byte from descriptor `+6`, and the target rotation
  profile from descriptor `+7`. Family zero has 37 descriptors at `0x0c28ccb8`.
- `0x0c10eea6` publishes effective mirror bit `0x20000` to `0x0c2947a8`.
  The translation sampler `0x0c093ba8` then negates X; the rotation sampler
  `0x0c093c7c` uses the profiles at `0x0c2940cc`. Profile 4 is unchanged.

Regenerate the small checked-in tables with:

```sh
node tools/animation/extract_ryo_motion_mirroring.mjs
```

The extractor validates the executable hash. The parser walks setup records
by their sizes, not a byte search, and reports unsupported/truncated setup.
Turn compilation requires resolved metadata and applies the paired curves
and target profiles before solving the skeleton. Both turn directions play
forward. Controller-owned heading is removed from the pose to avoid rotating
twice. Local and remote avatars use the same compiled clips.

This implements the recovered mirror operation for Ryo's in-place turns;
it does not claim full native controller-state replay. Existing captured walk
routing and other controller families are intentionally unchanged. Tests cover
all four 45/90/135/180-degree left/right pairs and malformed metadata prefixes.

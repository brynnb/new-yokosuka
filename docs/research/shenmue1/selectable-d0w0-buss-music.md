# D0W0 and BUSS selectable-scene music

The generated audit is `tools/evidence/selectable-d0w0-buss-music.json`. Rebuild it with:

```sh
python3 -m tools.cutscenes.audit_selectable_d0w0_buss_music
```

The audit deliberately distinguishes AUTH sound effects from BGM ownership.

- All twelve D0W0 selector entries inherit the ambient/room music policy. The exact activity owner at `0x5a900` contains no sound-dispatch operation. The surrounding room wrapper owns the A83F/A004 controls, and no exact browser track identity is proven for A83F in this route.
- All four BUSS selector entries author silence with respect to BGM. The BUSS owner contains bus sound effects and A00A controls only. The boarding caller has no BGM command; the arrival caller issues its A83F room-audio control only after the BUSS owner returns.

Consequently neither package receives a fabricated temporary-track cue. D0W0 can retain room ambience when entered through gameplay, while a standalone BUSS selector preview remains music-free as authored.

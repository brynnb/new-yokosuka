=Stack=
The stack is used for operations on data.
Data is pushed onto the stack and an operation will than be executed on them.

=Registers=
==Stack==
There is a stack base and stack pointer.
==R14==
R14 is the general purpose register of the script parser.<br>
It is used to store function call return values and to do conditional jumping.

=Instructions=
Each opcode is 1 byte in size.

== 0x00 - 0x7F ==
=== 0x00 - 0x3F (0x00 - 0x3D) ===
Control-flow, Function calling.<br><br>
00xx nnnn<br>
x = immediate value size (1 = 1 byte, 2 = 2 byte, 3 = 4 byte)<br>
n = command

==== Unknown ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x10 || 0001 0000 nnnnnnnn || MOBJ related
|-
| 0x20 || 0010 0000 nnnnnnnn nnnnnnnn || MOBJ related
|-
| 0x30 || 0011 0000 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || MOBJ related
|-
| 0x11 || 0001 0001 nnnnnnnn || MOBJ related
|-
| 0x21 || 0010 0001 nnnnnnnn nnnnnnnn  || MOBJ related
|-
| 0x31 || 0011 0001 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || MOBJ related
|-
| 0x12 || 0001 0010 nnnnnnnn || MOBJ related
|-
| 0x22 || 0010 0010 nnnnnnnn nnnnnnnn || MOBJ related
|-
| 0x32 || 0011 0010 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || MOBJ related
|-
| 0x17 || 0001 0111 nnnnnnnn || Writes n into register?
|-
| 0x27 || 0010 0111 nnnnnnnn nnnnnnnn || Writes n into register?
|-
| 0x37 || 0011 0111 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Writes n into register?
|}

==== Stack ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x13 || 0001 0011 nnnnnnnn || Move stack pointer by n bytes
|-
| 0x23 || 0010 0011 nnnnnnnn nnnnnnnn || Move stack pointer by n bytes
|-
| 0x33 || 0011 0011 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Move stack pointer by n bytes
|}

==== Jump ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x14 || 0001 0100 nnnnnnnn || Jumps by the amount of n bytes + unknown value
|-
| 0x24 || 0010 0100 nnnnnnnn nnnnnnnn || Jumps by the amount of n bytes + unknown value
|-
| 0x34 || 0011 0100 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Jumps by the amount of n bytes + unknown value
|-
| 0x15 || 0001 0101 nnnnnnnn || Jumps by the amount of n bytes 
|-
| 0x25 || 0010 0101 nnnnnnnn nnnnnnnn || Jumps by the amount of n bytes 
|-
| 0x35 || 0011 0101 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Jumps by the amount of n bytes 
|-
| 0x16 || 0001 0110 nnnnnnnn || Jumps by the amount of n bytes '''IF''' R14 is zero
|-
| 0x26 || 0010 0110 nnnnnnnn nnnnnnnn || Jumps by the amount of n bytes '''IF''' R14 is zero
|-
| 0x36 || 0011 0110 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Jumps by the amount of n bytes '''IF''' R14 is zero
|}

==== Call Function Set 6 ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x18 || 0001 1000 nnnnnnnn || Execute the n function in set 6
|-
| 0x28 || 0010 1000 nnnnnnnn nnnnnnnn || Execute the n function in set 6
|-
| 0x38 || 0011 1000 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Execute the n function in set 6
|}

==== Call Function Set 1 ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x19 || 0001 1001 nnnnnnnn || Execute the n function in set 1
|-
| 0x29 || 0010 1001 nnnnnnnn nnnnnnnn || Execute the n function in set 1
|-
| 0x39 || 0011 1001 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Execute the n function in set 1
|}

==== Call Function Set 2 ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x1A || 0001 1010 nnnnnnnn || Execute the n function in set 2
|-
| 0x2A || 0010 1010 nnnnnnnn nnnnnnnn || Execute the n function in set 2
|-
| 0x3A || 0011 1010 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Execute the n function in set 2
|}

==== Call Function Set 3 ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x1B || 0001 1011 nnnnnnnn || Execute the n function in set 3
|-
| 0x2B || 0010 1011 nnnnnnnn nnnnnnnn || Execute the n function in set 3
|-
| 0x3B || 0011 1011 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Execute the n function in set 3
|}

==== Call Function Set 4 ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x1C || 0001 1100 nnnnnnnn || Execute the n function in set 4
|-
| 0x2C || 0010 1100 nnnnnnnn nnnnnnnn || Execute the n function in set 4
|-
| 0x3C || 0011 1100 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Execute the n function in set 4
|}

==== Call Function Set 7 ====
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x1D || 0001 1101 nnnnnnnn || Execute the n function in set 7
|-
| 0x2D || 0010 1101 nnnnnnnn nnnnnnnn || Execute the n function in set 7
|-
| 0x3D || 0011 1101 nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Execute the n function in set 7
|}

=== 0x40 - 0x7F ===
Immediate value reading into stack.<br><br>
01xx ddnn<br>
x = immediate value size (1 = 1 byte, 2 = 2 byte, 3 = 4 byte)<br>
d = command<br>
n = subcommand
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x40 - 0x4F || 0100 xxxx || Writes value from last time to stack
|-
| 0x50 - 0x5F || 0101 xxxx nnnnnnnn || Writes n to stack (1 byte)
|-
| 0x60 - 0x6F || 0110 xxxx nnnnnnnn nnnnnnnn || Writes n to stack (2 byte)
|-
| 0x70 - 0x7F || 0111 xxxx nnnnnnnn nnnnnnnn nnnnnnnn nnnnnnnn || Writes n to stack (4 byte)
|}

== 0x80 - 0xBF (0x80 - 0xA6) ==
Arithmetic, Comparision/Relational, Logical, Bitwise, Compound assignment operators
{| class="wikitable"
|-
! Opcode !! Code !! Description
|-
| 0x80 || 1000 0000 || Write stack value to R14
|-
| 0x81 || 1000 0001 || Read R14 value to stack
|-
| 0x82 || 1000 0010 || [MOBJ] Reads 8-bit value from cycle pointer
|-
| 0x83 || 1000 0011 || [MOBJ] Reads 16-bit value from cycle pointer
|-
| 0x84 || 1000 0100 || [MOBJ] Reads 32-bit value from cycle pointer
|-
| 0x85 || 1000 0101 || [MOBJ] Writes 8-bit to cycle pointer
|-
| 0x86 || 1000 0110 || [MOBJ] Writes 16-bit to cycle pointer
|-
| 0x87 || 1000 0111 || [MOBJ] Writes 32-bit to cycle pointer
|-
| 0x88 || 1000 1000 || ==
|-
| 0x89 || 1000 1001 || !=
|-
| 0x8A || 1000 1010 || >=
|-
| 0x8B || 1000 1011 || >
|-
| 0x8C || 1000 1100 || <=
|-
| 0x8D || 1000 1101 || <
|-
| 0x8E || 1000 1110 || ~
|-
| 0x8F || 1000 1111 || &=
|-
| 0x90 || 1001 0000 || |=
|-
| 0x91 || 1001 0001 || ^=
|-
| 0x92 || 1001 0010 || +=
|-
| 0x93 || 1001 0011 || -=
|-
| 0x94 || 1001 0100 || *=
|-
| 0x95 || 1001 0101 || /=
|-
| 0x96 || 1001 0110 || %=
|-
| 0x97 || 1001 0111 || <<=
|-
| 0x98 || 1001 1000 || >>=
|-
| 0x9D || 1001 1101 || float cast
|-
| 0x9E || 1001 1110 || signed cast
|-
| 0x9F || 1001 1111 || (float) <=
|-
| 0xA0 || 1010 0000 || (float) <
|-
| 0xA1 || 1010 0001 || (float) >= (<= inverted)
|-
| 0xA2 || 1010 0010 || (float) > (< inverted)
|-
| 0xA3 || 1010 0011 || (float) +
|-
| 0xA4 || 1010 0100 || (float) -
|-
| 0xA5 || 1010 0101 || (float) *
|-
| 0xA6 || 1010 0110 || (float) /
|}

== 0xC0 - 0xFF ==
Invalid

=Function Sets=
{| class="wikitable"
|-
! Position !! Function Count !! Description 
|-
| 140559C98 || 1 || Set 1 - Removed function
|-
| 140559CA0 || 5 || Set 2 - Memory functions (unused)
|-
| 140559CD0 || 466 || Set 3 - General Shenmue stuff
|-
| 140A4F1E0 || 1 || Set 4 - Unknown
|-
| 140A4F1E8 || 1 || Set 5 - Unknown
|-
| 140A4F1F0 || 47 || Set 6 - SCNF stuff
|-
| 140554210 || 8 || Set 7 - Unknown
|}

== Function Set (140559CA0) ==
{| class="wikitable"
|-
! Function !! Description 
|-
| deleted || ? 
|-
| memset || memset
|-
| memcpy || memcpy 
|-
| strcpy || strcpy 
|-
| sub_14018FFE0 || Reads 140EB1B30
|}

== Function Set (140559CD0) ==
{| class="wikitable"
|-
! Function !! Description 
|-
| sub_140190350 || 
|-
| sub_14009B750 || 
|-
| sub_14009B790 || 
|-
| sub_14009B830 || 
|-
| sub_1401905B0 || 
|-
| sub_140177D30 || 
|-
| sub_1401B8460 || 
|-
| sub_14009B890 || 
|-
| sub_140190BC0 || 
|-
| sub_140190630 || 
|-
| sub_1401919B0 || 
|-
| sub_140191B60 || 
|-
| sub_1401953F0 || 
|-
| sub_140192370 || 
|-
| sub_140193750 || 
|-
| deleted || 
|-
| sub_1401937A0 || 
|-
| sub_1401937C0 || 
|-
| sub_1401938F0 || 
|-
| sub_140193920 || 
|-
| sub_140193980 || 
|-
| sub_140193990 || 
|-
| sub_1401939A0 || 
|-
| sub_140193A00 || 
|-
| sub_140194B70 || 
|-
| sub_140194E00 || 
|-
| sub_1401950F0 || 
|-
| sub_140195380 || 
|-
| sub_140195AB0 || 
|-
| sub_1401954A0 || 
|-
| sub_140195550 || 
|-
| sub_140196160 || 
|-
| sub_1401972C0 || 
|-
| sub_1401972D0 || 
|-
| sub_1401973E0 || 
|-
| sub_140197450 || 
|-
| sub_1401974F0 || 
|-
| sub_1402CBD90 || 
|-
| sub_1401AB600 || 
|-
| sub_1401ABE60 || 
|-
| sub_1401ADEF0 || 
|-
| sub_1401AE230 || 
|-
| sub_1401AE3A0 || 
|-
| sub_1401AE730 || 
|-
| sub_1401AE8A0 || 
|-
| sub_1401B4210 || 
|-
| sub_1401B7270 || 
|-
| sub_1401B7450 || 
|-
| sub_1401B8100 || 
|-
| sub_1401B8150 || 
|-
| sub_1401B8250 || 
|-
| sub_1401975F0 || 
|-
| sub_1401976A0 || 
|-
| sub_140191D10 || 
|-
| sub_140192000 || 
|-
| sub_1401ACE20 || 
|-
| deleted || 
|-
| deleted || 
|-
| deleted || 
|-
| sub_1401A8EF0 || 
|-
| sub_1401A8F20 || 
|-
| sub_1401A9000 || 
|-
| sub_1401A9080 || 
|-
| sub_1401AE0C0 || 
|-
| sub_1401B4500 || 
|-
| sub_1401AE6B0 || 
|-
| sub_140195C90 || 
|-
| sub_140193A80 || 
|-
| sub_1401B55D0 || 
|-
| sub_1401977A0 || 
|-
| sub_1401A2EE0 || 
|-
| sub_1401A34C0 || 
|-
| sub_1401B7470 || 
|-
| sub_1401B7530 || 
|-
| sub_1401B75B0 || 
|-
| sub_1401C1E10 || 
|-
| sub_140190D30 || 
|-
| sub_1401ADC20 || 
|-
| sub_140190A90 || 
|-
| sub_14018FA80 || 
|-
| sub_140198720 || 
|-
| sub_1401B4550 || 
|-
| sub_1401B45C0 || 
|-
| sub_1401B4650 || 
|-
| sub_1401B4660 || 
|-
| sub_1401BED00 || 
|-
| sub_1401BED30 || 
|-
| sub_1401BEDC0 || 
|-
| sub_1401BEDE0 || 
|-
| sub_140194530 || 
|-
| sub_1401BEE40 || 
|-
| sub_1401BEE50 || 
|-
| sub_1401978E0 || 
|-
| sub_1401ACE90 || 
|-
| sub_1401B8370 || 
|-
| sub_1401B8390 || 
|-
| sub_140191CD0 || 
|-
| sub_1401AAE20 || 
|-
| sub_1401AAE10 || 
|-
| sub_1401AAC00 || 
|-
| sub_1401AAC70 || 
|-
| sub_1401AACE0 || 
|-
| sub_1401AAE30 || 
|-
| sub_1401AAE70 || 
|-
| sub_1401AAEA0 || 
|-
| sub_140195DB0 || 
|-
| sub_1401B78D0 || 
|-
| sub_1401B7C00 || 
|-
| sub_140193C00 || 
|-
| sub_1401B7620 || 
|-
| sub_140194D20 || 
|-
| sub_140193D00 || 
|-
| sub_1401962B0 || 
|-
| sub_1401B7770 || 
|-
| sub_1401ABF20 || 
|-
| sub_1401AC1E0 || 
|-
| deleted || 
|-
| sub_1401AE9A0 || 
|-
| sub_1400A9420 || 
|-
| sub_1400A9430 || 
|-
| sub_1400A9440 || 
|-
| sub_1400A9450 || 
|-
| sub_1400A9460 || 
|-
| sub_1400A9470 || 
|-
| sub_1400A9480 || 
|-
| sub_1400A94A0 || 
|-
| ... || 
|}

== Function Set (140A4F1F0) ==
{| class="wikitable"
|-
! Function !! Description 
|-
| sub_140191580 || 
|-
| sub_1401915C0 || 
|-
| sub_1401A8DC0 || 
|-
| sub_1401A8E60 || 
|-
| sub_14000F380 || 
|-
| sub_14000F380 || 
|-
| sub_1401A9240 || 
|-
| sub_1401A92A0 || 
|-
| sub_1401A9440 || 
|-
| sub_1401A9460 || 
|-
| sub_1401A9470 || 
|-
| sub_1401A94D0 || 
|-
| sub_1401916A0 || 
|-
| sub_1401916A0 || 
|-
| sub_1401A91D0 || 
|-
| sub_1401A9200 || 
|-
| sub_140196560 || 
|-
| sub_140196760 || 
|-
| sub_1401A9190 || 
|-
| sub_1401A91B0 || 
|-
| sub_1401966A0 || 
|-
| sub_140196760 || 
|-
| sub_1401A9520 || 
|-
| sub_1401A9570 || 
|-
| sub_1401A9590 || 
|-
| sub_1401A95C0 || 
|-
| sub_1401A9150 || 
|-
| sub_1401A9170 || 
|-
| sub_1401A94D0 || 
|-
| sub_1401A9470 || 
|-
| sub_1401A9240 || 
|-
| sub_1401A92A0 || 
|-
| sub_1401A9240 || 
|-
| sub_1401A92A0 || 
|-
| sub_1401A92C0 || 
|-
| sub_1401A9380 || 
|-
| sub_1401A9B50 || 
|-
| sub_1401A9BB0 || 
|-
| sub_1401A9460 || 
|}

== Function Set (140554210) ==
{| class="wikitable"
|-
! Function !! Description 
|-
| sub_14019F120 ||
|-
| sub_14019F3D0 ||
|-
| sub_14019F330 ||
|-
| sub_1401A1EB0 ||
|-
| sub_1401A1F20 ||
|-
| sub_1401A1F90 ||
|-
| sub_14006D3F0 ||
|-
| sub_14000F380 ||
|}

'''
SCN3 DECOMPILED SCRIPT — Hazuki Residence (JOMO)
=========================================================
Recovered from MAPINFO.BIN  |  Phase 4: Rosetta Stone

Naming conventions derived from:
  - Leaked SEQCONV.C (Disc 4, SCENE/99/MS08)
  - Wulinshu SCN3 documentation
  - Memory Addresses (SM1).md
  - mapids-sm1.md area ID table
'''
from scn3_runtime import *

ctx = SCN3Context()
global_flags = {}  # FLAG_STORY_PROGRESS, FLAG_TIME_OF_DAY, etc.
local_vars = {}

    goto label_000860e1  # 0x00088b69
    if not (ctx.r14): goto label_0008b8b6  # 0x00088b6d
    goto label_0008dc02  # 0x00088b75
    goto label_0008b8ce  # 0x00088b85
    goto label_0008ebe1  # 0x00088b9b
    goto label_000870cc  # 0x00088b9f

def label_00088ba2():
    entity_setup(6)  # 0x00088ba3
    entity_setup(0x8ad5, 141, 11, 0, PACKED(0xd566, set_position_snap), 6)  # 0x00088bb7

def label_00088bc1():

def label_00088bce():
    if not (ctx.r14): goto label_000872de  # 0x00088bdb
    entity_init(0x8ad5, 141, 11, 0, (0x2d46e400 < 0x8ad5), 11, 0, PACKED(entity_activate, entity_init), 6)  # 0x00088bdf
    goto label_0008b94e  # 0x00088be5
    if not (ctx.r14): goto label_0008b962  # 0x00088be9
    entity_init(215, 6)  # 0x00088bef
    entity_set_anim(45, 0x762d)  # 0x00088bf7
    goto label_0008e284  # 0x00088c04

def label_00088c09():
    goto label_0008b956  # 0x00088c0d
    goto label_0008b964  # 0x00088c1b
    entity_setup((45 >= 213), 141, 11, 0, PACKED(entity_activate_ex, entity_init), 6)  # 0x00088c31
    goto label_00088bc1  # 0x00088c35
    set_rotation(141, 11, 0, 6)  # 0x00088c43
    if not (ctx.r14): goto label_00088ca1  # 0x00088c55
    set_position((0 >= 0), 141, 11, 0, PACKED(set_rotation_ex, set_position_ex))  # 0x00088c59
    goto label_00088cc7  # 0x00088c5f
    set_scale()  # 0x00088c61
    set_visibility()  # 0x00088c65
    set_position(6)  # 0x00088c69
    goto label_00088cd7  # 0x00088c6f
    entity_link()  # 0x00088c71
    entity_set_attrs(ID_-F-V)  # 0x00088c79
    goto label_00088c09  # 0x00088c7d
    ext_trigger(141, 11, 0)  # 0x00088c86
    goto label_000871a3  # 0x00088c89
    entity_setup(6)  # 0x00088c8d

def label_00088ca1():
    entity_setup((0 >= 0), 141, 11, 0, PACKED(entity_enable, entity_init), 6)  # 0x00088ca1
    entity_setup(mobj_op(0x8d508ad5), 11, 0, PACKED(entity_activate_ex, entity_init_ex), 6)  # 0x00088cb5
    voice(0x8d508ad5, [])  # 0x00088cb8
    if not (9): goto label_0008ba12  # 0x00088cc9
    entity_set_attrs(11, 0, PACKED(entity_deactivate, entity_cleanup))  # 0x00088ccd
    goto label_8d5917aa  # 0x00088cd0

def label_00088cd7():
    goto label_e70b631b  # 0x00088ce5
    entity_setup(6)  # 0x00088ceb
    rotate_to_target(0x762d)  # 0x00088cf1
    goto label_0008ed49  # 0x00088d03
    ext_configure(ctx.r14, 42)  # 0x00088d0a
    goto label_e7097316  # 0x00088d11
    entity_setup(6)  # 0x00088d17
    set_orient(0x762d)  # 0x00088d1d
    ctx.select("0x7d")  # 0x00088d28
    goto label_8808ed79  # 0x00088d31
    ctx.select("0x23d1")  # 0x00088d38
    voice(0x174ff, [(0 > 3), 0, 1, 11, 9, GREET_GENERIC])  # 0x00088d66
    if not (0x75000001): goto label_00088dec  # 0x00088d80
    ext_fire_event(0xca19, 1, 0x2dc0ce1d, ref("0xc073"), 0)  # 0x00088d8d

def label_00088d8f():
    ctx.mobj ^= 0  # 0x00088d90
    entity_get_flags()  # 0x00088d91
    set4_0xc0000001(205, 0, 0x17941c6)  # 0x00088da4
    voice(204, [6, 69, 5, ctx.mobj.read32()])  # 0x00088db4
    goto label_0008bb0a  # 0x00088dc1
    goto label_0008de53  # 0x00088dc5
    ctx.mobj &= (0xc801 > 0)  # 0x00088dd6

def label_00088dd9():
    entity_setup(0, 11, (~1), 3, 4, DLG_HOUSE_0x101, 6)  # 0x00088df1

def label_00088df5():
    goto label_00088d81  # 0x00088df5
    ext_place_model_at(141, 11, 0, 0x8b078800, 0, ref("THDS7G1G.MT5"))  # 0x00088e0c
    goto label_0008bb5e  # 0x00088e15
    goto label_0008dea7  # 0x00088e19

def label_00088e25():
    ctx.mobj &= (0xc801 > 0)  # 0x00088e2a

def label_00088e3a():
    goto label_00087448  # 0x00088e43
    entity_setup(6)  # 0x00088e47
    goto label_00088dd9  # 0x00088e4d
    ext_configure(141, 11, 0xd14c5481)  # 0x00088e5c
    goto label_00088e63  # 0x00088e5f

def label_00088e63():
    entity_setup(6)  # 0x00088e63
    goto label_00088df5  # 0x00088e69
    if not (0): goto label_0008bbc2  # 0x00088e79
    goto label_00088e0d  # 0x00088e81
    if not (ctx.r14): goto label_d148e61b  # 0x00088e95
    ext_place_model_cfg(141, 11, PACKED(entity_activate_cfg, entity_init), ctx.r14, 65, ref("BHKI2B2G.MT5"))  # 0x00088e9a
    set7_0x5481(6)  # 0x00088e9d
    set7_0x5581()  # 0x00088ea5
    set_scale_uniform()  # 0x00088ead
    entity_set_attrs(ID_-F-V)  # 0x00088eb5
    set4_0x90103d1()  # 0x00088eb8
    ext_trigger()  # 0x00088ebe
    goto label_d142e54d  # 0x00088ec7
    ext_place_model_raw()  # 0x00088ecc
    goto label_2d4f73ef  # 0x00088ee9
    move_along_path(45, 11, 0, 6)  # 0x00088eff
    goto label_00086437  # 0x00088f0f
    entity_setup(6)  # 0x00088f13
    ctx.select("0x46d6")  # 0x00088f26

def label_00088f2a():
    goto label_0008dfbc  # 0x00088f2f
    entity_setup((0 < 0), 11, PACKED(set_orient_ex, entity_init_type), 6)  # 0x00088f3f
    goto label_d127e4d9  # 0x00088f53
    ext_load_model()  # 0x00088f58
    if not (0): goto label_0008765e  # 0x00088f5b
    entity_setup(6)  # 0x00088f5f
    ctx.select("0x7d")  # 0x00088f70
    goto label_8808efc1  # 0x00088f79
    entity_get_dist()  # 0x00088f7e
    set4_0xe2000001(ref("THDS7G1G.MT5"))  # 0x00088f88
    entity_noop(10, 15, 13, 15)  # 0x00088f94
    set6_0xccfdff(1, 11, 9, 186)  # 0x00088fae
    ctx.select("0xcd")  # 0x00088fd4
    goto label_0008bd26  # 0x00088fdd
    goto label_0008e06f  # 0x00088fe1
    ctx.mobj &= (0xc801 > 0)  # 0x00088ff2

def label_00088ff5():

def label_00088ff7():
    goto label_0008bd54  # 0x0008900b
    goto label_00088f9d  # 0x00089011
    ext_place_model_at(141, 11, 0, 0x8b078800, 0, ref("THDS7G1G.MT5"))  # 0x00089028
    entity_activate(6)  # 0x00089033
    ctx.mobj &= (0xc801 > 0)  # 0x00089046
    goto label_00087662  # 0x0008905f
    entity_setup(6)  # 0x00089063
    goto label_00088ff5  # 0x00089069
    entity_set_collider(0x349ce400, 6)  # 0x00089079

def label_0008907c():
    goto label_0008f0cf  # 0x00089089
    ctx.mobj |= 0  # 0x0008908c

def label_00089093():
    goto label_2d5ebdde  # 0x00089093
    goto label_0008e126  # 0x00089099
    entity_setup((0 < 0), 11, 0, PACKED(entity_activate, entity_init), 6)  # 0x000890a9
    set4_0x8d508ad5()  # 0x000890ac
    goto label_0008b510  # 0x000890bd
    scnf_init_batch(96)  # 0x000890c2
    goto label_245975ca  # 0x000890c5
    set2_0x9ce4(96)  # 0x000890cc
    voice(0x9ce4, [36, 96])  # 0x000890d6
    goto label_245975de  # 0x000890d9
    set3_0x9ce4(96)  # 0x000890e0
    goto label_245975e8  # 0x000890e3
    goto label_0008c58a  # 0x000890eb
    goto label_0008b544  # 0x000890ef
    goto label_00089093  # 0x000890f5
    goto label_245975fc  # 0x000890f7
    goto label_0008c59e  # 0x000890ff
    goto label_0008b556  # 0x00089103
    goto label_0008c5a8  # 0x00089109

def label_0008910c():
    goto label_0008b560  # 0x0008910d
    goto label_0008c5b2  # 0x00089113
    goto label_0008b56a  # 0x00089117
    goto label_0008c5bc  # 0x0008911d
    goto label_0008b574  # 0x00089121
    goto label_0008910c  # 0x00089126
    goto label_2459762e  # 0x00089129
    ctx.select("0xe4")  # 0x00089130
    goto label_24597638  # 0x00089133

def label_0008913a():
    scnf_init_entity(96)  # 0x0008913a
    goto label_245b7642  # 0x0008913d
    ext_init_entity(96)  # 0x00089144
    goto label_0008b59c  # 0x00089149
    set7_0xe4(96)  # 0x0008914e
    goto label_24597656  # 0x00089151
    goto label_24597660  # 0x0008915b
    ctx.select("0x9ce4")  # 0x00089162

def label_00089166():
    goto label_0008b5bc  # 0x00089167
    goto label_00082e53  # 0x0008916c

def label_0008916f():
    goto label_24597674  # 0x0008916f
    goto label_00082e5d  # 0x00089176
    goto label_2459767e  # 0x00089179
    if not (1): goto label_00082e67  # 0x00089180
    goto label_24597688  # 0x00089183
    set4_0x24000001((float(96) > 67), ref("THDS7G1G.MT5"))  # 0x00089198
    ctx.mobj.write8(0)  # 0x000891a0
    ctx.select("TTMS246G.MT5")  # 0x000891a8
    goto label_e508befc  # 0x000891b1
    goto label_000877d8  # 0x000891d5
    goto label_0008916f  # 0x000891e3
    goto label_0008f239  # 0x000891f3
    ctx.mobj |= 0  # 0x000891f6
    goto label_0008c64c  # 0x000891f9
    goto label_604bf649  # 0x000891fd
    goto label_c70892de  # 0x0008920c

def label_00089216():
    goto label_e508bf68  # 0x0008921d
    goto label_0008e2bf  # 0x00089231

def label_0008923c():

def label_00089242():
    ctx.mobj &= (0xc801 > 0)  # 0x00089242
    ctx.mobj |= mobj_op(0)  # 0x00089268
    goto label_0008c6be  # 0x0008926b
    goto label_8808f2b7  # 0x0008926f
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008927c
    goto label_2459778a  # 0x00089283
    goto label_2459779c  # 0x00089297
    ctx.mobj |= 96  # 0x0008929e
    goto label_0008c6f4  # 0x000892a1
    goto label_8808f2ed  # 0x000892a5
    goto label_000877be  # 0x000892b9
    if not (ref("THDS7G1G.MT5")): goto label_000879c3  # 0x000892bd
    entity_setup(6)  # 0x000892c1
    set_facing(0x762d)  # 0x000892c7
    ctx.select("0x7d")  # 0x000892d2
    goto label_000867e0  # 0x000892d5
    if not (ctx.r14): goto label_0008c022  # 0x000892d9
    voice(32.000f, [(45 >= 0x512d), 141, 11, DLG_HOUSE_0x103, 0])  # 0x000892f8
    goto label_00087806  # 0x00089301
    if not (ctx.r14): goto label_00087a0b  # 0x00089305
    entity_setup(6)  # 0x00089309
    set_tilt(0x762d)  # 0x0008930f
    ctx.select("0x7d")  # 0x0008931a
    goto label_00086902  # 0x0008931d
    if not (ctx.r14): goto label_0008c06a  # 0x00089321
    goto label_0008e3b6  # 0x00089329
    if not (ctx.r14): goto label_0008c082  # 0x00089339
    goto label_0008e3ce  # 0x00089341
    if not (ctx.r14): goto label_0008c09a  # 0x00089351
    goto label_0008e3e6  # 0x00089359
    if not (ctx.r14): goto label_0008c0b2  # 0x00089369
    goto label_0008e3fe  # 0x00089371
    if not (ctx.r14): goto label_00087a89  # 0x00089381
    entity_setup(PACKED(entity_activate_ex, entity_init), 0, 6)  # 0x00089385
    ctx.select("0x7d")  # 0x00089396
    goto label_0008939b  # 0x00089399

def label_0008939b():
    goto label_0008c0e4  # 0x0008939b
    entity_setup(45, 0x8d508ae5, 11, 0, PACKED(0xe502, 0xd4c3), 6)  # 0x000893b1
    entity_setup(0, PACKED(0xe508, entity_init_ex), 6)  # 0x000893c7
    goto label_0008e45a  # 0x000893cd
    if not (ctx.r14): goto label_0008c126  # 0x000893dd
    rot_align_normal((0 < 0), 11, 45)  # 0x000893e3
    entity_set_attrs((0 >= 0), 141, 11, 0x2d46e400, ref("SWORD_HILT"), 0x2d46e4ff, ref("SWORD_HILT"))  # 0x00089411
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089429
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089441
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089459
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089471
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089489
    goto label_0008e51a  # 0x0008948d
    entity_set_attrs((0 < 0), 11)  # 0x000894a1

def label_000894ab():
    entity_setup((0 >= 229), 141, 11, PACKED(0xe517, entity_init), 6)  # 0x000894b7

def label_000894ba():
    goto label_0008e54a  # 0x000894bd
    scnf_activate((0 < 0), 11)  # 0x000894ca
    entity_set_attrs()  # 0x000894d1
    entity_set_attrs((0 >= 229), 141, 11)  # 0x000894e9
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089501
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089519
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089531
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089549
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089561
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089579
    entity_set_attrs((0 >= 229), 141, 11)  # 0x00089591
    entity_set_attrs((0 >= 229), 141, 11)  # 0x000895a9
    goto label_2d5ec30a  # 0x000895bf
    goto label_2d5ec322  # 0x000895d7
    goto label_0008e66a  # 0x000895dd
    goto label_2d5ec33a  # 0x000895ef
    goto label_0008e682  # 0x000895f5
    ext_load_model((0 < 0), 11, 0)  # 0x00089606
    entity_setup(6)  # 0x00089609
    goto label_0008e69a  # 0x0008960d
    goto label_2d5ec36a  # 0x0008961f
    goto label_0008e6b2  # 0x00089625
    set7_0x2ed6((0 < 0), 11, 0, PACKED(0xd52d, 0xd42c))  # 0x00089634
    entity_init_model()  # 0x00089639
    set7_0x66d5(45)  # 0x0008963e
    entity_set_state()  # 0x00089641
    entity_setup(6)  # 0x00089645
    set3_0x3d1()  # 0x00089648
    scnf_trigger()  # 0x0008964e
    goto label_0008677e  # 0x00089651
    goto label_0008e6ea  # 0x0008965d
    goto label_2d5ec3ba  # 0x0008966f
    goto label_0008e702  # 0x00089675
    goto label_0008e713  # 0x00089685
    ctx.mobj &= (0xc801 > 0)  # 0x00089696
    voice(0x64000003, [0, 11, (~1), (3 <f 48), 0])  # 0x000896a8

def label_000896c9():
    ctx.mobj //= 67  # 0x000896c9
    set4_0xfc9762ff((3 <f 3), 1, 1, 11, 9)  # 0x000896ca
    goto label_0c47b03b  # 0x000896ec
    ctx.select("0x3c7cfff9")  # 0x000896f9

def label_000896fe():
    ctx.select("TKNH4R1G.MT5")  # 0x00089700
    goto label_0008e799  # 0x0008970b
    ctx.mobj &= (0xc801 > 0)  # 0x0008971c
    ext_configure(0, 11, (~1), 3, 4, 0xd10d5481)  # 0x0008972c
    goto label_0008c478  # 0x0008972f
    goto label_0008e7d4  # 0x00089745
    if not (0): goto label_000897cc  # 0x0008975c
    if not (ctx.r14): goto label_0008b998  # 0x00089768
    ext_place_model_offset((0 < 0), 11, 0, 0xb4d26, 127, mobj_op(0), 13)  # 0x0008976c
    goto label_0008cc60  # 0x00089771
    goto label_00087d7c  # 0x00089775
    if not (ctx.r14): goto label_0008364b  # 0x00089778
    entity_setup(0, 6)  # 0x0008977d
    set_tilt(0x762d)  # 0x00089783
    goto label_0008f7db  # 0x00089795
    goto label_0008cc88  # 0x00089799
    ctx.select("0xbf55")  # 0x0008979c
    if not (ctx.r14): goto label_0008bd0b  # 0x0008979f
    goto label_0008cc96  # 0x000897a7
    ctx.select("0xdb55")  # 0x000897aa
    if not (ctx.r14): goto label_00089818  # 0x000897ad
    goto label_0008bc04  # 0x000897af
    goto label_0008cca4  # 0x000897b5
    ctx.select("0x4055")  # 0x000897b8
    if not (ctx.r14): goto label_0008bd29  # 0x000897bb
    ctx.select("0x154")  # 0x000897c2
    goto label_00087dd6  # 0x000897c5

def label_000897cc():
    entity_setup(int(mobj_op(208)), 0, 6)  # 0x000897cd
    rot_set_limits(0x762d)  # 0x000897d3
    ctx.select("0x7d")  # 0x000897de
    goto label_0008ccd0  # 0x000897e1

def label_000897e4():
    goto label_00087dec  # 0x000897e5
    ctx.select("0x9e")  # 0x000897e9
    entity_setup(0, 6)  # 0x000897ed
    rot_set_constraint(0x762d)  # 0x000897f3
    goto label_0008f84b  # 0x00089805
    goto label_0008ccf8  # 0x00089809
    ctx.select("0xbf55")  # 0x0008980c
    if not (ctx.r14): goto label_0008bd7b  # 0x0008980f

def label_00089818():
    ext_entity_config(36, 96)  # 0x00089818
    if not (ctx.r14): goto label_00089888  # 0x0008981d
    goto label_0008bc74  # 0x0008981f
    goto label_0008cd14  # 0x00089825
    ctx.select("0xbd55")  # 0x00089828
    if not (ctx.r14): goto label_00089898  # 0x0008982b
    goto label_0008bc82  # 0x0008982d
    ctx.select("0xe54")  # 0x00089832
    if not (ctx.r14): goto label_000868f0  # 0x00089837
    entity_setup(int(96), 0, 6)  # 0x0008983d
    rot_face_player(0x762d)  # 0x00089843
    ctx.select("0x7d")  # 0x0008984e
    goto label_0008cd40  # 0x00089851
    sm_entity_op()  # 0x00089854
    if not (ctx.r14): goto label_00086908  # 0x00089857
    entity_setup(int(0), 0, 6)  # 0x0008985d
    rot_face_camera(0x762d)  # 0x00089863
    goto label_0008f8bb  # 0x00089875
    goto label_0008cd68  # 0x00089879
    ctx.select("0xbf55")  # 0x0008987c
    if not (ctx.r14): goto label_0008bdeb  # 0x0008987f

def label_00089888():
    ext_entity_config(36, 96)  # 0x00089888
    if not (ctx.r14): goto label_000898f8  # 0x0008988d
    goto label_0008bce4  # 0x0008988f
    goto label_0008cd84  # 0x00089895

def label_00089898():
    ctx.select("0xa155")  # 0x00089898
    if not (ctx.r14): goto label_00089908  # 0x0008989b
    goto label_0008bcf2  # 0x0008989d
    ctx.select("0x1b54")  # 0x000898a2
    goto label_00087eb6  # 0x000898a5
    ctx.select("0x9e")  # 0x000898a9
    rot_lerp_speed(0, 6, 45, 0x762d)  # 0x000898b3
    ctx.select("0x7d")  # 0x000898be
    goto label_0008cdb0  # 0x000898c1
    scnf_camera_shake()  # 0x000898c4
    if not (ctx.r14): goto label_0008695c  # 0x000898c7
    entity_setup(int(0), 0, 6)  # 0x000898cd
    rot_lerp_start(0x762d)  # 0x000898d3
    goto label_0008f92b  # 0x000898e5
    ext_entity_config()  # 0x000898ea
    if not (ctx.r14): goto label_0008be5b  # 0x000898ef
    goto label_0008cde6  # 0x000898f7
    ctx.select("0x8755")  # 0x000898fa
    if not (ctx.r14): goto label_00089968  # 0x000898fd
    goto label_0008bd54  # 0x000898ff
    goto label_0008cdf4  # 0x00089905

def label_00089908():
    ctx.select("0x8555")  # 0x00089908
    if not (ctx.r14): goto label_00089978  # 0x0008990b
    goto label_0008bd62  # 0x0008990d
    ctx.select("0x2854")  # 0x00089912
    goto label_00087f26  # 0x00089915
    ctx.select("0x9e")  # 0x00089919
    entity_setup(0, 6)  # 0x0008991d
    set_rot_pivot(0x762d)  # 0x00089923
    goto label_76ee9e1e  # 0x00089934
    ctx.select("0x9e")  # 0x00089939
    entity_setup(0, 6)  # 0x0008993d
    set_rot_z(0x762d)  # 0x00089943
    goto label_0008f99b  # 0x00089955
    goto label_0008ce48  # 0x00089959
    ctx.select("0xbf55")  # 0x0008995c
    if not (ctx.r14): goto label_0008becb  # 0x0008995f
    goto label_0008ce56  # 0x00089967
    ctx.select("0x6b55")  # 0x0008996a
    if not (ctx.r14): goto label_000899d8  # 0x0008996d
    goto label_0008bdc4  # 0x0008996f
    goto label_0008ce64  # 0x00089975

def label_00089978():
    ctx.select("0x4055")  # 0x00089978
    if not (ctx.r14): goto label_0008bee9  # 0x0008997b
    ctx.select("0x3554")  # 0x00089982
    goto label_00087f96  # 0x00089985
    entity_setup(0x9ed0, 0, 6)  # 0x0008998d
    set_rot_y(0x762d)  # 0x00089993
    goto label_00087fac  # 0x000899a5
    entity_setup(int(208), 0, 6)  # 0x000899ad
    goto label_0008fa0b  # 0x000899c5
    goto label_0008ceb8  # 0x000899c9
    ctx.select("0xbf55")  # 0x000899cc
    if not (ctx.r14): goto label_0008bf3b  # 0x000899cf
    goto label_0008cec6  # 0x000899d7
    ctx.select("0x4f55")  # 0x000899da
    if not (ctx.r14): goto label_00089a48  # 0x000899dd
    goto label_0008be34  # 0x000899df
    goto label_0008ced4  # 0x000899e5
    ctx.select("0x4d55")  # 0x000899e8
    if not (ctx.r14): goto label_00089a58  # 0x000899eb
    goto label_0008be42  # 0x000899ed
    ctx.select("0x4254")  # 0x000899f2
    if not (ctx.r14): goto label_00086a40  # 0x000899f7
    entity_setup(int(96), 0, 6)  # 0x000899fd
    set_rot_x(0x762d)  # 0x00089a03
    ctx.select("0x7d")  # 0x00089a0e
    goto label_0008cf00  # 0x00089a11
    goto label_0008801c  # 0x00089a15
    entity_setup()  # 0x00089a1d
    set_rot_speed(0x762d)  # 0x00089a23

def label_00089a35():
    goto label_0008fa7b  # 0x00089a35
    goto label_0008cf28  # 0x00089a39
    ctx.select("0xbf55")  # 0x00089a3c
    goto label_0008fa99  # 0x00089a43
    goto label_0008cf36  # 0x00089a47
    ctx.select("0x3355")  # 0x00089a4a
    if not (ctx.r14): goto label_00089ab8  # 0x00089a4d
    goto label_0008bea4  # 0x00089a4f
    goto label_0008cf44  # 0x00089a55

def label_00089a58():
    ctx.select("0x3155")  # 0x00089a58
    if not (ctx.r14): goto label_00089ac8  # 0x00089a5b
    goto label_0008beb2  # 0x00089a5d
    ctx.select("0x4f54")  # 0x00089a62
    goto label_00088076  # 0x00089a65
    set2_0x9ed0()  # 0x00089a68
    entity_setup(0, 6)  # 0x00089a6d
    set7_0xd528(0x762d)  # 0x00089a73
    ctx.select("0x7d")  # 0x00089a7e
    goto label_0008cf70  # 0x00089a81
    if not (ctx.r14): goto label_00086aac  # 0x00089a87
    entity_setup(int(229), 0, 6)  # 0x00089a8d

def label_00089a91():
    entity_set_state()  # 0x00089a91
    ctx.select("0x8ad5")  # 0x00089a94
    goto label_0008faeb  # 0x00089aa5
    goto label_0008cf98  # 0x00089aa9
    ctx.select("0xbf55")  # 0x00089aac
    if not (ctx.r14): goto label_0008c01b  # 0x00089aaf

def label_00089ab8():
    ext_entity_config(36, 96)  # 0x00089ab8
    if not (ctx.r14): goto label_00089b28  # 0x00089abd
    goto label_0008bf14  # 0x00089abf
    goto label_0008cfb4  # 0x00089ac5

def label_00089ac8():
    ctx.select("0x1555")  # 0x00089ac8
    if not (ctx.r14): goto label_00089b38  # 0x00089acb
    goto label_0008bf22  # 0x00089acd

def label_00089ad7():
    if not (ctx.r14): goto label_00086ae8  # 0x00089ad7
    entity_setup(96, int(229), 0, 6)  # 0x00089add
    set_heading(0x762d)  # 0x00089ae3
    ctx.select("0x7d")  # 0x00089aee
    goto label_0008cfe0  # 0x00089af1
    if not (ctx.r14): goto label_00086b00  # 0x00089af7
    entity_setup(int(0x4e5), 0, 6)  # 0x00089afd

def label_00089b05():
    goto label_00089a91  # 0x00089b05
    goto label_0008fb71  # 0x00089b2b
    goto label_0008d01e  # 0x00089b2f
    ctx.select("0xbf55")  # 0x00089b32
    if not (ctx.r14): goto label_0008c0a1  # 0x00089b35

def label_00089b38():
    goto label_0008d02c  # 0x00089b3d
    ctx.select("0x2e55")  # 0x00089b40
    if not (ctx.r14): goto label_00089bae  # 0x00089b43
    goto label_0008bf9a  # 0x00089b45
    goto label_0008d03a  # 0x00089b4b
    ctx.select("0x4055")  # 0x00089b4e
    goto label_0008fbab  # 0x00089b55
    ctx.select("0x6954")  # 0x00089b58
    goto label_0008816c  # 0x00089b5b
    scnf_weather()  # 0x00089b5e
    entity_setup(0, 6)  # 0x00089b63
    set7_0xd526(0x762d)  # 0x00089b69
    ctx.select("0x7d")  # 0x00089b74
    goto label_0008d066  # 0x00089b77
    ctx.select("0x9e")  # 0x00089b7f
    entity_setup(0x20e604e5, 0, 6)  # 0x00089b83

def label_00089b86():
    set_look_at(0x762d)  # 0x00089b89
    if not (ctx.r14): goto label_00089bff  # 0x00089b98
    goto label_0008fbe1  # 0x00089b9b
    goto label_0008d08e  # 0x00089b9f
    ctx.select("0xbf55")  # 0x00089ba2
    goto label_0008fbff  # 0x00089ba9

def label_00089bae():
    ext_entity_config()  # 0x00089bae
    if not (ctx.r14): goto label_00089c1e  # 0x00089bb3
    goto label_0008c00a  # 0x00089bb5
    goto label_0008d0aa  # 0x00089bbb
    goto label_0008fc1b  # 0x00089bc5
    ctx.select("0x7654")  # 0x00089bc8
    goto label_000881dc  # 0x00089bcb
    ctx.select("0x9e")  # 0x00089bcf
    entity_setup(0, 6)  # 0x00089bd3
    set_facing(0x762d)  # 0x00089bd9
    ctx.select("0x7d")  # 0x00089be4
    set7_0xd108((0 >= 0), 141, 11, 0, 6)  # 0x00089be9
    if not (ctx.r14): goto label_00089c68  # 0x00089bf8
    trigger_callback(0xe6fff8c4)  # 0x00089c11
    goto label_0e776f96  # 0x00089c14

def label_00089c1e():
    goto label_0008d10e  # 0x00089c1f
    set7_0xd10c(6)  # 0x00089c23
    goto label_0008fc75  # 0x00089c2f
    goto label_0008d122  # 0x00089c33
    goto label_0008fc8f  # 0x00089c39

def label_00089c3f():
    goto label_0008d092  # 0x00089c3f
    goto label_604c008f  # 0x00089c43
    voice(0xf90a7eff, [(0 > (0 == 0)), ref("THDS7G1G.MT5"), 9])  # 0x00089c56

def label_00089c68():
    entity_activate(ref("SWORD_HILT"), 6)  # 0x00089c69

def label_00089c73():
    ctx.mobj &= (0xc801 > 0)  # 0x00089c7c
    voice(0xffff90ff, [0, 11, (~1), 3, 4, DLG_HOUSE_0x102])  # 0x00089c92
    if not (1): goto label_00089d0e  # 0x00089c9e
    if not (ctx.r14): goto label_0008bed0  # 0x00089ca0
    set6_0x36ed37d(13)  # 0x00089ca4
    goto label_0008d198  # 0x00089ca9
    goto label_0008c100  # 0x00089cad
    goto label_00089c3f  # 0x00089cb3
    goto label_8808fd0b  # 0x00089cc3
    goto label_0008d1c8  # 0x00089cd9
    goto label_000882e1  # 0x00089cdd
    entity_setup(6)  # 0x00089ce1
    goto label_00089c73  # 0x00089ce7
    goto label_0008fd3d  # 0x00089cf7
    goto label_0008d247  # 0x00089cfd
    goto label_8808fd49  # 0x00089d01

def label_00089d0e():
    voice(0x9ce4, [(0 > 0), 0, ref("THDS7G1G.MT5"), ctx.mobj.read32()])  # 0x00089d1e
    goto label_24598227  # 0x00089d21
    goto label_00089cfb  # 0x00089d28
    goto label_0008ca78  # 0x00089d2f
    goto label_0008edc1  # 0x00089d33

def label_00089d43():
    ctx.mobj &= (0xc801 > 0)  # 0x00089d44
    voice(0x9ce4, [0, 11, (~1), 3, 4, DLG_DOJO_0x10b])  # 0x00089d56
    goto label_2459825e  # 0x00089d59
    goto label_0008d250  # 0x00089d61
    goto label_0008c1b8  # 0x00089d65
    if not (0): goto label_0008a8c2  # 0x00089d72
    if not (ctx.r14): goto label_00089de6  # 0x00089d76

def label_00089d7d():
    ctx.select("0xfff9")  # 0x00089d7d
    trigger_callback(96, 0x6043, 10, 0xe6fff91e)  # 0x00089d85
    ext_place_model()  # 0x00089d88
    goto label_0008d27c  # 0x00089d8d
    goto label_0008c1e4  # 0x00089d91
    goto label_00089d23  # 0x00089d97
    goto label_8808fdef  # 0x00089da7
    goto label_0008cb08  # 0x00089dbf
    goto label_e61472e8  # 0x00089dd7
    entity_setup(6)  # 0x00089ddd
    goto label_0008ee70  # 0x00089de3

def label_00089de6():
    goto label_255203d0  # 0x00089df5

def label_00089dfa():
    set7_0x1((0 > (0 == 96)), ref("THDS7G1G.MT5"))  # 0x00089e08
    voice(209, [0])  # 0x00089e14
    voice(0x9ce4, [])  # 0x00089e1a
    goto label_24598323  # 0x00089e1d
    if not (ctx.r14): goto label_00089df7  # 0x00089e24

def label_00089e2b():
    goto label_0008cb74  # 0x00089e2b
    goto label_0008eebd  # 0x00089e2f
    ctx.mobj &= (0xc801 > 0)  # 0x00089e40
    voice(0x9ce4, [0, 11, (~1), 3, 4, DLG_DOJO_0x10d])  # 0x00089e52
    goto label_2459835a  # 0x00089e55
    goto label_0008d352  # 0x00089e63
    goto label_0008c2ba  # 0x00089e67
    if not (0): goto label_00089ee8  # 0x00089e78
    scene_transition(96, 0x6043, 0xb4d26, 14)  # 0x00089e7d
    if not (ctx.r14): goto label_0008c0bc  # 0x00089e8c
    ext_place_model(0x36fff91d, 13)  # 0x00089e90
    goto label_0008d384  # 0x00089e95
    goto label_0008c2ec  # 0x00089e99
    goto label_00089e2b  # 0x00089e9f
    goto label_8808fef7  # 0x00089eaf
    goto label_0008cc10  # 0x00089ec7
    goto label_e61473f0  # 0x00089edf
    entity_setup(6)  # 0x00089ee5

def label_00089ee8():
    goto label_0008ef78  # 0x00089eeb
    if not (ctx.r14): goto label_00089f65  # 0x00089efe
    goto label_0008ff57  # 0x00089f01
    voice(209, [(0 > (0 == 0)), ref("THDS7G1G.MT5"), 10, 1, 0])  # 0x00089f1c
    voice(0x9ce4, [])  # 0x00089f22
    goto label_2459842b  # 0x00089f25
    if not (ctx.r14): goto label_00089eff  # 0x00089f2c

def label_00089f33():
    goto label_0008cc7c  # 0x00089f33
    goto label_0008efc5  # 0x00089f37
    ctx.mobj &= (0xc801 > 0)  # 0x00089f48
    voice(0x9ce4, [0, 11, (~1), 3, 4])  # 0x00089f5a
    goto label_24598462  # 0x00089f5d

def label_00089f65():
    goto label_0008d45a  # 0x00089f6b
    goto label_0008c3c2  # 0x00089f6f
    if not (0): goto label_0008aacc  # 0x00089f7c
    if not (ctx.r14): goto label_00089ff0  # 0x00089f80
    ext_transition(96, 0x6043, 6)  # 0x00089f85
    if not (ctx.r14): goto label_0008c1c4  # 0x00089f94
    ext_place_model(0x2efff91c, 0, 13)  # 0x00089f98
    goto label_0008d48c  # 0x00089f9d
    goto label_0008c3f4  # 0x00089fa1
    goto label_00089f33  # 0x00089fa7
    goto label_8808ffff  # 0x00089fb7
    goto label_0008cd18  # 0x00089fcf
    goto label_e61474f8  # 0x00089fe7
    entity_setup(6)  # 0x00089fed

def label_00089ff0():
    goto label_0008f080  # 0x00089ff3
    goto label_255205e0  # 0x0008a005
    voice(209, [(0 > (0 == 96)), ref("THDS7G1G.MT5"), 1, 0])  # 0x0008a024
    voice(0x9ce4, [])  # 0x0008a02a
    goto label_24598533  # 0x0008a02d
    if not (ctx.r14): goto label_0008a007  # 0x0008a034

def label_0008a03b():
    goto label_0008cd84  # 0x0008a03b
    goto label_0008f0cd  # 0x0008a03f
    ctx.mobj &= (0xc801 > 0)  # 0x0008a050
    voice(0x9ce4, [0, 11, (~1), 3, 4, DLG_DOJO_0x10d])  # 0x0008a062
    goto label_2459856a  # 0x0008a065
    goto label_0008d562  # 0x0008a073
    goto label_0008c4ca  # 0x0008a077
    if not (0): goto label_0008a0f8  # 0x0008a088
    scene_transition(96, 0x6043, 0xb4d26)  # 0x0008a091
    if not (ctx.r14): goto label_0008c2cc  # 0x0008a09c
    ext_place_model(13)  # 0x0008a0a0
    goto label_0008d594  # 0x0008a0a5
    goto label_0008c4fc  # 0x0008a0a9
    goto label_0008a03b  # 0x0008a0af
    goto label_0008d50e  # 0x0008a0bb
    goto label_88090107  # 0x0008a0bf
    goto label_0008ce20  # 0x0008a0d7
    if not (ctx.r14): goto label_0008ce3c  # 0x0008a0f3

def label_0008a0f8():
    goto label_0008f188  # 0x0008a0fb
    goto label_255206e8  # 0x0008a10d
    goto label_4108a126  # 0x0008a120
    voice(0x9ce4, [])  # 0x0008a132
    goto label_2459863b  # 0x0008a135
    goto label_0008a10f  # 0x0008a13c
    goto label_0008ce8c  # 0x0008a143
    ctx.mobj &= (0xc801 > 0)  # 0x0008a158
    voice(0x9ce4, [0, 11, (~1), 3, 4, DLG_DOJO_0x10b])  # 0x0008a16a
    goto label_24598672  # 0x0008a16d
    goto label_0008d664  # 0x0008a175
    goto label_0008c5cc  # 0x0008a179
    if not (1): goto label_0008a1fa  # 0x0008a18a
    if not (ctx.r14): goto label_b7089aab  # 0x0008a18c
    ext_transition(96, 0x6043, 0xb4d26)  # 0x0008a191
    voice(0x222de6ff, [])  # 0x0008a196
    goto label_880901f9  # 0x0008a1b1
    goto label_000877e5  # 0x0008a1cb
    scnf_set_scale()  # 0x0008a1ce
    entity_setup(6)  # 0x0008a1d1
    ctx.select("0x7d")  # 0x0008a1de
    goto label_000876f9  # 0x0008a1e1
    if not (0): goto label_000878fa  # 0x0008a1e5
    entity_setup(6)  # 0x0008a1e9
    set7_0xd112(0x762d)  # 0x0008a1ef
    ctx.select("0x7d")  # 0x0008a1f6
    goto label_0008770d  # 0x0008a1f9
    set7_0xd410(ref("0xd6"), ref("0xd7"), 6)  # 0x0008a201
    goto label_0008cf70  # 0x0008a207
    if not (ctx.r14): goto label_0008a283  # 0x0008a20b
    entity_set_anim()  # 0x0008a20d
    goto label_0008f2a2  # 0x0008a215
    ext_trigger((0 < 0), 11, 0)  # 0x0008a21e
    if not (ctx.r14): goto label_0008ad72  # 0x0008a222
    if not (ctx.r14): goto label_0008a296  # 0x0008a226
    set7_0xfff8(1, 6, 75, 218)  # 0x0008a235

def label_0008a23c():
    if not (ctx.r14): goto label_0008a23c  # 0x0008a23c
    if not (3): goto label_0008c478  # 0x0008a248
    ext_place_model(13)  # 0x0008a24c
    goto label_0008d740  # 0x0008a251
    goto label_0008c6a8  # 0x0008a255
    goto label_0008a1e7  # 0x0008a25b
    goto label_880902b3  # 0x0008a26b

def label_0008a283():
    goto label_0008d6d6  # 0x0008a283
    goto label_880902cf  # 0x0008a287

def label_0008a296():
    goto label_346587a4  # 0x0008a29b
    goto label_35a587e4  # 0x0008a2a7
    if not (0): goto label_0008d81c  # 0x0008a2ad
    goto label_2461d814  # 0x0008a2b5
    set6_0x4359ce5()  # 0x0008a2ba
    if not (ctx.r14): goto label_0008d82e  # 0x0008a2bf
    if not (ctx.r14): goto label_0008d91f  # 0x0008a2c5
    goto label_0008d028  # 0x0008a2df
    goto label_e6147808  # 0x0008a2f7
    goto label_0008f390  # 0x0008a303
    goto label_0008d764  # 0x0008a311
    goto label_255208f0  # 0x0008a315

def label_0008a31d():
    goto label_fe08a32e  # 0x0008a328

def label_0008a337():
    goto label_0008a345  # 0x0008a337
    if not (ctx.r14): goto label_0008d082  # 0x0008a339
    goto label_0008f3ce  # 0x0008a341

def label_0008a345():
    goto label_0008a337  # 0x0008a350
    goto label_0009039d  # 0x0008a357
    goto label_0008787d  # 0x0008a36d
    if not (ctx.r14): goto label_00088a77  # 0x0008a371
    entity_setup(0, 6)  # 0x0008a375
    set_facing(0x762d)  # 0x0008a37b
    ctx.select("0x7d")  # 0x0008a386
    goto label_0008888e  # 0x0008a389
    goto label_0008a31d  # 0x0008a391

def label_0008a39f():
    if not (ctx.r14): goto label_0008a3b3  # 0x0008a3b0

def label_0008a3b3():
    goto label_000888ba  # 0x0008a3b5
    entity_setup(6)  # 0x0008a3b9
    goto label_0008a349  # 0x0008a3bd
    ext_load_model(141, 11, 0)  # 0x0008a3ce
    entity_setup(6)  # 0x0008a3d1
    goto label_0008f462  # 0x0008a3d5
    ext_set_property((0 < 0), 11, 0)  # 0x0008a3e2
    goto label_0008c838  # 0x0008a3e5
    if not (ctx.r14): goto label_0008a466  # 0x0008a3f6
    if not (ctx.r14): goto label_0008c630  # 0x0008a400
    ext_place_model(96, ctx.mobj.read32(), 0x6043, 0xb4d26, 0, 13)  # 0x0008a404
    goto label_0008d8f8  # 0x0008a409
    goto label_0008c860  # 0x0008a40d
    goto label_0008a39f  # 0x0008a413
    goto label_8809046b  # 0x0008a423

def label_0008a429():
    if not (ctx.r14): goto label_0008a438  # 0x0008a434

def label_0008a438():
    goto label_0008d184  # 0x0008a43b
    goto label_e6147964  # 0x0008a453
    goto label_0008f4ec  # 0x0008a45f

def label_0008a466():
    goto label_25520a4c  # 0x0008a471

def label_0008a479():

def label_0008a48c():
    goto label_0008a48e  # 0x0008a48c

def label_0008a48e():
    goto label_0008799f  # 0x0008a491
    if not (ctx.r14): goto label_0008d1de  # 0x0008a495
    goto label_0008a493  # 0x0008a4ac
    goto label_000904f9  # 0x0008a4b3
    goto label_000879d9  # 0x0008a4c9
    if not (ctx.r14): goto label_00088bd3  # 0x0008a4cd
    entity_setup(0, 6)  # 0x0008a4d1
    set_facing(0x762d)  # 0x0008a4d7
    ctx.select("0x7d")  # 0x0008a4e2
    goto label_000889ea  # 0x0008a4e5
    entity_setup(6)  # 0x0008a4e9
    goto label_0008a479  # 0x0008a4ed

def label_0008a4f4():

def label_0008a50b():
    if not (ctx.r14): goto label_0008a50f  # 0x0008a50c

def label_0008a50f():
    goto label_00088a16  # 0x0008a511
    entity_setup(6)  # 0x0008a515
    entity_setup((0 >= mobj_op(213)), 141, 11, 0, 0x55815490, ref("BHKI2B2G.MT5"), 6)  # 0x0008a52d
    goto label_0008f5be  # 0x0008a531
    load_resource(0, 0x2d46e400)  # 0x0008a540
    goto label_0008c9a4  # 0x0008a551
    if not (ctx.r14): goto label_0008a5d2  # 0x0008a562
    if not (ctx.r14): goto label_0008c79c  # 0x0008a56c
    ext_place_model(96, 0x6043, 0xb4d26, 0, ctx.mobj.read32(), 13)  # 0x0008a570
    goto label_0008da64  # 0x0008a575
    goto label_0008c9cc  # 0x0008a579
    goto label_0008a50b  # 0x0008a57f

def label_0008a590():
    goto label_0008d2f0  # 0x0008a5a7

def label_0008a5b8():
    goto label_e6147ae1  # 0x0008a5bf
    entity_setup(6)  # 0x0008a5c5
    goto label_0008f658  # 0x0008a5cb

def label_0008a5d2():
    goto label_25520bb8  # 0x0008a5dd
    if not (ctx.r14): goto label_0008a5b8  # 0x0008a5e2
    if not (ctx.r14): goto label_0008d33e  # 0x0008a5e5
    entity_set_attrs(6)  # 0x0008a5e9
    goto label_25520bda  # 0x0008a5ff
    goto label_0008a612  # 0x0008a605
    if not (ctx.r14): goto label_0008d360  # 0x0008a607
    entity_set_attrs(6)  # 0x0008a60b
    goto label_25520bfc  # 0x0008a621

def label_0008a631():
    goto label_00087b57  # 0x0008a649
    if not (ctx.r14): goto label_0008d396  # 0x0008a64d

def label_0008a655():
    goto label_0008f6e2  # 0x0008a655

def label_0008a65d():
    goto label_0008db00  # 0x0008a661
    goto label_000906bd  # 0x0008a667
    goto label_000906b1  # 0x0008a66b
    goto label_00087b91  # 0x0008a681
    if not (ctx.r14): goto label_00088d8b  # 0x0008a685
    entity_setup(0, 6)  # 0x0008a689
    ctx.select("0x7d")  # 0x0008a69a
    goto label_00088ba2  # 0x0008a69d
    entity_setup(6)  # 0x0008a6a1
    goto label_0008a631  # 0x0008a6a5
    if not (ctx.r14): goto label_0008a6c7  # 0x0008a6c4

def label_0008a6c7():
    goto label_00088bce  # 0x0008a6c9
    entity_setup(6)  # 0x0008a6cd
    goto label_0008a65d  # 0x0008a6d1
    goto label_2d5ed42e  # 0x0008a6e3
    goto label_0008f776  # 0x0008a6e9
    goto label_0008cb4c  # 0x0008a6f9
    if not (ctx.r14): goto label_0008a77a  # 0x0008a70a
    ctx.mobj //= 0  # 0x0008a710
    if not (ctx.r14): goto label_0008c944  # 0x0008a714
    ext_place_model(96, ctx.mobj.read32(), 0x6043, 0xb4d26, 13)  # 0x0008a718
    goto label_0008dc0c  # 0x0008a71d
    goto label_0008cb74  # 0x0008a721
    goto label_0008a6b3  # 0x0008a727
    goto label_8809077f  # 0x0008a737
    ctx.mobj >>= ref("THDS7G1G.MT5")  # 0x0008a748
    goto label_0008d498  # 0x0008a74f
    goto label_e6147c78  # 0x0008a767
    entity_setup(6)  # 0x0008a76d
    goto label_0008f800  # 0x0008a773

def label_0008a779():

def label_0008a77a():
    goto label_25520d60  # 0x0008a785

def label_0008a797():
    goto label_0008dc94  # 0x0008a7a5
    goto label_0008cbfc  # 0x0008a7a9
    goto label_0008d4f8  # 0x0008a7af
    goto label_0008cc2a  # 0x0008a7d7
    if not (ctx.r14): goto label_0008b334  # 0x0008a7e4
    if not (ctx.r14): goto label_0008a858  # 0x0008a7e8
    set6_0xf8b8a4ff(96, 3, 0x7d04)  # 0x0008a7ee
    if not (ctx.r14): goto label_0008ca28  # 0x0008a7f8
    goto label_00087b7c  # 0x0008a7fc
    ext_configure(0xe41b)  # 0x0008a802
    goto label_0008cc58  # 0x0008a805
    goto label_0008a797  # 0x0008a80b
    goto label_88090863  # 0x0008a81b
    set6_0x12000001((0 > 0), 0, ref("THDS7G1G.MT5"))  # 0x0008a82c
    goto label_0008a83e  # 0x0008a831
    goto label_0008d57c  # 0x0008a833

def label_0008a83e():
    if not (ctx.r14): goto label_0008d598  # 0x0008a84f

def label_0008a858():
    goto label_25520e44  # 0x0008a869
    set3_0xe4((0 > (0 == 96)), ref("THDS7G1G.MT5"), 0x9d000001)  # 0x0008a888
    ext_set_property()  # 0x0008a88a
    goto label_0008cce0  # 0x0008a88d
    goto label_0008d5dc  # 0x0008a893
    load_resource()  # 0x0008a896

def label_0008a89d():
    if not (ctx.r14): goto label_0008d5f0  # 0x0008a8a7
    goto label_0008f93c  # 0x0008a8af

def label_0008a8c2():
    set7_0xe5((0 < 0), 11, 0x2d46e400, ref("SWORD_HILT"), 0x349ce400)  # 0x0008a8ca
    goto label_00090917  # 0x0008a8d1
    goto label_0008a8ff  # 0x0008a8e4
    voice(0x56ff, [])  # 0x0008a8e6
    goto label_00087dfd  # 0x0008a8ed
    if not (ctx.r14): goto label_00088ff7  # 0x0008a8f1
    entity_setup(0, 6)  # 0x0008a8f5
    set_facing(0x762d)  # 0x0008a8fb

def label_0008a8ff():

def label_0008a901():
    ctx.select("0x7d")  # 0x0008a906
    goto label_00088e0e  # 0x0008a909
    entity_setup(6)  # 0x0008a90d
    goto label_0008a89d  # 0x0008a911
    if not (ctx.r14): goto label_0008a933  # 0x0008a930

def label_0008a933():
    goto label_00088e3a  # 0x0008a935
    set_heading(6)  # 0x0008a93b
    goto label_2d5ed69a  # 0x0008a94f
    goto label_0008f9e2  # 0x0008a955
    if not (ctx.r14): goto label_0008b4b8  # 0x0008a968
    if not (ctx.r14): goto label_0008cba8  # 0x0008a978
    goto label_00087cfc  # 0x0008a97c
    ext_configure(0xe403)  # 0x0008a982
    goto label_0008cdd8  # 0x0008a985
    goto label_0008a998  # 0x0008a98b

def label_0008a98d():
    goto label_0008d6d6  # 0x0008a98d

def label_0008a998():
    goto label_880909ed  # 0x0008a9a5
    ctx.select("0xe4")  # 0x0008a9bc
    ext_set_alpha((0 > 0), 0, ref("THDS7G1G.MT5"), 0)  # 0x0008a9be
    goto label_0008aa15  # 0x0008a9c1
    goto label_00090a19  # 0x0008a9c3
    ctx.select("0xe4")  # 0x0008a9c6
    ext_set_property_ex()  # 0x0008a9c8
    goto label_0008de2a  # 0x0008a9cb

def label_0008a9d6():
    ext_set_property_8(0xe410)  # 0x0008a9d6
    goto label_0008de38  # 0x0008a9d9
    set3_0x532452d5()  # 0x0008a9dc
    ext_set_texture(0xe410)  # 0x0008a9e4

def label_0008a9e8():
    set2_0x562d46d6()  # 0x0008a9e8
    entity_set_attrs()  # 0x0008a9ed
    scnf_activate()  # 0x0008a9f0
    goto label_0008ce56  # 0x0008aa01
    goto label_0008def6  # 0x0008aa07
    goto label_0008de6a  # 0x0008aa0b

def label_0008aa15():
    goto label_0008df04  # 0x0008aa15
    goto label_0008de78  # 0x0008aa19
    goto label_0008ce72  # 0x0008aa1d
    goto label_00088f2a  # 0x0008aa23
    ext_set_material()  # 0x0008aa26
    if not (ctx.r14): goto label_0008aa55  # 0x0008aa29
    entity_setup()  # 0x0008aa2d
    entity_set_lod(0x762d)  # 0x0008aa33
    ctx.select("0x7d")  # 0x0008aa3e
    ctx.select("0xe4")  # 0x0008aa40

def label_0008aa42():
    ext_configure((0 >= 0), 141, 11, 0)  # 0x0008aa42
    goto label_0008ce9a  # 0x0008aa45
    ctx.select("0xe4")  # 0x0008aa4a
    ext_set_property_ex(96)  # 0x0008aa4c
    goto label_0008deae  # 0x0008aa4f

def label_0008aa55():
    goto label_00090aab  # 0x0008aa55
    ctx.select("0xe4")  # 0x0008aa58
    ext_set_property_8()  # 0x0008aa5a
    goto label_0008debc  # 0x0008aa5d
    goto label_0008ceb6  # 0x0008aa61

def label_0008aa69():
    goto label_0008907c  # 0x0008aa69
    ext_scale_entity()  # 0x0008aa6e
    set7_0xd418(6)  # 0x0008aa71
    entity_set_anim(45, 0x762d)  # 0x0008aa79
    voice(213, [])  # 0x0008aa7c
    goto label_0008ab05  # 0x0008aa86
    goto label_00088f8c  # 0x0008aa89
    if not (0): goto label_0008e17c  # 0x0008aa8d
    goto label_0008aa69  # 0x0008aa90
    set7_0xd40f(6)  # 0x0008aa93
    entity_set_anim(45, 0x762d)  # 0x0008aa9b
    goto label_0008ab27  # 0x0008aaa8
    ext_set_property()  # 0x0008aaac
    goto label_0008cf02  # 0x0008aaaf
    ext_trigger(96, 0x6043)  # 0x0008aaba
    if not (ctx.r14): goto label_0008b60c  # 0x0008aabc
    if not (ctx.r14): goto label_0008ab30  # 0x0008aac0

def label_0008aad0():

def label_0008aae2():
    if not (ctx.r14): goto label_0008cd1c  # 0x0008aaec
    ext_place_model(1, ref("0x8f5c4160"), ctx.mobj.read8(), 0x8312, 13)  # 0x0008aaf0
    goto label_0008dfe4  # 0x0008aaf5
    goto label_0008cf4c  # 0x0008aaf9
    goto label_0008aa8b  # 0x0008aaff

def label_0008ab05():
    goto label_88090b57  # 0x0008ab0f
    ctx.select("0xd4")  # 0x0008ab24

def label_0008ab27():
    goto label_0008d870  # 0x0008ab27

def label_0008ab30():
    if not (ctx.r14): goto label_0008d886  # 0x0008ab3d
    if not (ctx.r14): goto label_0008abbf  # 0x0008ab58
    goto label_00090bb1  # 0x0008ab5b
    goto label_0008ab82  # 0x0008ab75
    goto label_0008d8c0  # 0x0008ab77

def label_0008ab82():
    goto label_88090bd7  # 0x0008ab8f
    ctx.select("0x1000000")  # 0x0008aba0
    goto label_000880af  # 0x0008aba5
    if not (ctx.r14): goto label_0008d8f2  # 0x0008aba9
    goto label_0008fc3e  # 0x0008abb1

def label_0008abbf():
    goto label_0008abda  # 0x0008abcd

def label_0008abd1():
    entity_setup(6)  # 0x0008abd1

def label_0008abda():
    goto label_88090c2f  # 0x0008abe7
    goto label_b408abfc  # 0x0008abf4
    goto label_0008e09c  # 0x0008abfd
    goto label_00090c59  # 0x0008ac03
    goto label_00090c4d  # 0x0008ac07
    goto label_0008ac1f  # 0x0008ac1b

def label_0008ac1f():
    set_facing(45, 0x762d)  # 0x0008ac27
    ctx.select("0x7d")  # 0x0008ac32
    goto label_0008913a  # 0x0008ac35
    entity_setup(6)  # 0x0008ac39
    goto label_0008abc9  # 0x0008ac3d
    if not (0): goto label_0008ac5f  # 0x0008ac5c

def label_0008ac5f():
    goto label_00089166  # 0x0008ac61
    entity_setup(6)  # 0x0008ac65
    goto label_0008abf5  # 0x0008ac69
    ctx.mobj |= 0  # 0x0008ac74
    goto label_2d5ed9c6  # 0x0008ac7b
    goto label_0008fd0e  # 0x0008ac81
    goto label_0008d0e4  # 0x0008ac91

def label_0008aca5():
    goto label_0008acb6  # 0x0008aca9
    entity_setup(6)  # 0x0008acad

def label_0008acb6():
    goto label_88090d0b  # 0x0008acc3
    goto label_b408acd8  # 0x0008acd0
    goto label_245b9207  # 0x0008acdb
    goto label_00090d29  # 0x0008ace3
    goto label_00088205  # 0x0008acf5
    if not (ctx.r14): goto label_000893ff  # 0x0008acf9
    entity_setup(0, 6)  # 0x0008acfd
    set_facing(0x762d)  # 0x0008ad03
    ctx.select("0x7d")  # 0x0008ad0e
    goto label_00089216  # 0x0008ad11
    entity_setup(6)  # 0x0008ad15
    goto label_0008aca5  # 0x0008ad19
    if not (ctx.r14): goto label_0008ad3b  # 0x0008ad38

def label_0008ad3b():
    goto label_00089242  # 0x0008ad3d
    entity_setup(6)  # 0x0008ad41
    goto label_0008acd1  # 0x0008ad45
    goto label_2d5edaa2  # 0x0008ad57

def label_0008ad5d():
    goto label_0008fdea  # 0x0008ad5d
    ext_set_property((0 < 0), 11, 0)  # 0x0008ad6a
    goto label_0008d1c0  # 0x0008ad6d

def label_0008ad72():

def label_0008ad7d():
    goto label_0008e224  # 0x0008ad85
    goto label_00090de1  # 0x0008ad8b
    goto label_00090dd5  # 0x0008ad8f
    goto label_000882b1  # 0x0008ada1
    if not (0): goto label_000894ab  # 0x0008ada5
    entity_setup(0, 6)  # 0x0008ada9
    set_facing(0x762d)  # 0x0008adaf
    ctx.select("0x7d")  # 0x0008adba
    goto label_000892c2  # 0x0008adbd
    entity_setup(6)  # 0x0008adc1
    goto label_0008ad51  # 0x0008adc5
    if not (ctx.r14): goto label_0008ade7  # 0x0008ade4

def label_0008ade7():
    goto label_000892ee  # 0x0008ade9
    entity_setup(6)  # 0x0008aded
    goto label_0008ad7d  # 0x0008adf1
    goto label_2d5edb4e  # 0x0008ae03
    goto label_0008fe96  # 0x0008ae09
    goto label_0008d26c  # 0x0008ae19
    if not (ctx.r14): goto label_0008ae9a  # 0x0008ae2a
    voice(205, [96, 0x6043, 0xb4d26, 0])  # 0x0008ae30
    if not (ctx.r14): goto label_0008d064  # 0x0008ae34
    ext_place_model(13)  # 0x0008ae38
    goto label_0008e32c  # 0x0008ae3d
    goto label_0008d294  # 0x0008ae41
    goto label_0008add3  # 0x0008ae47
    goto label_88090e9f  # 0x0008ae57
    scnf_camera_cut((0 > 0), 0, ref("THDS7G1G.MT5"))  # 0x0008ae68
    goto label_0008ae7a  # 0x0008ae6d
    goto label_0008dbb8  # 0x0008ae6f

def label_0008ae7a():
    if not (ctx.r14): goto label_0008dbce  # 0x0008ae85
    goto label_0008ff1a  # 0x0008ae8d

def label_0008ae9a():
    if not (ctx.r14): goto label_0008af01  # 0x0008ae9a
    goto label_00090ef3  # 0x0008ae9d
    if not (ctx.r14): goto label_0008aeb7  # 0x0008aeb4

def label_0008aeb7():
    goto label_000883cb  # 0x0008aeb9
    if not (ctx.r14): goto label_0008dc06  # 0x0008aebd
    goto label_0008ff52  # 0x0008aec5
    entity_setup((0 < 0), 11, PACKED(0xe50b, 0xd409), 6)  # 0x0008aed5
    goto label_88090f33  # 0x0008aeeb

def label_0008af01():
    goto label_0008af0e  # 0x0008af01
    goto label_0008dc4c  # 0x0008af03

def label_0008af0e():

def label_0008af18():

def label_0008af1d():
    goto label_0008af36  # 0x0008af29
    goto label_0008dc74  # 0x0008af2b

def label_0008af36():
    goto label_0008e3f0  # 0x0008af51
    voice(0x52e5, [])  # 0x0008af54
    goto label_00090fad  # 0x0008af57
    goto label_00090fa1  # 0x0008af5b
    goto label_0008847d  # 0x0008af6d
    if not (ctx.r14): goto label_00089677  # 0x0008af71
    entity_setup(0, 6)  # 0x0008af75
    set_facing(0x762d)  # 0x0008af7b
    ctx.select("0x7d")  # 0x0008af86
    goto label_0008948e  # 0x0008af89
    entity_setup(6)  # 0x0008af8d
    goto label_0008af1d  # 0x0008af91
    if not (ctx.r14): goto label_0008afb3  # 0x0008afb0

def label_0008afb3():
    goto label_000894ba  # 0x0008afb5
    entity_setup(6)  # 0x0008afb9
    scnf_set_rotation()  # 0x0008afbc
    goto label_0008af9f  # 0x0008afcc
    ext_load_model()  # 0x0008afce
    entity_setup(6)  # 0x0008afd1
    goto label_00090062  # 0x0008afd5

def label_0008afdf():
    if not (ctx.r14): goto label_0008dd2e  # 0x0008afe5
    goto label_0009007a  # 0x0008afed
    if not (ctx.r14): goto label_0008dd46  # 0x0008affd
    goto label_00090092  # 0x0008b005
    goto label_0008d468  # 0x0008b015

def label_0008b021():
    set2_0xcd(96, ref("THDS7G1G.MT5"), 0)  # 0x0008b024
    ext_noop(0)  # 0x0008b030
    goto label_00088541  # 0x0008b035
    if not (ctx.r14): goto label_0008dd82  # 0x0008b039
    goto label_000900ce  # 0x0008b041
    if not (ctx.r14): goto label_0008bba4  # 0x0008b054
    if not (ctx.r14): goto label_0008b0c8  # 0x0008b058
    if not (ctx.r14): goto label_0008d290  # 0x0008b060
    ext_place_model_rot(0x640384e3, 3, 0x7d04, 13)  # 0x0008b064
    goto label_0008e558  # 0x0008b069
    goto label_00089671  # 0x0008b06d
    entity_setup(6)  # 0x0008b071
    goto label_0008b003  # 0x0008b077
    goto label_000910cd  # 0x0008b087
    goto label_24599592  # 0x0008b08d
    goto label_0008b021  # 0x0008b095
    goto label_880910ed  # 0x0008b0a5
    ctx.select("MALS501G.MT5")  # 0x0008b0bc
    goto label_000896c9  # 0x0008b0c3

def label_0008b0c8():
    goto label_0008b059  # 0x0008b0cd

def label_0008b0d7():
    goto label_88091127  # 0x0008b0df
    ctx.mobj %= 0  # 0x0008b0f0
    set6_0x4349ce4((0 > 0), 0, ref("THDS7G1G.MT5"))  # 0x0008b0f4
    goto label_0008e558  # 0x0008b0f9

def label_0008b115():
    goto label_650c3604  # 0x0008b11d
    if not (ctx.r14): goto label_0008e77d  # 0x0008b123
    goto label_0008de88  # 0x0008b13f
    goto label_e6148668  # 0x0008b157
    entity_setup(6)  # 0x0008b15d
    goto label_000901f0  # 0x0008b163
    goto label_25521750  # 0x0008b175
    ext_noop((0 > (0 == 96)), (ref("THDS7G1G.MT5") /f mobj_op(3)), 0)  # 0x0008b190
    goto label_0008e634  # 0x0008b195
    sm_entity_op()  # 0x0008b198
    goto label_000911e5  # 0x0008b19f
    goto label_000886c1  # 0x0008b1b1
    set_facing(45, 0x762d)  # 0x0008b1bf
    ctx.select("0x7d")  # 0x0008b1ca
    goto label_000896d2  # 0x0008b1cd
    entity_setup(6)  # 0x0008b1d1

def label_0008b1ef():
    if not (0): goto label_0008b1f7  # 0x0008b1f4

def label_0008b1f7():
    goto label_000896fe  # 0x0008b1f9
    entity_setup(6)  # 0x0008b1fd
    ctx.select("0x1cd1")  # 0x0008b210
    goto label_2d5edf5e  # 0x0008b213
    goto label_000902a6  # 0x0008b219

def label_0008b223():
    if not (ctx.r14): goto label_0008df72  # 0x0008b229
    goto label_000902be  # 0x0008b231
    entity_setup((0 < 0), 11, 6)  # 0x0008b243
    goto label_000902d6  # 0x0008b249
    if not (ctx.r14): goto label_0008dfa2  # 0x0008b259
    goto label_000902ee  # 0x0008b261

def label_0008b279():
    goto label_0008e768  # 0x0008b279
    goto label_0008d6d0  # 0x0008b27d
    if not (ctx.r14): goto label_0008b2fe  # 0x0008b28e
    ext_place_model(96, 0x6043, (0xb4d26 /f 0), 0, 3, 3, 0xf90f)  # 0x0008b2ac
    goto label_0008e7a0  # 0x0008b2b1
    goto label_0008d708  # 0x0008b2b5
    goto label_0008b247  # 0x0008b2bb
    goto label_88091313  # 0x0008b2cb
    goto label_000897e4  # 0x0008b2e1
    entity_setup(6)  # 0x0008b2e7
    goto label_0008b279  # 0x0008b2ed

def label_0008b2fe():
    goto label_88091347  # 0x0008b2ff
    ctx.mobj += 0  # 0x0008b310

def label_0008b312():
    set6_0x4349ce4((0 > 0), 0, ref("THDS7G1G.MT5"))  # 0x0008b314
    goto label_0008e778  # 0x0008b319
    goto label_8809136b  # 0x0008b323

def label_0008b334():
    set2_0xd4((0 > 0), 1)  # 0x0008b334
    goto label_0008e080  # 0x0008b337
    goto label_0008e79e  # 0x0008b34b
    goto label_e6148868  # 0x0008b34f
    entity_setup(6)  # 0x0008b355
    goto label_000903e8  # 0x0008b35b
    goto label_25521948  # 0x0008b36d
    goto label_0008b380  # 0x0008b373
    entity_set_attrs(45, 6)  # 0x0008b379
    goto label_2552196a  # 0x0008b38f
    ctx.mobj |= ref("THDS7G1G.MT5")  # 0x0008b3a0
    goto label_0008e850  # 0x0008b3b1
    goto label_0009140d  # 0x0008b3b7
    goto label_00091401  # 0x0008b3bb
    goto label_000888dd  # 0x0008b3cd
    if not (ctx.r14): goto label_00089ad7  # 0x0008b3d1
    set_facing(0, 6, 45, 0x762d)  # 0x0008b3db
    ctx.select("0x7d")  # 0x0008b3e6
    goto label_000898ee  # 0x0008b3e9
    entity_setup(6)  # 0x0008b3ed
    goto label_0008b37d  # 0x0008b3f1
    if not (ctx.r14): goto label_0008b413  # 0x0008b410

def label_0008b413():
    goto label_0008991a  # 0x0008b415
    entity_setup(6)  # 0x0008b419
    ctx.select("0x1cd1")  # 0x0008b42c
    goto label_000904c2  # 0x0008b435
    if not (ctx.r14): goto label_0008e18e  # 0x0008b445
    goto label_000904da  # 0x0008b44d
    if not (ctx.r14): goto label_0008e1a6  # 0x0008b45d
    goto label_000904f2  # 0x0008b465
    if not (ctx.r14): goto label_0008e1be  # 0x0008b475
    goto label_0009050a  # 0x0008b47d
    goto label_0008d8ec  # 0x0008b499
    if not (ctx.r14): goto label_0008b51a  # 0x0008b4aa

def label_0008b4b8():
    voice(0x222de6ff, [96, 0x6043, 3, 3, 6])  # 0x0008b4c2
    ext_place_model(13)  # 0x0008b4c8
    goto label_0008e9bc  # 0x0008b4cd
    goto label_0008d924  # 0x0008b4d1
    goto label_0008b463  # 0x0008b4d7
    goto label_8809152f  # 0x0008b4e7
    goto label_00089b05  # 0x0008b4ff
    entity_setup(6)  # 0x0008b503
    goto label_0008b495  # 0x0008b509

def label_0008b510():

def label_0008b51a():
    goto label_88091563  # 0x0008b51b
    goto label_00089a35  # 0x0008b531
    entity_setup(6)  # 0x0008b535
    goto label_0008b4c5  # 0x0008b539

def label_0008b544():
    goto label_604be998  # 0x0008b549

def label_0008b556():

def label_0008b560():
    goto label_0008e2ac  # 0x0008b563

def label_0008b56a():
    goto label_e6148a8c  # 0x0008b57b
    entity_setup(6)  # 0x0008b581
    goto label_00090614  # 0x0008b587
    goto label_25521b74  # 0x0008b599

def label_0008b5a7():
    goto label_00088ad6  # 0x0008b5b9

def label_0008b5bc():
    if not (ctx.r14): goto label_0008e306  # 0x0008b5bd
    goto label_00090652  # 0x0008b5c5
    goto label_0008b5a7  # 0x0008b5d4
    if not (ctx.r14): goto label_0008e32a  # 0x0008b5e1

def label_0008b5e9():
    goto label_00090676  # 0x0008b5e9
    if not (ctx.r14): goto label_0008e342  # 0x0008b5f9
    goto label_0009068e  # 0x0008b601

def label_0008b60c():
    goto label_0008eaac  # 0x0008b60d
    set2_0xe5()  # 0x0008b610
    goto label_0009165d  # 0x0008b617

def label_0008b62f():
    goto label_00088b49  # 0x0008b639
    if not (ctx.r14): goto label_00089d43  # 0x0008b63d
    entity_setup(0, 6)  # 0x0008b641
    set_facing(0x762d)  # 0x0008b647
    ctx.select("0x7d")  # 0x0008b652
    goto label_00089b5a  # 0x0008b655
    entity_setup(6)  # 0x0008b659
    goto label_0008b5e9  # 0x0008b65d
    if not (ctx.r14): goto label_0008b67f  # 0x0008b67c

def label_0008b67f():
    goto label_00089b86  # 0x0008b681
    entity_setup(6)  # 0x0008b685
    goto label_2d5ee3e6  # 0x0008b69b
    goto label_0009072e  # 0x0008b6a1
    goto label_0008db04  # 0x0008b6b1
    if not (ctx.r14): goto label_0008b732  # 0x0008b6c2
    set7_0xce(96, 0x6043, 0xb4d26, 0)  # 0x0008b6c8
    if not (ctx.r14): goto label_0008d8fc  # 0x0008b6cc
    ctx.select("0xf6ed37d")  # 0x0008b6d0
    goto label_0008ebc4  # 0x0008b6d5
    goto label_0008db2c  # 0x0008b6d9
    if not (ctx.r14): goto label_0008fa35  # 0x0008b6de
    scnf_camera((96 > 0x8800), ref("THDS7G1G.MT5"))  # 0x0008b6ec
    goto label_0008ebe0  # 0x0008b6f1
    goto label_0008db4a  # 0x0008b6f5
    goto label_0008ebf4  # 0x0008b705
    ctx.mobj |= 0  # 0x0008b708
    goto label_00091761  # 0x0008b70b

def label_0008b70f():
    goto label_0008ebae  # 0x0008b70f
    entity_set_trigger(6)  # 0x0008b713
    goto label_0009177d  # 0x0008b727

def label_0008b72d():
    goto label_0008eb80  # 0x0008b72d

def label_0008b732():
    goto label_55e9db99  # 0x0008b739
    if not (ctx.r14): goto label_0008eca2  # 0x0008b73f
    goto label_880917a9  # 0x0008b761
    ext_configure((0 > 0), ref("THDS7G1G.MT5"), mobj_op(1))  # 0x0008b776
    goto label_00089d7d  # 0x0008b779
    entity_setup(6)  # 0x0008b77d
    goto label_0008b70f  # 0x0008b783
    mem_read(141, 11, 0, 0xe50a6403, 4)  # 0x0008b794
    goto label_00089d9a  # 0x0008b797
    entity_setup(6)  # 0x0008b79b
    goto label_0008b72d  # 0x0008b7a1
    goto label_245b1c8c  # 0x0008b7b1
    goto label_00084290  # 0x0008b7b8
    goto label_e6090dae  # 0x0008b7c9
    goto label_d527dc2f  # 0x0008b7d1
    if not (ctx.r14): goto label_0008e520  # 0x0008b7d7
    goto label_0009086c  # 0x0008b7df
    goto label_25521dcc  # 0x0008b7f1
    goto label_00089dfa  # 0x0008b7f7
    entity_set_attrs(6)  # 0x0008b7ff
    goto label_25521df2  # 0x0008b817
    goto label_0008b82a  # 0x0008b81d
    if not (0): goto label_0008e578  # 0x0008b81f
    entity_set_attrs(6)  # 0x0008b823
    goto label_25521e14  # 0x0008b839
    goto label_0008e5ae  # 0x0008b865
    goto label_0008b83b  # 0x0008b868
    goto label_0008dcc8  # 0x0008b875
    goto label_00088d8f  # 0x0008b87b
    if not (ctx.r14): goto label_0008e5c8  # 0x0008b87f
    goto label_00090914  # 0x0008b887
    goto label_00088da8  # 0x0008b899
    entity_setup(6)  # 0x0008b89d

def label_0008b8b6():
    set2_0xbdfff8a7((0 >= 0), 141, 11, 0, (0xe50154e2 > 52), ref("THDS7G1G.MT5"))  # 0x0008b8c0
    ctx.select("0x92")  # 0x0008b8c8

def label_0008b8ce():
    scnf_camera(11, 6, 84)  # 0x0008b8d0
    goto label_24599ddd  # 0x0008b8d7
    ext_noop(96, ref("THDS7G1G.MT5"))  # 0x0008b8e4
    goto label_00088df3  # 0x0008b8e9
    if not (ctx.r14): goto label_0008e636  # 0x0008b8ed
    goto label_00090982  # 0x0008b8f5
    set6_0x3a000003((0 < 0), 11, DLG_HOUSE_0x102)  # 0x0008b908
    goto label_00088e25  # 0x0008b911
    if not (ctx.r14): goto label_0008e65e  # 0x0008b915
    goto label_000909aa  # 0x0008b91d
    if not (ctx.r14): goto label_0008e676  # 0x0008b92d
    goto label_000909c2  # 0x0008b935
    goto label_88091991  # 0x0008b949

def label_0008b94e():

def label_0008b956():
    set6_0x40000003((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008b958

def label_0008b964():
    goto label_0008ee54  # 0x0008b965
    set_waypoint(6)  # 0x0008b969
    goto label_000919bb  # 0x0008b975
    goto label_880919c9  # 0x0008b981
    ctx.select("0x1efffff6")  # 0x0008b990

def label_0008b998():
    goto label_0008ee88  # 0x0008b999
    set_waypoint(6)  # 0x0008b99d
    if not (ctx.r14): goto label_0008ba0d  # 0x0008b9a6
    goto label_000919ef  # 0x0008b9a9
    goto label_880919fd  # 0x0008b9b5
    voice(0x1effff, [(0 > 0), 0, ref("THDS7G1G.MT5")])  # 0x0008b9c5
    goto label_0008eebc  # 0x0008b9cd
    set_waypoint(6)  # 0x0008b9d1
    goto label_00091a23  # 0x0008b9dd
    goto label_88091a31  # 0x0008b9e9
    set4_0xfffa((0 > 0), 0, ref("THDS7G1G.MT5"))  # 0x0008b9f8
    goto label_0008eef0  # 0x0008ba01
    set_path_target(6)  # 0x0008ba05

def label_0008ba0d():

def label_0008ba12():
    goto label_e609100e  # 0x0008ba23
    goto label_604bde89  # 0x0008ba2b
    goto label_fb08ba2a  # 0x0008ba3c
    set4_0xffff()  # 0x0008ba41
    goto label_0008ef38  # 0x0008ba49
    set_waypoint(6)  # 0x0008ba4d
    if not (ctx.r14): goto label_0008babd  # 0x0008ba56
    goto label_00091a9f  # 0x0008ba59
    goto label_88091aad  # 0x0008ba65
    scnf_play_effect((0 > 0), 0, ref("THDS7G1G.MT5"))  # 0x0008ba74
    goto label_0008ef6c  # 0x0008ba7d
    set_path_node(6)  # 0x0008ba81
    goto label_00091ad3  # 0x0008ba8d
    if not (ctx.r14): goto label_0008f000  # 0x0008ba9d
    goto label_0008efa8  # 0x0008bab9

def label_0008babd():
    set_path_node(6)  # 0x0008babd
    goto label_00091b0f  # 0x0008bac9
    goto label_e60a10c0  # 0x0008bad5
    goto label_604bdf3b  # 0x0008badd
    set6_0xfff0(((0 == 0) > 0), 0, ref("THDS7G1G.MT5"))  # 0x0008baec

def label_0008baf4():
    goto label_0008efe4  # 0x0008baf5
    set_path_target(6)  # 0x0008baf9

def label_0008bb04():
    goto label_00091b4b  # 0x0008bb05

def label_0008bb0a():
    goto label_35a5a04e  # 0x0008bb11
    if not (ctx.r14): goto label_0008f086  # 0x0008bb17
    if not (ctx.r14): goto label_0008bb04  # 0x0008bb1c
    goto label_604bdf7f  # 0x0008bb21
    ctx.select("0xd4")  # 0x0008bb38
    goto label_0008e884  # 0x0008bb3b
    if not (ctx.r14): goto label_0008e89a  # 0x0008bb51
    goto label_00090be6  # 0x0008bb59

def label_0008bb5e():
    goto label_25522146  # 0x0008bb6b
    goto label_a608bb82  # 0x0008bb7c
    scnf_camera()  # 0x0008bb84
    scnf_camera(ref("THDS7G1G.MT5"))  # 0x0008bb90
    goto label_2459a09d  # 0x0008bb97
    goto label_000890aa  # 0x0008bb9f

def label_0008bba4():
    entity_setup(6)  # 0x0008bba5
    goto label_00090c38  # 0x0008bbab

def label_0008bbc2():
    set7_0xffff((0 < 0), 11, DLG_DOJO_0x104, ref("THDS7G1G.MT5"), 3)  # 0x0008bbc9
    ctx.mobj *= 0  # 0x0008bbcc
    goto label_0008f026  # 0x0008bbd3
    goto label_88091c1f  # 0x0008bbd7
    goto label_e60911dc  # 0x0008bbf1
    goto label_604be057  # 0x0008bbf9

def label_0008bc04():
    scnf_camera((0 > (0 == 0)))  # 0x0008bc08
    goto label_0008f0fc  # 0x0008bc0d
    set7_0xd106(6)  # 0x0008bc11
    goto label_00091c63  # 0x0008bc1d
    ctx.select("0x52ffffe6")  # 0x0008bc2c
    goto label_0008f08e  # 0x0008bc3b
    goto label_88091c87  # 0x0008bc3f
    ctx.select("TTMS246G.MT5")  # 0x0008bc4c
    goto label_e6091244  # 0x0008bc59
    goto label_604be0bf  # 0x0008bc61
    scnf_camera((0 > (0 == 0)), ref("THDS7G1G.MT5"))  # 0x0008bc70

def label_0008bc74():
    goto label_0008f164  # 0x0008bc75
    set_waypoint(6)  # 0x0008bc79
    goto label_00091ccb  # 0x0008bc85
    goto label_88091cd9  # 0x0008bc91
    goto label_0008bca3  # 0x0008bca1
    ctx.select("0x49c")  # 0x0008bca9
    goto label_0008f100  # 0x0008bcad
    goto label_88091cf9  # 0x0008bcb1
    goto label_0008ea0e  # 0x0008bcc5
    if not (ctx.r14): goto label_0008ea1e  # 0x0008bcd5
    goto label_00090d6a  # 0x0008bcdd

def label_0008bce4():
    if not (ctx.r14): goto label_0008bcfb  # 0x0008bcf8

def label_0008bcfb():
    goto label_00089208  # 0x0008bcfd
    entity_setup(6)  # 0x0008bd03
    goto label_00090d96  # 0x0008bd09

def label_0008bd26():
    goto label_0008923c  # 0x0008bd2d
    if not (ctx.r14): goto label_0008ea7a  # 0x0008bd31
    goto label_00090dc6  # 0x0008bd39

def label_0008bd54():
    ctx.select("0x7d")  # 0x0008bd56
    if not (ctx.r14): goto label_0008c8a8  # 0x0008bd58
    if not (ctx.r14): goto label_0008bdcc  # 0x0008bd5c

def label_0008bd5f():

def label_0008bd62():
    if not (ctx.r14): goto label_0008df9c  # 0x0008bd6c
    set6_0x816ed37d((0 < 0), 11, 0x2d46e400, 0, ref("SWORD_HILT"), DLG_DOJO_0x105, 0, 0xf8f3, 13)  # 0x0008bd70
    goto label_e551eac4  # 0x0008bd79
    goto label_0008bd5f  # 0x0008bd8c
    goto label_e61492c2  # 0x0008bdaf
    entity_setup(6)  # 0x0008bdb5
    goto label_00090e48  # 0x0008bdbb

def label_0008bdc4():

def label_0008bdcc():
    goto label_255223a8  # 0x0008bdcd
    ctx.select("0x3a0000ce")  # 0x0008bde0
    voice(0x1feffff, [(0 > (0 == 96)), ref("THDS7G1G.MT5")])  # 0x0008bde5

def label_0008bdeb():
    goto label_0008eb3e  # 0x0008bdf5
    strcpy(ref("SWORD_HILT"), DLG_HOUSE_0x102)  # 0x0008be08
    goto label_0008f266  # 0x0008be13
    goto label_e60d13ac  # 0x0008be17
    goto label_5598e27f  # 0x0008be1f
    goto label_5598e289  # 0x0008be29

def label_0008be34():
    ctx.mobj |= 36  # 0x0008be36
    if not (ctx.r14): goto label_0008f39c  # 0x0008be39
    ctx.select("TTMS246G.MT5")  # 0x0008be4c
    goto label_0008eb9a  # 0x0008be51

def label_0008be5b():
    goto label_0008ebb6  # 0x0008be6d
    goto label_0008be43  # 0x0008be70
    goto label_e561ebd6  # 0x0008be8b

def label_0008bea4():
    ctx.mobj |= 0x34ece404  # 0x0008beaa
    goto label_00091f03  # 0x0008bead

def label_0008beb2():

def label_0008beb9():

def label_0008bed0():
    ext_noop((3 > 0x8800), ref("THDS7G1G.MT5"), 0xf903, 0xfffc)  # 0x0008bed0
    goto label_0008f336  # 0x0008bee3

def label_0008bee9():
    scnf_camera_lerp(10, (3 > 0x8800), ref("THDS7G1G.MT5"))  # 0x0008bef4
    goto label_0008ec42  # 0x0008bef9
    goto label_00090f8b  # 0x0008befd
    ctx.mobj &= (0xc801 > 0)  # 0x0008bf0e

def label_0008bf14():
    goto label_0008e372  # 0x0008bf1f

def label_0008bf22():
    goto label_0008a429  # 0x0008bf25
    entity_setup(6)  # 0x0008bf29
    goto label_0008beb9  # 0x0008bf2d

def label_0008bf3d():
    goto label_0008bec9  # 0x0008bf3d
    goto label_00090fda  # 0x0008bf4d
    entity_setup((0 < 0), 11, 0, PACKED(0xe50b, 0xd409), 6)  # 0x0008bf5d
    ctx.mobj -= ref("THDS7G1G.MT5")  # 0x0008bf78
    voice(0x7a000003, [(0 >= 229), 141, 11, 0, 0x8b0b8800])  # 0x0008bf80
    goto label_0008a48c  # 0x0008bf89
    entity_setup(6)  # 0x0008bf8f
    goto label_0008bf21  # 0x0008bf95

def label_0008bf9a():

def label_0008bfa5():
    goto label_2d4f95b8  # 0x0008bfa7
    goto label_0008bf3d  # 0x0008bfb1
    if not (0): goto label_0008ed0a  # 0x0008bfc1
    goto label_00091056  # 0x0008bfc9
    voice(0x62000003, [(0 < 0), 11, DLG_HOUSE_0x105, 1, 11, 9, 143, 0])  # 0x0008bfe8
    goto label_0008a4f4  # 0x0008bff1
    voice(0x562d46d6, [])  # 0x0008bff4
    entity_set_attrs()  # 0x0008bff9
    set6_0x8d508ad5()  # 0x0008bffc

def label_0008c00a():
    goto label_2d4f9646  # 0x0008c00f
    goto label_0008bfa5  # 0x0008c019

def label_0008c01b():

def label_0008c022():
    if not (ctx.r14): goto label_0008ed72  # 0x0008c029
    goto label_000910be  # 0x0008c031
    entity_setup((0 < 0), 11, PACKED(0xd52b, entity_init_type), 6)  # 0x0008c041

def label_0008c057():
    entity_set_shadow((0 >= 0), 141, 11, 0, PACKED(0xd527, entity_init_type), 6)  # 0x0008c057
    ctx.select("0x2d5")  # 0x0008c070
    if not (ctx.r14): goto label_0008a779  # 0x0008c073
    entity_setup((0 >= 0), 141, 11, 0, 0x349ce400, 0xe400, 6)  # 0x0008c077
    set_look_at(0x762d)  # 0x0008c07d
    ctx.select("0x7d")  # 0x0008c088
    goto label_0008a590  # 0x0008c08b
    entity_setup(6)  # 0x0008c08f
    set2_0xd5()  # 0x0008c092

def label_0008c09a():
    ext_load_model((0 >= 0), 141, 11, 0)  # 0x0008c0a4
    entity_setup(6)  # 0x0008c0a7
    goto label_00091138  # 0x0008c0ab

def label_0008c0b2():
    load_resource((0 < 0), 11, 0, 0x2d46e401)  # 0x0008c0ba
    goto label_0008c057  # 0x0008c0cb

def label_0008c0e4():

def label_0008c0e5():
    voice(0x4c000003, [141, 11, 0, DLG_HOUSE_0x10c, 1, 11, 9, 143, 6])  # 0x0008c0e8

def label_0008c0f5():

def label_0008c100():
    ctx.mobj //= 12  # 0x0008c104
    goto label_0008f562  # 0x0008c10f
    goto label_8809215b  # 0x0008c113
    goto label_0008c126  # 0x0008c120

def label_0008c126():
    entity_activate(6)  # 0x0008c127
    ctx.mobj &= (0xc801 > 0)  # 0x0008c13a
    goto label_0008e59e  # 0x0008c14b
    goto label_0008a655  # 0x0008c151
    entity_setup(6)  # 0x0008c155
    goto label_0008c0e5  # 0x0008c159
    goto label_0008c0f5  # 0x0008c169
    goto label_00091206  # 0x0008c179
    set6_0x3e602d5((0 < 0), 11, 0, 0x349ce400, 0xe400)  # 0x0008c190
    set7_0xd536(45, 0x762d)  # 0x0008c19d
    ctx.select("0x7d")  # 0x0008c1a8
    goto label_0008a6b0  # 0x0008c1ab
    entity_setup(6)  # 0x0008c1af

def label_0008c1b8():

def label_0008c1c4():
    ext_load_model(0, 0x55815490)  # 0x0008c1c4
    entity_setup(6)  # 0x0008c1c7
    goto label_00091258  # 0x0008c1cb
    load_resource((0 < 0), 11, 0, 0x2d46e401)  # 0x0008c1da

def label_0008c1e4():
    if not (0): goto label_00084cc2  # 0x0008c1ea

def label_0008c1f1():
    if not (ctx.r14): goto label_0008a901  # 0x0008c1fb
    entity_setup(141, 11, 0, 0x2d46e401, 141, 11, 0, PACKED(entity_activate_ex, entity_init_ex), 6)  # 0x0008c1ff
    set7_0xd51d(0x762d)  # 0x0008c205
    ctx.select("0x7d")  # 0x0008c210
    goto label_00091797  # 0x0008c213
    ext_move_entity()  # 0x0008c216
    ext_load_model()  # 0x0008c218
    entity_setup(6)  # 0x0008c21b
    goto label_000912ac  # 0x0008c21f
    goto label_0008e682  # 0x0008c22f
    goto label_0008f68c  # 0x0008c239
    goto label_e6149755  # 0x0008c23d
    entity_setup(6)  # 0x0008c243
    goto label_000912d6  # 0x0008c249
    goto label_25522836  # 0x0008c25b
    if not (ctx.r14): goto label_0008c1f1  # 0x0008c264
    ctx.mobj -= ref("THDS7G1G.MT5")  # 0x0008c26c
    ctx.mobj //= 206  # 0x0008c284
    set6_0xc4000003((0 == 96), 10, 15, (13 *f 15), 0, 206)  # 0x0008c28c
    goto label_000897d5  # 0x0008c295
    if not (ctx.r14): goto label_0008efe2  # 0x0008c299
    goto label_0009132e  # 0x0008c2a1
    goto label_0008e704  # 0x0008c2b1
    entity_set_interact(0xe400, 6)  # 0x0008c2b9

def label_0008c2cc():
    entity_setup((0 >= 0), 141, 11, (0 >= 0x2d46e400), 141, 11, 0, 0x2d46e401, 141, 11, 0, PACKED(entity_activate, entity_init), 6)  # 0x0008c2eb
    set2_0x8ad5()  # 0x0008c2ee
    goto label_0009138d  # 0x0008c2ff
    ctx.mobj &= (0xc801 > 0)  # 0x0008c310
    if not (ctx.r14): goto label_0008aa42  # 0x0008c321
    entity_init((0 < 0), 11, 0, 11, (~1), 3, 4, PACKED(entity_activate, entity_init), 6)  # 0x0008c325
    goto label_0008f094  # 0x0008c32b
    if not (ctx.r14): goto label_0008f0a8  # 0x0008c32f
    set2_0xd7()  # 0x0008c332
    entity_init_child(6)  # 0x0008c335
    entity_set_anim(45, 0x762d)  # 0x0008c33d
    goto label_0008c4ca  # 0x0008c34a
    goto label_0008f096  # 0x0008c34d
    goto label_000913df  # 0x0008c351
    ctx.mobj &= (0xc801 > 0)  # 0x0008c362
    entity_setup(0, 11, (~1), 3, 4, PACKED(0xe502, entity_init), 6)  # 0x0008c373
    goto label_0008c303  # 0x0008c377
    set6_0x49000003(141, 11, 0, 0x8b0e8800, 0, ref("THDS7G1G.MT5"))  # 0x0008c38c

def label_0008c391():
    ctx.mobj *= (~0)  # 0x0008c398

def label_0008c3a1():
    goto label_0008f0ee  # 0x0008c3a5
    goto label_00091437  # 0x0008c3a9
    ctx.mobj &= (0xc801 > 0)  # 0x0008c3ba

def label_0008c3c2():
    goto label_0008a9d6  # 0x0008c3d3
    goto label_0008f134  # 0x0008c3db
    goto label_0008f148  # 0x0008c3df
    if not (0): goto label_0008f15c  # 0x0008c3e3
    entity_init_npc(6)  # 0x0008c3e9
    entity_set_anim(45, 0x762d)  # 0x0008c3f1

def label_0008c3f4():
    goto label_0008c47e  # 0x0008c3fe
    goto label_0008f14a  # 0x0008c401
    goto label_0008c391  # 0x0008c405
    goto label_0008c3a1  # 0x0008c415
    load_resource(141, 11, 0, 0x2d46e401)  # 0x0008c424
    if not (ctx.r14): goto label_0008c47b  # 0x0008c440
    goto label_0008f89a  # 0x0008c447
    goto label_88092493  # 0x0008c44b
    set4_0x1000000((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008c458
    goto label_0008f1a6  # 0x0008c45d
    goto label_000914ef  # 0x0008c461
    ctx.mobj &= (0xc801 > 0)  # 0x0008c472

def label_0008c478():

def label_0008c47b():
    goto label_0008e8d6  # 0x0008c483
    goto label_0008a98d  # 0x0008c489
    entity_setup(6)  # 0x0008c48d
    scnf_load_resource()  # 0x0008c490
    goto label_00084f78  # 0x0008c4a0

def label_0008c4af():
    entity_suspend(141, 11, 0, 6)  # 0x0008c4af
    ext_rotate_entity((0 >= 0), 141, 11, 0, 0x349ce400, 0xe400)  # 0x0008c4c8

def label_0008c4ca():
    if not (0): goto label_0008abd1  # 0x0008c4cb
    entity_setup(0, 6)  # 0x0008c4cf
    set7_0xd51a(0x762d)  # 0x0008c4d5
    ctx.select("0x7d")  # 0x0008c4e0
    goto label_0008a9e8  # 0x0008c4e3
    entity_setup(6)  # 0x0008c4e7
    if not (ctx.r14): goto label_0008c4c1  # 0x0008c4ea

def label_0008c4fc():
    ext_load_model((0 >= 0), 141, 11, 0, 0x55815490)  # 0x0008c4fc
    entity_setup(6)  # 0x0008c4ff
    goto label_00091590  # 0x0008c503
    load_resource((0 < 0), 11, 0, 0x2d46e401)  # 0x0008c512
    goto label_0008c4af  # 0x0008c523
    ctx.mobj -= DLG_HOUSE_0x108  # 0x0008c534
    scnf_set_fog(141, 11, 0, 10, 15, (13 *f 15), 0, 0x950000ce)  # 0x0008c550
    goto label_0008f9aa  # 0x0008c557

def label_0008c55a():
    goto label_e60d1b41  # 0x0008c55b
    goto label_604be9c3  # 0x0008c563
    if not (ctx.r14): goto label_0008f2c6  # 0x0008c57d
    goto label_00091612  # 0x0008c585

def label_0008c58a():
    goto label_25542b72  # 0x0008c597

def label_0008c59e():

def label_0008c5a8():

def label_0008c5bc():
    scnf_set_bounds(((0 == 96) > 0), 0, ref("THDS7G1G.MT5"))  # 0x0008c5bc
    goto label_0008f308  # 0x0008c5bf

def label_0008c5cc():
    goto label_e6149afe  # 0x0008c5d7
    entity_setup(6)  # 0x0008c5dd
    goto label_00091670  # 0x0008c5e3
    goto label_25522bd0  # 0x0008c5f5
    set3_0xd4()  # 0x0008c5fa
    if not (ctx.r14): goto label_0008f356  # 0x0008c5fd
    entity_set_attrs(6)  # 0x0008c601
    goto label_25522bf2  # 0x0008c617
    goto label_0008ac49  # 0x0008c61d
    entity_set_attrs(45, 6)  # 0x0008c623

def label_0008c630():
    set2_0x46e6(11, 0, 0xe5006403)  # 0x0008c636
    entity_setup()  # 0x0008c639
    goto label_000916cc  # 0x0008c63f
    goto label_00092b28  # 0x0008c64f
    goto label_0008f3ba  # 0x0008c671
    if not (ctx.r14): goto label_8d59514e  # 0x0008c674
    if not (ctx.r14): goto label_0008f3ce  # 0x0008c685
    goto label_0009171a  # 0x0008c68d
    if not (ctx.r14): goto label_0008f3e6  # 0x0008c69d
    goto label_00091732  # 0x0008c6a5

def label_0008c6a8():
    voice(0x3d1, [(0 < 0), 11, 0x2d46e400])  # 0x0008c6b4

def label_0008c6be():
    scnf_set_bounds()  # 0x0008c6c2
    goto label_0008f40e  # 0x0008c6c5
    goto label_e6149c04  # 0x0008c6dd
    entity_setup(6)  # 0x0008c6e3
    goto label_00091776  # 0x0008c6e9

def label_0008c6f4():
    goto label_25522cd6  # 0x0008c6fb
    set2_0xd4()  # 0x0008c700
    if not (ctx.r14): goto label_0008f45c  # 0x0008c703
    entity_set_attrs(6)  # 0x0008c707
    goto label_25522cf8  # 0x0008c71d
    if not (ctx.r14): goto label_0008f47e  # 0x0008c725
    entity_set_attrs(6)  # 0x0008c729
    goto label_25522d1a  # 0x0008c73f
    set6_0xfe5216ff((0 > (0 == 96)), ref("THDS7G1G.MT5"), 9, 3)  # 0x0008c75e
    goto label_00089c9f  # 0x0008c779
    if not (ctx.r14): goto label_0008f4c6  # 0x0008c77d
    move_to((45 >= 229), 141, 11, 0x2d46e400)  # 0x0008c794
    entity_setup(PACKED(0xe50b, 0xd41c), 6)  # 0x0008c7a1
    goto label_e611acbc  # 0x0008c7b7
    entity_setup(6)  # 0x0008c7bd
    goto label_00091850  # 0x0008c7c3
    goto label_25522db0  # 0x0008c7d5
    goto label_0008c7e8  # 0x0008c7db
    if not (ctx.r14): goto label_0008f536  # 0x0008c7dd
    entity_set_attrs(6)  # 0x0008c7e1

def label_0008c7e8():
    goto label_25522dd2  # 0x0008c7f7
    if not (ctx.r14): goto label_0008c615  # 0x0008c80c
    mem_deleted((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008c818
    goto label_0008f566  # 0x0008c81d
    goto label_0008f57c  # 0x0008c833
    voice(213, [])  # 0x0008c836

def label_0008c838():
    goto label_0008eca6  # 0x0008c853
    goto label_0008ad5d  # 0x0008c859
    entity_setup(6)  # 0x0008c85d

def label_0008c860():
    goto label_0008c87c  # 0x0008c86f
    if not (0x2d46e401): goto label_0008f5ba  # 0x0008c871
    goto label_00091906  # 0x0008c879

def label_0008c87c():
    goto label_25542e66  # 0x0008c88b

def label_0008c8a8():
    ctx.mobj -= 21  # 0x0008c8a8
    goto label_0008fda4  # 0x0008c8b5
    if not (ctx.r14): goto label_0008f604  # 0x0008c8bb
    goto label_00091950  # 0x0008c8c3
    if not (ctx.r14): goto label_0008f61c  # 0x0008c8d3
    goto label_00091968  # 0x0008c8db
    goto label_0009293d  # 0x0008c8f7
    goto label_0008fe00  # 0x0008c911
    goto label_0008af18  # 0x0008c915
    entity_setup(6)  # 0x0008c919
    goto label_00092971  # 0x0008c92b
    goto label_0008f678  # 0x0008c92f
    scnf_set_move()  # 0x0008c932
    if not (ctx.r14): goto label_0008b045  # 0x0008c93f

def label_0008c944():
    set7_0xd513(PACKED(entity_activate_ex, entity_init_ex), 6, 45, 0x762d)  # 0x0008c949
    ctx.select("0x7d")  # 0x0008c954
    goto label_00091edb  # 0x0008c957
    ctx.select("0xd1")  # 0x0008c95a
    ext_load_model()  # 0x0008c95c
    entity_setup(6)  # 0x0008c95f
    goto label_000919f0  # 0x0008c963
    goto label_0008edc6  # 0x0008c973
    ctx.select("0x54")  # 0x0008c978
    goto label_0008fdce  # 0x0008c97b
    goto label_604c2dcb  # 0x0008c97f
    scnf_fade((0 > (0 == 0)), ref("THDS7G1G.MT5"), 8)  # 0x0008c996
    ctx.mobj &= 0  # 0x0008c99c

def label_0008c9a4():
    goto label_0008f6ee  # 0x0008c9a5
    goto label_0008fe16  # 0x0008c9c3
    goto label_88092a0f  # 0x0008c9c7

def label_0008c9cc():
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008c9d4
    goto label_0008f722  # 0x0008c9d9
    goto label_000854b4  # 0x0008c9dc
    goto label_0008affe  # 0x0008c9f9
    entity_setup(6)  # 0x0008c9fd
    goto label_00092a55  # 0x0008ca0f
    goto label_0008f75c  # 0x0008ca13
    set2_0xd1()  # 0x0008ca16
    if not (ctx.r14): goto label_0008b129  # 0x0008ca23

def label_0008ca28():
    set7_0xd515(PACKED(entity_activate_ex, entity_init_ex), 6, 45, 0x762d)  # 0x0008ca2d
    ctx.select("0x7d")  # 0x0008ca38
    goto label_00091fbf  # 0x0008ca3b
    ext_load_model(mobj_op(209))  # 0x0008ca40
    entity_setup(6)  # 0x0008ca43
    goto label_00091ad4  # 0x0008ca47
    goto label_0008eeaa  # 0x0008ca57
    ctx.select("0x54")  # 0x0008ca5c
    goto label_0008feb2  # 0x0008ca5f
    goto label_604c2eaf  # 0x0008ca63

def label_0008ca74():

def label_0008ca78():
    if not (ctx.r14): goto label_0008ca74  # 0x0008ca79
    set7_0xe918fffb((0 == 0), ref("0x8b"), 0, ref("THDS7G1G.MT5"), 9)  # 0x0008ca7d
    scnf_fade()  # 0x0008ca82
    mem_deleted((0 <=f 0))  # 0x0008ca8c
    goto label_0008f7da  # 0x0008ca91
    goto label_0008ff02  # 0x0008caaf
    goto label_88092afb  # 0x0008cab3
    goto label_0008cac3  # 0x0008cac0

def label_0008cac3():
    goto label_0008f80e  # 0x0008cac5
    scnf_camera_track()  # 0x0008cac8
    goto label_0008ef28  # 0x0008cad5
    goto label_0008afdf  # 0x0008cadb
    entity_setup(6)  # 0x0008cadf
    goto label_0008b0f7  # 0x0008caf3
    entity_setup(6)  # 0x0008caf7

def label_0008cb08():
    goto label_00092b4f  # 0x0008cb09
    goto label_0008f856  # 0x0008cb0d
    voice(209, [])  # 0x0008cb10
    if not (ctx.r14): goto label_0008b223  # 0x0008cb1d
    entity_setup(PACKED(entity_activate_ex, entity_init_ex), 6)  # 0x0008cb21
    rotate_smooth(0x762d)  # 0x0008cb27
    ctx.select("0x7d")  # 0x0008cb32
    goto label_000920b9  # 0x0008cb35
    goto label_2d5ef886  # 0x0008cb3b
    goto label_00091bce  # 0x0008cb41

def label_0008cb4c():
    goto label_0008ffec  # 0x0008cb4d
    goto label_00092ba9  # 0x0008cb53
    ctx.select("0x54")  # 0x0008cb56
    goto label_0008ffac  # 0x0008cb59
    goto label_604c2fa9  # 0x0008cb5d
    ctx.select("0x8b")  # 0x0008cb64

def label_0008cb74():
    scnf_camera((0 == 0), 0, ref("THDS7G1G.MT5"), mobj_op(0xf8e5), 0xfbfc, 0)  # 0x0008cb84
    goto label_0008f8d2  # 0x0008cb89
    set2_0xb2ffffeb(ref("SWORD_HILT"), DLG_HOUSE_0x102)  # 0x0008cb9c

def label_0008cba8():
    goto label_88092bf3  # 0x0008cbab
    goto label_0008cbbb  # 0x0008cbb8

def label_0008cbbb():
    goto label_0008f906  # 0x0008cbbd
    scnf_camera_track()  # 0x0008cbc0
    goto label_0008f020  # 0x0008cbcd
    goto label_0008b0d7  # 0x0008cbd3
    entity_setup(6)  # 0x0008cbd7
    goto label_0008b1ef  # 0x0008cbeb
    entity_setup(6)  # 0x0008cbef

def label_0008cbfc():
    goto label_00092c47  # 0x0008cc01
    goto label_0008f94e  # 0x0008cc05
    voice(209, [])  # 0x0008cc08

def label_0008cc10():
    goto label_0008b115  # 0x0008cc11
    if not (ctx.r14): goto label_0008b31b  # 0x0008cc15
    entity_setup(6)  # 0x0008cc19
    rotate_smooth(0x762d)  # 0x0008cc1f

def label_0008cc2a():
    ctx.select("0x7d")  # 0x0008cc2a
    goto label_000921b1  # 0x0008cc2d
    ext_load_model(ref("0xd1"))  # 0x0008cc32
    entity_setup(6)  # 0x0008cc35
    goto label_00091cc6  # 0x0008cc39
    goto label_2459b14d  # 0x0008cc47
    ctx.select("0x54")  # 0x0008cc4e
    goto label_000900a4  # 0x0008cc51

def label_0008cc58():
    ctx.select("0x8b")  # 0x0008cc5c

def label_0008cc60():
    set2_0xf8e4(10, 7, 3, 0x8800, 0)  # 0x0008cc64
    if not (ctx.r14): goto label_0008c55a  # 0x0008cc70

def label_0008cc7c():
    scnf_camera()  # 0x0008cc7c
    goto label_0008f9ca  # 0x0008cc81

def label_0008cc88():
    set2_0xffff(ref("SWORD_HILT"), DLG_HOUSE_0x102, 2)  # 0x0008cc95
    ctx.select("0x54e10000")  # 0x0008cc99

def label_0008cca4():
    goto label_0008ccb3  # 0x0008ccb0

def label_0008ccb3():

def label_0008ccbd():
    ctx.select("0x39d00000")  # 0x0008ccc9

def label_0008ccd0():
    ctx.mobj.write16(ref("THDS7G1G.MT5"))  # 0x0008ccd0
    ctx.select("0x54e10000")  # 0x0008ccd1
    goto label_0008ccbd  # 0x0008ccd6
    goto label_88092d23  # 0x0008ccdb

def label_0008cce0():
    goto label_0008b1f7  # 0x0008ccf3

def label_0008ccf8():
    set7_0xd50e(45, 0x762d)  # 0x0008cd01
    ctx.select("0x7d")  # 0x0008cd0c
    goto label_00092293  # 0x0008cd0f

def label_0008cd14():
    ext_load_model()  # 0x0008cd14
    entity_setup(6)  # 0x0008cd17
    goto label_00091da8  # 0x0008cd1b
    goto label_0008f17e  # 0x0008cd2b

def label_0008cd40():
    if not (0): goto label_0008cd76  # 0x0008cd44
    goto label_0009019e  # 0x0008cd4b
    goto label_88092d97  # 0x0008cd4f
    goto label_0708cd61  # 0x0008cd5c

def label_0008cd68():
    goto label_2459b36d  # 0x0008cd69
    goto label_0008f2bb  # 0x0008cd6f

def label_0008cd76():
    goto label_000901e6  # 0x0008cd93
    goto label_88092ddf  # 0x0008cd97
    ext_noop((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008cda4

def label_0008cdb0():
    goto label_2459b3b5  # 0x0008cdb1
    goto label_0008f303  # 0x0008cdb7
    set2_0xfe4b(96, ref("THDS7G1G.MT5"))  # 0x0008cdc4
    goto label_00090226  # 0x0008cdd3
    goto label_88092e1f  # 0x0008cdd7

def label_0008cde6():
    goto label_0008fb32  # 0x0008cde9

def label_0008cdf4():
    goto label_0009025a  # 0x0008ce07
    goto label_88092e53  # 0x0008ce0b
    ctx.select("TTMS246G.MT5")  # 0x0008ce18
    goto label_0008fb66  # 0x0008ce1d

def label_0008ce20():

def label_0008ce3c():
    goto label_88092e87  # 0x0008ce3f

def label_0008ce48():
    scnf_camera((0 > 0))  # 0x0008ce4c

def label_0008ce56():
    set2_0x2ef0fffd(0, ref("SWORD_HILT"), (0 /f ref("THDS7G1G.MT5")))  # 0x0008ce5d

def label_0008ce64():
    goto label_000902ba  # 0x0008ce67
    goto label_88092eb3  # 0x0008ce6b

def label_0008ce72():
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008ce78

def label_0008ce8c():
    goto label_000902e6  # 0x0008ce93

def label_0008ce9a():

def label_0008cea5():
    goto label_00090312  # 0x0008cebf

def label_0008cec6():
    scnf_camera((0 > (10 == 3)), ref("THDS7G1G.MT5"))  # 0x0008ced0

def label_0008ced4():
    goto label_0009033e  # 0x0008ceeb
    ext_noop(10, (3 > 0x8800), ref("THDS7G1G.MT5"))  # 0x0008cefc

def label_0008cf00():
    goto label_0008cea5  # 0x0008cf07
    goto label_0008b312  # 0x0008cf0d
    goto label_00092f67  # 0x0008cf11
    if not (ctx.r14): goto label_0008cf35  # 0x0008cf1c

def label_0008cf28():
    goto label_0009037e  # 0x0008cf2b
    goto label_88092f77  # 0x0008cf2f

def label_0008cf35():

def label_0008cf36():
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008cf3c

def label_0008cf44():

def label_0008cf4c():
    set2_0x6c(0, ref("SWORD_HILT"), 0, ref("THDS7G1G.MT5"))  # 0x0008cf4c
    set7_0x2e00ff()  # 0x0008cf4e
    goto label_000903aa  # 0x0008cf57
    goto label_88092fa3  # 0x0008cf5b
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008cf68

def label_0008cf70():
    set7_0x2dd4ff(0, ref("SWORD_HILT"), 0, ref("THDS7G1G.MT5"))  # 0x0008cf7a
    goto label_000903d6  # 0x0008cf83
    goto label_88092fcf  # 0x0008cf87
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008cf94

def label_0008cf98():
    set2_0x7e(0, ref("SWORD_HILT"), 0, ref("THDS7G1G.MT5"))  # 0x0008cfa4
    goto label_00090402  # 0x0008cfaf

def label_0008cfb4():
    scnf_camera(10, (3 > 0x8800), ref("THDS7G1G.MT5"))  # 0x0008cfc0
    set4_0x2d7cff(0, ref("SWORD_HILT"), 0, ref("THDS7G1G.MT5"), mobj_op(146))  # 0x0008cfd2
    goto label_0009042e  # 0x0008cfdb

def label_0008cfe0():
    scnf_camera(10, (3 > 0x8800), ref("THDS7G1G.MT5"))  # 0x0008cfec
    goto label_0009045a  # 0x0008d007
    goto label_88093053  # 0x0008d00b
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008d018

def label_0008d01e():

def label_0008d028():
    set7_0x2d24ff(0, 0, ref("THDS7G1G.MT5"), mobj_op(173))  # 0x0008d02a
    goto label_00090486  # 0x0008d033

def label_0008d03a():
    scnf_camera((0 > (10 == 3)), ref("THDS7G1G.MT5"))  # 0x0008d044
    set2_0xf8fffc45(0, ref("SWORD_HILT"), 0, ref("THDS7G1G.MT5"))  # 0x0008d054
    ext_noop()  # 0x0008d059
    goto label_000904b2  # 0x0008d05f

def label_0008d064():

def label_0008d066():
    scnf_camera((0 > (10 == 3)), ref("THDS7G1G.MT5"))  # 0x0008d070

def label_0008d082():
    set7_0x2cccff(0, ref("SWORD_HILT"), 0, ref("THDS7G1G.MT5"), 204)  # 0x0008d082
    goto label_000904de  # 0x0008d08b

def label_0008d08e():

def label_0008d092():
    scnf_camera((0 > (10 == 3)), ref("THDS7G1G.MT5"))  # 0x0008d09c

def label_0008d0aa():
    goto label_0009050a  # 0x0008d0b7
    goto label_88093103  # 0x0008d0bb
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008d0c8
    goto label_00090536  # 0x0008d0e3
    goto label_8809312f  # 0x0008d0e7
    goto label_0008fe42  # 0x0008d0f9
    goto label_0009218b  # 0x0008d0fd

def label_0008d10e():
    ctx.mobj &= (0xc801 > 0)  # 0x0008d10e
    goto label_000905c0  # 0x0008d121
    goto label_0008f578  # 0x0008d125
    goto label_0008b62f  # 0x0008d12b
    entity_setup(6)  # 0x0008d12f
    goto label_0008d0bf  # 0x0008d133
    ext_set_lighting(141, 11, 0, 0x2d46e400, ref("SWORD_HILT"), DLG_HOUSE_0x104, 216)  # 0x0008d158
    goto label_000905b6  # 0x0008d163
    goto label_880931af  # 0x0008d167
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008d174

def label_0008d184():
    set2_0xf1(0, ref("SWORD_HILT"), 0, ref("THDS7G1G.MT5"))  # 0x0008d184
    goto label_000905e2  # 0x0008d18f
    goto label_880931db  # 0x0008d193

def label_0008d198():
    scnf_camera((0 > 0), ref("THDS7G1G.MT5"))  # 0x0008d1a0
    set2_0xb(0, ref("SWORD_HILT"), 0, ref("THDS7G1G.MT5"))  # 0x0008d1b0
    goto label_0009060e  # 0x0008d1bb

def label_0008d1c0():

def label_0008d1cb():
    scnf_camera(10, (3 > 0x8800), ref("THDS7G1G.MT5"))  # 0x0008d1cc
    goto label_0009063a  # 0x0008d1e7
    goto label_88093233  # 0x0008d1eb
    ctx.select("TTMS246G.MT5")  # 0x0008d1f8
    sm_get_state((0 > 0), ref("THDS7G1G.MT5"), ref("THDS7G1G.MT5"), 10)  # 0x0008d205
    goto label_0009065e  # 0x0008d20b
    goto label_88093257  # 0x0008d20f
    goto label_0008ff6a  # 0x0008d221
    goto label_0008f684  # 0x0008d231
    goto label_0008b73b  # 0x0008d237
    entity_setup(6)  # 0x0008d23b
    goto label_0008d1cb  # 0x0008d23f

def label_0008d247():
    goto label_0008ff94  # 0x0008d24b

def label_0008d250():
    ctx.mobj.write16(DLG_HOUSE_0x104)  # 0x0008d25c
    set6_0x2af0fffc((0 <f 0))  # 0x0008d265

def label_0008d26c():
    goto label_000906c2  # 0x0008d26f
    goto label_880932bb  # 0x0008d273

def label_0008d27c():
    goto label_0008ffce  # 0x0008d285

def label_0008d290():
    goto label_00090730  # 0x0008d291

def label_0008d294():
    goto label_0008f6e8  # 0x0008d295
    goto label_0008b79f  # 0x0008d29b
    entity_setup(6)  # 0x0008d29f
    goto label_0008d22f  # 0x0008d2a3
    set4_0x8cfffc38(141, 11, 0, 0x2d46e401, ref("SWORD_HILT"), DLG_HOUSE_0x104, mobj_op(0xf8de))  # 0x0008d2c8
    mem_deleted()  # 0x0008d2cd
    goto label_00090726  # 0x0008d2d3
    goto label_8809331f  # 0x0008d2d7
    ctx.mobj >>= ref("THDS7G1G.MT5")  # 0x0008d2e4

def label_0008d2f0():

def label_0008d2f1():
    goto label_e709b8f8  # 0x0008d2f3
    entity_setup(6)  # 0x0008d2f9
    set7_0xd509(0x762d)  # 0x0008d2ff
    ctx.select("0x7d")  # 0x0008d30a
    goto label_8809335b  # 0x0008d313
    set4_0x3c000001((0 > 0))  # 0x0008d328
    goto label_0009007a  # 0x0008d331
    goto label_000923c3  # 0x0008d335

def label_0008d33e():
    ctx.mobj &= (0xc801 > 0)  # 0x0008d346

def label_0008d352():
    ctx.mobj |= ref("THDS7G1G.MT5")  # 0x0008d358
    goto label_000900a8  # 0x0008d35f
    goto label_0008d2f1  # 0x0008d365
    ext_place_model_at(141, 11, 0, 0x8b078800, 0, ref("THDS7G1G.MT5"))  # 0x0008d37c

def label_0008d384():
    goto label_000900ce  # 0x0008d385
    goto label_00092417  # 0x0008d389
    ctx.mobj &= (0xc801 > 0)  # 0x0008d39a

def label_0008d3b6():
    scnf_camera_track((0 < 0), 11, 0, 11, (~1), 3, 4, DLG_HOUSE_0x101)  # 0x0008d3b6
    goto label_00090106  # 0x0008d3bd
    if not (0): goto label_0008d794  # 0x0008d3c0
    goto label_0008f0a0  # 0x0008d3cc
    goto label_e709b9d6  # 0x0008d3cf
    entity_setup(6)  # 0x0008d3d5
    set_orient(0x762d)  # 0x0008d3db
    ctx.select("0x7d")  # 0x0008d3e6
    goto label_0009296d  # 0x0008d3e9
    ext_load_model()  # 0x0008d3ee
    if not (ctx.r14): goto label_0008baf4  # 0x0008d3f1
    entity_setup(6)  # 0x0008d3f5
    set7_0xd519(0x762d)  # 0x0008d3fb
    ctx.select("0x7d")  # 0x0008d406
    scnf_set_position((0 >= 0), 141, 11, 0)  # 0x0008d408
    scnf_set_rotation()  # 0x0008d40a
    set7_0xd416(6)  # 0x0008d411
    goto label_0008d3ed  # 0x0008d416
    if not (0): goto label_0008d493  # 0x0008d41b
    entity_unlink(0x142d)  # 0x0008d41d
    entity_init_linked(6)  # 0x0008d421
    entity_set_anim(45, 0x762d)  # 0x0008d429
    goto label_0008d3b6  # 0x0008d436
    goto label_00090182  # 0x0008d439

def label_0008d45a():
    set7_0xf8dceaff(141, 11, 0, 0x8b138800, ref("THDS7G1G.MT5"), 112, 0)  # 0x0008d45a

def label_0008d468():
    goto label_000901be  # 0x0008d475
    goto label_00092507  # 0x0008d479
    ctx.mobj &= (0xc801 > 0)  # 0x0008d48a

def label_0008d48c():

def label_0008d493():

def label_0008d498():
    goto label_0008aad0  # 0x0008d4a3
    set3_0x46d7()  # 0x0008d4a6
    entity_setup()  # 0x0008d4a9
    set7_0xd129(0x762d)  # 0x0008d4af
    ctx.select("0x7d")  # 0x0008d4b6
    goto label_0008d58f  # 0x0008d4b8
    goto label_0008aae2  # 0x0008d4bb
    entity_setup()  # 0x0008d4c1
    set7_0xd125(0x762d)  # 0x0008d4c7
    ctx.select("0x7d")  # 0x0008d4ce
    goto label_00090970  # 0x0008d4d1
    goto label_0008f928  # 0x0008d4d5
    goto label_0008b9df  # 0x0008d4db
    entity_setup(6)  # 0x0008d4df
    ctx.select("0x8ad5")  # 0x0008d4e2
    move_to(141, 11, 0, 0x2d46e402)  # 0x0008d4f2

def label_0008d4f8():
    goto label_0009258d  # 0x0008d4ff

def label_0008d50e():
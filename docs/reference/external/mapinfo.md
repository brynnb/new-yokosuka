[[Category:Shenmue II]]
[[Category:Shenmue]]
[[Category:Files]]
[[Category:Map]]
The mapinfo is the main file for each scene map.
It contains many things such as the shenmue scene script, model loading and definition, collisions, light, weather, sound program setup and cutscenes.

===Nodes===
{| class="wikitable"
|-
! Signature !! Description 
|-
| ATTR || empty
|-
| [[SNDP]] || Sound program
|-
| [[LGHT]] || Scene light
|-
| [[ECAM]] || Event camera
|-
| [[COLS]] || Collisions (SM1)
|-
| [[FLDD]] || Collision field (SM2)
|-
| [[DOOR]] || Doors
|-
| [[SCEX]] || Cutscenes
|-
| [[SCN3]] || Scene script v3
|-
| [[SCN4]] || Scene script v4
|-
| REGD || empty
|-
| [[WTHR]] || Weather
|-
| EVFD || empty
|-
| LSCN || empty
|-
| [[MAPR]] || unknown
|-
| [[MAPT]] || unknown
|-
| [[SCRL]] || unknown
|-
| [[CHRD]] || Character data (External models)
|-
| END || EOF
|}

===Memory Models===

Could be the MAPINFO memory model:
{| class="wikitable"
|-
! Position !! Length !! Type !! Description 
|-
| 0x00 || 0x04 || string || Identifier (SCNC)
|-
| 0x04 || 0x0? || ? || Variable size (contains pointers)
|-
| 0x0? || 0x04 || string || Identifier (USE ) //space at the end
|-
| 0x0? || 0x0? || ? || Variable size (contains pointers)
|}

Found at qword_7FF717119290 (v1.03) in the code segment (CS).
It is accessed when reading the TRCK segment.
<sub>
    struct s1 {
        signed char[8] pad8;
        signed char f8; //bool set to 1 at end
        signed char[7] pad16;
        struct s0* f16;
        struct s2* f24; //ASEQ
        struct s2* f32; //ACAM
        struct s2* f40; //AMOV
        struct s2* f48; //ASTR
        struct s2* f56; //ALIP
        uint64_t f64;
        uint64_t f72;
        signed char[8] pad88;
        int32_t f88;
        int32_t f92;
        int32_t f96;
        int32_t f100;
        signed char[12] pad116;
        struct s2* f116;
        signed char[4] pad128;
        struct s2* f128;
        signed char[42376] pad42512;
        int32_t f42512;
        int16_t f42516;
    };

    struct s0 {
        signed char[4] pad4;
        int32_t f4;
        int32_t f8;
    };

    struct s2 {
        int32_t f0;
        int32_t f4;
        signed char[1] pad9;
        signed char f9;
        signed char[2] pad12;
        int32_t f12;
    };

</sub>

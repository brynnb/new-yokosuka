[[Category:Runtime]]
[[Category:Shenmue]]
[[Category:Memory Addresses]]
Offsets listed here are for Patch v1.07, unless noted otherwise. 
== Memory Addresses ==

===General===
* Shenmue.exe+9F50EB8 - [pointer] Character Structure (?)
** +0x8 - [float] Ryo Position X
** +0x10 - [float] Ryo Position Y
** +0xC - [float] Ryo Position Z
* Shenmue.exe+9F37498 - [int] Player Money 
* Shenmue.exe+9F3749C - [int] SEGA Coins
* Shenmue.exe+9E334CC - [string] MPK/MAP0
* Shenmue.exe+9F502D4 - [int] Current Scene Number
* Shenmue.exe+9F502E0 - [string] Current Map/Area ID
* Shenmue.exe+9F502D8 - [int] Current Map/Area Entry Point
* Shenmue.exe+1330040 - [string] Current Date

===Camera===
* Shenmue.exe+5E15208 - [float] Camera Position X/Y
* Shenmue.exe+5E15200 - [float] Camera Position X/Y
* Shenmue.exe+5E15204 - [float] Camera Position Z
* Shenmue.exe+5E151F4 - [int] Camera State
* Shenmue.exe+9DB6B0 - [double] Field of View related (defaults to 57.2957795130824)
* Shenmue.exe+9DBA50 - [float] Field of View related (defaults to 182.0444489)
* Shenmue.exe+A3BEDC - [float] Camera Distance from Player (defaults to 3.099999905f)

===Time===
* Shenmue.exe+9F34622 - [byte] Time of Day: Day
* Shenmue.exe+9F34621 - [byte] Time of Day: Month
* Shenmue.exe+9F34620 - [byte] Time of Day: Year
* Shenmue.exe+9F34624 - [byte] Time of Day: Hours
* Shenmue.exe+9F34625 - [byte] Time of Day: Minutes
* Shenmue.exe+9F34626 - [byte] Time of Day: Seconds
* Shenmue.exe+9E31947 - [int] Freeze Time (1 = freeze, 0 = normal)
* Shenmue.exe+EB161C - [float] Time of Day: Time Multiplier 1/2 (controls speed of in-game clock; 1 by default, works in conjunction with 2/2 below ([Time Multiplier 1/2] * [Time Multiplier 2/2])
* Shenmue.exe+9F3464C - [float] Time of Day: Time Multiplier 2/2 (controls speed of in-game clock; 0.5 by default, works in conjunction with 1/2 above ([Time Multiplier 2/2] * [Time Multiplier 1/2])
** Note: To approximate in-game time speed to real-time, use multipliers 1 and 2 to multiply (1 * 0.0333333333)
* Shenmue.exe+9F34622 - [byte] Weather Pattern (usually 07, 0B, 19 trigger snow with varying degrees of intensity)
* Shenmue.exe+EB01EC - [float] Time since Start

===Map Warping===
* Shenmue.exe+64C8998 - [byte] Area Map Warp Trigger (defaults to 0, set 1 to trigger instant warp)
* Shenmue.exe+64C899C - [string] Warp AreaID (MapID) (must be manually initialized on first start/load before warping, will crash game otherwise)
** Shenmue.exe+64C89A8 - [byte] (must be manually initialized to 7 on first start/load before warping, will crash game otherwise)
* Shenmue.exe+64C89A4 - [byte] Warp EntryID (MapEntryPoint) (set the entry point for any given map to warp to)
* Shenmue.exe+64C89A0 - [byte] Warp SceneID (Disc #) (set the scene/disc number to warp to)

===Rendering===
* Shenmue.exe+EB0484 - [float] Frame Time
* Shenmue.exe+EB0280 - [string] Frame Time and FPS
* Shenmue.exe+EB04C8 - [byte] 60fps
* Shenmue.exe+1478530 - [byte] 200+fps
* Shenmue.exe+D87DA6 - [byte] Stabilize framerate (0 = off, 1 = on)
* Shenmue.exe+ED82C1 - [byte] Render UI (default = 1, 0 = off)
* Shenmue.exe+9DBB64 - [float] UI Screen Resolution Horizontal (defaults to 1920.0)
* Shenmue.exe+9DBB38 - [float] UI Screen Resolution Vertical (defaults to 1080.0)
* Shenmue.exe+EB054C - [float] Screen Resolution Horizontal (defaults to 1920.0)
* Shenmue.exe+EB0810 - [float] Screen Resolution Vertical (defaults to 1080.0)
* Shenmue.exe+0EB0C34 - [int] Rendering Mode:
** 0 norm
** 1 ???
** 2 wireframe
** 3 "" ""
** 4 clear framebuffer
** 5 "" "" 
** 6 "" ""
** 7 "" ""
** 8 norm (w/o sky)
** 9 "" "" 
** 10 wireframe (from perspective)
** 11 "" ""
** 12 clear framebuffer (?)
** 13 "" ""
** 14 "" "" 
** 15 "" ""
** 16 render opposites
** 17 "" ""
** 18 wireframe with 16
** 19 "" ""
** 20 clear framebuffer (?)
** 21 "" ""
** 22 "" ""
** 23 "" ""
** 24 normal (with some strips being weird lol)
** 25 "" ""
** 26 slightly different wireframe
** 27 "" ""
** 28 clear framebuffer (?)
** 29 "" ""
** 30 "" ""
** 31 "" ""
** 32 same as 24
* Shenmue.exe+1342D48 - [int] Fog Enabled (1 = on, 0 = off)
* Shenmue.exe+1342D38 - [float] Fog Colour R (max 1.0)
* Shenmue.exe+1342D3C - [float] Fog Colour G (max 1.0) 
* Shenmue.exe+1342D40 - [float] Fog Colour B (max 1.0)

===Stats===

===Settings===
====Controls====
* Shenmue.exe+9F0FE14 - [byte] Swap Look and Run (defaults to 0)
* Shenmue.exe+A65DA8 - [byte] Swap Look and Run (defaults to 0)(menu variable)
* Shenmue.exe+9F0FCF4 - [byte] Swap Look and Run (defaults to 0)(menu variable)
* Shenmue.exe+9F0FF34 - [byte] Swap Look and Run (defaults to 0)(menu variable)

* Shenmue.exe+9F0FE15 - [byte] Invert Look Y Axis (defaults to 0)
* Shenmue.exe+A65E18 - [byte] Invert Look Y Axis (defaults to 0)(menu variable)
* Shenmue.exe+9F0FCF5 - [byte] Invert Look Y Axis (defaults to 0)(menu variable)
* Shenmue.exe+9F0FF35 - [byte] Invert Look Y Axis (defaults to 0)(menu variable)

* Shenmue.exe+9F0FE16 - [byte] Area Jump (defaults to 1)
* Shenmue.exe+A65E88 - [byte] Area Jump (defaults to 1)(menu variable)
* Shenmue.exe+9F0FCF6 - [byte] Area Jump (defaults to 1)(menu variable)
* Shenmue.exe+9F0FF36 - [byte] Area Jump (defaults to 1)(menu variable)

=====Keybindings=====
* Shenmue.exe+9F0FF3C - [byte] First Keybinding (Talk/Action)
** +0x3 bytes for each subsequent keybinding
* Shenmue.exe+9F10000 - [byte] Last Keybinding (Right)

Offsets for the keybindings shown in the menu:

* Shenmue.exe+9F0FCFC - [byte] First Keybinding (Talk/Action)(menu variable)
** +0x3 bytes for each subsequent keybinding
* Shenmue.exe+9F0FDC0 - [byte] Last Keybinding (Right)(menu variable)

====Display====
* Shenmue.exe+9F0FF00 - [int] Display Mode
* Shenmue.exe+9F10020 - [int] Display Mode
** 0 = Windowed
** 1 = Borderless
** 2 = Fullscreen

* Shenmue.exe+A6A488 - [int] Display Mode (menu variable)
* Shenmue.exe+9F0FDE0 - [int] Display Mode (menu variable)

* Shenmue.exe+9F0FDEC - [float] Resolution Scale (defaults to 0.5, changes occur instantly)
* Shenmue.exe+A6A5DC - [float] Resolution Scale (menu setting)(defaults to 1) 
* Shenmue.exe+9F0FDEC - [float] Resolution Scale (menu setting)(defaults to 1) 
* Shenmue.exe+9F0FF0C - [float] Resolution Scale (defaults to 1) 
* Shenmue.exe+9F1002C - [float] Resolution Scale (defaults to 1) 

* Shenmue.exe+A56878 - [float] Contrast (defaults to 0.5, changes occur instantly)
* Shenmue.exe+A6A80C - [float] Contrast (defaults to 0.5 - affects menu variables)
* Shenmue.exe+9F0FE04 - [float] Contrast (defaults to 0.5 - affects menu variables)
* Shenmue.exe+9F10044 - [float] Contrast (defaults to 0.5 - affects menu variables)

* Shenmue.exe+9F0FF18 - [int] Bloom
* Shenmue.exe+9F10038 - [int] Bloom
** 0 = Off
** 1 = Low
** 2 = High

* Shenmue.exe+A6A728 - [int] Bloom (menu variable)
* Shenmue.exe+9F0FDF8 - [int] Bloom (menu variable)

* Shenmue.exe+A6A79C - [float] Gamma (defaults to 0.5 - affects menu variables)
* Shenmue.exe+9F0FE00 - [float] Gamma (defaults to 0.5 - affects menu variables)
* Shenmue.exe+9F0FF20 - [float] Gamma (defaults to 0.5 - affects menu variables)
* Shenmue.exe+9F10040 - [float] Gamma (defaults to 0.5 - affects menu variables)

* Shenmue.exe+A6A6B8 - [byte] FXAA (defaults to 1)
* Shenmue.exe+A6AB24 - [byte] FXAA (defaults to 1)
* Shenmue.exe+9F0FDF4 - [byte] FXAA (defaults to 1)
* Shenmue.exe+9F0FF14 - [byte] FXAA (defaults to 1)
* Shenmue.exe+9F10034 - [byte] FXAA (defaults to 1)

* Shenmue.exe+A6A878 - [byte] Aspect Ratio (defaults to 1) 
* Shenmue.exe+9F0FDFC - [byte] Aspect Ratio (defaults to 1)
* Shenmue.exe+9F0FF1C - [byte] Aspect Ratio (defaults to 1)
* Shenmue.exe+9F1003C - [byte] Aspect Ratio (defaults to 1)

* Shenmue.exe+9F10048 - [float] UI Display Area (defaults to 1, changes occur instantly)
* Shenmue.exe+A6A8EC - [float] UI Display Area (defaults to 1 - affects menu variables)
* Shenmue.exe+9F0FE08 - [float] UI Display Area (defaults to 1 - affects menu variables)
* Shenmue.exe+9F0FF28 - [float] UI Display Area (defaults to 1 - affects menu variables)

====Audio====
* Shenmue.exe+A64058 - [int] Audio Device
* Shenmue.exe+9F0FDC4 - [int] Audio Device

* Shenmue.exe+A640C8 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue.exe+C5F278 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue.exe+EDCA00 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue.exe+9F0FDC8 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue.exe+9F0FEE8 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue.exe+9F10008 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue.exe+9F2F558 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)

* Shenmue.exe+A64138 - [int] Text Language
** 0 = English
** 1 = French
** 2 = German
** 3 = Korean
** 4 = Traditional Chinese
** 5 = Simplified Chinese
** 6 = Default
* Shenmue.exe+9F0FEF0 - [int] Dialogue & Text 
* Shenmue.exe+9F10010 - [int] Dialogue & Text 
** 0 = Cinema Mode
** 1 = Shenmue Mode
** 2 = Game Mode
** 3 = Text mode
* Shenmue.exe+A641A8 - [int] Dialogue & Text (menu variable)
* Shenmue.exe+9F0FDD0 - [int] Dialogue & Text (menu variable)  

* Shenmue.exe+9F0FEF8 - [float] SFX Volume (defaults to 1)
* Shenmue.exe+A3B44C - [float] SFX Volume (defaults to 1)(menu variable)
* Shenmue.exe+A6421C - [float] SFX Volume (defaults to 1)(menu variable)
* Shenmue.exe+9F0FDD8 - [float] SFX Volume (defaults to 1)(menu variable)
* Shenmue.exe+9F10018 - [float] SFX Volume (defaults to 1)(menu variable)

* Shenmue.exe+9F0FEFC - [float] Music Volume (defaults to 1)
* Shenmue.exe+A585E8 - [float] Music Volume (defaults to 1)(menu variable)
* Shenmue.exe+A6428C - [float] Music Volume (defaults to 1)(menu variable)
* Shenmue.exe+9F0FDDC - [float] Music Volume (defaults to 1)(menu variable)
* Shenmue.exe+9F1001C - [float] Music Volume (defaults to 1)(menu variable)

* Shenmue.exe+9F0FEF4 - [float] Speech Volume (defaults to 1)
* Shenmue.exe+A642FC - [float] Speech Volume (defaults to 1)(menu variable)
* Shenmue.exe+9F0FDD4 - [float] Speech Volume (defaults to 1)(menu variable)
* Shenmue.exe+9F10014 - [float] Speech Volume (defaults to 1)(menu variable)

===NPCs===
====Debug====
* Shenmue.exe+C64DEC - [int/boolean] Debug Talk Status (locks cutscenes when set to 1, 0 is default)

===Interface===
====Menu====

===Physics===
* Shenmue.exe+64C8FA8 - [byte] Remove door collisions (default 255, set to 0 for no collision)
* Shenmue.exe+8EBD9 - [byte] Remove almost all collisions (default 74 [je], change to EB [jmp] for no collision)

===Save Files===
* Shenmue.exe+1D2B64 - [byte] Ignore save checksum when loading (default 0F8594000000 [jne], NOP the instruction to ignore the checksum)

===Undocumented===
(v1.00 offsets)
Camera related???
* Shenmue.exe+5E16AD0 - [float] (set camera distance from player, auto-zooms from left/right)
* Shenmue.exe+5E16AD4 - [float] (set camera distance from player, auto-zooms from top/bottom)
* Shenmue.exe+5E16AD8 - [float] (set camera distance from player, auto-zooms from front/back)
* Shenmue.exe+5E16ADC - [float] (set camera horizontal angle away from player, auto-pans back)
* Shenmue.exe+5E16AE4 - [float] (set camera horizontal angle away from player, auto-pans back)
* Shenmue.exe+5E16AE0 - [float] (set camera vertical angle away from player, auto-pans back)

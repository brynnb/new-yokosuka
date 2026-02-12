[[Category:Runtime]]
[[Category:Shenmue II]]
[[Category:Memory Addresses]]
Offsets listed here are for Patch v1.07, unless noted otherwise. 
== Memory Addresses ==

===General===
* Shenmue2.exe+96D238 - [pointer] [[SM2_Player_Struct]]
** +0x84 - [float] Position X axis
** +0x88 - [float] Position Y axis
** +0x8C - [float] Position Z axis
** +0x178 - [float] Camera Distance from Player (defaults to 3.100f)
** +0x1D8 - [float] Camera Distance from Player (defaults to 3.100f)
* Shenmue2.exe+8217C70 - [string] Current Map ID
* Shenmue2.exe+E2BE09 - [string] Current Map ID
* Shenmue2.exe+81D0EB8 - [int] Player Money
* Shenmue2.exe+81D0EBC - [int] Player SEGA Coins

When loading into the first save, these offsets are used:-
* Shenmue2.exe+1D20654 - [float] Player Position X
* Shenmue2.exe+1D2064C - [float] Player Position X
* Shenmue2.exe+1D20650 - [float] Player Position X

Any subsequent load will use these offsets:-
* Shenmue2.exe+1D242D4 - [float] Player Position X
* Shenmue2.exe+1D242CC - [float] Player Position Y
* Shenmue2.exe+1D242D0 - [float] Player Position Z

* Shenmue2.exe+3DA4D84 - [string] Active Voice Sound Filename

* Shenmue2.exe+3DA3BE4 - [string] Active Subtitle Text

===Camera===
* Shenmue2.exe+D20430 - [float] Camera Position X Axis
* Shenmue2.exe+D20438 - [float] Camera Position Y Axis
* Shenmue2.exe+D20434 - [float] Camera Position Z Axis

* Shenmue2.exe+D2045C - [float] Camera Position X Axis
* Shenmue2.exe+D20464 - [float] Camera Position Y Axis
* Shenmue2.exe+D20460 - [float] Camera Position Z Axis

* Shenmue2.exe+D202F4 - [int] Camera State (defaults to 0, locks position with other values)

* Shenmue2.exe+D20608 - [float] Camera Distance (defaults to 3.1f)
* Shenmue2.exe+D205F0 - [float] Camera Distance (defaults to 3.1f)

===Time===
* Shenmue2.exe+81CEE82 - [byte] Time of Day: Day
* Shenmue2.exe+81CEE83 - [byte] Time of Day: Week
* Shenmue2.exe+81CEE81 - [byte] Time of Day: Month
* Shenmue2.exe+81CEE80 - [byte] Time of Day: Year
* Shenmue2.exe+81CEE84 - [byte] Time of Day: Hours
* Shenmue2.exe+81CEE85 - [byte] Time of Day: Minutes
* Shenmue2.exe+81CEE86 - [byte] Time of Day: Seconds
* Shenmue2.exe+3EE1DAC - [byte] Time of Day: Freeze Game Time 
* Shenmue2.exe+3EE1DA8 - [float] Game Time Multiplier (defaults to 1)

===Map Warping===
* Shenmue2.exe+E79024 - [string] Warp AreaID (MapID)
* Shenmue2.exe+E79028 - [byte] Warp SceneID (Disc #) (set the scene/disc number to warp to) (only scene 1 tested so far...)
* Shenmue2.exe+E7902C - [byte] Warp EntryID (MapEntryPoint) (set the entry point for any given map to warp to)
* Shenmue2.exe+E79030 - [byte] Warp Pre-Init (must be set to 6)
* Shenmue2.exe+E79020 - [byte] Area Map Warp Trigger (set 1 to trigger instant warp)
NOTE: All offsets must be populated with valid values before warping, will crash game otherwise.

===Rendering===
* Shenmue2.exe+3EE0B9E - [int] 60 FPS (defaults to 0, 1 = 60fps)
* Shenmue2.exe+44BA7E0 - [int] 200+ FPS (defaults to 0, 1 = 200+fps)
* Shenmue2.exe+3EE10BC - [float] Frame Time 
* Shenmue2.exe+3EE10C0 - [string] Frame Time including FPS
* Shenmue2.exe+94E604 - [byte] Render UI (default = 1, 0 = off)

====Weather====
====Rendering====
* Shenmue2.exe+964240 - [int] Draw Air (Clouds) (defaults to 1, 0 for off)
* Shenmue2.exe+964234 - [int] Draw Sky Dome (defaults to 1, 0 for off)
* Shenmue2.exe+964244 - [int] Draw Planets (sun & moon)(defaults to 1, 0 for off)
* Shenmue2.exe+8E056C - [float] Weather related (defaults to 4, higher values increase brightness)
* Shenmue2.exe+964234 - [byte] Skydome related (defaults to 1, 0 causes darker skydome)
* Shenmue2.exe+964240 - [byte] Skydome texture bool (defaults to 1, 0 causes no skydome texture)
(v1.04 offsets)
* Shenmue2.exe+8D0C20 - [float] Sun Direction(?)
* Shenmue2.exe+8E0878 - [float] Sun Direction (?)
* Shenmue2.exe+8CFC60 - [float] Wind Simulation force/power(?) (defaults to 0.005)
* Shenmue2.exe+8CFAF4 - [float] Wind Simulation force/power(?)

===Stats===
* Shenmue2.exe+CFABF8 - [byte] First Gacha toy Unlock 
** +0x20 (for a total of 0x2240) - [byte] Gacha Unlocked? flag (0 if locked, 1 if unlocked)
* Shenmue2.exe+CFCE38 - [byte] Last Gacha toy unlock

===Settings===
====Controls====
* Shenmue2.exe+8168804 - [byte] Swap Look and Run (defaults to 0)
* Shenmue2.exe+956868 - [byte] Swap Look and Run (defaults to 0)(menu variable)
* Shenmue2.exe+81686E4 - [byte] Swap Look and Run (defaults to 0)(menu variable)
* Shenmue2.exe+8168924 - [byte] Swap Look and Run (defaults to 0)(menu variable)

* Shenmue2.exe+8168805 - [byte] Invert Look Y Axis (defaults to 0)
* Shenmue2.exe+9568D8 - [byte] Invert Look Y Axis (defaults to 0)(menu variable)
* Shenmue2.exe+81686E5 - [byte] Invert Look Y Axis (defaults to 0)(menu variable)
* Shenmue2.exe+8168925 - [byte] Invert Look Y Axis (defaults to 0)(menu variable)

=====Keybindings=====
* Shenmue2.exe+8168928 - [byte] First Keybinding (Talk/Action)
** +0x3 bytes for each subsequent keybinding
* Shenmue2.exe+816898C - [byte] Last Keybinding (Guard)

Offsets for the keybindings shown in the menu:

* Shenmue2.exe+81686E8 - [byte] First Keybinding (Talk/Action)(menu variable)
** +0x3 bytes for each subsequent keybinding
* Shenmue2.exe+816874C - [byte] Last Keybinding (Guard)(menu variable)

====Audio====
* Shenmue2.exe+3EE3864 - [int] Audio Device
* Shenmue2.exe+81688D0 - [int] Audio Device
* Shenmue2.exe+81689F0 - [int] Audio Device
* Shenmue2.exe+955E38 - [int] Audio Device (menu variable)
* Shenmue2.exe+81687B0 - [int] Audio Device (menu variable)
* Shenmue2.exe+9B9408 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue2.exe+BB5D2C - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue2.exe+81688D4 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue2.exe+81689F4 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)
* Shenmue2.exe+955EA8 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)(menu variable)
* Shenmue2.exe+81687B4 - [bool] Audio Language (defaults to 0 (English), 1 is Japanese)(menu variable)
* Shenmue2.exe+955F18 - [int] Text Language
** 0 = English
** 1 = French
** 2 = German
** 3 = Korean
** 4 = Traditional Chinese
** 5 = Simplified Chinese
** 6 = Default
* Shenmue2.exe+81688DC - [int] Dialogue & Text
* Shenmue2.exe+81689FC - [int] Dialogue & Text
** 0 = Cinema Mode
** 1 = Shenmue Mode
** 2 = Game Mode
** 3 = Text mode
* Shenmue2.exe+955F88 - [int] Dialogue & Text (menu variable)
* Shenmue2.exe+81687BC - [int] Dialogue & Text (menu variable)
* Shenmue2.exe+81688E4 - [float] SFX Volume (defaults to 1)
* Shenmue2.exe+955FFC - [float] SFX Volume (defaults to 1)(menu variable)
* Shenmue2.exe+9A9AF4 - [float] SFX Volume (defaults to 1)(menu variable)
* Shenmue2.exe+81687C4 - [float] SFX Volume (defaults to 1)(menu variable)
* Shenmue2.exe+8168A04 - [float] SFX Volume (defaults to 1)(menu variable)
* Shenmue2.exe+81688E8 - [float] Music Volume (defaults to 1)
* Shenmue2.exe+95606C - [float] Music Volume (defaults to 1)(menu variable)
* Shenmue2.exe+9A9AF8 - [float] Music Volume (defaults to 1)(menu variable)
* Shenmue2.exe+81687C8 - [float] Music Volume (defaults to 1)(menu variable)
* Shenmue2.exe+8168A08 - [float] Music Volume (defaults to 1)(menu variable)
* Shenmue2.exe+81688E0 - [float] Speech Volume (defaults to 1)
* Shenmue2.exe+9560DC - [float] Speech Volume (defaults to 1)(menu variable)
* Shenmue2.exe+81687C0 - [float] Speech Volume (defaults to 1)(menu variable)
* Shenmue2.exe+8168A00 - [float] Speech Volume (defaults to 1)(menu variable)

====Graphics====
* Shenmue2.exe+81688EC - [int] Display Mode
* Shenmue2.exe+8168A0C - [int] Display Mode
** 0 = Windowed
** 1 = Borderless
** 2 = Fullscreen
* Shenmue2.exe+95A828 - [int] Display Mode (menu variable)
* Shenmue2.exe+81687CC - [int] Display Mode (menu variable)
* Shenmue2.exe+81688F4 - [byte] Screen Resolution
* Shenmue2.exe+8168A14 - [byte] Screen Resolution
** 0 = 640x480
** 1 = 720x480
** 2 = 720x576
** 3 = 800x600
** 4 = 1024x768
...
** 19 = 1920x1080
...
** 25 = 3840x2160
** 26 = 4096x2160
* Shenmue2.exe+95A908 - [byte] Screen Resolution (menu variable)
* Shenmue2.exe+81687D4 - [byte] Screen Resolution (menu variable)
* Shenmue2.exe+81688F8 - [float] Resolution Scale
* Shenmue2.exe+8168A18 - [float] Resolution Scale
* Shenmue2.exe+95A97C - [float] Resolution Scale (menu variable)
* Shenmue2.exe+81687D8 - [float] Resolution Scale (menu variable)
* Shenmue2.exe+81688FC  - [float] Supersampling
* Shenmue2.exe+8168A1C  - [float] Supersampling
* Shenmue2.exe+95A9EC - [float] Supersampling (menu variable)
* Shenmue2.exe+81687DC - [float] Supersampling (menu variable)
* Shenmue2.exe+8168900 - [byte] FXAA 
* Shenmue2.exe+95AA58 - [byte] FXAA (menu variable)
* Shenmue2.exe+9F6E04 - [byte] FXAA (menu variable)
* Shenmue2.exe+81687E0 - [byte] FXAA (menu variable)
* Shenmue2.exe+8168A20 - [byte] FXAA (menu variable)
* Shenmue2.exe+8168904 - [int] Bloom
* Shenmue2.exe+8168A24 - [int] Bloom
** 0 = Off
** 1 = Low
** 2 = High
* Shenmue2.exe+95AAC8 - [int] Bloom (menu variable)
* Shenmue2.exe+81687E4 - [int] Bloom (menu variable)
* Shenmue2.exe+816890C - [float] Gamma
* Shenmue2.exe+95AB3C - [float] Gamma (menu variable)
* Shenmue2.exe+81687EC - [float] Gamma (menu variable)
* Shenmue2.exe+8168A2C - [float] Gamma (menu variable)
* Shenmue2.exe+8168908 - [byte] Aspect Ratio
* Shenmue2.exe+8168A28 - [byte] Aspect Ratio
* Shenmue2.exe+95AC18 - [byte] Aspect Ratio (menu variable)
* Shenmue2.exe+81687E8 - [byte] Aspect Ratio (menu variable)
* Shenmue2.exe+8168914 - [float] UI Display Area
* Shenmue2.exe+8168A34 - [float] UI Display Area
* Shenmue2.exe+95AC8C - [float] UI Display Area (menu variable)
* Shenmue2.exe+81687F4 - [float] UI Display Area (menu variable)

===NPCs===

===Interface===
* Shenmue2.exe+94E604 - [byte] set to 1 by default, 0 hides the HUD
* Shenmue2.exe+81D11D8 - [byte] set to 0 by default, set to 1 to pause; if paused, set to 1 to resume
* Shenmue2.exe+3C15FA0 - [int] set to 0 by default, set to 1 to pause; if paused, set to 1 to resume
* Shenmue2.exe+E34060 - [int] set to 0 by default, set to 1 to show pause screen without pausing the title.

(v1.04 offsets)
* Shenmue2.exe+BCB6EC - [float] 'am/pm' text position (x)
* Shenmue2.exe+BCB6E0 - [float] 'am/pm' text position (y)
* Shenmue2.exe+BCB6E4 - [float] 'am/pm' text position (z)
* Shenmue2.exe+BCB6E8 - [float] 'am/pm' text scale(?)

* Shenmue2.exe+BB7214 - [float] 'date/time' text in menu position (z)
* Shenmue2.exe+BB7210 - [float] 'date/time' text in menu position (y) (text clip at values <-230)
* Shenmue2.exe+BB6EF8 - [float] 'date/time' icon in menu scale
* Shenmue2.exe+BB6EF4 - [float] 'date/time' icon in menu position (z)

====Gacha Collection====
* Shenmue2.exe+CFAB20 - [byte] Gacha Table Horizontal (defaults to 8)
* Shenmue2.exe+CFAB24 - [byte] Gacha Table Vertical (defaults to 4)
* Shenmue2.exe+CFAB98 - [int] Number of Gacha Toys (defaults to 275)
* Shenmue2.exe+CFEBF0 - [int] Number of Gacha Toys (defaults to 275)
(v1.04 offsets)
* Shenmue2.exe+CE3C88 - [int] Unlock flag for new item #1 (+0x20 for each subsequent additional toy)
* Shenmue2.exe+CE3C80 - [int] New Item Category ID (1 for capsule toys) (+0x20 for each subsequent additional toy)
* Shenmue2.exe+CE3C84 - [int] New Item item/model ID (+0x20 for each subsequent additional toy)

====Menu====

===Physics===
* Shenmue2.exe+D25CE0 - [byte] Remove all collisions (default 3 or 5, set to 0 for no collision)

===Undocumented===
* Shenmue2.exe+8217CA0 - [int] Defaults to 1, 0 disables all rendering apart from sky
* Shenmue2.exe+3D78778 - [int] Defaults to 0, 1 disables the buttons in the bottom-right of the screen
* Shenmue2.exe+81D1E6C - [int] Number of Active NPCs in area

# New Yokosuka -  A Shenmue 1 (Dreamcast) Asset Viewer 

<p align="center">
  <img src="newyokosuka.jpeg" width="600" />
  <img src="screenshot.jpg" width="600" />
</p>

Codenamed New Yokosuka, this is a proof-of-concept web-based model viewer for the original Dreamcast version of [Shenmue](https://en.wikipedia.org/wiki/Shenmue). My ambition for this project is to extract the harbor area of Shenmue 1 along with its forklifts models to recreate the daily forklift job from the original game. The model extraction is complete, but the re-implementation of assets into a new game engine will be a future phase of work. 

It currently renders binary .MT5 models directly in your browser, utilizing custom parsers to process scenario and map data from across the game's multiple discs. The viewer imports model data into the Babylon.js engine, which allows for easy exporting into GLTF formats for use in other engines, modeling software, or 3D printing. While there is no dedicated export button yet, the functionality can be added on request.

While the viewer successfully renders the vast majority of environmental models, it is currently missing several core engine features. The most prominent missing elements are proper character rendering and the automated placement of dynamic objects (decor, vehicles, doors, etc.) within maps. Additionally, some textures may show minor quality discrepancies or artifacts compared to the original Dreamcast source.

The most complex work-in-progress aspects include perfecting seamless time-of-day transitions and implementing prop distribution. Prop placement is a particularly difficult task because Shenmue often uses game scripts rather than static data tables to position objects. Achieving full scene population requires reverse-engineering these scripts to extract coordinates, a much more complex process than simple data parsing.

Much more in-depth information can be found in the [SHENMUE_DOCUMENTATION.md](SHENMUE_DOCUMENTATION.md) file.

## Features and Implementation

- **Native .MT5 Support**: Custom JavaScript parser for binary MT5 model files.
- **PVR Decoding**: Real-time decoding of PVR/PVRT texture data (including DXT compressed formats).
- **Time-of-Day System**: Cycle through Day, Sunset, Evening, and Night presets with appropriate texture pack swapping.
- **FPS Navigation**: True first-person controls with WASD movement and look-around.
- **Asset Streaming**: Optimized to stream assets from Cloudflare R2 for fast loading.
- **Skyboxes**: Dynamic sky domes that sync with the selected time of day - sort of. Separating assets that are unique to time of day is somewhat challenging.
- **Searchable Catalog**: Thousands of models organized by game scenario and zone.

## Research Tools and Extraction

In addition to the web-based viewer, this project includes the suite of Python-based utilities used for the original reverse-engineering and extraction process. These tools allow for:
- Disassembling SCN3 bytecode for script-based event analysis.
- Unpacking archives (.PKF, .PKS) and decoding PVR/PVRT textures.
- Generating the optimized binary packs and JSON catalogs for the web renderer.

Full documentation for these utilities can be found in the [**Research Tools README**](tools/README.md).

## Controls

When the renderer is active:
- **Click**: Capture mouse for First-Person view.
- **WASD**: Move forward, backward, and strafe.
- **Mouse**: Look around.
- **Space / Shift**: Fly Up / Fly Down.
- **Q / E**: Decrease / Increase movement speed.
- **ESC**: Release mouse.

## Known Issues and Limitations

- **Animations**: Currently supports static geometry only; bone/skin animations are not implemented.
- **Collision**: Physics and collision data are not utilized (no-clip exploration only).
- **Lighting**: Basic lighting simulation only; does not yet support original game light-field data.

## Research and Documentation
The custom parsers and technical implementations in this project were informed by existing reverse-engineering work documenting Shenmue's binary formats. For those interested in the underlying research, please see the [SHENMUE_DOCUMENTATION.md](SHENMUE_DOCUMENTATION.md) and the [**/tools**](tools/README.md) directory for bytecode analysis utilities.

## Credits and Resources

Special thanks to the following resources:

- **Shenmue Export Tools**: Technical documentation and extraction hints from the [Shenmue-Export-Tools](https://github.com/seiche/Shenmue-Export-Tools) project.
- **Wulinshu Wiki**: The [Shenmue Format Documentation](https://wulinshu.com/wiki/index.php) served as a useful reference for some data structures.
- **Wudecon**: Research notes and format logic from the [LemonHaze420/wudecon](https://github.com/LemonHaze420/wudecon) project.
- **gditools3**: A [python library](https://github.com/AltoRetrato/gditools3) used to extract files, sorttxt.txt, and the bootsector (ip.bin) from SEGA Gigabyte Disc (GD-ROM) dumps.

And of course thanks to the original developers! 

---

### Legal Disclaimer
Shenmue is a registered trademark of SEGA. This project is a non-commercial, fan-made tool intended for educational and research purposes only. It is not affiliated with, endorsed by, or sponsored by SEGA. All original game assets, models, and related content are the property of their respective trademark and copyright holders.

## License
This project is licensed under the [GNU General Public License v3.0](LICENSE).

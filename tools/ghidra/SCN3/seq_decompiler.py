"""
SEQ Decompiler - Converts compiled SEQDATA*.AUTH binary back to C source.

This is a "Rosetta Stone" tool: by comparing its output against the known
leaked source (0154_1.C from sourceexample.md), we can calibrate the
decompiler until it produces near-perfect reconstructions.

Binary format (from leaked SEQCONV.C):
  TRCK header:
    [4] 'TRCK' magic
    [4] total size (little-endian)
  ASEQ header (inside TRCK):
    [4] 'ASEQ' magic
    [4] ASEQ section size
    [4] flags (version=5, endian=0)
    [4] nframes
  Sequence commands (array of SEQ records):
    Each SEQ = { type:u8, argc:u8, xxxx:u16, args[argc]:u32[] }
    Types: 0=END, 1=CAMERA, 2=MOVE, 3=MOTION, 4=EFFECT, 5=VOICE, 6=SE
  Terminator: int32 = -1 (0xFFFFFFFF)
  Then: ACAM chunk, AMOV chunk, ASTR chunk, ALIP chunk

Spline data layout (from CreateSplData in SEQCONV.C):
  For camera (8 channels): POS-X,Y,Z, INT-X,Y,Z, PERS, ROLL
    (but reordered: pers/roll swap for cam)
  For movement (9 channels): TRS-X,Y,Z, ROT-X,Y,Z, KAO-X,Y,Z
  Each channel:
    [4] n = key_frame_count (num_original * 2 - 2)
    [n*4] times (float)
    [n*4] values (float)
    [n*4] slopes (float)
"""

import struct
import sys
import os


# ================================================================
# Character ID <-> Name mapping
# From SEQCONV.C: MAKE_ID creates 4-byte ASCII tags
# ================================================================
CHAR_NAMES = {
    0x285E5E3B: "ID_CAMERA",   # MAKE_ID('(', '^', '^', ';')
}

# Binary 4-char tags -> source-style abbreviated names
# The original source uses abbreviated names (ID_AKI) but the compiled
# binary stores full 4-char MAKE_ID tags (AKIR)
CHAR_ABBREVIATIONS = {
    "AKIR": "AKI",    # Akira Yuki = Ryo (player character)
    "SARA": "SARA",   # Sara, as-is
    "TAIJ": "TAI",    # Tairaku?
    "KISY": "KIS",    # Kisuya/someone
    "CHIN": "CHI",    # Chai / Chinese character
}

def id_to_name(val):
    """Convert a 4-byte integer to a character name or MAKE_ID string."""
    if val in CHAR_NAMES:
        return CHAR_NAMES[val]
    # Try as ASCII tag
    try:
        tag = struct.pack('<I', val).decode('ascii')
        if all(32 <= ord(c) < 127 for c in tag):
            tag_stripped = tag.strip()
            # Use abbreviated name if known
            abbrev = CHAR_ABBREVIATIONS.get(tag_stripped, tag_stripped)
            return f"ID_{abbrev}"
    except:
        pass
    return f"0x{val:08X}"

def id_to_short(val):
    """Get just the short character name for array prefixes."""
    if val in CHAR_NAMES:
        return "CAM"  # Camera
    try:
        tag = struct.pack('<I', val).decode('ascii').strip()
        return CHAR_ABBREVIATIONS.get(tag, tag)
    except:
        return f"UNK_{val:08X}"


# ================================================================
# Command type names (from SEQCONV.C enum)
# ================================================================
CMD_NAMES = {
    0: "stEND",
    1: "stCAMERA",
    2: "stMOVE",
    3: "stMOTION",
    4: "stEFFECT",
    5: "stVOICE",
    6: "stSE",
}

# Channel names for camera and movement data
CAM_CHANNELS = ["camX", "camY", "camZ", "intX", "intY", "intZ", "pers", "roll"]
# Note: SEQCONV.C reorders cam: pers/roll swap (index 6=roll, 7=pers in output)
# splorder[0] = { 0,1,2,3,4,5,7,6 } -- cam uses this, so roll comes before pers
CAM_CHANNELS_REORDERED = ["camX", "camY", "camZ", "intX", "intY", "intZ", "roll", "pers"]

MOV_CHANNELS = ["trsX", "trsY", "trsZ", "rotX", "rotY", "rotZ", "kaoX", "kaoY", "kaoZ"]


def read_u8(data, off):
    return struct.unpack_from('<B', data, off)[0], off + 1

def read_i16(data, off):
    return struct.unpack_from('<h', data, off)[0], off + 2

def read_u16(data, off):
    return struct.unpack_from('<H', data, off)[0], off + 2

def read_i32(data, off):
    return struct.unpack_from('<i', data, off)[0], off + 4

def read_u32(data, off):
    return struct.unpack_from('<I', data, off)[0], off + 4

def read_f32(data, off):
    return struct.unpack_from('<f', data, off)[0], off + 4


def decode_spline_channel(data, off):
    """Decode one spline channel. Returns (keyframes, new_offset).
    
    Binary layout per channel:
      [4] n = total key count (= original_count * 2 - 2)
      [n * 4] times  (float32 array)
      [n * 4] values (float32 array)
      [n * 4] slopes (float32 array)
    
    We reconstruct FCVKEYt { time, left_slope, right_slope, value }
    First and last keys have only 1 entry; middle keys have 2 (left/right slopes).
    """
    n, off = read_i32(data, off)
    if n <= 0:
        return [], off

    # Read interleaved time/value/slope arrays
    times = []
    values = []
    slopes = []
    
    time_off = off
    value_off = off + n * 4
    slope_off = off + n * 4 * 2
    
    for i in range(n):
        t, _ = read_f32(data, time_off + i * 4)
        v, _ = read_f32(data, value_off + i * 4)
        s, _ = read_f32(data, slope_off + i * 4)
        times.append(t)
        values.append(v)
        slopes.append(s)
    
    new_off = slope_off + n * 4

    # Reconstruct original FCVKEYt entries
    # From SEQCONV.C:
    # First key: 1 entry (time=0 forced, left_slope only)
    # Middle keys: 2 entries each (left_slope, right_slope) at same time
    # Last key: 1 entry (left_slope only)
    # Total entries stored = original_count * 2 - 2
    
    keyframes = []
    i = 0
    key_idx = 0
    
    while i < n:
        time = times[i]
        value = values[i]
        
        if i == 0:
            # First key: single entry
            left_slope = slopes[i]
            right_slope = slopes[i]  # Same for first
            # Frame number estimation: time * 30 (30fps)
            frame = int(round(time * 30))
            keyframes.append({
                'time': time,
                'left_slope': left_slope,
                'right_slope': right_slope,
                'value': value,
                'frame': frame,
            })
            i += 1
        elif i >= n - 1:
            # Last key: single entry
            left_slope = slopes[i]
            right_slope = left_slope
            frame = int(round(time * 30))
            keyframes.append({
                'time': time,
                'left_slope': left_slope,
                'right_slope': right_slope,
                'value': value,
                'frame': frame,
            })
            i += 1
        else:
            # Middle key: TWO entries at same time (left then right slope)
            left_slope = slopes[i]
            # Next entry should have same time
            if i + 1 < n:
                right_slope = slopes[i + 1]
            else:
                right_slope = left_slope
            frame = int(round(time * 30))
            keyframes.append({
                'time': time,
                'left_slope': left_slope,
                'right_slope': right_slope,
                'value': value,
                'frame': frame,
            })
            i += 2  # Skip the pair
        
        key_idx += 1
    
    return keyframes, new_off


def decode_auth(filepath):
    """Decode a SEQDATA*.AUTH file into structured data."""
    with open(filepath, 'rb') as f:
        data = f.read()
    
    result = {
        'filename': os.path.basename(filepath),
        'size': len(data),
        'scenes': [],
        'cameras': [],
        'movements': [],
        'strings': [],
    }
    
    # === TRCK Header ===
    trck_magic = data[0:4]
    if trck_magic != b'TRCK':
        print(f"ERROR: Not a TRCK file (got {trck_magic})")
        return None
    trck_size, _ = read_u32(data, 4)
    
    # === ASEQ Header ===
    aseq_magic = data[8:12]
    if aseq_magic != b'ASEQ':
        print(f"ERROR: Missing ASEQ chunk (got {aseq_magic})")
        return None
    aseq_size, _ = read_u32(data, 12)
    
    # SEQHEADER fields
    endian_flag = data[16]
    version = data[17]
    nframes, _ = read_i32(data, 20)
    
    result['nframes'] = nframes
    result['version'] = version
    result['endian'] = endian_flag
    
    print(f"  TRCK size: {trck_size}, ASEQ size: {aseq_size}")
    print(f"  Version: {version}, nframes: {nframes}")
    
    # === Parse sequence commands ===
    off = 24  # After ASEQ header
    aseq_end = 8 + aseq_size
    scene_frame = None
    scene_cmds = []
    
    while off < aseq_end:
        # Read frame number or terminator
        frame, _ = read_i32(data, off)
        
        if frame == -1:
            # End marker
            if scene_frame is not None:
                result['scenes'].append({
                    'frame': scene_frame,
                    'commands': scene_cmds,
                })
            off += 4
            break
        
        # Save previous scene if any
        if scene_frame is not None and frame != scene_frame:
            result['scenes'].append({
                'frame': scene_frame,
                'commands': scene_cmds,
            })
            scene_cmds = []
        
        scene_frame = frame
        off += 4
        
        # Parse commands until stEND
        while off < aseq_end:
            cmd_type, _ = read_u8(data, off)
            
            if cmd_type == 0:  # stEND
                off += 4  # Skip the 4-byte END marker
                break
            
            argc, _ = read_u8(data, off + 1)
            xxxx, _ = read_u16(data, off + 2)
            off += 4
            
            args = []
            for i in range(argc):
                arg, off = read_i32(data, off)
                args.append(arg)
            
            cmd = {
                'type': cmd_type,
                'type_name': CMD_NAMES.get(cmd_type, f"UNK_{cmd_type}"),
                'argc': argc,
                'args': args,
            }
            scene_cmds.append(cmd)
    
    # Build character assignment per movement index from stMOVE commands
    move_chars = {}  # mov_index -> character_id
    for scene in result['scenes']:
        for cmd in scene.get('commands', []):
            if cmd['type'] == 2:  # stMOVE
                char_id = cmd['args'][0] if len(cmd['args']) > 0 else 0
                mov_idx = cmd['args'][1] if len(cmd['args']) > 1 else 0
                move_chars[mov_idx] = char_id
    result['move_chars'] = move_chars
    
    # === Parse remaining chunks (ACAM, AMOV, ASTR, ALIP) ===
    while off + 8 <= len(data):
        chunk_id = data[off:off+4]
        chunk_size, _ = read_u32(data, off + 4)
        
        if chunk_id == b'ACAM':
            result['cameras'] = decode_cam_chunk(data, off, chunk_size)
        elif chunk_id == b'AMOV':
            result['movements'] = decode_mov_chunk(data, off, chunk_size)
        elif chunk_id == b'ASTR':
            result['strings'] = decode_str_chunk(data, off, chunk_size)
        elif chunk_id == b'ALIP':
            pass  # Lip sync data, skip for now
        else:
            print(f"  Unknown chunk: {chunk_id} at offset {off}")
        
        off += chunk_size
    
    return result


def decode_cam_chunk(data, chunk_off, chunk_size):
    """Decode ACAM chunk into camera spline data."""
    cameras = []
    # Header: [4]ACAM [4]size [4]reserved [4]count
    count, _ = read_i32(data, chunk_off + 12)
    
    # Offset table: count+1 entries
    offsets = []
    for i in range(count + 1):
        off_val, _ = read_i32(data, chunk_off + 16 + i * 4)
        offsets.append(off_val)
    
    for cam_idx in range(count):
        cam_data_off = chunk_off + offsets[cam_idx]
        
        # Camera spline has 8 channels: camX,Y,Z, intX,Y,Z, pers, roll
        # But SEQCONV reorders: roll before pers (splorder[0] = {0,1,2,3,4,5,7,6})
        cam_entry = {'channels': {}}
        cur_off = cam_data_off
        
        # Read attribute flags first
        attr, cur_off = read_i32(data, cur_off)
        cam_entry['attr'] = attr
        
        for ch_idx in range(8):
            ch_name = CAM_CHANNELS_REORDERED[ch_idx]
            keyframes, cur_off = decode_spline_channel(data, cur_off)
            cam_entry['channels'][ch_name] = keyframes
        
        cameras.append(cam_entry)
    
    return cameras


def decode_mov_chunk(data, chunk_off, chunk_size):
    """Decode AMOV chunk into movement spline data."""
    movements = []
    count, _ = read_i32(data, chunk_off + 12)
    
    offsets = []
    for i in range(count + 1):
        off_val, _ = read_i32(data, chunk_off + 16 + i * 4)
        offsets.append(off_val)
    
    for mov_idx in range(count):
        mov_data_off = chunk_off + offsets[mov_idx]
        
        # Movement has 9 channels: trsX,Y,Z, rotX,Y,Z, kaoX,Y,Z
        mov_entry = {'channels': {}}
        cur_off = mov_data_off
        
        for ch_idx in range(9):
            ch_name = MOV_CHANNELS[ch_idx]
            keyframes, cur_off = decode_spline_channel(data, cur_off)
            mov_entry['channels'][ch_name] = keyframes
        
        movements.append(mov_entry)
    
    return movements


def decode_str_chunk(data, chunk_off, chunk_size):
    """Decode ASTR chunk into string table."""
    strings = []
    count, _ = read_i32(data, chunk_off + 12)
    
    for i in range(count):
        str_off, _ = read_i32(data, chunk_off + 16 + i * 4)
        abs_off = chunk_off + str_off
        # Read null-terminated string
        end = data.index(b'\x00', abs_off)
        s = data[abs_off:end].decode('ascii', errors='replace')
        strings.append(s)
    
    return strings


def emit_c_source(result):
    """Generate C source code that matches 0154_1.C format."""
    lines = []
    
    # === Camera keyframe arrays ===
    for cam_idx, cam in enumerate(result.get('cameras', [])):
        for ch_name in CAM_CHANNELS:
            # Undo the reorder for output
            kfs = cam['channels'].get(ch_name, [])
            if not kfs:
                continue
            
            lines.append(f"FCVKEYt {ch_name}[] = {{")
            for kf in kfs:
                t = kf['time']
                ls = kf['left_slope']
                rs = kf['right_slope']
                v = kf['value']
                frame = kf['frame']
                lines.append(f"\t{{ {t:f}, {ls:f}, {rs:f}, {v:f} }},\t/*\t{frame}\t*/")
            lines.append("};")
            lines.append("")
    
    # === Camera struct ===
    if result.get('cameras'):
        lines.append("")
        lines.append("Camera CamAll[] = {")
        for cam_idx, cam in enumerate(result.get('cameras', [])):
            parts = []
            parts.append(f"1, {result['nframes']}")
            for ch_name in CAM_CHANNELS:
                kfs = cam['channels'].get(ch_name, [])
                count = len(kfs)
                parts.append(f"{ch_name}, {count}")
            lines.append(f"\t{{ {', '.join(parts)} }},")
        lines.append("};")
        lines.append("")
    
    # === Movement keyframe arrays ===
    move_chars = result.get('move_chars', {})
    for mov_idx, mov in enumerate(result.get('movements', [])):
        # Find character name from the stMOVE commands
        char_id = move_chars.get(mov_idx, 0)
        char_short = id_to_short(char_id) if char_id else f"MV{mov_idx}"
        char_name = f"MV_{char_short}"
        
        for ch_name in MOV_CHANNELS:
            kfs = mov['channels'].get(ch_name, [])
            if not kfs:
                continue
            
            arr_name = f"{char_name}_{ch_name}"
            lines.append(f"FCVKEYt {arr_name}[] = {{")
            for kf in kfs:
                t = kf['time']
                ls = kf['left_slope']
                rs = kf['right_slope']
                v = kf['value']
                frame = kf['frame']
                lines.append(f"\t{{ {t:f}, {ls:f}, {rs:f}, {v:f} }},\t/*\t{frame}\t*/")
            lines.append("};")
            lines.append("")
    
    # === Scene timeline ===
    # Format from 0154_1.C: { frame, cam_count, move_count, motion_count, effect_count, voice_count, se_count }
    lines.append("")
    lines.append("Uint32 Scene[] = {")
    for scene in result.get('scenes', []):
        frame = scene['frame']
        # Count commands by type
        counts = {i: 0 for i in range(7)}
        for cmd in scene.get('commands', []):
            t = cmd['type']
            if t in counts:
                counts[t] += 1
        
        # Format: frame, camera_count, move_count, motion_count, effect_count, voice_count, se_count
        vals = [str(frame)]
        for i in range(1, 7):
            vals.append(str(counts.get(i, 0)))
        lines.append(f"\t{', '.join(vals)},")
    
    # Terminator: last scene frame, total_nframes
    nframes = result.get('nframes', 0)
    last_frame = result['scenes'][-1]['frame'] if result['scenes'] else 0
    lines.append(f"\t{last_frame}, {nframes},")
    lines.append("};")
    lines.append("")
    
    # === MoveID[] ===
    # Format from 0154_1.C: { character_id, move_tag, /* scene_num */ }
    move_chars = result.get('move_chars', {})
    if move_chars:
        lines.append("Uint32 MoveID[] = {")
        for mov_idx in sorted(move_chars.keys()):
            char_id_val = move_chars[mov_idx]
            char_id = id_to_name(char_id_val)
            char_short = id_to_short(char_id_val)
            lines.append(f"\t{char_id}, MV_{char_short},\t\t/* {mov_idx + 1} */")
        lines.append("};")
        lines.append("")
    
    # === MotionID[] ===
    # Format from 0154_1.C: { char_id, motion_name, start_frame, end_frame, flag, /* scene_frame */ }
    motion_cmds = []
    for scene in result.get('scenes', []):
        for cmd in scene.get('commands', []):
            if cmd['type'] == 3:  # stMOTION
                motion_cmds.append((scene['frame'], cmd))
    
    if motion_cmds:
        lines.append("Uint32 MotionID[] = {")
        for frame, cmd in motion_cmds:
            char_id = id_to_name(cmd['args'][0]) if len(cmd['args']) > 0 else "??"
            motion_id = cmd['args'][1] if len(cmd['args']) > 1 else 0
            start_frame = cmd['args'][2] if len(cmd['args']) > 2 else 0
            end_frame = cmd['args'][3] if len(cmd['args']) > 3 else 0
            flag = cmd['args'][4] if len(cmd['args']) > 4 else 0
            # Motion ID is a compiled integer; in source it was MN_AKI_YABAI_SYOUBAI_0134 etc.
            lines.append(f"\t{char_id}, MN_0x{motion_id:X}, {start_frame}, {end_frame}, {flag},\t\t/* {frame} */")
        lines.append("};")
        lines.append("")
    
    # === VoiceID[] ===
    # Format from 0154_1.C: { char_id, voice_define, lip_flag, /* scene_frame */ /* path */ }
    voice_cmds = []
    voice_str_indices = []  # Track which string indices are voice
    for scene in result.get('scenes', []):
        for cmd in scene.get('commands', []):
            if cmd['type'] == 5:  # stVOICE
                voice_cmds.append((scene['frame'], cmd))
                if len(cmd['args']) > 1:
                    voice_str_indices.append(cmd['args'][1])
    
    if voice_cmds:
        lines.append("Uint32 VoiceID[] = {")
        for frame, cmd in voice_cmds:
            char_id = id_to_name(cmd['args'][0]) if len(cmd['args']) > 0 else "??"
            str_idx = cmd['args'][1] if len(cmd['args']) > 1 else -1
            lip_idx = cmd['args'][2] if len(cmd['args']) > 2 else -1
            voice_id = cmd['args'][3] if len(cmd['args']) > 3 else 0
            
            # Resolve string path for comment
            voice_path = ""
            if str_idx >= 0 and str_idx < len(result.get('strings', [])):
                voice_path = result['strings'][str_idx]
            
            # Source format: ID_OTH, VA0154B001, 0,  /* 92 */ /* path */
            # Voice ID in source was a compiled define (VA0154B001 -> integer)
            # lip_idx: -1 means no lip sync
            lip_str = str(lip_idx) if lip_idx >= 0 else "0"
            
            # Generate symbolic voice name from path
            voice_name = f"VA_{voice_id:X}" if voice_id != -1 else "VA_NONE"
            if voice_path:
                # Extract filename: /p16/.../A0154A001.aiff -> VA0154A001
                basename = os.path.splitext(os.path.basename(voice_path))[0]
                voice_name = f"V{basename}"
            
            lines.append(f"\t{char_id}, {voice_name}, {lip_str},\t\t/* {frame} */\t/* {voice_path} */")
        lines.append("};")
        lines.append("")
    
    # === EffectID[] ===
    effect_cmds = []
    for scene in result.get('scenes', []):
        for cmd in scene.get('commands', []):
            if cmd['type'] == 4:  # stEFFECT
                effect_cmds.append((scene['frame'], cmd))
    
    if effect_cmds:
        lines.append("Uint32 EffectID[] = {")
        for frame, cmd in effect_cmds:
            char_id = id_to_name(cmd['args'][0]) if len(cmd['args']) > 0 else "??"
            eff_type = cmd['args'][1] if len(cmd['args']) > 1 else 0
            eff_ptn = cmd['args'][2] if len(cmd['args']) > 2 else 0
            eff_spd = cmd['args'][3] if len(cmd['args']) > 3 else 0
            lines.append(f"\t{char_id}, TYPE_{eff_type}, PTN_{eff_ptn}, SPD_{eff_spd},\t\t/* {frame} */")
        lines.append("};")
        lines.append("")
    else:
        lines.append("Uint32 EffectID[] = {")
        lines.append("\tNULL, NULL,")
        lines.append("};")
        lines.append("")
    
    # === VoiceName[] (separate from SoundEffectName) ===
    if voice_cmds:
        lines.append("char *VoiceName[] = {")
        for frame, cmd in voice_cmds:
            str_idx = cmd['args'][1] if len(cmd['args']) > 1 else -1
            if str_idx >= 0 and str_idx < len(result.get('strings', [])):
                lines.append(f'\t"{result["strings"][str_idx]}",')
        lines.append("};")
        lines.append("")
    
    # === Sound Effects ===
    se_cmds = []
    se_str_indices = []
    for scene in result.get('scenes', []):
        for cmd in scene.get('commands', []):
            if cmd['type'] == 6:  # stSE
                se_cmds.append((scene['frame'], cmd))
                if len(cmd['args']) > 2:
                    se_str_indices.append(cmd['args'][2])
    
    if se_cmds:
        lines.append("Uint32 SoundEffectID[] = {")
        for frame, cmd in se_cmds:
            char_id = id_to_name(cmd['args'][0]) if len(cmd['args']) > 0 else "??"
            se_id = cmd['args'][1] if len(cmd['args']) > 1 else 0
            str_idx = cmd['args'][2] if len(cmd['args']) > 2 else -1
            
            se_path = ""
            if str_idx >= 0 and str_idx < len(result.get('strings', [])):
                se_path = result['strings'][str_idx]
            
            # Generate symbolic SE name from path
            se_name = f"VSE_{se_id:X}"
            if se_path:
                basename = os.path.splitext(os.path.basename(se_path))[0]
                se_name = f"V{basename.lower()}"
            
            lines.append(f"\t{char_id}, {se_name},\t\t/* {frame} */\t/* {se_path} */")
        lines.append("};")
        lines.append("")
        
        # SoundEffectName[]
        lines.append("char *SoundEffectName[] = {")
        for frame, cmd in se_cmds:
            str_idx = cmd['args'][2] if len(cmd['args']) > 2 else -1
            if str_idx >= 0 and str_idx < len(result.get('strings', [])):
                lines.append(f'\t"{result["strings"][str_idx]}",')
        lines.append("};")
    
    return '\n'.join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: python seq_decompiler.py <SEQDATA.AUTH> [output.c]")
        print("  Decompiles compiled cutscene data back to C struct format.")
        print("  Compare output against leaked 0154_1.C to calibrate.")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else input_path.replace('.AUTH', '_decompiled.c')
    
    print(f"Decoding {input_path}...")
    result = decode_auth(input_path)
    
    if not result:
        print("Failed to decode.")
        sys.exit(1)
    
    print(f"  Scenes: {len(result['scenes'])}")
    print(f"  Cameras: {len(result['cameras'])}")
    print(f"  Movements: {len(result['movements'])}")
    print(f"  Strings: {len(result['strings'])}")
    
    # Print scene timeline
    print(f"\n  Scene Timeline (nframes={result['nframes']}):")
    for scene in result['scenes']:
        frame = scene['frame']
        cmd_summary = ', '.join([
            f"{cmd['type_name']}({', '.join([id_to_name(a) if i==0 else str(a) for i,a in enumerate(cmd['args'])])})"
            for cmd in scene['commands']
        ])
        print(f"    Frame {frame:5d}: {cmd_summary}")
    
    # Generate C source
    c_source = emit_c_source(result)
    
    with open(output_path, 'w') as f:
        f.write(c_source)
    
    print(f"\nDecompiled -> {output_path} ({len(c_source)} bytes)")


if __name__ == '__main__':
    main()

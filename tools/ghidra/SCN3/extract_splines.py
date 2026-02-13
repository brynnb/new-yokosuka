"""
Interactive Spline Extractor
=============================
Detects and extracts FCVKEYt spline headers from MAPINFO.BIN files.
Reconstructs NPC patrol paths and walk routes using the same cubic
interpolation logic used in cutscene SEQ files.

Unlike SEQ files (which have explicit ACAM/AMOV chunk headers), MAPINFO.BIN
embeds spline data inline within the data section. This tool uses heuristic
pattern matching to locate FCVKEYt arrays.

Usage:
    python3 extract_splines.py <MAPINFO.BIN> [output.json]

Example:
    python3 extract_splines.py extracted_disc2_v2/data/SCENE/02/JOMO/MAPINFO.BIN jomo_splines.json
"""

import struct
import json
import sys
import os
import math


# ================================================================
# FCVKEYt DETECTION HEURISTICS
# ================================================================
# From SEQCONV.C and SEQ_RESEARCH.md:
#   Each spline channel stores:
#     [4] n = key count (int32)
#     [n*4] times  (float32[]) — monotonically increasing, range [0, duration]
#     [n*4] values (float32[]) — coordinate/angle values
#     [n*4] slopes (float32[]) — tangent values for cubic interpolation
#
# Detection strategy:
#   1. Find a plausible key count (2 <= n <= 500)
#   2. Verify the times array is monotonically non-decreasing
#   3. Verify values and slopes are within reasonable ranges
#   4. Check that the total byte footprint (4 + 3*n*4) doesn't exceed file bounds

MIN_KEYS = 2
MAX_KEYS = 500
MAX_TIME = 600.0       # 10 minutes at 30fps
MAX_COORD = 10000.0    # Reasonable coordinate range
MAX_SLOPE = 50000.0    # Slopes can be large for sharp turns


def read_f32(data, off):
    return struct.unpack_from('<f', data, off)[0]


def read_i32(data, off):
    return struct.unpack_from('<i', data, off)[0]


def is_valid_float(f):
    """Check if float is finite and not NaN."""
    return f == f and not math.isinf(f)


def try_decode_spline_channel(data, off):
    """Attempt to decode a spline channel starting at offset.

    Returns (channel_data, next_offset) or (None, off) on failure.
    """
    if off + 4 > len(data):
        return None, off

    n = read_i32(data, off)

    # Validate key count
    if n < MIN_KEYS or n > MAX_KEYS:
        return None, off

    # Check we have enough data: 4 (count) + 3 * n * 4 (times + values + slopes)
    total_size = 4 + 3 * n * 4
    if off + total_size > len(data):
        return None, off

    time_off = off + 4
    value_off = time_off + n * 4
    slope_off = value_off + n * 4

    # Read and validate times (must be monotonically non-decreasing)
    times = []
    for i in range(n):
        t = read_f32(data, time_off + i * 4)
        if not is_valid_float(t):
            return None, off
        if t < -0.01 or t > MAX_TIME:
            return None, off
        if times and t < times[-1] - 0.001:  # Allow tiny float imprecision
            return None, off
        times.append(t)

    # Read and validate values
    values = []
    for i in range(n):
        v = read_f32(data, value_off + i * 4)
        if not is_valid_float(v):
            return None, off
        if abs(v) > MAX_COORD:
            return None, off
        values.append(v)

    # Read and validate slopes
    slopes = []
    for i in range(n):
        s = read_f32(data, slope_off + i * 4)
        if not is_valid_float(s):
            return None, off
        if abs(s) > MAX_SLOPE:
            return None, off
        slopes.append(s)

    # Reconstruct FCVKEYt entries (same logic as seq_decompiler.py)
    keyframes = []
    i = 0
    while i < n:
        time = times[i]
        value = values[i]
        frame = int(round(time * 30))

        if i == 0 or i >= n - 1:
            # First/last key: single entry
            keyframes.append({
                'time': round(time, 6),
                'value': round(value, 6),
                'left_slope': round(slopes[i], 6),
                'right_slope': round(slopes[i], 6),
                'frame': frame,
            })
            i += 1
        else:
            # Middle key: two entries (left/right slope pair)
            left_slope = slopes[i]
            right_slope = slopes[i + 1] if i + 1 < n else left_slope
            keyframes.append({
                'time': round(time, 6),
                'value': round(value, 6),
                'left_slope': round(left_slope, 6),
                'right_slope': round(right_slope, 6),
                'frame': frame,
            })
            i += 2

    channel = {
        'raw_key_count': n,
        'keyframe_count': len(keyframes),
        'duration': round(times[-1], 4) if times else 0,
        'duration_frames': int(round(times[-1] * 30)) if times else 0,
        'value_range': [round(min(values), 4), round(max(values), 4)],
        'keyframes': keyframes,
    }

    next_off = slope_off + n * 4
    return channel, next_off


def detect_spline_groups(data, start_offset=0):
    """Scan binary data for groups of consecutive spline channels.

    In MAPINFO.BIN, splines for entity paths are stored as groups of
    3 channels (X, Y, Z) or 9 channels (trsXYZ, rotXYZ, kaoXYZ).
    """
    spline_groups = []
    off = start_offset

    while off < len(data) - 16:
        # Try to decode a spline channel
        channel, next_off = try_decode_spline_channel(data, off)

        if channel is None:
            off += 4  # Advance by alignment
            continue

        # Found a valid channel — try to read consecutive channels
        group_start = off
        channels = [channel]
        off = next_off

        # Try to read more consecutive channels (up to 9 for full movement data)
        for _ in range(8):
            ch, new_off = try_decode_spline_channel(data, off)
            if ch is None:
                break
            channels.append(ch)
            off = new_off

        # Classify the group
        num_channels = len(channels)
        if num_channels >= 3:
            # Determine type based on channel count
            if num_channels == 8:
                group_type = "camera"
                channel_names = ["camX", "camY", "camZ", "intX", "intY", "intZ", "roll", "pers"]
            elif num_channels == 9:
                group_type = "movement"
                channel_names = ["trsX", "trsY", "trsZ", "rotX", "rotY", "rotZ", "kaoX", "kaoY", "kaoZ"]
            elif num_channels == 3:
                group_type = "position_path"
                channel_names = ["X", "Y", "Z"]
            elif num_channels == 6:
                group_type = "transform_path"
                channel_names = ["posX", "posY", "posZ", "rotX", "rotY", "rotZ"]
            else:
                group_type = f"spline_group_{num_channels}ch"
                channel_names = [f"ch{i}" for i in range(num_channels)]

            # Build path points by sampling the first 3 channels (position)
            path_points = _sample_path(channels[:3])

            group = {
                'offset': f"0x{group_start:X}",
                'offset_end': f"0x{off:X}",
                'byte_size': off - group_start,
                'type': group_type,
                'channel_count': num_channels,
                'channels': {
                    channel_names[i]: channels[i]
                    for i in range(num_channels)
                },
                'path_points': path_points,
            }
            spline_groups.append(group)
        elif num_channels == 1 and channel['raw_key_count'] >= 4:
            # Single channel with enough keys — could be a standalone animation curve
            group = {
                'offset': f"0x{group_start:X}",
                'offset_end': f"0x{off:X}",
                'byte_size': off - group_start,
                'type': 'animation_curve',
                'channel_count': 1,
                'channels': {"value": channel},
                'path_points': [],
            }
            spline_groups.append(group)

    return spline_groups


def _sample_path(channels):
    """Sample position path from first 3 channels (X, Y, Z) at keyframe times."""
    if len(channels) < 3:
        return []

    points = []
    # Use the channel with the most keyframes as the time reference
    ref_channel = max(channels[:3], key=lambda c: len(c['keyframes']))

    for kf in ref_channel['keyframes']:
        t = kf['time']
        # Find closest value in each channel at this time
        x = _interpolate_at_time(channels[0], t)
        y = _interpolate_at_time(channels[1], t)
        z = _interpolate_at_time(channels[2], t)

        points.append({
            'time': round(t, 4),
            'frame': kf['frame'],
            'x': round(x, 4),
            'y': round(y, 4),
            'z': round(z, 4),
        })

    return points


def _interpolate_at_time(channel, t):
    """Find the value of a channel at time t using nearest keyframe."""
    kfs = channel['keyframes']
    if not kfs:
        return 0.0

    # Find bracketing keyframes
    for i, kf in enumerate(kfs):
        if kf['time'] >= t:
            if i == 0:
                return kf['value']
            # Linear interpolation between kfs[i-1] and kfs[i]
            prev = kfs[i - 1]
            dt = kf['time'] - prev['time']
            if dt < 0.0001:
                return kf['value']
            frac = (t - prev['time']) / dt
            return prev['value'] + frac * (kf['value'] - prev['value'])

    return kfs[-1]['value']


def cubic_interpolate(p0, p1, t0, t1, s0, s1, t):
    """Hermite cubic interpolation between two keyframes.

    This matches the game engine's spline evaluation:
      p(t) = h00*p0 + h10*m0 + h01*p1 + h11*m1
    where h00..h11 are Hermite basis functions.
    """
    dt = t1 - t0
    if abs(dt) < 1e-10:
        return p0

    u = (t - t0) / dt
    u2 = u * u
    u3 = u2 * u

    h00 = 2*u3 - 3*u2 + 1
    h10 = u3 - 2*u2 + u
    h01 = -2*u3 + 3*u2
    h11 = u3 - u2

    m0 = s0 * dt
    m1 = s1 * dt

    return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1


def extract_splines(mapinfo_path, output_path):
    """Extract all spline data from a MAPINFO.BIN file."""
    with open(mapinfo_path, 'rb') as f:
        data = f.read()

    print(f"=== Interactive Spline Extractor ===")
    print(f"  Input:  {mapinfo_path} ({len(data)} bytes)")

    # Find SCN3 section if present
    scn3_offset = data.find(b'SCN3')
    if scn3_offset >= 0:
        print(f"  SCN3 header at offset 0x{scn3_offset:X}")

    # Scan the entire file for spline groups
    spline_groups = detect_spline_groups(data)

    # Build output
    output = {
        "metadata": {
            "source": os.path.basename(mapinfo_path),
            "tool": "extract_splines.py",
            "file_size": len(data),
            "scn3_offset": f"0x{scn3_offset:X}" if scn3_offset >= 0 else None,
            "total_spline_groups": len(spline_groups),
            "by_type": {},
        },
        "spline_groups": spline_groups,
    }

    # Count by type
    type_counts = {}
    for g in spline_groups:
        t = g['type']
        type_counts[t] = type_counts.get(t, 0) + 1
    output["metadata"]["by_type"] = type_counts

    # Extract just the path points for easy Babylon.js import
    paths = []
    for i, g in enumerate(spline_groups):
        if g['path_points']:
            paths.append({
                'id': f"path_{i}",
                'type': g['type'],
                'offset': g['offset'],
                'points': g['path_points'],
            })
    output["paths"] = paths

    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"  Spline groups found: {len(spline_groups)}")
    for t, c in sorted(type_counts.items()):
        print(f"    {t:20s}: {c}")
    print(f"  Extractable paths:   {len(paths)}")
    print(f"  Output:              {output_path}")

    return output


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 extract_splines.py <MAPINFO.BIN> [output.json]")
        print("  Extracts FCVKEYt spline data for NPC paths and walk routes.")
        sys.exit(1)

    mapinfo_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else mapinfo_path.replace('.BIN', '_splines.json')

    extract_splines(mapinfo_path, output_path)

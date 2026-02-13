"""
Ground Truth Validation: Decompiled vs Known Source
====================================================
Compares the decompiled output from seq_decompiler.py against the known
developer source code (0154_1.C from sourceexample.md) to measure
reconstruction accuracy.

The source file 0154_1.C was left in the game at \SCENE\99\MS08\ and
represents the "ground truth" for cutscene 0154 in Warehouse 8.

This script:
1. Parses the known source C file to extract FCVKEYt arrays
2. Parses the decompiled C file to extract the same
3. Compares float values, structure names, frame numbers, and entity IDs
4. Reports accuracy metrics

Usage:
    python3 validate_against_source.py <decompiled.c> <source.c>
    python3 validate_against_source.py ms08_seq6_decompiled.c -  # uses embedded source
"""

import re
import sys
import os
import math


def parse_fcvkey_arrays(text):
    """Parse all FCVKEYt arrays from C source text.

    Returns dict of { array_name: [ (time, left_slope, right_slope, value, frame), ... ] }
    """
    arrays = {}
    # Match: FCVKEYt name[] = { ... };
    pattern = r'FCVKEYt\s+(\w+)\[\]\s*=\s*\{([^;]+)\};'
    for m in re.finditer(pattern, text, re.DOTALL):
        name = m.group(1)
        body = m.group(2)

        entries = []
        # Match each { time, ls, rs, val },  /* frame */
        entry_pat = r'\{\s*([^}]+)\}'
        frame_pat = r'/\*\s*(\d+)\s*\*/'
        for em in re.finditer(entry_pat, body):
            vals = [v.strip() for v in em.group(1).split(',')]
            if len(vals) >= 4:
                try:
                    t = float(vals[0])
                    ls = float(vals[1])
                    rs = float(vals[2])
                    v = float(vals[3])
                except ValueError:
                    continue

                # Find frame comment after this entry
                rest = body[em.end():]
                fm = re.search(frame_pat, rest[:50])
                frame = int(fm.group(1)) if fm else -1

                entries.append((t, ls, rs, v, frame))

        if entries:
            arrays[name] = entries

    return arrays


def parse_move_ids(text):
    """Parse MoveID[] array to get character assignments."""
    ids = []
    m = re.search(r'Uint32\s+MoveID\[\]\s*=\s*\{([^;]+)\};', text, re.DOTALL)
    if m:
        body = m.group(1)
        for line in body.strip().split('\n'):
            line = line.strip().rstrip(',')
            if line and not line.startswith('/*'):
                parts = [p.strip() for p in line.split(',') if p.strip()]
                if len(parts) >= 2:
                    ids.append((parts[0], parts[1]))
    return ids


def parse_voice_ids(text):
    """Parse VoiceID[] array."""
    voices = []
    m = re.search(r'Uint32\s+VoiceID\[\]\s*=\s*\{([^;]+)\};', text, re.DOTALL)
    if m:
        body = m.group(1)
        for line in body.strip().split('\n'):
            line = line.strip().rstrip(',')
            # Extract frame from comment
            fm = re.search(r'/\*\s*(\d+)\s*\*/', line)
            frame = int(fm.group(1)) if fm else -1
            # Extract path from comment
            pm = re.search(r'/\*.*(/p16/[^*]+)\s*\*/', line)
            path = pm.group(1).strip() if pm else ""
            if 'ID_' in line:
                parts = [p.strip() for p in line.split(',') if p.strip()]
                if len(parts) >= 2:
                    char_id = parts[0]
                    voices.append((char_id, path, frame))
    return voices


def parse_motion_ids(text):
    """Parse MotionID[] array."""
    motions = []
    m = re.search(r'Uint32\s+MotionID\[\]\s*=\s*\{([^;]+)\};', text, re.DOTALL)
    if m:
        body = m.group(1)
        for line in body.strip().split('\n'):
            line = line.strip().rstrip(',')
            fm = re.search(r'/\*\s*(\d+)\s*\*/', line)
            frame = int(fm.group(1)) if fm else -1
            pm = re.search(r'/\*.*(/p16/[^*]+)\s*\*/', line)
            path = pm.group(1).strip() if pm else ""
            parts = [p.strip() for p in line.split(',') if p.strip()]
            if len(parts) >= 5 and 'ID_' in parts[0]:
                motions.append({
                    'char': parts[0],
                    'motion': parts[1],
                    'start': int(parts[2]) if parts[2].isdigit() else parts[2],
                    'end': int(parts[3]) if parts[3].isdigit() else parts[3],
                    'frame': frame,
                    'path': path,
                })
    return motions


def compare_float_arrays(src_arr, dec_arr, tolerance=0.001):
    """Compare two FCVKEYt arrays by matching float values.

    Since the compiled AUTH may have a time offset, we match by VALUE
    rather than by time. Returns match statistics.
    """
    # Build a set of (value, left_slope, right_slope) tuples from source
    src_values = set()
    for t, ls, rs, v, f in src_arr:
        src_values.add(round(v, 4))

    dec_values = set()
    for t, ls, rs, v, f in dec_arr:
        dec_values.add(round(v, 4))

    # Count matches
    matched = src_values & dec_values
    src_only = src_values - dec_values
    dec_only = dec_values - src_values

    return {
        'src_count': len(src_arr),
        'dec_count': len(dec_arr),
        'src_unique_values': len(src_values),
        'dec_unique_values': len(dec_values),
        'matched_values': len(matched),
        'src_only_values': len(src_only),
        'dec_only_values': len(dec_only),
        'value_match_pct': 100.0 * len(matched) / max(len(src_values), 1),
    }


def compare_full_entries(src_arr, dec_arr, tolerance=0.0005):
    """Compare FCVKEYt entries by matching full (value, left_slope, right_slope) tuples."""
    def _key(t, ls, rs, v):
        return (round(v, 4), round(ls, 4), round(rs, 4))

    src_keys = {}
    for t, ls, rs, v, f in src_arr:
        k = _key(t, ls, rs, v)
        src_keys[k] = (t, ls, rs, v, f)

    dec_keys = {}
    for t, ls, rs, v, f in dec_arr:
        k = _key(t, ls, rs, v)
        dec_keys[k] = (t, ls, rs, v, f)

    matched = set(src_keys.keys()) & set(dec_keys.keys())
    return {
        'src_entries': len(src_keys),
        'dec_entries': len(dec_keys),
        'full_matches': len(matched),
        'full_match_pct': 100.0 * len(matched) / max(len(src_keys), 1),
    }


def detect_time_offset(src_arr, dec_arr):
    """Try to detect a constant time offset between source and decompiled arrays.

    Matches entries by their (value, slopes) tuple and computes the time difference.
    """
    offsets = []
    for st, sls, srs, sv, sf in src_arr:
        for dt, dls, drs, dv, df in dec_arr:
            if (abs(sv - dv) < 0.001 and abs(sls - dls) < 0.001 and abs(srs - drs) < 0.001):
                offsets.append(dt - st)
                break

    if not offsets:
        return None, 0

    # Find most common offset (mode)
    from collections import Counter
    rounded = [round(o, 2) for o in offsets]
    counter = Counter(rounded)
    best_offset, count = counter.most_common(1)[0]
    return best_offset, count


def validate(decompiled_path, source_text):
    """Run full validation comparison."""
    with open(decompiled_path, 'r') as f:
        dec_text = f.read()

    print("=" * 70)
    print("  GROUND TRUTH VALIDATION: Decompiled vs Known Source (0154_1.C)")
    print("=" * 70)

    # Parse both
    src_arrays = parse_fcvkey_arrays(source_text)
    dec_arrays = parse_fcvkey_arrays(dec_text)

    print(f"\n  Source arrays:     {len(src_arrays)}")
    print(f"  Decompiled arrays: {len(dec_arrays)}")

    # ================================================================
    # 1. STRUCTURAL COMPARISON
    # ================================================================
    print(f"\n{'='*70}")
    print("  1. STRUCTURAL COMPARISON")
    print(f"{'='*70}")

    src_names = set(src_arrays.keys())
    dec_names = set(dec_arrays.keys())
    common = src_names & dec_names
    src_only = src_names - dec_names
    dec_only = dec_names - src_names

    print(f"  Common array names:      {len(common)}")
    if common:
        for n in sorted(common):
            print(f"    ✓ {n}")
    print(f"  Source-only arrays:      {len(src_only)}")
    if src_only:
        for n in sorted(src_only):
            print(f"    - {n}")
    print(f"  Decompiled-only arrays:  {len(dec_only)}")
    if dec_only:
        for n in sorted(dec_only):
            print(f"    + {n}")

    # ================================================================
    # 2. FLOAT VALUE COMPARISON (for common arrays)
    # ================================================================
    print(f"\n{'='*70}")
    print("  2. FLOAT VALUE ACCURACY (common arrays)")
    print(f"{'='*70}")

    total_src_values = 0
    total_matched = 0
    total_full_matches = 0
    total_src_entries = 0

    for name in sorted(common):
        src = src_arrays[name]
        dec = dec_arrays[name]

        val_stats = compare_float_arrays(src, dec)
        full_stats = compare_full_entries(src, dec)
        offset, offset_count = detect_time_offset(src, dec)

        total_src_values += val_stats['src_unique_values']
        total_matched += val_stats['matched_values']
        total_full_matches += full_stats['full_matches']
        total_src_entries += full_stats['src_entries']

        print(f"\n  {name}:")
        print(f"    Entries:       src={val_stats['src_count']:3d}  dec={val_stats['dec_count']:3d}")
        print(f"    Value match:   {val_stats['matched_values']}/{val_stats['src_unique_values']} "
              f"({val_stats['value_match_pct']:.1f}%)")
        print(f"    Full match:    {full_stats['full_matches']}/{full_stats['src_entries']} "
              f"({full_stats['full_match_pct']:.1f}%)")
        if offset is not None:
            print(f"    Time offset:   {offset:+.2f}s ({offset_count} matches)")

    if total_src_values > 0:
        overall_val_pct = 100.0 * total_matched / total_src_values
        overall_full_pct = 100.0 * total_full_matches / max(total_src_entries, 1)
        print(f"\n  OVERALL VALUE ACCURACY:  {total_matched}/{total_src_values} ({overall_val_pct:.1f}%)")
        print(f"  OVERALL FULL ACCURACY:   {total_full_matches}/{total_src_entries} ({overall_full_pct:.1f}%)")

    # ================================================================
    # 3. CROSS-ARRAY VALUE MATCHING (for non-common arrays)
    # ================================================================
    if src_only or dec_only:
        print(f"\n{'='*70}")
        print("  3. CROSS-ARRAY VALUE MATCHING")
        print(f"{'='*70}")
        print("  Checking if source-only arrays have matching values in decompiled-only arrays...")

        for sname in sorted(src_only):
            src = src_arrays[sname]
            best_match = None
            best_pct = 0
            for dname in sorted(dec_only):
                dec = dec_arrays[dname]
                stats = compare_float_arrays(src, dec)
                if stats['value_match_pct'] > best_pct:
                    best_pct = stats['value_match_pct']
                    best_match = dname

            if best_match and best_pct > 30:
                offset, _ = detect_time_offset(src, dec_arrays[best_match])
                print(f"  {sname:25s} -> {best_match:25s}  ({best_pct:.1f}% value match, offset={offset})")
            else:
                print(f"  {sname:25s} -> NO MATCH (best: {best_pct:.1f}%)")

    # ================================================================
    # 4. ENTITY ID COMPARISON
    # ================================================================
    print(f"\n{'='*70}")
    print("  4. ENTITY ID COMPARISON")
    print(f"{'='*70}")

    src_moves = parse_move_ids(source_text)
    dec_moves = parse_move_ids(dec_text)

    print(f"  Source MoveID:     {src_moves}")
    print(f"  Decompiled MoveID: {dec_moves}")

    # Compare voice paths
    src_voices = parse_voice_ids(source_text)
    dec_voices = parse_voice_ids(dec_text)

    voice_path_matches = 0
    for sv in src_voices:
        for dv in dec_voices:
            if sv[1] and dv[1] and sv[1].strip() == dv[1].strip():
                voice_path_matches += 1
                break

    print(f"\n  Voice IDs:  src={len(src_voices)}  dec={len(dec_voices)}")
    print(f"  Voice path matches: {voice_path_matches}/{len(src_voices)}")

    # Compare motion data
    src_motions = parse_motion_ids(source_text)
    dec_motions = parse_motion_ids(dec_text)

    motion_frame_matches = 0
    for sm in src_motions:
        for dm in dec_motions:
            if sm['start'] == dm['start'] and sm['end'] == dm['end']:
                motion_frame_matches += 1
                break

    print(f"\n  Motion IDs: src={len(src_motions)}  dec={len(dec_motions)}")
    print(f"  Motion frame range matches: {motion_frame_matches}/{len(src_motions)}")

    if src_motions and dec_motions:
        print(f"\n  Motion detail comparison:")
        for sm in src_motions:
            matched = False
            for dm in dec_motions:
                if sm['start'] == dm['start'] and sm['end'] == dm['end']:
                    char_match = "✓" if sm['char'] == dm['char'] else f"✗ ({sm['char']} vs {dm['char']})"
                    path_match = "✓" if sm.get('path') and dm.get('path') and sm['path'].strip() == dm['path'].strip() else ""
                    print(f"    frame {sm['frame']:5d}: {sm['char']:8s} [{sm['start']:4d}-{sm['end']:4d}] char={char_match} {path_match}")
                    matched = True
                    break
            if not matched:
                print(f"    frame {sm['frame']:5d}: {sm['char']:8s} [{sm['start']:4d}-{sm['end']:4d}] NO MATCH in decompiled")

    # ================================================================
    # SUMMARY
    # ================================================================
    print(f"\n{'='*70}")
    print("  SUMMARY")
    print(f"{'='*70}")
    if total_src_values > 0:
        print(f"  Float value reconstruction:  {overall_val_pct:.1f}%")
        print(f"  Full entry reconstruction:   {overall_full_pct:.1f}%")
    print(f"  Array name reconstruction:   {len(common)}/{len(src_names)} ({100*len(common)/max(len(src_names),1):.0f}%)")
    print(f"  Voice path reconstruction:   {voice_path_matches}/{len(src_voices)} ({100*voice_path_matches/max(len(src_voices),1):.0f}%)")
    print(f"  Motion range reconstruction: {motion_frame_matches}/{len(src_motions)} ({100*motion_frame_matches/max(len(src_motions),1):.0f}%)")
    print(f"{'='*70}")


# ================================================================
# EMBEDDED SOURCE (first portion of 0154_1.C from sourceexample.md)
# We only embed the parts we can compare: camera + first movement
# ================================================================
EMBEDDED_SOURCE_PATH = None  # Will be loaded from sourceexample.md if available


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 validate_against_source.py <decompiled.c> [source.c]")
        print("  Compares decompiled SEQ output against known 0154_1.C source.")
        sys.exit(1)

    decompiled_path = sys.argv[1]

    if len(sys.argv) >= 3 and sys.argv[2] != '-':
        with open(sys.argv[2], 'r') as f:
            source_text = f.read()
    else:
        # Try to load from sourceexample.md
        script_dir = os.path.dirname(os.path.abspath(__file__))
        source_md = os.path.join(script_dir, '..', '..', 'docs', 'sourceexample.md')
        if os.path.exists(source_md):
            with open(source_md, 'r') as f:
                md_text = f.read()
            # Extract the C code between <pre> tags
            m = re.search(r'<pre[^>]*>(.*?)</pre>', md_text, re.DOTALL)
            if m:
                source_text = m.group(1)
            else:
                # Try extracting everything after the first FCVKEYt
                idx = md_text.find('FCVKEYt')
                if idx >= 0:
                    source_text = md_text[idx:]
                else:
                    print(f"ERROR: Could not extract C source from {source_md}")
                    sys.exit(1)
            print(f"  Loaded source from: {source_md}")
        else:
            print(f"ERROR: No source file provided and {source_md} not found")
            sys.exit(1)

    validate(decompiled_path, source_text)

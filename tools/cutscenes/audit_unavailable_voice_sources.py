"""Look up unresolved AUTH voice IDs in US disc AFS member and native IDX0 directories."""

import argparse
import hashlib
import json
import mmap
import struct
from collections import defaultdict
from pathlib import Path

from tools.scripting.extract_dialogue_inventory import parse_afs


def audit_voices(presentation, disc_roots):
    requested = defaultdict(list)
    for package in presentation["packages"]:
        for cue in package["unavailableVoices"]:
            requested[cue["voice"].upper()].append({"package": package["id"], "sourcePath": cue["sourcePath"]})

    matches = {name: {"afsMembers": [], "idxEntries": []} for name in requested}
    discs = []
    for disc, root in enumerate(disc_roots, 1):
        if not root.is_dir():
            raise FileNotFoundError(root)
        afs_count = member_count = anonymous_count = idx_count = entry_count = 0
        other_indexes = []
        digest = hashlib.sha256()
        for filename in sorted(root.rglob("*.[Aa][Ff][Ss]")):
            name = filename.relative_to(root).as_posix()
            with filename.open("rb") as archive, mmap.mmap(archive.fileno(), 0, access=mmap.ACCESS_READ) as data:
                members = parse_afs(data)
            afs_count += 1
            member_count += len(members)
            digest.update(f"AFS {name}\n".encode())
            for member in members:
                digest.update(f"{member.index} {member.offset} {member.size} {member.name}\n".encode())
                if member.name.startswith("member_"):
                    anonymous_count += 1
                key = Path(member.name).stem.upper()
                if key in matches:
                    matches[key]["afsMembers"].append({"disc": disc, "path": name, "index": member.index,
                                                       "member": member.name, "size": member.size})

        for filename in sorted(root.rglob("*.[Ii][Dd][Xx]")):
            name = filename.relative_to(root).as_posix()
            data = filename.read_bytes()
            if data[:4] != b"IDX0":
                other_indexes.append(name)
                continue
            # The first ushort counts AFS members, including subtitles; the
            # second counts logical voice entries, including cross-stream aliases.
            count = struct.unpack_from("<H", data, 6)[0]
            if len(data) != (count + 1) * 20:
                raise ValueError(f"Unexpected IDX0 directory length in {filename}")
            digest.update(f"IDX0 {name}\n".encode())
            digest.update(data)
            idx_count += 1
            entry_count += count
            for row in range(count):
                offset = (row + 1) * 20
                key = data[offset:offset + 12].partition(b"\0")[0].decode("ascii").upper()
                if key in matches:
                    matches[key]["idxEntries"].append({"disc": disc, "path": name, "offset": offset})
        discs.append({"disc": disc, "afsArchives": afs_count, "afsMembers": member_count,
                      "unnamedMembers": anonymous_count, "idx0Tables": idx_count, "idx0VoiceEntries": entry_count,
                      "nonVoiceIndexPaths": other_indexes, "directorySha256": digest.hexdigest()})
    return {"schema": "new-yokosuka-unavailable-voice-source-audit-v1",
            "scope": "Exact case-insensitive source IDs in all named AFS members and IDX0 voice keys in the three extracted US Dreamcast discs. An absent ID does not identify a replacement recording or establish intended silence.",
            "discs": discs, "voices": [{"id": name, "requests": requested[name], **matches[name]} for name in sorted(requested)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--presentation-audit", type=Path, required=True)
    parser.add_argument("--disc-roots", type=Path, nargs=3, default=[Path("extracted_files"), Path("extracted_disc2_v2"), Path("extracted_disc3_v2")])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = audit_voices(json.loads(args.presentation_audit.read_text()), args.disc_roots)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    found = sum(bool(voice["afsMembers"] or voice["idxEntries"]) for voice in report["voices"])
    print(f"{len(report['voices'])} unresolved voice IDs reviewed; {found} with an exact disc directory match.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Inspect PSP PBP container metadata without extracting proprietary firmware."""
import argparse
import json
import struct
from pathlib import Path

SECTIONS = ("PARAM.SFO", "ICON0.PNG", "ICON1.PMF", "PIC0.PNG", "PIC1.PNG", "SND0.AT3", "DATA.PSP", "DATA.PSAR")

def inspect(path: Path):
    size = path.stat().st_size
    with path.open("rb") as stream:
        header = stream.read(40)
        if len(header) != 40 or header[:4] != b"\x00PBP":
            raise ValueError("Not a PSP PBP container")
        version = struct.unpack_from("<I", header, 4)[0]
        offsets = struct.unpack_from("<8I", header, 8)
        if offsets[0] < 40 or list(offsets) != sorted(offsets) or offsets[-1] > size:
            raise ValueError("Invalid PBP section offsets")
        sections = {name: {"offset": start, "size": end - start} for name, start, end in zip(SECTIONS, offsets, offsets[1:] + (size,))}
        metadata = {}
        sfo = sections["PARAM.SFO"]
        if 20 <= sfo["size"] <= 1024 * 1024:
            stream.seek(sfo["offset"])
            data = stream.read(sfo["size"])
            if data[:4] == b"\x00PSF":
                keys, values, count = struct.unpack_from("<III", data, 8)
                if count <= 4096 and 20 + count * 16 <= len(data):
                    for i in range(count):
                        key_off, fmt, length, _, value_off = struct.unpack_from("<HHIII", data, 20 + i * 16)
                        key_start, value_start = keys + key_off, values + value_off
                        if key_start >= len(data) or value_start + length > len(data):
                            continue
                        key = data[key_start:].split(b"\0", 1)[0].decode("utf-8", "replace")
                        raw = data[value_start:value_start + length]
                        if fmt == 0x0404 and length >= 4:
                            metadata[key] = struct.unpack_from("<I", raw)[0]
                        elif fmt in (0x0004, 0x0204):
                            metadata[key] = raw.split(b"\0", 1)[0].decode("utf-8", "replace")
        return {"file": path.name, "bytes": size, "pbp_format_version": f"{version >> 16}.{version & 0xffff}", "sections": sections, "metadata": metadata, "note": "PBP metadata alone does not prove UMD Video playback."}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbp", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(inspect(args.pbp), indent=2, ensure_ascii=False))
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Error: {exc}\n")

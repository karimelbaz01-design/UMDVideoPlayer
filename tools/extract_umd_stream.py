#!/usr/bin/env python3
"""Extract UMD_VIDEO/STREAM/00001.MPS from an ISO9660 UMD Video image.

Streaming extraction: no need to load the full ~1 GB ISO in RAM.
This is an offline preparation step, NOT an iPhone/Safari transcoder.
"""
import argparse
import pathlib
import struct

SECTOR = 2048


def directory_records(data):
    pos = 0
    while pos < len(data):
        size = data[pos]
        if not size:
            pos = ((pos // SECTOR) + 1) * SECTOR
            continue
        record = data[pos:pos + size]
        if len(record) < 34:
            raise ValueError("Malformed ISO9660 directory record")
        extent = struct.unpack_from("<I", record, 2)[0]
        length = struct.unpack_from("<I", record, 10)[0]
        flags = record[25]
        name_length = record[32]
        name = record[33:33 + name_length].decode("ascii", errors="replace")
        yield name, extent, length, flags
        pos += size


def read_extent(f, extent, length):
    f.seek(extent * SECTOR)
    data = f.read(length)
    if len(data) != length:
        raise ValueError("Truncated ISO image")
    return data


def locate(f, path):
    f.seek(16 * SECTOR)
    pvd = f.read(SECTOR)
    if pvd[0] != 1 or pvd[1:6] != b"CD001":
        raise ValueError("ISO9660 primary volume descriptor missing")
    root = pvd[156:190]
    extent = struct.unpack_from("<I", root, 2)[0]
    length = struct.unpack_from("<I", root, 10)[0]
    for component in path.split("/"):
        entries = directory_records(read_extent(f, extent, length))
        match = next(((e, n, flags) for name, e, n, flags in entries
                      if name.split(";")[0].upper() == component.upper()), None)
        if match is None:
            raise FileNotFoundError(f"Missing ISO entry: {component}")
        extent, length, flags = match
    return extent, length


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("iso", type=pathlib.Path)
    p.add_argument("output", type=pathlib.Path)
    p.add_argument("--stream", default="UMD_VIDEO/STREAM/00001.MPS")
    args = p.parse_args()
    with args.iso.open("rb") as f:
        extent, length = locate(f, args.stream)
        f.seek(extent * SECTOR)
        with args.output.open("wb") as out:
            remaining = length
            while remaining:
                chunk = f.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError("Unexpected end of ISO")
                out.write(chunk)
                remaining -= len(chunk)
    print(f"Extracted {length} bytes from {args.stream} to {args.output}")


if __name__ == "__main__":
    main()

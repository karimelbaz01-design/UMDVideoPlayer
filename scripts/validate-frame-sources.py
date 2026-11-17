#!/usr/bin/env python3
"""Validate FRAME source references without pretending to compile iOS."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
project = (root / "project.yml").read_text(encoding="utf-8")
paths = []
inside_sources = False
for line in project.splitlines():
    if re.match(r"^    sources:\s*$", line):
        inside_sources = True
        continue
    if inside_sources and re.match(r"^    [A-Za-z_]+:", line):
        inside_sources = False
    if inside_sources:
        match = re.match(r"^      - (.+?)\s*$", line)
        if match:
            paths.append(match.group(1).strip('"\''))
if not paths:
    sys.exit("ERROR: no iOS source files found in project.yml")
missing = [p for p in paths if not (root / p).is_file()]
required = [
    "UMDVideoCore/src/platform/platform.h",
    "UMDVideoCore/src/app/main.c",
    "UMDVideoPlayer-Bridging-Header.h",
    "web/index.html",
    "web/app.js",
    "web/sw.js",
]
missing.extend(p for p in required if not (root / p).is_file())
if missing:
    for p in missing:
        print(f"ERROR: missing source: {p}", file=sys.stderr)
    sys.exit(1)
bridge = (root / "UMDVideoPlayer-Bridging-Header.h").read_text()
if "UMDVideoPlayerBridge.h" not in bridge:
    sys.exit("ERROR: UMD bridge not imported into Swift")
if "ios_umd_set_controller_input" not in bridge:
    sys.exit("ERROR: UMD controller input declaration unavailable to Swift")
print(f"PASS: {len(paths)} native source paths, UMD core, Swift bridge, and web shell exist")
print("NOTE: This is not a compiler test or proof of PSP/UMD playback.")

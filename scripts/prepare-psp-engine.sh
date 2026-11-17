#!/usr/bin/env bash
# Experimental PSP engine checkout. This does NOT yet link PPSSPP into FRAME.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="${ROOT}/.engine-work/ppsspp"
PPSSPP_REPO="https://github.com/hrydgard/ppsspp.git"
if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2; exit 1
fi
if [ -e "$ENGINE_DIR" ] && [ ! -d "$ENGINE_DIR/.git" ]; then
  echo "Refusing to overwrite an existing non-git directory: $ENGINE_DIR" >&2; exit 1
fi
if [ ! -d "$ENGINE_DIR/.git" ]; then
  mkdir -p "$(dirname "$ENGINE_DIR")"
  git clone --recursive "$PPSSPP_REPO" "$ENGINE_DIR"
else
  git -C "$ENGINE_DIR" submodule update --init --recursive
fi
echo "PPSSPP checkout: $(git -C "$ENGINE_DIR" rev-parse HEAD)"
echo "PPSSPP license: $ENGINE_DIR/LICENSE.TXT"
echo "Engine sources fetched. No FRAME PSP emulator linkage is configured yet."

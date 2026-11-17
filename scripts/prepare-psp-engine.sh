#!/usr/bin/env bash
# Experimental PSP engine checkout. This does NOT yet link PPSSPP into FRAME.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="${ROOT}/.engine-work/ppsspp"
PPSSPP_REPO="https://github.com/hrydgard/ppsspp.git"
# Known upstream revision: keep builds reproducible even when master changes.
PPSSPP_REVISION="79ae2476524a168c28199faf74938de35466dcb1"
if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2; exit 1
fi
if [ -e "$ENGINE_DIR" ] && [ ! -d "$ENGINE_DIR/.git" ]; then
  echo "Refusing to overwrite an existing non-git directory: $ENGINE_DIR" >&2; exit 1
fi
if [ ! -d "$ENGINE_DIR/.git" ]; then
  mkdir -p "$(dirname "$ENGINE_DIR")"
  git clone "$PPSSPP_REPO" "$ENGINE_DIR"
fi
# Refuse to reuse a checkout that points at a different upstream.
REMOTE="$(git -C "$ENGINE_DIR" remote get-url origin)"
if [ "$REMOTE" != "$PPSSPP_REPO" ]; then
  echo "Unexpected PPSSPP origin: $REMOTE" >&2; exit 1
fi
git -C "$ENGINE_DIR" fetch origin "$PPSSPP_REVISION"
git -C "$ENGINE_DIR" checkout --detach "$PPSSPP_REVISION"
git -C "$ENGINE_DIR" submodule sync --recursive
git -C "$ENGINE_DIR" submodule update --init --recursive
echo "PPSSPP checkout: $(git -C "$ENGINE_DIR" rev-parse HEAD)"
echo "PPSSPP license: $ENGINE_DIR/LICENSE.TXT"
echo "Engine sources fetched. No FRAME PSP emulator linkage is configured yet."

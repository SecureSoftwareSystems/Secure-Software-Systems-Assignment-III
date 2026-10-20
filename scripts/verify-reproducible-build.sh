#!/usr/bin/env bash
# SR-06: build a service twice from clean copies and check the output is byte-identical.
# Usage: scripts/verify-reproducible-build.sh <service-name>   (e.g. vote-integrity)
# Exit 0 = identical builds, 1 = builds differ, 2 = usage or build error.
set -euo pipefail

svc="${1:-}"
src="services/$svc"
if [ -z "$svc" ] || [ ! -f "$src/package-lock.json" ]; then
  echo "usage: $0 <service-name>   (needs services/<name>/package-lock.json)" >&2
  exit 2
fi

# sha256sum on Linux, shasum on macOS
if command -v sha256sum >/dev/null; then hash() { sha256sum "$@"; }; else hash() { shasum -a 256 "$@"; }; fi

build_once() {
  local dir; dir="$(mktemp -d)"
  cp -R "$src/." "$dir/"
  rm -rf "$dir/node_modules" "$dir/dist"
  (cd "$dir" && npm ci --silent >/dev/null && npm run build --silent >/dev/null) || { echo "build failed" >&2; exit 2; }
  (cd "$dir/dist" && find . -type f | LC_ALL=C sort | while read -r f; do hash "$f"; done | hash | cut -c1-64)
  rm -rf "$dir"
}

first="$(build_once)"
second="$(build_once)"
echo "$svc build 1: $first"
echo "$svc build 2: $second"
if [ "$first" = "$second" ]; then
  echo "PASS: $svc builds are byte-identical"
else
  echo "FAIL: $svc builds differ"
  exit 1
fi

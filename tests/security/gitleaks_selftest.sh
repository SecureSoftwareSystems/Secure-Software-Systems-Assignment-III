#!/usr/bin/env bash
# SR-16 security test: proves the secret scanner blocks a leaked credential.
# The fake token is generated at runtime, so no secret is ever committed.
set -uo pipefail

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0

# Test 1: a clean file must NOT be flagged (guards against a broken scanner "passing" test 2)
mkdir "$tmp/clean"
echo 'db_host = "localhost"' > "$tmp/clean/config.txt"
gitleaks detect --source="$tmp/clean" --no-git >/dev/null 2>&1
if [ $? -eq 0 ]; then echo "PASS: clean file not flagged"; else echo "FAIL: clean file was flagged"; fail=1; fi

# Test 2: a planted GitHub-format token MUST be flagged (exit code 1 = leaks found)
mkdir "$tmp/leak"
echo "token = \"ghp_$(openssl rand -hex 18)\"" > "$tmp/leak/config.txt"
gitleaks detect --source="$tmp/leak" --no-git >/dev/null 2>&1
if [ $? -eq 1 ]; then echo "PASS: planted token detected"; else echo "FAIL: planted token NOT detected"; fail=1; fi

exit $fail

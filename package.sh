#!/usr/bin/env bash
# Makes dist/refined-linkedin-<version>.zip: the extension ready for "Load unpacked", for a GitHub release. It holds
# only the files the extension runs, never config.local.js with Vlad's key.
set -euo pipefail
cd "$(dirname "$0")"
./build.sh >/dev/null
version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
name="refined-linkedin-$version"
rm -rf "dist/$name" "dist/$name.zip"
mkdir -p "dist/$name"
git ls-files -- manifest.json '*.js' '*.html' '*.css' 'icons/*' LICENSE | while read -r f; do
  mkdir -p "dist/$name/$(dirname "$f")"
  cp "$f" "dist/$name/$f"
done
cp build.js "dist/$name/"
if [ -e "dist/$name/config.local.js" ] || grep -rqs 'sk-bf-' "dist/$name"; then
  echo "refusing: the package would contain a key" >&2
  exit 1
fi
(cd dist && zip -qr "$name.zip" "$name")
rm -rf "dist/$name"
echo "dist/$name.zip"

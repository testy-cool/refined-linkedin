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
# Chrome names an unpacked extension after its folder, and keeps its notes and history under that name. The public
# key in release-key.txt gives every release one name instead, so loading a new version's folder replaces the old
# one and keeps everything. The checkout itself has no key: its name, and Vlad's data, stay tied to its folder.
python3 - "dist/$name/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
m["key"] = open("release-key.txt").read().strip()
json.dump(m, open(sys.argv[1], "w"), indent=2)
PY
if [ -e "dist/$name/config.local.js" ] || grep -rqs 'sk-bf-' "dist/$name"; then
  echo "refusing: the package would contain a key" >&2
  exit 1
fi
(cd dist && zip -qr "$name.zip" "$name")
rm -rf "dist/$name"
echo "dist/$name.zip"

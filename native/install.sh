#!/usr/bin/env bash
# Registers the Codex bridge with every Chrome and Chromium on this Linux user, for one extension id.
# Usage: native/install.sh <extension id>   (the settings page shows the command with the id filled in)
set -euo pipefail
id="${1:?usage: native/install.sh <extension id from the Refined LinkedIn settings page>}"
[[ "$id" =~ ^[a-p]{32}$ ]] || { echo "That is not a Chrome extension id: $id" >&2; exit 2; }
dir="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$dir/codex_host.py"
name=com.refined_linkedin.codex
done_any=
for conf in "$HOME/.config/google-chrome" "$HOME/.config/google-chrome-beta" "$HOME/.config/google-chrome-unstable" \
            "$HOME/.config/chromium" "$HOME/.config/BraveSoftware/Brave-Browser"; do
  [ -d "$conf" ] || continue
  mkdir -p "$conf/NativeMessagingHosts"
  cat > "$conf/NativeMessagingHosts/$name.json" <<EOF
{
  "name": "$name",
  "description": "Refined LinkedIn: folds job descriptions with your Codex CLI",
  "path": "$dir/codex_host.py",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$id/"]
}
EOF
  echo "Registered for $conf"
  done_any=1
done
[ -n "$done_any" ] || { echo "No Chrome or Chromium profile folder found under ~/.config" >&2; exit 1; }
command -v codex >/dev/null || echo "Note: codex is not on this shell's PATH; the bridge also looks in ~/.local/bin and npm's folders."

#!/usr/bin/env python3
"""Chrome native messaging host for Refined LinkedIn: folds one job description with the Codex CLI the user is
signed in to with ChatGPT. Chrome starts it per message, sends one JSON message on stdin and reads one back.

In:  {"prompt": str, "schema": {...}, "model": str or "", "effort": "low"|"medium"|"high"}  or  {"ping": true}
Out: {"content": str}, the model's JSON answer as text  or  {"error": str}  or  {"codex": path, "version": str}
"""
import glob
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import tomllib

# Chrome starts hosts with the desktop session's PATH, which may miss where Codex was installed.
EXTRA_PATHS = ["~/.local/bin", "~/.npm-global/bin", "~/.bun/bin", "~/.volta/bin", "/usr/local/bin", "/opt/homebrew/bin",
               *sorted(glob.glob(os.path.expanduser("~/.nvm/versions/node/*/bin")), reverse=True)]


def read():
    size = struct.unpack("<I", sys.stdin.buffer.read(4))[0]
    return json.loads(sys.stdin.buffer.read(size))


def write(obj):
    data = json.dumps(obj).encode()
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def find_codex():
    path = os.pathsep.join([os.environ.get("PATH", ""), *(os.path.expanduser(p) for p in EXTRA_PATHS)])
    return os.environ.get("CODEX_BIN") or shutil.which("codex", path=path)


def mcp_servers_off():
    """One -c flag per MCP server in the user's Codex config, so a fold starts none of them."""
    config = os.path.join(os.environ.get("CODEX_HOME", os.path.expanduser("~/.codex")), "config.toml")
    try:
        names = tomllib.load(open(config, "rb")).get("mcp_servers", {})
    except (OSError, tomllib.TOMLDecodeError):
        return []
    return [arg for name in names for arg in ("-c", f"mcp_servers.{name}.enabled=false")]


def main():
    msg = read()
    codex = find_codex()
    if not codex:
        write({"error": "Codex CLI not found. Install it and sign in with `codex login`."})
        return
    if msg.get("ping"):
        version = subprocess.run([codex, "--version"], capture_output=True, text=True, timeout=30).stdout.strip()
        write({"codex": codex, "version": version})
        return
    with tempfile.TemporaryDirectory(prefix="refined-linkedin-") as work:
        schema, answer = os.path.join(work, "schema.json"), os.path.join(work, "answer.json")
        json.dump(msg["schema"], open(schema, "w"))
        args = [codex, "exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--color", "never",
                "--output-schema", schema, "-o", answer, "-C", work, *mcp_servers_off()]
        if msg.get("model"):
            args += ["-m", msg["model"]]
        if msg.get("effort"):
            args += ["-c", f'model_reasoning_effort="{msg["effort"]}"']
        try:
            run = subprocess.run([*args, "-"], input=msg["prompt"], capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            write({"error": "Codex took longer than 5 minutes."})
            return
        if run.returncode != 0 or not os.path.exists(answer):
            tail = (run.stderr or run.stdout).strip().splitlines()[-3:]
            write({"error": "Codex failed: " + " ".join(tail)[:300]})
            return
        write({"content": open(answer).read()})


if __name__ == "__main__":
    main()

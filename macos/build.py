"""Build a universal macOS app with Apple Command Line Tools and Python 3."""
import argparse
import os
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MAC = Path(__file__).resolve().parent
ROOT = MAC.parent
WEB = ROOT / "web"
APP_NAME = "Nocturne Echo Room.app"


def run(*args, quiet=False):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL if quiet else None)


def make_icon(work, resources):
    iconset = work / "AppIcon.iconset"
    iconset.mkdir()
    for points in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            pixels = str(points * scale)
            suffix = "@2x" if scale == 2 else ""
            run("sips", "-z", pixels, pixels, MAC / "AppIcon.png", "--out",
                iconset / f"icon_{points}x{points}{suffix}.png", quiet=True)
    run("iconutil", "-c", "icns", iconset, "-o", resources / "AppIcon.icns")


def copy_site(resources):
    site = resources / "Web"
    site.mkdir()
    html = (WEB / "index.html").read_text()
    # Bundled macOS fonts cover all three font stacks when running offline.
    html = re.sub(r'^<link [^>]*href="https://fonts\.googleapis\.com[^"]*"[^>]*>\n?', '', html, flags=re.M)
    (site / "index.html").write_text(html)
    # Package only the built-in tracks the public player's catalog names.
    catalog = html.split("const PIECES = {", 1)[1].split("\n};", 1)[0]
    for asset in sorted(set(re.findall(r"\b(?:file|fallback):\s*'([^'\n]+)'", catalog))):
        if Path(asset).name != asset:
            raise ValueError(f"Expected a bundled audio filename: {asset}")
        shutil.copyfile(WEB / asset, site / asset)
    for name in ("LICENSE", "ASSETS.md"):
        shutil.copyfile(ROOT / name, resources / name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "build" / "macos")
    parser.add_argument("--identity", default="-", help="codesign identity for distribution (default: ad hoc)")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    info = plistlib.loads((MAC / "Info.plist").read_bytes())
    executable = info["CFBundleExecutable"]
    run(sys.executable, WEB / "build.py")
    with tempfile.TemporaryDirectory(dir=args.output) as temp:
        work = Path(temp)
        app = work / APP_NAME
        contents = app / "Contents"
        resources = contents / "Resources"
        (contents / "MacOS").mkdir(parents=True)
        resources.mkdir()
        shutil.copyfile(MAC / "Info.plist", contents / "Info.plist")
        make_icon(work, resources)
        copy_site(resources)
        slices = []
        for arch in ("arm64", "x86_64"):
            target = arch + "-apple-macos" + info["LSMinimumSystemVersion"]
            run("xcrun", "--sdk", "macosx", "swiftc", "-swift-version", "5", "-parse-as-library", "-O",
                "-target", target, MAC / "HallContent.swift", MAC / "main.swift", "-o", work / arch)
            slices.append(work / arch)
        run("xcrun", "lipo", "-create", *slices, "-output", contents / "MacOS" / executable)
        timestamp = "--timestamp=none" if args.identity == "-" else "--timestamp"
        run("codesign", "--force", "--options", "runtime", timestamp, "--sign", args.identity, app)
        run("codesign", "--verify", "--strict", app)
        dest = args.output / APP_NAME
        # Stage and verify the entire app before replacing a previous build.
        if dest.exists():
            existing = plistlib.loads((dest / "Contents" / "Info.plist").read_bytes())
            if existing.get("CFBundleIdentifier") != info["CFBundleIdentifier"]:
                raise ValueError(f"A different application already exists at {dest}")
            os.replace(dest, work / "previous.app")
        try:
            os.replace(app, dest)
        except OSError:
            if (work / "previous.app").exists():
                os.replace(work / "previous.app", dest)
            raise
        print(dest.resolve())


if __name__ == "__main__":
    main()

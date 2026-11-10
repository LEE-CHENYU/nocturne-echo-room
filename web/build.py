"""Build the "Nocturne Echo Room" artifact page from its source.

    python -s web/build.py            # template.html + onsets*.json -> index.html, then syntax-check the script
    python -s web/build.py --assets   # also re-render every piece's audio and onset list from its MIDI first

Source of truth is web/template.html (all UI, acoustics, audio and dance code). index.html is generated:
the __ONSETS*__ placeholders are replaced by the note-onset lists the dance modes and the level trace use.
Publish index.html with the supporting audio files; the live artifact is
https://claude.ai/artifact/Mm5U22LRLDJBuZTCbCr5fr

--assets needs fluidsynth and ffmpeg on PATH, the Salamander SF2 in soundfonts/, and the MIDI files in midi/.
Per piece it writes:
  out/<dry>.wav                 FluidSynth render, built-in reverb and chorus off (the page adds the room)
  web/<name>_dry_lossless.mp4   16-bit mono FLAC in an MP4 container (artifacts refuse .flac files)
  web/<name>_dry.mp3            112 kbps fallback for browsers without FLAC
  web/<onsets>.json             [[time_s, velocity, lowest_pitch], ...], notes within 30 ms merged
"""
import argparse, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

WEB = Path(__file__).resolve().parent
ROOT = WEB.parent
SF2 = ROOT / "soundfonts" / "SalamanderGrandPiano-V3+20200602.sf2"

# page piece name -> (MIDI from MAESTRO v3, dry wav in out/, onsets json, template placeholder)
PIECES = {
    "nocturne": ("nocturne_op9n2_maestro2011.midi", "maestro_dry.wav", "onsets.json", "__ONSETS__"),
    "tango": ("tango_albeniz_godowsky_maestro2009.midi", "tango_dry.wav", "onsets_tango.json", "__ONSETS_TANGO__"),
}


def onsets(midi_path):
    import pretty_midi
    pm = pretty_midi.PrettyMIDI(str(midi_path))
    notes = sorted((n.start, n.velocity, n.pitch) for i in pm.instruments for n in i.notes)
    ev = []
    for t, v, p in notes:
        if ev and t - ev[-1][0] < 0.03:          # a chord: one event, loudest velocity, lowest pitch
            ev[-1][1] = max(ev[-1][1], v); ev[-1][2] = min(ev[-1][2], p)
            continue
        ev.append([round(t, 3), v, p])
    return ev


def run(*cmd):
    subprocess.run([str(c) for c in cmd], check=True)


def build_assets():
    for tool in ("fluidsynth", "ffmpeg"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not on PATH")
    for name, (midi, dry, js, _) in PIECES.items():
        midi, dry = ROOT / "midi" / midi, ROOT / "out" / dry
        dry.parent.mkdir(exist_ok=True)
        run("fluidsynth", "-ni", "-q", "-g", "0.8", "-r", "44100", "-o", "synth.reverb.active=0",
            "-o", "synth.chorus.active=0", "-F", dry, SF2, midi)
        with tempfile.TemporaryDirectory() as td:
            flac = Path(td) / f"{name}.flac"
            run("ffmpeg", "-loglevel", "error", "-y", "-i", dry, "-ac", "1", "-sample_fmt", "s16",
                "-compression_level", "12", flac)
            run("ffmpeg", "-loglevel", "error", "-y", "-i", flac, "-c:a", "copy", "-movflags", "+faststart",
                WEB / f"{name}_dry_lossless.mp4")
        run("ffmpeg", "-loglevel", "error", "-y", "-i", dry, "-ac", "1", "-b:a", "112k", WEB / f"{name}_dry.mp3")
        ev = onsets(midi)
        (WEB / js).write_text(json.dumps(ev, separators=(",", ":")))
        print(f"{name}: {len(ev)} onset events")


def build_page():
    s = (WEB / "template.html").read_text()
    # longest placeholder first: __ONSETS__ is a prefix-free match but keep the order explicit
    for _, (_, _, js, ph) in sorted(PIECES.items(), key=lambda kv: -len(kv[1][3])):
        assert s.count(ph) == 1, f"{ph} should appear once in template.html"
        s = s.replace(ph, (WEB / js).read_text())
    assert "__ONSETS" not in s
    (WEB / "index.html").write_text(s)
    print(f"wrote {WEB / 'index.html'} ({len(s) // 1024} KB)")
    if shutil.which("node"):
        scripts = re.findall(r"<script>(.*?)</script>", s, re.S)
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
            f.write("\n".join(scripts))
        r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
        Path(f.name).unlink()
        if r.returncode:
            sys.exit("script syntax error:\n" + r.stderr)
        print("script syntax OK")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--assets", action="store_true", help="re-render audio and onsets from MIDI first")
    a = ap.parse_args()
    if a.assets:
        build_assets()
    build_page()

"""Better version: a real human performance (MAESTRO v3, CC BY-NC-SA 4.0) played on a
sampled Yamaha C5 (Salamander Grand Piano V3, CC-BY 3.0) via FluidSynth, then placed in
the hall with the same pyroomacoustics RIRs as render.py.

Usage: python render_real.py [--preset grand|hall] [--midi PATH]
"""
import argparse, subprocess
from pathlib import Path
import numpy as np, soundfile as sf
from scipy.signal import fftconvolve
from render import hall_rirs, PRESETS, FS, HERE, OUT

SF2 = HERE / "soundfonts" / "SalamanderGrandPiano-V3+20200602.sf2"
MIDI = HERE / "midi" / "nocturne_op9n2_maestro2011.midi"

ap = argparse.ArgumentParser()
ap.add_argument("--preset", choices=list(PRESETS), default="grand")
ap.add_argument("--midi", default=str(MIDI))
a = ap.parse_args()
OUT.mkdir(exist_ok=True)

dry_path = OUT / "maestro_dry.wav"
# dry render: FluidSynth's built-in reverb/chorus OFF, so the only room is ours
subprocess.run(["fluidsynth", "-ni", "-q", "-g", "0.8", "-r", str(FS),
                "-o", "synth.reverb.active=0", "-o", "synth.chorus.active=0",
                "-F", str(dry_path), str(SF2), a.midi], check=True)
dry, _ = sf.read(dry_path)
dry = dry.mean(axis=1) if dry.ndim == 2 else dry      # piano is one source in the room
print(f"dry: {len(dry)/FS:.1f}s")

rirs, rt, dims, _ = hall_rirs(a.preset)
print(f"{a.preset}: {dims} m, measured RT60 {rt:.2f}s")
wet = np.stack([fftconvolve(dry, r) for r in rirs]).T
wet /= np.max(np.abs(wet)) / 0.9
out = OUT / f"maestro_{a.preset}.wav"
sf.write(out, wet, FS)
print("wrote", out)

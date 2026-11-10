"""Render Chopin's Nocturne Op. 9 No. 2 dry, then place it in a large concert hall
with pyroomacoustics (image-source + ray-tracing hybrid, stereo ORTF-style pair).

Usage: python render.py [--seconds N]
Outputs go to ./out/.
"""
import argparse
from pathlib import Path

import numpy as np
import pretty_midi
import pyroomacoustics as pra
import soundfile as sf
from scipy.signal import fftconvolve

FS = 44100
HERE = Path(__file__).parent
MIDI = HERE / "midi" / "chopin_nocturne_op9_n2.mid"
OUT = HERE / "out"


# ---------------------------------------------------------------- dry piano synth
def sustain_intervals(pm):
    """Pedal-down intervals from CC64 across all tracks."""
    ccs = sorted((c.time, c.value) for i in pm.instruments for c in i.control_changes if c.number == 64)
    out, down = [], None
    for t, v in ccs:
        if v >= 64 and down is None:
            down = t
        elif v < 64 and down is not None:
            out.append((down, t)); down = None
    if down is not None:
        out.append((down, pm.get_end_time()))
    return out


def release_time(off, pedal):
    for a, b in pedal:
        if a <= off < b:
            return b
    return off


def piano_note(pitch, vel, dur, fs=FS):
    """Additive piano-ish tone: stretched (inharmonic) partials, per-partial decay,
    brighter with velocity, short damper release after `dur`."""
    f0 = 440.0 * 2 ** ((pitch - 69) / 12)
    B = 1e-4 * 2 ** ((pitch - 21) / 24)          # inharmonicity grows up the keyboard
    t60 = np.interp(pitch, [21, 60, 108], [14.0, 7.0, 1.2])   # low strings ring longer
    rel = 0.18
    n = int((dur + rel) * fs)
    t = np.arange(n) / fs
    y = np.zeros(n)
    v = vel / 127
    for k in range(1, 25):
        fk = k * f0 * np.sqrt(1 + B * k * k)
        if fk > 0.45 * fs:
            break
        amp = (1 / k ** (2.2 - 1.0 * v)) * (1.0 if k > 1 else 1.2)
        decay = np.exp(-6.91 * t / (t60 / (1 + 0.35 * (k - 1))))
        phase = np.random.uniform(0, 2 * np.pi)
        # slight detune between the 2-3 strings of a unison -> beating / bloom
        y += amp * decay * (np.sin(2 * np.pi * fk * t + phase)
                            + 0.6 * np.sin(2 * np.pi * fk * 1.0007 * t + phase)) / 1.6
    attack = np.minimum(1, t / 0.003)
    hammer = 0.15 * v * np.random.randn(n) * np.exp(-t / 0.004)   # felt thump
    env = attack * np.where(t < dur, 1.0, np.exp(-(t - dur) / (rel / 5)))
    return (y * env + hammer) * v ** 1.5


def render_dry(seconds=None):
    pm = pretty_midi.PrettyMIDI(str(MIDI))
    pedal = sustain_intervals(pm)
    end = pm.get_end_time() + 4
    if seconds:
        end = min(end, seconds + 4)
    out = np.zeros(int(end * FS))
    rng_state = np.random.get_state(); np.random.seed(9)
    for inst in pm.instruments:
        for nt in inst.notes:
            if seconds and nt.start > seconds:
                continue
            off = release_time(nt.end, pedal) if pedal else nt.end + 0.4   # no CC64 -> light legato
            dur = max(0.05, off - nt.start)
            y = piano_note(nt.pitch, nt.velocity, dur)
            i0 = int(nt.start * FS)
            y = y[: len(out) - i0]
            out[i0:i0 + len(y)] += y
    np.random.set_state(rng_state)
    return out / np.max(np.abs(out)) * 0.9, bool(pedal)


# ---------------------------------------------------------------- the hall
PRESETS = {
    # ~1,800-seat shoebox concert hall: measured RT60 ~2.0 s
    "hall": dict(dims=[48.0, 28.0, 18.0], rt60=2.6, scattering=0.3,
                 src=[8.0, 14.0, 1.2], mic=[24.0, 14.0, 1.2], spacing=0.17),
    # cavernous marble space (grand ballroom / terminal concourse scale), listener far back
    "grand": dict(dims=[90.0, 40.0, 30.0], rt60=5.5, scattering=0.15,
                  src=[10.0, 20.0, 1.2], mic=[42.0, 21.0, 1.6], spacing=0.6),
}


def hall_rirs(preset="hall", rt60=None):
    P = PRESETS[preset]
    dims, rt60 = P["dims"], rt60 or P["rt60"]
    e_abs, max_order = pra.inverse_sabine(rt60, dims)
    room = pra.ShoeBox(
        dims, fs=FS,
        materials=pra.Material(e_abs, scattering=P["scattering"]),
        max_order=3,                 # early reflections exact (image sources)...
        ray_tracing=True,            # ...late diffuse tail by ray tracing
        air_absorption=True,
    )
    room.set_ray_tracing(receiver_radius=0.5, n_rays=20000, energy_thres=1e-7)
    room.add_source(P["src"])                      # piano
    center = np.array(P["mic"])                    # stereo pair, spaced across the room's width
    h = P["spacing"] / 2
    mics = np.c_[center + [0, h, 0], center - [0, h, 0]]
    room.add_microphone_array(mics)
    room.compute_rir()
    rirs = [np.asarray(room.rir[m][0]) for m in range(2)]
    L = max(len(r) for r in rirs)
    rirs = np.stack([np.pad(r, (0, L - len(r))) for r in rirs])
    measured = pra.experimental.measure_rt60(rirs[0], fs=FS)
    return rirs, measured, dims, max_order


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=None, help="render only the first N seconds")
    ap.add_argument("--preset", choices=list(PRESETS), default="hall")
    ap.add_argument("--rt60", type=float, default=None,
                    help="Sabine target (overrides preset); air absorption + scattering make the measured RT60 lower")
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)

    dry, pedal = render_dry(a.seconds)
    sf.write(OUT / "nocturne_dry.wav", dry, FS)
    print(f"dry: {len(dry)/FS:.1f}s, sustain pedal in MIDI: {pedal}")

    rirs, rt, dims, _ = hall_rirs(a.preset, a.rt60)
    sf.write(OUT / f"{a.preset}_rir_stereo.wav", (rirs / np.max(np.abs(rirs))).T, FS)
    print(f"hall {dims} m, preset {a.preset}, measured RT60 {rt:.2f}s, RIR {rirs.shape[1]/FS:.2f}s")

    wet = np.stack([fftconvolve(dry, r) for r in rirs]).T
    wet /= np.max(np.abs(wet)) / 0.9
    name = "nocturne_large_hall" if a.preset == "hall" else f"nocturne_{a.preset}"
    sf.write(OUT / f"{name}.wav", wet, FS)
    print("wrote", OUT / f"{name}.wav")


if __name__ == "__main__":
    main()

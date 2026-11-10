"""Visualize the simulated space and its echo: floor plan with reflection paths,
image-source cloud, echogram of the first reflections, decay of both rooms,
and dry vs in-room spectrograms of the MAESTRO performance.

Usage: python visualize.py   ->  out/space_and_echo.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Rectangle
import pyroomacoustics as pra
import soundfile as sf
from scipy.signal import fftconvolve, spectrogram
from render import PRESETS, hall_rirs, FS, OUT

C = 343.0
SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE, AQUA, YELLOW, MAGENTA, VIOLET = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"
SEQ = LinearSegmentedColormap.from_list("seq", ["#fcfcfb", "#cde2fb", "#86b6ef", "#2a78d6", "#1c5cab", "#0d366b"])

plt.rcParams.update({
    "figure.facecolor": SURF, "axes.facecolor": SURF, "axes.edgecolor": GRID,
    "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2, "text.color": INK,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "font.size": 10,
    "axes.titlesize": 12, "axes.titleweight": "bold", "axes.titlelocation": "left",
    "axes.spines.top": False, "axes.spines.right": False,
})

G = PRESETS["grand"]; H = PRESETS["hall"]
Lx, Ly, Lz = G["dims"]
src, mic = np.array(G["src"]), np.array(G["mic"])

# first-order wall reflections: mirror the source in each surface
walls = {  # name: (axis, plane coordinate, colour)
    "front wall": (0, 0.0, VIOLET), "back wall": (0, Lx, MAGENTA),
    "side wall (near)": (1, 0.0, AQUA), "side wall (far)": (1, Ly, YELLOW),
    "floor": (2, 0.0, INK2), "ceiling": (2, Lz, ORANGE),
}
first = []
for name, (ax_i, p, col) in walls.items():
    img = src.copy(); img[ax_i] = 2 * p - src[ax_i]
    d = np.linalg.norm(img - mic)
    # reflection point on the wall = intersection of image->mic line with the plane
    s = (p - img[ax_i]) / (mic[ax_i] - img[ax_i])
    hit = img + s * (mic - img)
    first.append(dict(name=name, img=img, hit=hit, d=d, ms=1000 * d / C, col=col))
direct_d = np.linalg.norm(src - mic); direct_ms = 1000 * direct_d / C

# RIRs for both presets (same code path as the renders)
rir_g, rt_g, _, _ = hall_rirs("grand")
rir_h, rt_h, _, _ = hall_rirs("hall")

fig = plt.figure(figsize=(18, 11.5))
gs = fig.add_gridspec(3, 3, height_ratios=[1.15, 1, 1], hspace=0.45, wspace=0.22)
fig.suptitle("The large marble space: where the echoes come from and how they decay",
             x=0.06, ha="left", fontsize=17, fontweight="bold")
fig.text(0.06, 0.935, f"Simulated with pyroomacoustics: {Lx:.0f} × {Ly:.0f} × {Lz:.0f} m shoebox, "
         f"exact image sources to order 3 + ray-traced tail, air absorption on. "
         f"Measured RT60 {rt_g:.2f} s (concert-hall preset: {rt_h:.2f} s).", color=INK2, fontsize=11)

# ---- A. floor plan with first-order paths
ax = fig.add_subplot(gs[0, 0:2])
ax.add_patch(Rectangle((0, 0), Lx, Ly, fill=False, ec=INK, lw=2))
ax.add_patch(Rectangle((0, (Ly - H["dims"][1]) / 2), H["dims"][0], H["dims"][1], fill=False,
                       ec=INK2, lw=1, ls=(0, (4, 3))))
ax.text(1, (Ly - H["dims"][1]) / 2 + 0.8, f"concert hall preset for scale ({H['dims'][0]:.0f} × {H['dims'][1]:.0f} m)",
        color=INK2, fontsize=9)
ax.plot([src[0], mic[0]], [src[1], mic[1]], color=INK, lw=2, zorder=3)
for f in first:
    if f["name"] in ("floor", "ceiling"):
        continue
    ax.plot([src[0], f["hit"][0], mic[0]], [src[1], f["hit"][1], mic[1]], color=f["col"], lw=2, zorder=2)
    ax.plot(*f["hit"][:2], "o", ms=6, color=f["col"], mec=SURF, mew=2, zorder=4)
    ax.annotate(f"{f['name']}\n{f['ms']:.0f} ms", f["hit"][:2], xytext=(0, -30 if f["hit"][1] > Ly - 1 else (12 if f["hit"][1] > Ly / 2 else -26)),
                textcoords="offset points", ha="center", fontsize=9, color=INK)
ax.plot(*src[:2], "s", ms=13, color=INK, zorder=5); ax.annotate("piano", src[:2], xytext=(10, 6), textcoords="offset points", fontweight="bold")
ax.plot(*mic[:2], "o", ms=12, color=BLUE, mec=SURF, mew=2, zorder=5)
ax.annotate(f"listener (stereo pair)\ndirect sound {direct_ms:.0f} ms", mic[:2], xytext=(10, 6), textcoords="offset points", fontweight="bold")
ax.set_xlim(-3, Lx + 3); ax.set_ylim(-4, Ly + 4); ax.set_aspect("equal")
ax.set_title("A · Floor plan: the direct path and the four first wall reflections")
ax.set_xlabel("length (m)"); ax.set_ylabel("width (m)")

# ---- B. image-source cloud (plan projection)
ax = fig.add_subplot(gs[0, 2])
ism = pra.ShoeBox(G["dims"], fs=FS, materials=pra.Material(0.1), max_order=6)
ism.add_source(src); ism.add_microphone(mic); ism.image_source_model()
imgs = ism.sources[0].images
order = ism.sources[0].orders
near = np.abs(imgs[2] - src[2]) < 1e-6                   # images in the source's horizontal plane
I = imgs[:, near]; o = order[near]
dist = np.linalg.norm(I - mic[:, None], axis=0)
for kx in range(-3, 4):
    for ky in range(-3, 4):
        ax.add_patch(Rectangle((kx * Lx, ky * Ly), Lx, Ly, fill=False, ec=GRID, lw=0.8))
ax.add_patch(Rectangle((0, 0), Lx, Ly, fill=False, ec=INK, lw=1.6))
sc = ax.scatter(I[0], I[1], c=1000 * dist / C, cmap=SEQ.reversed(), s=60 / (1 + o) + 6, vmin=0, vmax=1200,
                edgecolors=SURF, linewidths=0.6, zorder=3)
ax.plot(*mic[:2], "o", ms=7, color=ORANGE, zorder=4)
ax.set_xlim(-2.6 * Lx, 3.6 * Lx); ax.set_ylim(-2.6 * Ly, 3.6 * Ly); ax.set_aspect("equal")
ax.set_title("B · Each echo = a virtual piano\n     in a mirrored copy of the room"); ax.grid(False)
ax.set_xlabel("m"); ax.set_ylabel("m")
cb = fig.colorbar(sc, ax=ax, fraction=0.04, pad=0.04, shrink=0.8); cb.set_label("arrival time (ms)", color=INK2); cb.outline.set_visible(False)
ax.text(0.02, 0.02, "dot size = fewer bounces (louder)\norange = listener", transform=ax.transAxes,
        fontsize=8.5, color=INK2, va="bottom", bbox=dict(fc=SURF, ec="none", alpha=0.85))

# ---- C. echogram, first 450 ms
ax = fig.add_subplot(gs[1, 0:2])
r = rir_g[0]; t = np.arange(len(r)) / FS * 1000
env = 20 * np.log10(np.abs(r) / np.abs(r).max() + 1e-9)
ax.plot(t, env, color=BLUE, lw=0.6)
ax.set_xlim(0, 450); ax.set_ylim(-60, 3)
marks = [("direct", direct_ms, INK)] + [(f["name"], f["ms"], f["col"]) for f in first]
for i, (nm, ms, col) in enumerate(sorted(marks, key=lambda m: m[1])):
    ax.axvline(ms, color=col, lw=1.2, ls=(0, (3, 2)))
    ax.text(ms + 2, -4 - 6 * (i % 4), f"{nm} {ms:.0f} ms", color=INK, fontsize=9,
            bbox=dict(fc=SURF, ec=col, lw=1, boxstyle="round,pad=0.2"))
ax.set_title("C · Echogram of the first 450 ms (left channel): discrete echoes, then they pile into a wash")
ax.set_xlabel("time after the key is struck (ms)"); ax.set_ylabel("level (dB re peak)")

# ---- D. decay of both rooms (Schroeder backward integration)
ax = fig.add_subplot(gs[1, 2])
for rr, rt, col, nm in [(rir_h[0], rt_h, BLUE, "concert hall"), (rir_g[0], rt_g, ORANGE, "large marble space")]:
    e = np.cumsum((rr ** 2)[::-1])[::-1]; edc = 10 * np.log10(e / e[0] + 1e-12)
    tt = np.arange(len(rr)) / FS
    ax.plot(tt, edc, color=col, lw=2, label=f"{nm}  RT60 {rt:.2f} s")
ax.axhline(-60, color=INK2, lw=1, ls=(0, (3, 2))); ax.text(0.05, -58, "−60 dB = RT60", color=INK2, fontsize=9)
ax.set_xlim(0, 5.5); ax.set_ylim(-70, 2)
ax.set_title("D · How long the room keeps ringing")
ax.set_xlabel("time (s)"); ax.set_ylabel("remaining energy (dB)")
ax.legend(frameon=False, loc="upper right", fontsize=9)

# ---- E/F. spectrograms dry vs in-room, same 20 s phrase
dry, _ = sf.read(OUT / "maestro_dry.wav"); dry = dry.mean(axis=1) if dry.ndim == 2 else dry
seg = slice(int(8 * FS), int(28 * FS))
wet = fftconvolve(dry[seg], rir_g[0])[: seg.stop - seg.start]
for k, (x, title) in enumerate([(dry[seg], "E · Dry piano: notes start and stop cleanly"),
                                (wet, f"F · Same 20 s in the large space: each note rings ~{rt_g:.0f} s into the next")]):
    ax = fig.add_subplot(gs[2, 0] if k == 0 else gs[2, 1:3])
    f, tt, S = spectrogram(x, FS, nperseg=4096, noverlap=3072)
    keep = f < 3000
    SdB = 10 * np.log10(S[keep] + 1e-14); SdB -= SdB.max()
    ax.pcolormesh(tt, f[keep], SdB, cmap=SEQ, vmin=-70, vmax=0, shading="auto", rasterized=True)
    ax.set_yscale("symlog", linthresh=200); ax.set_ylim(40, 3000); ax.grid(False)
    ax.set_title(title); ax.set_xlabel("time (s, from 0:08 of the performance)"); ax.set_ylabel("frequency (Hz)")

out = OUT / "space_and_echo.png"
fig.savefig(out, dpi=130, bbox_inches="tight")
print("wrote", out)

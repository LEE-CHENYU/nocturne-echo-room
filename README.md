# Chopin in a simulated hall

Chopin (and an Albéniz tango) played in rooms modelled with pyroomacoustics, plus an interactive
web page, **Nocturne Echo Room**, that recomputes the room live as you move, resize it, change its
walls, or dance.

Conda env: `chopin_hall` (run Python with `-s`, otherwise user site-packages leak in).

| Path | What it is |
|---|---|
| `render.py` | synth-piano Nocturne in the `hall` (48×28×18 m, RT60 ≈2.0 s) or `grand` (90×40×30 m, ≈4.25 s) shoebox |
| `render_real.py` | MAESTRO performance → FluidSynth + Salamander piano (dry) → same pyroomacoustics room |
| `visualize.py` | `out/space_and_echo.png`: plan, image sources, echogram, decay curves, spectrograms |
| `web/template.html` | **the page's source**: UI, acoustics (image sources + Sabine tail), Web Audio, waltz/tango, track loader |
| `web/build.py` | `template.html` + `onsets*.json` → `index.html` (`--assets` re-renders audio and onsets from `midi/`) |
| `web/*_lossless.mp4`, `*.mp3` | dry audio the page loads (FLAC in MP4; MP3 fallback) |
| `midi/` | MAESTRO v3 MIDI (CC BY-NC-SA 4.0) and the Mutopia Nocturne |

Not in git (re-fetch): `soundfonts/SalamanderGrandPiano-V3+20200602.sf2` from
freepats.zenvoid.org (CC BY 3.0); `dl/maestro` from
`storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0-midi.zip`; rendered WAVs in `out/`.

## Update the page

    /opt/miniconda3/envs/chopin_hall/bin/python -s web/build.py

then publish `web/index.html` to https://claude.ai/artifact/Mm5U22LRLDJBuZTCbCr5fr with the audio files
alongside. Edit `template.html`, never `index.html`.

Published versions: v1 page · v3 early/tail split for speed · v4 waltz · v5 tango + lossless audio ·
v6 "Load your track" with in-browser beat tracking · v7 material marks on the Walls slider.

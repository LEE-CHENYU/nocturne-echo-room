# Music and artwork credits

The original simulator code, Mac app, app icon and hall-design preview use the [MIT license](LICENSE). The following materials retain their own terms, including when bundled in the Mac app.

## Piano performances

Google LLC makes MAESTRO v3 available under CC BY-NC-SA 4.0. The performance data comes from the International Piano-e-Competition. This project distributes three renamed MIDI files. [MAESTRO dataset and citation](https://magenta.tensorflow.org/datasets/maestro) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

| File in `midi/` | Performance |
|---|---|
| `nocturne_op9n2_maestro2011.midi` | Frédéric Chopin, Nocturne in E-flat major, Op. 9 No. 2 (2011) |
| `tango_albeniz_godowsky_maestro2009.midi` | Isaac Albéniz, Tango, arranged by Leopold Godowsky (2009) |
| `valse_op34n1_maestro2015.midi` | Frédéric Chopin, Valse brillante in A-flat major, Op. 34 No. 1 (2015) |

The dry MP3 and FLAC-in-MP4 piano tracks in `web/` were synthesized from these performances. The onset JSON files and their copies embedded in `web/index.html` were extracted from MIDI note events. The spectrograms in `out/space_and_echo.png` depict the Nocturne performance. These adaptations are distributed under the same noncommercial, share-alike license. The earlier Valse renders and onset lists in the history have the same terms. [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

The piano renders use Alexander Holm’s Salamander Grand Piano V3, adapted to SF2 by Roberto for the FreePats project. FluidSynth rendered the MIDI without its built-in reverb or chorus, and FFmpeg encoded the mono audio. The samples are licensed under CC BY 3.0. [FreePats piano library](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) · [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)

The dataset paper is Curtis Hawthorne et al., *Enabling Factorized Piano Music Modeling and Generation with the MAESTRO Dataset*, ICLR 2019. [Paper and dataset](https://magenta.tensorflow.org/datasets/maestro#how-to-cite)

## Mutopia score

`midi/chopin_nocturne_op9_n2.mid`, used by the optional Python synthesizer, is the unmodified MIDI from the Mutopia edition of Chopin’s Op. 9 No. 2, maintained by Renato Biolcati Rinaldi. The edition uses CC BY-SA 3.0. [Mutopia edition 1590](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1590) · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)

## Historical recording

`web/skaters_sousa_1912.mp3` is Émile Waldteufel’s *Skaters’ Waltz*, performed by Sousa’s Band on May 17, 1912, matrix C-8526/4. The recording comes from the Library of Congress, National Jukebox, and is in the public domain in the United States. The player folds it to mono at playback. [Collection item](https://www.loc.gov/item/jukebox-128290/) · [National Jukebox rights](https://www.loc.gov/collections/national-jukebox/about-this-collection/rights-and-access/) · [Source MP3 mirror](https://archive.org/details/loc-jukebox-128290-skaters-waltz-los-patinadores-vals)

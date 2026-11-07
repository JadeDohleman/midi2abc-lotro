# midi2abc (LOTRO Edition)

Convert MIDI files to ABC notation compatible with **The Lord of the Rings Online (LOTRO)** in-game music system.

> **Fork Notice:** This repository is a fork and adaptation of [marmooo/midi2abc](https://github.com/marmooo/midi2abc) tailored specifically to output `.abc` files that conform to LOTRO's in-game ABC parser rules and playback constraints.

## LOTRO Compatibility Adaptations

Standard ABC notation includes several syntax features that LOTRO's in-game ABC parser rejects or misinterprets. This adaptation modifies the converter (`src/midi2abc.js` and `src/parse-midi-core.js`) to ensure full in-game playability:

- **Solo (`X:0`) & Multi-Part (`X:1`, `X:2`, ...) Track Formatting:** Outputs a combined `X:0` solo arrangement (merging all melodic tracks into a single playable part for solo players) followed by each individual MIDI track as `X:1`, `X:2`, ... for band/group play (with melodic tracks ordered before drum/percussion tracks), ending each part header with `K:C` and omitting unsupported `V:` voice headers or `clef=` directives.
- **LOTRO Chord Syntax (`[C2E2G2]`):** Places note durations and ties *inside* chord brackets on every individual note (`[D2F2A2]`, `[F,8-A,8-D8-]`) rather than after the closing bracket (`[DFA]2`), preventing `"Unexpected token"` errors in LOTRO.
- **3-Octave Playable Pitch Range & Chord Limits:** Folds all MIDI pitches into LOTRO's playable range (`C,` to `c'`, MIDI notes `48..84`), deduplicates notes that fold to the same pitch within a chord, and caps chords at LOTRO's 6-note limit.
- **Per-Bar Accidental Tracking:** Tracks sharped pitches within each bar and emits explicit natural signs (`=C`) when the natural pitch occurs later in the same measure, preventing accidental bleed and broken cross-barline ties.
- **LOTRO Note Duration Bounds (`60 ms` to `8 s`):** Clamps tempos to `45–240 BPM`, caps single note tokens at 8 sixteenth-note units (tying longer notes across tokens), disables tuplets (`(3:2`), reduces duration fractions, and quantizes both note start and end ticks to a tempo-safe grid so no note ever falls below LOTRO's 60 ms minimum or exceeds its 8 s maximum.

## Background (Upstream)

Real-world, human-performed MIDI files are often not quantized (note timing
drifts by a few ticks throughout), which ABC notation can't represent cleanly.
Notes are automatically snapped to a rhythmic grid so such files convert cleanly
without falling back to unrepresentable durations. See
`autoQuantizeTicks` in `src/parse-midi-core.js`.

- Upstream project: [marmooo/midi2abc](https://github.com/marmooo/midi2abc)
- Upstream web demo: [https://marmooo.github.io/midi2abc/](https://marmooo.github.io/midi2abc/)

## Build

```
bash build.sh
```

## Test

`test.js` (Deno) batch-converts every `.mid`/`.midi` file found (recursively)
under a directory and reports which ones have problems, sorted from simplest to
fix to most complex (by note count, then track count, then file size). It uses
[abcjs](https://github.com/paulrosen/abcjs)'s `parseOnly()` to headlessly
validate the generated ABC (no DOM/browser needed) in addition to catching any
exceptions thrown by the converter itself.

```
deno run -R test.js /path/to/midi/folder --json report.json
```

`midi_test.js` runs the same checks as individual `Deno.test()` cases, so
`deno test` reports a native pass/fail count (e.g. for tracking the conversion
success rate over time / in CI) instead of the custom summary/JSON report
`test.js` prints:

```
deno test -R midi_test.js -- /path/to/midi/folder
```

## License

MIT

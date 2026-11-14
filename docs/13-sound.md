# 13. Sound design with Web Audio

Star Hop ships no audio files. Every sound, from a tabla tihai to a sitar's buzzing string, is generated in code with the Web Audio API. This chapter explains how, and covers what a frontend engineer needs to know to ship audio well: the audio graph, autoplay rules, keeping sounds at a balanced loudness, and how to test code whose output is sound.

Code: [synth.ts](../src/audio/synth.ts) (building blocks), [themes.ts](../src/audio/themes.ts) (the five themes), [sfx.ts](../src/audio/sfx.ts) (runtime and master chain), [sfx.test.ts](../src/audio/sfx.test.ts).

## Why synthesise?

| Audio files | Synthesis |
| --- | --- |
| Realistic | Recognisable, stylised |
| Licensing to track per file | Nothing to license |
| 50 to 500 KB per theme to download and cache | About 27 KB of commented source for all five themes, a few KB once minified and compressed |
| Fixed: tweaking means re-recording or editing | Every number is a knob: pitch, length, brightness, rhythm |
| Need preloading, or the first sound plays late | Instant |

The second column fits a game whose sounds last a few hundred milliseconds and where the owner wants to try variations. It is also a good interview topic, because it touches real-time scheduling, signal processing and performance.

## The audio graph

Web Audio is a graph of nodes. Sources (oscillators, buffers) flow through processors (gain, filters, compressors) to the speakers:

```
oscillator / buffer ──► envelope (gain) ──► theme level ──► master volume ──► limiter ──► speakers
```

- **The context is created lazily**, on the first sound. Browsers block audio until the user has interacted with the page (the autoplay policy), and a context created earlier starts `suspended`. `getContext()` calls `resume()` when needed.
- **Everything is scheduled on the audio clock** (`ac.currentTime`), not with `setTimeout`. A tihai's twelve strokes are scheduled at exact times in one go, and the audio thread plays them sample-accurately even if the main thread is busy animating.
- **The limiter** (a `DynamicsCompressorNode` with a high ratio) sits at the end. A fast walk or a win fanfare stacks many voices; without it they would add up past full scale and clip.
- **Envelopes** shape each note's loudness: a quick rise, then an exponential decay. One gotcha: `exponentialRampToValueAtTime(0, ...)` **throws**, because an exponential curve can never reach zero. Ramp to a tiny value (`SILENT = 0.0001`) instead. The test's fake context rejects zero ramps exactly as browsers do.

## Five instruments, four techniques

### Tabla: additive synthesis of a pitched drum

Most drums have overtones at unrelated frequencies, which is why they don't sound pitched. The tabla's right drum (dayan) is different: the black paste patch on its head (the *syahi*) shifts its overtones to near-whole-number multiples of the fundamental. C. V. Raman studied this in the 1920s. So a convincing dayan stroke is a few sine waves at 1×, 2×, 3× and 4× the pitch, each decaying at its own rate, plus a short noise click for the finger hitting the skin:

```ts
const NA: Partial[] = [[1, 1, 0.32], [2, 0.55, 0.22], [3, 0.35, 0.16], [4, 0.18, 0.1]]  // ratio, level, decay (s)
```

The left drum (bayan) is deep, and the player presses the heel of their hand into it to slide the pitch: an exponential frequency ramp from 82 Hz upwards. Strokes have names (*bols*), and the sounds are real phrases:

- the roll is *ti-ra-ki-ta*, four quick strokes, landing on *dha*;
- home is *dha dhin dhin dha*, the first bar of *teentaal*, the most common rhythm cycle;
- finishing plays a ***tihai***: one phrase played three times, the last stroke landing exactly on the beat. It is the traditional way to end a tabla passage, which suits a player finishing.

### Bansuri: a shaped wave, breath and vibrato

A bamboo flute is mostly its fundamental, with weak odd overtones. A `PeriodicWave` built from those harmonic amounts gives the tone. What makes it sound like a bansuri rather than a whistle:

- **breath**: band-pass filtered noise at the start of each note;
- **meend**: sliding into a note from another pitch, an exponential frequency ramp;
- **late vibrato**: an LFO (a slow oscillator) on the frequency, faded in after the note settles, as a player would.

The notes come from **Raag Bhupali**: Sa Re Ga Pa Dha, a five-note (pentatonic) raag. Any sequence of its notes sounds consonant, which matters when sounds overlap unpredictably. The ratios are **just intonation** (9/8, 5/4, 3/2, 5/3) rather than equal temperament, because Indian classical music is tuned by ear against a drone. A small `stepper()` counts quick repeated calls, so a marble walking six holes **climbs the raag**, one note per hole.

### Sitar: Karplus–Strong plucked strings

The Karplus–Strong algorithm (1983) is one of the most elegant algorithms in audio. Fill a buffer one period long with random noise, then repeatedly play it while replacing each sample with the average of itself and its neighbour:

```ts
ring[i] = decay * (a * x + (1 - a) * ring[(i + 1) % period])
```

The averaging is a low-pass filter applied once per period, so high frequencies die first, exactly as on a real string. Two numbers give you any string: `decay` (how long it rings) and `brightness`.

For the sitar's **jawari**, the curved bridge that makes the string buzz against it, the output goes through an uneven (asymmetric) `tanh` curve, which adds both even and odd harmonics. The **chikari** (high drone strings) are struck for rhythm, and **meend** bends use the buffer source's `playbackRate`.

**Why render into a buffer rather than build the loop from nodes?** A feedback loop in a Web Audio graph must include at least one render quantum of delay (128 samples), which caps a looped string at about 344 Hz at 44.1 kHz. Rendering the loop in JavaScript into an `AudioBuffer` has no such limit. Buffers are cached per pitch in a `WeakMap` keyed by the context, the same identity-keyed caching idea as the bots' reach cache ([chapter 7](07-bots-and-probability.md)).

### Santoor: detuned pairs and tremolo

The same plucked-string engine, brighter and higher. Each note is a **pair of strings tuned a few cents apart** (`detuneCents: -4` and `+5`), and the slow beating between them is the santoor's shimmer. The roll is a **tremolo** (one note struck rapidly) and the finish is a cascading run.

## Keeping the themes equally loud

Switching themes shouldn't feel like turning the volume knob. That needs measuring, not listening on one pair of headphones. The check renders every sound of every theme in an `OfflineAudioContext` (rendering as fast as possible, without playing) in a real browser, and computes the peak and the RMS loudness of the audible part:

| Theme | Average RMS before | After balancing |
| --- | --- | --- |
| Classic | −30.8 dB | −28.0 dB |
| Tabla | −19.9 dB | −25.5 dB |
| Bansuri | −24.9 dB | −26.1 dB |
| Sitar | −22.4 dB | −26.6 dB |
| Santoor | −34.1 dB | −26.0 dB |

A 14 dB spread became about 2.5 dB, with one `level` number per theme plus a few gains inside the Santoor theme. RMS is a rough stand-in for perceived loudness; a production pipeline would use LUFS (ITU-R BS.1770), which weights frequencies the way ears do.

## Testing code whose output is sound

jsdom has no Web Audio. Three layers of tests cover it anyway:

1. **Pure functions are tested directly.** `renderPluck` fills a `Float32Array`, so a test checks it is normalised, decays, and is periodic at the requested pitch (the wave nearly repeats one period later). `scaleNote` and `stepper` are plain maths.
2. **A fake `AudioContext`** records what the themes schedule and **rejects what a browser rejects**: exponential ramps to zero, negative or non-finite times. Every sound of every theme is played through it, so a typo that would throw in Chrome fails in CI.
3. **Offline rendering in a real browser** for loudness, as above. That is the only layer that hears the result.

Then a human listens. Tests can't tell you a tihai sounds good, but they make sure the code that plays it can't crash and stays in a known loudness range.

## Design: a theme is a strategy

```ts
interface SoundTheme { label: string; blurb: string; level: number; sounds: Record<SoundName, Voice> }
type Voice = (ac: BaseAudioContext, out: AudioNode, t: number) => void
```

The game only ever calls `playSound('bump')`. Which instrument answers is a lookup, so adding a theme touches one file and the Settings list. `Voice` takes the context and output as parameters (dependency injection), which is what makes the same code play live, render offline and run against the fake.

**Previews ignore mute.** "Play a sample" and "Try each sound" in Settings always play, because the player just pressed a button to hear them. Game sounds respect the switch. That is a small product rule you would write down.

## How to tweak a theme

Everything is in [themes.ts](../src/audio/themes.ts):

- the tabla's pitch is `DAYAN` (277 Hz, C♯4) and `BAYAN`; each stroke's partials are its timbre;
- the flute's key is `FLUTE_SA`, and its phrases are lists of scale steps (`fn(5)` is Sa an octave up);
- the sitar's string is `SITAR` (`decay`, `brightness`, `buzz`); more buzz means more jawari;
- each theme's `level` balances its loudness against the others.

Change a number, open Settings, and press the theme's play button or the "Try each sound" chips.

## Exercises

1. Add a harmonium theme: a reed instrument with a steady tone and a slow swell. Which building block fits best? Balance it with the offline loudness script.
2. Replace RMS with a simple K-weighted loudness (a high-shelf plus high-pass filter, then RMS). Do the rankings change?
3. A player reports the walk sound "machine-guns" on fast moves. Add voice limiting: at most N `move` sounds playing at once. Where does that state live?
4. Some players want sounds that tell them who moved (spatial audio). Use a `StereoPannerNode` to place each colour's sounds by the position of its arm. What about players with one earbud?
5. Measure the CPU cost of the sitar win sound (about 30 voices) on a low-end phone profile. Would pre-rendering whole phrases into buffers be worth it?

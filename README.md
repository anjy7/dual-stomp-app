# Guitar Lab

Local, single-note guitar practice app for a standard-tuned guitar and any browser-accessible recording input. Independent of the Soran editor. Supports verified tuner commands, temporary preset selection/effect bypass and Vox 30HW gain controls. No saved-preset, firmware or executable modifications.

## Start

Clone the repository, then start the app:

```powershell
git clone https://github.com/anjy7/dual-stomp-app.git
cd dual-stomp-app
npm ci
npm start
```

On Windows, you can also double-click `Start-Guitar-Lab.cmd` inside the project folder.

Open http://127.0.0.1:4317 in Chrome or Edge. Node.js 22+ is required. The app has no runtime dependencies. Run `npm ci` once to install the TypeScript compiler and development tools; `npm start` builds the app into ignored `dist/` before serving it. Close the server terminal to stop hosting. Click **Stop** to release the audio input.

1. Connect the powered Soran over USB.
2. Open **Settings → Audio input**, click **Find inputs**, allow microphone permission, then select **Microphone (2- JME STOMPBOX)** (the number may differ).
3. Click **Start listening**. Use a clean pedal preset, no delay/reverb, and mute unused strings.
4. Open **Practice → Lessons**, or **Practice → Notes** for the note analyser, fretboard and **Begin practice**. First-position mode adds frets 0–5.

## Navigation

Top navigation separates **Practice**, **Pedal**, **Recordings**, and **Settings**. Practice shows one tool at a time: Lessons, Bends, Timing, or Notes. Pedal separates Tone and Tuner; snapshots are under **Tone → Pedal snapshots**. Settings contains the input selector/noise gate, progress/practice setup, and expandable footswitch mapping/troubleshooting.

The audio session bar stays visible. Activity links indicate recording, metronome, and MIDI state across views. Switching views preserves audio, MIDI, running lessons, metronome and in-memory takes; it sends no pedal commands and does not reload. Bookmarkable hash routes (e.g. `/#/practice/bends`) support browser Back/Forward. A full reload still loses in-memory takes, so download before refreshing.

## Pedal’s built-in tuner (experimental)

Open **Pedal**, click **Connect MIDI**, allow MIDI/SysEx access, then open **Tuner** and use **Turn tuner on** or **Turn tuner off**. No Stomp Manager is needed. Each toggle reads current settings, changes only the enable field, waits for acknowledgement and checks readback. No commands are sent just by connecting. Both directions were verified against the connected pedal through MIDI readback, preserving other settings. The note/indicator decoder remains experimental; compare with the pedal screen. Turn the tuner off for audio-based lessons if it mutes USB audio.

See [protocol evidence, limitations and setup](docs/pedal-tuner.md). **Disconnect MIDI** releases this separate input. Audio **Stop** does not disconnect MIDI.

## Practice studio

- **Solo lessons:** both user-supplied Bohemian Rhapsody solos, split into 10 phrases. Current pitch target is highlighted. Start phrase, skip/manual advance, and optional looping. Explicit bend/release/pre-bend/slide targets; ±35-cent, 160 ms pitch holds. Repeated notes require a new attack or silence. Rakes are manually advanced, not pitch-scored. Vibrato, staccato and the final slide without an endpoint are not graded. Phrase completion counts require no skipped pitched notes.
- **Bend trainer:** choose string, fret and half/whole-step target; recent-pitch plot and ±15-cent/450 ms target hold. Play the base pitch to arm each attempt.
- **Timing:** audible metronome (30–240 BPM), nearest-beat attack error and manual tap/Space feedback. Use headphones. Attack sampling is coarse (~80 ms plus device latency); latency correction is user-specified, not automatic calibration. Exact song durations are absent from the tab, so song rhythm is not scored.
- **Local takes:** opt-in MediaRecorder capture from the existing USB audio input; playback, selection between the latest five takes, download and delete. Auto-stop at five minutes or approximately 20 MB. Audio lives only in this tab's memory until downloaded; reload/close loses it. The metronome is not mixed into recordings digitally (acoustic leakage is still possible).
- **Progress:** local counts for matched targets, skipped notes, completed phrases, bend holds and the last 100 attack timing errors; export JSON or clear. Counts are not a calibrated overall accuracy score.
- **Practice setup:** locally save/recall phrase, BPM, latency correction and bend settings. This does not save or recall pedal presets.
- **Footswitch learning:** map an incoming non-tuner CC/Program Change to manual next-note or start/stop phrase. Receive-only, tab-local, tested with simulated MIDI. Physical pedal footswitch support is not confirmed.

Metronome/playback make sound through the browser's selected output; live guitar monitoring remains disabled. Playback is excluded from scoring. Audio Stop also finishes recording and stops the phrase; metronome has its own Stop button. Backgrounding the page stops the metronome and phrase.

## Pedal controls and snapshots

Open **Pedal**, click **Connect MIDI**, then **Tone → Read pedal**. Close Stomp Manager while using these controls.

- Switch P01–P99 with confirmation; this discards unsaved temporary edits, not saved presets.
- Toggle all eight effect blocks while preserving the current model.
- Edit **Vox 30HW gain** (0–100). Other parameters/model selection are not enabled yet.
- Save up to 20 full current-preset snapshots in this browser; download JSON, recall or delete them. Recall reconstructs the saved preset plus supported bypass/gain changes, and refuses unsupported differences before switching. It does not write a saved preset. Snapshots are not global-settings/custom-IR/all-bank backups; JSON import is not implemented.

Each edit reads fresh state and verifies full preset readback; no automatic retries. A failed operation can leave temporary changes, so inspect the pedal/read again rather than assuming rollback. Physical footswitch testing was skipped at the user's request; its receive-only learning remains experimental.

See [protocol evidence, hardware verification and limits](docs/pedal-controls-research.md). Live verification covered all eight bypass controls, Vox gain, P05/P06 selection and snapshot recall, with exact restoration to the starting P06 current buffer.

## What it does

- YIN-based monophonic pitch estimate, note, Hz, cents relative to A4=440, level and clipping warning.
- Live logarithmic frequency spectrum (50–5,000 Hz).
- Possible string/fret positions on standard tuning, frets 0–21; optional assumed-string filter.
- Random note-finding prompts. Requires consecutive pitch matches within 25 cents for at least 450ms; one hit per prompt.
- Best session note count and practice progress stored locally. Recording is opt-in and local; no uploads, telemetry or external resources.
- A silent synthesized A2 demo that never earns practice credit. No speaker monitoring; listen through your pedal.

## Limits

The same pitch exists on different strings: this does not identify the actual string or fingering. The exercise suggests a position but validates only pitch. Not chord recognition, automatic tablature transcription, exact song-rhythm grading or a full learning curriculum. Alternate tunings are not supported yet. Noise, strong effects, bends, harmonics and chords can produce wrong estimates. Pitch periodicity is not a calibrated probability of correctness. Browser/USB buffering adds latency; input level is digital dBFS, not physical loudness.

Windows enumerated the pedal's recording endpoint during setup. Synthetic tests do not establish real guitar accuracy or confirm the pedal's recording routing; that requires playing through the selected input.

## Development and verification

```powershell
npm ci
npm test
npm run test:browser
```

`npm run typecheck` checks app, server, build script, and tests with strict TypeScript (without emitting files). `npm run build` cleans and compiles `dist/`, then copies HTML/CSS and test fixtures. Source imports deliberately use `.js` extensions for NodeNext/browser ESM compatibility; TypeScript resolves these to the corresponding `.ts` source files. Do not edit generated files in `dist/`.

Browser tests launch a fresh compiled server on port 4318, separate from the normal app on 4317, and use installed Microsoft Edge and simulated audio capture; test outputs and screenshots go in `.scratch/`. Unit tests cover the standard 21-fret pitch range at 44.1, 48 and 96 kHz with pure/harmonic signals, silence/noise, position mapping and hold timing. Browser tests cover demo detection, filtering, mobile overflow, denied permissions, practice scoring, silence, disconnect and track cleanup.

Implementation: `public/navigation.ts` owns hash navigation, view visibility, focus and activity links, preserving original feature DOM nodes and media lifecycles; `public/lessons.ts` owns supplied-tab pitch targets, phrase holds and timing helpers; `public/studio.ts` owns studio UI, metronome, local takes, progress and incoming footswitch learning; `public/pedal-tuner.ts` owns the MIDI connection and display; `public/tuner-control.ts` owns tuner GET/SET; `public/pedal-control.ts` owns preset readback and restricted temporary edits; `public/pedal-controls-ui.ts` owns pedal controls and browser-local snapshots; `public/dsp.ts` owns pitch/music logic; `public/app.ts` owns audio lifecycle and UI; `server.ts` serves only allowlisted assets on 127.0.0.1:4317. All dependencies are development-only: TypeScript, Node.js type definitions, and Playwright. Source files remain TypeScript; browsers receive compiled JavaScript.

# Soran pedal tuner integration

## Use
In Chrome or Edge, open **Pedal → Connect MIDI**, allow MIDI including SysEx, then open **Tuner** and click **Turn tuner on** or **Turn tuner off**. No manual pedal activation or Stomp Manager is required. Only the exact JME STOMPBOX input with a single same-name output is accepted for this protocol. Close competing MIDI apps if Windows refuses access.

Connecting sends nothing. Each On/Off action reads current tuner settings, changes only the enable field when necessary, waits for ACK, then reads back and verifies the enable field and all preserved fields. Requests are serialized and time out after 2.5 seconds per exchange. No automatic retries. A failed/uncertain operation is not displayed as success.

Disconnect or closing the page releases ports but **leaves tuner mode unchanged**; use Off first if desired. No unload commands. The pedal can mute USB audio in tuner mode, so turn it off before audio lessons.

## Protocol evidence
Read-only inspection of Stomp Manager 1.0.2.2 identified:
- getTuner at 0x661bdc: operation 0x6f, direction 0.
- setTuner at 0x662030: operation 0x6f, direction 1, five tuner fields.
- Note assets ordered A, Bb, B, C, C#, D, Eb, E, F, F#, G, G#.
- Tuning indicator display thresholds 48.0 and 52.0 at 0x4e433a / 0x4e4385.

A receive-only capture established the Soran frame header and 16-byte settings/reply shape. Related public implementation https://github.com/tuntorius/mightier_amp corroborates the tuner enable setting, note ordering and indicator centre; its transport header is different and was NOT used as a Soran header.

### Wire format
`F0 00 21 7A 70 6F direction payload[8] F7`

- GET: direction 0, eight zero payload bytes.
- Settings reply: direction 2.
- SET: direction 1, copy the fresh settings reply payload and change ONLY payload[0] to 0 or 1.
- ACK: direction 3, payload[0] must be 1.
- Do not confuse CC state/validity with the SysEx tuner enable field.

### Live verification
On this connected JME STOMPBOX (VID 3962 / PID 2000), a fresh query returned payload `01 00 0A 00 00 00 00 00`. The implementation successfully requested Off and received ACK plus settings readback `00 00 0A 00 00 00 00 00`, then requested On and read back the original payload. Starting state was restored. Other payload fields remained unchanged.

Full local evidence: `.scratch/tuner-control-verification.json`. This establishes command acknowledgement and state readback, not independent visual observation of the physical screen. No firmware, preset, reference-pitch or mute-setting edits were sent.

## Experimental note display
Channel 1 CC mapping inferred from capture and editor assets:
- CC 69 (0x45): note state/validity, 1 enables display and 0 hides it.
- CC 70 (0x46): note index 0–11 in the note table above.
- CC 72 (0x48): indicator 0–100; below 48 flat, 48–52 centred, above 52 sharp.

The user reported that the display works. No calibrated acoustic accuracy or complete firmware protocol coverage is claimed. Raw indicator units are shown, not absolute cents, octave, frequency, actual string or fret. Two seconds without recognized CC data hides readings. Cached note fields survive temporary inactivity because the stream contains change-only updates; unplug/disconnect clears them.

Audio analysis remains separate and powers the lessons/fretboard. It cannot be replaced by these MIDI messages, which lack octave information.

## Software verification
Unit tests cover parsing, malformed input, thresholds, stale data, reset, restricted SET construction, preservation of settings, ACK/readback, timeout, cancellation and concurrent requests. Browser tests mock Web MIDI to cover permission/missing-device errors, readings, audio independence, unplug/reconnect, controls, timeouts and cleanup. Real-device verification uses the same TunerControl module. Research artifacts remain in ignored `.scratch/`; no vendor binary or memory dump is shipped.

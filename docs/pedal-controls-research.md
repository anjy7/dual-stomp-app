# JME pedal control: implemented scope and protocol evidence

## Available

Open **Pedal → Connect MIDI → Tone → Read pedal**. Snapshot actions are under **Pedal snapshots**. Connecting itself sends nothing. Tuner and pedal operations share one serialized MIDI connection.

- Preset selection P01–P99. Program Change on channel 2; zero-based index. Switching discards unsaved edits and requires confirmation. The editor reads all 99 slots; live selection/readback was verified for P05 and P06, not individually for all 99.
- Eight effect bypass switches: OD/FX, AMP, CAB, MOD, DEL, REV, GATE, EQ. Preserve the freshly read model index. Live-tested both states of each block on P06.
- Vox 30HW amp gain, 0–100. This is the only enabled parameter editor. Other amp models, EQ bands, delay/reverb knobs and model selection remain unavailable until their individual mappings/ranges are verified.
- Up to 20 browser-local snapshots, containing the complete current preset packet and slot reference. Download JSON or delete. Not an all-bank backup; does not include global settings, firmware, or custom IR audio.
- Snapshot recall: read the saved slot first and prove that the requested snapshot differs only in bypass flags and the supported gain parameter. Unknown parameter/model/name/order differences refuse recall **before switching**. Recall loads the saved slot, checks its full readback, applies supported differences and compares the entire resulting snapshot. No saved-preset or flash-write command is sent. JSON import is not implemented.
- Existing receive-only footswitch learning remains experimental. User explicitly skipped the physical switch test in this stage. It matches an exact learned non-tuner CC/Program Change, not an inferred left/right switch identity. It is not known whether the pedal emits suitable traffic. Outgoing app operations suppress forwarding their immediate replies to the lesson mapper.

Close Stomp Manager and other MIDI editors while using the app: the protocol has no transaction identifier to distinguish competing queries. Errors/timeouts/disconnects clear the displayed state and do not retry or automatically roll back. A failed recall can leave a partially changed temporary state. Read the pedal again or select a known preset. Saved presets are not overwritten.

## Hardware and observation

Connected device identifies as JME-01, firmware V1.1.1, USB/MIDI name JME STOMPBOX. Commands were captured from Stomp Manager 1.0.2.2 by temporarily observing WinMM send calls and incoming callbacks with Frida. Hooks were detached afterward; executable files and firmware were not modified.

The user confirmed edits were saved and authorized temporary changes, but not preset overwrites. Initial native-editor tests sent restoration commands; later complete readback verification established restoration.

An earlier USB outage caused no-response errors and then zero enumerated endpoints. Power cycling restored enumeration and tuner replies. This historical outage is resolved, not an outstanding blocker.

## Wire protocol

Private header: `F0 00 21 7A 70`. The examples below use hexadecimal.

- Device state/index: `15 00 F7` after header; 16-byte reply with `15 02`, preset index at wire byte 7.
- Saved preset read: `0B 00 <index>`, then thirteen zero bytes and `F7`.
- Current edit buffer read: `0C 00`, then fourteen zero bytes and `F7`.
- Both preset replies are 134 bytes: header, opcode, direction 2, 126 packed bytes, F7. Packing is a little-endian continuous 7-bit stream, not an MSB-prefix-per-seven-bytes format. It decodes to 110 bytes plus two zero padding bits.
- Decoded raw bytes 0–7 are request metadata (zero for current buffer, slot index for saved preset); bytes 8–11 hold little-endian length 98. Bytes 12–19 hold effect model and bypass flags. Bytes 94–109 hold the zero-terminated preset name.
- Effect CC: `B1 <slot> <model | (disabled ? 40 : 00)>`, where slots 0–7 map to OD/FX, AMP, CAB, MOD, DEL, REV, GATE, EQ. Bit 6 is bypass; low 6 bits are model index.
- Vox 30HW gain: `B1 12 <value>`, decoded raw byte **33**. Byte 34 is bass, not gain. An initial test caught this offset mistake via whole-buffer mismatch, stopped, restored gain to 50, corrected the mapping, and reran the complete suite successfully.
- Preset select: `C1 <zero-based slot>`.
- Current effect order: opcode `0D`, GET direction 0. The editor uses the same `getCurrentPresetLink` diagnostic string for GET and SET, so names alone are not sufficient evidence of read-only behavior.

No full-buffer SET, firmware, preset-save, IR-write or system-setting command is exposed.

## Evidence and validation

- `.scratch/editor-connect-trace.json`: editor initialization and all saved/current reads; firmware identification.
- `.scratch/editor-effects-trace.json`: individual editor bypass toggles and restoration for all eight blocks. Duplicate trace entries are WINMM/winmmbase hooks, not duplicate application sends.
- `.scratch/editor-midi-trace.json`: preset P05/P06, amp bypass and gain native-editor commands.
- `.scratch/pedal-controls-verification.json`: real-device read/write/readback sequence, all eight bypass toggles/restores, gain change/restore, P05/P06 switch, snapshot recall, exact final current-buffer equality with starting P06/gain 50.
- `.scratch/pedal-controls-ui-verification.json` and `.scratch/pedal-controls-live.png`: real Edge UI read, browser-local snapshot save, gain 50→51, snapshot recall→50, disconnect, no page errors.
- `test/fixtures/jme-p06.json`: real readback fixture; unit tests cover offset decoding, preserved bytes, validated ranges, unsupported model refusal, recall preflight, timeout/disconnect/serialization and readback mismatch.
- `test/browser/pedal-controls.spec.ts`: simulated end-to-end controls, snapshot persistence/download/delete, disconnect and mobile layout. Existing tuner and studio tests remain applicable.

Implementation owners: `public/pedal-control.ts` (protocol and verification), `public/pedal-controls-ui.ts` (controls/storage), `public/pedal-tuner.ts` (shared connection and serialization). The app never opens MIDI output for arbitrary devices; it requires exactly one JME STOMPBOX input and matching output.

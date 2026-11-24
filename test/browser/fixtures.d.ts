// Deliberately partial browser API doubles; only members used by the app are modeled.
export interface MockPort {
 name: string; state: string; onmidimessage: ((event: {data: number[] | Uint8Array}) => void) | null;
 open(): Promise<unknown>; close(): Promise<unknown>; closed?: number;
}
interface MockOutput { send(packet: number[]): void }
interface MockAccess { onstatechange?: (() => void) | null }
declare global {
 interface Window {
  fixture: {ctx: AudioContext; oscillator: OscillatorNode; gain: GainNode; stream: MediaStream};
  audioFixture: {c: AudioContext; o: OscillatorNode; g: GainNode};
  midiFixture: {port: MockPort; access: MockAccess; output: MockOutput; snapshot: number[]; sent: number[][]; options: MIDIOptions | null | undefined; silent?: boolean};
  fx: {input: MockPort; output: MockOutput; access: MockAccess; sent: number[][]; silent?: boolean};
  sessionFixture: {audioOpens: number; midiOpens: number; midiCloses: number; sent: number[][]; context?: AudioContext; stream?: MediaStream};
 }
}

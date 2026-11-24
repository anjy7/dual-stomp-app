export type MidiBytes = readonly number[] | Uint8Array;
export interface MidiSender { send(data: number[] | Uint8Array): void }
export interface PendingReply { resolve: (data: number[]) => void; reject: (reason: unknown) => void; timer: ReturnType<typeof setTimeout> }
export type AudioMode = 'idle' | 'live' | 'demo';
export interface AudioSession { mode: AudioMode; stream: MediaStream | null | undefined }
declare global { interface WindowEventMap { 'pedal-message': CustomEvent<number[]> } }

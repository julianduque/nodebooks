import { serialize, deserialize } from "node:v8";

const MAGIC = 0x4e42; // 'NB'
const VERSION = 1;

export const StreamKind = {
  Stdout: 1,
  Stderr: 2,
  Display: 3,
  Log: 4,
} as const;
export type StreamKind = (typeof StreamKind)[keyof typeof StreamKind];

export interface StreamFrameBase {
  kind: StreamKind;
  jobId: number;
  final?: boolean;
}

export interface TextFrame extends StreamFrameBase {
  text: string;
}

export interface DisplayFrame extends StreamFrameBase {
  data: unknown;
}

export type DecodedFrame = TextFrame | DisplayFrame;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const packText = (
  kind: StreamKind,
  jobId: number,
  text: string,
  final = false
): Uint8Array => {
  const payload = encoder.encode(text);
  return pack(kind, jobId, payload, final);
};

export const packDisplay = (
  jobId: number,
  data: unknown,
  final = false
): Uint8Array => {
  const payload = new Uint8Array(serialize(data));
  return pack(StreamKind.Display, jobId, payload, final);
};

const pack = (
  kind: StreamKind,
  jobId: number,
  payload: Uint8Array,
  final: boolean
): Uint8Array => {
  const headerSize = 2 + 1 + 1 + 4 + 1 + 4;
  const buf = new ArrayBuffer(headerSize + payload.byteLength);
  const view = new DataView(buf);
  let off = 0;
  view.setUint16(off, MAGIC, true);
  off += 2;
  view.setUint8(off++, VERSION);
  view.setUint8(off++, kind);
  view.setUint32(off, jobId >>> 0, true);
  off += 4;
  const flags = final ? 1 : 0;
  view.setUint8(off++, flags);
  view.setUint32(off, payload.byteLength >>> 0, true);
  off += 4;
  new Uint8Array(buf, headerSize).set(payload);
  return new Uint8Array(buf);
};

export const tryDecode = (bytes: Uint8Array): DecodedFrame | null => {
  if (bytes.byteLength < 13) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const magic = view.getUint16(off, true);
  off += 2;
  if (magic !== MAGIC) return null;
  const version = view.getUint8(off++);
  if (version !== VERSION) return null;
  const kind = view.getUint8(off++) as StreamKind;
  const jobId = view.getUint32(off, true);
  off += 4;
  const flags = view.getUint8(off++);
  const len = view.getUint32(off, true);
  off += 4;
  if (bytes.byteLength < off + len) return null;
  const payload = new Uint8Array(bytes.buffer, bytes.byteOffset + off, len);
  const final = (flags & 1) === 1;
  if (kind === StreamKind.Display) {
    try {
      const obj = deserialize(payload);
      return { kind, jobId, data: obj, final } as DisplayFrame;
    } catch {
      return null;
    }
  }
  const text = decoder.decode(payload);
  return { kind, jobId, text, final } as TextFrame;
};

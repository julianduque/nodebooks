const T: Uint32Array = (() => {
  const buffer = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) {
    buffer[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  }
  return buffer;
})();

const leftRotate = (value: number, count: number) =>
  ((value << count) | (value >>> (32 - count))) >>> 0;

const add = (x: number, y: number) => (x + y) >>> 0;

const F = (x: number, y: number, z: number) => (x & y) | (~x & z);
const G = (x: number, y: number, z: number) => (x & z) | (y & ~z);
const H = (x: number, y: number, z: number) => x ^ y ^ z;
const I = (x: number, y: number, z: number) => y ^ (x | ~z);

const S1 = [7, 12, 17, 22] as const;
const S2 = [5, 9, 14, 20] as const;
const S3 = [4, 11, 16, 23] as const;
const S4 = [6, 10, 15, 21] as const;

const toHexLE = (value: number) =>
  [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const toWordArray = (bytes: Uint8Array) => {
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 4; // length in 32-bit words
  const words = new Uint32Array(paddedLength);

  for (let i = 0; i < bytes.length; i += 1) {
    words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  }

  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  words[paddedLength - 2] = bitLength >>> 0;

  return words;
};

const processBlock = (
  state: Uint32Array,
  block: Uint32Array,
  offset: number
) => {
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];

  for (let i = 0; i < 64; i += 1) {
    let f: number;
    let g: number;

    if (i < 16) {
      f = F(b, c, d);
      g = i;
      const temp = d;
      d = c;
      c = b;
      b = add(
        b,
        leftRotate(add(add(a, f), add(block[offset + g], T[i])), S1[i % 4])
      );
      a = temp;
      continue;
    }

    if (i < 32) {
      f = G(b, c, d);
      g = (5 * i + 1) % 16;
      const temp = d;
      d = c;
      c = b;
      b = add(
        b,
        leftRotate(add(add(a, f), add(block[offset + g], T[i])), S2[i % 4])
      );
      a = temp;
      continue;
    }

    if (i < 48) {
      f = H(b, c, d);
      g = (3 * i + 5) % 16;
      const temp = d;
      d = c;
      c = b;
      b = add(
        b,
        leftRotate(add(add(a, f), add(block[offset + g], T[i])), S3[i % 4])
      );
      a = temp;
      continue;
    }

    f = I(b, c, d);
    g = (7 * i) % 16;
    const temp = d;
    d = c;
    c = b;
    b = add(
      b,
      leftRotate(add(add(a, f), add(block[offset + g], T[i])), S4[i % 4])
    );
    a = temp;
  }

  state[0] = add(state[0], a);
  state[1] = add(state[1], b);
  state[2] = add(state[2], c);
  state[3] = add(state[3], d);
};

export const md5Hex = (input: string) => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const words = toWordArray(bytes);
  const state = new Uint32Array([
    0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476,
  ]);

  for (let offset = 0; offset < words.length; offset += 16) {
    processBlock(state, words, offset);
  }

  const [a, b, c, d] = state;
  return (toHexLE(a) + toHexLE(b) + toHexLE(c) + toHexLE(d)).toLowerCase();
};

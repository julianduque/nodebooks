import { describe, it, expect } from "vitest";
import { packText, packDisplay, tryDecode, StreamKind } from "../src/ipc-codec";

describe("ipcCodec", () => {
  it("encodes/decodes text frames (stdout)", () => {
    const bytes = packText(StreamKind.Stdout, 1234, "hello", false);
    const decoded = tryDecode(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.kind).toBe(StreamKind.Stdout);
    // @ts-expect-error runtime type narrowing
    expect(decoded!.text).toBe("hello");
    expect(decoded!.jobId).toBe(1234);
    expect(decoded!.final).toBe(false);
  });

  it("encodes/decodes display frames (final)", () => {
    const data = { a: 1, nested: { b: "x" } };
    const bytes = packDisplay(77, data, true);
    const decoded = tryDecode(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.kind).toBe(StreamKind.Display);
    // @ts-expect-error runtime type narrowing
    expect(decoded!.data).toEqual(data);
    expect(decoded!.jobId).toBe(77);
    expect(decoded!.final).toBe(true);
  });

  it("returns null for invalid magic/version", () => {
    const good = packText(StreamKind.Stderr, 9, "oops", true);
    const broken = new Uint8Array(good);
    broken[0] ^= 0xff; // flip magic
    expect(tryDecode(broken)).toBeNull();
  });
});

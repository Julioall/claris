import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptSessionData,
  encryptSessionData,
} from "@/lib/session-crypto";

describe("session-crypto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encrypts and decrypts payload using crypto when available", async () => {
    const payload = { userId: "u-1", token: "secret-token" };

    const encrypted = await encryptSessionData(payload);
    expect(encrypted.startsWith("enc:")).toBe(true);

    const decrypted = await decryptSessionData<typeof payload>(encrypted);
    expect(decrypted).toEqual(payload);
  });

  it("falls back to base64 format when crypto is unavailable", async () => {
    const payload = { key: "value" };
    vi.stubGlobal("crypto", undefined);

    const encrypted = await encryptSessionData(payload);
    expect(encrypted.startsWith("enc:")).toBe(false);

    const decrypted = await decryptSessionData<typeof payload>(encrypted);
    expect(decrypted).toEqual(payload);
  });

  it("decrypts legacy base64 payload", async () => {
    const payload = { legacy: true, count: 2 };
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));

    const decrypted = await decryptSessionData<typeof payload>(encoded);

    expect(decrypted).toEqual(payload);
  });

  it("returns null when payload cannot be decrypted", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const decrypted = await decryptSessionData("enc:invalid-payload");

    expect(decrypted).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

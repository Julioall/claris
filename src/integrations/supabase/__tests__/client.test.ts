import { describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn(() => ({ mocked: true }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

describe("integrations/supabase/client", () => {
  it("cria cliente com URL/chave do ambiente e opções de auth", async () => {
    const mod = await import("@/integrations/supabase/client");

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClientMock.mock.calls[0];

    expect(url).toBe(import.meta.env.VITE_SUPABASE_URL);
    expect(key).toBe(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    expect(options).toMatchObject({
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    });

    expect(mod.supabase).toEqual({ mocked: true });
  });
});

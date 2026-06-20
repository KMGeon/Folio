import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { userId: string; expiresAt: Date }>();

vi.mock("@folio/db", () => ({
  sessionsRepo: {
    create: vi.fn(async (input) => {
      store.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt });
      return { id: "s1", ...input, createdAt: new Date(), updatedAt: new Date() };
    }),
    getByTokenHash: vi.fn(async (hash) => {
      const row = store.get(hash);
      return row ? { id: "s1", tokenHash: hash, ...row } : null;
    }),
    deleteByTokenHash: vi.fn(async (hash) => {
      store.delete(hash);
    }),
  },
}));

const { SessionService } = await import("./session.service.js");

describe("SessionService", () => {
  beforeEach(() => store.clear());

  it("creates a session and resolves the raw token back to the user", async () => {
    const svc = new SessionService();
    const { token } = await svc.createForUser("user-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    // Stored hash is sha256 of the token, not the token itself.
    expect(store.has(token)).toBe(false);
    expect(store.has(createHash("sha256").update(token).digest("hex"))).toBe(true);

    const resolved = await svc.resolve(token);
    expect(resolved).toEqual({ userId: "user-1" });
  });

  it("returns null for unknown or missing tokens", async () => {
    const svc = new SessionService();
    expect(await svc.resolve(undefined)).toBeNull();
    expect(await svc.resolve("nope")).toBeNull();
  });

  it("treats expired sessions as invalid and removes them", async () => {
    const svc = new SessionService();
    const { token } = await svc.createForUser("user-1");
    const hash = createHash("sha256").update(token).digest("hex");
    store.set(hash, { userId: "user-1", expiresAt: new Date(Date.now() - 1000) });
    expect(await svc.resolve(token)).toBeNull();
    expect(store.has(hash)).toBe(false);
  });

  it("destroy deletes the session", async () => {
    const svc = new SessionService();
    const { token } = await svc.createForUser("user-1");
    await svc.destroy(token);
    expect(await svc.resolve(token)).toBeNull();
  });
});

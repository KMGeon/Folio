import { describe, expect, it, vi } from "vitest";
import { RepoAccessService } from "./repo-access.service.js";

function adapterStub(canAccess: ReturnType<typeof vi.fn>) {
  return { userCanAccessRepo: canAccess } as unknown as ConstructorParameters<
    typeof RepoAccessService
  >[0];
}

const REF = { owner: "acme", repo: "widget", username: "octocat" };

describe("RepoAccessService", () => {
  it("returns the adapter result", async () => {
    const canAccess = vi.fn().mockResolvedValue(true);
    const svc = new RepoAccessService(adapterStub(canAccess));
    expect(await svc.assertAccessAllowed(REF)).toBe(true);
  });

  it("caches a positive result within the TTL (one adapter call)", async () => {
    const canAccess = vi.fn().mockResolvedValue(true);
    const svc = new RepoAccessService(adapterStub(canAccess));
    await svc.assertAccessAllowed(REF);
    await svc.assertAccessAllowed(REF);
    expect(canAccess).toHaveBeenCalledTimes(1);
  });

  it("does not cache a denial (re-checks each time)", async () => {
    const canAccess = vi.fn().mockResolvedValue(false);
    const svc = new RepoAccessService(adapterStub(canAccess));
    await svc.assertAccessAllowed(REF);
    await svc.assertAccessAllowed(REF);
    expect(canAccess).toHaveBeenCalledTimes(2);
  });
});

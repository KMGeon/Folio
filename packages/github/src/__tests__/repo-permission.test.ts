import type { Octokit } from "octokit";
import { describe, expect, it, vi } from "vitest";
import { checkUserRepoPermission } from "../repo-permission.js";

function fakeOctokit(getCollaboratorPermissionLevel: ReturnType<typeof vi.fn>): Octokit {
  return {
    rest: { repos: { getCollaboratorPermissionLevel } },
  } as unknown as Octokit;
}

const REF = { owner: "acme", repo: "widget", username: "octocat" };

describe("checkUserRepoPermission", () => {
  it("returns true for read/write/admin", async () => {
    for (const permission of ["read", "write", "admin"]) {
      const fn = vi.fn().mockResolvedValue({ data: { permission } });
      expect(await checkUserRepoPermission(fakeOctokit(fn), REF)).toBe(true);
    }
  });

  it("returns false for none", async () => {
    const fn = vi.fn().mockResolvedValue({ data: { permission: "none" } });
    expect(await checkUserRepoPermission(fakeOctokit(fn), REF)).toBe(false);
  });

  it("returns false when GitHub responds 404", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 404 });
    expect(await checkUserRepoPermission(fakeOctokit(fn), REF)).toBe(false);
  });

  it("rethrows non-404 errors", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500 });
    await expect(checkUserRepoPermission(fakeOctokit(fn), REF)).rejects.toBeTruthy();
  });
});

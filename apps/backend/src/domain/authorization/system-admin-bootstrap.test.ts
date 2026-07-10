import { usersRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapSystemAdmin } from "./system-admin-bootstrap.js";

vi.mock("@folio/db", () => ({
  usersRepo: {
    getSystemAdmin: vi.fn(),
    getByGithubId: vi.fn(),
    setSystemAdmin: vi.fn(),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("bootstrapSystemAdmin", () => {
  it("promotes the configured user when no system admin exists", async () => {
    vi.mocked(usersRepo.getSystemAdmin).mockResolvedValue(null);
    vi.mocked(usersRepo.getByGithubId).mockResolvedValue({ id: "u1" } as never);

    await bootstrapSystemAdmin(42, 42);

    expect(usersRepo.getSystemAdmin).toHaveBeenCalledOnce();
    expect(usersRepo.getByGithubId).toHaveBeenCalledOnce();
    expect(usersRepo.getByGithubId).toHaveBeenCalledWith(42);
    expect(usersRepo.setSystemAdmin).toHaveBeenCalledOnce();
    expect(usersRepo.setSystemAdmin).toHaveBeenCalledWith("u1", true);
  });

  it("does nothing when the bootstrap id is absent", async () => {
    await bootstrapSystemAdmin(42, undefined);

    expect(usersRepo.getSystemAdmin).not.toHaveBeenCalled();
    expect(usersRepo.getByGithubId).not.toHaveBeenCalled();
    expect(usersRepo.setSystemAdmin).not.toHaveBeenCalled();
  });

  it("does nothing for a non-matching github id", async () => {
    await bootstrapSystemAdmin(99, 42);

    expect(usersRepo.getSystemAdmin).not.toHaveBeenCalled();
    expect(usersRepo.getByGithubId).not.toHaveBeenCalled();
    expect(usersRepo.setSystemAdmin).not.toHaveBeenCalled();
  });

  it("does nothing when a system admin already exists", async () => {
    vi.mocked(usersRepo.getSystemAdmin).mockResolvedValue({ id: "existing" } as never);

    await bootstrapSystemAdmin(42, 42);

    expect(usersRepo.getSystemAdmin).toHaveBeenCalledOnce();
    expect(usersRepo.getByGithubId).not.toHaveBeenCalled();
    expect(usersRepo.setSystemAdmin).not.toHaveBeenCalled();
  });

  it("does nothing when the matching user is missing", async () => {
    vi.mocked(usersRepo.getSystemAdmin).mockResolvedValue(null);
    vi.mocked(usersRepo.getByGithubId).mockResolvedValue(null);

    await bootstrapSystemAdmin(42, 42);

    expect(usersRepo.getSystemAdmin).toHaveBeenCalledOnce();
    expect(usersRepo.getByGithubId).toHaveBeenCalledOnce();
    expect(usersRepo.getByGithubId).toHaveBeenCalledWith(42);
    expect(usersRepo.setSystemAdmin).not.toHaveBeenCalled();
  });
});

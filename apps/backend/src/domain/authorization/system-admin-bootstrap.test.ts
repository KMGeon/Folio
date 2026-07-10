import { usersRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapSystemAdmin } from "./system-admin-bootstrap.js";

vi.mock("@folio/db", () => ({
  usersRepo: {
    bootstrapInitialSystemAdmin: vi.fn(),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("bootstrapSystemAdmin", () => {
  it("delegates the matching configured user to the atomic repository bootstrap", async () => {
    await bootstrapSystemAdmin(42, 42);

    expect(usersRepo.bootstrapInitialSystemAdmin).toHaveBeenCalledOnce();
    expect(usersRepo.bootstrapInitialSystemAdmin).toHaveBeenCalledWith(42);
  });

  it("does nothing when the bootstrap id is absent", async () => {
    await bootstrapSystemAdmin(42, undefined);

    expect(usersRepo.bootstrapInitialSystemAdmin).not.toHaveBeenCalled();
  });

  it("does nothing for a non-matching github id", async () => {
    await bootstrapSystemAdmin(99, 42);

    expect(usersRepo.bootstrapInitialSystemAdmin).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspacesRepo } from "./workspaces.js";

describe("workspacesRepo authority locks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("locks one workspace by id for an authority transaction", async () => {
    const forUpdate = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ for: forUpdate });
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });

    await expect(
      workspacesRepo.getByIdForUpdate("workspace-1", { select } as never),
    ).resolves.toBeNull();

    expect(forUpdate).toHaveBeenCalledWith("update");
  });
});

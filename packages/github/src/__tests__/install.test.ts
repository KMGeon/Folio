import { ACCOUNT_TYPE } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInstallation = vi.hoisted(() => vi.fn());

vi.mock("../client.js", () => ({
  createAppOctokit: () => ({ rest: { apps: { getInstallation } } }),
  createInstallationOctokit: vi.fn(),
}));

import { getInstallationAccount } from "../install.js";

describe("getInstallationAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes the server-resolved GitHub installation account identity", async () => {
    getInstallation.mockResolvedValue({
      data: { account: { id: 42, login: "acme", type: "Organization" } },
    });

    await expect(getInstallationAccount(123)).resolves.toEqual({
      githubAccountId: 42,
      accountLogin: "acme",
      accountType: ACCOUNT_TYPE.ORGANIZATION,
    });
    expect(getInstallation).toHaveBeenCalledWith({ installation_id: 123 });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getInstallationToken = vi.fn();
const octokitInstances: unknown[] = [];

vi.mock("../auth/installation-token.js", () => ({
  getInstallationToken,
}));

vi.mock("octokit", () => ({
  Octokit: vi.fn(function MockOctokit(this: { auth?: string }, options: { auth?: string }) {
    this.auth = options.auth;
    octokitInstances.push(this);
  }),
}));

const { configureClients, createInstallationOctokit, resetClients } = await import("../client.js");

beforeEach(() => {
  resetClients();
  getInstallationToken.mockReset();
  octokitInstances.length = 0;
});

describe("createInstallationOctokit", () => {
  it("fetches a current installation token for each client request", async () => {
    getInstallationToken
      .mockResolvedValueOnce({ token: "token-1", expiresAt: new Date(Date.now() + 3_600_000) })
      .mockResolvedValueOnce({ token: "token-2", expiresAt: new Date(Date.now() + 3_600_000) });
    configureClients({ appId: 1, privateKey: "PEM" });

    const first = await createInstallationOctokit(141813782);
    const second = await createInstallationOctokit(141813782);

    expect(getInstallationToken).toHaveBeenCalledTimes(2);
    expect(getInstallationToken).toHaveBeenNthCalledWith(1, 141813782);
    expect(getInstallationToken).toHaveBeenNthCalledWith(2, 141813782);
    expect(first).not.toBe(second);
    expect(octokitInstances).toEqual([
      expect.objectContaining({ auth: "token-1" }),
      expect.objectContaining({ auth: "token-2" }),
    ]);
  });
});

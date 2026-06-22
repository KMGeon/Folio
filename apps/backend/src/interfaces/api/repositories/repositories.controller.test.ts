import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { RepositoriesFacade } from "../../../application/repositories/repositories.facade.js";
import { RepositoriesController } from "./repositories.controller.js";

describe("RepositoriesController", () => {
  it("lists repositories for the authenticated user", async () => {
    const facade = {
      listForUser: vi.fn().mockResolvedValue({ repositories: [] }),
    } as unknown as RepositoriesFacade;
    const controller = new RepositoriesController(facade);

    await expect(
      controller.list({ id: "user-1", login: "KMGeon", avatarUrl: "https://avatars/KMGeon" }),
    ).resolves.toEqual({
      repositories: [],
    });
    expect(facade.listForUser).toHaveBeenCalledWith({ login: "KMGeon" });
  });

  it("toggles repository activation", async () => {
    const facade = {
      setEnabled: vi.fn().mockResolvedValue({ id: "repo-1", folioEnabled: true }),
    } as unknown as RepositoriesFacade;
    const controller = new RepositoriesController(facade);

    await expect(
      controller.setEnabled(
        { id: "user-1", login: "KMGeon", avatarUrl: "https://avatars/KMGeon" },
        "repo-1",
        { enabled: true },
      ),
    ).resolves.toEqual({ id: "repo-1", folioEnabled: true });
    expect(facade.setEnabled).toHaveBeenCalledWith({
      user: { login: "KMGeon" },
      repositoryId: "repo-1",
      enabled: true,
    });
  });

  it("rejects invalid toggle bodies with a bad request", async () => {
    const facade = {
      setEnabled: vi.fn(),
    } as unknown as RepositoriesFacade;
    const controller = new RepositoriesController(facade);

    await expect(
      controller.setEnabled(
        { id: "user-1", login: "KMGeon", avatarUrl: "https://avatars/KMGeon" },
        "repo-1",
        { enabled: "true" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(facade.setEnabled).not.toHaveBeenCalled();
  });
});

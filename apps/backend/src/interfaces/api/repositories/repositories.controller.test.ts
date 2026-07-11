import { BadRequestException } from "@nestjs/common";
import { ENTITLEMENT_FEATURE } from "@folio/types";
import { describe, expect, it, vi } from "vitest";
import type { RepositoriesFacade } from "../../../application/repositories/repositories.facade.js";
import { REQUIRE_ENTITLEMENT } from "../authorization/require-entitlement.decorator.js";
import { RepositoriesController } from "./repositories.controller.js";

describe("RepositoriesController", () => {
  it("lists repositories for the authenticated user", async () => {
    const facade = {
      listForUser: vi.fn().mockResolvedValue({
        githubInstallationId: 145418830,
        repositories: [],
      }),
    } as unknown as RepositoriesFacade;
    const controller = new RepositoriesController(facade);

    await expect(
      controller.list({ id: "user-1", login: "KMGeon", avatarUrl: "https://avatars/KMGeon" }),
    ).resolves.toEqual({
      githubInstallationId: 145418830,
      repositories: [],
    });
    expect(facade.listForUser).toHaveBeenCalledWith({ userId: "user-1", login: "KMGeon" });
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
      user: { id: "user-1", login: "KMGeon" },
      repositoryId: "repo-1",
      enabled: true,
    });
  });

  it("requires the repository activation entitlement on mutations only", () => {
    const toggle = Object.getOwnPropertyDescriptor(
      RepositoriesController.prototype,
      "setEnabled",
    )?.value;
    const list = Object.getOwnPropertyDescriptor(RepositoriesController.prototype, "list")?.value;

    expect(Reflect.getMetadata(REQUIRE_ENTITLEMENT, toggle)).toBe(
      ENTITLEMENT_FEATURE.REPO_ACTIVATION,
    );
    expect(Reflect.getMetadata(REQUIRE_ENTITLEMENT, list)).toBeUndefined();
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

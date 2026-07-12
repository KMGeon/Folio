import { BadRequestException } from "@nestjs/common";
import { ENTITLEMENT_FEATURE } from "@folio/types";
import { describe, expect, it, vi } from "vitest";
import type { RepositoriesFacade } from "../../../application/repositories/repositories.facade.js";
import { REQUIRE_ENTITLEMENT } from "../authorization/require-entitlement.decorator.js";
import { RepositoriesController } from "./repositories.controller.js";

describe("RepositoriesController", () => {
  it("lists repositories for the authenticated user", async () => {
    const payload = {
      githubInstallationId: 145418830,
      repositories: [
        {
          id: "repo-1",
          installationId: "installation-1",
          githubRepoId: 456,
          owner: "acme",
          name: "folio",
          fullName: "acme/folio",
          private: true,
          defaultBranch: "main",
          folioEnabled: false,
          githubAccessActive: true,
          aiReplyEnabled: true,
          priority: "normal",
        },
      ],
    };
    const facade = {
      listForUser: vi.fn().mockResolvedValue(payload),
    } as unknown as RepositoriesFacade;
    const controller = new RepositoriesController(facade, { setPreferences: vi.fn() } as never);

    await expect(
      controller.list(
        {
          id: "user-1",
          login: "KMGeon",
          avatarUrl: "https://avatars/KMGeon",
          isSystemAdmin: false,
        },
        { cookies: { folio_workspace: "workspace-1" } },
      ),
    ).resolves.toEqual(payload);
    expect(facade.listForUser).toHaveBeenCalledWith(
      { userId: "user-1", login: "KMGeon" },
      "workspace-1",
    );
  });

  it("toggles repository activation", async () => {
    const facade = {
      setEnabled: vi.fn().mockResolvedValue({ id: "repo-1", folioEnabled: true }),
    } as unknown as RepositoriesFacade;
    const controller = new RepositoriesController(facade, { setPreferences: vi.fn() } as never);

    await expect(
      controller.setEnabled(
        {
          id: "user-1",
          login: "KMGeon",
          avatarUrl: "https://avatars/KMGeon",
          isSystemAdmin: false,
        },
        "repo-1",
        { enabled: true },
        { cookies: { folio_workspace: "workspace-1" } },
      ),
    ).resolves.toEqual({ id: "repo-1", folioEnabled: true });
    expect(facade.setEnabled).toHaveBeenCalledWith(
      {
        user: { id: "user-1", login: "KMGeon" },
        repositoryId: "repo-1",
        enabled: true,
      },
      "workspace-1",
    );
  });

  it("updates repository reply and priority preferences", async () => {
    const facade = { listForUser: vi.fn(), setEnabled: vi.fn() } as unknown as RepositoriesFacade;
    const preferences = {
      setPreferences: vi.fn().mockResolvedValue({
        id: "repo-1",
        aiReplyEnabled: false,
        priority: "high",
      }),
    };
    const controller = new RepositoriesController(facade, preferences as never);

    await expect(
      controller.setPreferences(
        {
          id: "user-1",
          login: "KMGeon",
          avatarUrl: "https://avatars/KMGeon",
          isSystemAdmin: false,
        },
        "repo-1",
        { aiReplyEnabled: false, priority: "high" },
      ),
    ).resolves.toEqual({ id: "repo-1", aiReplyEnabled: false, priority: "high" });
    expect(preferences.setPreferences).toHaveBeenCalledWith({
      user: { id: "user-1", login: "KMGeon" },
      repositoryId: "repo-1",
      aiReplyEnabled: false,
      priority: "high",
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
    const preferences = Object.getOwnPropertyDescriptor(
      RepositoriesController.prototype,
      "setPreferences",
    )?.value;
    expect(Reflect.getMetadata(REQUIRE_ENTITLEMENT, preferences)).toBe(
      ENTITLEMENT_FEATURE.REPO_ACTIVATION,
    );
    expect(Reflect.getMetadata(REQUIRE_ENTITLEMENT, list)).toBeUndefined();
  });

  it("rejects an empty or invalid repository settings body", async () => {
    const facade = { listForUser: vi.fn(), setEnabled: vi.fn() } as unknown as RepositoriesFacade;
    const preferences = { setPreferences: vi.fn() };
    const controller = new RepositoriesController(facade, preferences as never);
    const user = {
      id: "user-1",
      login: "KMGeon",
      avatarUrl: "https://avatars/KMGeon",
      isSystemAdmin: false,
    };

    await expect(controller.setPreferences(user, "repo-1", {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.setPreferences(user, "repo-1", { priority: "urgent" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(preferences.setPreferences).not.toHaveBeenCalled();
  });

  it("rejects invalid toggle bodies with a bad request", async () => {
    const facade = {
      setEnabled: vi.fn(),
    } as unknown as RepositoriesFacade;
    const controller = new RepositoriesController(facade, { setPreferences: vi.fn() } as never);

    await expect(
      controller.setEnabled(
        {
          id: "user-1",
          login: "KMGeon",
          avatarUrl: "https://avatars/KMGeon",
          isSystemAdmin: false,
        },
        "repo-1",
        { enabled: "true" },
        { cookies: {} },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(facade.setEnabled).not.toHaveBeenCalled();
  });
});

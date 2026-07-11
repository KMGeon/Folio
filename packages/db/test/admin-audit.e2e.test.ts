import { ACCOUNT_TYPE, AUDIT_ACTION, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import {
  adminAuditRepo,
  auditLogsRepo,
  installationsRepo,
  repositoriesRepo,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;
const FIRST = new Date("2026-01-01T00:00:00.000Z");
const SECOND = new Date("2026-01-02T00:00:00.000Z");
const THIRD = new Date("2026-01-03T00:00:00.000Z");

async function seedAuditProjection(db: Db) {
  const actor = await usersRepo.create(
    { githubUserId: 1, login: "RootAdmin", avatarUrl: "https://example.com/root.png" },
    db,
  );
  const target = await usersRepo.create(
    { githubUserId: 2, login: "ReviewTarget", avatarUrl: "https://example.com/target.png" },
    db,
  );
  const workspace = await workspacesRepo.create(
    {
      githubAccountId: 10,
      accountLogin: "AcmeWorkspace",
      accountType: ACCOUNT_TYPE.ORGANIZATION,
    },
    db,
  );
  await workspaceMembersRepo.create(
    {
      workspaceId: workspace.id,
      userId: target.id,
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
    db,
  );
  const installation = await installationsRepo.create(
    {
      githubInstallationId: 20,
      githubAccountId: workspace.githubAccountId,
      accountLogin: workspace.accountLogin,
      accountType: ACCOUNT_TYPE.ORGANIZATION,
    },
    db,
  );
  const repository = await repositoriesRepo.create(
    {
      installationId: installation.id,
      workspaceId: workspace.id,
      githubRepoId: 30,
      owner: "AcmeWorkspace",
      name: "Widget",
      fullName: "AcmeWorkspace/Widget",
      private: false,
      defaultBranch: "main",
    },
    db,
  );

  const userApprove = await auditLogsRepo.record(
    {
      actorUserId: actor.id,
      action: AUDIT_ACTION.USER_APPROVE,
      targetType: "user",
      targetId: target.id,
      before: { status: "pending", snapshotOnlyMarker: "hidden-snapshot-value" },
      after: { status: "active" },
      createdAt: FIRST,
    },
    db,
  );
  const roleChange = await auditLogsRepo.record(
    {
      actorUserId: actor.id,
      action: AUDIT_ACTION.ROLE_CHANGE,
      targetType: "workspace_member",
      targetId: target.id,
      workspaceId: workspace.id,
      before: { role: WORKSPACE_ROLE.REVIEWER },
      after: { role: WORKSPACE_ROLE.ADMIN },
      createdAt: SECOND,
    },
    db,
  );
  const repoActivation = await auditLogsRepo.record(
    {
      actorUserId: actor.id,
      action: AUDIT_ACTION.REPO_ACTIVATION_CHANGE,
      targetType: "repository",
      targetId: repository.id,
      workspaceId: workspace.id,
      before: { folioEnabled: false },
      after: { folioEnabled: true },
      createdAt: THIRD,
    },
    db,
  );

  return { actor, target, workspace, repository, userApprove, roleChange, repoActivation };
}

d("adminAuditRepo (e2e)", () => {
  let db: Db;

  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("projects actor, user and repository labels with workspace metadata", async () => {
    const seeded = await seedAuditProjection(db);

    const page = await adminAuditRepo.list({ limit: 10 }, db);

    expect(page.hasMore).toBe(false);
    expect(page.items).toEqual([
      expect.objectContaining({
        audit: expect.objectContaining({ id: seeded.repoActivation.id }),
        actorLogin: "RootAdmin",
        actorAvatarUrl: "https://example.com/root.png",
        targetLabel: "AcmeWorkspace/Widget",
        workspaceLogin: "AcmeWorkspace",
      }),
      expect.objectContaining({
        audit: expect.objectContaining({ id: seeded.roleChange.id }),
        targetLabel: "ReviewTarget",
        workspaceLogin: "AcmeWorkspace",
      }),
      expect.objectContaining({
        audit: expect.objectContaining({ id: seeded.userApprove.id }),
        targetLabel: "ReviewTarget",
        workspaceLogin: null,
      }),
    ]);
  });

  it("filters by action, workspace, actor, target and inclusive date bounds", async () => {
    const seeded = await seedAuditProjection(db);

    await expect(
      adminAuditRepo.list({ action: AUDIT_ACTION.ROLE_CHANGE, limit: 10 }, db),
    ).resolves.toMatchObject({ items: [{ audit: { id: seeded.roleChange.id } }] });
    await expect(
      adminAuditRepo.list({ workspaceId: seeded.workspace.id, limit: 10 }, db),
    ).resolves.toMatchObject({
      items: [{ audit: { id: seeded.repoActivation.id } }, { audit: { id: seeded.roleChange.id } }],
    });
    const byActor = await adminAuditRepo.list({ actorUserId: seeded.actor.id, limit: 10 }, db);
    expect(byActor.items).toHaveLength(3);
    await expect(
      adminAuditRepo.list({ targetId: seeded.repository.id, limit: 10 }, db),
    ).resolves.toMatchObject({ items: [{ audit: { id: seeded.repoActivation.id } }] });
    await expect(
      adminAuditRepo.list({ from: SECOND, to: THIRD, limit: 10 }, db),
    ).resolves.toMatchObject({
      items: [{ audit: { id: seeded.repoActivation.id } }, { audit: { id: seeded.roleChange.id } }],
    });
  });

  it("searches only Phase 1 metadata case-insensitively with trimmed input", async () => {
    const seeded = await seedAuditProjection(db);

    for (const query of ["rootadmin", "REVIEWTARGET", "widget", "  acmeworkspace  "]) {
      const page = await adminAuditRepo.list({ q: query, limit: 10 }, db);
      expect(page.items.length).toBeGreaterThan(0);
    }
    await expect(
      adminAuditRepo.list({ q: "hidden-snapshot-value", limit: 10 }, db),
    ).resolves.toEqual({ items: [], hasMore: false });
    await expect(adminAuditRepo.list({ q: "widget", limit: 10 }, db)).resolves.toMatchObject({
      items: [{ audit: { id: seeded.repoActivation.id } }],
    });
  });

  it("uses a descending createdAt and id cursor without duplicating after a newer insert", async () => {
    const seeded = await seedAuditProjection(db);
    const firstPage = await adminAuditRepo.list({ from: FIRST, to: SECOND, limit: 1 }, db);
    const cursorRow = firstPage.items[0]?.audit;
    expect(cursorRow?.id).toBe(seeded.roleChange.id);
    expect(firstPage.hasMore).toBe(true);

    await auditLogsRepo.record(
      {
        actorUserId: seeded.actor.id,
        action: AUDIT_ACTION.USER_SUSPEND,
        targetType: "user",
        targetId: seeded.target.id,
        before: { status: "active" },
        after: { status: "suspended" },
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
      },
      db,
    );

    const secondPage = await adminAuditRepo.list(
      {
        limit: 10,
        cursor: { createdAt: cursorRow!.createdAt, id: cursorRow!.id },
      },
      db,
    );
    expect(secondPage.items.map(({ audit }) => audit.id)).toEqual([seeded.userApprove.id]);
  });
});

import type { MembershipStatus, WorkspaceRole } from "@folio/types";
import { and, asc, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import {
  type WorkspaceMemberInsert,
  type WorkspaceMemberRow,
  workspaceMembers,
} from "../schema/workspace-members.js";

export const workspaceMembersRepo = {
  async create(input: WorkspaceMemberInsert, db: Db = getDb()): Promise<WorkspaceMemberRow> {
    const [row] = await db.insert(workspaceMembers).values(input).returning();
    if (!row) {
      throw new Error("workspaceMembersRepo.create: insert returned no row");
    }
    return row;
  },

  async getMembership(
    workspaceId: string,
    userId: string,
    db: Db = getDb(),
  ): Promise<WorkspaceMemberRow | null> {
    const [row] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      )
      .limit(1);
    return row ?? null;
  },

  async listByWorkspace(workspaceId: string, db: Db = getDb()): Promise<WorkspaceMemberRow[]> {
    return db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(workspaceMembers.joinedAt));
  },

  async updateRole(
    id: string,
    role: WorkspaceRole,
    elevatedBy: string,
    db: Db = getDb(),
  ): Promise<WorkspaceMemberRow | null> {
    const [row] = await db
      .update(workspaceMembers)
      .set({ role, elevatedBy, updatedAt: new Date() })
      .where(eq(workspaceMembers.id, id))
      .returning();
    return row ?? null;
  },

  async updateRoleIfCurrent(
    id: string,
    currentRole: WorkspaceRole,
    role: WorkspaceRole,
    elevatedBy: string,
    db: Db = getDb(),
  ): Promise<WorkspaceMemberRow | null> {
    const [row] = await db
      .update(workspaceMembers)
      .set({ role, elevatedBy, updatedAt: new Date() })
      .where(and(eq(workspaceMembers.id, id), eq(workspaceMembers.role, currentRole)))
      .returning();
    return row ?? null;
  },

  async updateStatus(
    id: string,
    status: MembershipStatus,
    suspendedBy: string | null,
    db: Db = getDb(),
  ): Promise<WorkspaceMemberRow | null> {
    const [row] = await db
      .update(workspaceMembers)
      .set({ status, suspendedBy, updatedAt: new Date() })
      .where(eq(workspaceMembers.id, id))
      .returning();
    return row ?? null;
  },

  async updateStatusIfCurrent(
    id: string,
    currentStatus: MembershipStatus,
    status: MembershipStatus,
    suspendedBy: string | null,
    db: Db = getDb(),
  ): Promise<WorkspaceMemberRow | null> {
    const [row] = await db
      .update(workspaceMembers)
      .set({ status, suspendedBy, updatedAt: new Date() })
      .where(and(eq(workspaceMembers.id, id), eq(workspaceMembers.status, currentStatus)))
      .returning();
    return row ?? null;
  },
};

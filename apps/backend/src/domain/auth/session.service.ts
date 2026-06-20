import { createHash, randomBytes } from "node:crypto";
import { sessionsRepo } from "@folio/db";
import { Injectable } from "@nestjs/common";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionService {
  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async createForUser(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await sessionsRepo.create({ userId, tokenHash: this.hashToken(token), expiresAt });
    return { token, expiresAt };
  }

  async resolve(token: string | undefined): Promise<{ userId: string } | null> {
    // cookie-parser can revive a "j:{...}" cookie into an object; auth guards must fail closed.
    if (typeof token !== "string" || !token) {
      return null;
    }
    const hash = this.hashToken(token);
    const row = await sessionsRepo.getByTokenHash(hash);
    if (!row) {
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      await sessionsRepo.deleteByTokenHash(hash);
      return null;
    }
    return { userId: row.userId };
  }

  async destroy(token: string | undefined): Promise<void> {
    // cookie-parser can revive a "j:{...}" cookie into an object; must not pass a non-string to hashToken.
    if (typeof token !== "string" || !token) {
      return;
    }
    await sessionsRepo.deleteByTokenHash(this.hashToken(token));
  }
}

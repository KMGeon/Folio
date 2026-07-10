import { usersRepo } from "@folio/db";

// A configured GitHub identity grants the initial role only while no admin exists.
// After bootstrap, the database role is the sole source of authority.
export async function bootstrapSystemAdmin(
  githubUserId: number,
  bootstrapGithubId: number | undefined,
): Promise<void> {
  if (!bootstrapGithubId || githubUserId !== bootstrapGithubId) {
    return;
  }

  await usersRepo.bootstrapInitialSystemAdmin(githubUserId);
}

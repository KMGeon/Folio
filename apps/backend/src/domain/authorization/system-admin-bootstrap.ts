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

  const existingAdmin = await usersRepo.getSystemAdmin();
  if (existingAdmin) {
    return;
  }

  const user = await usersRepo.getByGithubId(githubUserId);
  if (user) {
    await usersRepo.setSystemAdmin(user.id, true);
  }
}

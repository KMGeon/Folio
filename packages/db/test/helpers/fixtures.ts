import { ACCOUNT_TYPE, PULL_REQUEST_STATUS } from "@folio/types";
import type { Db } from "../../src/client.js";
import {
  installationsRepo,
  pullRequestsRepo,
  repositoriesRepo,
  revisionsRepo,
  usersRepo,
} from "../../src/repos/index.js";

const SHA = "a".repeat(40);

let seq = 0;
function nextId(): number {
  seq += 1;
  return (Date.now() % 1_000_000) + seq;
}

export interface BaseFixture {
  installationId: string;
  repoId: string;
  prId: string;
  revisionId: string;
  userId: string;
}

/** Seed the installation→repo→pr→revision + user chain shared by repo tests. */
export async function seedBase(db: Db): Promise<BaseFixture> {
  const installation = await installationsRepo.create(
    {
      githubInstallationId: nextId(),
      accountLogin: "acme",
      accountType: ACCOUNT_TYPE.ORGANIZATION,
    },
    db,
  );
  const repo = await repositoriesRepo.create(
    {
      installationId: installation.id,
      githubRepoId: nextId(),
      owner: "acme",
      name: "widget",
      fullName: "acme/widget",
      private: false,
      defaultBranch: "main",
    },
    db,
  );
  const pr = await pullRequestsRepo.create(
    {
      repoId: repo.id,
      githubPrNumber: nextId(),
      title: "Add feature",
      body: null,
      authorLogin: "octocat",
      baseRef: "main",
      headRef: "feature",
      headSha: SHA,
      status: PULL_REQUEST_STATUS.OPEN,
      htmlUrl: "https://github.com/acme/widget/pull/1",
    },
    db,
  );
  const revision = await revisionsRepo.create(
    { prId: pr.id, index: 0, headSha: SHA, baseSha: "b".repeat(40), mergeBaseSha: "c".repeat(40) },
    db,
  );
  const user = await usersRepo.create(
    { githubUserId: nextId(), login: "octocat", avatarUrl: "https://avatar", email: "o@x.com" },
    db,
  );
  return {
    installationId: installation.id,
    repoId: repo.id,
    prId: pr.id,
    revisionId: revision.id,
    userId: user.id,
  };
}

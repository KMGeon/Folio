import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { RepoAccessGuard } from "../common/repo-access.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";

@Controller("api/v1/pulls")
@UseGuards(SessionAuthGuard)
export class PullsController {
  @Get()
  listPulls() {
    // TODO(B2): list in-flight PRs from the database.
    return [];
  }

  @Get(":owner/:repo/:number/chapters")
  @UseGuards(RepoAccessGuard)
  getChapters(
    @Param("owner") _owner: string,
    @Param("repo") _repo: string,
    @Param("number") _number: string,
  ) {
    // TODO(B2): load decomposition (prologue + ordered chapters) for the PR.
    return { chapters: [], prologue: null };
  }
}

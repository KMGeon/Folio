import { Controller, Get, Param } from "@nestjs/common";

@Controller("api/v1/pulls")
export class PullsController {
  @Get()
  listPulls() {
    // TODO(B2): list in-flight PRs from the database.
    return [];
  }

  @Get(":id/chapters")
  getChapters(@Param("id") _id: string) {
    // TODO(B2): load decomposition (prologue + ordered chapters) for the PR.
    return { chapters: [], prologue: null };
  }
}

import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get()
  root() {
    return { name: "folio-backend", status: "ok" };
  }

  @Get("health")
  health() {
    return {
      status: "ok",
      service: "folio-backend",
      ts: new Date().toISOString(),
    };
  }
}

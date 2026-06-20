import type { ErrorTypeDefinition } from "./error-type.js";

export class CoreException extends Error {
  constructor(readonly errorType: ErrorTypeDefinition) {
    super(errorType.message);
    this.name = "CoreException";
  }
}

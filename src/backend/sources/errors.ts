import type { ApiErrorCode } from "../contracts/api";

export class SourceImportError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message);
    this.name = "SourceImportError";
    this.code = code;
    this.status = status;
  }
}

export function tooLarge(message: string): never {
  throw new SourceImportError("PAYLOAD_TOO_LARGE", 413, message);
}

export function unreadable(message: string): never {
  throw new SourceImportError("UNREADABLE_DOCUMENT", 422, message);
}

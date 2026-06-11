export class CiviError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CiviError";
  }
}

export class CiviAuthError extends CiviError {
  readonly status?: number;
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "CiviAuthError";
    if (options?.status !== undefined) {
      this.status = options.status;
    }
  }
}

export class CiviApiError extends CiviError {
  readonly entity: string;
  readonly action: string;
  readonly errorCode?: string;
  constructor(
    message: string,
    options: { entity: string; action: string; errorCode?: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "CiviApiError";
    this.entity = options.entity;
    this.action = options.action;
    if (options.errorCode !== undefined) {
      this.errorCode = options.errorCode;
    }
  }
}

export class CiviTransportError extends CiviError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "CiviTransportError";
  }
}

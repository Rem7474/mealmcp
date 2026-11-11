export class NotFoundError extends Error {
  constructor(what: string, id: number | string) {
    super(`${what} ${id} not found`);
  }
}

export class ValidationError extends Error {}

/** Not logged in, or bad credentials. */
export class UnauthorizedError extends Error {}

/** Logged in, but not allowed to do this. */
export class ForbiddenError extends Error {}

export class TooManyRequestsError extends Error {}

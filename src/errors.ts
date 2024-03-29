export class ProviderError extends Error {
  stack: string;
  time: Date;
  status: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Formats an AWSError the the SQSError type.
 * @param err The error object that was received.
 * @param message The message to send with the error.
 */
export function toProviderError(err: Error, message: string): ProviderError {
  const error = new ProviderError(message);
  error.stack = err?.stack;
  error.time = new Date();

  return error;
}

export class StandardError extends Error {
  cause: Error;
  time: Date;

  constructor(message = "An unexpected error occurred:") {
    super(message);
    this.message = message;
    this.name = "StandardError";
  }
}

/**
 * Formats an Error to the StandardError type.
 * @param err The error object that was received.
 * @param message The message to send with the error.
 */
export function toStandardError(err: Error, message: string): StandardError {
  const error = new StandardError(message);
  error.cause = err;
  error.time = new Date();

  return error;
}

export class TimeoutError extends Error {
  cause: Error;
  time: Date;

  constructor(message = "Operation timed out.") {
    super(message);
    this.message = message;
    this.name = "TimeoutError";
  }
}

/**
 * Formats an Error to the TimeoutError type.
 * @param err The error object that was received.
 * @param message The message to send with the error.
 */
export function toTimeoutError(
  err: TimeoutError,
  message: string,
): TimeoutError {
  const error = new TimeoutError(message);
  error.cause = err;
  error.time = new Date();

  return error;
}

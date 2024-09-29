export class ProviderError extends Error {
  stack: string;
  code: string;
  time: Date;
  status: number;
  statusText?: string;
  url?: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

interface ErrorWithResponse extends Error {
  code: string;
  response?: Response;
}

/**
 * Formats a provider's error the the ProviderError type.
 * @param err The error object that was received.
 * @param message The message to send with the error.
 */
export function toProviderError(
  err: ErrorWithResponse,
  message: string,
): ProviderError {
  const error = new ProviderError(message);
  error.code = err.code;
  error.stack = err?.stack;
  error.time = new Date();

  if (err.response) {
    error.status = err.response.status;
    error.statusText = err.response.statusText;
    error.url = err.response.url;
  }

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

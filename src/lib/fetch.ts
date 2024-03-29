import { toProviderError, ProviderError } from "../errors.js";

export function throwErrorIfResponseNotOk(response: Response): void {
  const { ok, status, statusText, url } = response;

  if (!ok) {
    const message = status
      ? `[${status} - ${statusText}] ${url}`
      : `[${statusText}] ${url}`;

    const error = new ProviderError(message);
    error.code = "ResponseNotOk";
    Object.defineProperty(error, "response", { value: response });

    throw toProviderError(error, message);
  }
}

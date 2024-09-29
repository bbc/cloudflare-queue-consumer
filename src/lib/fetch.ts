import { toProviderError, ProviderError } from "../utils/errors.js";

export function throwErrorIfResponseNotOk(response: Response): void {
  if (!response?.ok) {
    const message = response?.status
      ? `[${response?.status} - ${response?.statusText}] ${response?.url}`
      : `[${response?.statusText}] ${response?.url}`;

    const error = new ProviderError(message);
    error.code = "ResponseNotOk";
    Object.defineProperty(error, "response", { value: response });

    throw toProviderError(error, message);
  }
}

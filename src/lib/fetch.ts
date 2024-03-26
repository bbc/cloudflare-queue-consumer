export function throwErrorIfResponseNotOk(response: Response): void {
  const { ok, status, statusText, url } = response;

  if (!ok) {
    let error: Error;

    if (status) {
      error = new Error(`[${status} - ${statusText}] ${url}`);
    } else {
      error = new Error(`[${statusText}] ${url}`);
    }

    throw error;
  }
}

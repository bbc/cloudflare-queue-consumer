import { ProviderError } from "../utils/errors.js";
import { throwErrorIfResponseNotOk } from "./fetch.js";

const CLOUDFLARE_HOST = "https://api.cloudflare.com/client/v4";
const MAX_RETRIES = 5;

export function getCredentials() {
  const QUEUES_API_TOKEN = process.env.QUEUES_API_TOKEN;

  if (!QUEUES_API_TOKEN) {
    throw new Error(
      "Missing Cloudflare credentials, please set a QUEUES_API_TOKEN in the environment variables.",
    );
  }

  return {
    QUEUES_API_TOKEN,
  };
}

function calculateDelay(attempt: number): number {
  return Math.pow(2, attempt) * 100 + Math.random() * 100;
}

function shouldRetry(
  error: unknown,
  attempt: number,
  maxRetries: number,
): boolean {
  return (
    error instanceof ProviderError &&
    error.message.includes("429") &&
    attempt < maxRetries
  );
}

async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (shouldRetry(error, attempt, maxRetries)) {
        attempt++;
        const delay = calculateDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new ProviderError("Max retries reached");
}

export async function queuesClient<T = unknown>({
  path,
  method,
  body,
  accountId,
  queueId,
  signal,
}: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  accountId: string;
  queueId: string;
  signal?: AbortSignal;
}): Promise<T> {
  const { QUEUES_API_TOKEN } = getCredentials();

  const url = `${CLOUDFLARE_HOST}/accounts/${accountId}/queues/${queueId}/${path}`;
  const options = {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${QUEUES_API_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal,
  };

  async function fetchWithBackoff() {
    const response = await fetch(url, options);

    if (!response) {
      throw new ProviderError("No response from Cloudflare Queues API");
    }

    if (response.status === 429) {
      throw new ProviderError("429 Too Many Requests");
    }

    throwErrorIfResponseNotOk(response);

    const data = (await response.json()) as T;

    return data;
  }

  return exponentialBackoff(fetchWithBackoff, MAX_RETRIES);
}

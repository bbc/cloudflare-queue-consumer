import { throwErrorIfResponseNotOk } from "./fetch.js";

const CLOUDFLARE_HOST = "https://api.cloudflare.com/client/v4";

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

export async function queuesClient<T = unknown>({
  path,
  method,
  body,
  accountId,
  queueId,
  signal,
  dispatcher,
}): Promise<T> {
  const { QUEUES_API_TOKEN } = getCredentials();

  const response = await fetch(
    `${CLOUDFLARE_HOST}/accounts/${accountId}/queues/${queueId}/${path}`,
    {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${QUEUES_API_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal,
      dispatcher,
    },
  );

  throwErrorIfResponseNotOk(response);

  const data = (await response.json()) as T;

  return data;
}

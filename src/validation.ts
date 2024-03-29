import type { ConsumerOptions, PullMessagesResponse } from "./types.js";

const requiredOptions = [
  "accountId",
  "queueId",
  // only one of handleMessage / handleMessagesBatch is required
  "handleMessage|handleMessageBatch",
];

function validateOption(option: string, value: number, strict?: boolean): void {
  switch (option) {
    case "batchSize":
      if (value > 100 || value < 1) {
        throw new Error("batchSize must be between 1 and 100");
      }
      break;
    case "visibilityTimeoutMs":
      if (value > 43200000) {
        throw new Error("visibilityTimeoutMs must be less than 43200000");
      }
      break;
    case "retryMessageDelay":
      if (value > 42300) {
        throw new Error("retryMessageDelay must be less than 42300");
      }
      break;
    default:
      if (strict) {
        throw new Error(`The update ${option} cannot be updated`);
      }
      break;
  }
}

/**
 * Ensure that the required options have been set.
 * @param options The options that have been set by the application.
 */
function assertOptions(options: ConsumerOptions): void {
  requiredOptions.forEach((option) => {
    const possibilities = option.split("|");
    if (!possibilities.find((p) => options[p])) {
      throw new Error(
        `Missing consumer option [ ${possibilities.join(" or ")} ].`,
      );
    }
  });

  if (options.batchSize) {
    validateOption("batchSize", options.batchSize);
  }

  if (options.visibilityTimeoutMs) {
    validateOption("visibilityTimeoutMs", options.visibilityTimeoutMs);
  }

  if (options.retryMessageDelay) {
    validateOption("retryMessageDelay", options.retryMessageDelay);
  }
}

/**
 * Determine if the response has messages in it.
 * @param response The response from CloudFlare.
 */
function hasMessages(response: PullMessagesResponse): boolean {
  return response?.result?.messages && response.result.messages.length > 0;
}

export { assertOptions, validateOption, hasMessages };

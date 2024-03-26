import type { ConsumerOptions } from "./types.js";

const requiredOptions = ["accountId", "queueId", "handleMessage"];

function validateOption(option: string, value: number, strict?: boolean): void {
  switch (option) {
    case "batchSize":
      if (value < 1) {
        throw new Error("batchSize must be at least 1.");
      }
      break;
    case "visibilityTimeoutMs":
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
    validateOption("batchSize", options.batchSize, false);
  }
}

export { assertOptions, validateOption };

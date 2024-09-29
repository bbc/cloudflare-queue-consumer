import { describe, it } from "node:test";
import { assert } from "chai";

import {
  assertOptions,
  validateOption,
  hasMessages,
} from "../../../src/utils/validation";

describe("Validation Functions", () => {
  describe("validateOption", () => {
    it("should throw an error if batchSize is not between 1 and 100", () => {
      assert.throws(
        () => validateOption("batchSize", 0),
        "batchSize must be between 1 and 100",
      );
      assert.throws(
        () => validateOption("batchSize", 101),
        "batchSize must be between 1 and 100",
      );
    });

    it("should not throw an error if batchSize is between 1 and 100", () => {
      assert.doesNotThrow(() => validateOption("batchSize", 50));
    });

    it("should throw an error if visibilityTimeoutMs is greater than 43200000", () => {
      assert.throws(
        () => validateOption("visibilityTimeoutMs", 43200001),
        "visibilityTimeoutMs must be less than 43200000",
      );
    });

    it("should not throw an error if visibilityTimeoutMs is less than or equal to 43200000", () => {
      assert.doesNotThrow(() =>
        validateOption("visibilityTimeoutMs", 43200000),
      );
    });

    it("should throw an error if retryMessageDelay is greater than 42300", () => {
      assert.throws(
        () => validateOption("retryMessageDelay", 42301),
        "retryMessageDelay must be less than 42300",
      );
    });

    it("should not throw an error if retryMessageDelay is less than or equal to 42300", () => {
      assert.doesNotThrow(() => validateOption("retryMessageDelay", 42300));
    });

    it("should throw an error if pollingWaitTimeMs is less than 0", () => {
      assert.throws(
        () => validateOption("pollingWaitTimeMs", -1),
        "pollingWaitTimeMs must be greater than 0.",
      );
    });

    it("should not throw an error if pollingWaitTimeMs is greater than or equal to 0", () => {
      assert.doesNotThrow(() => validateOption("pollingWaitTimeMs", 0));
    });

    it("should throw an error for unknown options if strict is true", () => {
      assert.throws(
        () => validateOption("unknownOption", 0, true),
        "The update unknownOption cannot be updated",
      );
    });

    it("should not throw an error for unknown options if strict is false", () => {
      assert.doesNotThrow(() => validateOption("unknownOption", 0, false));
    });
  });

  describe("assertOptions", () => {
    it("should throw an error if required options are missing", () => {
      const options = {
        accountId: "accountId",
        queueId: "queueId",
      };

      assert.throws(
        () => assertOptions(options),
        "Missing consumer option [ handleMessage or handleMessageBatch ].",
      );
    });

    it("should not throw an error if required options are present", () => {
      const options = {
        accountId: "accountId",
        queueId: "queueId",
        handleMessage: () => {},
      };

      // @ts-expect-error
      assert.doesNotThrow(() => assertOptions(options));
    });

    it("should call validateOption for batchSize, visibilityTimeoutMs, and retryMessageDelay", () => {
      const options = {
        accountId: "accountId",
        queueId: "queueId",
        handleMessage: () => {},
        batchSize: 50,
        visibilityTimeoutMs: 43200000,
        retryMessageDelay: 42300,
      };

      // @ts-expect-error
      assert.doesNotThrow(() => assertOptions(options));
    });
  });

  describe("hasMessages", () => {
    it("should return true if response has messages", () => {
      const response = {
        result: {
          messages: [{ id: "1" }],
        },
      };

      // @ts-expect-error
      assert.isTrue(hasMessages(response));
    });

    it("should return false if response does not have messages", () => {
      const response = {
        result: {
          messages: [],
        },
      };

      // @ts-expect-error
      assert.isFalse(hasMessages(response));
    });

    it("should return false if response is undefined", () => {
      const response = undefined;

      // @ts-expect-error
      assert.isFalse(hasMessages(response));
    });
  });
});

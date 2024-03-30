import { describe, it } from "node:test";
import assert from "node:assert";

import { Consumer } from "../../src/consumer";

describe("Consumer", () => {
  describe("Options Validation", () => {
    it("requires an accountId to be set", () => {
      assert.throws(() => new Consumer({}), {
        message: "Missing consumer option [ accountId ].",
      });
    });

    it("requires a queueId to be set", () => {
      assert.throws(() => new Consumer({ accountId: "123" }), {
        message: "Missing consumer option [ queueId ].",
      });
    });

    it("require a handleMessage or handleMessageBatch function to be set", () => {
      assert.throws(() => new Consumer({ accountId: "123", queueId: "123" }), {
        message:
          "Missing consumer option [ handleMessage or handleMessageBatch ].",
      });
    });

    it("requires batchSize to be no greater than 100", () => {
      assert.throws(
        () =>
          new Consumer({
            accountId: "123",
            queueId: "123",
            handleMessage: async (message) => {
              return message;
            },
            batchSize: 101,
          }),
        {
          message: "batchSize must be between 1 and 100",
        },
      );
    });

    it("requires batchSize to be more than or equal to 1", () => {
      assert.throws(
        () =>
          new Consumer({
            accountId: "123",
            queueId: "123",
            handleMessage: async (message) => {
              return message;
            },
            batchSize: -1,
          }),
        {
          message: "batchSize must be between 1 and 100",
        },
      );
    });

    it("requires visibilityTimeoutMs to be less than 43200000", () => {
      assert.throws(
        () =>
          new Consumer({
            accountId: "123",
            queueId: "123",
            handleMessage: async (message) => {
              return message;
            },
            visibilityTimeoutMs: 43200001,
          }),
        {
          message: "visibilityTimeoutMs must be less than 43200000",
        },
      );
    });

    it("requires retryMessageDelay to be less than 42300", () => {
      assert.throws(
        () =>
          new Consumer({
            accountId: "123",
            queueId: "123",
            handleMessage: async (message) => {
              return message;
            },
            retryMessageDelay: 42301,
          }),
        {
          message: "retryMessageDelay must be less than 42300",
        },
      );
    });
  });

  describe(".create", () => {
    it("creates a new Consumer instance", () => {
      const consumer = Consumer.create({
        accountId: "123",
        queueId: "123",
        handleMessage: async (message) => {
          return message;
        },
      });

      assert(consumer instanceof Consumer);
    });
  });

  describe(".start", () => {
    // https://github.com/bbc/cloudflare-queue-consumer/pull/18
  });

  describe(".stop", () => {
    // https://github.com/bbc/cloudflare-queue-consumer/pull/18
  });

  describe(".status", () => {
    // https://github.com/bbc/cloudflare-queue-consumer/pull/18
  });

  describe(".updateOption", () => {
    // https://github.com/bbc/cloudflare-queue-consumer/pull/18
  });

  describe("Event Listeners", () => {
    // https://github.com/bbc/cloudflare-queue-consumer/pull/18
  });

  describe("Logger", () => {
    // https://github.com/bbc/cloudflare-queue-consumer/pull/18
  });
});

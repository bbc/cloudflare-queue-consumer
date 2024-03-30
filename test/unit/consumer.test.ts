import { beforeEach, afterEach, describe, it, mock } from "node:test";
import { assert } from "chai";
import * as sinon from "sinon";
import { pEvent } from "p-event";

import { Consumer } from "../../src/consumer";

const ACCOUNT_ID = "023e105f4ecef8ad9ca31a8372d0c353";
const QUEUE_ID = "023e105f4ecef8ad9ca31a8372d0c353";
const CLOUDFLARE_HOST = "https://api.cloudflare.com/client/v4";
const PULL_MESSAGES_ENDPOINT = `${CLOUDFLARE_HOST}/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/pull`;
const ACK_MESSAGES_ENDPOINT = `${CLOUDFLARE_HOST}/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/ack`;
const QUEUES_API_TOKEN = "queues_token";
const pullResponse = {
  errors: {},
  messages: [],
  result: {
    messages: [
      {
        body: "body",
        id: "123",
        timestamp_ms: 1234567890,
        attempts: 1,
        lease_id: "lease-id",
        metadata: {
          "CF-sourceMessageSource": "test",
          "CF-Content-Type": "text",
        },
      },
    ],
  },
  success: true,
  result_info: {},
};
const ackResponse = {
  errors: [],
  messages: [],
  result: {
    ackCount: 1,
    retryCount: 0,
    warnings: [],
  },
  success: true,
  result_info: {},
};
const fetchArgs = {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${QUEUES_API_TOKEN}`,
  },
  body: JSON.stringify({}),
  signal: undefined,
};

const currentProcessEnv = { ...process.env };

const sandbox = sinon.createSandbox();

describe("Consumer", () => {
  let consumer;
  let clock;
  let handleMessage;
  let handleMessageBatch;
  let fetch;

  beforeEach(() => {
    clock = sinon.useFakeTimers();

    process.env.QUEUES_API_TOKEN = QUEUES_API_TOKEN;

    handleMessage = sandbox.stub().resolves(null);
    handleMessageBatch = sandbox.stub().resolves(null);

    fetch = sandbox.stub(global, "fetch");

    fetch.withArgs(PULL_MESSAGES_ENDPOINT, fetchArgs).resolves({
      json: () => Promise.resolve(pullResponse),
    });
    fetch.withArgs(ACK_MESSAGES_ENDPOINT, fetchArgs).resolves({
      json: () => Promise.resolve(ackResponse),
    });

    consumer = new Consumer({
      accountId: "123",
      queueId: "123",
      handleMessage,
    });
  });

  afterEach(() => {
    clock.restore();
    process.env = currentProcessEnv;
    sandbox.restore();
  });

  describe("Options Validation", () => {
    it("requires an accountId to be set", () => {
      assert.throws(
        () => new Consumer({}),
        "Missing consumer option [ accountId ].",
      );
    });

    it("requires a queueId to be set", () => {
      assert.throws(
        () => new Consumer({ accountId: "123" }),
        "Missing consumer option [ queueId ].",
      );
    });

    it("require a handleMessage or handleMessageBatch function to be set", () => {
      assert.throws(
        () => new Consumer({ accountId: "123", queueId: "123" }),
        "Missing consumer option [ handleMessage or handleMessageBatch ].",
      );
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
        "batchSize must be between 1 and 100",
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
        "batchSize must be between 1 and 100",
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
        "visibilityTimeoutMs must be less than 43200000",
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
        "retryMessageDelay must be less than 42300",
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

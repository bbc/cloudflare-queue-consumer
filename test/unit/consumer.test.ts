import { beforeEach, afterEach, describe, it } from "node:test";
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
    "content-type": "application/json",
    authorization: `Bearer ${QUEUES_API_TOKEN}`,
  },
  body: JSON.stringify({}),
  signal: new AbortController().signal,
};
const pullFetchArgs = {
  ...fetchArgs,
  body: JSON.stringify({ batch_size: 10, visibility_timeout_ms: 1000 }),
};
const ackFetchArgs = {
  ...fetchArgs,
  body: JSON.stringify({
    acks: [
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
    retries: [],
  }),
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

    fetch.withArgs(PULL_MESSAGES_ENDPOINT, pullFetchArgs).resolves({
      json: () => Promise.resolve(pullResponse),
      ok: true,
    });
    fetch.withArgs(ACK_MESSAGES_ENDPOINT, ackFetchArgs).resolves({
      json: () => Promise.resolve(ackResponse),
      ok: true,
    });

    consumer = new Consumer({
      accountId: ACCOUNT_ID,
      queueId: QUEUE_ID,
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
      const instance = Consumer.create({
        accountId: "123",
        queueId: "123",
        handleMessage: async (message) => {
          return message;
        },
      });

      assert(instance instanceof Consumer);
    });
  });

  describe(".start", () => {
    it("fires an event when the consumer starts", () => {
      const handleStart = sandbox.stub().returns(null);
      consumer.on("started", handleStart);

      consumer.start();
      consumer.stop();

      sandbox.assert.calledOnce(handleStart);
    });

    it("calls the handleMessage function when a message is received", async () => {
      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      sandbox.assert.calledWith(handleMessage, pullResponse.result.messages[0]);
    });

    it("calls the preReceiveMessageCallback and postReceiveMessageCallback function before receiving a message", async () => {
      const preReceiveMessageCallbackStub = sandbox.stub().resolves(null);
      const postReceiveMessageCallbackStub = sandbox.stub().resolves(null);

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage,
        preReceiveMessageCallback: preReceiveMessageCallbackStub,
        postReceiveMessageCallback: postReceiveMessageCallbackStub,
      });

      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      sandbox.assert.calledOnce(preReceiveMessageCallbackStub);
      sandbox.assert.calledOnce(postReceiveMessageCallbackStub);
    });

    it("deletes the message when the handleMessage function is called", async () => {
      handleMessage.resolves();

      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      sandbox.assert.calledWithMatch(fetch, ACK_MESSAGES_ENDPOINT);
    });

    it("does not delete the message if shouldDeleteMessages is false", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage,
        shouldDeleteMessages: false,
      });

      handleMessage.resolves();

      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      sandbox.assert.neverCalledWithMatch(fetch, ACK_MESSAGES_ENDPOINT);
    });

    it("doesn't delete the message when a processing error is reported", async () => {
      handleMessage.rejects(new Error("Processing error"));

      consumer.start();
      await pEvent(consumer, "processing_error");
      consumer.stop();

      sandbox.assert.neverCalledWithMatch(fetch, ACK_MESSAGES_ENDPOINT);
    });

    it("consumes another message once one is processed", async () => {
      handleMessage.resolves();

      consumer.start();
      await clock.runToLastAsync();
      consumer.stop();

      // TODO: Should this actually be 11? Seems a bit arbitrary
      assert(handleMessage.callCount === 11);
    });

    it("doesn't consume more messages when called multiple times", () => {
      fetch
        .withArgs(PULL_MESSAGES_ENDPOINT, pullFetchArgs)
        .resolves(new Promise((res) => setTimeout(res, 100)));
      consumer.start();
      consumer.start();
      consumer.start();
      consumer.start();
      consumer.start();
      consumer.stop();

      fetch.calledOnceWith(PULL_MESSAGES_ENDPOINT, pullFetchArgs);
    });

    it("doesn't consume more messages when called multiple times after stopped", () => {
      fetch
        .withArgs(PULL_MESSAGES_ENDPOINT, pullFetchArgs)
        .resolves(new Promise((res) => setTimeout(res, 100)));
      consumer.start();
      consumer.stop();

      consumer.start();
      consumer.start();
      consumer.start();
      consumer.start();

      fetch.calledOnceWith(PULL_MESSAGES_ENDPOINT, pullFetchArgs);
    });

    it("consumes multiple messages", async () => {
      fetch.withArgs(PULL_MESSAGES_ENDPOINT, pullFetchArgs).resolves({
        json: () =>
          Promise.resolve({
            ...pullResponse,
            result: {
              messages: [
                ...pullResponse.result.messages,
                {
                  body: "body-2",
                  id: "124",
                  timestamp_ms: 1234567890,
                  attempts: 1,
                  lease_id: "lease-id-2",
                  metadata: {
                    "CF-sourceMessageSource": "test",
                    "CF-Content-Type": "text",
                  },
                },
                {
                  body: "body-3",
                  id: "125",
                  timestamp_ms: 1234567890,
                  attempts: 1,
                  lease_id: "lease-id-3",
                  metadata: {
                    "CF-sourceMessageSource": "test",
                    "CF-Content-Type": "text",
                  },
                },
              ],
            },
          }),
        ok: true,
      });

      consumer.start();
      await pEvent(consumer, "message_received");
      consumer.stop();

      sandbox.assert.callCount(handleMessage, 3);
      sandbox.assert.calledWithMatch(
        fetch.firstCall,
        PULL_MESSAGES_ENDPOINT,
        pullFetchArgs,
      );
    });

    it("fires an emptyQueue event when all messages have been consumed", async () => {
      const handleEmpty = sandbox.stub().returns(null);

      consumer.on("empty", handleEmpty);

      fetch.withArgs(PULL_MESSAGES_ENDPOINT, fetchArgs).resolves({
        json: () =>
          Promise.resolve({
            ...pullResponse,
            result: { messages: [] },
          }),
        ok: true,
      });

      consumer.start();
      await pEvent(consumer, "empty");
      consumer.stop();

      sandbox.assert.calledOnce(handleEmpty);
    });

    it("prefers handleMessagesBatch over handleMessage when both are set", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch,
        handleMessage,
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      sandbox.assert.callCount(handleMessageBatch, 1);
      sandbox.assert.callCount(handleMessage, 0);
    });

    it("calls the handleMessagesBatch function when a batch of messages is received", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch,
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      sandbox.assert.callCount(handleMessageBatch, 1);
    });

    it("handles unexpected exceptions thrown by the handler batch function", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch: () => {
          throw new Error("unexpected parsing error");
        },
      });

      consumer.start();
      const err: any = await pEvent(consumer, "error");
      consumer.stop();

      assert.ok(err);
      assert.equal(
        err.message,
        "Unexpected message handler failure: unexpected parsing error",
      );
    });

    it("handles non-standard objects thrown by the handler batch function", async () => {
      class CustomError {
        private _message: string;

        constructor(message) {
          this._message = message;
        }

        get message() {
          return this._message;
        }
      }

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch: () => {
          throw new CustomError("unexpected parsing error");
        },
        batchSize: 2,
      });

      consumer.start();
      const err: any = await pEvent(consumer, "error");
      consumer.stop();

      assert.ok(err);
      assert.equal(err.message, "unexpected parsing error");
    });

    it("handles non-standard exceptions thrown by the handler batch function", async () => {
      const customError = new Error();
      Object.defineProperty(customError, "message", {
        get: () => "unexpected parsing error",
      });

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch: () => {
          throw customError;
        },
        batchSize: 2,
      });

      consumer.start();
      const err: any = await pEvent(consumer, "error");
      consumer.stop();

      assert.ok(err);
      assert.equal(
        err.message,
        "Unexpected message handler failure: unexpected parsing error",
      );
    });
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

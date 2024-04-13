import { beforeEach, afterEach, describe, it } from "node:test";
import { assert, expect } from "chai";
import * as chai from "chai";
import chaiNock from "chai-nock";
import * as sinon from "sinon";
import { pEvent } from "p-event";
import nock from "nock";

import { Consumer } from "../../src/consumer";

import pullMessagesResponse from "../fixtures/pullMessagesResponse.json";
import ackMessagesResponse from "../fixtures/ackMessagesResponse.json";

chai.use(chaiNock);
nock.disableNetConnect();

const ACCOUNT_ID = "023e105f4ecef8ad9ca31a8372d0c353";
const QUEUE_ID = "023e105f4ecef8ad9ca31a8372d0c353";
const CLOUDFLARE_HOST = "https://api.cloudflare.com/client/v4";
const PULL_MESSAGES_ENDPOINT = `/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/pull`;
const ACK_MESSAGES_ENDPOINT = `/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/ack`;
const QUEUES_API_TOKEN = "queues_token";

const currentProcessEnv = { ...process.env };

const sandbox = sinon.createSandbox();

type MockRequest = {
  timeout?: number;
  persist?: boolean;
  status?: number;
  response?: Record<string, any>;
};

function mockPullRequest({
  timeout,
  persist = false,
  status = 200,
  response = pullMessagesResponse,
}: MockRequest) {
  const request = nock(CLOUDFLARE_HOST, {
    reqheaders: {
      authorization: `Bearer ${QUEUES_API_TOKEN}`,
    },
  })
    .persist(persist)
    .post(PULL_MESSAGES_ENDPOINT);

  if (timeout) {
    request.delayConnection(timeout);
  }

  return request.reply(status, response);
}

function mockAckRequest({
  timeout,
  persist = false,
  status = 200,
  response = ackMessagesResponse,
}: MockRequest) {
  const request = nock(CLOUDFLARE_HOST, {
    reqheaders: {
      authorization: `Bearer ${QUEUES_API_TOKEN}`,
    },
  })
    .persist(persist)
    .post(ACK_MESSAGES_ENDPOINT);

  if (timeout) {
    request.delayConnection(timeout);
  }

  return request.reply(status, response);
}

describe("Consumer", () => {
  let consumer;
  let clock;
  let handleMessage;
  let handleMessageBatch;

  beforeEach(() => {
    clock = sinon.useFakeTimers();

    process.env.QUEUES_API_TOKEN = QUEUES_API_TOKEN;

    handleMessage = sandbox.stub().resolves(null);
    handleMessageBatch = sandbox.stub().resolves(null);

    if (!nock.isActive()) {
      nock.activate();
    }
    nock.cleanAll();

    consumer = new Consumer({
      accountId: ACCOUNT_ID,
      queueId: QUEUE_ID,
      handleMessage,
    });
  });

  afterEach(() => {
    process.env = currentProcessEnv;
    nock.cleanAll();
    nock.restore();
    clock.restore();
    sandbox.restore();
  });

  describe("Options Validation", () => {
    beforeEach(() => {
      mockPullRequest({});
      mockAckRequest({});
    });

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
    beforeEach(() => {
      mockPullRequest({});
      mockAckRequest({});
    });

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
      mockPullRequest({});
      mockAckRequest({});

      const handleStart = sandbox.stub().returns(null);
      consumer.on("started", handleStart);

      consumer.start();
      consumer.stop();

      sandbox.assert.calledOnce(handleStart);
    });

    it("calls the handleMessage function when a message is received", async () => {
      mockPullRequest({});
      mockAckRequest({});

      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      sandbox.assert.calledWith(
        handleMessage,
        pullMessagesResponse.result.messages[0],
      );
    });

    it("calls the preReceiveMessageCallback and postReceiveMessageCallback function before receiving a message", async () => {
      mockPullRequest({});
      mockAckRequest({});
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
      mockPullRequest({});
      const mockedAckRequest = mockAckRequest({});
      handleMessage.resolves();

      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      expect(mockedAckRequest).to.have.been.requested;
    });

    it("does not delete the message if shouldDeleteMessages is false", async () => {
      mockPullRequest({});
      const mockedAckRequest = mockAckRequest({});

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

      expect(mockedAckRequest).to.not.have.been.requested;
    });

    it("doesn't delete the message when a processing error is reported", async () => {
      mockPullRequest({});
      const mockedAckRequest = mockAckRequest({});
      handleMessage.rejects(new Error("Processing error"));

      consumer.start();
      await pEvent(consumer, "processing_error");
      consumer.stop();

      expect(mockedAckRequest).to.not.have.been.requested;
    });

    it.skip("consumes another message once one is processed", async () => {
      const mockedPullRequest = mockPullRequest({});
      mockAckRequest({});
      handleMessage.resolves();

      consumer.start();
      await clock.runToLastAsync();
      consumer.stop();

      // TODO: Should this actually be 11? Seems a bit arbitrary
      // Also, this doesn't work anyway
      const mockedPullRequestCount = mockedPullRequest.activeMocks().length;
      expect(mockedPullRequestCount).to.equal(11);
    });

    it("doesn't consume more messages when called multiple times", () => {
      const mockedPullRequest = mockPullRequest({
        timeout: 100,
      });
      mockAckRequest({});
      consumer.start();
      consumer.start();
      consumer.start();
      consumer.start();
      consumer.start();
      consumer.stop();

      expect(mockedPullRequest).to.have.been.requested;
    });

    it("doesn't consume more messages when called multiple times after stopped", () => {
      const mockedPullRequest = mockPullRequest({
        timeout: 100,
      });
      consumer.start();
      consumer.stop();

      consumer.start();
      consumer.start();
      consumer.start();
      consumer.start();

      expect(mockedPullRequest).to.have.been.requested;
    });

    it("consumes multiple messages", async () => {
      const mockedPullRequest = mockPullRequest({
        response: {
          ...pullMessagesResponse,
          result: {
            messages: [
              ...pullMessagesResponse.result.messages,
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
        },
      });
      mockAckRequest({});

      consumer.start();
      await pEvent(consumer, "message_received");
      consumer.stop();

      sandbox.assert.callCount(handleMessage, 3);
      expect(mockedPullRequest).to.have.been.requested;
    });

    it("fires an emptyQueue event when all messages have been consumed", async () => {
      mockPullRequest({
        response: {
          ...pullMessagesResponse,
          result: { messages: [] },
        },
      });
      mockAckRequest({});
      const handleEmpty = sandbox.stub().returns(null);

      consumer.on("empty", handleEmpty);

      consumer.start();
      await pEvent(consumer, "empty");
      consumer.stop();

      sandbox.assert.calledOnce(handleEmpty);
    });

    it("prefers handleMessagesBatch over handleMessage when both are set", async () => {
      mockPullRequest({});
      mockAckRequest({});

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
      mockPullRequest({});
      mockAckRequest({});

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
      mockPullRequest({});
      mockAckRequest({});

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
      mockPullRequest({});
      mockAckRequest({});

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
      mockPullRequest({});
      mockAckRequest({});

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

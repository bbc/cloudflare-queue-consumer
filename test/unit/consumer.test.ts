import { beforeEach, afterEach, describe, it } from "node:test";
import { assert, expect } from "chai";
import * as chai from "chai";
import chaiNock from "chai-nock";
import * as sinon from "sinon";
import { pEvent } from "p-event";
import nock from "nock";

import { Consumer } from "../../src/consumer";
import { logger } from "../../src/logger";

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

    it.todo(
      "acknowledges the message if handleMessage returns void",
      async () => {
        mockPullRequest({});
        const mockedAckRequest = mockAckRequest({});

        consumer = new Consumer({
          accountId: ACCOUNT_ID,
          queueId: QUEUE_ID,
          handleMessage: async () => {},
        });

        consumer.start();
        await pEvent(consumer, "message_processed");
        consumer.stop();

        expect(mockedAckRequest).to.have.been.requestedWith({
          acks: [pullMessagesResponse.result.messages[0].id],
          retries: [],
        });
      },
    );

    it.todo(
      "acknowledges the message if handleMessage returns a message with the same ID",
      async () => {
        mockPullRequest({});
        const mockedAckRequest = mockAckRequest({});

        consumer = new Consumer({
          accountId: ACCOUNT_ID,
          queueId: QUEUE_ID,
          handleMessage: async () => {
            return {
              MessageId: pullMessagesResponse.result.messages[0].id,
            };
          },
        });

        consumer.start();
        await pEvent(consumer, "message_processed");
        consumer.stop();

        expect(mockedAckRequest).to.have.been.requestedWith({
          acks: [pullMessagesResponse.result.messages[0].id],
          retries: [],
        });
      },
    );

    it("does not acknowledge the message if handleMessage returns an empty object", async () => {
      mockPullRequest({});
      const mockedAckRequest = mockAckRequest({});

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: async () => {
          return {};
        },
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      expect(mockedAckRequest).to.not.have.been.requested;
    });

    it("does not acknowledge the message if handleMessage returns a different ID", async () => {
      mockPullRequest({});
      const mockedAckRequest = mockAckRequest({});

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: async () => {
          return {
            MessageId: "143",
          };
        },
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      expect(mockedAckRequest).to.not.have.been.requested;
    });

    it("acknowledges the message if alwaysAcknowledge is `true` and handleMessage returns an empty object", async () => {
      mockPullRequest({});
      const mockedAckRequest = mockAckRequest({});

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: async () => {
          return {};
        },
        alwaysAcknowledge: true,
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      expect(mockedAckRequest).to.have.been.requestedWith({
        acks: [pullMessagesResponse.result.messages[0].id],
        retries: [],
      });
    });

    it("does not acknowledge if handleMessagesBatch returns an empty array", async () => {
      mockPullRequest({});
      const mockedAckRequest = mockAckRequest({});

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch: async () => [],
        batchSize: 2,
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      expect(mockedAckRequest).to.not.have.been.requested;
    });

    // TODO: Batch needs more messages to properly validate these

    it.todo(
      "acknowledges the messages if alwaysAcknowledge is `true` and handleMessagesBatch returns an empty array",
      async () => {
        mockPullRequest({});
        const mockedAckRequest = mockAckRequest({});

        consumer = new Consumer({
          accountId: ACCOUNT_ID,
          queueId: QUEUE_ID,
          handleMessageBatch: async () => [],
          batchSize: 2,
          alwaysAcknowledge: true,
        });

        consumer.start();
        await pEvent(consumer, "response_processed");
        consumer.stop();

        expect(mockedAckRequest).to.have.been.requestedWith({
          acks: [pullMessagesResponse.result.messages[0].id],
          retries: [],
        });
      },
    );

    it.todo(
      "acknowledges all messages if handleMessageBatch returns void",
      async () => {
        mockPullRequest({});
        const mockedAckRequest = mockAckRequest({});

        consumer = new Consumer({
          accountId: ACCOUNT_ID,
          queueId: QUEUE_ID,
          handleMessageBatch: async () => {},
          batchSize: 2,
        });

        consumer.start();
        await pEvent(consumer, "response_processed");
        consumer.stop();

        expect(mockedAckRequest).to.have.been.requestedWith({
          acks: [pullMessagesResponse.result.messages[0].id],
          retries: [],
        });
      },
    );

    it.todo(
      "acknowledges only returned messages if handleMessagesBatch returns an array",
      async () => {
        mockPullRequest({});
        const mockedAckRequest = mockAckRequest({});

        consumer = new Consumer({
          accountId: ACCOUNT_ID,
          queueId: QUEUE_ID,
          handleMessageBatch: async () => [
            { MessageId: "123", ReceiptHandle: "receipt-handle" },
          ],
          batchSize: 2,
        });

        consumer.start();
        await pEvent(consumer, "response_processed");
        consumer.stop();

        expect(mockedAckRequest).to.have.been.requestedWith({
          acks: [pullMessagesResponse.result.messages[0].id],
          retries: [],
        });
      },
    );

    // TODO: End requirement for more messages

    it.todo("it retries the message on error", async () => {});

    it.todo(
      "it retries the message on error with a custom retryMessageDelay",
      async () => {},
    );

    it.todo("it retries multiple messages on error", async () => {});

    // TODO: There are a few error cases to handle here, also test batch and non batch
    // TODO: Errors from the pull and ack requests
    // TODO: Errors from the handler
    // TODO: Non standard errors from handler
    // TODO: Non staandard exceptions from handler
    // TODO: Timeout errors
    // TODO: processing_error
    it.todo("it emits an error event when an error occurs", async () => {});

    it("fires a message_received event when a message is received", async () => {
      mockPullRequest({});
      mockAckRequest({});

      const handleMessageReceived = sandbox.stub().returns(null);
      consumer.on("message_received", handleMessageReceived);

      consumer.start();
      await pEvent(consumer, "message_received");
      consumer.stop();

      sandbox.assert.calledWith(
        handleMessageReceived,
        pullMessagesResponse.result.messages[0],
      );
    });

    it("fires a message_processed event when a message is processed", async () => {
      mockPullRequest({});
      mockAckRequest({});

      const handleMessageProcessed = sandbox.stub().returns(null);
      consumer.on("message_processed", handleMessageProcessed);

      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      sandbox.assert.calledWith(
        handleMessageProcessed,
        pullMessagesResponse.result.messages[0],
      );
    });

    it.todo(
      "Waits before re polling when an authentication error occurs",
      async () => {},
    );

    it.todo("Waits before re polling when a 403 error occurs", async () => {});

    it.todo(
      "Wait before re polling when a polling timeout is set",
      async () => {},
    );
  });

  describe(".stop", () => {
    beforeEach(() => {
      mockPullRequest({});
      mockAckRequest({});
    });

    it("stops the consumer polling for messages", async () => {
      const handleStop = sandbox.stub().returns(null);

      consumer.on("stopped", handleStop);

      consumer.start();
      consumer.stop();

      await clock.runAllAsync();

      sandbox.assert.calledOnce(handleStop);
      sandbox.assert.calledOnce(handleMessage);
    });

    it("clears the polling timeout when stopped", async () => {
      sinon.spy(clock, "clearTimeout");

      consumer.start();
      await clock.tickAsync(0);
      consumer.stop();

      await clock.runAllAsync();

      sinon.assert.calledTwice(clock.clearTimeout);
    });

    it("fires a stopped event only once when stopped multiple times", async () => {
      const handleStop = sandbox.stub().returns(null);

      consumer.on("stopped", handleStop);

      consumer.start();
      consumer.stop();
      consumer.stop();
      consumer.stop();
      await clock.runAllAsync();

      sandbox.assert.calledOnce(handleStop);
    });

    it("fires a stopped event a second time if started and stopped twice", async () => {
      const handleStop = sandbox.stub().returns(null);

      consumer.on("stopped", handleStop);

      consumer.start();
      consumer.stop();
      consumer.start();
      consumer.stop();
      await clock.runAllAsync();

      sandbox.assert.calledTwice(handleStop);
    });

    it("aborts requests when the abort param is true", async () => {
      const handleStop = sandbox.stub().returns(null);
      const handleAbort = sandbox.stub().returns(null);

      consumer.on("stopped", handleStop);
      consumer.on("aborted", handleAbort);

      consumer.start();
      consumer.stop({ abort: true });

      await clock.runAllAsync();

      assert.isTrue(consumer.abortController.signal.aborted);
      sandbox.assert.calledOnce(handleMessage);
      sandbox.assert.calledOnce(handleAbort);
      sandbox.assert.calledOnce(handleStop);
    });
  });

  describe(".status", () => {
    beforeEach(() => {
      mockPullRequest({});
      mockAckRequest({});
    });

    it("returns the defaults before the consumer is started", () => {
      assert.isFalse(consumer.status.isRunning);
      assert.isFalse(consumer.status.isPolling);
    });

    it("returns true for `isRunning` if the consumer has not been stopped", () => {
      consumer.start();
      assert.isTrue(consumer.status.isRunning);
      consumer.stop();
    });

    it("returns false for `isRunning` if the consumer has been stopped", () => {
      consumer.start();
      consumer.stop();
      assert.isFalse(consumer.status.isRunning);
    });

    it("returns true for `isPolling` if the consumer is polling for messages", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: () => new Promise((resolve) => setTimeout(resolve, 20)),
      });

      consumer.start();
      await Promise.all([clock.tickAsync(1)]);
      assert.isTrue(consumer.status.isPolling);
      consumer.stop();
      assert.isTrue(consumer.status.isPolling);
      await Promise.all([clock.tickAsync(21)]);
      assert.isFalse(consumer.status.isPolling);
    });
  });

  describe(".updateOption", () => {
    beforeEach(() => {
      mockPullRequest({});
      mockAckRequest({});
    });

    it("updates the visibilityTimeoutMs option and emits an event", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      consumer.updateOption("visibilityTimeoutMs", 45);

      assert.equal(consumer.visibilityTimeoutMs, 45);

      sandbox.assert.calledWithMatch(
        optionUpdatedListener,
        "visibilityTimeoutMs",
        45,
      );
    });

    it("does not update the visibilityTimeoutMs if the value is more than 43200000", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("visibilityTimeoutMs", 43200000);
      }, "visibilityTimeoutMs must be less than 43200000");

      assert.equal(consumer.visibilityTimeoutMs, 1);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("updates the batchSize option and emits an event", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      consumer.updateOption("batchSize", 45);

      assert.equal(consumer.batchSize, 45);

      sandbox.assert.calledWithMatch(optionUpdatedListener, "batchSize", 45);
    });

    it("does not update the batchSize if the value is less than 1", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("batchSize", 0);
      }, "batchSize must be between 1 and 100");

      assert.equal(consumer.batchSize, 1);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("does not update the batchSize if the value is more than 100", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("batchSize", 101);
      }, "batchSize must be between 1 and 100");

      assert.equal(consumer.batchSize, 1);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("updates the retryMessageDelay option and emits an event", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      consumer.updateOption("retryMessageDelay", 45);

      assert.equal(consumer.retryMessageDelay, 45);

      sandbox.assert.calledWithMatch(
        optionUpdatedListener,
        "retryMessageDelay",
        45,
      );
    });

    it("does not update the retryMessageDelay if the value is more than 42300", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("retryMessageDelay", 42300);
      }, "retryMessageDelay must be less than 42300");

      assert.equal(consumer.retryMessageDelay, 1);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("updates the pollingWaitTimeMs option and emits an event", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      consumer.updateOption("pollingWaitTimeMs", 45);

      assert.equal(consumer.pollingWaitTimeMs, 45);

      sandbox.assert.calledWithMatch(
        optionUpdatedListener,
        "pollingWaitTimeMs",
        45,
      );
    });

    it("does not update the pollingWaitTimeMs if the value is less than 0", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("pollingWaitTimeMs", -1);
      }, "pollingWaitTimeMs must be greater than 0.");

      assert.equal(consumer.pollingWaitTimeMs, 1);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("throws an error for an unknown option", () => {
      consumer = new Consumer({
        queueId: QUEUE_ID,
        accountId: ACCOUNT_ID,
        handleMessage,
        visibilityTimeout: 60,
      });

      assert.throws(() => {
        consumer.updateOption("unknown", "value");
      }, `The update unknown cannot be updated`);
    });
  });

  describe("Aborting", () => {
    beforeEach(() => {
      mockPullRequest({});
      mockAckRequest({});
    });

    it.todo(
      'aborts the request when the consumer is stopped with the "abort" option',
      async () => {},
    );

    it.todo("aborts the request with the correct handler", async () => {});
  });

  describe("Event Listeners", () => {
    beforeEach(() => {
      mockPullRequest({});
      mockAckRequest({});
    });

    it.todo("fires the event multiple times", async () => {});

    it.todo("fires the events only once", async () => {});
  });

  describe("Logger", () => {
    beforeEach(() => {
      mockPullRequest({});
      mockAckRequest({});
    });

    it("logs a debug event when an event is emitted", async () => {
      const loggerDebug = sandbox.stub(logger, "debug");

      consumer.start();
      consumer.stop();

      sandbox.assert.callCount(loggerDebug, 5);
      sandbox.assert.calledWithMatch(loggerDebug, "starting");
      sandbox.assert.calledWithMatch(loggerDebug, "started");
      sandbox.assert.calledWithMatch(loggerDebug, "polling");
      sandbox.assert.calledWithMatch(loggerDebug, "stopping");
      sandbox.assert.calledWithMatch(loggerDebug, "stopped");
    });
  });
});

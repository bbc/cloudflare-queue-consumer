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


  describe(".start", () => {
    // TODO: Implement tests for the .start method

    it("ack the message if handleMessage returns void", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: async () => {},
      });

      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      sandbox.assert.callCount(sqs.send, 2);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockDeleteMessage);
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          ReceiptHandle: "receipt-handle",
        }),
      );
    });

    it("ack the message if handleMessage returns a message with the same ID", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: async () => {
          return {
            MessageId: "123",
          };
        },
      });

      consumer.start();
      await pEvent(consumer, "message_processed");
      consumer.stop();

      sandbox.assert.callCount(sqs.send, 2);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockDeleteMessage);
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          ReceiptHandle: "receipt-handle",
        }),
      );
    });

    it("does not ack the message if handleMessage returns an empty object", async () => {
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

      sandbox.assert.callCount(sqs.send, 1);
      sandbox.assert.neverCalledWithMatch(sqs.send, mockDeleteMessage);
    });

    it("does not ack the message if handleMessage returns a different ID", async () => {
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

      sandbox.assert.callCount(sqs.send, 1);
      sandbox.assert.neverCalledWithMatch(sqs.send, mockDeleteMessage);
    });

    it("deletes the message if alwaysAcknowledge is `true` and handleMessage returns an empty object", async () => {
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

      sandbox.assert.callCount(sqs.send, 2);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockDeleteMessage);
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          ReceiptHandle: "receipt-handle",
        }),
      );
    });

    it("does not call deleteMessageBatch if handleMessagesBatch returns an empty array", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch: async () => [],
        batchSize: 2,
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      sandbox.assert.callCount(sqs.send, 1);
      sandbox.assert.neverCalledWithMatch(sqs.send, mockDeleteMessageBatch);
    });

    it("calls deleteMessageBatch if alwaysAcknowledge is `true` and handleMessagesBatch returns an empty array", async () => {
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

      sandbox.assert.callCount(sqs.send, 2);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(
        sqs.send.secondCall,
        mockDeleteMessageBatch,
      );
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          Entries: [{ Id: "123", ReceiptHandle: "receipt-handle" }],
        }),
      );
    });

    it("ack all messages if handleMessageBatch returns void", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch: async () => {},
        batchSize: 2,
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      sandbox.assert.callCount(sqs.send, 2);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(
        sqs.send.secondCall,
        mockDeleteMessageBatch,
      );
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          Entries: [{ Id: "123", ReceiptHandle: "receipt-handle" }],
        }),
      );
    });

    it("ack only returned messages if handleMessagesBatch returns an array", async () => {
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

      sandbox.assert.callCount(sqs.send, 2);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(
        sqs.send.secondCall,
        mockDeleteMessageBatch,
      );
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          Entries: [{ Id: "123", ReceiptHandle: "receipt-handle" }],
        }),
      );
    });

    it("uses the correct visibility timeout for long running handler functions", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: () =>
          new Promise((resolve) => setTimeout(resolve, 75000)),
        visibilityTimeout: 40,
        heartbeatInterval: 30,
      });
      const clearIntervalSpy = sinon.spy(global, "clearInterval");

      consumer.start();
      await Promise.all([
        pEvent(consumer, "response_processed"),
        clock.tickAsync(75000),
      ]);
      consumer.stop();

      sandbox.assert.calledWith(
        sqs.send.secondCall,
        mockChangeMessageVisibility,
      );
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          ReceiptHandle: "receipt-handle",
          VisibilityTimeout: 40,
        }),
      );
      sandbox.assert.calledWith(
        sqs.send.thirdCall,
        mockChangeMessageVisibility,
      );
      sandbox.assert.match(
        sqs.send.thirdCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          ReceiptHandle: "receipt-handle",
          VisibilityTimeout: 40,
        }),
      );
      sandbox.assert.calledOnce(clearIntervalSpy);
    });

    it("passes in the correct visibility timeout for long running batch handler functions", async () => {
      sqs.send.withArgs(mockReceiveMessage).resolves({
        Messages: [
          { MessageId: "1", ReceiptHandle: "receipt-handle-1", Body: "body-1" },
          { MessageId: "2", ReceiptHandle: "receipt-handle-2", Body: "body-2" },
          { MessageId: "3", ReceiptHandle: "receipt-handle-3", Body: "body-3" },
        ],
      });
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch: () =>
          new Promise((resolve) => setTimeout(resolve, 75000)),
        batchSize: 3,
        visibilityTimeout: 40,
        heartbeatInterval: 30,
      });
      const clearIntervalSpy = sinon.spy(global, "clearInterval");

      consumer.start();
      await Promise.all([
        pEvent(consumer, "response_processed"),
        clock.tickAsync(75000),
      ]);
      consumer.stop();

      sandbox.assert.calledWith(
        sqs.send.secondCall,
        mockChangeMessageVisibilityBatch,
      );
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          Entries: sinon.match.array.deepEquals([
            {
              Id: "1",
              ReceiptHandle: "receipt-handle-1",
              VisibilityTimeout: 40,
            },
            {
              Id: "2",
              ReceiptHandle: "receipt-handle-2",
              VisibilityTimeout: 40,
            },
            {
              Id: "3",
              ReceiptHandle: "receipt-handle-3",
              VisibilityTimeout: 40,
            },
          ]),
        }),
      );
      sandbox.assert.calledWith(
        sqs.send.thirdCall,
        mockChangeMessageVisibilityBatch,
      );
      sandbox.assert.match(
        sqs.send.thirdCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          Entries: [
            {
              Id: "1",
              ReceiptHandle: "receipt-handle-1",
              VisibilityTimeout: 40,
            },
            {
              Id: "2",
              ReceiptHandle: "receipt-handle-2",
              VisibilityTimeout: 40,
            },
            {
              Id: "3",
              ReceiptHandle: "receipt-handle-3",
              VisibilityTimeout: 40,
            },
          ],
        }),
      );
      sandbox.assert.calledOnce(clearIntervalSpy);
    });

    it("emit error when changing visibility timeout fails", async () => {
      sqs.send.withArgs(mockReceiveMessage).resolves({
        Messages: [
          { MessageId: "1", ReceiptHandle: "receipt-handle-1", Body: "body-1" },
        ],
      });
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: () =>
          new Promise((resolve) => setTimeout(resolve, 75000)),
        visibilityTimeout: 40,
        heartbeatInterval: 30,
      });

      const receiveErr = new MockSQSError("failed");
      sqs.send.withArgs(mockChangeMessageVisibility).rejects(receiveErr);

      consumer.start();
      const [err]: any[] = await Promise.all([
        pEvent(consumer, "error"),
        clock.tickAsync(75000),
      ]);
      consumer.stop();

      assert.ok(err);
      assert.equal(err.message, "Error changing visibility timeout: failed");
    });

    it("emit error when changing visibility timeout fails for batch handler functions", async () => {
      sqs.send.withArgs(mockReceiveMessage).resolves({
        Messages: [
          { MessageId: "1", ReceiptHandle: "receipt-handle-1", Body: "body-1" },
          { MessageId: "2", ReceiptHandle: "receipt-handle-2", Body: "body-2" },
        ],
      });
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessageBatch: () =>
          new Promise((resolve) => setTimeout(resolve, 75000)),
        batchSize: 2,
        visibilityTimeout: 40,
        heartbeatInterval: 30,
      });

      const receiveErr = new MockSQSError("failed");
      sqs.send.withArgs(mockChangeMessageVisibilityBatch).rejects(receiveErr);

      consumer.start();
      const [err]: any[] = await Promise.all([
        pEvent(consumer, "error"),
        clock.tickAsync(75000),
      ]);
      consumer.stop();

      assert.ok(err);
      assert.equal(err.message, "Error changing visibility timeout: failed");
    });

    it("fires error event when failed to terminate visibility timeout on processing error", async () => {
      handleMessage.rejects(new Error("Processing error"));

      const sqsError = new Error("Processing error");
      sqsError.name = "SQSError";
      sqs.send.withArgs(mockChangeMessageVisibility).rejects(sqsError);
      consumer.terminateVisibilityTimeout = true;

      consumer.start();
      await pEvent(consumer, "error");
      consumer.stop();

      sandbox.assert.calledWith(
        sqs.send.secondCall,
        mockChangeMessageVisibility,
      );
      sandbox.assert.match(
        sqs.send.secondCall.args[0].input,
        sinon.match({
          accountId: ACCOUNT_ID,
          ReceiptHandle: "receipt-handle",
          VisibilityTimeout: 0,
        }),
      );
    });

    it("fires response_processed event for each batch", async () => {
      sqs.send.withArgs(mockReceiveMessage).resolves({
        Messages: [
          {
            ReceiptHandle: "receipt-handle-1",
            MessageId: "1",
            Body: "body-1",
          },
          {
            ReceiptHandle: "receipt-handle-2",
            MessageId: "2",
            Body: "body-2",
          },
        ],
      });
      handleMessage.resolves(null);

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage,
        batchSize: 2,
      });

      consumer.start();
      await pEvent(consumer, "response_processed");
      consumer.stop();

      sandbox.assert.callCount(handleMessage, 2);
    });

    it("fires a message_received event when a message is received", async () => {
      consumer.start();
      const message = await pEvent(consumer, "message_received");
      consumer.stop();

      assert.equal(message, response.Messages[0]);
    });

    it("fires a message_processed event when a message is successfully deleted", async () => {
      handleMessage.resolves();

      consumer.start();
      const message = await pEvent(consumer, "message_received");
      consumer.stop();

      assert.equal(message, response.Messages[0]);
    });

    it("fires an error event when an error occurs while receiving messages", async () => {
      fetch.throws(new Error("Failed to fetch messages"));

      const errorSpy = mock.fn();
      consumer.on("error", errorSpy);

      consumer.start();

      const err: Error = await pEvent(consumer, "error");

      consumer.stop();

      assert(errorSpy.mock.callCount() === 1);
      assert.ok(err);
      assert.equal(err.message, "SQS receive message failed: Receive error");
    });

    it("fires error events with retained information", async () => {
      const receiveErr = new MockSQSError("Receive error");
      receiveErr.name = "short code";
      receiveErr.$retryable = {
        throttling: false,
      };
      receiveErr.$metadata = {
        httpStatusCode: 403,
      };
      receiveErr.time = new Date();
      receiveErr.$service = "service";

      sqs.send.withArgs(mockReceiveMessage).rejects(receiveErr);

      consumer.start();
      const err: any = await pEvent(consumer, "error");
      consumer.stop();

      assert.ok(err);
      assert.equal(err.message, "SQS receive message failed: Receive error");
      assert.equal(err.code, receiveErr.name);
      assert.equal(err.retryable, receiveErr.$retryable.throttling);
      assert.equal(err.statusCode, receiveErr.$metadata.httpStatusCode);
      assert.equal(err.time.toString(), receiveErr.time.toString());
      assert.equal(err.service, receiveErr.$service);
      assert.equal(err.fault, receiveErr.$fault);
    });

    it("fires a timeout event if handler function takes too long", async () => {
      const handleMessageTimeout = 500;
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: () =>
          new Promise((resolve) => setTimeout(resolve, 1000)),
        handleMessageTimeout,
      });

      consumer.start();
      const [err]: any = await Promise.all([
        pEvent(consumer, "timeout_error"),
        clock.tickAsync(handleMessageTimeout),
      ]);
      consumer.stop();

      assert.ok(err);
      assert.equal(
        err.message,
        `Message handler timed out after ${handleMessageTimeout}ms: Operation timed out.`,
      );
    });

    it("handles unexpected exceptions thrown by the handler function", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: () => {
          throw new Error("unexpected parsing error");
        },
      });

      consumer.start();
      const err: any = await pEvent(consumer, "processing_error");
      consumer.stop();

      assert.ok(err);
      assert.equal(
        err.message,
        "Unexpected message handler failure: unexpected parsing error",
      );
    });

    it("handles non-standard objects thrown by the handler function", async () => {
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
        handleMessage: () => {
          throw new CustomError("unexpected parsing error");
        },
      });

      consumer.start();
      const err: any = await pEvent(consumer, "processing_error");
      consumer.stop();

      assert.ok(err);
      assert.equal(err.message, "unexpected parsing error");
    });

    it("handles non-standard exceptions thrown by the handler function", async () => {
      const customError = new Error();
      Object.defineProperty(customError, "message", {
        get: () => "unexpected parsing error",
      });

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage: () => {
          throw customError;
        },
      });

      consumer.start();
      const err: any = await pEvent(consumer, "processing_error");
      consumer.stop();

      assert.ok(err);
      assert.equal(
        err.message,
        "Unexpected message handler failure: unexpected parsing error",
      );
    });

    it("fires an error event when an error occurs deleting a message", async () => {
      const deleteErr = new Error("Delete error");

      handleMessage.resolves(null);
      sqs.send.withArgs(mockDeleteMessage).rejects(deleteErr);

      consumer.start();
      const err: any = await pEvent(consumer, "error");
      consumer.stop();

      assert.ok(err);
      assert.equal(err.message, "SQS delete message failed: Delete error");
    });

    it("fires a `processing_error` event when a non-`SQSError` error occurs processing a message", async () => {
      const processingErr = new Error("Processing error");

      handleMessage.rejects(processingErr);

      consumer.start();
      const [err, message] = await pEvent<
        string | symbol,
        { [key: string]: string }[]
      >(consumer, "processing_error", {
        multiArgs: true,
      });
      consumer.stop();

      assert.equal(
        err instanceof Error ? err.message : "",
        "Unexpected message handler failure: Processing error",
      );
      assert.equal(message.MessageId, "123");
    });

    it("fires an `error` event when an `SQSError` occurs processing a message", async () => {
      const sqsError = new Error("Processing error");
      sqsError.name = "SQSError";

      handleMessage.resolves();
      sqs.send.withArgs(mockDeleteMessage).rejects(sqsError);

      consumer.start();
      const [err, message] = await pEvent<
        string | symbol,
        { [key: string]: string }[]
      >(consumer, "error", {
        multiArgs: true,
      });
      consumer.stop();

      assert.equal(err.message, "SQS delete message failed: Processing error");
      assert.equal(message.MessageId, "123");
    });

    it("waits before repolling when a credentials error occurs", async () => {
      const credentialsErr = {
        name: "CredentialsError",
        message: "Missing credentials in config",
      };
      sqs.send.withArgs(mockReceiveMessage).rejects(credentialsErr);
      const errorListener = sandbox.stub();
      consumer.on("error", errorListener);

      consumer.start();
      await clock.tickAsync(AUTHENTICATION_ERROR_TIMEOUT);
      consumer.stop();

      sandbox.assert.calledTwice(errorListener);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockReceiveMessage);
    });

    it("waits before repolling when a 403 error occurs", async () => {
      const invalidSignatureErr = {
        $metadata: {
          httpStatusCode: 403,
        },
        message: "The security token included in the request is invalid",
      };
      sqs.send.withArgs(mockReceiveMessage).rejects(invalidSignatureErr);
      const errorListener = sandbox.stub();
      consumer.on("error", errorListener);

      consumer.start();
      await clock.tickAsync(AUTHENTICATION_ERROR_TIMEOUT);
      consumer.stop();

      sandbox.assert.calledTwice(errorListener);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockReceiveMessage);
    });

    it("waits before repolling when a UnknownEndpoint error occurs", async () => {
      const unknownEndpointErr = {
        name: "UnknownEndpoint",
        message:
          "Inaccessible host: `sqs.eu-west-1.amazonaws.com`. This service may not be available in the `eu-west-1` region.",
      };
      sqs.send.withArgs(mockReceiveMessage).rejects(unknownEndpointErr);
      const errorListener = sandbox.stub();
      consumer.on("error", errorListener);

      consumer.start();
      await clock.tickAsync(AUTHENTICATION_ERROR_TIMEOUT);
      consumer.stop();

      sandbox.assert.calledTwice(errorListener);
      sandbox.assert.calledTwice(sqs.send);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockReceiveMessage);
    });

    it("waits before repolling when a NonExistentQueue error occurs", async () => {
      const nonExistentQueueErr = {
        name: "AWS.SimpleQueueService.NonExistentQueue",
        message: "The specified queue does not exist for this wsdl version.",
      };
      sqs.send.withArgs(mockReceiveMessage).rejects(nonExistentQueueErr);
      const errorListener = sandbox.stub();
      consumer.on("error", errorListener);

      consumer.start();
      await clock.tickAsync(AUTHENTICATION_ERROR_TIMEOUT);
      consumer.stop();

      sandbox.assert.calledTwice(errorListener);
      sandbox.assert.calledTwice(sqs.send);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockReceiveMessage);
    });

    it("waits before repolling when a CredentialsProviderError error occurs", async () => {
      const credentialsProviderErr = {
        name: "CredentialsProviderError",
        message: "Could not load credentials from any providers.",
      };
      sqs.send.withArgs(mockReceiveMessage).rejects(credentialsProviderErr);
      const errorListener = sandbox.stub();
      consumer.on("error", errorListener);

      consumer.start();
      await clock.tickAsync(AUTHENTICATION_ERROR_TIMEOUT);
      consumer.stop();

      sandbox.assert.calledTwice(errorListener);
      sandbox.assert.calledTwice(sqs.send);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockReceiveMessage);
    });

    it("waits before repolling when a polling timeout is set", async () => {
      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage,
        pollingWaitTimeMs: POLLING_TIMEOUT,
      });

      consumer.start();
      await clock.tickAsync(POLLING_TIMEOUT);
      consumer.stop();

      sandbox.assert.callCount(sqs.send, 4);
      sandbox.assert.calledWithMatch(sqs.send.firstCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.secondCall, mockDeleteMessage);
      sandbox.assert.calledWithMatch(sqs.send.thirdCall, mockReceiveMessage);
      sandbox.assert.calledWithMatch(sqs.send.getCall(3), mockDeleteMessage);
    });
  });

  describe(".stop", () => {
    // TODO: Implement tests for the .stop method
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

    it("waits for in-flight messages before emitting stopped (within timeout)", async () => {
      sqs.send.withArgs(mockReceiveMessage).resolves({
        Messages: [
          { MessageId: "1", ReceiptHandle: "receipt-handle-1", Body: "body-1" },
        ],
      });
      const handleStop = sandbox.stub().returns(null);
      const handleResponseProcessed = sandbox.stub().returns(null);
      const waitingForPollingComplete = sandbox.stub().returns(null);
      const waitingForPollingCompleteTimeoutExceeded = sandbox
        .stub()
        .returns(null);

      // A slow message handler
      handleMessage = sandbox
        .stub()
        .resolves(new Promise((resolve) => setTimeout(resolve, 5000)));

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage,
        pollingCompleteWaitTimeMs: 5000,
      });

      consumer.on("stopped", handleStop);
      consumer.on("response_processed", handleResponseProcessed);
      consumer.on("waiting_for_polling_to_complete", waitingForPollingComplete);
      consumer.on(
        "waiting_for_polling_to_complete_timeout_exceeded",
        waitingForPollingCompleteTimeoutExceeded,
      );

      consumer.start();
      await Promise.all([clock.tickAsync(1)]);
      consumer.stop();

      await clock.runAllAsync();

      sandbox.assert.calledOnce(handleStop);
      sandbox.assert.calledOnce(handleResponseProcessed);
      sandbox.assert.calledOnce(handleMessage);
      assert(waitingForPollingComplete.callCount === 5);
      assert(waitingForPollingCompleteTimeoutExceeded.callCount === 0);

      assert.ok(handleMessage.calledBefore(handleStop));

      // handleResponseProcessed is called after handleMessage, indicating
      // messages were allowed to complete before 'stopped' was emitted
      assert.ok(handleResponseProcessed.calledBefore(handleStop));
    });

    it("waits for in-flight messages before emitting stopped (timeout reached)", async () => {
      sqs.send.withArgs(mockReceiveMessage).resolves({
        Messages: [
          { MessageId: "1", ReceiptHandle: "receipt-handle-1", Body: "body-1" },
        ],
      });
      const handleStop = sandbox.stub().returns(null);
      const handleResponseProcessed = sandbox.stub().returns(null);
      const waitingForPollingComplete = sandbox.stub().returns(null);
      const waitingForPollingCompleteTimeoutExceeded = sandbox
        .stub()
        .returns(null);

      // A slow message handler
      handleMessage = sandbox
        .stub()
        .resolves(new Promise((resolve) => setTimeout(resolve, 5000)));

      consumer = new Consumer({
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
        handleMessage,
        pollingCompleteWaitTimeMs: 500,
      });

      consumer.on("stopped", handleStop);
      consumer.on("response_processed", handleResponseProcessed);
      consumer.on("waiting_for_polling_to_complete", waitingForPollingComplete);
      consumer.on(
        "waiting_for_polling_to_complete_timeout_exceeded",
        waitingForPollingCompleteTimeoutExceeded,
      );

      consumer.start();
      await Promise.all([clock.tickAsync(1)]);
      consumer.stop();

      await clock.runAllAsync();

      sandbox.assert.calledOnce(handleStop);
      sandbox.assert.calledOnce(handleResponseProcessed);
      sandbox.assert.calledOnce(handleMessage);
      sandbox.assert.calledOnce(waitingForPollingComplete);
      sandbox.assert.calledOnce(waitingForPollingCompleteTimeoutExceeded);
      assert(handleMessage.calledBefore(handleStop));

      // Stop was called before the message could be processed, because we reached timeout.
      assert(handleStop.calledBefore(handleResponseProcessed));
    });
  });

  describe(".status", () => {
    // TODO: Implement tests for the .status method
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
      sqs.send.withArgs(mockReceiveMessage).resolves({
        Messages: [
          { MessageId: "1", ReceiptHandle: "receipt-handle-1", Body: "body-1" },
        ],
      });
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
    // TODO: Implement tests for the .updateOption method
    it("updates the visibilityTimeout option and emits an event", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      consumer.updateOption("visibilityTimeout", 45);

      assert.equal(consumer.visibilityTimeout, 45);

      sandbox.assert.calledWithMatch(
        optionUpdatedListener,
        "visibilityTimeout",
        45,
      );
    });

    it("does not update the visibilityTimeout if the value is less than the heartbeatInterval", () => {
      consumer = new Consumer({
        queueId: QUEUE_ID,
        accountId: ACCOUNT_ID,
        handleMessage,
        heartbeatInterval: 30,
        visibilityTimeout: 60,
      });

      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("visibilityTimeout", 30);
      }, "heartbeatInterval must be less than visibilityTimeout.");

      assert.equal(consumer.visibilityTimeout, 60);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("updates the batchSize option and emits an event", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      consumer.updateOption("batchSize", 4);

      assert.equal(consumer.batchSize, 4);

      sandbox.assert.calledWithMatch(optionUpdatedListener, "batchSize", 4);
    });

    it("does not update the batchSize if the value is more than 10", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("batchSize", 13);
      }, "batchSize must be between 1 and 10.");

      assert.equal(consumer.batchSize, 1);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("does not update the batchSize if the value is less than 1", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("batchSize", 0);
      }, "batchSize must be between 1 and 10.");

      assert.equal(consumer.batchSize, 1);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("updates the waitTimeSeconds option and emits an event", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      consumer.updateOption("waitTimeSeconds", 18);

      assert.equal(consumer.waitTimeSeconds, 18);

      sandbox.assert.calledWithMatch(
        optionUpdatedListener,
        "waitTimeSeconds",
        18,
      );
    });

    it("does not update the batchSize if the value is less than 0", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("waitTimeSeconds", -1);
      }, "waitTimeSeconds must be between 0 and 20.");

      assert.equal(consumer.waitTimeSeconds, 20);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("does not update the batchSize if the value is more than 20", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("waitTimeSeconds", 27);
      }, "waitTimeSeconds must be between 0 and 20.");

      assert.equal(consumer.waitTimeSeconds, 20);

      sandbox.assert.notCalled(optionUpdatedListener);
    });

    it("updates the pollingWaitTimeMs option and emits an event", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      consumer.updateOption("pollingWaitTimeMs", 1000);

      assert.equal(consumer.pollingWaitTimeMs, 1000);

      sandbox.assert.calledWithMatch(
        optionUpdatedListener,
        "pollingWaitTimeMs",
        1000,
      );
    });

    it("does not update the pollingWaitTimeMs if the value is less than 0", () => {
      const optionUpdatedListener = sandbox.stub();
      consumer.on("option_updated", optionUpdatedListener);

      assert.throws(() => {
        consumer.updateOption("pollingWaitTimeMs", -1);
      }, "pollingWaitTimeMs must be greater than 0.");

      assert.equal(consumer.pollingWaitTimeMs, 0);

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

  describe("Abort Handling", () => {
    it("uses the correct abort signal", async () => {
      fetch
        .withArgs(PULL_MESSAGES_ENDPOINT)
        .resolves(new Promise((res) => setTimeout(res, 1000)));

      // Starts and abort is false
      consumer.start();
      assert.isFalse(fetch.calls[0].args[1].signal.aborted);

      // Normal stop without an abort and abort is false
      consumer.stop();
      assert.isFalse(fetch.calls[0].args[1].signal.aborted);

      // Starts ad abort is false
      consumer.start();
      assert.isFalse(fetch.calls[1].args[1].signal.aborted);

      // Stops with an abort and abort is true
      consumer.stop({ abort: true });
      assert(fetch.calls[1].args[1].signal.aborted);

      // Starts and abort is false
      consumer.start();
      assert.isFalse(fetch.calls[2].args[1].signal.aborted);
    });
  });

  describe("Event Listeners", () => {
    // TODO: Implement tests for the event listeners
    it("fires the event multiple times", async () => {
      sqs.send.withArgs(mockReceiveMessage).resolves({});

      const handleEmpty = sandbox.stub().returns(null);

      consumer.on("empty", handleEmpty);

      consumer.start();

      await clock.tickAsync(0);

      consumer.stop();

      await clock.runAllAsync();

      sandbox.assert.calledTwice(handleEmpty);
    });

    it("fires the events only once", async () => {
      sqs.send.withArgs(mockReceiveMessage).resolves({});

      const handleEmpty = sandbox.stub().returns(null);

      consumer.once("empty", handleEmpty);

      consumer.start();

      await clock.tickAsync(0);

      consumer.stop();

      await clock.runAllAsync();

      sandbox.assert.calledOnce(handleEmpty);
    });
  });

  describe("Logger", () => {
    // TODO: Implement tests for the logger
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

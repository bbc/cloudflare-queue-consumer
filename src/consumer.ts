import { TypedEventEmitter } from "./emitter.js";
import type {
  ConsumerOptions,
  Message,
  PullMessagesResponse,
  AckMessageResponse,
  UpdatableOptions,
  StopOptions,
} from "./types.js";
import { assertOptions, hasMessages, validateOption } from "./validation.js";
import { queuesClient } from "./lib/cloudflare.js";
import { logger } from "./logger.js";
import {
  toProviderError,
  ProviderError,
  toStandardError,
  toTimeoutError,
  TimeoutError,
} from "./errors.js";

/**
 * [Usage](https://bbc.github.io/cloudflare-queue-consumer/index.html#usage)
 */
export class Consumer extends TypedEventEmitter {
  private accountId: string;
  private queueId: string;
  private handleMessage: (message: Message) => Promise<Message | void>;
  private handleMessageBatch: (message: Message[]) => Promise<Message[] | void>;
  private batchSize: number;
  private visibilityTimeoutMs: number;
  private retryMessagesOnError: boolean;
  private pollingWaitTimeMs: number;
  private pollingTimeoutId: NodeJS.Timeout;
  private stopped = true;
  private isPolling = false;
  private handleMessageTimeout: number;
  private alwaysAcknowledge: number;
  private retryMessageDelay: number;
  public abortController: AbortController;

  /**
   * Create a new consumer
   * @param options The options for the consumer
   */
  constructor(options) {
    super();
    assertOptions(options);
    this.accountId = options.accountId;
    this.queueId = options.queueId;
    this.handleMessage = options.handleMessage;
    this.handleMessageBatch = options.handleMessageBatch;
    this.batchSize = options.batchSize ?? 10;
    this.visibilityTimeoutMs = options.visibilityTimeoutMs ?? 1000;
    this.retryMessagesOnError = options.retryMessagesOnError || false;
    this.pollingWaitTimeMs = options.pollingWaitTimeMs ?? 1000;
    this.handleMessageTimeout = options.handleMessageTimeout;
    this.alwaysAcknowledge = options.alwaysAcknowledge ?? false;
    this.retryMessageDelay = options.retryMessageDelay ?? 10;
  }

  /**
   * Creates a new consumer.
   */
  public static create(options: ConsumerOptions): Consumer {
    return new Consumer(options);
  }

  /**
   * Start polling the queue.
   */
  public start(): void {
    if (!this.stopped) {
      return;
    }
    // Create a new abort controller each time the consumer is started
    this.abortController = new AbortController();
    logger.debug("starting");
    this.stopped = false;
    this.emit("started");
    this.poll();
  }

  /**
   * A reusable options object for queue.sending that's used to avoid duplication.
   */
  private get fetchOptions(): { signal: AbortSignal } {
    return {
      // return the current abortController signal or a fresh signal that has not been aborted.
      // This effectively defaults the signal sent to not aborted
      signal: this.abortController?.signal || new AbortController().signal,
    };
  }

  /**
   * Stop polling the queue.
   */
  public stop(options?: StopOptions): void {
    if (this.stopped) {
      logger.debug("already_stopped");
      return;
    }

    logger.debug("stopping");
    this.stopped = true;

    if (this.pollingTimeoutId) {
      clearTimeout(this.pollingTimeoutId);
      this.pollingTimeoutId = undefined;
    }

    if (options?.abort) {
      logger.debug("aborting");
      this.abortController.abort();
      this.emit("aborted");
    }

    this.emit("stopped");
  }

  /**
   * Returns the current status of the consumer.
   * This includes whether it is running or currently polling.
   */
  public get status(): {
    isRunning: boolean;
    isPolling: boolean;
  } {
    return {
      isRunning: !this.stopped,
      isPolling: this.isPolling,
    };
  }

  /**
   * Poll the queue for messages.
   */
  private async poll(): Promise<void> {
    if (this.stopped) {
      logger.debug("cancelling_poll", {
        detail:
          "Poll was called while consumer was stopped, cancelling poll...",
      });
      return;
    }

    logger.debug("polling");

    this.isPolling = true;

    const currentPollingTimeout: number = this.pollingWaitTimeMs;

    this.receiveMessage()
      .then((output: PullMessagesResponse) => this.handleQueueResponse(output))
      .then((): void => {
        if (this.pollingTimeoutId) {
          clearTimeout(this.pollingTimeoutId);
        }
        this.pollingTimeoutId = setTimeout(
          () => this.poll(),
          currentPollingTimeout,
        );
      })
      .catch((err): void => {
        // TODO: Adjust the error handling here
        // TODO: Add an extension to the polling timeout if auth error
        this.emit("error", err);
        setTimeout(() => this.poll(), this.pollingWaitTimeMs);
      })
      .finally((): void => {
        this.isPolling = false;
      });
  }

  /**
   * Send a request to CloudFlare Queues to retrieve messages
   * @param params The required params to receive messages from CloudFlare Queues
   */
  private async receiveMessage(): Promise<PullMessagesResponse> {
    try {
      const result = queuesClient<PullMessagesResponse>({
        ...this.fetchOptions,
        path: "messages/pull",
        method: "POST",
        body: {
          batch_size: this.batchSize,
          visibility_timeout_ms: this.visibilityTimeoutMs,
        },
        accountId: this.accountId,
        queueId: this.queueId,
      });

      return result;
    } catch (err) {
      throw toProviderError(err, `Receive message failed: ${err.message}`);
    }
  }

  /**
   * Handles the response from CloudFlare, determining if we should proceed to
   * the message handler.
   * @param response The output from CloudFlare
   */
  private async handleQueueResponse(
    response: PullMessagesResponse,
  ): Promise<void> {
    if (!response.success) {
      this.emit("error", new Error("Failed to pull messages"));
      this.isPolling = false;
      return;
    }

    if (hasMessages(response)) {
      if (this.handleMessageBatch) {
        await this.processMessageBatch(response.result.messages);
      } else {
        await Promise.all(
          response.result.messages.map((message: Message) =>
            this.processMessage(message),
          ),
        );
      }

      this.emit("response_processed");
    } else if (response) {
      this.emit("empty");
    }
  }

  /**
   * Process a message that has been received from CloudFlare Queues. This will execute the message
   * handler and delete the message once complete.
   * @param message The message that was delivered from CloudFlare
   */
  private async processMessage(message: Message): Promise<void> {
    try {
      this.emit("message_received", message);

      // TODO: Invesitgate if we can do heartbear checks here like SQS Consumer
      // https://github.com/bbc/sqs-consumer/blob/main/src/consumer.ts#L339

      const ackedMessage: Message = await this.executeHandler(message);

      if (ackedMessage?.id === message.id) {
        // TODO: In order to conserve API reate limits, it would be better to do this
        // in a batch, rather than one at a time.
        await this.acknowledgeMessage([message], []);

        this.emit("message_processed", message);
      }
    } catch (err) {
      this.emitError(err, message);

      if (this.retryMessagesOnError) {
        // TODO: In order to conserve API reate limits, it would be better to do this
        // in a batch, rather than one at a time.
        await this.acknowledgeMessage([], [message]);
      }
    }
  }

  /**
   * Process a batch of messages from the SQS queue.
   * @param messages The messages that were delivered from SQS
   */
  private async processMessageBatch(messages: Message[]): Promise<void> {
    try {
      messages.forEach((message: Message): void => {
        this.emit("message_received", message);
      });

      // TODO: Invesitgate if we can do heartbear checks here like SQS Consumer
      // https://github.com/bbc/sqs-consumer/blob/main/src/consumer.ts#L375

      const ackedMessages: Message[] = await this.executeBatchHandler(messages);

      if (ackedMessages?.length > 0) {
        await this.acknowledgeMessage(ackedMessages, []);

        ackedMessages.forEach((message: Message): void => {
          this.emit("message_processed", message);
        });
      }
    } catch (err) {
      this.emit("error", err, messages);

      if (this.retryMessagesOnError) {
        await this.acknowledgeMessage([], messages);
      }
    }
  }

  /**
   * Trigger the applications handleMessage function
   * @param message The message that was received from CloudFlare
   */
  private async executeHandler(message: Message): Promise<Message> {
    let handleMessageTimeoutId: NodeJS.Timeout | undefined = undefined;

    try {
      let result;

      if (this.handleMessageTimeout) {
        const pending: Promise<void> = new Promise((_, reject): void => {
          handleMessageTimeoutId = setTimeout((): void => {
            reject(new TimeoutError());
          }, this.handleMessageTimeout);
        });
        result = await Promise.race([this.handleMessage(message), pending]);
      } else {
        result = await this.handleMessage(message);
      }

      return !this.alwaysAcknowledge && result instanceof Object
        ? result
        : message;
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw toTimeoutError(
          err,
          `Message handler timed out after ${this.handleMessageTimeout}ms: Operation timed out.`,
        );
      } else if (err instanceof Error) {
        throw toStandardError(
          err,
          `Unexpected message handler failure: ${err.message}`,
        );
      }
      throw err;
    } finally {
      if (handleMessageTimeoutId) {
        clearTimeout(handleMessageTimeoutId);
      }
    }
  }

  /**
   * Execute the application's message batch handler
   * @param messages The messages that should be forwarded from the SQS queue
   */
  private async executeBatchHandler(messages: Message[]): Promise<Message[]> {
    try {
      const result: void | Message[] = await this.handleMessageBatch(messages);

      return !this.alwaysAcknowledge && result instanceof Object
        ? result
        : messages;
    } catch (err) {
      if (err instanceof Error) {
        throw toStandardError(
          err,
          `Unexpected message handler failure: ${err.message}`,
        );
      }
      throw err;
    }
  }

  /**
   * Acknowledge a message that has been processed by the consumer
   * @param acks The message(s) to acknowledge
   * @param retries The message(s) to retry
   */
  private async acknowledgeMessage(
    acks: Message[],
    retries: Message[],
  ): Promise<AckMessageResponse> {
    try {
      // TODO: this is pretty hacky, is there a better way to do this?
      const retriesWithDelay = retries.map((message) => ({
        ...message,
        delay_seconds: this.retryMessageDelay,
      }));
      const input = { acks, retries: retriesWithDelay };
      this.emit("acknowledging_messages", acks, retriesWithDelay);

      const result = await queuesClient<AckMessageResponse>({
        ...this.fetchOptions,
        path: "messages/ack",
        method: "POST",
        body: input,
        accountId: this.accountId,
        queueId: this.queueId,
      });

      if (!result.success) {
        throw new Error("Message Acknowledgement did not succeed.");
      }

      this.emit("acknowledged_messages", result.result);

      return result;
    } catch (err) {
      this.emit(
        "error",
        toProviderError(err, `Error acknowledging messages: ${err.message}`),
      );
    }
  }

  /**
   * Validates and then updates the provided option to the provided value.
   * @param option The option to validate and then update
   * @param value The value to set the provided option to
   */
  public updateOption(
    option: UpdatableOptions,
    value: ConsumerOptions[UpdatableOptions],
  ): void {
    validateOption(option, value, true);

    this[option] = value;

    this.emit("option_updated", option, value);
  }

  /**
   * Emit one of the consumer's error events depending on the error received.
   * @param err The error object to forward on
   * @param message The message that the error occurred on
   */
  private emitError(err: Error, message?: Message): void {
    if (!message) {
      this.emit("error", err);
    } else if (err.name === ProviderError.name) {
      this.emit("error", err, message);
    } else if (err instanceof TimeoutError) {
      this.emit("timeout_error", err, message);
    } else {
      this.emit("processing_error", err, message);
    }
  }
}

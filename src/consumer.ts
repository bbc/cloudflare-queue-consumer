import { TypedEventEmitter } from "./emitter.js";
import type {
  ConsumerOptions,
  Message,
  PullMessagesResponse,
  AckMessageResponse,
} from "./types.js";
import { assertOptions, hasMessages } from "./validation.js";
import { queuesClient } from "./lib/cloudflare.js";
import { logger } from "./logger.js";
import {
  toProviderError,
  ProviderError,
  toStandardError,
  toTimeoutError,
  TimeoutError,
} from "./errors.js";

// TODO: Document how to use this in the README
/**
 * [Usage](https://bbc.github.io/cloudflare-queue-consumer/index.html#usage)
 */
export class Consumer extends TypedEventEmitter {
  private accountId: string;
  private queueId: string;
  private handleMessage: (message: Message) => Promise<Message | void>;
  private batchSize: number;
  private visibilityTimeoutMs: number;
  private pollingWaitTimeMs: number;
  private pollingTimeoutId: NodeJS.Timeout;
  private stopped = true;
  private isPolling = false;
  private handleMessageTimeout: number;
  private alwaysAcknowledge: number;
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
    this.batchSize = options.batchSize ?? 10;
    this.visibilityTimeoutMs = options.visibilityTimeoutMs ?? 1000;
    this.pollingWaitTimeMs = options.pollingWaitTimeMs ?? 1000;
    this.handleMessageTimeout = options.handleMessageTimeout;
    this.alwaysAcknowledge = options.alwaysAcknowledge ?? false;
  }

  /**
   * Creates a new SQS consumer.
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
   * A reusable options object for sqs.send that's used to avoid duplication.
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
  public stop(options?: { abort?: boolean }): void {
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

    // TODO: This should be moved to its own function `receiveMessage`

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
   * Handles the response from AWS SQS, determining if we should proceed to
   * the message handler.
   * @param response The output from AWS SQS
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
      await Promise.all(
        response.result.messages.map((message: Message) =>
          this.processMessage(message),
        ),
      );

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

      // TODO: In order to conserve API reate limits, it would be better to do this
      // in a batch, rather than one at a time.
      await this.acknowledgeMessage([], [message]);
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
   * Change the visibility timeout on a message
   * @param message The message to change the value of
   * @param timeout The new timeout that should be set
   */
  private async acknowledgeMessage(
    acks: Message[],
    retries: Message[],
  ): Promise<AckMessageResponse> {
    try {
      // TODO: this is pretty hacky
      // TODO: This doesn't appear to be acknowledging correctly....
      const input = { acks, retries };
      this.emit("acknowledging_messages", acks, retries)

      return await queuesClient<AckMessageResponse>({
        ...this.fetchOptions,
        path: "messages/ack",
        method: "POST",
        body: input,
        accountId: this.accountId,
        queueId: this.queueId,
      });
    } catch (err) {
      this.emit(
        "error",
        toProviderError(err, `Error acknowledging messages: ${err.message}`),
        acks?.[0] || retries?.[0],
      );
    }
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

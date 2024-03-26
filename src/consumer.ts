import { TypedEventEmitter } from "./emitter.js";
import type {
  ConsumerOptions,
  Message,
  PullMessagesResponse,
  AckMessageResponse,
} from "./types.js";
import { assertOptions } from "./validation.js";
import { queuesClient } from "./lib/cloudflare.js";
import { logger } from "./logger.js";

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
      // This effectively defaults the signal sent to the AWS SDK to not aborted
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

    queuesClient<PullMessagesResponse>({
      ...this.fetchOptions,
      path: "messages/pull",
      method: "POST",
      body: {
        batch_size: this.batchSize,
        visibility_timeout_ms: this.visibilityTimeoutMs,
      },
      accountId: this.accountId,
      queueId: this.queueId,
    })
      .then(async (response) => {
        // TODO: Message handling should be moved to its own function `handleSqsResponse`
        if (!response.success) {
          this.emit("error", new Error("Failed to pull messages"));
          this.isPolling = false;
          return;
        }

        const { messages } = response.result;

        if (!messages || messages.length === 0) {
          this.emit("empty");
          this.isPolling = false;
          return;
        }

        // TODO: Successful and failed messages aren't working just yet, figure out a better way
        const successfulMessages: string[] = [];
        const failedMessages: string[] = [];

        for (const message of messages) {
          // TODO: Individual message handling should be moved to its own function `processMessage`
          // TODO: Work out if we can do a heartbeat with CloudFlare Queues / Extend visibility timeout
          this.emit("message_received", message);
          try {
            // TODO: This should be moved to its own function `executeHandler`
            const result = await this.handleMessage(message);
            logger.debug("message_processed", { result });
            if (result) {
              successfulMessages.push(message.lease_id);
              this.emit("message_processed", message);
            }
          } catch (e) {
            failedMessages.push(message.lease_id);
            this.emit("processing_error", e, message);
          }
        }

        // TODO: Message ack should be more like sqs-consumer, based on what's returned and if it errored
        // TODO: This also doesn't work just yet
        // TODO:  This should also be moved to its own function `acknowledgeMessages`
        logger.debug("acknowledging_messages", {
          successfulMessages,
          failedMessages,
        });

        await queuesClient<AckMessageResponse>({
          ...this.fetchOptions,
          path: "messages/ack",
          method: "POST",
          body: { acks: successfulMessages, retries: failedMessages },
          accountId: this.accountId,
          queueId: this.queueId,
        });

        this.emit("response_processed");
      })
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
}

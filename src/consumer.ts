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
  private stopped = true;
  private isPolling = false;

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
   * Start polling the queue.
   */
  public start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.poll();
  }

  /**
   * Stop polling the queue.
   */
  public stop(): void {
    this.stopped = true;
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

    try {
      const response = await queuesClient<PullMessagesResponse>({
        path: "messages/pull",
        method: "POST",
        body: {
          batch_size: this.batchSize,
          visibility_timeout_ms: this.visibilityTimeoutMs,
        },
        accountId: this.accountId,
        queueId: this.queueId,
      });

      const messages = response.result;

      if (!messages || messages.length === 0) {
        this.emit("empty");
        this.isPolling = false;
        return;
      }

      const successfulMessages: string[] = [];
      const failedMessages: string[] = [];

      for (const message of messages) {
        this.emit("message_received", message);
        try {
          const result = await this.handleMessage(message);
          if (result) {
            successfulMessages.push(message.lease_id);
            this.emit("message_processed", message);
          }
        } catch (e) {
          failedMessages.push(message.lease_id);
          this.emit("processing_error", e, message);
        }
      }

      logger.debug("acknowledging_messages", {
        successfulMessages,
        failedMessages,
      });

      await queuesClient<AckMessageResponse>({
        path: "messages/ack",
        method: "POST",
        body: { acks: successfulMessages, retries: failedMessages },
        accountId: this.accountId,
        queueId: this.queueId,
      });

      this.emit("response_processed");
    } catch (e) {
      this.emit("error", e);
    }

    this.isPolling = false;
    setTimeout(() => this.poll(), this.pollingWaitTimeMs);
  }
}

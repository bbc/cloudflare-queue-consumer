/**
 * The options for the consumer.
 */
export interface ConsumerOptions {
  /**
   * The number of messages to request from Cloudflare when polling (default `10`).
   * @defaultvalue `10`
   */
  batchSize?: number;
  /**
   * The duration (in milliseconds) that the received messages are hidden from subsequent
   * retrieve requests after being retrieved by a ReceiveMessage request.
   * @defaultvalue 1000
   */
  visibilityTimeoutMs?: number;
  /**
   * If the Consumer should trigger the message(s) to be retired on
   * @defaultvalue false
   */
  retryMessagesOnError?: boolean;
  /**
   * You Cloudflare account id
   */
  accountId: string;
  /**
   * The ID of the queue you want to receive messages from.
   */
  queueId: string;
  /**
   * An `async` function (or function that returns a `Promise`) to be called whenever
   * a message is received.
   *
   * In the case that you need to acknowledge the message, return an object containing
   * the MessageId that you'd like to acknowledge.
   */
  handleMessage?(message: Message): Promise<Message | void>;
  /**
   * An `async` function (or function that returns a `Promise`) to be called whenever
   * a batch of messages is received. Similar to `handleMessage` but will receive the
   * list of messages, not each message individually, this is preferred to reduce API
   * rate limits.
   *
   * **If both are set, `handleMessageBatch` overrides `handleMessage`**.
   *
   * In the case that you need to ack only some of the messages, return an array with
   * the successful messages only.
   */
  handleMessageBatch?(messages: Message[]): Promise<Message[] | void>;
  /**
   * An `async` function (or function that returns a `Promise`) to be called right
   * before the consumer sends a receive message command.
   */
  preReceiveMessageCallback?(): Promise<void>;
  /**
   * An `async` function (or function that returns a `Promise`) to be called right
   * after the consumer sends a receive message command.
   */
  postReceiveMessageCallback?(): Promise<void>;
  /**
   * Time in ms to wait for `handleMessage` to process a message before timing out.
   *
   * Emits `timeout_error` on timeout. By default, if `handleMessage` times out,
   * the unprocessed message returns to the end of the queue.
   */
  handleMessageTimeout?: number;
  /**
   * By default, the consumer will treat an empty object or array from either of the
   * handlers as a acknowledgement of no messages and will not delete those messages as
   * a result. Set this to `true` to always acknowledge all messages no matter the returned
   * value.
   * @defaultvalue `false`
   */
  alwaysAcknowledge?: boolean;
  /**
   * The amount of time to delay a message for before retrying (in seconds)
   * @defaultvalue 10
   */
  retryMessageDelay?: number;
  /**
   * The duration (in milliseconds) to wait before repolling the queue.
   * (Note: As Cloudflare uses short polling, you probably shouldn't set this too low)
   * @defaultvalue `1000`
   */
  pollingWaitTimeMs?: number;
  /**
   * If the consumer should delete messages after they have been processed.
   * @defaultvalue `true`
   */
  shouldDeleteMessages?: boolean;
}

/**
 * A subset of the ConsumerOptions that can be updated at runtime.
 */
export type UpdatableOptions =
  | "visibilityTimeoutMs"
  | "batchSize"
  | "pollingWaitTimeMs";

/**
 * The options for the stop method.
 */
export interface StopOptions {
  /**
   * Default to `false`, if you want the stop action to also abort requests to SQS
   * set this to `true`.
   * @defaultvalue `false`
   */
  abort?: boolean;
}

export type Message = {
  body: string;
  id: string;
  timestamp_ms: number;
  attempts: number;
  lease_id: string;
  metadata: {
    "CF-sourceMessageSource": string;
    "CF-Content-Type": "json" | "text";
  };
};

export type CloudFlareError = {
  code: number;
  message: string;
};

export type CloudFlareResultInfo = {
  page: number;
  per_page: number;
  total_pages: number;
  count: number;
  total_count: number;
};

export type PullMessagesResponse = {
  errors: CloudFlareError[];
  messages: CloudFlareError[];
  result: {
    messages: Message[];
  };
  success: boolean;
  result_info: CloudFlareResultInfo;
};

export type AckMessageResponse = {
  errors: CloudFlareError[];
  messages: CloudFlareError[];
  result: {
    ackCount: number;
    retryCount: number;
    warnings: string[];
  };
  success: boolean;
  result_info: CloudFlareResultInfo;
};

/**
 * These are the events that the consumer emits.
 */
export interface Events {
  /**
   * Fired after one batch of items (up to `batchSize`) has been successfully processed.
   */
  response_processed: [];
  /**
   * Fired when the queue is empty (All messages have been consumed).
   */
  empty: [];
  /**
   * Fired when a message is received.
   */
  message_received: [Message];
  /**
   * Fired when a message is successfully processed and removed from the queue.
   */
  message_processed: [Message];
  /**
   * Fired when an error occurs interacting with the queue.
   *
   * If the error correlates to a message, that message is included in Params
   */
  error: [Error, void | Message | Message[]];
  /**
   * Fired when `handleMessageTimeout` is supplied as an option and if
   * `handleMessage` times out.
   */
  timeout_error: [Error, Message];
  /**
   * Fired when an error occurs processing the message.
   */
  processing_error: [Error, Message];
  /**
   * Fired when requests to Cloudflare were aborted.
   */
  aborted: [];
  /**
   * Fired when the consumer starts its work..
   */
  started: [];
  /**
   * Fired when the consumer finally stops its work.
   */
  stopped: [];
  /**
   * Fired when messages are acknowledging
   */
  acknowledging_messages: [
    {
      lease_id: string;
    }[],
    {
      lease_id: string;
      delay_seconds: number;
    }[],
  ];
  /**
   * Fired when messages have been acknowledged
   */
  acknowledged_messages: [
    {
      ackCount: number;
      retryCount: number;
      warnings: string[];
    },
  ];
  /**
   * Fired when an option is updated
   */
  option_updated: [UpdatableOptions, ConsumerOptions[UpdatableOptions]];
}

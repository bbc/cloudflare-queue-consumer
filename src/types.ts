/**
 * The options for the consumer.
 */
export interface ConsumerOptions {
  /**
   * The number of messages to request from CloudFlare when polling (default `10`).
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
   * You CloudFlare account id
   */
  accountId: string;
  /**
   * The ID of the queue you want to receive messages from.
   */
  queueId: string;
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
   * Fired when requests to SQS were aborted.
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
}

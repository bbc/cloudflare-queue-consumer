# cloudflare-queue-consumer

[![NPM downloads](https://img.shields.io/npm/dm/@bbc/cloudflare-queue-consumer.svg?style=flat)](https://npmjs.org/package/@bbc/cloudflare-queue-consumer)
[![Build Status](https://github.com/bbc/cloudflare-queue-consumer/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/bbc/cloudflare-queue-consumer/actions/workflows/test.yml)
[![Maintainability](https://api.codeclimate.com/v1/badges/16ec3f59e73bc898b7ff/maintainability)](https://codeclimate.com/github/bbc/cloudflare-queue-consumer/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/16ec3f59e73bc898b7ff/test_coverage)](https://codeclimate.com/github/bbc/cloudflare-queue-consumer/test_coverage)

Build CloudFlare Queues applications without the boilerplate. Just define an async function that handles the message processing.

Based on [sqs-consumer](https://github.com/bbc/sqs-consumer).

> **Note:** This package is still in development and should be used with caution.

## Installation

To install this package, simply enter the following command into your terminal (or the variant of whatever package manager you are using):

```bash
npm install @bbc/cloudflare-queue-consumer
```

## Documentation

Visit [https://bbc.github.io/cloudflare-queue-consumer/](https://bbc.github.io/cloudflare-queue-consumer/) for the full API documentation.

## Usage

```js
import { Consumer } from "cloudflare-queue-consumer";

const consumer = new Consumer({
  accountId: process.env.ACCOUNT_ID, // Your CloudFlare account ID
  queueId: process.env.QUEUE_ID, // The Queue ID that you want to use.
  handleMessage: async (message) => {
    // Your message handling code...
  },
});

app.on("error", (err) => {
  console.error(err.message);
});

app.on("processing_error", (err) => {
  console.error(err.message);
});

consumer.start();
```

Some implementation notes:

- Pull consumers are designed to use a "short polling" approach, this means that the API from CloudFlare will respond immediately with any messages that are available, or an empty response if there are no messages available, this is different from SQS which will wait an amount of time before responding with an empty response.
- `handleMessage` will send one message to the handler at a time, if you would prefer to receive multiple messages at once, use the `handleMessageBatch` method instead.
  - It is important to await any processing that you are doing to ensure that the next action only happens after your processing has completed.
  - By default, messages that are sent to the functions will be considered as processed if they return without an error.
    - To acknowledge, you can return a promise that resolves the message or messages that you want to acknowledge.
      - Returning an empty object or an empty array will be considered an acknowledgment of no message(s). If you would like to change this behaviour, you can set the `alwaysAcknowledge` option to `true`.
      - By default, if an object or an array is not returned, all messages will be acknowledged.
    - Any message that errors will not be retried until the end of the visibility timeout, if you would like to trigger an immediate retry, you can set the `retryMessagesOnError` option to `true`.
      - You can set a delay for this retry with the `retryMessageDelay` option.

### Credentials

In order to authenticate with the CloudFlare API, you will need to create an API token with read and write access to CloudFlare Queues, more information can be found [here](https://developers.cloudflare.com/queues/reference/pull-consumers/#create-api-tokens).

Copy that token and set it as the value for an environment variable named `QUEUES_API_TOKEN`.

### Example project

You'll aldo find an example project in the folder `./example`, set the variables `ACCOUNT_ID` and `QUEUE_ID` and then run this with the command `pnpm dev`.


## API

### `Consumer.create(options)`

Creates a new SQS consumer using the [defined options](https://bbc.github.io/cloudflare-queue-consumer/interfaces/ConsumerOptions.html).

### `consumer.start()`

Start polling the queue for messages.

### `consumer.stop(options)`

Stop polling the queue for messages. [You can find the options definition here](https://bbc.github.io/cloudflare-queue-consumer/interfaces/StopOptions.html).

By default, the value of `abort` is set to `false` which means pre existing requests to CloudFlare will still be made until they have concluded. If you would like to abort these requests instead, pass the abort value as `true`, like so:

`consumer.stop({ abort: true })`

### `consumer.status`

Returns the current status of the consumer.

- `isRunning` - `true` if the consumer has been started and not stopped, `false` if was not started or if it was stopped.
- `isPolling` - `true` if the consumer is actively polling, `false` if it is not.

### `consumer.updateOption(option, value)`

Updates the provided option with the provided value.

Please note that any update of the option `pollingWaitTimeMs` will take effect only on next polling cycle.

You can [find out more about this here](https://bbc.github.io/cloudflare-queue-consumer/classes/Consumer.html#updateOption).

### Events

Each consumer is an [`EventEmitter`](https://nodejs.org/api/events.html) and [emits these events](https://bbc.github.io/cloudflare-queue-consumer/interfaces/Events.html).

## Contributing

We welcome and appreciate contributions for anyone who would like to take the time to fix a bug or implement a new feature.

But before you get started, [please read the contributing guidelines](https://github.com/bbc/cloudflare-queue-consumer/blob/main/.github/CONTRIBUTING.md) and [code of conduct](https://github.com/bbc/cloudflare-queue-consumer/blob/main/.github/CODE_OF_CONDUCT.md).

## License

CloudFlare Queue Consumer is distributed under the Apache License, Version 2.0, see [LICENSE](https://github.com/bbc/cloudflare-queue-consumer/blob/main/LICENSE) for more information.

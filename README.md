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

consumer.start();
```

TODO: Add more information

### Credentials

In order to authenticate with the CloudFlare API, you will need to create an API token with read and write access to CloudFlare Queues, more information can be found [here](https://developers.cloudflare.com/queues/reference/pull-consumers/#create-api-tokens).

Copy that token and set it as the value for an environment variable named `QUEUES_API_TOKEN`.

### Example project

You'll aldo find an example project in the folder `./example`, set the variables `ACCOUNT_ID` and `QUEUE_ID` and then run this with the command `pnpm dev`.

## Contributing

We welcome and appreciate contributions for anyone who would like to take the time to fix a bug or implement a new feature.

But before you get started, [please read the contributing guidelines](https://github.com/bbc/cloudflare-queue-consumer/blob/main/.github/CONTRIBUTING.md) and [code of conduct](https://github.com/bbc/cloudflare-queue-consumer/blob/main/.github/CODE_OF_CONDUCT.md).

## License

CloudFlare Queue Consumer is distributed under the Apache License, Version 2.0, see [LICENSE](https://github.com/bbc/cloudflare-queue-consumer/blob/main/LICENSE) for more information.

import { Consumer } from "../dist/esm/index.js";

function start() {
  const consumer = new Consumer({
    accountId: process.env.ACCOUNT_ID,
    queueId: process.env.QUEUE_ID,
    handleMessage: async (message) => {
      // eslint-disable-next-line no-console
      console.log(message);

      return message;
    },
  });

  consumer.start();
}

start();

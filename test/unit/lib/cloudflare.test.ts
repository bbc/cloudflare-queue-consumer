import { describe, it, beforeEach, afterEach } from "node:test";
import { assert } from "chai";
import nock from "nock";
import sinon from "sinon";

import { queuesClient } from "../../../src/lib/cloudflare";
import { ProviderError } from "../../../src/utils/errors";

const CLOUDFLARE_HOST = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID = "test-account-id";
const QUEUE_ID = "test-queue-id";
const QUEUES_API_TOKEN = "test-queues-api-token";

describe("queuesClient", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.QUEUES_API_TOKEN = QUEUES_API_TOKEN;
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.QUEUES_API_TOKEN;
    nock.cleanAll();
  });

  it("should successfully fetch data from Cloudflare Queues API", async () => {
    const path = "messages";
    const method = "GET";
    const responseBody = { success: true, result: [] };

    nock(CLOUDFLARE_HOST)
      .get(`/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/${path}`)
      .reply(200, responseBody);

    const result = await queuesClient({
      path,
      method,
      accountId: ACCOUNT_ID,
      queueId: QUEUE_ID,
    });

    assert.deepEqual(result, responseBody);
  });

  it("should throw an error if the API token is missing", async () => {
    delete process.env.QUEUES_API_TOKEN;

    try {
      await queuesClient({
        path: "messages",
        method: "GET",
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
      });
      assert.fail("Expected error to be thrown");
    } catch (error) {
      assert.instanceOf(error, Error);
      assert.equal(
        error.message,
        "Missing Cloudflare credentials, please set a QUEUES_API_TOKEN in the environment variables.",
      );
    }
  });

  it("should retry on 429 Too Many Requests", async () => {
    const path = "messages";
    const method = "GET";
    const responseBody = { success: true, result: [] };

    nock(CLOUDFLARE_HOST)
      .get(`/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/${path}`)
      .reply(429, "Too Many Requests")
      .get(`/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/${path}`)
      .reply(200, responseBody);

    const result = await queuesClient({
      path,
      method,
      accountId: ACCOUNT_ID,
      queueId: QUEUE_ID,
    });

    assert.deepEqual(result, responseBody);
  });

  it("should throw ProviderError after max retries", async () => {
    const path = "messages";
    const method = "GET";

    nock(CLOUDFLARE_HOST)
      .get(`/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/${path}`)
      .times(5)
      .reply(429, "Too Many Requests");

    try {
      await queuesClient({
        path,
        method,
        accountId: ACCOUNT_ID,
        queueId: QUEUE_ID,
      });
      assert.fail("Expected error to be thrown");
    } catch (error) {
      assert.instanceOf(error, ProviderError);
      assert.equal(error.message, "Max retries reached");
    }
  });
});

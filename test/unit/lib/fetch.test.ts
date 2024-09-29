import { describe, it } from "node:test";
import { assert } from "chai";

import { throwErrorIfResponseNotOk } from "../../../src/lib/fetch";
import { ProviderError } from "../../../src/utils/errors";

describe("throwErrorIfResponseNotOk", () => {
  it("should not throw an error if the response is OK", () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      url: "http://example.com",
    };

    // @ts-expect-error
    assert.doesNotThrow(() => throwErrorIfResponseNotOk(mockResponse));
  });

  it("should throw a ProviderError if the response is not OK and has a status", () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      url: "http://example.com",
    };

    try {
      // @ts-expect-error
      throwErrorIfResponseNotOk(mockResponse);
      assert.fail("Expected error to be thrown");
    } catch (error) {
      assert.instanceOf(error, ProviderError);
      assert.equal(error.message, "[404 - Not Found] http://example.com");
      assert.equal(error.code, "ResponseNotOk");
    }
  });

  it("should throw a ProviderError if the response is not OK and does not have a status", () => {
    const mockResponse = {
      ok: false,
      status: undefined,
      statusText: "Unknown Error",
      url: "http://example.com",
    };

    try {
      // @ts-expect-error
      throwErrorIfResponseNotOk(mockResponse);
      assert.fail("Expected error to be thrown");
    } catch (error) {
      assert.instanceOf(error, ProviderError);
      assert.equal(error.message, "[Unknown Error] http://example.com");
      assert.equal(error.code, "ResponseNotOk");
    }
  });
});

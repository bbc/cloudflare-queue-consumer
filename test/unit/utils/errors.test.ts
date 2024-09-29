import { describe, it } from "node:test";
import { assert } from "chai";

import {
  ProviderError,
  toProviderError,
  StandardError,
  toStandardError,
  TimeoutError,
  toTimeoutError,
} from "../../../src/utils/errors";

describe("Errors", () => {
  describe("ProviderError", () => {
    it("should create a ProviderError with the correct properties", () => {
      const message = "Provider error occurred";
      const error = new ProviderError(message);

      assert.instanceOf(error, ProviderError);
      assert.equal(error.message, message);
      assert.equal(error.name, "ProviderError");
    });
  });

  describe("toProviderError", () => {
    it("should format an error to ProviderError with response", () => {
      const message = "Formatted provider error";
      const mockResponse = {
        status: 404,
        statusText: "Not Found",
        url: "http://example.com",
      };
      const err = {
        code: "ERR_CODE",
        response: mockResponse,
        stack: "Error stack",
      };

      // @ts-expect-error
      const error = toProviderError(err, message);

      assert.instanceOf(error, ProviderError);
      assert.equal(error.message, message);
      assert.equal(error.code, err.code);
      assert.equal(error.stack, err.stack);
      assert.equal(error.status, mockResponse.status);
      assert.equal(error.statusText, mockResponse.statusText);
      assert.equal(error.url, mockResponse.url);
    });

    it("should format an error to ProviderError without response", () => {
      const message = "Formatted provider error";
      const err = {
        code: "ERR_CODE",
        stack: "Error stack",
      };

      // @ts-expect-error
      const error = toProviderError(err, message);

      assert.instanceOf(error, ProviderError);
      assert.equal(error.message, message);
      assert.equal(error.code, err.code);
      assert.equal(error.stack, err.stack);
      assert.isUndefined(error.status);
      assert.isUndefined(error.statusText);
      assert.isUndefined(error.url);
    });
  });

  describe("StandardError", () => {
    it("should create a StandardError with the correct properties", () => {
      const message = "Standard error occurred";
      const error = new StandardError(message);

      assert.instanceOf(error, StandardError);
      assert.equal(error.message, message);
      assert.equal(error.name, "StandardError");
    });
  });

  describe("toStandardError", () => {
    it("should format an error to StandardError", () => {
      const message = "Formatted standard error";
      const err = new Error("Original error");

      const error = toStandardError(err, message);

      assert.instanceOf(error, StandardError);
      assert.equal(error.message, message);
      assert.equal(error.cause, err);
    });
  });

  describe("TimeoutError", () => {
    it("should create a TimeoutError with the correct properties", () => {
      const message = "Timeout error occurred";
      const error = new TimeoutError(message);

      assert.instanceOf(error, TimeoutError);
      assert.equal(error.message, message);
      assert.equal(error.name, "TimeoutError");
    });
  });

  describe("toTimeoutError", () => {
    it("should format an error to TimeoutError", () => {
      const message = "Formatted timeout error";
      const err = new TimeoutError("Original timeout error");

      const error = toTimeoutError(err, message);

      assert.instanceOf(error, TimeoutError);
      assert.equal(error.message, message);
      assert.equal(error.cause, err);
    });
  });
});

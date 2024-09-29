import { describe, it, beforeEach, afterEach } from "node:test";
import { assert } from "chai";
import sinon from "sinon";

import { TypedEventEmitter } from "../../../src/utils/emitter";
import { logger } from "../../../src/utils/logger";

describe("TypedEventEmitter", () => {
  let emitter: TypedEventEmitter;
  let loggerStub: sinon.SinonStub;

  beforeEach(() => {
    emitter = new TypedEventEmitter();
    loggerStub = sinon.stub(logger, "debug");
  });

  afterEach(() => {
    loggerStub.restore();
  });

  it("should log and emit an event with the emit method", () => {
    emitter.emit("empty");

    assert.isTrue(loggerStub.calledOnce);
    assert.isTrue(loggerStub.calledWith("empty"));
  });
});

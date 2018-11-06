import chai from "chai";
import { ReadableStream } from "../lib";
import { Uint8 } from "semantic-types";

describe("ReadableStream", function () {
  it("readUint8", async function () {
    const rs: ReadableStream = new ReadableStream(Buffer.from([0xff]));
    const expected: Uint8 = 0xff;
    const actual: Uint8 = rs.readUint8();
    chai.assert.deepEqual(actual, expected);
  });
});

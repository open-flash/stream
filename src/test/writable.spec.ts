import chai from "chai";
import { WritableStream } from "../lib";

describe("WritableStream", function () {
  it("writeUint32Leb128", async function () {
    const ws: WritableStream = new WritableStream();
    ws.writeUint32Leb128(4294967295);
    const actual: Uint8Array = ws.getBytes();
    const expected: Uint8Array = Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x0f]);
    chai.assert.deepEqual(actual, expected);
  });
});

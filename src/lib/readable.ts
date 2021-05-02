import { Incident } from "incident";
import { Float16, Float32, Float64, Sint8, Sint16, Sint32, Uint8, Uint16, Uint32, UintSize } from "semantic-types";

import { createIncompleteStreamError } from "./errors/incomplete-stream.js";

const UTF8_DECODER: TextDecoder = new TextDecoder("UTF-8", {fatal: true});

/**
 * Represents a non-byte-aligned stream
 */
export interface ReadableBitStream {
  bytePos: UintSize;
  bitPos: UintSize;

  align(): void;

  asByteStream(): ReadableByteStream;

  skipBits(n: UintSize): void;

  readBoolBits(): boolean;

  readSint16Bits(n: UintSize): Sint16;

  readSint32Bits(n: UintSize): Sint32;

  readUint16Bits(n: UintSize): Uint16;

  readUint32Bits(n: UintSize): Uint32;
}

/**
 * Represents a byte-aligned stream
 */
export interface ReadableByteStream {
  bytePos: UintSize;

  skip(size: UintSize): void;

  align(): void;

  available(): UintSize;

  tailBytes(): Uint8Array;

  asBitStream(): ReadableBitStream;

  take(length: UintSize): ReadableByteStream;

  takeBytes(length: UintSize): Uint8Array;

  /**
   * Read the next `byteLength` bytes as an UTF-8 string.
   *
   * @param byteLength Length of the string in bytes.
   */
  readUtf8(byteLength: UintSize): string;

  /**
   * Read the next bytes as an UTF-8 string, up to NUL.
   *
   * The `NUL` byte is consumed but not included in the result.
   */
  readNulUtf8(): string;

  readUint8(): Uint8;

  peekUint8(): Uint8;

  readUint16BE(): Uint16;

  readUint16LE(): Uint16;

  readUint32BE(): Uint32;

  readUint32LE(): Uint32;

  readUint32Leb128(): Uint32;

  readSint8(): Sint8;

  readSint16LE(): Sint16;

  readSint32LE(): Sint32;

  /**
   * You probably don't want to use this but Float16LE for SWF files.
   */
  readFloat16BE(): Float16;

  readFloat16LE(): Float16;

  /**
   * You probably don't want to use this but Float32LEfor SWF files.
   */
  readFloat32BE(): Float32;

  readFloat32LE(): Float32;

  /**
   * You probably don't want to use this but Float64LEfor SWF files.
   */
  readFloat64BE(): Float64;

  readFloat64LE(): Float64;

  readFloat64LE32(): Float64;
}

// Temporary buffer, used for byte swaps for LE32 support.
const TMP_BUFFER: ArrayBuffer = new ArrayBuffer(8);
const TMP_DATA_VIEW: DataView = new DataView(TMP_BUFFER);

export class ReadableStream implements ReadableBitStream, ReadableByteStream {
  #bytes: Uint8Array;
  #view: DataView;
  bytePos: UintSize;
  #byteEnd: UintSize;
  bitPos: UintSize;

  public constructor(bytes: Uint8Array, _byteOffset: UintSize = 0, bitOffset: UintSize = 0) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    this.bytePos = 0;
    this.bitPos = bitOffset;
    this.#byteEnd = bytes.length;
  }

  public static equals(left: ReadableStream, right: ReadableStream): boolean {
    if (left.bitPos !== right.bitPos) {
      return false;
    }
    const leftLen: number = left.#byteEnd - left.bytePos;
    const rightLen: number = right.#byteEnd - right.bytePos;
    if (leftLen !== rightLen) {
      return false;
    } else if (leftLen === 0) {
      return true;
    }
    let i: number = 0;
    if (left.bitPos !== 0) {
      i = 1;
      const leftPartialByte: Uint8 = left.#bytes[left.bytePos];
      const rightPartialByte: Uint8 = right.#bytes[right.bytePos];
      const mask: Uint8 = (1 << (8 - left.bitPos)) - 1;
      if ((leftPartialByte & mask) !== (rightPartialByte & mask)) {
        return false;
      }
    }
    for (; i < leftLen; i++) {
      if (left.#bytes[left.bytePos + i] !== right.#bytes[right.bytePos + i]) {
        return false;
      }
    }
    return true;
  }

  public asBitStream(): this {
    return this;
  }

  public asByteStream(): this {
    this.align();
    return this;
  }

  public align(): void {
    if (this.bitPos !== 0) {
      this.bitPos = 0;
      this.bytePos++;
    }
  }

  public tail(): ReadableStream {
    return new ReadableStream(this.tailBytes(), 0, this.bitPos);
  }

  public tailBytes(): Uint8Array {
    const result: Uint8Array = this.#bytes.subarray(this.bytePos);
    this.bytePos = this.#byteEnd;
    this.bitPos = 0;
    return result;
  }

  public available(): number {
    return this.#byteEnd - this.bytePos;
  }

  public take(length: UintSize): ReadableStream {
    return new ReadableStream(this.takeBytes(length), 0, 0);
  }

  public takeBytes(length: UintSize): Uint8Array {
    const result: Uint8Array = this.#bytes.subarray(this.bytePos, this.bytePos + length);
    this.bytePos += length;
    this.bitPos = 0;
    return result;
  }

  public readSint8(): Sint8 {
    return this.#view.getInt8(this.bytePos++);
  }

  public readSint16LE(): Sint16 {
    const result: Sint16 = this.#view.getInt16(this.bytePos, true);
    this.bytePos += 2;
    return result;
  }

  public readSint32LE(): Sint32 {
    const result: Sint32 = this.#view.getInt32(this.bytePos, true);
    this.bytePos += 4;
    return result;
  }

  public readUint8(): Uint8 {
    return this.#view.getUint8(this.bytePos++);
  }

  public peekUint8(): Uint8 {
    return this.#view.getUint8(this.bytePos);
  }

  public readUint16BE(): Uint16 {
    const result: Uint16 = this.#view.getUint16(this.bytePos, false);
    this.bytePos += 2;
    return result;
  }

  public readUint16LE(): Uint16 {
    const result: Uint16 = this.#view.getUint16(this.bytePos, true);
    this.bytePos += 2;
    return result;
  }

  public readUint32BE(): Uint32 {
    const result: Uint32 = this.#view.getUint32(this.bytePos, false);
    this.bytePos += 4;
    return result;
  }

  public readUint32LE(): Uint32 {
    const result: Uint32 = this.#view.getUint32(this.bytePos, true);
    this.bytePos += 4;
    return result;
  }

  public readFloat16BE(): Float16 {
    const u16: Uint16 = this.#view.getUint16(this.bytePos, false);
    this.bytePos += 2;
    return reinterpretUint16AsFloat16(u16);
  }

  public readFloat16LE(): Float16 {
    const u16: Uint16 = this.#view.getUint16(this.bytePos, true);
    this.bytePos += 2;
    return reinterpretUint16AsFloat16(u16);
  }

  public readFloat32BE(): Float32 {
    const result: Float32 = this.#view.getFloat32(this.bytePos, false);
    this.bytePos += 4;
    return result;
  }

  public readFloat32LE(): Float32 {
    const result: Float32 = this.#view.getFloat32(this.bytePos, true);
    this.bytePos += 4;
    return result;
  }

  public readFloat64BE(): Float64 {
    const result: Float64 = this.#view.getFloat64(this.bytePos, false);
    this.bytePos += 8;
    return result;
  }

  public readFloat64LE(): Float64 {
    const result: Float64 = this.#view.getFloat64(this.bytePos, true);
    this.bytePos += 8;
    return result;
  }

  public readFloat64LE32(): Float64 {
    TMP_DATA_VIEW.setUint32(0, this.#view.getUint32(this.bytePos + 4, true), true);
    TMP_DATA_VIEW.setUint32(4, this.#view.getUint32(this.bytePos, true), true);
    const result: Float64 = TMP_DATA_VIEW.getFloat64(0, true);
    this.bytePos += 8;
    return result;
  }

  public skip(size: UintSize): void {
    this.bytePos += size;
  }

  public skipBits(n: number): void {
    this.readUintBits(n);
  }

  public readBoolBits(): boolean {
    return this.readUintBits(1) > 0;
  }

  public readSint16Bits(n: number): Sint16 {
    return this.readSintBits(n);
  }

  /**
   * SB[n]
   */
  public readSint32Bits(n: UintSize): Sint32 {
    return this.readSintBits(n);
  }

  public readUint16Bits(n: UintSize): Uint16 {
    return this.readUintBits(n);
  }

  /**
   * UB[n]
   */
  public readUint32Bits(n: UintSize): Uint32 {
    return this.readUintBits(n);
  }

  /**
   * LEB128-encoded Uint32 (1 to 5 bytes)
   */
  public readUint32Leb128(): Uint32 {
    let result: Uint32 = 0;
    for (let i: number = 0; i < 5; i++) {
      const nextByte: Uint8 = this.#bytes[this.bytePos++];
      if (i < 4) {
        // Bit-shift is safe
        result += (nextByte & 0x7f) << (7 * i);
      } else {
        // Bit-shift is unsafe, use `* Math.pow`
        result += (nextByte & 0x0f) * Math.pow(2, 28);
      }
      if ((nextByte & (1 << 7)) === 0) {
        return result;
      }
    }
    return result;
  }

  public readUtf8(byteLength: number): string {
    const endOfString: number = this.bytePos + byteLength;
    if (endOfString > this.#bytes.length) {
      throw createIncompleteStreamError();
    }
    const slice: Uint8Array = this.#bytes.subarray(this.bytePos, endOfString);
    const result: string = UTF8_DECODER.decode(slice);
    this.bytePos = endOfString;
    return result;
  }

  public readNulUtf8(): string {
    const endOfString: number = this.#bytes.indexOf(0, this.bytePos);
    if (endOfString < 0) {
      throw createIncompleteStreamError();
    }
    const slice: Uint8Array = this.#bytes.subarray(this.bytePos, endOfString);
    const result: string = UTF8_DECODER.decode(slice);
    this.bytePos = endOfString + 1;
    return result;
  }

  private readUintBits(n: number): number {
    if (n > 32) {
      // Even if we could read up to 53 bits, we restrict it to 32 bits (which is already unsafe
      // if we consider that the max positive number safe regarding bit operations is 2^31 - 1)
      throw new Incident("BitOverflow", "Cannot read above 32 bits without overflow");
    }
    let result: number = 0;
    while (n > 0) {
      if (this.bitPos + n < 8) {
        const endBitPos: number = this.bitPos + n;
        const shift: number = 1 << (endBitPos - this.bitPos);
        const cur: number = (this.#bytes[this.bytePos] >>> 8 - endBitPos) & (shift - 1);
        result = result * shift + cur;
        n = 0;
        this.bitPos = endBitPos;
      } else {
        const shift: number = 1 << (8 - this.bitPos);
        const cur: number = this.#bytes[this.bytePos] & (shift - 1);
        result = result * shift + cur;
        n -= (8 - this.bitPos);
        this.bitPos = 0;
        this.bytePos++;
      }
    }
    return result;
  }

  private readSintBits(n: number): number {
    if (n === 0) {
      return 0;
    }
    const unsigned: number = this.readUintBits(n);
    if (unsigned < Math.pow(2, n - 1)) {
      return unsigned;
    } else {
      return -Math.pow(2, n) + unsigned;
    }
  }
}

function reinterpretUint16AsFloat16(u16: Uint16): Float16 {
  const sign: -1 | 1 = (u16 & (1 << 15)) !== 0 ? -1 : 1;
  const exponent: Sint32 = (u16 & 0x7c00) >>> 10; // 0x7c00: bits 10 to 14 (inclusive)
  const fraction: Float64 = u16 & 0x03ff; // 0x03ff: bits 0 to 9 (inclusive)
  if (exponent === 0) {
    return sign * Math.pow(2, -14) * (fraction / 1024);
  } else if (exponent === 0x1f) { // 0x1f: bits 0 to 4 (inclusive)
    return fraction === 0 ? sign * Infinity : NaN;
  } else {
    return sign * Math.pow(2, exponent - 15) * (1 + (fraction / 1024));
  }
}

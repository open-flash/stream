import { Incident } from "incident";
import { Float16, Float32, Float64, Sint8, Sint16, Sint32, Uint8, Uint16, Uint32, UintSize } from "semantic-types";

import { concatBytes } from "./concat-bytes.js";

const UTF8_ENCODER: TextEncoder = new TextEncoder();

/**
 * Represents a non-byte-aligned stream
 */
export interface WritableBitStream {
  bytePos: UintSize;
  bitPos: UintSize;

  align(): void;

  asByteStream(): WritableByteStream;

  writeZerosBits(n: UintSize): void;

  writeBoolBits(value: boolean): void;

  writeSint16Bits(n: UintSize, value: Sint16): void;

  writeSint32Bits(n: UintSize, value: Sint32): void;

  writeUint16Bits(n: UintSize, value: Uint16): void;

  writeUint32Bits(n: UintSize, value: Uint32): void;
}

/**
 * Represents a byte-aligned stream
 */
export interface WritableByteStream {
  bytePos: UintSize;

  writeZeros(size: UintSize): void;

  asBitStream(): WritableBitStream;

  write(value: WritableByteStream): void;

  writeBytes(value: Uint8Array): void;

  writeUtf8(value: string): void;

  writeNulUtf8(value: string): void;

  writeUint8(value: Uint8): void;

  writeUint16BE(value: Uint16): void;

  writeUint16LE(value: Uint16): void;

  writeUint32BE(value: Uint32): void;

  writeUint32LE(value: Uint32): void;

  writeUint32Leb128(value: Uint32): void;

  writeSint8(value: Sint8): void;

  writeSint16LE(value: Sint16): void;

  writeSint32LE(value: Sint32): void;

  writeFloat16BE(value: Float16): void;

  writeFloat16LE(value: Float16): void;

  writeFloat32BE(value: Float32): void;

  writeFloat32LE(value: Float32): void;

  writeFloat64BE(value: Float64): void;

  writeFloat64LE(value: Float64): void;

  writeFloat64LE32(value: Float64): void;

  getBytes(): Uint8Array;
}

// Temporary buffer, used for float support
const TMP_BUFFER: ArrayBuffer = new ArrayBuffer(8);
const TMP_DATA_VIEW: DataView = new DataView(TMP_BUFFER);

export class WritableStream implements WritableBitStream, WritableByteStream {
  bytePos: UintSize;
  bitPos: UintSize;

  #chunks: Uint8Array[];
  #bitsBuffer: Uint8;

  constructor() {
    this.bytePos = 0;
    this.bitPos = 0;
    this.#bitsBuffer = 0;
    this.#chunks = [];
  }

  asBitStream(): this {
    return this;
  }

  asByteStream(): this {
    this.align();
    return this;
  }

  align(): void {
    if (this.bitPos !== 0) {
      this.writeUint8(this.#bitsBuffer); // Increments `this.bytePos`
      this.bitPos = 0;
      this.#bitsBuffer = 0;
    }
  }

  write(value: WritableByteStream): void {
    this.writeBytes(value.getBytes());
  }

  writeBytes(value: Uint8Array): void {
    this.#chunks.push(value);
    this.bytePos += value.length;
  }

  writeZeros(size: UintSize): void {
    this.#chunks.push(new Uint8Array(size));
    this.bytePos += size;
  }

  writeZerosBits(size: UintSize): void {
    if (this.bitPos + size < 8) {
      this.bitPos += size;
      return;
    }

    this.writeUint8(this.#bitsBuffer);
    this.#bitsBuffer = 0;
    size -= 8 - this.bitPos;

    const bitPos: UintSize = size % 8;
    this.writeZeros((size - bitPos) / 8);
    this.bitPos = bitPos;
  }

  writeSint8(value: Sint8): void {
    this.writeUint8(value < 0 ? (1 << 8) + value : value);
  }

  writeSint16LE(value: Sint16): void {
    this.writeUint16LE(value < 0 ? (1 << 16) + value : value);
  }

  writeSint32LE(value: Sint32): void {
    this.#chunks.push(Buffer.from([
      (value >>> 0) & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ]));
    this.bytePos += 4;
  }

  writeUint8(value: Uint8): void {
    this.#chunks.push(Buffer.from([value & 0xff]));
    this.bytePos++;
  }

  writeUint16BE(value: Uint16): void {
    this.#chunks.push(Buffer.from([
      (value >>> 8) & 0xff,
      (value >>> 0) & 0xff,
    ]));
    this.bytePos += 2;
  }

  writeUint16LE(value: Uint16): void {
    this.#chunks.push(Buffer.from([
      (value >>> 0) & 0xff,
      (value >>> 8) & 0xff,
    ]));
    this.bytePos += 2;
  }

  writeUint32BE(value: Uint32): void {
    this.#chunks.push(Buffer.from([
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 0) & 0xff,
    ]));
    this.bytePos += 4;
  }

  writeUint32LE(value: Uint32): void {
    this.writeSint32LE(value | 0);
  }

  writeFloat16BE(value: Float16): void {
    this.writeUint16BE(reinterpretFloat16AsUint16(value));
  }

  writeFloat16LE(value: Float16): void {
    this.writeUint16LE(reinterpretFloat16AsUint16(value));
  }

  writeFloat32BE(value: Float32): void {
    TMP_DATA_VIEW.setFloat32(0, value, false);
    this.#chunks.push(new Uint8Array(TMP_BUFFER.slice(0, 4)));
    this.bytePos += 4;
  }

  writeFloat32LE(value: Float32): void {
    TMP_DATA_VIEW.setFloat32(0, value, true);
    this.#chunks.push(new Uint8Array(TMP_BUFFER.slice(0, 4)));
    this.bytePos += 4;
  }

  writeFloat64BE(value: Float64): void {
    TMP_DATA_VIEW.setFloat64(0, value, false);
    this.#chunks.push(new Uint8Array(TMP_BUFFER.slice(0, 8)));
    this.bytePos += 8;
  }

  writeFloat64LE(value: Float64): void {
    TMP_DATA_VIEW.setFloat64(0, value, true);
    this.#chunks.push(new Uint8Array(TMP_BUFFER.slice(0, 8)));
    this.bytePos += 8;
  }

  writeFloat64LE32(value: Float64): void {
    TMP_DATA_VIEW.setFloat64(0, value, true);
    this.#chunks.push(new Uint8Array(TMP_BUFFER.slice(4, 8)));
    this.#chunks.push(new Uint8Array(TMP_BUFFER.slice(0, 4)));
    this.bytePos += 8;
  }

  writeBoolBits(value: boolean): void {
    return this.writeUintBits(1, value ? 1 : 0);
  }

  writeSint16Bits(n: number, value: Sint16): void {
    return this.writeSintBits(n, value);
  }

  /**
   * SB[n]
   */
  writeSint32Bits(n: UintSize, value: Sint32): void {
    return this.writeSintBits(n, value);
  }

  writeUint16Bits(n: UintSize, value: Uint16): void {
    return this.writeUintBits(n, value);
  }

  /**
   * UB[n]
   */
  writeUint32Bits(n: UintSize, value: Uint32): void {
    this.writeUintBits(n, value);
  }

  writeUint32Leb128(value: Uint32): void {
    const chunk: Uint8[] = [];
    while (value !== 0 || chunk.length === 0) {
      let nextByte: Uint8 = value % 0x80; // value & 0x7f
      value = (value - nextByte) / 0x80; // value >> 7
      if (value !== 0) {
        nextByte |= 0x80;
      }
      chunk.push(nextByte);
    }
    this.#chunks.push(new Uint8Array(chunk));
    this.bytePos += chunk.length;
  }

  writeUtf8(value: string): void {
    this.writeBytes(UTF8_ENCODER.encode(value));
  }

  writeNulUtf8(value: string): void {
    this.writeBytes(UTF8_ENCODER.encode(value));
    this.writeUint8(0);
  }

  getBytes(): Uint8Array {
    const bytes: Uint8Array = concatBytes(this.#chunks);
    this.#chunks = [bytes];
    return bytes;
  }

  private writeUintBits(bits: number, value: number): void {
    if (bits > 32) {
      // Even if we could read up to 53 bits, we restrict it to 32 bits (which is already unsafe
      // if we consider that the max positive number safe regarding bit operations is 2^31 - 1)
      throw new Incident("BitOverflow", "Cannot read above 32 bits without overflow");
    }
    while (bits > 0) {
      const availableBits: number = 8 - this.bitPos;

      const consumedBits: number = Math.min(availableBits, bits);
      const chunk: number = (value >>> (bits - consumedBits)) & ((1 << consumedBits) - 1);
      this.#bitsBuffer = this.#bitsBuffer | (chunk << (availableBits - consumedBits));
      bits -= consumedBits;
      this.bitPos += consumedBits;
      if (this.bitPos === 8) {
        this.writeUint8(this.#bitsBuffer);
        this.#bitsBuffer = 0;
        this.bitPos = 0;
      }
    }
  }

  private writeSintBits(bits: number, value: number): void {
    if (value < 0) {
      this.writeUintBits(bits, 2 ** bits + value);
    } else {
      this.writeUintBits(bits, value);
    }
  }
}

/**
 * Float16:
 * 1 sign bit (S)
 * 5 exponent bits (E)
 * 10 fraction bits (F)
 *
 * Format: SEEEEEFFFFFFFFFF
 */
function reinterpretFloat16AsUint16(value: Float16): Uint16 {
  if (isNaN(value)) {
    return 0xffff;
  }
  const signBit: 0 | 1 = (value < 0 || Object.is(value, -0)) ? 1 : 0;
  value = Math.abs(value);
  if (value < Math.pow(2, -14)) {
    const fraction: Uint16 = Math.floor(value / Math.pow(2, -24));
    return (signBit << 15) | (fraction & 0x03ff);
  }
  const MAX_EXPONENT: number = 0x1f;
  let exponent: number = 1;
  while (exponent < MAX_EXPONENT && value >= Math.pow(2, exponent - 14)) {
    exponent++;
  }
  if (exponent === MAX_EXPONENT) {
    return (signBit << 15) | (MAX_EXPONENT << 10); // Infinity
  } else {
    const fraction: number = Math.floor((value - Math.pow(2, exponent - 15)) / Math.pow(2, exponent - 25));
    return (signBit << 15) | (exponent << 10) | (fraction & 0x03ff);
  }
}

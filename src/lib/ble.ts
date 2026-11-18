/**
 * Parses Heart Rate Measurement characteristic per Bluetooth SIG specifications
 * (GATT Heart Rate Service 0x180D, Characteristic 0x2A37).
 *
 * Byte 0: Flags
 *   - Bit 0: 0 = UINT8 BPM format (1 byte), 1 = UINT16 BPM format (2 bytes, little-endian)
 */
export function parseHeartRateMeasurement(value: DataView): number {
  if (value.byteLength < 2) {
    throw new Error("Invalid Heart Rate data: buffer too short");
  }

  const flags = value.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;

  if (is16Bit) {
    if (value.byteLength < 3) {
      throw new Error("Invalid 16-bit Heart Rate data: buffer too short");
    }
    return value.getUint16(1, /* littleEndian = */ true);
  }

  return value.getUint8(1);
}

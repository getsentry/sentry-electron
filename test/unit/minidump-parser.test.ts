import { describe, expect, test } from 'vitest';
import {
  isDumpWithoutCrashing,
  parseMinidump,
  shouldDropMinidump,
  type CrashpadAnnotations,
} from '../../src/main/integrations/sentry-minidump/minidump-parser';

// https://crashpad.chromium.org/doxygen/structcrashpad_1_1MinidumpCrashpadInfo.html
const CRASHPAD_INFO_STREAM_TYPE = 1_129_316_353;
// parseMinidump refuses anything smaller, see minidump-parser.ts
const MIN_MINIDUMP_SIZE = 10_000;

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u64(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

function utf8String(str: string): Buffer {
  const data = Buffer.from(str, 'utf8');
  return Buffer.concat([u32(data.length), data]);
}

/**
 * Builds a minimal but structurally real minidump containing a single module whose crashpad
 * annotations match the given record, mirroring the exact byte layout that parseMinidump()
 * reads (header -> stream directory -> MINIDUMP_CRASHPAD_INFO -> module list -> module info ->
 * annotation objects -> string table). This exercises the real binary parsing path rather than
 * a plain JS object, so it doubles as a regression guard if that layout ever changes.
 */
function buildMinidumpWithAnnotations(annotations: Record<string, string>): Buffer {
  const entries = Object.entries(annotations);

  const HEADER_SIZE = 32;
  const STREAM_DIR_SIZE = 12;
  const CRASHPAD_INFO_SIZE = 52;
  const MODULE_LIST_SIZE = 4 + 12;
  const MODULE_INFO_SIZE = 28;
  const ANNOTATIONS_HEADER_SIZE = 4 + 12 * entries.length;

  const STREAM_DIR_OFFSET = HEADER_SIZE;
  const CRASHPAD_INFO_OFFSET = STREAM_DIR_OFFSET + STREAM_DIR_SIZE;
  const MODULE_LIST_OFFSET = CRASHPAD_INFO_OFFSET + CRASHPAD_INFO_SIZE;
  const MODULE_INFO_OFFSET = MODULE_LIST_OFFSET + MODULE_LIST_SIZE;
  const ANNOTATIONS_OFFSET = MODULE_INFO_OFFSET + MODULE_INFO_SIZE;
  const STRINGS_OFFSET = ANNOTATIONS_OFFSET + ANNOTATIONS_HEADER_SIZE;

  const strings: Buffer[] = [];
  let cursor = STRINGS_OFFSET;

  const annotationEntries = entries.map(([name, value]) => {
    const nameRva = cursor;
    const nameBuf = utf8String(name);
    strings.push(nameBuf);
    cursor += nameBuf.length;

    const valueRva = cursor;
    const valueBuf = utf8String(value);
    strings.push(valueBuf);
    cursor += valueBuf.length;

    // MINIDUMP_ANNOTATION: name rva (u32), type (u16, 1 = string), reserved (u16), value rva (u32)
    return Buffer.concat([u32(nameRva), u16(1), u16(0), u32(valueRva)]);
  });

  const header = Buffer.concat([
    Buffer.from('MDMP', 'ascii'),
    u32(0), // version
    u32(1), // streamCount
    u32(STREAM_DIR_OFFSET),
    u32(0), // checksum
    u32(0), // timeDateStamp
    u64(0), // flags
  ]);

  const streamDirectory = Buffer.concat([
    u32(CRASHPAD_INFO_STREAM_TYPE),
    u32(CRASHPAD_INFO_SIZE),
    u32(CRASHPAD_INFO_OFFSET),
  ]);

  const crashpadInfo = Buffer.concat([
    u32(1), // version
    Buffer.alloc(16), // report_id
    Buffer.alloc(16), // client_id
    u32(0),
    u32(0), // simple_annotations location (unused)
    u32(MODULE_LIST_SIZE),
    u32(MODULE_LIST_OFFSET), // module_list location
  ]);

  const moduleList = Buffer.concat([
    u32(1), // module count
    u32(0), // module_index (unused)
    u32(MODULE_INFO_SIZE),
    u32(MODULE_INFO_OFFSET), // location of this module's MINIDUMP_MODULE_CRASHPAD_INFO
  ]);

  const moduleInfo = Buffer.concat([
    u32(1), // version
    u32(0),
    u32(0), // list_annotations location (unused)
    u32(0),
    u32(0), // simple_annotations location (unused)
    u32(ANNOTATIONS_HEADER_SIZE),
    u32(ANNOTATIONS_OFFSET), // annotation_objects location
  ]);

  const annotationObjects = Buffer.concat([u32(entries.length), ...annotationEntries]);

  const minidump = Buffer.concat([
    header,
    streamDirectory,
    crashpadInfo,
    moduleList,
    moduleInfo,
    annotationObjects,
    ...strings,
  ]);

  return minidump.length >= MIN_MINIDUMP_SIZE
    ? minidump
    : Buffer.concat([minidump, Buffer.alloc(MIN_MINIDUMP_SIZE - minidump.length)]);
}

describe('parseMinidump crashpad annotations', () => {
  test('extracts DumpWithoutCrashing crash keys from a real minidump', () => {
    // Mirrors what Crashpad actually writes for base::debug::DumpWithoutCrashing() on Windows,
    // where it's typically paired with the simulated exception code 0x517a7ed.
    const minidump = buildMinidumpWithAnnotations({
      process_type: 'browser',
      'DumpWithoutCrashing-file': '../../base/win/registry.cc',
      'DumpWithoutCrashing-line': '512',
    });

    const result = parseMinidump(minidump);

    expect(result.crashpadAnnotations?.['DumpWithoutCrashing-file']).toBe('../../base/win/registry.cc');
    expect(result.crashpadAnnotations?.['DumpWithoutCrashing-line']).toBe('512');
    expect(isDumpWithoutCrashing(result.crashpadAnnotations)).toBe(true);
    expect(shouldDropMinidump(result.crashpadAnnotations)).toBe(true);
  });

  test('keeps a DumpWithoutCrashing minidump that carries the V8 OOM stack marker', () => {
    const minidump = buildMinidumpWithAnnotations({
      'DumpWithoutCrashing-file': 'gin/gin.cc',
      'DumpWithoutCrashing-line': '42',
      'electron.v8-oom.stack': '#0 at foo.js:1:1',
    });

    const result = parseMinidump(minidump);

    expect(isDumpWithoutCrashing(result.crashpadAnnotations)).toBe(true);
    expect(shouldDropMinidump(result.crashpadAnnotations)).toBe(false);
  });

  test('keeps a real crash minidump with no DumpWithoutCrashing markers', () => {
    const minidump = buildMinidumpWithAnnotations({
      process_type: 'renderer',
    });

    const result = parseMinidump(minidump);

    expect(isDumpWithoutCrashing(result.crashpadAnnotations)).toBe(false);
    expect(shouldDropMinidump(result.crashpadAnnotations)).toBe(false);
  });
});

describe('shouldDropMinidump', () => {
  test('keeps minidumps with no annotations at all', () => {
    expect(shouldDropMinidump(undefined)).toBe(false);
  });

  test('drops when only the file crash key is present', () => {
    const annotations: CrashpadAnnotations = { 'DumpWithoutCrashing-file': 'a.cc' };
    expect(shouldDropMinidump(annotations)).toBe(true);
  });

  test('drops when only the line crash key is present', () => {
    const annotations: CrashpadAnnotations = { 'DumpWithoutCrashing-line': '10' };
    expect(shouldDropMinidump(annotations)).toBe(true);
  });

  test('keeps unrelated annotations', () => {
    const annotations: CrashpadAnnotations = { process_type: 'browser', 'exit-reason': 'abnormal-exit' };
    expect(shouldDropMinidump(annotations)).toBe(false);
  });
});

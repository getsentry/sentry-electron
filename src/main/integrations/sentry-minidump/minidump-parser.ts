// This code takes a lot of inspiration and info from the rust-minidump crate at this point in time:
// https://github.com/rust-minidump/rust-minidump/tree/760f84058b909ff0f980988bd09f3a0f0421d298
//
// rust-minidump has the following license:
//
// MIT License
//
// Copyright (c) 2015-2023 rust-minidump contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

export const MINIDUMP_MAGIC_SIGNATURE = 'MDMP';

// https://docs.microsoft.com/en-us/windows/win32/api/minidumpapiset/ns-minidumpapiset-minidump_header
type MinidumpHeader = {
  /** This should be MDMP */
  signature: string;
  /** This should be 42899 */
  version: number;
  /** The number of streams contained in the stream directory. */
  streamCount: number;
  /**
   * The offset to the stream directory within the minidump.
   * This usually points to immediately after the header.
   * The stream directory is an array containing `stream_count`
   */
  streamDirectoryRva: number;
  checksum: number;
  timeDateStamp: Date;
  flags: bigint;
};

function readHeader(buf: Buffer): MinidumpHeader {
  // pub struct MINIDUMP_HEADER {
  return {
    //   pub signature: u32,
    signature: buf.subarray(0, 4).toString(),
    //   pub version: u32,
    version: buf.readUInt32LE(4),
    //   pub stream_count: u32,
    streamCount: buf.readUInt32LE(8),
    //   pub stream_directory_rva: u32,
    streamDirectoryRva: buf.readUInt32LE(12),
    //   pub checksum: u32,
    checksum: buf.readUInt32LE(16),
    //   pub time_date_stamp: u32,
    timeDateStamp: new Date(buf.readUInt32LE(20) * 1000),
    //   pub flags: u64,
    flags: buf.readBigUInt64LE(24),
  };
  // }
}

type MinidumpLocation = {
  /** The size of this data. */
  dataSize: number;
  /** The offset to this data within the minidump file. */
  rva: number;
};

// https://docs.microsoft.com/en-us/windows/win32/api/minidumpapiset/ns-minidumpapiset-minidump_location_descriptor
function readLocationDescriptor(buf: Buffer, base: number): MinidumpLocation {
  // pub struct MINIDUMP_LOCATION_DESCRIPTOR {
  return {
    //   pub data_size: u32,
    dataSize: buf.readUInt32LE(base),
    //   pub rva: u32,
    rva: buf.readUInt32LE(base + 4),
  };
  // }
}

type MinidumpStream = {
  /** This is usually one of the values for known stream types,
   * but user streams can have arbitrary values. */
  streamType: number;
  /** The location of the stream contents within the dump */
  location: MinidumpLocation;
};

// https://docs.microsoft.com/en-us/windows/win32/api/minidumpapiset/ns-minidumpapiset-minidump_directory
function readDirectoryStream(buf: Buffer, rva: number): MinidumpStream {
  // pub struct MINIDUMP_DIRECTORY {
  return {
    //   pub stream_type: u32,
    streamType: buf.readUInt32LE(rva),
    //   pub location: [u32, u32],
    location: readLocationDescriptor(buf, rva + 4),
  };
  // }
}

function readCrashpadInfoBuffer(buf: Buffer, location: MinidumpLocation): Buffer {
  return buf.subarray(location.rva, location.rva + location.dataSize);
}

// https://crashpad.chromium.org/doxygen/structcrashpad_1_1MinidumpModuleCrashpadInfo.html
function readCrashpadModuleInfoAnnotationObjectsLocation(buf: Buffer, base: number): MinidumpLocation {
  // pub struct MINIDUMP_MODULE_CRASHPAD_INFO {
  //   pub version: u32,
  //   pub list_annotations: [u32, u32],
  //   pub simple_annotations: [u32, u32],
  //   pub annotation_objects: [u32, u32],
  const annotation_objects = readLocationDescriptor(buf, base + 20);
  // }

  return annotation_objects;
}

function readStringUtf8Unterminated(buf: Buffer, rva: number): string {
  const length = buf.readUInt32LE(rva);
  return buf.toString('utf8', rva + 4, rva + 4 + length);
}

type AnnotationObject = {
  /** MinidumpUTF8String containing the name of the annotation. */
  name: string;
  /** `MinidumpByteArray` to the data for the annotation. */
  value: string;
};

function readAnnotationObject(buf: Buffer, all: Buffer, offset: number): AnnotationObject | undefined {
  // pub struct MINIDUMP_ANNOTATION {
  //   pub name: u32,
  const name = buf.readUInt32LE(offset);
  //   pub ty: u16,
  const ty = buf.readUInt16LE(offset + 4);
  //   pub _reserved: u16,
  //   pub value: u32,
  const value = buf.readUInt32LE(offset + 8);
  // }

  // Only consider string annotations
  if (ty === 1) {
    return { name: readStringUtf8Unterminated(all, name), value: readStringUtf8Unterminated(all, value) };
  }

  return undefined;
}

function readAnnotationObjects(buf: Buffer, location: MinidumpLocation): Record<string, string> {
  const data = buf.subarray(location.rva, location.rva + location.dataSize);
  if (data.length === 0) {
    return {};
  }

  const annotationObjectsLocation = readCrashpadModuleInfoAnnotationObjectsLocation(data, 0);
  const annotationObjectsData = buf.subarray(
    annotationObjectsLocation.rva,
    annotationObjectsLocation.rva + annotationObjectsLocation.dataSize,
  );

  const count = annotationObjectsData.readUInt32LE(0);
  let offset = 4;

  const annotationObjects: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const annotation = readAnnotationObject(annotationObjectsData, buf, offset);
    if (annotation) {
      const { name, value } = annotation;
      annotationObjects[name] = value;
    }
    offset += 12; // Each MINIDUMP_ANNOTATION is 12 bytes
  }

  return annotationObjects;
}

function readCrashpadModuleLinks(buf: Buffer, location: MinidumpLocation): Record<string, string> {
  const data = buf.subarray(location.rva, location.rva + location.dataSize);

  if (data.length === 0) {
    return {};
  }

  const count = data.readUInt32LE(0);
  let offset = 4;

  let annotationObjects = {};
  for (let i = 0; i < count; i++) {
    const annotationObjectsLocation = readLocationDescriptor(data, offset + 4);
    annotationObjects = { ...annotationObjects, ...readAnnotationObjects(buf, annotationObjectsLocation) };
    offset += 12;
  }

  return annotationObjects;
}

// https://crashpad.chromium.org/doxygen/structcrashpad_1_1MinidumpCrashpadInfo.html
function parseCrashpadInfo(buf: Buffer, info: Buffer): Record<string, string> {
  // pub struct MINIDUMP_CRASHPAD_INFO {
  //   pub version: u32,
  //   pub report_id: GUID (16 bytes),
  //   pub client_id: GUID (16 bytes),
  //   pub simple_annotations: [u32, u32],
  //   pub module_list: [u32, u32],
  const module_list = readLocationDescriptor(info, 44);
  // }

  return readCrashpadModuleLinks(buf, module_list);
}

type CrashpadAnnotations = {
  process_type?: string;
} & Record<string, string>;

export type MinidumpParseResult = {
  header: MinidumpHeader;
  crashpadAnnotations?: CrashpadAnnotations;
};

/**
 * Parses an Electron minidump and extracts the header and crashpad annotations
 */
export function parseMinidump(buf: Buffer): MinidumpParseResult {
  // Don't even bother trying to parse minidumps that are less than 10KB because they cannot be valid Electron minidumps
  // https://github.com/getsentry/sentry-electron/pull/748
  if (buf.length < 10_000) {
    throw new Error('Minidump was less than 10KB so likely incomplete.');
  }

  let header: MinidumpHeader | undefined;
  try {
    header = readHeader(buf);
  } catch (_) {
    throw new Error('Failed to parse minidump header');
  }

  if (header.signature !== MINIDUMP_MAGIC_SIGNATURE) {
    throw new Error(`Minidump signature was not '${MINIDUMP_MAGIC_SIGNATURE}'`);
  }

  try {
    for (let i = 0; i < header.streamCount; i++) {
      const stream = readDirectoryStream(buf, header.streamDirectoryRva + i * 12);

      // Crashpad specific stream in Electron minidump files
      // https://crashpad.chromium.org/doxygen/structcrashpad_1_1MinidumpCrashpadInfo.html
      if (stream.streamType === 1_129_316_353) {
        const crashpadInfo = readCrashpadInfoBuffer(buf, stream.location);
        const crashpadAnnotations = parseCrashpadInfo(buf, crashpadInfo);

        return {
          header,
          crashpadAnnotations,
        };
      }
    }
  } catch (_) {
    //
  }

  return { header };
}

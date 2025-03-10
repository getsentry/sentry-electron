// This code takes a lot of inspiration and info from the rust-minidump crate at thins point:
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
export const MINIDUMP_VERSION = 42899;

// https://docs.microsoft.com/en-us/windows/win32/api/minidumpapiset/ns-minidumpapiset-minidump_header
type MinidumpHeader = {
  signature: string;
  version: number;
  streamCount: number;
  streamDirectoryRva: number;
  checksum: number;
  timeDateStamp: Date;
  flags: bigint;
};

function readHeader(buf: Buffer): MinidumpHeader {
  // pub struct MINIDUMP_HEADER {
  //   pub signature: u32,
  //   pub version: u32,
  //   pub stream_count: u32,
  //   pub stream_directory_rva: RVA,
  //   pub checksum: u32,
  //   pub time_date_stamp: u32,
  //   pub flags: u64,
  // }

  return {
    signature: buf.subarray(0, 4).toString(),
    version: buf.readUInt32LE(4),
    streamCount: buf.readUInt32LE(8),
    streamDirectoryRva: buf.readUInt32LE(12),
    checksum: buf.readUInt32LE(16),
    timeDateStamp: new Date(buf.readUInt32LE(20) * 1000),
    flags: buf.readBigUInt64LE(24),
  };
}

type Location = {
  dataSize: number;
  rva: number;
};

// https://docs.microsoft.com/en-us/windows/win32/api/minidumpapiset/ns-minidumpapiset-minidump_location_descriptor
function readLocationDescriptor(buf: Buffer, base: number): Location {
  // pub struct MINIDUMP_LOCATION_DESCRIPTOR {
  //   pub data_size: u32,
  //   pub rva: RVA,
  // }

  return {
    dataSize: buf.readUInt32LE(base),
    rva: buf.readUInt32LE(base + 4),
  };
}

type MinidumpStream = {
  streamType: number;
  location: Location;
};

// https://docs.microsoft.com/en-us/windows/win32/api/minidumpapiset/ns-minidumpapiset-minidump_directory
function readDirectoryStream(buf: Buffer, rva: number): MinidumpStream {
  // pub struct MINIDUMP_DIRECTORY {
  //   pub stream_type: u32,
  //   pub location: MINIDUMP_LOCATION_DESCRIPTOR,
  // }

  return {
    streamType: buf.readUInt32LE(rva),
    location: readLocationDescriptor(buf, rva + 4),
  };
}

function readCrashpadInfoBuffer(buf: Buffer, location: Location): Buffer {
  return buf.subarray(location.rva, location.rva + location.dataSize);
}

// https://crashpad.chromium.org/doxygen/structcrashpad_1_1MinidumpModuleCrashpadInfo.html
function readCrashpadModuleInfoAnnotationObjectsLocation(buf: Buffer, base: number): Location {
  // pub struct MINIDUMP_MODULE_CRASHPAD_INFO {
  //   pub version: u32,
  //   pub list_annotations: MINIDUMP_LOCATION_DESCRIPTOR,
  //   pub simple_annotations: MINIDUMP_LOCATION_DESCRIPTOR,
  //   pub annotation_objects: MINIDUMP_LOCATION_DESCRIPTOR,
  // }

  // const version = buf.readUInt32LE(base)
  // const list_annotations = readLocationDescriptor(buf, base + 4)
  // const simple_annotations = readLocationDescriptor(buf, base + 12)
  const annotation_objects = readLocationDescriptor(buf, base + 20);

  return annotation_objects;
}

function readStringUtf8Unterminated(buf: Buffer, rva: number): string {
  const length = buf.readUInt32LE(rva);
  return buf.toString('utf8', rva + 4, rva + 4 + length);
}

function readAnnotationObject(buf: Buffer, all: Buffer, offset: number): [string, string] | undefined {
  // pub struct MINIDUMP_ANNOTATION {
  //   pub name: u32,
  //   pub ty: u16,
  //   pub _reserved: u16,
  //   pub value: u32,
  // }

  const name = buf.readUInt32LE(offset);
  const ty = buf.readUInt16LE(offset + 4);
  // const _reserved = buf.readUInt16LE(offset + 6)
  const value = buf.readUInt32LE(offset + 8);

  if (ty === 1) {
    return [readStringUtf8Unterminated(all, name), readStringUtf8Unterminated(all, value)];
  }

  return undefined;
}

function readAnnotationObjects(buf: Buffer, location: Location): Record<string, string> {
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
      const [key, value] = annotation;
      annotationObjects[key] = value;
    }
    offset += 12;
  }

  return annotationObjects;
}

function readCrashpadModuleLinks(buf: Buffer, location: Location): Record<string, string> {
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
  // This stream is of the following format:
  // pub struct MINIDUMP_CRASHPAD_INFO {
  //   pub version: u32,
  //   pub report_id: GUID,
  //   pub client_id: GUID,
  //   pub simple_annotations: MINIDUMP_LOCATION_DESCRIPTOR,
  //   pub module_list: MINIDUMP_LOCATION_DESCRIPTOR,
  // }

  const module_list = readLocationDescriptor(info, 44);

  return readCrashpadModuleLinks(buf, module_list);
}

type CrashpadAnnotations = {
  process_type?: string;
} & Record<string, string>;

export type MinidumpParseResult = {
  header: MinidumpHeader;
  crashpadAnnotations?: CrashpadAnnotations;
};

function looksValid(header: MinidumpHeader, bufLen: number): boolean {
  return header.signature === MINIDUMP_MAGIC_SIGNATURE && header.version === MINIDUMP_VERSION && bufLen > 10_000;
}

/** Parses an Electron minidump and extracts the header and crashpad annotations */
export function parseMinidump(buf: Buffer): MinidumpParseResult | undefined {
  if (buf.length < 32) {
    return undefined;
  }

  let header: MinidumpHeader | undefined;
  try {
    header = readHeader(buf);
  } catch (_) {
    return undefined;
  }

  if (looksValid(header, buf.length)) {
    return undefined;
  }

  for (let i = 0; i < header.streamCount; i++) {
    const stream = readDirectoryStream(buf, header.streamDirectoryRva + i * 12);

    // Crashpad specific stream in Electron minidump files
    // https://crashpad.chromium.org/doxygen/structcrashpad_1_1MinidumpCrashpadInfo.html
    if (stream.streamType === 1_129_316_353) {
      const crashpadInfo = readCrashpadInfoBuffer(buf, stream.location);
      const crashpadAnnotations = parseCrashpadInfo(buf, crashpadInfo) as CrashpadAnnotations;

      return {
        header,
        crashpadAnnotations,
      };
    }
  }

  return { header };
}

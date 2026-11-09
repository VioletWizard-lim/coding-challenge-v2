/**
 * 아주 작은 ZIP 만들기·읽기 (압축 없이 "저장" 방식). 서버·브라우저 모두에서 쓴다 (Node 전용 기능 없음).
 * - 만들기: 파일 내용을 조금씩 흘려보낸다 (큰 백업도 메모리에 다 올리지 않음, 크기·CRC는 뒤에 붙임)
 * - 읽기: 이 파일이 만든 ZIP(또는 압축 없이 저장된 ZIP)만 읽는다
 * 단위 테스트: zip.test.ts
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const enc = new TextEncoder();
const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

export type ZipEntry = { name: string; data: AsyncIterable<Uint8Array> | Iterable<Uint8Array> };

/** 파일들을 ZIP으로 흘려보낸다. 파일 이름은 UTF-8 (한글 이름 가능) */
export function zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      try {
        let offset = 0;
        const central: number[][] = [];
        const push = (bytes: Uint8Array | number[]) => {
          const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
          controller.enqueue(b);
          offset += b.length;
        };
        for await (const entry of entries) {
          const name = enc.encode(entry.name);
          const start = offset;
          // 크기·CRC는 내용 뒤(데이터 설명자)에 적는다: 일반 비트 3 + UTF-8 이름 비트 11
          push([...u32(0x04034b50), ...u16(20), ...u16(0x0808), ...u16(0), ...u16(0), ...u16(0x21), ...u32(0), ...u32(0), ...u32(0), ...u16(name.length), ...u16(0), ...name]);
          let crc = 0;
          let size = 0;
          for await (const chunk of entry.data) {
            crc = crc32(chunk, crc);
            size += chunk.length;
            push(chunk);
          }
          push([...u32(0x08074b50), ...u32(crc), ...u32(size), ...u32(size)]);
          central.push([
            ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0808), ...u16(0), ...u16(0), ...u16(0x21),
            ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(start), ...name,
          ]);
        }
        const cdStart = offset;
        for (const c of central) push(c);
        push([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(offset - cdStart), ...u32(cdStart), ...u16(0)]);
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/** ZIP 읽기 (압축 없이 저장된 파일만). 이름 → 내용 */
export function readZip(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP 파일이 아니에요.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP 목록을 읽지 못했어요.");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error(`"${name}"이 압축돼 있어요. 사이트에서 받은 백업 파일을 그대로 올려 주세요.`);
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.set(name, bytes.subarray(dataStart, dataStart + size));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

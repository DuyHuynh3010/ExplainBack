import { AnalysisError } from "../analysis/errors";
import { EXPLANATION_LIMITS as L } from "../contracts/explanation-limits";
import type { TranscriptionResult } from "../contracts/api";

/** Inspect container headers without pretending to decode or prove speech content. */
export function inspectAudio(bytes: Uint8Array): TranscriptionResult["audio"] {
  if (!bytes.length) throw new AnalysisError("INVALID_REQUEST", 400, "The recording is empty. Record again or type your explanation.");
  if (bytes.length > L.audioBytes) throw new AnalysisError("PAYLOAD_TOO_LARGE", 413, "Audio exceeds 3,000,000 bytes.");
  const b = Buffer.from(bytes);
  let mimeType: TranscriptionResult["audio"]["mimeType"];
  let durationSeconds: number | undefined;
  if (b.length >= 44 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE") {
    mimeType = "audio/wav";
    let rate = 0, data = 0;
    for (let p = 12; p + 8 <= b.length;) {
      const size = b.readUInt32LE(p + 4), name = b.toString("ascii", p, p + 4);
      if (p + 8 + size > b.length) throw new AnalysisError("INVALID_REQUEST", 400, "Truncated WAV recording.");
      if (name === "fmt " && size >= 16) {
        if (![1, 3].includes(b.readUInt16LE(p + 8))) throw new AnalysisError("UNSUPPORTED_SOURCE", 415, "Use PCM/float WAV or a browser WebM/M4A recording.");
        rate = b.readUInt32LE(p + 16);
      }
      if (name === "data") data += size;
      p += 8 + size + (size % 2);
    }
    if (!rate || !data) throw new AnalysisError("INVALID_REQUEST", 400, "WAV recording contains no audio samples.");
    durationSeconds = data / rate;
  } else if (b.length > 16 && b.readUInt32BE(0) === 0x1a45dfa3) {
    mimeType = "audio/webm";
    let webm = false, audio = false, video = false, payload = false, scale = 1_000_000, duration: number | undefined;
    const vint = (p: number, id: boolean) => {
      const first = b[p];
      let n = 1;
      while (n <= 8 && !(first & (1 << (8 - n)))) n++;
      if (!first || n > (id ? 4 : 8) || p + n > b.length) throw new Error("Invalid EBML integer");
      let value = BigInt(id ? first : first & ((1 << (8 - n)) - 1));
      for (let i = 1; i < n; i++) value = value * BigInt(256) + BigInt(b[p + i]);
      const unknown = !id && value === (BigInt(1) << BigInt(n * 7)) - BigInt(1);
      return { n, value: Number(value), unknown };
    };
    const masters = new Set([0x1a45dfa3, 0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe1, 0x1f43b675, 0xa0]);
    const segmentChildren = new Set([0x1f43b675, 0x1549a966, 0x1654ae6b, 0x114d9b74, 0x1c53bb6b, 0x1254c367]);
    const walk = (start: number, end: number, depth: number, unknownCluster = false): number => {
      if (depth > 8) throw new Error("EBML nesting limit");
      for (let p = start; p < end;) {
        const tag = vint(p, true);
        // MediaRecorder emits sibling Clusters with unknown sizes. The next
        // Segment-level element closes the current Cluster; it is not nested.
        if (unknownCluster && segmentChildren.has(tag.value)) return p;
        const size = vint(p + tag.n, false), from = p + tag.n + size.n;
        let to = size.unknown ? end : from + size.value;
        if (!Number.isSafeInteger(to) || to > end || to < from) throw new Error("Truncated EBML");
        const value = b.subarray(from, to);
        if (tag.value === 0x4282) webm = value.toString() === "webm";
        if (tag.value === 0x83 && value.length === 1) { audio ||= value[0] === 2; video ||= value[0] === 1; }
        if ([0xa3, 0xa1].includes(tag.value) && value.length > 4) payload = true;
        if (tag.value === 0x2ad7b1 && value.length <= 6) scale = value.readUIntBE(0, value.length);
        if (tag.value === 0x4489 && [4, 8].includes(value.length)) duration = value.length === 4 ? value.readFloatBE() : value.readDoubleBE();
        if (size.unknown && ![0x18538067, 0x1f43b675].includes(tag.value)) throw new Error("Unsupported unknown EBML size");
        if (masters.has(tag.value)) to = walk(from, to, depth + 1, size.unknown && tag.value === 0x1f43b675);
        p = to;
      }
      return end;
    };
    try { walk(0, b.length, 0); } catch { throw new AnalysisError("INVALID_REQUEST", 400, "Malformed or truncated WebM recording."); }
    if (!webm || !audio || video || !payload) throw new AnalysisError("UNSUPPORTED_SOURCE", 415, "Use an audio-only WebM recording with captured samples.");
    if (duration !== undefined) durationSeconds = duration * scale / 1e9;
  } else if (b.length > 24 && b.toString("ascii", 4, 8) === "ftyp") {
    mimeType = "audio/m4a";
    let audio = false, video = false, payload = false;
    const walk = (start: number, end: number, depth: number) => {
      if (depth > 6) throw new Error("MP4 nesting limit");
      for (let p = start; p < end;) {
        if (p + 8 > end) throw new Error("Truncated box");
        let size = b.readUInt32BE(p), header = 8;
        if (size === 1) { if (p + 16 > end) throw new Error("Truncated box"); size = Number(b.readBigUInt64BE(p + 8)); header = 16; }
        if (size === 0) size = end - p;
        if (!Number.isSafeInteger(size) || size < header || p + size > end) throw new Error("Invalid box");
        const tag = b.toString("ascii", p + 4, p + 8), from = p + header, to = p + size;
        if (["moov", "trak", "mdia"].includes(tag)) walk(from, to, depth + 1);
        if (tag === "hdlr" && from + 12 <= to) { const type = b.toString("ascii", from + 8, from + 12); audio ||= type === "soun"; video ||= type === "vide"; }
        if (tag === "mdat" && size > header) payload = true;
        if (tag === "mvhd" && from + 20 <= to && b[from] === 0) {
          const scale = b.readUInt32BE(from + 12), duration = b.readUInt32BE(from + 16);
          if (scale && duration && duration !== 0xffffffff) durationSeconds = duration / scale;
        }
        if (tag === "mvhd" && from + 32 <= to && b[from] === 1) {
          const scale = b.readUInt32BE(from + 20), duration = Number(b.readBigUInt64BE(from + 24));
          if (scale && duration && Number.isSafeInteger(duration)) durationSeconds = duration / scale;
        }
        p = to;
      }
    };
    try { walk(0, b.length, 0); } catch { throw new AnalysisError("INVALID_REQUEST", 400, "Malformed or truncated M4A recording."); }
    if (!audio || video || !payload) throw new AnalysisError("UNSUPPORTED_SOURCE", 415, "Use an audio-only M4A recording with captured samples.");
  } else throw new AnalysisError("UNSUPPORTED_SOURCE", 415, "Supported audio containers: WebM, PCM WAV, and M4A. File names and MIME labels alone are not trusted.");
  if (durationSeconds !== undefined && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) throw new AnalysisError("INVALID_REQUEST", 400, "Recording duration is invalid.");
  if (durationSeconds !== undefined && durationSeconds > L.audioSeconds) throw new AnalysisError("PAYLOAD_TOO_LARGE", 413, "Recording exceeds 120 seconds.");
  return { mimeType, bytes: b.length, ...(durationSeconds !== undefined ? { durationSeconds } : {}) };
}

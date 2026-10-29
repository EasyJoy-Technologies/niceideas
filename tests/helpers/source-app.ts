import type { SourceApp } from "@/server/nicenote/source-app";

/** `sourceApp` the NiceMatrix backend sends for NiceNote shares (contract §3.2). */
export const NICENOTE_APP: SourceApp = { key: "nicenote", names: { en: "NiceNote", "zh-Hans": "乐趣记事本", "zh-Hant": "樂趣記事本" } };
export const NICERECORDER_APP: SourceApp = { key: "nicerecorder", names: { en: "NiceRecorder", "zh-Hans": "易录音", "zh-Hant": "易錄音" } };

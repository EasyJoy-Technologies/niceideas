import type { ColumnType } from "kysely";

/** Timestamps are written as Date/ISO strings and read back as Date. */
export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
/** Timestamp with a database default (optional on insert, updatable). */
export type DefaultedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
/** Arbitrary JSON written as a serialized string. */
export type JsonColumn = ColumnType<unknown, string, string>;

/** Display names of the app a shared post came from (contract niceideas-share.md §3.2 `sourceApp.names`); English is required. */
export type SourceAppNames = { en: string; "zh-Hans"?: string; "zh-Hant"?: string };
/** jsonb, written as a serialized string, read back parsed. */
export type SourceAppNamesColumn = ColumnType<SourceAppNames | null, string | null | undefined, string | null>;

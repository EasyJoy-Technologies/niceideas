import type { ColumnType } from "kysely";

/** Timestamps are written as Date/ISO strings and read back as Date. */
export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
/** Timestamp with a database default (optional on insert, updatable). */
export type DefaultedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
/** Arbitrary JSON written as a serialized string. */
export type JsonColumn = ColumnType<unknown, string, string>;

import pkg from "../../package.json";

/** Single source of truth: root package.json `version` (platform plan §15). */
export const APP_VERSION: string = pkg.version;

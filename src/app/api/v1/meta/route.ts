import { getConfig } from "@/server/config/env";
import { jsonOk } from "@/server/http/json";
import { APP_VERSION } from "@/server/version";

/** Service metadata; deploy verification compares `version` (plan §15). */
export async function GET() {
  return jsonOk({ name: "niceideas", version: APP_VERSION, environment: getConfig().APP_ENV, apiVersion: 1 });
}

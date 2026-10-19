import { getConfig } from "@/server/config/env";
import { apiRoute } from "@/server/http/api-route";
import { jsonOk } from "@/server/http/json";
import { APP_VERSION } from "@/server/version";

/** Service metadata; deploy verification compares `version` (plan §15). */
export const GET = apiRoute("meta.get", "public_meta", async () =>
  jsonOk({ name: "niceideas", version: APP_VERSION, environment: getConfig().APP_ENV, apiVersion: 1 }),
);

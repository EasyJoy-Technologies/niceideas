import { jsonOk } from "@/server/http/json";
import { readJson } from "@/server/http/read-json";
import { reportContent } from "@/server/interactions/reports";
import { interactionRoute } from "@/server/interactions/route";

/** Report a post or comment; always 202 (repeats are accepted silently). */
export const POST = interactionRoute("reports.create", async ({ request, db, visitor }) => {
  await reportContent(db, visitor, await readJson(request, 16_384));
  return jsonOk({ accepted: true }, 202);
});

import { jsonOk } from "@/server/http/json";
import { issueChallenge } from "@/server/interactions/pow";
import { interactionRoute } from "@/server/interactions/route";

/** Fresh proof-of-work challenge for an anonymous comment. */
export const GET = interactionRoute("comments.challenge", async () => jsonOk(issueChallenge()), { write: false });

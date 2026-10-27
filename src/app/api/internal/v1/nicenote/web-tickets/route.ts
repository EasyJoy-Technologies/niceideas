import { appTicketExchangeUrl } from "@/server/auth/app-ticket/ticket";
import { jsonOk } from "@/server/http/json";
import { parseBody, webTicketBody } from "@/server/nicenote/requests";
import { sourceRoute } from "@/server/nicenote/source-route";
import { issueWebTicket } from "@/server/nicenote/web-ticket";

/** NiceMatrix backend: one-time sign-in ticket for the user's app WebView (contract §10.2). Never logs the ticket. */
export const POST = sourceRoute("nicenote.web_ticket", async ({ db, json }) => {
  const { ticket, expiresAt } = await issueWebTicket(db, parseBody(webTicketBody, json));
  console.info(JSON.stringify({ event: "app_ticket", action: "issue" }));
  return jsonOk({ ticket, expiresAt: expiresAt.toISOString(), exchangeUrl: appTicketExchangeUrl() }, 201);
});

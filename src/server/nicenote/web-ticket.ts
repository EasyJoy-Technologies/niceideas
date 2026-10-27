import type { Db } from "@/server/db/client";
import { assertAuthorActive } from "@/server/accounts/author-gate";
import { issueTicket } from "@/server/auth/app-ticket/ticket";
import type { WebTicketInput } from "./requests";
import { prepareSourceAuthor } from "./source-author";

/**
 * POST /web-tickets (contract niceideas-share.md §10.2): a new one-time sign-in ticket per call (not
 * idempotent; an unused one expires after 60 s). The profile is prepared like for a share; the ticket
 * is written under the profile lock, so a deletion request committed meanwhile wins (409 `user.deleting`).
 */
export async function issueWebTicket(db: Db, input: WebTicketInput): Promise<{ ticket: string; expiresAt: Date }> {
  await prepareSourceAuthor(db, input.userId, input.profile);
  return db.transaction().execute(async (trx) => {
    await assertAuthorActive(trx, input.userId);
    return issueTicket(trx, input.userId);
  });
}

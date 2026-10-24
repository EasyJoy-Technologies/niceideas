import type { PostSource } from "@/server/db/schema";

/**
 * Author of a publication: an third-party app acting for a user (`third_party`, source `api:<client_id>`)
 * or NiceIdeas itself (`first_party`: web compose, internal tools).
 */
export type Principal = {
  userId: string;
  clientId: string;
  kind: "first_party" | "third_party";
  source: PostSource;
  /** Registered third-party client (third party only). */
  apiClientId?: string;
};

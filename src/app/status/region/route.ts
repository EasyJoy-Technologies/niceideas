import { htmlResponse, pageContext } from "@/server/share/respond";
import { renderStatusPage } from "@/server/share/status-page";

/**
 * 451 page for mainland-China visitors of non-share pages. `src/proxy.ts`
 * rewrites blocked requests here (the URL in the address bar is unchanged).
 */
export async function GET(request: Request) {
  // Site access: in mainland China no viewer is loaded for this page (nothing on it uses one).
  const ctx = await pageContext(request, "site");
  return htmlResponse(renderStatusPage({ ...ctx, restricted: true }, "restricted"), 451);
}

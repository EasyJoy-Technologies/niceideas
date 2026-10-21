import { htmlResponse, pageContext } from "@/server/share/respond";
import { renderAuthErrorPage } from "@/server/share/auth-error-page";
import { finishSignIn, signOut, startSignIn, type SignInFailure } from "./sign-in-flow";

const STATUS: Record<SignInFailure, number> = { disabled: 503, expired: 400, failed: 502, deleting: 403 };

async function respond(request: Request, run: (r: Request) => Promise<Response | SignInFailure>): Promise<Response> {
  const result = await run(request);
  if (result instanceof Response) return result;
  const ctx = await pageContext(request, "site");
  return htmlResponse(renderAuthErrorPage(ctx, result), STATUS[result]);
}

/** Site pages: mainland-China visitors get 451 via src/proxy.ts before reaching these. */
export const signInRoute = (request: Request) => respond(request, startSignIn);
export const callbackRoute = (request: Request) => respond(request, finishSignIn);
export const signOutRoute = (request: Request) => signOut(request);

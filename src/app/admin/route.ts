import { adminActionRoute, adminSectionPage } from "@/server/admin-ui/admin-routes";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => adminSectionPage(request, "overview");
export const POST = adminActionRoute;

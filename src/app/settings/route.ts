import { saveSettings, settingsPage } from "@/server/share/settings-route";

export const dynamic = "force-dynamic";
export const GET = settingsPage;
export const POST = saveSettings;

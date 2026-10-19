import type { Profile } from "@/server/db/schema";

export type ProfileDto = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  locale: string | null;
};

export function toProfileDto(p: Profile): ProfileDto {
  return { handle: p.handle, displayName: p.display_name, avatarUrl: p.avatar_url, bio: p.bio, locale: p.locale };
}

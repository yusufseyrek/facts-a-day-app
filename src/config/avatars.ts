/**
 * Curated avatar emoji — MIRROR of AVATAR_EMOJI in the backend
 * (src/db/appUsers.ts). The server validates against its copy (values render
 * verbatim in other users' UIs, so it must never accept free text); keep the
 * two lists in sync. Additions are backward-safe (old clients still render
 * unknown emoji as text), removals are not (existing rows keep the value).
 *
 * All entries are single-codepoint, ZWJ-free, skin-tone-free emoji so they
 * render consistently across iOS/Android system fonts.
 */
export const AVATAR_EMOJI = [
  '🦊', '🐼', '🦉', '🐸', '🚀', '⭐',
  '🐙', '🦁', '🐬', '🎧', '🌵', '🍀',
  '🐯', '🐨', '🦋', '🎲', '🔭', '🌙',
  '🐢', '🦜', '🍩', '⚡', '🎸', '🧠',
] as const;

export type AvatarEmoji = (typeof AVATAR_EMOJI)[number];

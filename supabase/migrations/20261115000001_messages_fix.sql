-- Messages follow-up: Supabase's default privileges give signed-in users
-- insert/update/delete on every new table. Row-level security already blocks
-- those writes (there are no write policies), but quietly, as "0 rows". Take
-- the privileges away so only the security-definer functions can write, and
-- direct writes fail loudly.

revoke insert, update, delete, truncate on public.messages, public.conversations, public.conversation_reads, public.moderation_events from anon, authenticated;
revoke all on public.family_verifications from anon, authenticated;
revoke all on public.messages, public.conversations, public.conversation_reads, public.moderation_events from anon;
revoke update, truncate on public.family_blocks from anon, authenticated;
revoke all on public.family_blocks from anon;

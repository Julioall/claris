-- Create an isolated schema for the Evolution API (WhatsApp provider).
-- The Evolution API uses Prisma to manage its own tables; pointing it at the
-- `public` schema causes Prisma error P3005 ("database schema is not empty")
-- because Supabase already owns that schema.
-- By using a dedicated `evolution` schema we keep those tables completely
-- separate from the Claris application schema.

CREATE SCHEMA IF NOT EXISTS evolution;

-- Grant the Supabase service role full access (needed by the Evolution API
-- when it connects via the standard postgres user).
GRANT ALL ON SCHEMA evolution TO postgres;

-- Authenticated users have no access to this schema – it is internal.

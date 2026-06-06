const { Client } = require('pg')
const pool = require('./db')

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://criticalfail:criticalfail@localhost:5432/criticalfail'

async function ensureDatabase() {
  const url = new URL(DATABASE_URL)
  const dbName = url.pathname.slice(1)
  url.pathname = '/postgres'
  const client = new Client({ connectionString: url.toString() })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE "${dbName}"`)
    console.log(`Database "${dbName}" created.`)
  } catch (err) {
    if (err.code !== '42P04') throw err // 42P04 = duplicate_database, already exists
  } finally {
    await client.end()
  }
}

const migrations = `
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  code UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  created_by INTEGER REFERENCES admins(id),
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  player_name VARCHAR(100) NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  socket_id VARCHAR(100)
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS ac INTEGER DEFAULT 10;
ALTER TABLE players ADD COLUMN IF NOT EXISTS max_hp INTEGER DEFAULT 20;
ALTER TABLE players ADD COLUMN IF NOT EXISTS current_hp INTEGER DEFAULT 20;
ALTER TABLE players ADD COLUMN IF NOT EXISTS dnd_class VARCHAR(50);
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE players ADD COLUMN IF NOT EXISTS initiative INTEGER;

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  from_name VARCHAR(100) NOT NULL,
  to_player_id INTEGER REFERENCES players(id),
  type VARCHAR(20) DEFAULT 'text',
  content TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dice_results (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  combat_type VARCHAR(20) NOT NULL,
  roll_value INTEGER NOT NULL,
  result_text TEXT NOT NULL,
  sent_to INTEGER REFERENCES players(id),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_style VARCHAR(20) DEFAULT 'normal';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS text_effect VARCHAR(20) DEFAULT 'none';

ALTER TABLE players ADD COLUMN IF NOT EXISTS conditions TEXT DEFAULT '[]';
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_concentrating BOOLEAN DEFAULT FALSE;

ALTER TABLE sessions ALTER COLUMN code DROP DEFAULT;
ALTER TABLE sessions ALTER COLUMN code TYPE VARCHAR(40) USING code::text;
ALTER TABLE sessions ALTER COLUMN code SET DEFAULT gen_random_uuid()::text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tv_mode VARCHAR(20) DEFAULT 'lobby';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_image_url VARCHAR(500);

CREATE TABLE IF NOT EXISTS votes (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  question TEXT NOT NULL,
  options JSON NOT NULL,
  is_anonymous BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vote_responses (
  id SERIAL PRIMARY KEY,
  vote_id INTEGER REFERENCES votes(id),
  player_id INTEGER REFERENCES players(id),
  player_name VARCHAR(100),
  option_index INTEGER NOT NULL,
  voted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (vote_id, player_id)
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_vote_id INTEGER REFERENCES votes(id);

CREATE TABLE IF NOT EXISTS session_images (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  url VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_events (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  event_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  player_name VARCHAR(100),
  value INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchants (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  name VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_items (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER NOT NULL,
  stock INTEGER DEFAULT -1,
  category VARCHAR(50) DEFAULT 'Divers',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  merchant_id INTEGER REFERENCES merchants(id),
  item_id INTEGER REFERENCES merchant_items(id),
  player_id INTEGER REFERENCES players(id),
  player_name VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  base_price INTEGER NOT NULL,
  final_price INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_merchant_id INTEGER;

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS batch_id UUID;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS doom_clock_title VARCHAR(200);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS doom_clock_end_at TIMESTAMP;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tension_title VARCHAR(200);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tension_steps INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tension_level INTEGER DEFAULT 0;
ALTER TABLE sessions DROP COLUMN IF EXISTS tension_discreet;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tension_direction VARCHAR(20) DEFAULT 'ascending';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tension_vibration BOOLEAN DEFAULT FALSE;
DROP TABLE IF EXISTS kicked_players;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_map_url VARCHAR(500);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS map_fog_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS map_viewport TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS map_fog_strokes TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS map_tokens TEXT;

ALTER TABLE session_images ADD COLUMN IF NOT EXISTS original_name VARCHAR(500);
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'image';

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS combat_round INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timer_label VARCHAR(200);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timer_end_at TIMESTAMP;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lobby_bg_url VARCHAR(500);

DO $$
DECLARE
  r RECORD;
  new_code VARCHAR(10);
  attempts INT;
BEGIN
  FOR r IN SELECT id FROM sessions WHERE length(code) <> 4 OR code !~ '^[0-9]{4}$' LOOP
    attempts := 0;
    LOOP
      new_code := lpad((1000 + floor(random() * 9000))::int::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE code = new_code AND id <> r.id);
      attempts := attempts + 1;
      IF attempts > 200 THEN RAISE EXCEPTION 'Cannot generate unique 4-digit code'; END IF;
    END LOOP;
    UPDATE sessions SET code = new_code WHERE id = r.id;
  END LOOP;
END $$;

-- Demo account flag. Code '0000' is reserved for the demo session (never generated by normal logic).
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;

-- Audio manager: category per audio file
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS audio_category VARCHAR(50) DEFAULT 'ambiance';

-- File size tracking (used for demo storage quota enforcement)
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;

-- Author color for messages (replaces voice style in the UI)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_color VARCHAR(20) DEFAULT '#d4af37';

-- Thumbnail URL for image/map assets (generated server-side after upload)
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500);

-- Puzzle feature: active puzzle for a session
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_puzzle_image_id INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_puzzle_url VARCHAR(500);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_puzzle_seed VARCHAR(100);

-- Faction reputation system
CREATE TABLE IF NOT EXISTS factions (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  min_value INTEGER NOT NULL DEFAULT -5,
  max_value INTEGER NOT NULL DEFAULT 5,
  current_value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- TV label for images (displayed top-left on TV when image is projected)
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS tv_label VARCHAR(200);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_image_label VARCHAR(200);

-- Time scale (slot-based temporal progression with long rest)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timescale_title VARCHAR(200);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timescale_total_hours INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timescale_slot_count INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timescale_rest_slots INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timescale_elapsed_slots INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timescale_rest_taken BOOLEAN DEFAULT FALSE;

-- Player-to-DM secret messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL;

-- Grid-based fog of war: grid config stored per map image, revealed cells per session
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS grid_type VARCHAR(10) DEFAULT 'none';
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS grid_cols INTEGER;
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS grid_rows INTEGER;
ALTER TABLE session_images ADD COLUMN IF NOT EXISTS grid_hex_orientation VARCHAR(10) DEFAULT 'flat';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS map_fog_cells TEXT;
`

async function runMigrations() {
  await ensureDatabase()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(migrations)
    await client.query('COMMIT')
    console.log('Migrations executed successfully.')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    const pos = err.position ? parseInt(err.position) : null
    console.error('Migration failed:', err.message)
    if (pos) console.error('Near SQL:', migrations.slice(Math.max(0, pos - 120), pos + 120))
    throw err
  } finally {
    client.release()
  }
}

module.exports = runMigrations

CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  balance_cents BIGINT NOT NULL DEFAULT 10000 CHECK (balance_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spins (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  bet_cents BIGINT NOT NULL CHECK (bet_cents > 0),
  payout_cents BIGINT NOT NULL DEFAULT 0 CHECK (payout_cents >= 0),
  outcome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spins_player_id_created_at
  ON spins(player_id, created_at DESC);

INSERT INTO players (username, balance_cents)
VALUES ('jogador_demo', 10000)
ON CONFLICT (username) DO NOTHING;

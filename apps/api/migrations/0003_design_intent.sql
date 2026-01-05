-- Design Intent table for storing design system definition
-- Stores tokens, components, baseline exceptions, and tracking preferences
CREATE TABLE IF NOT EXISTS design_intent (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- figma, manual, code
  tokens TEXT NOT NULL DEFAULT '[]', -- JSON array of token definitions
  components TEXT NOT NULL DEFAULT '[]', -- JSON array of component definitions
  baseline_exceptions TEXT NOT NULL DEFAULT '[]', -- JSON array of baseline exceptions
  tracking_categories TEXT NOT NULL DEFAULT '{"colors":true,"typography":true,"spacing":true,"components":true}', -- JSON object
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Index for account lookups
CREATE INDEX IF NOT EXISTS idx_design_intent_account ON design_intent(account_id);

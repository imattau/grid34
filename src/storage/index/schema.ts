export const CREATE_SCHEMA_SQL = `
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_id TEXT,
  order_index INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id),
  parent_block_id TEXT,
  type TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE db_properties (
  database_block_id TEXT NOT NULL REFERENCES blocks(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  PRIMARY KEY (database_block_id, name)
);

CREATE TABLE db_rows (
  id TEXT PRIMARY KEY,
  database_block_id TEXT NOT NULL REFERENCES blocks(id),
  properties_json TEXT NOT NULL
);

CREATE TABLE sync_state (
  workspace_id TEXT PRIMARY KEY,
  last_event_id TEXT,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX idx_blocks_page_id ON blocks(page_id);
CREATE INDEX idx_db_rows_database_block_id ON db_rows(database_block_id);
`

/**
 * Database migrations system
 */

import { getDatabase } from "../connection/index.js";
import { SCHEMA } from "../schema/index.js";
import type { Migration } from "../types/index.js";

export interface MigrationDefinition {
  name: string;
  up: string;
  down?: string;
}

/**
 * Initial migration to create all base tables
 */
const INITIAL_MIGRATION: MigrationDefinition = {
  name: "001_initial_schema",
  up: Object.values(SCHEMA).join("\n"),
  down: `
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS users;
  `,
};

/**
 * Migration 002: Expand messages table for rich message types
 * Adds tool_call_id, tool_name, is_error, metadata columns
 * and expands the role CHECK constraint to include tool, snip, summary
 */
const EXPAND_MESSAGES_MIGRATION: MigrationDefinition = {
  name: "002_expand_messages",
  up: `
    ALTER TABLE messages ADD COLUMN tool_call_id TEXT;
    ALTER TABLE messages ADD COLUMN tool_name TEXT;
    ALTER TABLE messages ADD COLUMN is_error INTEGER DEFAULT 0;
    ALTER TABLE messages ADD COLUMN metadata TEXT;

    -- SQLite doesn't support ALTER CHECK directly, so we recreate the table
    -- First create a new table with the updated constraint
    CREATE TABLE messages_new (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool', 'snip', 'summary')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      is_error INTEGER DEFAULT 0,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Copy existing data
    INSERT INTO messages_new (id, conversation_id, role, content, tool_calls, created_at)
    SELECT id, conversation_id, role, content, tool_calls, created_at FROM messages;

    -- Swap tables
    DROP TABLE messages;
    ALTER TABLE messages_new RENAME TO messages;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `,
};

/**
 * All migrations in order
 */
const MIGRATIONS: MigrationDefinition[] = [INITIAL_MIGRATION, EXPAND_MESSAGES_MIGRATION];

/**
 * Get list of applied migrations
 */
export function getAppliedMigrations(): Migration[] {
  const db = getDatabase();

  // Ensure migrations table exists
  db.exec(SCHEMA.migrations);

  const stmt = db.prepare("SELECT id, name, applied_at FROM migrations ORDER BY id");
  return stmt.all() as Migration[];
}

/**
 * Check if a migration has been applied
 */
export function isMigrationApplied(name: string): boolean {
  const db = getDatabase();

  // Ensure migrations table exists
  db.exec(SCHEMA.migrations);

  const stmt = db.prepare("SELECT 1 FROM migrations WHERE name = ?");
  const result = stmt.get(name);
  return result !== null;
}

/**
 * Apply a single migration
 */
export function applyMigration(migration: MigrationDefinition): void {
  const db = getDatabase();

  db.transaction(() => {
    // Execute migration SQL
    db.exec(migration.up);

    // Record migration
    const stmt = db.prepare("INSERT INTO migrations (name) VALUES (?)");
    stmt.run(migration.name);
  })();
}

/**
 * Run all pending migrations
 */
export function runMigrations(): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of MIGRATIONS) {
    if (isMigrationApplied(migration.name)) {
      skipped.push(migration.name);
    } else {
      applyMigration(migration);
      applied.push(migration.name);
    }
  }

  return { applied, skipped };
}

/**
 * Get the current migration version
 */
export function getCurrentMigrationVersion(): string | null {
  const migrations = getAppliedMigrations();
  if (migrations.length === 0) {
    return null;
  }
  return migrations[migrations.length - 1].name;
}

export { MIGRATIONS };

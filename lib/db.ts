/**
 * Neon (Postgres) connection for server-side run-state.
 *
 * Uses the HTTP driver — one round-trip per query, no pooling to manage — which
 * suits serverless route handlers. The connection string MUST stay server-side
 * (it grants full DB access); only import this from route handlers / server
 * modules, never from a "use client" component.
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | undefined;

export function db(): NeonQueryFunction<false, false> {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (Neon connection string).");
  }
  sql = neon(url);
  return sql;
}

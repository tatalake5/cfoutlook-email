// D1 database helper functions

// D1 hard limit: a single statement may bind at most 100 parameters.
// Any dynamic IN (...) list must be chunked to stay under this.
export const D1_MAX_BOUND_PARAMS = 100;

// Split an array into chunks of at most `size` elements
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// Execute multiple statements in one atomic D1 batch (single round trip;
// D1 rolls the whole batch back if any statement fails)
export async function batchRun<T = Record<string, unknown>>(
  db: D1Database,
  statements: { sql: string; params?: unknown[] }[]
): Promise<D1Result<T>[]> {
  if (statements.length === 0) return [];
  return db.batch<T>(statements.map((s) => db.prepare(s.sql).bind(...(s.params ?? []))));
}

// Execute a query and return all rows
export async function query<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.all<T>();
  return result.results;
}

// Execute a query and return the first row
export async function first<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql).bind(...params);
  return stmt.first<T>();
}

// Execute a statement (INSERT/UPDATE/DELETE) and return metadata
export async function run(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  const stmt = db.prepare(sql).bind(...params);
  return stmt.run();
}

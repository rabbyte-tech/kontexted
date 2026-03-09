/**
 * Queue management for pending file changes
 * @packageDocumentation
 */

import Database from "better-sqlite3";
import type { PendingChange, FileChangeEvent } from "./types";

/**
 * Queue for managing pending file changes to be synced
 */
export class Queue {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('create', 'update', 'delete')),
        content TEXT,
        detected_at TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT
      )
    `);
  }

  /**
   * Add a new pending change to the queue
   * @param event - The file change event
   * @param content - The file content (null for delete operations)
   */
  add(event: FileChangeEvent, content: string | null): void {
    const stmt = this.db.prepare(`
      INSERT INTO pending_changes (file_path, type, content, detected_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      event.relativePath,
      event.type,
      content,
      new Date().toISOString()
    );
  }

  /**
   * Get all pending changes from the queue
   * @returns Array of pending changes ordered by detection time
   */
  getAll(): PendingChange[] {
    return this.db.prepare(`
      SELECT
        id,
        file_path AS filePath,
        type,
        content,
        detected_at AS detectedAt,
        retry_count AS retryCount,
        last_error AS lastError
      FROM pending_changes
      ORDER BY detected_at ASC
    `).all() as PendingChange[];
  }

  /**
   * Remove a pending change from the queue by ID
   * @param id - The ID of the pending change to remove
   */
  remove(id: number): void {
    this.db.prepare(`DELETE FROM pending_changes WHERE id = ?`).run(id);
  }

  /**
   * Increment the retry count for a pending change and record the error
   * @param id - The ID of the pending change
   * @param error - The error message to record
   */
  incrementRetry(id: number, error: string): void {
    this.db.prepare(
      `UPDATE pending_changes SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`
    ).run(error, id);
  }

  /**
   * Get the count of pending changes in the queue
   * @returns Number of pending changes
   */
  getCount(): number {
    const result = this.db.prepare(
      `SELECT COUNT(*) as count FROM pending_changes`
    ).get() as { count: number } | undefined;
    return result?.count ?? 0;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Message repository for managing conversation messages
 */

import { BaseRepository } from "./base.js";
import type { Message, CreateMessageInput } from "../types/index.js";

export class MessageRepository extends BaseRepository<Message> {
  protected tableName = "messages";

  create(input: CreateMessageInput): Message {
    const id = this.generateId();
    const now = this.now();
    const toolCalls = input.tool_calls ? JSON.stringify(input.tool_calls) : null;
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, tool_name, is_error, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.conversation_id,
      input.role,
      input.content,
      toolCalls,
      input.tool_call_id ?? null,
      input.tool_name ?? null,
      input.is_error ? 1 : 0,
      metadata,
      now,
    );

    return this.findById(id)!;
  }

  findByConversationId(conversationId: string, limit?: number): Message[] {
    let sql = "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC";
    const params: (string | number)[] = [conversationId];

    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Message[];
  }

  getLastMessages(conversationId: string, count: number): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM (
        SELECT * FROM messages 
        WHERE conversation_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      ) ORDER BY created_at ASC
    `);

    return stmt.all(conversationId, count) as Message[];
  }

  countByConversationId(conversationId: string): number {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?"
    );
    const result = stmt.get(conversationId) as { count: number };
    return result.count;
  }

  deleteByConversationId(conversationId: string): number {
    const stmt = this.db.prepare("DELETE FROM messages WHERE conversation_id = ?");
    const result = stmt.run(conversationId);
    return result.changes;
  }

  searchByContent(query: string, limit: number = 50): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE content LIKE ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);

    return stmt.all(`%${query}%`, limit) as Message[];
  }
}

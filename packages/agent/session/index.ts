/**
 * SessionManager — Manages users, sessions, conversations, and message queries.
 *
 * This is the single place where the app's session/conversation lifecycle
 * interacts with the database. The app layer (Orchestrator) delegates all
 * DB reads and writes through this manager rather than touching the
 * DatabaseClient directly.
 */

import type {
  DatabaseClient,
  User,
  Session,
  Conversation,
  Message,
} from "@openkrow/database";

export class SessionManager {
  private db: DatabaseClient;
  private currentUser: User | null = null;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /** Get the underlying DatabaseClient (for passing to Agent, ContextManager, etc.) */
  get database(): DatabaseClient {
    return this.db;
  }

  // -----------------------------------------------------------------------
  // User
  // -----------------------------------------------------------------------

  getUser(): User {
    if (!this.currentUser) {
      this.currentUser = this.db.users.getOrCreateDefault();
    }
    return this.currentUser;
  }

  // -----------------------------------------------------------------------
  // Sessions
  // -----------------------------------------------------------------------

  createSession(workspacePath: string): Session {
    const user = this.getUser();
    return this.db.sessions.create({
      user_id: user.id,
      workspace_path: workspacePath,
    });
  }

  getSession(sessionId: string): Session | null {
    return this.db.sessions.findById(sessionId);
  }

  getOrCreateSession(workspacePath: string): Session {
    const user = this.getUser();
    const activeSession = this.db.sessions.getActiveSession(user.id);

    if (activeSession && activeSession.workspace_path === workspacePath) {
      return activeSession;
    }

    return this.createSession(workspacePath);
  }

  endSession(sessionId: string): void {
    this.db.sessions.endSession(sessionId);
  }

  // -----------------------------------------------------------------------
  // Conversations
  // -----------------------------------------------------------------------

  createConversation(sessionId: string, title?: string): Conversation {
    return this.db.conversations.create({ session_id: sessionId, title });
  }

  getConversation(conversationId: string): Conversation | null {
    return this.db.conversations.findById(conversationId);
  }

  getOrCreateConversation(sessionId: string): Conversation {
    const conversations = this.db.conversations.findBySessionId(sessionId, 1);
    if (conversations.length > 0) return conversations[0]!;
    return this.createConversation(sessionId);
  }

  getRecentConversations(limit?: number): Conversation[] {
    return this.db.conversations.getRecent(limit);
  }

  /** Touch the conversation's updated_at timestamp. */
  touchConversation(conversationId: string): void {
    this.db.conversations.update(conversationId, {});
  }

  // -----------------------------------------------------------------------
  // Messages
  // -----------------------------------------------------------------------

  getConversationHistory(conversationId: string, limit?: number): Message[] {
    return this.db.messages.findByConversationId(conversationId, limit);
  }

  getLastMessages(conversationId: string, count: number): Message[] {
    return this.db.messages.getLastMessages(conversationId, count);
  }
}

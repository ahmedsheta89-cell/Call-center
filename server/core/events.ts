/**
 * @file server/core/events.ts
 * In-process Asynchronous Event Bus for Decoupled Modules
 */

type EventHandler<T = unknown> = (payload: T) => Promise<void> | void;

export interface SSEBroadcastEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

export class EventBus {
  private static handlers: Map<string, EventHandler[]> = new Map();
  private static sseClients: Set<(event: SSEBroadcastEvent) => void> = new Set();

  public static subscribe<T = unknown>(eventName: string, handler: EventHandler<T>): void {
    const current = this.handlers.get(eventName) || [];
    current.push(handler as EventHandler);
    this.handlers.set(eventName, current);
  }

  public static addSseClient(listener: (event: SSEBroadcastEvent) => void): () => void {
    this.sseClients.add(listener);
    return () => {
      this.sseClients.delete(listener);
    };
  }

  public static getSseClientCount(): number {
    return this.sseClients.size;
  }

  public static async publish<T = unknown>(eventName: string, payload: T): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // Broadcast to all active SSE subscribers
    const broadcastPayload: SSEBroadcastEvent = {
      type: eventName,
      data: payload,
      timestamp,
    };
    
    this.sseClients.forEach((sendToClient) => {
      try {
        sendToClient(broadcastPayload);
      } catch (err) {
        console.error('[EventBus SSE Client Broadcast Error]:', err);
      }
    });

    const current = this.handlers.get(eventName) || [];
    await Promise.allSettled(
      current.map(async (handler) => {
        try {
          await handler(payload);
        } catch (err) {
          console.error(`[EventBus Error] in handler for event "${eventName}":`, err);
        }
      })
    );
  }
}

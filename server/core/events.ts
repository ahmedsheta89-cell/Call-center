/**
 * @file server/core/events.ts
 * In-process Asynchronous Event Bus for Decoupled Modules
 */

type EventHandler<T = unknown> = (payload: T) => Promise<void> | void;

export class EventBus {
  private static handlers: Map<string, EventHandler[]> = new Map();

  public static subscribe<T = unknown>(eventName: string, handler: EventHandler<T>): void {
    const current = this.handlers.get(eventName) || [];
    current.push(handler as EventHandler);
    this.handlers.set(eventName, current);
  }

  public static async publish<T = unknown>(eventName: string, payload: T): Promise<void> {
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

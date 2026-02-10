type WorkspaceEvent = {
  workspaceId: number;
  type: "folder.created" | "note.created" | "folder.updated" | "note.updated" | "ready";
  data: unknown;
};

type EventHandler = (event: WorkspaceEvent) => void;

class WorkspaceEventHub {
  private listeners = new Map<number, Set<EventHandler>>();

  subscribe(workspaceId: number, handler: EventHandler) {
    const bucket = this.listeners.get(workspaceId) ?? new Set<EventHandler>();
    bucket.add(handler);
    this.listeners.set(workspaceId, bucket);

    return () => {
      const current = this.listeners.get(workspaceId);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this.listeners.delete(workspaceId);
      }
    };
  }

  publish(event: WorkspaceEvent) {
    const bucket = this.listeners.get(event.workspaceId);
    if (!bucket) {
      return;
    }
    bucket.forEach((handler) => handler(event));
  }
}

const globalForHub = globalThis as typeof globalThis & {
  workspaceEventHub?: WorkspaceEventHub;
};

export const workspaceEventHub = globalForHub.workspaceEventHub ?? new WorkspaceEventHub();

if (!globalForHub.workspaceEventHub) {
  globalForHub.workspaceEventHub = workspaceEventHub;
}

export type { WorkspaceEvent };

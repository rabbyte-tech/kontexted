import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { workspaceQueryKeys, noteQueryKeys } from "@/lib/query/query-keys"

/**
 * Workspace SSE invalidation bridge
 *
 * Subscribes to workspace events via SSE and triggers React Query cache invalidation.
 * SSE events should not directly update component state; they only invalidate queries
 * so React Query refetches fresh data from the server.
 */

/**
 * Event data types extracted from workspace events
 */
interface NoteEventData {
  id: number
  publicId: string
  workspaceId: number
}

interface FolderEventData {
  id: number
  publicId: string
  workspaceId: number
}

type EventData = NoteEventData | FolderEventData | Record<string, unknown>

/**
 * Hook to subscribe to workspace SSE events and invalidate queries
 *
 * Should be used once at the workspace layout level to subscribe to events
 * for the current workspace. The hook handles subscription cleanup automatically.
 *
 * @param workspaceSlug - The workspace slug to subscribe to events for
 */
export function useWorkspaceSSE(workspaceSlug: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!workspaceSlug) {
      return
    }

    /**
     * Handle incoming SSE events
     */
    const handleEvent = (event: MessageEvent) => {
      try {
        // EventSource sends events with 'event' type being the event name
        // The data is parsed from the 'data' field
        const eventData: EventData = JSON.parse(event.data)
        const eventType = event.type

        // Invalidate appropriate query keys based on event type
        switch (eventType) {
          case "note.created":
          case "note.updated":
          case "note.deleted":
          case "note.moved":
          case "folder.created":
          case "folder.updated":
          case "folder.deleted":
          case "folder.moved":
            // All workspace tree changes invalidate the tree
            queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.tree(workspaceSlug),
            })

            // For note events, also invalidate the specific note if we can identify it
            if (
              (eventType === "note.updated" ||
                eventType === "note.deleted" ||
                eventType === "note.moved") &&
              "publicId" in eventData &&
              typeof eventData.publicId === "string"
            ) {
              queryClient.invalidateQueries({
                queryKey: noteQueryKeys.detail(workspaceSlug, eventData.publicId),
              })
            }

            // For note history, invalidate when note is updated
            if (
              eventType === "note.updated" &&
              "publicId" in eventData &&
              typeof eventData.publicId === "string"
            ) {
              queryClient.invalidateQueries({
                queryKey: noteQueryKeys.history(workspaceSlug, eventData.publicId),
              })
            }

            break

          case "ready":
            // Initial connection established - no cache action needed
            break

          default:
            // Log unknown events for debugging (but don't fail)
            console.debug("Unknown SSE event type:", eventType, eventData)
        }
      } catch (error) {
        console.warn("Failed to parse SSE event:", error)
      }
    }

    // Subscribe to workspace events and get cleanup function
    const { cleanup } = apiClient.subscribeToWorkspaceEvents(workspaceSlug, handleEvent)

    // Cleanup function to remove listeners and close the EventSource
    return cleanup
  }, [workspaceSlug, queryClient])
}

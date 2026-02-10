import type { TokenPayload } from "./auth";
import { clearRoomState } from "./checkpoints";
import { removeRoom } from "./y-websocket-server";

const roomConnections = new Map<string, number>();

export const resolveRoomName = (payload: TokenPayload) =>
  `${payload.workspaceId}/${payload.notePublicId}`;

export const releaseRoom = (roomName: string) => {
  const count = roomConnections.get(roomName);
  if (!count) {
    return;
  }

  if (count <= 1) {
    console.log(`[collab] Client disconnected from ${roomName}: 0 client(s) (starting 30s cleanup timer)`);
    setTimeout(() => {
      const stillConnected = roomConnections.get(roomName) ?? 0;
      if (stillConnected === 0) {
        roomConnections.delete(roomName);
        clearRoomState(roomName);
        removeRoom(roomName);
        console.log(`[collab] Room destroyed after grace period: ${roomName}`);
      }
    }, 30000);

    roomConnections.set(roomName, 0);
    return;
  }

  roomConnections.set(roomName, count - 1);
  console.log(`[collab] Client disconnected from ${roomName}: ${count - 1} client(s)`);
};

export const reconnectToRoom = (roomName: string): boolean => {
  const count = roomConnections.get(roomName);

  if (count === undefined) {
    roomConnections.set(roomName, 1);
    console.log(`[collab] New room ${roomName}: 1 client(s)`);
    return false;
  }

  if (count === 0) {
    roomConnections.set(roomName, 1);
    console.log(`[collab] Client reconnected within grace period to ${roomName}: 1 client(s)`);
    return true;
  }

  if (count > 0) {
    roomConnections.set(roomName, count + 1);
    console.log(`[collab] Client connected to existing room ${roomName}: ${count + 1} client(s)`);
    return true;
  }

  return false;
};

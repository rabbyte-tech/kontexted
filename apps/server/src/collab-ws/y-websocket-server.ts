import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'

import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as map from 'lib0/map'

const messageSync = 0
const messageAwareness = 1

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1
const wsReadyStateClosing = 2
const wsReadyStateClosed = 3

export class YjsRoom extends Y.Doc {
  name: string
  conns: Map<BunWebSocketAdapter, Set<number>>
  awareness: awarenessProtocol.Awareness
  userId: string | null = null
  activityHandler: ((userId: string) => void) | null = null
  yText: Y.Text

  constructor (name: string) {
    super({ gc: false })
    this.name = name
    this.conns = new Map()
    this.awareness = new awarenessProtocol.Awareness(this)
    this.awareness.setLocalState(null)
    this.yText = this.getText("content")

    const awarenessChangeHandler = (
      changes: { added: number[], updated: number[], removed: number[] },
      conn: BunWebSocketAdapter | null
    ) => {
      const changedClients = [...changes.added, ...changes.updated, ...changes.removed]
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn)
        if (connControlledIDs !== undefined) {
          changes.added.forEach((clientID) => connControlledIDs.add(clientID))
          changes.removed.forEach((clientID) => connControlledIDs.delete(clientID))
        }
      }

      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageAwareness)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients))
      const buff = encoding.toUint8Array(encoder)
      this.conns.forEach((_, c) => {
        send(this, c, buff)
      })
    }

    this.awareness.on('update', awarenessChangeHandler)

    this.on('update', (update, origin) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageSync)
      syncProtocol.writeUpdate(encoder, update)
      const message = encoding.toUint8Array(encoder)
      this.conns.forEach((_, conn) => {
        if (origin !== conn) {
          send(this, conn, message)
        }
      })
    })
  }
}

const rooms = new Map<string, YjsRoom>()

export const getRoom = (docname: string): YjsRoom => {
  let room = rooms.get(docname)
  if (room === undefined) {
    room = new YjsRoom(docname)
    rooms.set(docname, room)
  }
  return room
}

export const removeRoom = (docname: string) => {
  const room = rooms.get(docname)
  if (room !== undefined) {
    rooms.delete(docname)
    room.destroy()
  }
}

export interface BunWebSocketAdapter {
  binaryType: 'nodebuffer' | 'arraybuffer' | 'fragments'
  readyState: number
  send(data: Uint8Array | ArrayBuffer, callback?: (error?: unknown) => void): void
  close(code?: number, reason?: string): void
  on(event: 'message' | 'close' | 'error', handler: (data?: unknown) => void): void
  emit(event: 'message' | 'close' | 'error', data?: unknown): void
}

const send = (doc: YjsRoom, conn: BunWebSocketAdapter, m: Uint8Array) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn)
    return
  }
  try {
    conn.send(m, (err) => { if (err != null) closeConn(doc, conn) })
  } catch (e) {
    closeConn(doc, conn)
  }
}

const closeConn = (doc: YjsRoom, conn: BunWebSocketAdapter) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn)
    doc.conns.delete(conn)
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds || []), null)
  }
  conn.close()
}

export const setupWSConnection = (conn: BunWebSocketAdapter, req: Request, { docName }: { docName?: string } = {}) => {
  conn.binaryType = 'arraybuffer'

  const finalDocName = docName || ''

  const doc = getRoom(finalDocName)
  doc.conns.set(conn, new Set())

  conn.on('message', (data) => {
    let typedData: Uint8Array

    if (data instanceof Uint8Array) {
      typedData = data
    } else if (data instanceof ArrayBuffer) {
      typedData = new Uint8Array(data)
    } else if (typeof data === 'string') {
      typedData = new TextEncoder().encode(data)
    } else {
      console.error('[y-websocket-server] Invalid message data type:', typeof data, data)
      return
    }

    try {
      const encoder = encoding.createEncoder()
      const decoder = decoding.createDecoder(typedData)
      const messageType = decoding.readVarUint(decoder)

      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync)
          syncProtocol.readSyncMessage(decoder, encoder, doc, conn)

          if (encoding.length(encoder) > 1) {
            send(doc, conn, encoding.toUint8Array(encoder))
          }
          break
        case messageAwareness:
          awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn)
          break
      }
    } catch (err) {
      console.error('[y-websocket-server] Error processing message:', err)
    }
  })

  conn.on('close', () => {
    closeConn(doc, conn)
  })

  conn.on('error', (err) => {
    console.error('WebSocket error:', err)
    closeConn(doc, conn)
  })

  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, doc)
  send(doc, conn, encoding.toUint8Array(encoder))

  const awarenessStates = doc.awareness.getStates()
  if (awarenessStates.size > 0) {
    const encoder2 = encoding.createEncoder()
    encoding.writeVarUint(encoder2, messageAwareness)
    encoding.writeVarUint8Array(encoder2, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())))
    send(doc, conn, encoding.toUint8Array(encoder2))
  }

  console.log(`[y-websocket-server] Connection setup complete for ${finalDocName}`)

}

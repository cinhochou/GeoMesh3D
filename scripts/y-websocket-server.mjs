import { WebSocket, WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const messageSync = 0
const messageAwareness = 1
const messageQueryAwareness = 3

const host = process.env.HOST ?? '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '1234', 10)

/**
 * @typedef {import('ws').WebSocket & { clientIds: Set<number> }} RoomClient
 */

/**
 * @typedef {{
 *   name: string
 *   doc: Y.Doc
 *   awareness: awarenessProtocol.Awareness
 *   clients: Set<RoomClient>
 *   closed: boolean
 * }} RoomState
 */

/** @type {Map<string, RoomState>} */
const rooms = new Map()

const toUint8Array = (data) => {
  if (data instanceof Uint8Array) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return new Uint8Array(data)
}

const broadcast = (room, payload, exclude = null) => {
  room.clients.forEach((client) => {
    if (client === exclude || client.readyState !== WebSocket.OPEN) return
    client.send(payload)
  })
}

const encodeMessage = (messageType, writePayload) => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageType)
  writePayload(encoder)
  return encoding.toUint8Array(encoder)
}

const closeRoom = (room) => {
  if (room.closed) return

  room.closed = true

  rooms.delete(room.name)
  room.awareness.destroy()
  room.doc.destroy()
}

const getRoom = (roomName) => {
  const existing = rooms.get(roomName)
  if (existing) return existing

  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  awareness.setLocalState(null)

  const room = {
    name: roomName,
    doc,
    awareness,
    clients: new Set(),
    closed: false,
  }

  doc.on('update', (update, origin) => {
    const payload = encodeMessage(messageSync, (encoder) => {
      syncProtocol.writeUpdate(encoder, update)
    })
    broadcast(room, payload, origin)
  })

  rooms.set(roomName, room)
  return room
}

const getRoomNameFromRequest = (requestUrl) => {
  const url = new URL(requestUrl ?? '/', `ws://${host}:${port}`)
  const roomName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  return roomName || 'default-room'
}

const readAwarenessClients = (update) => {
  const decoder = decoding.createDecoder(update)
  const count = decoding.readVarUint(decoder)
  /** @type {Array<{ clientId: number; state: unknown }>} */
  const entries = []

  for (let index = 0; index < count; index += 1) {
    const clientId = decoding.readVarUint(decoder)
    decoding.readVarUint(decoder)
    entries.push({
      clientId,
      state: JSON.parse(decoding.readVarString(decoder)),
    })
  }

  return entries
}

const sendCurrentAwareness = (room, client) => {
  const clients = Array.from(room.awareness.getStates().keys())
  const payload = encodeMessage(messageAwareness, (encoder) => {
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, clients),
    )
  })
  client.send(payload)
}

const cleanupClient = (room, client) => {
  room.clients.delete(client)

  if (client.clientIds.size > 0) {
    const removedClients = Array.from(client.clientIds)
    client.clientIds.clear()
    awarenessProtocol.removeAwarenessStates(room.awareness, removedClients, client)

    const payload = encodeMessage(messageAwareness, (encoder) => {
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, removedClients),
      )
    })
    broadcast(room, payload, client)
  }

  if (room.clients.size === 0) {
    closeRoom(room)
  }
}

const server = new WebSocketServer({ host, port })

server.on('connection', (socket, request) => {
  /** @type {RoomClient} */
  const client = Object.assign(socket, { clientIds: new Set() })
  const roomName = getRoomNameFromRequest(request.url)
  const room = getRoom(roomName)
  room.clients.add(client)

  console.log(`[y-websocket] client joined room "${roomName}" (${room.clients.size} online)`)
  sendCurrentAwareness(room, client)

  client.on('message', (data) => {
    const payload = toUint8Array(data)
    const decoder = decoding.createDecoder(payload)
    const messageType = decoding.readVarUint(decoder)

    switch (messageType) {
      case messageSync: {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, room.doc, client)

        if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
          syncProtocol.writeSyncStep1(encoder, room.doc)
        }

        const reply = encoding.toUint8Array(encoder)
        if (reply.byteLength > 1) {
          client.send(reply)
        }
        break
      }
      case messageAwareness: {
        const update = decoding.readVarUint8Array(decoder)
        const entries = readAwarenessClients(update)

        entries.forEach(({ clientId, state }) => {
          if (state === null) client.clientIds.delete(clientId)
          else client.clientIds.add(clientId)
        })

        awarenessProtocol.applyAwarenessUpdate(room.awareness, update, client)

        const awarenessPayload = encodeMessage(messageAwareness, (encoder) => {
          encoding.writeVarUint8Array(encoder, update)
        })
        broadcast(room, awarenessPayload, client)
        break
      }
      case messageQueryAwareness:
        sendCurrentAwareness(room, client)
        break
      default:
        console.warn(`[y-websocket] unsupported message type ${messageType} in room "${roomName}"`)
    }
  })

  client.on('close', () => {
    cleanupClient(room, client)
    console.log(`[y-websocket] client left room "${roomName}" (${room.clients.size} online)`)
  })

  client.on('error', (error) => {
    console.error(`[y-websocket] socket error in room "${roomName}"`, error)
  })
})

server.on('listening', () => {
  console.log(`[y-websocket] listening on ws://${host}:${port}`)
})

const shutdown = () => {
  server.clients.forEach((client) => {
    client.close()
  })
  server.close(() => {
    rooms.forEach((room) => {
      closeRoom(room)
    })
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

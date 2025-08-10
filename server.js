const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
console.log('Server running on ws://localhost:8080');

let rooms = {}; // roomId => { players: [ws, ws], state: {game state}, turn: 'player1' or 'player2' }

function createNewGameState() {
  // Simplified initial state for demo
  return {
    deck: [],
    discard: [],
    players: {
      player1: { life: 20, hand: [], block: 0, riposte: false, energy: 3, maxEnergy: 3 },
      player2: { life: 20, hand: [], block: 0, riposte: false, energy: 3, maxEnergy: 3 }
    },
    turn: 'player1',
    turnNumber: 1,
    timer: 60,
  };
}

function randomRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if(data.type === 'join') {
      if(data.roomId && rooms[data.roomId]) {
        if(rooms[data.roomId].players.length < 2) {
          ws.roomId = data.roomId;
          ws.playerId = 'player2';
          rooms[data.roomId].players.push(ws);

          ws.send(JSON.stringify({ type: 'joined', playerId: ws.playerId, roomId: ws.roomId }));
          broadcastRoom(ws.roomId, { type: 'startGame', message: 'Game started!', state: rooms[ws.roomId].state });
          console.log(`Player2 joined room ${ws.roomId}`);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Room full' }));
        }
      } else {
        const newRoomId = randomRoomId();
        ws.roomId = newRoomId;
        ws.playerId = 'player1';
        rooms[newRoomId] = {
          players: [ws],
          state: createNewGameState()
        };

        ws.send(JSON.stringify({ type: 'joined', playerId: ws.playerId, roomId: newRoomId }));
        console.log(`Player1 created room ${newRoomId}`);
      }
    } else if(data.type === 'playCard') {
      const room = rooms[ws.roomId];
      if(!room) return;
      if(room.state.turn !== ws.playerId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
        return;
      }

      // Broadcast playCard to both players
      broadcastRoom(ws.roomId, {
        type: 'playCard',
        playerId: ws.playerId,
        cardId: data.cardId,
        cardIndex: data.cardIndex
      });

      // Switch turn (simple demo)
      room.state.turn = room.state.turn === 'player1' ? 'player2' : 'player1';
      broadcastRoom(ws.roomId, { type: 'turnChange', turn: room.state.turn });
    } else if(data.type === 'endTurn') {
      const room = rooms[ws.roomId];
      if(!room) return;
      if(room.state.turn !== ws.playerId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
        return;
      }
      room.state.turn = room.state.turn === 'player1' ? 'player2' : 'player1';
      broadcastRoom(ws.roomId, { type: 'turnChange', turn: room.state.turn });
    }
  });

  ws.on('close', () => {
    if(ws.roomId && rooms[ws.roomId]) {
      rooms[ws.roomId].players = rooms[ws.roomId].players.filter(p => p !== ws);
      if(rooms[ws.roomId].players.length === 0) {
        delete rooms[ws.roomId];
        console.log(`Room ${ws.roomId} deleted due to no players`);
      }
    }
  });
});

function broadcastRoom(roomId, message) {
  if(!rooms[roomId]) return;
  rooms[roomId].players.forEach(player => {
    player.send(JSON.stringify(message));
  });
}

setInterval(() => {
  wss.clients.forEach(ws => {
    if(!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

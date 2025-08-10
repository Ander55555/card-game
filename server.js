const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let waitingPlayer = null;  // Player waiting for a match
let rooms = new Map();     // Map roomId => { players: [ws1, ws2], ids: [id1, id2] }

function send(ws, data) {
  ws.send(JSON.stringify(data));
}

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    if(data.type === 'join'){
      if(waitingPlayer === null){
        waitingPlayer = ws;
        ws.playerId = 'player1';
        send(ws, { type: 'joined', playerId: 'player1', roomId: 'waiting' });
        console.log('Player1 waiting for opponent...');
      } else {
        // Create room
        const roomId = 'room_' + Math.floor(Math.random() * 1000000);
        const player1 = waitingPlayer;
        const player2 = ws;

        player1.playerId = 'player1';
        player2.playerId = 'player2';

        rooms.set(roomId, {
          players: [player1, player2],
          ids: ['player1', 'player2'],
          turn: 'player1'
        });

        player1.roomId = roomId;
        player2.roomId = roomId;

        send(player1, { type: 'joined', playerId: 'player1', roomId });
        send(player2, { type: 'joined', playerId: 'player2', roomId });

        // Start game
        rooms.get(roomId).players.forEach((p) => {
          send(p, { type: 'startGame', message: 'Game started! You are ' + p.playerId });
        });

        // Notify player1's turn
        send(player1, { type: 'turnChange', turn: 'player1' });
        send(player2, { type: 'turnChange', turn: 'player1' });

        waitingPlayer = null;
        console.log(`Room ${roomId} started.`);
      }
    }
    else if(data.type === 'playCard'){
      const roomId = ws.roomId;
      if(!roomId || !rooms.has(roomId)){
        send(ws, {type:'error', message:'Not in a room'});
        return;
      }
      const room = rooms.get(roomId);
      const opponent = room.players.find(p => p !== ws);

      // Broadcast to opponent
      send(opponent, {
        type: 'playCard',
        playerId: ws.playerId,
        cardId: data.cardId,
        cardIndex: data.cardIndex
      });
    }
    else if(data.type === 'endTurn'){
      const roomId = ws.roomId;
      if(!roomId || !rooms.has(roomId)){
        send(ws, {type:'error', message:'Not in a room'});
        return;
      }
      const room = rooms.get(roomId);

      // Switch turn
      room.turn = (room.turn === 'player1') ? 'player2' : 'player1';

      // Notify both players whose turn it is
      room.players.forEach(p => {
        send(p, { type: 'turnChange', turn: room.turn });
      });
    }
  });

  ws.on('close', () => {
    console.log('Connection closed');
    // Remove player from waiting or rooms
    if(waitingPlayer === ws) waitingPlayer = null;

    for(let [roomId, room] of rooms){
      if(room.players.includes(ws)){
        // Notify other player about disconnect
        const other = room.players.find(p => p !== ws);
        if(other && other.readyState === WebSocket.OPEN){
          send(other, {type:'error', message:'Opponent disconnected.'});
          other.close();
        }
        rooms.delete(roomId);
        console.log(`Room ${roomId} closed due to disconnect.`);
        break;
      }
    }
  });
});

// Ping to keep connections alive
setInterval(() => {
  wss.clients.forEach(ws => {
    if(!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping(null, false, true);
  });
}, 30000);

console.log('WebSocket server running on ws://localhost:8080');

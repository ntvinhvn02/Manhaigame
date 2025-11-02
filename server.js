const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};
const memeFacts = [
  "Ma nhai không ngủ, chỉ giả chết!",
  "Ma nhai thích ăn... não người chơi Uno!",
  "Uno = 1, nhưng ma nhai có 13 lá +2!",
  "Bạn vừa bị +4? Đó là lời nguyền của ma nhai!",
  "Ma nhai biết bạn đang giữ lá Wild!",
  "Skip = ma nhai vừa lướt qua bạn!",
  "Reverse = ma nhai đang quay đầu lại cười!",
  "Draw 2 = Ma nhai vừa cắn bạn 2 phát!",
  "Wild = Ma nhai thay đổi màu hồn ma!",
  "Ma nhai thắng khi bạn hô UNO muộn!"
];

function createDeck() {
  const colors = ['red', 'green', 'blue', 'yellow'];
  const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']; // FIX: Đã thêm số '0'
  const actions = ['CONGHAI', 'CAM'];
  const deck = [];

  colors.forEach(color => {
    // Số: 1 lá '0', 2 lá mỗi số từ '1' đến '10'
    numbers.forEach(num => {
      deck.push({ color, type: num, value: num });
      if (num !== '0') {
        deck.push({ color, type: num, value: num });
      }
    });
    // Hành động: 2 lá 'CONGHAI' và 'CAM' mỗi màu
    actions.forEach(action => {
      deck.push({ color, type: action, value: action });
      deck.push({ color, type: action, value: action });
    });
  });

  // Thẻ đặc biệt (Wild cards)
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', type: 'DOIMAU', value: 'DOIMAU' });
    deck.push({ color: 'wild', type: 'CONGBON', value: 'CONGBON' });
  }

  return shuffle(deck);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// === TÁCH HÀM TIMER RA NGOÀI ĐỂ DỄ QUẢN LÝ ===
function startTurnTimer(room) {
  // 1. Xóa bất kỳ đồng hồ cũ nào đang chạy
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
  }

  // 2. Lấy người chơi hiện tại
  if (!room.players || room.players.length === 0 || !room.players[room.currentTurn]) {
      console.log("Timer stop: No players in room or current turn is invalid.");
      return; 
  }

  const currentPlayer = room.players[room.currentTurn];
  const currentPlayerId = currentPlayer.id;
  const turnDuration = 30000; // 30 giây

  // 3. Bắt đầu đồng hồ 30 giây mới
  room.turnTimer = setTimeout(() => {
    // === HẾT GIỜ! ===
    // Kiểm tra xem có còn là lượt của người đó không (tránh lỗi)
    if (room.players[room.currentTurn]?.id === currentPlayerId) {
      
      // a. Rút 1 lá bài phạt
      const card = room.deck.pop();
      if (!card) return; // Hết bài để rút

      currentPlayer.cards.push(card);
      io.to(currentPlayerId).emit('cardDrawn', card); 
      
      // b. Thông báo
      io.to(room.roomCode).emit('chatMessage', { 
        user: '👻 Ma Nhai', 
        msg: `${currentPlayer.name} đã hết giờ và bị rút 1 lá!` 
      });

      // c. Chuyển lượt cho người chơi tiếp theo
      room.currentTurn = (room.currentTurn + room.direction + room.players.length) % room.players.length;
      
      // d. Cập nhật trạng thái cho mọi người
      io.to(room.roomCode).emit('updateGameState', {
        players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.cards.length })),
        discardTop: room.discardPile[room.discardPile.length - 1],
        currentTurn: room.players[room.currentTurn].id,
        direction: room.direction
      });

      // e. Bắt đầu đếm giờ cho người tiếp theo (quan trọng)
      startTurnTimer(room); 
    }
  }, turnDuration);
}


io.on('connection', (socket) => {
  console.log('👻 User connected:', socket.id);

  // TẠO PHÒNG
  socket.on('createRoom', (roomCode, username) => {
    if (!username) return socket.emit('errorMessage', 'Nhập tên người chơi!');
    roomCode = roomCode.toUpperCase() || generateRoomCode();

    if (rooms[roomCode]) {
      return socket.emit('errorMessage', 'Mã phòng đã tồn tại! Thử mã khác.');
    }

    rooms[roomCode] = {
      host: socket.id,
      roomCode,
      players: [{ id: socket.id, name: username, cards: [] }],
      gameStarted: false,
      deck: [],
      discardPile: [],
      currentTurn: 0,
      direction: 1,
      chat: [],
      colorChoice: null,
      pendingDraw: 0,
      turnTimer: null
    };

    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('roomJoined', { roomCode, isHost: true, fact: getRandomFact() });
    // Gửi kèm 'room.host'
    io.to(roomCode).emit('updatePlayers', rooms[roomCode].players.map(p => ({ id: p.id, name: p.name })), rooms[roomCode].host);
    io.to(roomCode).emit('chatMessage', { user: '👻 Ma Nhai', msg: `${username} đã tạo phòng ${roomCode}!` });
  });

  // THAM GIA PHÒNG
  socket.on('joinRoom', (roomCode, username) => {
    if (!username) return socket.emit('errorMessage', 'Nhập tên người chơi!');
    roomCode = roomCode.toUpperCase();

    const room = rooms[roomCode];
    if (!room) return socket.emit('errorMessage', 'Phòng không tồn tại!');
    if (room.gameStarted) return socket.emit('errorMessage', 'Trò chơi đã bắt đầu!');
    if (room.players.length >= 4) return socket.emit('errorMessage', 'Phòng đã đầy (tối đa 4 người)!');

    const player = { id: socket.id, name: username, cards: [] };
    room.players.push(player);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('roomJoined', { roomCode, isHost: false, fact: getRandomFact() });
    // FIX: Gửi kèm 'room.host' khi tham gia
    io.to(roomCode).emit('updatePlayers', room.players.map(p => ({ id: p.id, name: p.name })), room.host);
    io.to(roomCode).emit('chatMessage', { user: '👻 Ma Nhai', msg: `${username} đã tham gia phòng!` });
  });

  // BẮT ĐẦU GAME
  socket.on('startGame', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.host !== socket.id || room.players.length < 2) return;

    startGame(room);
  });

  function startGame(room) {
    room.gameStarted = true;
    room.deck = createDeck();
    room.discardPile = [];
    room.currentTurn = 0;
    room.direction = 1;
    room.pendingDraw = 0;

    // Chia 7 lá mỗi người
    room.players.forEach(player => {
      player.cards = [];
      for (let i = 0; i < 7; i++) {
        player.cards.push(room.deck.pop());
      }
    });

    // Lá đầu tiên
    let topCard;
    do {
      if (room.deck.length < 1) room.deck = createDeck(); // Đảm bảo deck luôn có bài
      topCard = room.deck.pop();
    } while (topCard.color === 'wild' || topCard.type === 'CONGBON' || topCard.type === 'DOIMAU' || topCard.type === 'CONGHAI' || topCard.type === 'CAM');
    
    room.discardPile.push(topCard);

    io.to(room.roomCode).emit('updateGameState', {
      players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.cards.length })),
      discardTop: topCard,
      currentTurn: room.players[room.currentTurn].id,
      direction: room.direction
    });

    startTurnTimer(room); // Bắt đầu đếm giờ cho lượt đầu tiên
    
    room.players.forEach(p => io.to(p.id).emit('dealCards', p.cards));
  }

  // CHƠI LÁ BÀI
  socket.on('playCard', (cardIndex) => {
    const room = rooms[socket.roomCode];
    if (!room || !room.gameStarted) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.currentTurn !== room.players.indexOf(player)) return;

    // Đảm bảo cardIndex hợp lệ
    if (cardIndex < 0 || cardIndex >= player.cards.length) {
      return socket.emit('errorMessage', 'Lá bài không hợp lệ!');
    }
    const card = player.cards[cardIndex];
    
    const topCard = room.discardPile[room.discardPile.length - 1];

    if (canPlayCard(card, topCard)) {
      player.cards.splice(cardIndex, 1);
      room.discardPile.push(card);

      let nextTurn = (room.currentTurn + room.direction + room.players.length) % room.players.length;
      
      // XỬ LÝ HIỆU ỨNG
      switch (card.type) {
        case 'CAM': 
          nextTurn = (nextTurn + room.direction + room.players.length) % room.players.length;
          break;
        case 'CONGHAI':
          const draw2Player = room.players[nextTurn];
          if (draw2Player) { // Đảm bảo người chơi tồn tại
            for (let i = 0; i < 2; i++) draw2Player.cards.push(room.deck.pop());
            io.to(draw2Player.id).emit('drawCards', 2);
          }
          nextTurn = (nextTurn + room.direction + room.players.length) % room.players.length;
          break;
        case 'CONGBON':
          const draw4Player = room.players[nextTurn];
          if (draw4Player) { // Đảm bảo người chơi tồn tại
            for (let i = 0; i < 4; i++) draw4Player.cards.push(room.deck.pop());
            io.to(draw4Player.id).emit('drawCards', 4);
          }
          nextTurn = (nextTurn + room.direction + room.players.length) % room.players.length;
          socket.emit('chooseColor');
          break;
        case 'DOIMAU':
          socket.emit('chooseColor');
          break;
      }

      room.currentTurn = nextTurn;

      // KIỂM TRA THẮNG
      if (player.cards.length === 0) {
        io.to(room.roomCode).emit('gameOver', player.id, player.name, room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.cards.length })));
        
        // Dừng timer khi game kết thúc
        if (room.turnTimer) {
            clearTimeout(room.turnTimer);
            room.turnTimer = null;
        }
      }

      // GỬI LÁ BÀI CẬP NHẬT (cho riêng người vừa chơi)
      io.to(socket.id).emit('updateCards', player.cards);

      // Gửi trạng thái game MỚI cho TẤT CẢ mọi người
      io.to(room.roomCode).emit('updateGameState', {
          players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.cards.length })),
          discardTop: card, // Lá bài vừa được chơi
          currentTurn: room.players[room.currentTurn].id,
          direction: room.direction
      });
      
      // Bắt đầu đếm giờ cho người tiếp theo (chỉ khi game chưa kết thúc)
      if (player.cards.length > 0) {
          startTurnTimer(room);
      }
    } else {
        // Nước đi không hợp lệ (client-side check thất bại)
        socket.emit('errorMessage', 'Nước đi không hợp lệ!');
    }
  });

  // CHỌN MÀU
  socket.on('chooseColor', (color) => {
    const room = rooms[socket.roomCode];
    if (room && room.discardPile.length > 0) {
      const topCard = room.discardPile[room.discardPile.length - 1];
      // Chỉ cho phép đổi màu lá 'wild'
      if (topCard.color === 'wild') {
        topCard.color = color;
        io.to(room.roomCode).emit('colorChosen', color);
      }
    }
  });

  // BÁN LÁ
  socket.on('drawCard', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.currentTurn !== room.players.findIndex(p => p.id === socket.id)) return;

    const card = room.deck.pop();
    if (!card) return; // Hết bài

    const player = room.players.find(p => p.id === socket.id);
    player.cards.push(card);

    io.to(socket.id).emit('cardDrawn', card);
    room.currentTurn = (room.currentTurn + room.direction + room.players.length) % room.players.length;

    // Cập nhật trạng thái game
    io.to(room.roomCode).emit('updateGameState', {
        players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.cards.length })),
        discardTop: room.discardPile[room.discardPile.length - 1],
        currentTurn: room.players[room.currentTurn].id,
        direction: room.direction
    });
    
    // FIX: KHỞI ĐỘNG LẠI TIMER CHO NGƯỜI TIẾP THEO
    startTurnTimer(room);
  });

  // CHAT
  socket.on('chatMessage', (msg) => {
    const room = rooms[socket.roomCode];
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) { // Đảm bảo người chơi tồn tại
        io.to(room.roomCode).emit('chatMessage', { user: player.name, msg });
      }
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log('👻 User disconnected:', socket.id);
    if (socket.roomCode) {
      const room = rooms[socket.roomCode];
      if (room) {
        // Xóa đồng hồ cũ
        if (room.turnTimer) {
          clearTimeout(room.turnTimer);
          room.turnTimer = null;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) return; 

        const wasTheirTurn = room.gameStarted && room.currentTurn === playerIndex;
        
        const [disconnectedPlayer] = room.players.splice(playerIndex, 1);
        io.to(room.roomCode).emit('chatMessage', { user: '👻 Ma Nhai', msg: `${disconnectedPlayer.name} đã rời phòng.` });

        if (room.players.length === 0) {
          delete rooms[socket.roomCode];
        } else {
          // Cập nhật danh sách người chơi
          io.to(room.roomCode).emit('updatePlayers', room.players.map(p => ({ id: p.id, name: p.name })), room.host);
          
          if (room.host === socket.id) {
            room.host = room.players[0].id;
            io.to(room.host).emit('becomeHost');
          }

          // Tự động chuyển lượt nếu người chơi bị dis đang trong lượt
          if (wasTheirTurn && room.gameStarted) {
            room.currentTurn = room.currentTurn % room.players.length; 
            
            io.to(room.roomCode).emit('updateGameState', {
              players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.cards.length })),
              discardTop: room.discardPile[room.discardPile.length - 1],
              currentTurn: room.players[room.currentTurn].id,
              direction: room.direction
            });
            
            startTurnTimer(room); // Bắt đầu đếm giờ cho người mới
          }
        }
      }
    }
  });
});

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRandomFact() {
  return memeFacts[Math.floor(Math.random() * memeFacts.length)];
}

function canPlayCard(card, topCard) {
  if (!topCard) return true; // Lỗi hiếm gặp, nhưng cho phép
  return card.color === topCard.color || 
         card.value === topCard.value || 
         card.color === 'wild';
}

server.listen(3000, () => {
  console.log('🎃 UNO Ma Nhai chạy tại http://localhost:3000');
});
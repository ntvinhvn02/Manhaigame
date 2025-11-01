const socket = io();
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

let myCards = [];
let roomCode = '';
let isHost = false;
let currentTurnId = null;

// DOM Elements
const elements = {
    lobby: document.getElementById('lobby'),
    room: document.getElementById('room'),
    errorMsg: document.getElementById('errorMsg'),
    memeFact: document.getElementById('meme-fact'),
    playerList: document.getElementById('playerList'),
    displayRoomCode: document.getElementById('displayRoomCode'),
    startGame: document.getElementById('startGame'),
    gameBoard: document.getElementById('gameBoard'),
    playerHand: document.getElementById('playerHand'),
    discardPile: document.getElementById('discardPile'),
    currentTurn: document.getElementById('currentTurn'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendChat: document.getElementById('sendChat'),
    colorPicker: document.getElementById('colorPicker'),
    drawButton: document.getElementById('drawButton')
};

// EVENT LISTENERS
document.getElementById('createRoom').onclick = () => createOrJoinRoom(true);
document.getElementById('joinRoom').onclick = () => createOrJoinRoom(false);
elements.startGame.onclick = () => socket.emit('startGame');
elements.drawButton.onclick = () => socket.emit('drawCard');
elements.sendChat.onclick = sendChat;
elements.chatInput.addEventListener('keypress', e => e.key === 'Enter' && sendChat());

function createOrJoinRoom(isCreate) {
    const username = document.getElementById('username').value.trim();
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!username) return showError('Nhập tên ma nhai!');
    if (!isCreate && !code) return showError('Nhập mã phòng để tham gia!');
    
    const roomCode = isCreate ? (code || generateRoomCode()) : code;
    socket.emit(isCreate ? 'createRoom' : 'joinRoom', roomCode, username);
}
// === BỘ XỬ LÝ TRẠNG THÁI GAME MỚI (MỘT NƠI DUY NHẤT) ===
function handleGameStateUpdate(data) {
    // 1. Cập nhật lá bài trên cùng
    if (data.discardTop) {
        renderDiscardTop(data.discardTop);
    }

    // 2. Cập nhật chỉ báo lượt
    currentTurnId = data.currentTurn;
    const currentPlayer = data.players.find(p => p.id === data.currentTurn);
    updateTurnIndicator(currentPlayer?.name || '???');

    // 3. (Tùy chọn) Cập nhật số lượng bài của người chơi khác
    // Bạn có thể thêm code ở đây để hiển thị số bài của đối thủ
}
function sendChat() {
    const msg = elements.chatInput.value.trim();
    if (msg) {
        socket.emit('chatMessage', msg);
        elements.chatInput.value = '';
    }
}

// SOCKET EVENTS
socket.on('roomJoined', (data) => {
    roomCode = data.roomCode;
    isHost = data.isHost;
    elements.lobby.classList.add('hidden');
    elements.room.classList.remove('hidden');
    elements.displayRoomCode.textContent = roomCode;
    updateMemeFact(data.fact);
    elements.startGame.classList.toggle('hidden', !isHost);
});


socket.on('errorMessage', showError);

socket.on('updatePlayers', (players) => {
    elements.playerList.innerHTML = players.map(p => 
        `<li ${p.id === socket.id ? 'class="host"' : ''}>${p.name} ${p.id === socket.id ? '(Bạn)' : ''}</li>`
    ).join('');
});

socket.on('becomeHost', () => {
    isHost = true;
    elements.startGame.classList.remove('hidden');
});

// Lắng nghe sự kiện 'updateGameState' MỚI (thay cho 'gameStarted')
socket.on('updateGameState', (data) => {
    // Hiển thị bàn chơi nếu đây là lần đầu
    elements.gameBoard.classList.remove('hidden');
    elements.startGame.style.display = 'none';
    elements.drawButton.classList.remove('hidden');

    // Gọi hàm xử lý trung tâm
    handleGameStateUpdate(data);
});

socket.on('dealCards', (cards) => {
    myCards = cards;
    renderHand();
});



socket.on('updateCards', (cards) => {
    myCards = cards;
    renderHand();
});

socket.on('cardDrawn', (card) => {
    myCards.push(card);
    renderHand();
});

socket.on('drawCards', (count) => {
    for (let i = 0; i < count; i++) {
        myCards.push({ color: 'back', type: 'back', value: '?' });
    }
    renderHand();
    showError(`Bạn bị bắt rút ${count} lá!`);
});

socket.on('chooseColor', () => elements.colorPicker.classList.remove('hidden'));

socket.on('colorChosen', (color) => {
    // Thêm một lớp viền màu cho thẻ wild vừa đánh
    const topCard = elements.discardPile.querySelector('.uno-card');
    if (topCard) {
        // Xóa các lớp viền cũ (nếu có)
        topCard.classList.remove('chosen-red', 'chosen-green', 'chosen-blue', 'chosen-yellow');
        // Thêm lớp viền mới
        topCard.classList.add(`chosen-${color}`);
    }
    elements.colorPicker.classList.add('hidden');
});

socket.on('chatMessage', (msg) => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${msg.user}:</strong> ${msg.msg}`;
    elements.chatMessages.appendChild(div);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
});

socket.on('gameOver', (winnerName) => {
    alert(`${winnerName} đã hô UNO và thắng! Ma nhai tán thưởng!`);
    location.reload();
});
/**
 * Lấy đường dẫn ảnh cho một đối tượng thẻ bài.
 * Giả định ảnh nằm trong /images/cards/
 * VÍ DỤ: {color: 'red', type: '1'} -> /images/cards/RED1.png
 * VÍ DỤ: {color: 'wild', type: 'DOIMAU'} -> /images/cards/DOIMAU.png
 */
function getCardImageSrc(card) {
    if (card.color === 'back') {
        return '/images/cards/BACK.png'; // Thẻ úp
    }
    
    if (card.color === 'wild') {
        // DOIMAU.png, CONGBON.png
        return `/images/cards/${card.type.toUpperCase()}.png`;
    }

    // RED1.png, GREENCONGHAI.png
    const color = card.color.toUpperCase();
    const value = card.value.toUpperCase();
    return `/images/cards/${color}${value}.png`;
}
// TẠO LÁ BÀI: ICON SINH ĐỘNG + TOOLTIP FACT KHI HOVER
// TẠO LÁ BÀI: SỬ DỤNG <img> + TOOLTIP FACT KHI HOVER
function createCardElement(card) {
    const el = document.createElement('div');
    // Bỏ lớp màu (ví dụ: 'red') vì ảnh đã có màu
    el.className = 'uno-card'; 
    el.dataset.type = card.type;

    // --- TRUNG TÂM: THẺ BÀI BẰNG HÌNH ẢNH ---
    const img = document.createElement('img');
    img.src = getCardImageSrc(card);
    img.alt = `Thẻ ${card.color} ${card.type}`;
    el.appendChild(img);

    // --- TOOLTIP: FACT MA NHAI KHI HOVER (Giữ nguyên) ---
    const tooltip = document.createElement('div');
    tooltip.className = 'fact-tooltip';
    tooltip.textContent = getRandomFact(); // Fact mới mỗi lần
    el.appendChild(tooltip);

    // CẬP NHẬT FACT MỖI LẦN HOVER
    el.addEventListener('mouseenter', () => {
        tooltip.textContent = getRandomFact();
    });

    // Click để chơi (chỉ khi thẻ không phải là thẻ úp)
    if (card.color !== 'back') {
         el.onclick = () => socket.emit('playCard', myCards.indexOf(card));
    }

    return el;
}

function getRandomFact() {
    return memeFacts[Math.floor(Math.random() * memeFacts.length)];
}

// RENDER
function renderHand() {
    elements.playerHand.innerHTML = '';
    myCards.forEach(card => {
        elements.playerHand.appendChild(createCardElement(card));
    });
}

function renderDiscardTop(card) {
    elements.discardPile.innerHTML = '';
    elements.discardPile.appendChild(createCardElement(card));
}

// SỬA "ĐẾN LƯỢT" - HOẠT ĐỘNG 100%
function updateTurnIndicator(name) {
    if (name) {
        elements.currentTurn.textContent = `Đến lượt: ${name}`;
        elements.currentTurn.classList.remove('hidden');
    } else {
        elements.currentTurn.textContent = 'Đang chờ...';
        elements.currentTurn.classList.remove('hidden');
    }
}

function updateMemeFact(fact) {
    elements.memeFact.textContent = fact || getRandomFact();
    setTimeout(updateMemeFact, 5000);
}

function showError(msg) {
    elements.errorMsg.textContent = msg;
    setTimeout(() => elements.errorMsg.textContent = '', 4000);
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// COLOR PICKER
elements.colorPicker.addEventListener('click', (e) => {
    if (e.target.classList.contains('color')) {
        socket.emit('chooseColor', e.target.dataset.color);
    }
});

// INIT
updateMemeFact();
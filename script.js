// === BIẾN GLOBAL & TRẠNG THÁI ===
const socket = io();
let myCards = [];
let visualTimerInterval = null;
let gameTimerInterval = null;
let currentHostId = null;
let currentTopCard = null;
let roomCode = '';
let isHost = false;
let currentTurnId = null;

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

// === DOM ELEMENTS ===
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
    drawButton: document.getElementById('drawButton'),
    turnTimer: document.getElementById('turnTimer'),
    timerText: document.getElementById('timerText'),
    timerBar: document.getElementById('timerBar'),
    gameTimerContainer: document.getElementById('gameTimerContainer'),
    gameElapsedTime: document.getElementById('gameElapsedTime'),
    gameOverModal: document.getElementById('gameOverModal'),
    resultsList: document.getElementById('resultsList'),
    closeResultsButton: document.getElementById('closeResultsButton')
};

// === KHỞI TẠO ÂM THANH ===
const sounds = {
    play: new Audio('/audio/play.mp3'),
    draw: new Audio('/audio/draw.mp3'),
    shuffle: new Audio('/audio/shuffle.mp3'),
    win: new Audio('/audio/win.mp3'),
    error: new Audio('/audio/error.mp3')
};

function playSound(sound) {
    if (sounds[sound]) {
        sounds[sound].currentTime = 0;
        sounds[sound].play().catch(e => console.log("Audio play bị chặn:", e));
    }
}

// === CÁC HÀM LOGIC CHÍNH ===

function createOrJoinRoom(isCreate) {
    const username = document.getElementById('username').value.trim();
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!username) return showError('Nhập tên ma nhai!');
    if (!isCreate && !code) return showError('Nhập mã phòng để tham gia!');
    
    const roomCode = isCreate ? (code || generateRoomCode()) : code;
    socket.emit(isCreate ? 'createRoom' : 'joinRoom', roomCode, username);
}

function sendChat() {
    const msg = elements.chatInput.value.trim();
    if (msg) {
        socket.emit('chatMessage', msg);
        elements.chatInput.value = '';
    }
}

function startElapsedTimeTimer() {
    elements.gameTimerContainer.classList.remove('hidden');
    let totalSeconds = 0;
    elements.gameElapsedTime.textContent = '00:00'; 
    
    // Xóa timer cũ nếu có để tránh chạy song song
    if (gameTimerInterval) clearInterval(gameTimerInterval);

    gameTimerInterval = setInterval(() => {
        totalSeconds++;
        let minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        let seconds = (totalSeconds % 60).toString().padStart(2, '0');
        elements.gameElapsedTime.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function startVisualTimer(seconds) {
    if (visualTimerInterval) {
        clearInterval(visualTimerInterval);
    }

    let remaining = seconds;
    elements.timerText.textContent = remaining;
    elements.timerBar.classList.remove('timer-low');
    elements.timerBar.style.width = '100%';

    visualTimerInterval = setInterval(() => {
        remaining--;
        elements.timerText.textContent = remaining;
        elements.timerBar.style.width = (remaining / seconds) * 100 + '%';

        if (remaining <= 10) {
            elements.timerBar.classList.add('timer-low');
        }

        if (remaining <= 0) {
            clearInterval(visualTimerInterval);
        }
    }, 1000);
}

// Xử lý trung tâm cho mọi cập nhật trạng thái game
function handleGameStateUpdate(data) {
    // 1. Cập nhật lá bài trên cùng
    if (data.discardTop) {
        renderDiscardTop(data.discardTop);
        currentTopCard = data.discardTop; // Lưu lại lá bài
    }

    // 2. Cập nhật chỉ báo lượt
    currentTurnId = data.currentTurn;
    const currentPlayer = data.players.find(p => p.id === data.currentTurn);
    updateTurnIndicator(currentPlayer?.name || '???');

    // 3. Cập nhật đồng hồ đếm ngược
    if (visualTimerInterval) {
        clearInterval(visualTimerInterval); // Dừng mọi đồng hồ cũ
    }

    if (currentTurnId === socket.id) {
        // Là lượt của tôi
        elements.playerHand.classList.remove('hand-disabled');
        elements.turnTimer.classList.remove('hidden');
        startVisualTimer(30); // Bắt đầu đếm 30 giây
    } else {
        // Không phải lượt của tôi
        elements.playerHand.classList.add('hand-disabled');
        elements.turnTimer.classList.add('hidden');
    }
}

// === SOCKET EVENT HANDLERS ===

socket.on('roomJoined', (data) => {
    roomCode = data.roomCode;
    isHost = data.isHost;
    elements.lobby.classList.add('hidden');
    elements.room.classList.remove('hidden');
    elements.displayRoomCode.textContent = roomCode;
    updateMemeFact(data.fact);
    elements.startGame.classList.toggle('hidden', !isHost);
});

// TỐI ƯU: Đã chuyển playSound('error') vào hàm showError
socket.on('errorMessage', showError); 

socket.on('updatePlayers', (players, hostId) => {
    currentHostId = hostId; // Lưu lại ai là host
    elements.playerList.innerHTML = players.map(p => {
        let hostTag = (p.id === currentHostId) ? ' 👑' : ''; // Emoji vương miện
        let youTag = (p.id === socket.id) ? ' (Bạn)' : '';
        let liClass = (p.id === socket.id) ? 'player-you' : '';
        if (p.id === currentHostId) liClass += ' player-host';

        return `<li class="${liClass}">${p.name}${youTag}${hostTag}</li>`;
    }).join('');
});

socket.on('becomeHost', () => {
    isHost = true;
    elements.startGame.classList.remove('hidden');
});

socket.on('updateGameState', (data) => {
    // TỐI ƯU: Gộp 2 lệnh kiểm tra 'hidden' làm một
    const isFirstTime = elements.gameBoard.classList.contains('hidden');
    if (isFirstTime) {
        elements.gameBoard.classList.remove('hidden');
        elements.startGame.style.display = 'none';
        elements.drawButton.classList.remove('hidden');
        playSound('shuffle'); // Chỉ phát lần đầu game
        startElapsedTimeTimer(); // Bắt đầu đếm giờ chơi
    }
    
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
    playSound('draw');
    renderHand(); // Render lại tay bài

    // Animation cho lá bài vừa rút
    const lastCardEl = elements.playerHand.lastElementChild;
    if (lastCardEl) {
        lastCardEl.classList.add('card-draw-animation');
    }
});

socket.on('drawCards', (count) => {
    for (let i = 0; i < count; i++) {
        myCards.push({ color: 'back', type: 'back', value: '?' });
        playSound('draw');
    }
    renderHand();

    // Animation cho các lá bài vừa rút
    const cardElements = elements.playerHand.children;
    const numToAnimate = Math.min(count, cardElements.length);
    for (let i = 0; i < numToAnimate; i++) {
        cardElements[cardElements.length - 1 - i].classList.add('card-draw-animation');
    }
    showError(`Bạn bị bắt rút ${count} lá!`);
});

socket.on('chooseColor', () => elements.colorPicker.classList.remove('hidden'));

socket.on('colorChosen', (color) => {
    const topCard = elements.discardPile.querySelector('.uno-card');
    if (topCard) {
        topCard.classList.remove('chosen-red', 'chosen-green', 'chosen-blue', 'chosen-yellow');
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

socket.on('gameOver', (winnerId, winnerName, allPlayers) => {
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    if (visualTimerInterval) clearInterval(visualTimerInterval);

    playSound('win');
    elements.turnTimer.classList.add('hidden');
    
    // FIX: Sửa lỗi 'elements.hand' thành 'elements.playerHand'
    elements.playerHand.classList.add('hand-disabled'); 

    const results = [];
    results.push({ name: winnerName, rank: 1, cardCount: 0 });

    const losers = allPlayers.filter(p => p.id !== winnerId);
    losers.sort((a, b) => a.cardCount - b.cardCount);

    losers.forEach((loser, index) => {
        results.push({ name: loser.name, rank: index + 2, cardCount: loser.cardCount });
    });

    elements.resultsList.innerHTML = results.map(player => {
        const rankEmojis = ['🥇', '🥈', '🥉'];
        let rankDisplay = (player.rank <= 3) ? rankEmojis[player.rank - 1] : `#${player.rank}`;
        let cardDisplay = (player.rank === 1) ? 'Chiến thắng!' : `(còn ${player.cardCount} lá)`;

        return `<div class="result-item rank-${player.rank}">
                    <span class="rank">${rankDisplay}</span>
                    <span class="name">${player.name}</span>
                    <span class="status">${cardDisplay}</span>
                  </div>`;
    }).join('');

    elements.gameOverModal.classList.remove('hidden');
});

// === CÁC HÀM RENDER & UTILITY ===

function getCardImageSrc(card) {
    if (card.color === 'back') {
        return '/images/cards/BACK.png';
    }
    if (card.color === 'wild') {
        return `/images/cards/${card.type.toUpperCase()}.png`;
    }
    const color = card.color.toUpperCase();
    const value = card.value.toUpperCase();
    return `/images/cards/${color}${value}.png`;
}

function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'uno-card'; 
    el.dataset.type = card.type;

    const img = document.createElement('img');
    img.src = getCardImageSrc(card);
    img.alt = `Thẻ ${card.color} ${card.type}`;
    el.appendChild(img);

    const tooltip = document.createElement('div');
    tooltip.className = 'fact-tooltip';
    tooltip.textContent = getRandomFact();
    el.appendChild(tooltip);

    el.addEventListener('mouseenter', () => {
        tooltip.textContent = getRandomFact();
    });

    if (card.color !== 'back') {
        // FIX: XÓA BỎ LOGIC ONCLICK BỊ LẶP LẠI
        // Chỉ giữ lại một khối logic 'el.onclick' duy nhất
        el.onclick = () => {
            // 1. Kiểm tra LƯỢT CHƠI
            if (currentTurnId !== socket.id) {
                playSound('error'); 
                if (!el.classList.contains('card-shake-animation')) {
                    el.classList.add('card-shake-animation');
                    setTimeout(() => el.classList.remove('card-shake-animation'), 500);
                }
                return;
            }

            // 2. Kiểm tra TÍNH HỢP LỆ (đúng luật)
            if (!canPlayCard(card, currentTopCard)) {
                playSound('error');
                if (!el.classList.contains('card-shake-animation')) {
                    el.classList.add('card-shake-animation');
                    setTimeout(() => el.classList.remove('card-shake-animation'), 500);
                }
                return;
            }

            // 3. Nếu hợp lệ -> Chạy animation và gửi sự kiện
            el.classList.add('card-play-animation-out');
            playSound('play');
            setTimeout(() => {
                // TỐI ƯU: Kiểm tra xem lá bài còn trong tay không trước khi gửi
                // (Tránh lỗi nếu người dùng bấm 2 lần quá nhanh)
                const cardIndex = myCards.indexOf(card);
                if(cardIndex > -1) {
                    socket.emit('playCard', cardIndex);
                }
            }, 200);
        };
    }
    return el;
}

function getRandomFact() {
    return memeFacts[Math.floor(Math.random() * memeFacts.length)];
}

function renderHand() {
    elements.playerHand.innerHTML = '';
    myCards.forEach(card => {
        elements.playerHand.appendChild(createCardElement(card));
    });
}

function renderDiscardTop(card) {
    elements.discardPile.innerHTML = '';
    // TỐI ƯU: Không cần tạo lá bài đầy đủ ở đây
    // Chỉ cần 1 element img là đủ, nhẹ hơn cho chồng bài bỏ
    const el = document.createElement('div');
    el.className = 'uno-card'; 
    
    // Xóa listener 'click' và 'hover' không cần thiết
    el.addEventListener('mouseenter', () => {
        tooltip.textContent = getRandomFact();
    });

    const img = document.createElement('img');
    img.src = getCardImageSrc(card);
    img.alt = `Thẻ ${card.color} ${card.type}`;
    el.appendChild(img);

    // Thêm tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'fact-tooltip';
    tooltip.textContent = getRandomFact();
    el.appendChild(tooltip);

    el.classList.add('card-play-animation-in');
    
    // Nếu là lá wild, nó phải giữ màu đã chọn
    if (card.color !== 'wild' && (card.type === 'DOIMAU' || card.type === 'CONGBON')) {
        el.classList.add(`chosen-${card.color}`);
    }

    elements.discardPile.appendChild(el);
}

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
    
    // TỐI ƯU: Dùng setTimeout đệ quy thay vì setInterval
    setTimeout(updateMemeFact, 5000); 
}

function showError(msg) {
    // TỐI ƯU: Chuyển âm thanh lỗi vào đây
    playSound('error');
    elements.errorMsg.textContent = msg;
    setTimeout(() => elements.errorMsg.textContent = '', 4000);
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function canPlayCard(card, topCard) {
    if (!topCard) return true; 
    return card.color === topCard.color || 
           card.value === topCard.value || 
           card.color === 'wild';
}

// === KHỞI CHẠY & EVENT LISTENERS ===
document.getElementById('createRoom').onclick = () => createOrJoinRoom(true);
document.getElementById('joinRoom').onclick = () => createOrJoinRoom(false);
elements.startGame.onclick = () => socket.emit('startGame');
elements.drawButton.onclick = () => socket.emit('drawCard');
elements.sendChat.onclick = sendChat;

elements.chatInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendChat();
});

elements.colorPicker.addEventListener('click', (e) => {
    if (e.target.classList.contains('color')) {
        socket.emit('chooseColor', e.target.dataset.color);
    }
});

elements.closeResultsButton.onclick = () => {
    location.reload(); 
};

// Bắt đầu chạy
updateMemeFact();
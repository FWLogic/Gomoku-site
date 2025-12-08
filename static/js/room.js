// 游戏房间页面JavaScript代码
class GomokuGame {
    constructor(roomCode, playerId, playerColor) {
        this.roomCode = roomCode;
        this.playerId = playerId;
        this.playerColor = playerColor;
        this.boardSize = 15;
        this.board = [];
        this.currentTurn = null;
        this.lastMove = null;
        this.lastChatId = 0;
        this.pollingInterval = null;

        this.initBoard();
        this.initEventListeners();
        this.startPolling();
        this.startSessionUpdater();
    }

    initBoard() {
        const boardElement = document.getElementById('chessboard');
        boardElement.innerHTML = '';
        boardElement.style.gridTemplateColumns = `repeat(${this.boardSize}, 1fr)`;

        // 创建棋盘网格
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;

                cell.addEventListener('click', () => this.handleCellClick(row, col));
                boardElement.appendChild(cell);
            }
        }
    }

    updateBoard(boardData) {
        this.board = boardData;
        const cells = document.querySelectorAll('.cell');

        cells.forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const value = boardData[row][col];

            cell.classList.remove('black', 'white', 'last-move');

            if (value === 1) { // 黑棋
                cell.classList.add('black');
            } else if (value === 2) { // 白棋
                cell.classList.add('white');
            }

            // 标记最后一步
            if (this.lastMove && this.lastMove.row === row && this.lastMove.col === col) {
                cell.classList.add('last-move');
            }
        });
    }

    async handleCellClick(row, col) {
        try {
            const response = await fetch(`/room/${this.roomCode}/move/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({ row, col })
            });

            const data = await response.json();

            if (data.success) {
                this.updateBoard(data.board);
                this.updateGameState(data);
            } else {
                this.showMessage(data.error || '落子失败', 'error');
            }
        } catch (error) {
            console.error('落子失败:', error);
            this.showMessage('网络错误，请重试', 'error');
        }
    }

    async sendChat(message) {
        try {
            const response = await fetch(`/room/${this.roomCode}/chat/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();

            if (data.success) {
                this.addChatMessage(data.message, true);
                document.getElementById('chat-input').value = '';
            }
        } catch (error) {
            console.error('发送消息失败:', error);
        }
    }

    async requestUndo() {
        if (!confirm('确定要悔棋吗？')) return;

        try {
            const response = await fetch(`/room/${this.roomCode}/undo/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                this.updateBoard(data.board);
                this.showMessage('悔棋成功', 'success');
            } else {
                this.showMessage(data.error || '悔棋失败', 'error');
            }
        } catch (error) {
            console.error('悔棋失败:', error);
            this.showMessage('网络错误，请重试', 'error');
        }
    }

    async requestDraw() {
        if (!confirm('确定要和棋吗？')) return;

        try {
            const response = await fetch(`/room/${this.roomCode}/draw/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                this.showMessage('游戏以和棋结束', 'success');
                this.updateGameState(data);
            } else {
                this.showMessage(data.error || '和棋请求失败', 'error');
            }
        } catch (error) {
            console.error('和棋请求失败:', error);
            this.showMessage('网络错误，请重试', 'error');
        }
    }

    async updateRoomState() {
        try {
            const response = await fetch(`/room/${this.roomCode}/state/?last_chat_id=${this.lastChatId}`);
            const data = await response.json();

            if (data.error) {
                console.error('获取房间状态失败:', data.error);
                return;
            }

            // 更新棋盘
            if (data.room.board) {
                this.updateBoard(data.room.board);
            }

            // 更新游戏状态
            this.currentTurn = data.room.current_turn;
            this.updateGameState(data.room);

            // 更新玩家信息
            this.updatePlayerInfo(data.player, data.opponent);

            // 更新聊天消息
            if (data.chats && data.chats.length > 0) {
                data.chats.forEach(chat => {
                    this.addChatMessage(chat, false);
                    this.lastChatId = Math.max(this.lastChatId, chat.id);
                });
            }

            // 更新最后一步
            if (data.last_move) {
                this.lastMove = data.last_move;
                this.highlightLastMove();
            }

        } catch (error) {
            console.error('更新房间状态失败:', error);
        }
    }

    updateGameState(roomData) {
        const statusElement = document.getElementById('game-status');
        const turnIndicator = document.getElementById('turn-indicator');

        if (roomData.status === 'finished') {
            if (roomData.winner === this.playerId) {
                statusElement.textContent = '你赢了！';
                statusElement.className = 'status-winner';
                this.showMessage('恭喜获胜！', 'success');
            } else if (roomData.is_draw) {
                statusElement.textContent = '和棋';
                statusElement.className = 'status-draw';
            } else {
                statusElement.textContent = '你输了';
                statusElement.className = 'status-lose';
            }

            // 停止轮询
            this.stopPolling();

        } else if (roomData.status === 'playing') {
            if (this.currentTurn === this.playerId) {
                statusElement.textContent = '轮到你了';
                statusElement.className = 'status-your-turn';
                turnIndicator.textContent = '请落子';
            } else {
                statusElement.textContent = '对手回合';
                statusElement.className = 'status-opponent-turn';
                turnIndicator.textContent = '等待对手...';
            }
        } else if (roomData.status === 'waiting') {
            statusElement.textContent = '等待对手加入...';
            statusElement.className = 'status-waiting';
        }
    }

    updatePlayerInfo(playerData, opponentData) {
        // 更新当前玩家信息
        document.getElementById('player-name').textContent = playerData.username;
        document.getElementById('player-color').textContent = playerData.color === 'black' ? '黑棋' : '白棋';
        document.getElementById('player-color').className = `player-color color-${playerData.color}`;

        // 更新对手信息
        const opponentElement = document.getElementById('opponent-info');
        if (opponentData && opponentData.username) {
            opponentElement.innerHTML = `
                <div class="player-name">${opponentData.username}</div>
                <div class="player-color color-${playerData.color === 'black' ? 'white' : 'black'}">
                    ${playerData.color === 'black' ? '白棋' : '黑棋'}
                </div>
            `;
        } else {
            opponentElement.innerHTML = `
                <div class="player-name">等待对手...</div>
                <div class="player-color color-waiting">未加入</div>
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                    <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
                        分享房间链接给朋友:
                    </p>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="room-link" value="${window.location.href}"
                               readonly style="flex: 1; padding: 8px; border: 1px solid #dee2e6; border-radius: 4px;">
                        <button class="btn btn-secondary" onclick="copyRoomLink()">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
            `;
        }
    }

    addChatMessage(chat, isOwn) {
        const chatMessages = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${isOwn ? 'own' : ''}`;

        const time = new Date(chat.timestamp).toLocaleTimeString();
        messageElement.innerHTML = `
            <div class="chat-meta">
                <span class="chat-sender">${chat.player}</span>
                <span class="chat-time">${time}</span>
            </div>
            <div class="chat-content">${this.escapeHtml(chat.message)}</div>
        `;

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    highlightLastMove() {
        // 移除之前的高亮
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('last-move');
        });

        // 高亮最后一步
        if (this.lastMove) {
            const cell = document.querySelector(`.cell[data-row="${this.lastMove.row}"][data-col="${this.lastMove.col}"]`);
            if (cell) {
                cell.classList.add('last-move');
            }
        }
    }

    initEventListeners() {
        // 聊天发送
        document.getElementById('send-chat').addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            const message = input.value.trim();
            if (message) {
                this.sendChat(message);
            }
        });

        // 回车发送消息
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('send-chat').click();
            }
        });

        // 悔棋按钮
        document.getElementById('undo-btn').addEventListener('click', () => {
            this.requestUndo();
        });

        // 和棋按钮
        document.getElementById('draw-btn').addEventListener('click', () => {
            this.requestDraw();
        });

        // 离开房间按钮
        document.getElementById('leave-btn').addEventListener('click', () => {
            if (confirm('确定要离开房间吗？')) {
                window.location.href = '/lobby/';
            }
        });
    }

    startPolling() {
        this.pollingInterval = setInterval(() => {
            this.updateRoomState();
        }, 2000); // 每2秒轮询一次
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    getCsrfToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]').value;
    }

    showMessage(text, type) {
        // 创建消息提示
        const message = document.createElement('div');
        const notificationType = type === 'success' || type === 'error' ? type : 'info';
        message.className = `notification notification-${notificationType}`;
        message.textContent = text;

        document.body.appendChild(message);

        setTimeout(() => {
            message.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(message);
            }, 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 启动会话更新器，定期更新用户在线状态
    startSessionUpdater() {
        // 获取CSRF令牌
        const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;

        // 每2分钟更新一次会话活动时间
        setInterval(() => {
            fetch('/api/update-session/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 会话活动时间已更新
                } else {
                    console.error('更新会话活动时间失败:', data.error);
                }
            })
            .catch(error => {
                console.error('更新会话活动时间出错:', error);
            });
        }, 120000); // 120000毫秒 = 2分钟
    }
}

// 页面加载完成后初始化游戏
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否在游戏房间页面
    if (window.roomCode && window.playerId && window.playerColor) {
        window.game = new GomokuGame(
            window.roomCode,
            window.playerId,
            window.playerColor
        );
    }
});

// 复制房间链接函数
function copyRoomLink() {
    const linkInput = document.getElementById('room-link');
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value).then(() => {
        // 使用通知而不是alert
        if (window.game) {
            window.game.showMessage('房间链接已复制到剪贴板！', 'success');
        } else {
            alert('房间链接已复制到剪贴板！');
        }
    });
}

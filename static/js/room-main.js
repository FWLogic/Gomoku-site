// 引入模块
// 注意：这些模块应该在HTML中通过script标签引入

// 游戏主类
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
        this.gameStatus = null;  // 初始化游戏状态
        this.lastRematchStatus = null;  // 初始化再来一局请求状态
        this.lastUndoStatus = null;  // 初始化悔棋请求状态
        this.lastDrawStatus = null;  // 初始化和棋请求状态

        // 初始化音频管理器
        this.audioManager = new AudioManager();

        // 初始化历史记录管理器
        this.history = new GameHistory(this);

        // 初始化通信管理器
        this.communication = new GameCommunication(this);

        // 用于去重移动历史项（key 格式：moveNumber|coords|player）
        this.knownMoveKeys = new Set();

        // 客户端维护的移动列表（按顺序），用于跳转历史步
        this.moveList = [];

        // 历史查看模式相关标志
        this.isViewingHistory = false;      // true 表示用户正在查看历史步，UI 不应被轮询覆盖
        this.viewingIndex = null;           // 正在查看的 moveList 索引
        this.liveBoard = null;              // 始终保存后端返回的最新棋盘（即使用户在查看历史）
        this.liveLastMove = null;           // 始终保存后端返回的最新 last_move

        this.initBoard();
        this.initEventListeners();

        // 初始化已存在的移动历史到已知集合（如果模板里已经渲染了一些）
        this.history.initKnownMoves();

        // 标记是否需要在首次轮询后自动跳转到历史第一步（仅当游戏已结束时）
        this.history.shouldAutoJumpToFirstMove = false;
        // 标记是否是回顾模式（从资料页打开已结束的游戏，不应显示结束弹窗）
        this.history.isReviewMode = false;
        try {
            if (this.history.isOpenedFromProfile && this.history.isOpenedFromProfile()) {
                this.history.isReviewMode = true;  // 从资料页打开即为回顾模式
                if (this.history.moveList && this.history.moveList.length > 0) {
                    // 延迟到首次轮询后，根据游戏状态决定是否跳转
                    this.history.shouldAutoJumpToFirstMove = true;
                }
            }
        } catch (e) {
            // ignore
        }

        this.startPolling();
        this.startSessionUpdater();
    }

    initBoard() {
        const boardElement = document.getElementById('chessboard');
        boardElement.innerHTML = '<div class="board-inner"></div>';
        const boardInner = boardElement.querySelector('.board-inner');
        
        // 初始化棋盘数据数组
        this.board = [];
        for (let row = 0; row < this.boardSize; row++) {
            this.board[row] = [];
            for (let col = 0; col < this.boardSize; col++) {
                this.board[row][col] = 0;
            }
        }

        // 定义五子棋星位点坐标（15路棋盘）- 天元和四颗小星
        const starPoints = [
            [7, 7],   // 天元（中心点）
            [3, 3], [3, 11],  // 左上和右上小星
            [11, 3], [11, 11] // 左下和右下小星
        ];

        // 创建星位点标记
        starPoints.forEach(([row, col]) => {
            const starPoint = document.createElement('div');
            starPoint.className = row === 7 && col === 7 ? 'star-point center-star' : 'star-point';
            starPoint.dataset.row = row;
            starPoint.dataset.col = col;
            
            // 计算星位点位置（相对于内部网格区域）
            const left = (col * 100) / (this.boardSize - 1);
            const top = (row * 100) / (this.boardSize - 1);
            starPoint.style.left = `${left}%`;
            starPoint.style.top = `${top}%`;

            boardInner.appendChild(starPoint);
        });

        // 创建棋盘交叉点
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // 计算交叉点位置（相对于内部网格区域）
                const left = (col * 100) / (this.boardSize - 1);
                const top = (row * 100) / (this.boardSize - 1);
                cell.style.left = `${left}%`;
                cell.style.top = `${top}%`;

                cell.addEventListener('click', () => this.communication.handleCellClick(row, col));
                boardInner.appendChild(cell);
            }
        }

        // 计算单元格大小用于棋子定位
        this.resizeCells();
        if (!this._resizeListenerAdded) {
            window.addEventListener('resize', () => this.resizeCells());
            this._resizeListenerAdded = true;
        }
    }

    // 计算并应用 cell 的高度以保证正方形格子（fallback）
    resizeCells() {
        try {
            const boardElement = document.getElementById('chessboard');
            if (!boardElement) return;
            // 使用实际渲染宽度来计算单格尺寸
            const rect = boardElement.getBoundingClientRect();
            const availableWidth = rect.width - 40; // 减去左右padding (20px * 2)
            const cellSize = Math.floor(availableWidth / (this.boardSize - 1));
            if (!cellSize || cellSize <= 0) return;
            // Expose exact cell pixel size as a CSS variable for precise piece sizing.
            // This allows CSS to compute piece dimensions: --cell-size (e.g. '32px').
            boardElement.style.setProperty('--cell-size', `${cellSize}px`);
        } catch (e) {
            // 忽略计算错误
            // console.error('resizeCells error', e);
        }
    }

    updateBoard(boardData) {
        this.board = boardData;
        const cells = document.querySelectorAll('.cell');

        cells.forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const value = boardData[row][col];
            const hadPiece = cell.classList.contains('black') || cell.classList.contains('white');

            cell.classList.remove('black', 'white', 'last-move', 'piece-new');

            // 移除之前可能添加的红点元素
            const existingDot = cell.querySelector('.last-move-dot');
            if (existingDot) {
                existingDot.remove();
            }

            if (value === 1) { // 黑棋
                cell.classList.add('black');
                // 如果之前没有棋子，现在有了，说明是新落子，添加动画
                if (!hadPiece) {
                    cell.classList.add('piece-new');
                    // 动画结束后移除 piece-new class
                    setTimeout(() => cell.classList.remove('piece-new'), 400);
                }
            } else if (value === 2) { // 白棋
                cell.classList.add('white');
                // 如果之前没有棋子，现在有了，说明是新落子，添加动画
                if (!hadPiece) {
                    cell.classList.add('piece-new');
                    // 动画结束后移除 piece-new class
                    setTimeout(() => cell.classList.remove('piece-new'), 400);
                }
            }

            // 在添加棋子的同时，如果是最新落子位置，添加红点标记
            if (this.lastMove && row === this.lastMove.row && col === this.lastMove.col) {
                cell.classList.add('last-move');
                // 添加红点元素以确保它显示在棋子上方
                const dot = document.createElement('div');
                dot.className = 'last-move-dot';
                // 确保红点添加到cell的末尾，这样它会在最上层
                cell.appendChild(dot);
            }
        });
    }

    updateGameState(roomData) {
        const statusElement = document.getElementById('game-status');
        const turnIndicator = document.getElementById('turn-indicator');

        // 检查游戏状态是否从非结束状态变为结束状态
        const wasNotFinished = this.gameStatus !== 'finished';
        const wasFinished = this.gameStatus === 'finished';
        const prevStatus = this.gameStatus;
        this.gameStatus = roomData.status;

        // 检查游戏是否从结束状态变为进行中状态（游戏重新开始）
        if (wasFinished && roomData.status === 'playing') {
            // 游戏重新开始
            this.showMessage('游戏重新开始', 'success');
            
            // 隐藏游戏结束弹窗
            const modal = document.getElementById('game-over-modal');
            if (modal) {
                modal.classList.remove('show');
            }
            
            // 清空移动历史（新的对局应从空历史开始）
            try {
                const moveContainer = document.getElementById('move-history');
                if (moveContainer) {
                    moveContainer.innerHTML = '';
                }
                this.history.knownMoveKeys.clear();
            } catch (e) {
                // ignore
            }

            // 重新启用棋盘点击
            document.querySelectorAll('.cell').forEach(cell => {
                cell.style.cursor = 'pointer';
                cell.onclick = null;
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                cell.addEventListener('click', () => this.communication.handleCellClick(row, col));
            });
            
            // 重新启用聊天输入
            const chatInput = document.getElementById('chat-input');
            const sendChatBtn = document.getElementById('send-chat');
            if (chatInput) chatInput.disabled = false;
            if (sendChatBtn) sendChatBtn.disabled = false;
            
            // 重新启用悔棋和和棋按钮
            const undoBtn = document.getElementById('undo-btn');
            const drawBtn = document.getElementById('draw-btn');
            if (undoBtn) undoBtn.disabled = false;
            if (drawBtn) drawBtn.disabled = false;
            
            // 重新开始轮询（如果已停止）
            if (!this.pollingInterval) {
                this.startPolling();
            }
        }

        if (roomData.status === 'finished') {
            // 检查弹窗是否已经显示，避免重复显示
            const modal = document.getElementById('game-over-modal');
            const isModalAlreadyShown = modal && modal.classList.contains('show');

            // 只在非回顾模式下显示游戏结束弹窗
            if (!isModalAlreadyShown && !this.history.isReviewMode) {
                if (roomData.winner === this.playerId) {
                    statusElement.textContent = '你赢了！';
                    statusElement.className = 'status-winner';
                    this.showMessage('恭喜获胜！', 'success');
                    this.showGameOverModal('你赢了！', '恭喜你赢得了这局游戏！', roomData);
                    // 播放胜利音效
                    this.audioManager.playWinSound();
                } else if (roomData.is_draw) {
                    statusElement.textContent = '和棋';
                    statusElement.className = 'status-draw';
                    this.showGameOverModal('和棋', '这局游戏以平局结束！', roomData);
                    // 播放和棋音效
                    this.audioManager.playDrawSound();
                } else {
                    statusElement.textContent = '你输了';
                    statusElement.className = 'status-lose';
                    this.showGameOverModal('你输了', '很遗憾，这局游戏你输了，再接再厉！', roomData);
                    // 播放失败音效
                    this.audioManager.playLoseSound();
                }
            }

            // 游戏结束时不要停止轮询，以便接收再来一局的请求
            // 注释掉停止轮询的代码
            // this.stopPolling();

        } else if (roomData.status === 'playing') {
            if (this.currentTurn === this.playerId) {
                statusElement.textContent = '轮到你了';
                statusElement.className = 'status-your-turn';
                turnIndicator.textContent = '请落子';
                
                // 如果刚刚轮到玩家，播放提醒音效（避免重复播放）
                if (prevStatus !== 'playing' || this.currentTurn !== this.playerId) {
                    this.audioManager.playTurnSound();
                }
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

    updatePlayerInfo(player, opponent) {
        // 更新玩家信息的实现
        // 这里可以根据需要添加具体的实现
    }

    addChatMessage(chat, isOwn) {
        const chatMessages = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${isOwn ? 'own' : ''}`;

        // 添加消息ID属性，用于识别消息
        if (chat.id) {
            messageElement.setAttribute('data-message-id', chat.id);
        }

        const time = new Date(chat.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const messageText = chat.message || chat.content || ''; // 兼容两种字段名
        messageElement.innerHTML = `
            <div class="chat-meta">
                <span class="chat-sender">${isOwn ? '我' : chat.player}</span>
                <span class="chat-time">${time}</span>
            </div>
            <div class="chat-content">${this.escapeHtml(messageText)}</div>
        `;

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    initEventListeners() {
        // 聊天发送
        document.getElementById('send-chat').addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            const message = input.value.trim();
            if (message) {
                this.communication.sendChat(message);
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
            this.communication.requestUndo();
        });

        // 和棋按钮
        document.getElementById('draw-btn').addEventListener('click', () => {
            this.communication.requestDraw();
        });

        // 添加音效开关按钮
        const soundToggleBtn = document.getElementById('sound-toggle-btn');
        if (soundToggleBtn) {
            soundToggleBtn.addEventListener('click', () => {
                const isEnabled = this.audioManager.toggleSound();
                soundToggleBtn.innerHTML = isEnabled ? 
                    '<i class="fas fa-volume-up"></i> 音效开启' : 
                    '<i class="fas fa-volume-mute"></i> 音效关闭';
                this.showMessage(isEnabled ? '音效已开启' : '音效已关闭', 'info');
            });
        }

        // 离开房间按钮
        const leaveBtnElem = document.getElementById('leave-btn');
        if (leaveBtnElem) {
            leaveBtnElem.addEventListener('click', (e) => {
                // 防止锚点默认导航
                if (e && e.preventDefault) e.preventDefault();
                // 如果页面是从资料页打开（回顾模式），返回到来源页或资料页；否则回大厅
                try {
                    if (this.history.isOpenedFromProfile && this.history.isOpenedFromProfile()) {
                        // 优先使用同源 referrer
                        const ref = document.referrer || '';
                        try {
                            if (ref && ref.indexOf(window.location.origin) === 0) {
                                window.location.href = ref;
                                return;
                            }
                        } catch (e) { /* ignore */ }
                        // fallback to profile root
                        window.location.href = '/profile/';
                        return;
                    }
                } catch (e) {
                    // ignore and fallback
                }
                window.location.href = '/lobby/';
            });
        }

        // 移动历史 上一步/下一步 按钮绑定（如果存在）
        const prevBtn = document.getElementById('prev-move-btn');
        const nextBtn = document.getElementById('next-move-btn');
        if (prevBtn) prevBtn.addEventListener('click', () => this.history.prevHistory());
        if (nextBtn) nextBtn.addEventListener('click', () => this.history.nextHistory());

        // 游戏结束弹窗的离开按钮（也应遵循回顾模式返回资料页）
        const leaveGameBtn = document.getElementById('leave-game-btn');
        if (leaveGameBtn) {
            leaveGameBtn.addEventListener('click', (e) => {
                if (e && e.preventDefault) e.preventDefault();
                try {
                    if (this.history.isOpenedFromProfile && this.history.isOpenedFromProfile()) {
                        const ref = document.referrer || '';
                        try {
                            if (ref && ref.indexOf(window.location.origin) === 0) {
                                window.location.href = ref;
                                return;
                            }
                        } catch (e) { /* ignore */ }
                        window.location.href = '/profile/';
                        return;
                    }
                } catch (e) {
                    // ignore
                }
                window.location.href = '/lobby/';
            });
        }

        // 键盘事件监听器 - 左右箭头键控制历史导航
        document.addEventListener('keydown', (e) => {
            // 只有在游戏已结束并且有移动历史时才响应键盘事件
            if (this.gameStatus === 'finished' && this.history.moveList && this.history.moveList.length > 0) {
                // 左箭头键 - 上一步
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.history.prevHistory();
                }
                // 右箭头键 - 下一步
                else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.history.nextHistory();
                }
            }
        });
    }

    // 启动会话更新器，定期更新用户在线状态
    startSessionUpdater() {
        // 获取CSRF令牌
        const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;

        // 每2分钟更新一次会话活动时间
        this.sessionUpdateInterval = setInterval(() => {
            // 只在页面可见时更新session
            if (!document.hidden) {
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
            }
        }, 120000); // 120000毫秒 = 2分钟

        // 监听页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // 页面隐藏时，停止轮询和session更新
                if (this.pollingInterval) {
                    clearInterval(this.pollingInterval);
                    this.pollingInterval = null;
                }
            } else {
                // 页面重新可见时，恢复轮询
                if (!this.pollingInterval) {
                    this.startPolling();
                }
                // 立即更新一次session
                fetch('/api/update-session/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrftoken
                    }
                }).catch(error => {
                    console.error('更新会话活动时间出错:', error);
                });
            }
        });

        // 监听页面关闭/刷新事件，清理session
        window.addEventListener('beforeunload', () => {
            // 使用 sendBeacon 发送异步请求，即使页面关闭也能发送
            const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
            navigator.sendBeacon('/api/clear-session/', blob);
        });
    }

    // 启动轮询
    startPolling() {
        // 每0.5秒轮询一次房间状态
        this.pollingInterval = setInterval(() => {
            this.communication.updateRoomState();
        }, 500);
    }

    // 停止轮询
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // 获取CSRF令牌
    getCsrfToken() {
        const token = document.querySelector('[name=csrfmiddlewaretoken]');
        return token ? token.value : '';
    }

    // 显示消息提示
    showMessage(message, type = 'info') {
        // 创建消息元素
        const messageEl = document.createElement('div');
        messageEl.className = `message-toast message-${type}`;
        messageEl.textContent = message;

        // 添加样式
        messageEl.style.position = 'fixed';
        messageEl.style.top = '20px';
        messageEl.style.right = '20px';
        messageEl.style.padding = '15px 20px';
        messageEl.style.borderRadius = '8px';
        messageEl.style.zIndex = '10000';
        messageEl.style.minWidth = '200px';
        messageEl.style.maxWidth = '400px';
        messageEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        messageEl.style.animation = 'slideIn 0.3s ease-out';

        // 根据类型设置颜色
        if (type === 'success') {
            messageEl.style.backgroundColor = '#28a745';
            messageEl.style.color = 'white';
        } else if (type === 'error') {
            messageEl.style.backgroundColor = '#dc3545';
            messageEl.style.color = 'white';
        } else if (type === 'info') {
            messageEl.style.backgroundColor = '#17a2b8';
            messageEl.style.color = 'white';
        } else {
            messageEl.style.backgroundColor = '#ffc107';
            messageEl.style.color = '#333';
        }

        document.body.appendChild(messageEl);

        // 3秒后自动移除
        setTimeout(() => {
            messageEl.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        }, 3000);
    }

    // HTML转义函数
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 显示游戏结束弹窗
    showGameOverModal(title, message, roomData = null) {
        const modal = document.getElementById('game-over-modal');
        const titleEl = document.getElementById('game-result-title');
        const messageEl = document.getElementById('game-result-message');
        const statsEl = document.getElementById('game-stats');

        if (modal && titleEl && messageEl) {
            titleEl.textContent = title;
            messageEl.textContent = message;

            // 显示游戏统计数据
            if (statsEl) {
                // 计算总步数
                const totalMoves = this.history.moveList ? this.history.moveList.length : 0;

                // 计算游戏用时
                let gameDuration = '未知';
                if (roomData && roomData.created_at) {
                    try {
                        const startTime = new Date(roomData.created_at);
                        // 如果有finished_at，使用它；否则使用当前时间
                        const endTime = roomData.finished_at ? new Date(roomData.finished_at) : new Date();
                        const durationMs = endTime - startTime;
                        const minutes = Math.floor(durationMs / 60000);
                        const seconds = Math.floor((durationMs % 60000) / 1000);
                        gameDuration = `${minutes}分${seconds}秒`;
                    } catch (e) {
                        console.error('计算游戏时长失败:', e);
                    }
                }

                statsEl.innerHTML = `
                    <div class="game-stats-container">
                        <div class="stat-item">
                            <i class="fas fa-chess-board"></i>
                            <span class="stat-label">总步数</span>
                            <span class="stat-value">${totalMoves}</span>
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-clock"></i>
                            <span class="stat-label">用时</span>
                            <span class="stat-value">${gameDuration}</span>
                        </div>
                    </div>
                `;
            }

            modal.classList.add('show');

            // 绑定再来一局按钮
            const playAgainBtn = document.getElementById('play-again-btn');
            if (playAgainBtn) {
                playAgainBtn.onclick = () => {
                    this.communication.requestRematch();
                };
            }
        }
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

        // 如果游戏已结束，显示游戏结束弹窗
        const statusElement = document.getElementById('game-status');
        if (statusElement) {
            const statusText = statusElement.textContent;
            if (statusText.includes('你赢了') || statusText.includes('你输了') || statusText.includes('和棋')) {
                // 延迟一点时间再显示弹窗，确保页面完全加载
                setTimeout(() => {
                    // 如果页面来自资料页 recent-games，则不要显示弹窗
                    if (window.game && window.game.history.isOpenedFromProfile && window.game.history.isOpenedFromProfile()) {
                        console.log('Suppressing initial game-over modal because page was opened from profile.');
                        return;
                    }
                    if (statusText.includes('你赢了')) {
                        window.game.showGameOverModal('你赢了！', '恭喜你赢得了这局游戏！');
                    } else if (statusText.includes('和棋')) {
                        window.game.showGameOverModal('和棋', '这局游戏以平局结束！');
                    } else if (statusText.includes('你输了')) {
                        window.game.showGameOverModal('你输了', '很遗憾，这局游戏你输了，再接再厉！');
                    }
                }, 500);
            }
        }
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
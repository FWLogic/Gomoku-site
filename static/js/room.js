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
        this.gameStatus = null;  // 初始化游戏状态
        this.lastRematchStatus = null;  // 初始化再来一局请求状态
        this.lastUndoStatus = null;  // 初始化悔棋请求状态
        this.lastDrawStatus = null;  // 初始化和棋请求状态

        // 用于去重移动历史项（key 格式：moveNumber|coords|player）
        this.knownMoveKeys = new Set();

        this.initBoard();
        this.initEventListeners();

        // 初始化已存在的移动历史到已知集合（如果模板里已经渲染了一些）
        this.initKnownMoves();

        this.startPolling();
        this.startSessionUpdater();
    }

    initBoard() {
        const boardElement = document.getElementById('chessboard');
        boardElement.innerHTML = '';
        boardElement.style.gridTemplateColumns = `repeat(${this.boardSize}, 1fr)`;

        // 初始化棋盘数据数组
        this.board = [];
        for (let row = 0; row < this.boardSize; row++) {
            this.board[row] = [];
            for (let col = 0; col < this.boardSize; col++) {
                this.board[row][col] = 0;
            }
        }

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

    // 初始化已存在的移动历史到 this.knownMoveKeys，防止重复显示
    initKnownMoves() {
        try {
            const container = document.getElementById('move-history');
            if (!container) return;
            container.querySelectorAll('.move-item').forEach(item => {
                const numEl = item.querySelector('.move-number');
                const coordsEl = item.querySelector('.move-coords');
                const playerEl = item.querySelector('.move-player');
                const num = numEl ? numEl.textContent.replace('#','').trim() : '';
                const coords = coordsEl ? coordsEl.textContent.trim() : '';
                const player = playerEl ? playerEl.textContent.trim() : '';
                const key = `${num}|${coords}|${player}`;
                this.knownMoveKeys.add(key);
            });
        } catch (e) {
            // 忽略初始化失败
            console.error('initKnownMoves error', e);
        }
    }

    // 将单个 move 对象追加到移动历史（去重、滚动、保留最大条目）
    addMoveToHistory(move) {
        try {
            if (!move) return;

            const container = document.getElementById('move-history');
            if (!container) return;

            // 提取字段。兼容不同后端返回格式
            const moveNumber = (move.move_number !== undefined && move.move_number !== null) ? move.move_number : (move.number !== undefined ? move.number : '');
            const row = (move.row !== undefined && move.row !== null) ? (Number(move.row) + 1) : (move.r !== undefined ? move.r : '');
            const col = (move.col !== undefined && move.col !== null) ? (Number(move.col) + 1) : (move.c !== undefined ? move.c : '');
            const coordsText = (row !== '' && col !== '') ? `(${row}, ${col})` : (move.coords || '');

            let playerName = '';
            if (move.player_username) playerName = move.player_username;
            else if (move.player_name) playerName = move.player_name;
            else if (move.player && typeof move.player === 'string') playerName = move.player;
            else if (move.player && move.player.user && move.player.user.username) playerName = move.player.user.username;

            const key = `${moveNumber}|${coordsText}|${playerName}`;

            if (this.knownMoveKeys.has(key)) return; // 已存在，跳过

            const el = document.createElement('div');
            el.className = 'move-item';
            el.innerHTML = `
                <span class="move-number">#${this.escapeHtml(String(moveNumber))}</span>
                <span class="move-coords">${this.escapeHtml(coordsText)}</span>
                <span class="move-player">${this.escapeHtml(playerName)}</span>
            `;

            container.appendChild(el);
            // 限制条目数，保留最新的 50 条
            const maxItems = 50;
            while (container.children.length > maxItems) {
                container.removeChild(container.firstChild);
            }
            container.scrollTop = container.scrollHeight;
            this.knownMoveKeys.add(key);
        } catch (e) {
            console.error('addMoveToHistory error', e);
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
            // 清空输入框
            document.getElementById('chat-input').value = '';

            // 发送到服务器
            const response = await fetch(`/room/${this.roomCode}/chat/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();

            if (!data.success) {
                // 如果发送失败，显示错误消息
                this.showMessage(data.error || '发送消息失败', 'error');
                // 恢复输入框内容
                document.getElementById('chat-input').value = message;
            }
        } catch (error) {
            console.error('发送消息失败:', error);
            this.showMessage('网络错误，消息发送失败', 'error');
            // 恢复输入框内容
            document.getElementById('chat-input').value = message;
        }
    }

    async requestUndo() {
        try {
            const response = await fetch(`/room/${this.roomCode}/undo/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                if (data.board) {
                    // 悔棋成功，更新棋盘
                    this.updateBoard(data.board);
                    this.currentTurn = data.current_turn;
                }
                this.showMessage(data.message || '操作成功', 'success');
            } else {
                this.showMessage(data.error || '操作失败', 'error');
            }
        } catch (error) {
            console.error('悔棋请求失败:', error);
            this.showMessage('网络错误，请重试', 'error');
        }
    }

    async rejectUndo() {
        try {
            const response = await fetch(`/room/${this.roomCode}/reject_undo/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                this.showMessage(data.message || '已拒绝悔棋请求', 'success');
                
                // 移除按钮组，显示原始悔棋按钮
                const btnGroup = document.getElementById('undo-btn-group');
                if (btnGroup) {
                    btnGroup.remove();
                }
                
                // 恢复原始悔棋按钮
                const undoBtn = document.getElementById('undo-btn');
                if (undoBtn) {
                    undoBtn.style.display = 'block';
                    undoBtn.innerHTML = '<i class="fas fa-undo"></i> 悔棋';
                    undoBtn.classList.remove('btn-success', 'btn-danger');
                    undoBtn.classList.add('btn-warning');
                    undoBtn.disabled = false;
                }
            } else {
                this.showMessage(data.error || '操作失败', 'error');
            }
        } catch (error) {
            console.error('拒绝悔棋请求失败:', error);
            this.showMessage('网络错误，请重试', 'error');
        }
    }

    async requestDraw() {
        try {
            const response = await fetch(`/room/${this.roomCode}/draw/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                if (data.status) {
                    // 和棋成功，游戏结束
                    this.showMessage(data.message || '游戏以和棋结束', 'success');
                    this.updateGameState(data);
                } else {
                    // 发送和棋请求成功
                    this.showMessage(data.message || '和棋请求已发送', 'success');
                }
            } else {
                this.showMessage(data.error || '和棋请求失败', 'error');
            }
        } catch (error) {
            console.error('和棋请求失败:', error);
            this.showMessage('网络错误，请重试', 'error');
        }
    }

    async rejectDraw() {
        try {
            const response = await fetch(`/room/${this.roomCode}/reject_draw/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                this.showMessage(data.message || '已拒绝和棋请求', 'success');
            } else {
                this.showMessage(data.error || '操作失败', 'error');
            }
        } catch (error) {
            console.error('拒绝和棋请求失败:', error);
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
            
            // 添加调试日志
            if (data.room.rematch_requested_by) {
                console.log(`再来一局请求状态: ${data.room.rematch_requested_by === this.playerId ? '自己请求' : '对手请求'}`);
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
                    // 检查消息是否已经存在
                    const messageId = chat.id;
                    const messageExists = document.querySelector(`.chat-message[data-message-id="${messageId}"]`);

                    // 只有当消息不存在时才显示
                    if (!messageExists) {
                        const isOwnMessage = chat.player_id === this.playerId;
                        this.addChatMessage(chat, isOwnMessage);
                    }

                    this.lastChatId = Math.max(this.lastChatId, chat.id);
                });
            }

            // 更新最后一步
            if (data.last_move) {
                this.lastMove = data.last_move;
                this.highlightLastMove();
                // 将最后一步追加到移动历史（实时更新）
                this.addMoveToHistory(data.last_move);
            }

            // 如果后端一次性返回 move history 数组，也一并同步（兼容性）
            if (data.move_history && Array.isArray(data.move_history)) {
                data.move_history.forEach(m => this.addMoveToHistory(m));
            }
            
            // 处理通知
            if (data.room.notification_message) {
                this.showMessage(data.room.notification_message, 'info');
            }
            
            // 检查悔棋请求状态
            if (data.room.undo_requested_by) {
                if (data.room.undo_requested_by !== this.playerId) {
                    // 对方发送了悔棋请求，但只有状态发生变化时才显示通知
                    if (this.lastUndoStatus !== data.room.undo_requested_by) {
                        this.showMessage('对手请求悔棋，请选择同意或拒绝', 'info');
                    }
                    
                    // 创建悔棋按钮组
                    const undoContainer = document.getElementById('undo-btn').parentNode;
                    const existingBtnGroup = document.getElementById('undo-btn-group');
                    
                    // 如果按钮组已存在，先删除
                    if (existingBtnGroup) {
                        existingBtnGroup.remove();
                    }
                    
                    // 创建新按钮组
                    const btnGroup = document.createElement('div');
                    btnGroup.id = 'undo-btn-group';
                    btnGroup.className = 'btn-group';
                    btnGroup.style.display = 'flex';
                    btnGroup.style.gap = '5px';
                    
                    // 隐藏原始悔棋按钮
                    const undoBtn = document.getElementById('undo-btn');
                    undoBtn.style.display = 'none';
                    
                    // 创建同意按钮
                    const acceptBtn = document.createElement('button');
                    acceptBtn.className = 'btn btn-success';
                    acceptBtn.innerHTML = '<i class="fas fa-check"></i> 同意悔棋';
                    acceptBtn.addEventListener('click', () => {
                        this.requestUndo();
                    });
                    
                    // 创建拒绝按钮
                    const rejectBtn = document.createElement('button');
                    rejectBtn.className = 'btn btn-danger';
                    rejectBtn.innerHTML = '<i class="fas fa-times"></i> 拒绝悔棋';
                    rejectBtn.addEventListener('click', () => {
                        this.rejectUndo();
                    });
                    
                    // 将按钮添加到按钮组
                    btnGroup.appendChild(acceptBtn);
                    btnGroup.appendChild(rejectBtn);
                    
                    // 将按钮组添加到容器
                    undoContainer.appendChild(btnGroup);
                } else {
                    // 自己发送了悔棋请求
                    // 更新悔棋按钮文本
                    const undoBtn = document.getElementById('undo-btn');
                    if (undoBtn) {
                        undoBtn.innerHTML = '<i class="fas fa-clock"></i> 等待回应';
                        undoBtn.disabled = true;
                    }
                }
            } else {
                // 没有悔棋请求，重置按钮状态
                
                // 移除按钮组（如果存在）
                const btnGroup = document.getElementById('undo-btn-group');
                if (btnGroup) {
                    btnGroup.remove();
                }
                
                // 重置原始悔棋按钮
                const undoBtn = document.getElementById('undo-btn');
                if (undoBtn && data.room.status === 'playing') {
                    undoBtn.style.display = 'block';
                    undoBtn.innerHTML = '<i class="fas fa-undo"></i> 悔棋';
                    undoBtn.classList.remove('btn-success', 'btn-danger');
                    undoBtn.classList.add('btn-warning');
                    undoBtn.disabled = false;
                }
            }
            
            // 检查和棋请求状态
            if (data.room.draw_requested_by) {
                if (data.room.draw_requested_by !== this.playerId) {
                    // 对方发送了和棋请求，但只有状态发生变化时才显示通知
                    if (this.lastDrawStatus !== data.room.draw_requested_by) {
                        this.showMessage('对手请求和棋，请选择同意或拒绝', 'info');
                    }
                    
                    // 创建和棋按钮组
                    const drawContainer = document.getElementById('draw-btn').parentNode;
                    const existingBtnGroup = document.getElementById('draw-btn-group');

                    // 如果按钮组已存在，先删除
                    if (existingBtnGroup) {
                        existingBtnGroup.remove();
                    }

                    // 创建新按钮组
                    const btnGroup = document.createElement('div');
                    btnGroup.id = 'draw-btn-group';
                    btnGroup.className = 'btn-group';
                    btnGroup.style.display = 'flex';
                    btnGroup.style.gap = '5px';

                    // 隐藏原始和棋按钮
                    const drawBtn = document.getElementById('draw-btn');
                    drawBtn.style.display = 'none';

                    // 创建同意按钮
                    const acceptBtn = document.createElement('button');
                    acceptBtn.className = 'btn btn-success';
                    acceptBtn.innerHTML = '<i class="fas fa-check"></i> 同意和棋';
                    acceptBtn.addEventListener('click', () => {
                        this.requestDraw();
                    });

                    // 创建拒绝按钮
                    const rejectBtn = document.createElement('button');
                    rejectBtn.className = 'btn btn-danger';
                    rejectBtn.innerHTML = '<i class="fas fa-times"></i> 拒绝和棋';
                    rejectBtn.addEventListener('click', () => {
                        this.rejectDraw();
                    });

                    // 将按钮添加到按钮组
                    btnGroup.appendChild(acceptBtn);
                    btnGroup.appendChild(rejectBtn);

                    // 将按钮组添加到容器
                    drawContainer.appendChild(btnGroup);
                } else {
                    // 自己发送了和棋请求
                    // 更新和棋按钮文本
                    const drawBtn = document.getElementById('draw-btn');
                    if (drawBtn) {
                        drawBtn.innerHTML = '<i class="fas fa-clock"></i> 等待回应';
                        drawBtn.disabled = true;
                    }
                }
            } else {
                // 没有和棋请求，重置按钮状态
                
                // 移除按钮组（如果存在）
                const btnGroup = document.getElementById('draw-btn-group');
                if (btnGroup) {
                    btnGroup.remove();
                }

                // 重置原始和棋按钮
                const drawBtn = document.getElementById('draw-btn');
                if (drawBtn && data.room.status === 'playing') {
                    drawBtn.style.display = 'block';
                    drawBtn.innerHTML = '<i class="fas fa-handshake"></i> 和棋';
                    drawBtn.classList.remove('btn-success', 'btn-danger');
                    drawBtn.classList.add('btn-secondary');
                    drawBtn.disabled = false;
                }
            }
            
            // 更新悔棋和和棋请求状态
            this.lastUndoStatus = data.room.undo_requested_by;
            this.lastDrawStatus = data.room.draw_requested_by;

            // 检查再来一局请求状态
            const prevRematchStatus = this.lastRematchStatus;
            const currentRematchStatus = data.room.rematch_requested_by;
            
            // 检查是否从有请求状态变为无请求状态，且之前是自己发起的请求
            if (prevRematchStatus === this.playerId && !currentRematchStatus && this.gameStatus === 'finished') {
                // 自己的请求被对方拒绝了
                this.showMessage('对方拒绝了你的再来一局请求', 'info');
                
                // 重置按钮状态
                const playAgainBtn = document.getElementById('play-again-btn');
                if (playAgainBtn) {
                    playAgainBtn.innerHTML = '<i class="fas fa-redo"></i> 再来一局';
                    playAgainBtn.classList.remove('btn-success');
                    playAgainBtn.classList.add('btn-primary');
                    playAgainBtn.disabled = false;
                }
            }
            
            // 只有状态发生变化时才更新UI
            if (prevRematchStatus !== currentRematchStatus) {
                this.lastRematchStatus = currentRematchStatus;
                
                if (currentRematchStatus) {
                if (data.room.rematch_requested_by !== this.playerId) {
                    // 对手发送了再来一局请求
                    this.showMessage('对手请求再来一局，点击再来一局按钮同意，或点击离开按钮拒绝', 'info');
                    // 更新再来一局按钮文本
                    const playAgainBtn = document.getElementById('play-again-btn');
                    if (playAgainBtn) {
                        playAgainBtn.innerHTML = '<i class="fas fa-check"></i> 同意再来一局';
                        playAgainBtn.classList.remove('btn-primary');
                        playAgainBtn.classList.add('btn-success');
                        playAgainBtn.disabled = false;
                    }
                    // 更新离开按钮文本，表示可以拒绝请求
                    const leaveBtn = document.getElementById('leave-game-btn');
                    if (leaveBtn) {
                        leaveBtn.innerHTML = '<i class="fas fa-times"></i> 拒绝再来一局';
                        leaveBtn.classList.remove('btn-secondary');
                        leaveBtn.classList.add('btn-danger');
                    }
                } else {
                    // 自己发送了再来一局请求
                    // 更新再来一局按钮文本
                    const playAgainBtn = document.getElementById('play-again-btn');
                    if (playAgainBtn) {
                        playAgainBtn.innerHTML = '<i class="fas fa-clock"></i> 等待回应';
                        playAgainBtn.disabled = true;
                    }
                }
            } else {
                // 没有再来一局请求，或者请求已被处理
                // 检查是否是游戏重新开始（从有请求变为无请求）
                if (prevRematchStatus && data.room.status === 'playing' && this.gameStatus === 'finished') {
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
                        this.knownMoveKeys.clear();
                    } catch (e) {
                        // ignore
                    }

                    // 重新启用棋盘点击
                    document.querySelectorAll('.cell').forEach(cell => {
                        cell.style.cursor = 'pointer';
                        cell.onclick = null;
                        const row = parseInt(cell.dataset.row);
                        const col = parseInt(cell.dataset.col);
                        cell.addEventListener('click', () => this.handleCellClick(row, col));
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
                
                // 重置按钮状态
                const playAgainBtn = document.getElementById('play-again-btn');
                if (playAgainBtn) {
                    playAgainBtn.innerHTML = '<i class="fas fa-redo"></i> 再来一局';
                    playAgainBtn.classList.remove('btn-success');
                    playAgainBtn.classList.add('btn-primary');
                    playAgainBtn.disabled = false;
                }
                // 重置离开按钮状态
                const leaveBtn = document.getElementById('leave-game-btn');
                if (leaveBtn) {
                    leaveBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 离开';
                    leaveBtn.classList.remove('btn-danger');
                    leaveBtn.classList.add('btn-secondary');
                }
                }
            }

        } catch (error) {
            console.error('更新房间状态失败:', error);
        }
    }

    updateGameState(roomData) {
        const statusElement = document.getElementById('game-status');
        const turnIndicator = document.getElementById('turn-indicator');

        // 检查游戏状态是否从非结束状态变为结束状态
        const wasNotFinished = this.gameStatus !== 'finished';
        const wasFinished = this.gameStatus === 'finished';
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
                this.knownMoveKeys.clear();
            } catch (e) {
                // ignore
            }

            // 重新启用棋盘点击
            document.querySelectorAll('.cell').forEach(cell => {
                cell.style.cursor = 'pointer';
                cell.onclick = null;
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                cell.addEventListener('click', () => this.handleCellClick(row, col));
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

            if (!isModalAlreadyShown) {
                if (roomData.winner === this.playerId) {
                    statusElement.textContent = '你赢了！';
                    statusElement.className = 'status-winner';
                    this.showMessage('恭喜获胜！', 'success');
                    this.showGameOverModal('你赢了！', '恭喜你赢得了这局游戏！');
                } else if (roomData.is_draw) {
                    statusElement.textContent = '和棋';
                    statusElement.className = 'status-draw';
                    this.showGameOverModal('和棋', '这局游戏以平局结束！');
                } else {
                    statusElement.textContent = '你输了';
                    statusElement.className = 'status-lose';
                    this.showGameOverModal('你输了', '很遗憾，这局游戏你输了，再接再厉！');
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
            // 保留现有的统计信息（如果有）
            const existingStatsElement = opponentElement.querySelector('.stats-grid');
            let statsHtml = '';
            
            if (existingStatsElement) {
                statsHtml = existingStatsElement.outerHTML;
            }
            
            opponentElement.innerHTML = `
                <div class="player-name">${opponentData.username}</div>
                <div class="player-color color-${opponentData.color}">
                    ${opponentData.color === 'black' ? '黑棋' : '白棋'}
                </div>
                ${statsHtml}
            `;
        } else {
            // 只有在对手不存在时才更新为等待状态
            if (!opponentElement.querySelector('.player-name') || 
                opponentElement.querySelector('.player-name').textContent === '等待对手...') {
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
            window.location.href = '/lobby/';
        });
    }

    startPolling() {
        // 如果已经有轮询在运行，先停止它
        this.stopPolling();
        // 开始新的轮询，减少轮询间隔到500毫秒，提高响应速度
        this.pollingInterval = setInterval(() => {
            this.updateRoomState();
        }, 500); // 每0.5秒轮询一次
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

    // 显示游戏结束弹窗
    showGameOverModal(title, message) {
        try {
            const modal = document.getElementById('game-over-modal');
            const titleElement = document.getElementById('game-result-title');
            const messageElement = document.getElementById('game-result-message');
            const statsElement = document.getElementById('game-stats');

            // 检查元素是否存在
            if (!modal || !titleElement || !messageElement || !statsElement) {
                this.showMessage('游戏结束，但无法显示结果弹窗', 'error');
                return;
            }

            // 设置标题和消息
            titleElement.textContent = title;
            messageElement.textContent = message;

            // 设置游戏统计信息
            let totalMoves = 0;
            try {
                totalMoves = this.getTotalMoves();
            } catch (error) {
                // 静默处理错误
            }

            let gameDuration = '未知';
            try {
                gameDuration = this.getGameDuration();
            } catch (error) {
                // 静默处理错误
            }

            statsElement.innerHTML = `
                <div class="stat-box">
                    <div class="stat-label">总步数</div>
                    <div class="stat-value">${totalMoves}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">游戏时长</div>
                    <div class="stat-value">${gameDuration}</div>
                </div>
            `;

            // 显示弹窗
            modal.classList.add('show');

            // 移除旧的事件监听器，避免重复绑定
            const leaveBtn = document.getElementById('leave-game-btn');
            const playAgainBtn = document.getElementById('play-again-btn');
            
            // 克隆节点以移除所有事件监听器
            if (leaveBtn) {
                const newLeaveBtn = leaveBtn.cloneNode(true);
                leaveBtn.parentNode.replaceChild(newLeaveBtn, leaveBtn);
                newLeaveBtn.addEventListener('click', () => {
                    // 检查是否有对手的再来一局请求
                    if (this.lastRematchStatus && this.lastRematchStatus !== this.playerId) {
                        // 有对手的再来一局请求，拒绝它
                        this.rejectRematch();
                    } else {
                        // 没有请求或自己的请求，直接离开
                        this.leaveGame();
                    }
                });
            }
            
            if (playAgainBtn) {
                const newPlayAgainBtn = playAgainBtn.cloneNode(true);
                playAgainBtn.parentNode.replaceChild(newPlayAgainBtn, playAgainBtn);
                newPlayAgainBtn.addEventListener('click', () => {
                    this.playAgain();
                });
            }
        } catch (error) {
            this.showMessage('游戏结束，但无法显示结果弹窗', 'error');
        }
    }

    // 计算总步数
    getTotalMoves() {
        let count = 0;
        try {
            // 确保棋盘数据存在
            if (!this.board || !Array.isArray(this.board)) {
                return 0;
            }

            for (let row = 0; row < this.boardSize; row++) {
                // 检查行是否存在
                if (!this.board[row] || !Array.isArray(this.board[row])) {
                    continue;
                }

                for (let col = 0; col < this.boardSize; col++) {
                    if (this.board[row][col] !== 0 && this.board[row][col] !== undefined && this.board[row][col] !== null) {
                        count++;
                    }
                }
            }
        } catch (error) {
            console.error('计算总步数出错:', error);
            return 0;
        }
        return count;
    }

    // 计算游戏时长
    getGameDuration() {
        // 这里应该从服务器获取游戏开始时间，这里简化处理
        return '未知';
    }

    // 离开游戏
    leaveGame() {
        window.location.href = '/lobby/';
    }

    // 拒绝再来一局请求
    async rejectRematch() {
        try {
            // 向服务器发送拒绝请求
            const response = await fetch(`/room/${this.roomCode}/reject_rematch/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                this.showMessage(data.message || '已拒绝再来一局请求', 'success');
                
                // 重置按钮状态
                const playAgainBtn = document.getElementById('play-again-btn');
                if (playAgainBtn) {
                    playAgainBtn.innerHTML = '<i class="fas fa-redo"></i> 再来一局';
                    playAgainBtn.classList.remove('btn-success');
                    playAgainBtn.classList.add('btn-primary');
                    playAgainBtn.disabled = false;
                }
                
                const leaveBtn = document.getElementById('leave-game-btn');
                if (leaveBtn) {
                    leaveBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 离开';
                    leaveBtn.classList.remove('btn-danger');
                    leaveBtn.classList.add('btn-secondary');
                }
                
                // 更新状态，表示已处理请求
                this.lastRematchStatus = null;
            } else {
                this.showMessage(data.error || '操作失败', 'error');
            }
        } catch (error) {
            console.error('拒绝再来一局请求失败:', error);
            this.showMessage('网络错误，请重试', 'error');
        }
    }

    // 再来一局
    async playAgain() {
        // 防止重复点击
        const playAgainBtn = document.getElementById('play-again-btn');
        if (playAgainBtn && playAgainBtn.disabled) {
            return;
        }
        
        try {
            const response = await fetch(`/room/${this.roomCode}/rematch/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                if (data.status) {
                    // 再来一局成功，游戏重新开始
                    this.showMessage(data.message || '游戏重新开始', 'success');
                    this.updateBoard(data.board);
                    this.gameStatus = data.status;
                    this.currentTurn = data.current_turn;
                    this.updateGameState({
                        status: data.status,
                        current_turn: { id: data.current_turn },
                        winner: null,
                        is_draw: false
                    });
                    
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
                        this.knownMoveKeys.clear();
                    } catch (e) {
                        // ignore
                    }

                    // 重新启用棋盘点击
                    document.querySelectorAll('.cell').forEach(cell => {
                        cell.style.cursor = 'pointer';
                        cell.onclick = null;
                        const row = parseInt(cell.dataset.row);
                        const col = parseInt(cell.dataset.col);
                        cell.addEventListener('click', () => this.handleCellClick(row, col));
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
                    
                    // 重新开始轮询
                    this.startPolling();
                } else {
                    // 发送再来一局请求成功
                    this.showMessage(data.message || '再来一局请求已发送', 'success');
                    
                    // 更新按钮状态
                    const playAgainBtn = document.getElementById('play-again-btn');
                    if (playAgainBtn) {
                        playAgainBtn.innerHTML = '<i class="fas fa-clock"></i> 等待回应';
                        playAgainBtn.disabled = true;
                    }
                }
            } else {
                this.showMessage(data.error || '再来一局请求失败', 'error');
            }
        } catch (error) {
            console.error('再来一局请求失败:', error);
            this.showMessage('网络错误，请重试', 'error');
        }
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

        // 如果游戏已结束，显示游戏结束弹窗
        const statusElement = document.getElementById('game-status');
        if (statusElement) {
            const statusText = statusElement.textContent;
            if (statusText.includes('你赢了') || statusText.includes('你输了') || statusText.includes('和棋')) {
                // 延迟一点时间再显示弹窗，确保页面完全加载
                setTimeout(() => {
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

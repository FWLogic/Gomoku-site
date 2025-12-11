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
        this.initKnownMoves();

        // 如果页面是从资料页 recent-games 打开的（回顾模式），自动显示第一步
        try {
            if (this.isOpenedFromProfile && this.isOpenedFromProfile()) {
                if (this.moveList && this.moveList.length > 0) {
                    // 直接跳到第一步（index 0）并保持历史查看模式
                    this.jumpToMove(0);
                    try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
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

        // 确保格子为正方形：计算基于棋盘可见宽度的高度，并应用到每个 cell（作为兼容性 fallback）
        this.resizeCells();
        // 在窗口尺寸变化时重新计算（节流可在需要时加入）
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
            const availableWidth = rect.width;
            const cellSize = Math.floor(availableWidth / this.boardSize);
            if (!cellSize || cellSize <= 0) return;
            // Expose exact cell pixel size as a CSS variable for precise piece sizing.
            // This allows CSS to compute piece dimensions: --cell-size (e.g. '32px').
            boardElement.style.setProperty('--cell-size', `${cellSize}px`);

            // Keep per-cell inline height as a fallback for older browsers/layout edge cases.
            const cells = boardElement.querySelectorAll('.cell');
            cells.forEach(c => {
                c.style.height = `${cellSize}px`;
                c.style.lineHeight = `${cellSize}px`;
            });
        } catch (e) {
            // 忽略计算错误
            // console.error('resizeCells error', e);
        }
    }

    // 初始化已存在的移动历史到 this.knownMoveKeys，防止重复显示
    initKnownMoves() {
        try {
            const container = document.getElementById('move-history');
            if (!container) return;
            container.querySelectorAll('.move-item').forEach((item, idx) => {
                const numEl = item.querySelector('.move-number');
                const coordsEl = item.querySelector('.move-coords');
                const playerEl = item.querySelector('.move-player');
                const num = numEl ? numEl.textContent.replace('#','').trim() : '';
                const coords = coordsEl ? coordsEl.textContent.trim() : '';
                const player = playerEl ? playerEl.textContent.trim() : '';

                // Normalize key using parsed coords when possible (row:col:player), fallback to move-number based
                let parsedRow = null, parsedCol = null;
                if (coords) {
                    const m = coords.match(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
                    if (m) {
                        parsedRow = parseInt(m[1], 10) - 1;
                        parsedCol = parseInt(m[2], 10) - 1;
                    }
                }
                let key;
                const playerNorm = (player || '').trim() || '__unknown__';
                if (parsedRow !== null && parsedCol !== null) {
                    key = `${parsedRow}:${parsedCol}:${playerNorm}`;
                } else {
                    key = `${num}|${coords}|${playerNorm}`;
                }
                this.knownMoveKeys.add(key);

                // 解析坐标文本 (格式: (r, c))，转换为 0-based
                // parsedRow/parsedCol already computed above

                // 将解析到的历史条目加入 moveList，保证顺序
                const moveNumber = num ? parseInt(num, 10) : (idx + 1);
                if (parsedRow !== null && parsedCol !== null) {
                    const moveObj = { moveNumber: moveNumber, row: parsedRow, col: parsedCol, playerName: playerNorm };
                    this.moveList.push(moveObj);
                    // 给已有条目添加 data-index 方便识别
                    item.dataset.index = String(this.moveList.length - 1);
                    // 绑定点击事件，跳转到对应步数
                    item.addEventListener('click', (e) => {
                        const index = parseInt(item.dataset.index, 10);
                        if (!isNaN(index)) {
                            // 如果已经处于该历史步，则切换回最新
                            if (item.classList.contains('history-active')) {
                                this.showLiveBoard();
                                try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
                            } else {
                                this.jumpToMove(index);
                                try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
                            }
                        }
                    });
                }
            });
        } catch (e) {
            // 忽略初始化失败
            console.error('initKnownMoves error', e);
        }
        // 初始化后更新导航按钮状态
        try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
    }

    // 将单个 move 对象追加到移动历史（去重、滚动、保留最大条目）
    addMoveToHistory(move) {
        try {
            if (!move) return;

            const container = document.getElementById('move-history');
            if (!container) return;

            // 提取字段。兼容不同后端返回格式
            // Ensure we compute a sensible move number when backend doesn't provide one
            let moveNumber = (move.move_number !== undefined && move.move_number !== null) ? move.move_number : (move.number !== undefined ? move.number : null);
            const row = (move.row !== undefined && move.row !== null) ? (Number(move.row) + 1) : (move.r !== undefined ? move.r : '');
            const col = (move.col !== undefined && move.col !== null) ? (Number(move.col) + 1) : (move.c !== undefined ? move.c : '');

            // Fallback: if no explicit move number, infer it from moveList length (next index)
            if (moveNumber === null || moveNumber === '') {
                // If we already have parsed moves, use next sequential number
                moveNumber = this.moveList && this.moveList.length ? (this.moveList.length + 1) : 1;
            }

            const coordsText = (row !== '' && col !== '') ? `(${row}, ${col})` : (move.coords || '');

            let playerName = '';
            if (move.player_username) playerName = move.player_username;
            else if (move.player_name) playerName = move.player_name;
            else if (move.player && typeof move.player === 'string') playerName = move.player;
            else if (move.player && move.player.user && move.player.user.username) playerName = move.player.user.username;

            // Parse numeric coords (0-based) for stable key generation
            let parsedRow = null, parsedCol = null;
            const mCoords = coordsText.match(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
            if (mCoords) {
                parsedRow = parseInt(mCoords[1], 10) - 1;
                parsedCol = parseInt(mCoords[2], 10) - 1;
            } else if (move.row !== undefined && move.col !== undefined) {
                parsedRow = Number(move.row);
                parsedCol = Number(move.col);
            } else if (move.r !== undefined && move.c !== undefined) {
                parsedRow = Number(move.r);
                parsedCol = Number(move.c);
            }

            // Prefer coord-based key for stability; fallback to moveNumber-based key
            const playerNorm = (playerName || '').trim() || '__unknown__';
            const coordKey = (parsedRow !== null && parsedCol !== null) ? `${parsedRow}:${parsedCol}:${playerNorm}` : null;
            const fallbackKey = `${moveNumber}|${coordsText}|${playerNorm}`;

            // If we already have this move (by coord key or fallback), skip
            if ((coordKey && this.knownMoveKeys.has(coordKey)) || this.knownMoveKeys.has(fallbackKey)) return;

            // Also avoid adding duplicates if the last move in moveList matches
            if (this.moveList.length > 0) {
                const last = this.moveList[this.moveList.length - 1];
                if (last && parsedRow !== null && parsedCol !== null) {
                    if (last.row === parsedRow && last.col === parsedCol && (last.playerName||'') === playerNorm) {
                        return;
                    }
                }
            }

            // Choose primary key
            const key = coordKey || fallbackKey;

            const el = document.createElement('div');
            el.className = 'move-item';
            el.innerHTML = `
                <span class="move-number">#${this.escapeHtml(String(moveNumber))}</span>
                <span class="move-coords">${this.escapeHtml(coordsText)}</span>
                <span class="move-player">${this.escapeHtml(playerNorm === '__unknown__' ? playerName : playerNorm)}</span>
            `;

            container.appendChild(el);

            // 将解析后的 move 推入 moveList（统一使用 0-based row/col）
            if (parsedRow !== null && parsedCol !== null) {
                const moveObj = { moveNumber: Number(moveNumber), row: parsedRow, col: parsedCol, playerName: playerNorm };
                this.moveList.push(moveObj);
                 // 给元素设置索引
                 el.dataset.index = String(this.moveList.length - 1);

                 // 点击历史条目时跳转到该步
                 el.addEventListener('click', () => {
                     const index = parseInt(el.dataset.index, 10);
                     if (!isNaN(index)) {
                         if (el.classList.contains('history-active')) {
                             this.showLiveBoard();
                             try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
                         } else {
                             this.jumpToMove(index);
                             try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
                         }
                     }
                 });
            }

            // 限制条目数，保留最新的 50 条
            const maxItems = 50;
            while (container.children.length > maxItems) {
                // remove first DOM child
                const removed = container.removeChild(container.firstChild);
                // sync moveList by removing earliest entry
                if (this.moveList && this.moveList.length > 0) {
                    const removedMove = this.moveList.shift();
                    if (removedMove) {
                        const removedPlayerNorm = (removedMove.playerName || '').trim() || '__unknown__';
                        const removedKey = (removedMove.row !== undefined && removedMove.col !== undefined) ? `${removedMove.row}:${removedMove.col}:${removedPlayerNorm}` : `${removedMove.moveNumber}|${removedMove.row},${removedMove.col}|${removedPlayerNorm}`;
                        if (this.knownMoveKeys.has(removedKey)) this.knownMoveKeys.delete(removedKey);
                    }
                }
                // 如果当前正在查看历史，需要调整 viewingIndex 与 isViewingHistory
                if (this.viewingIndex !== null && this.viewingIndex !== undefined) {
                    if (this.viewingIndex > 0) {
                        // 已移除的是更早的项，当前查看索引向前移动一位以保持指向相同的实际步
                        this.viewingIndex = this.viewingIndex - 1;
                    } else {
                        // 如果用户正在查看被移除的第0项，退出历史查看回到实时视图
                        this.isViewingHistory = false;
                        this.viewingIndex = null;
                        // 恢复实时棋面
                        try { this.showLiveBoard(); } catch (e) { /* ignore */ }
                    }
                }
                // After removing the first DOM child, shift all remaining DOM items' data-index
                const items = container.querySelectorAll('.move-item');
                items.forEach((it, i) => it.dataset.index = String(i));
            }
            container.scrollTop = container.scrollHeight;
            // register key
            if (key) this.knownMoveKeys.add(key);
            // 更新历史导航按钮状态
            try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
        } catch (e) {
            console.error('addMoveToHistory error', e);
        }
    }

    // 跳转到指定的历史步（index 为 moveList 的索引，0 表示第一步）
    jumpToMove(index) {
        try {
            if (!Array.isArray(this.moveList) || this.moveList.length === 0) return;
            if (index < 0) return;
            index = Math.min(index, this.moveList.length - 1);

            // 进入历史查看模式，防止轮询覆盖当前视图
            this.isViewingHistory = true;
            this.viewingIndex = index;

            // 构建新的空棋盘
            const newBoard = [];
            for (let r = 0; r < this.boardSize; r++) {
                newBoard[r] = [];
                for (let c = 0; c < this.boardSize; c++) newBoard[r][c] = 0;
            }

            // 依次应用 0..index 的步子（假设先手为黑，交替下子）
            for (let i = 0; i <= index; i++) {
                const mv = this.moveList[i];
                if (!mv) continue;
                const val = (i % 2 === 0) ? 1 : 2; // 0-based move index: 偶数为黑
                if (mv.row >= 0 && mv.col >= 0 && mv.row < this.boardSize && mv.col < this.boardSize) {
                    newBoard[mv.row][mv.col] = val;
                }
            }

            this.board = newBoard;
            // 设置 lastMove 为所选步
            const last = this.moveList[index];
            if (last) {
                this.lastMove = { row: last.row, col: last.col };
            } else {
                this.lastMove = null;
            }

            // 更新棋盘显示
            this.updateBoard(this.board);
            this.highlightLastMove();

            // 高亮历史条目
            document.querySelectorAll('#move-history .move-item').forEach(el => el.classList.remove('history-active'));
            const container = document.getElementById('move-history');
            const target = container.querySelector(`.move-item[data-index="${index}"]`);
            if (target) target.classList.add('history-active');

            // 提示用户已进入历史查看
            this.showMessage(`正在查看历史：第 ${index + 1} 步`, 'info');

            // 更新导航按钮
            try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }

        } catch (e) {
            console.error('jumpToMove error', e);
        }
    }

    // 恢复到最新局面（实时棋盘）
    showLiveBoard() {
        try {
            // 退出历史查看模式
            this.isViewingHistory = false;
            this.viewingIndex = null;

            // 清除历史高亮
            document.querySelectorAll('#move-history .move-item').forEach(el => el.classList.remove('history-active'));

            // 优先使用 liveBoard（后端最新状态）来恢复视图
            if (this.liveBoard && Array.isArray(this.liveBoard)) {
                this.board = this.liveBoard;
                if (this.liveLastMove) {
                    // liveLastMove 可能是对象 {row, col}
                    this.lastMove = this.liveLastMove;
                } else if (this.moveList.length > 0) {
                    const last = this.moveList[this.moveList.length - 1];
                    if (last) this.lastMove = { row: last.row, col: last.col };
                }
                this.updateBoard(this.board);
                this.highlightLastMove();

                // 高亮移动历史列表的最后一项（如果存在）以对应当前显示的最新步
                try {
                    const container = document.getElementById('move-history');
                    if (container && container.lastElementChild) {
                        // 先移除其他高亮
                        container.querySelectorAll('.move-item.history-active').forEach(el => el.classList.remove('history-active'));
                        container.lastElementChild.classList.add('history-active');
                    }
                } catch (e) {
                    // ignore
                }
            } else if (this.moveList.length > 0) {
                // 没有 liveBoard 时重建最新步
                this.jumpToMove(this.moveList.length - 1);
                // jumpToMove 会把 isViewingHistory 设为 true，重置回 false
                this.isViewingHistory = false;
                this.viewingIndex = null;

                // 确保最后一项高亮
                try {
                    const container = document.getElementById('move-history');
                    if (container && container.lastElementChild) {
                        container.querySelectorAll('.move-item.history-active').forEach(el => el.classList.remove('history-active'));
                        container.lastElementChild.classList.add('history-active');
                    }
                } catch (e) {
                    // ignore
                }
            }

            this.showMessage('已恢复实时视图', 'success');
            try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
        } catch (e) {
            console.error('showLiveBoard error', e);
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

            // 始终更新 liveBoard，供 showLiveBoard 使用，但不要在历史查看时覆盖用户视图
            if (data.room.board) {
                this.liveBoard = data.room.board;
                if (!this.isViewingHistory) {
                    this.updateBoard(data.room.board);
                }
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

            // 更新最后一步（始终保存为 liveLastMove），但在历史查看模式下不要替换当前视图的 lastMove
            if (data.last_move) {
                this.liveLastMove = data.last_move;

                if (!this.isViewingHistory) {
                    this.lastMove = data.last_move;
                    this.highlightLastMove();
                }

                // 将最后一步追加到移动历史（实时更新）——即使在历史查看，也更新列表但不改变视图
                this.addMoveToHistory(data.last_move);

                // 如果当前不是历史查看模式，确保移动历史中对应的最新条目高亮
                if (!this.isViewingHistory) {
                    try {
                        const container = document.getElementById('move-history');
                        if (container) {
                            // 先移除其他高亮
                            container.querySelectorAll('.move-item.history-active').forEach(el => el.classList.remove('history-active'));
                            // 高亮最后一项（最近添加的）
                            if (container.lastElementChild) {
                                container.lastElementChild.classList.add('history-active');
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
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
            
            // 检查是否从有请求状态变为无请求，且之前是自己发起的请求
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
        const leaveBtnElem = document.getElementById('leave-btn');
        if (leaveBtnElem) {
            leaveBtnElem.addEventListener('click', (e) => {
                // 防止锚点默认导航
                if (e && e.preventDefault) e.preventDefault();
                // 如果页面是从资料页打开（回顾模式），返回到来源页或资料页；否则回大厅
                try {
                    if (this.isOpenedFromProfile && this.isOpenedFromProfile()) {
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
        if (prevBtn) prevBtn.addEventListener('click', () => this.prevHistory());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextHistory());

        // 游戏结束弹窗的离开按钮（也应遵循回顾模式返回资料页）
        const leaveGameBtn = document.getElementById('leave-game-btn');
        if (leaveGameBtn) {
            leaveGameBtn.addEventListener('click', (e) => {
                if (e && e.preventDefault) e.preventDefault();
                try {
                    if (this.isOpenedFromProfile && this.isOpenedFromProfile()) {
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
    }

    // 历史：上一步
    prevHistory() {
        try {
            if (!this.moveList || this.moveList.length === 0) return;
            // 如果当前在实时视图，直接进入历史并跳到倒数第二步（即回退一步），避免需要两次点击
            if (!this.isViewingHistory) {
                if (this.moveList.length >= 2) {
                    this.jumpToMove(this.moveList.length - 2);
                } else {
                    // 只有一步时仍然跳到第0步（历史视图）
                    this.jumpToMove(0);
                }
                try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
                return;
            }

            const idx = (this.viewingIndex !== null && this.viewingIndex !== undefined) ? this.viewingIndex : this.moveList.length - 1;
            const prev = Math.max(0, idx - 1);
            this.jumpToMove(prev);
            this.updateHistoryNavButtons();
        } catch (e) {
            console.error('prevHistory error', e);
        }
    }

    // 历史：下一步
    nextHistory() {
        try {
            if (!this.moveList || this.moveList.length === 0) return;

            // 如果不在历史查看模式，恢复实时视图
            if (!this.isViewingHistory) {
                this.showLiveBoard();
                return;
            }

            const idx = (this.viewingIndex !== null && this.viewingIndex !== undefined) ? this.viewingIndex : 0;
            const next = Math.min(this.moveList.length - 1, idx + 1);
            // 如果已经是最后一步，恢复实时视图
            if (next >= this.moveList.length - 1) {
                this.showLiveBoard();
            } else {
                this.jumpToMove(next);
            }
            this.updateHistoryNavButtons();
        } catch (e) {
            console.error('nextHistory error', e);
        }
    }

    // 更新历史导航按钮的可用/禁用状态
    updateHistoryNavButtons() {
        try {
            const prevBtn = document.getElementById('prev-move-btn');
            const nextBtn = document.getElementById('next-move-btn');
            if (!prevBtn && !nextBtn) return;

            if (!this.moveList || this.moveList.length === 0) {
                if (prevBtn) prevBtn.disabled = true;
                if (nextBtn) nextBtn.disabled = true;
                return;
            }

            if (!this.isViewingHistory || this.viewingIndex === null || this.viewingIndex === undefined) {
                // 在实时视图: 上一步可用（跳回最后一步），下一步禁用
                if (prevBtn) prevBtn.disabled = false;
                if (nextBtn) nextBtn.disabled = true;
                return;
            }

            if (prevBtn) prevBtn.disabled = (this.viewingIndex <= 0);
            if (nextBtn) nextBtn.disabled = (this.viewingIndex >= this.moveList.length - 1);
        } catch (e) {
            // ignore
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

    // 检测页面是否从用户资料页打开（用于自动跳转历史步）
    isOpenedFromProfile() {
        try {
            // 优先检查 URL 查询参数
            const params = new URLSearchParams(window.location.search);
            if (params.get('ref') === 'profile') return true;
            // 回退检查 body data 属性
            const bodyRef = document.body.dataset.ref;
            if (bodyRef === 'profile') return true;
            // 进一步检查 document.referrer（从用户资料或最近对局链接打开）
            try {
                const ref = document.referrer || '';
                if (ref.indexOf('/profile') !== -1 || ref.indexOf('recent-games') !== -1 || ref.indexOf('recent') !== -1) return true;
            } catch (e) {
                // ignore
            }
        } catch (e) {
            // ignore
        }
        return false;
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
                    if (window.game && window.game.isOpenedFromProfile && window.game.isOpenedFromProfile()) {
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
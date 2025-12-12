class GameHistory {
    constructor(game) {
        this.game = game;
        this.knownMoveKeys = new Set();
        this.moveList = [];
        this.isViewingHistory = false;
        this.viewingIndex = null;
        this.shouldAutoJumpToFirstMove = false;
        this.isReviewMode = false;
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

            // 重新计算正确的移动编号，确保连续性
            const correctedMoveNumber = this.moveList.length + 1;

            const el = document.createElement('div');
            el.className = 'move-item';
            el.innerHTML = `
                <span class="move-number">#${this.game.escapeHtml(String(correctedMoveNumber))}</span>
                <span class="move-coords">${this.game.escapeHtml(coordsText)}</span>
                <span class="move-player">${this.game.escapeHtml(playerNorm === '__unknown__' ? playerName : playerNorm)}</span>
            `;

            container.appendChild(el);

            // 将解析后的 move 推入 moveList（统一使用 0-based row/col）
            if (parsedRow !== null && parsedCol !== null) {
                const moveObj = { moveNumber: Number(correctedMoveNumber), row: parsedRow, col: parsedCol, playerName: playerNorm };
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
            for (let r = 0; r < this.game.boardSize; r++) {
                newBoard[r] = [];
                for (let c = 0; c < this.game.boardSize; c++) newBoard[r][c] = 0;
            }

            // 依次应用 0..index 的步子（假设先手为黑，交替下子）
            for (let i = 0; i <= index; i++) {
                const mv = this.moveList[i];
                if (!mv) continue;
                const val = (i % 2 === 0) ? 1 : 2; // 0-based move index: 偶数为黑
                if (mv.row >= 0 && mv.col >= 0 && mv.row < this.game.boardSize && mv.col < this.game.boardSize) {
                    newBoard[mv.row][mv.col] = val;
                }
            }

            this.game.board = newBoard;
            // 设置 lastMove 为所选步
            const last = this.moveList[index];
            if (last) {
                this.game.lastMove = { row: last.row, col: last.col };
            } else {
                this.game.lastMove = null;
            }

            // 更新棋盘显示（红点标记已在 updateBoard 中处理）
            this.game.updateBoard(this.game.board);

            // 高亮历史条目
            document.querySelectorAll('#move-history .move-item').forEach(el => el.classList.remove('history-active'));
            const container = document.getElementById('move-history');
            const target = container.querySelector(`.move-item[data-index="${index}"]`);
            if (target) target.classList.add('history-active');

            // 提示用户已进入历史查看
            this.game.showMessage(`正在查看历史：第 ${index + 1} 步`, 'info');

            // 更新导航按钮
            try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }

        } catch (e) {
            console.error('jumpToMove error', e);
        }
    }

    // 恢复到最新局面（实时棋盘）
    showLiveBoard() {
        // 在回顾模式下不执行恢复实时视图操作
        if (this.game.history.isReviewMode) {
            return;
        }
        
        try {
            // 退出历史查看模式
            this.isViewingHistory = false;
            this.viewingIndex = null;

            // 优先使用 liveBoard（后端最新状态）来恢复视图
            if (this.game.liveBoard && Array.isArray(this.game.liveBoard)) {
                this.game.board = this.game.liveBoard;
                if (this.game.liveLastMove) {
                    // liveLastMove 可能是对象 {row, col}
                    this.game.lastMove = this.game.liveLastMove;
                } else if (this.moveList.length > 0) {
                    const last = this.moveList[this.moveList.length - 1];
                    if (last) this.game.lastMove = { row: last.row, col: last.col };
                }
                this.game.updateBoard(this.game.board);
            } else if (this.moveList.length > 0) {
                // 没有 liveBoard 时重建最新步
                this.jumpToMove(this.moveList.length - 1);
                // jumpToMove 会把 isViewingHistory 设为 true，重置回 false
                this.isViewingHistory = false;
                this.viewingIndex = null;
                return; // jumpToMove 已经处理了高亮，直接返回
            }

            // 高亮移动历史列表的最后一项（如果存在）以对应当前显示的最新步
            try {
                // 清除历史高亮
                document.querySelectorAll('#move-history .move-item').forEach(el => el.classList.remove('history-active'));
                
                const container = document.getElementById('move-history');
                if (container && container.lastElementChild) {
                    container.lastElementChild.classList.add('history-active');
                }
            } catch (e) {
                // ignore
            }

            this.game.showMessage('已恢复实时视图', 'success');
            try { this.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
        } catch (e) {
            console.error('showLiveBoard error', e);
        }
    }

    // 历史：上一步
    prevHistory() {
        try {
            if (!this.moveList || this.moveList.length === 0) return;
            // 如果当前在实时视图，直接进入历史并跳到倒数第二步（即回退一步），避免需要两次点击
            if (!this.isViewingHistory && !this.game.history.isReviewMode) {
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

            // 如果不在历史查看模式，且不是回顾模式，则恢复实时视图
            if (!this.isViewingHistory && !this.game.history.isReviewMode) {
                this.showLiveBoard();
                return;
            }

            // 如果是回顾模式或者在历史查看模式
            if (this.isViewingHistory || this.game.history.isReviewMode) {
                const idx = (this.viewingIndex !== null && this.viewingIndex !== undefined) ? this.viewingIndex : 0;
                const next = Math.min(this.moveList.length - 1, idx + 1);
                
                // 如果已经是最后一步，在回顾模式下停留在最后一步而不恢复实时视图
                if (next >= this.moveList.length - 1) {
                    this.jumpToMove(this.moveList.length - 1);
                } else {
                    this.jumpToMove(next);
                }
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
                // 在回顾模式下，下一步也应该可用
                if (nextBtn) nextBtn.disabled = this.game.history.isReviewMode ? false : true;
                return;
            }

            if (prevBtn) prevBtn.disabled = (this.viewingIndex <= 0);
            if (nextBtn) nextBtn.disabled = (this.viewingIndex >= this.moveList.length - 1);
        } catch (e) {
            // ignore
        }
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

// 导出 GameHistory 类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameHistory;
} else if (typeof window !== 'undefined') {
    window.GameHistory = GameHistory;
}
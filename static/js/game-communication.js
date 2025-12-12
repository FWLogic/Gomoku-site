// 游戏通信管理器
class GameCommunication {
    constructor(game) {
        this.game = game;
    }

    async handleCellClick(row, col) {
        try {
            const response = await fetch(`/room/${this.game.roomCode}/move/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.game.getCsrfToken()
                },
                body: JSON.stringify({ row, col })
            });

            const data = await response.json();

            if (data.success) {
                // 播放落子音效
                this.game.audioManager.playMoveSound();
                
                // 先更新 lastMove，确保红点与棋子同步显示
                if (data.last_move) {
                    this.game.lastMove = data.last_move;
                    this.game.liveLastMove = data.last_move;
                }
                this.game.updateBoard(data.board);
                this.game.updateGameState(data);
            } else {
                this.game.showMessage(data.error || '落子失败', 'error');
            }
        } catch (error) {
            console.error('落子失败:', error);
            this.game.showMessage('网络错误，请重试', 'error');
        }
    }

    async sendChat(message) {
        try {
            // 禁用输入框防止重复提交
            document.getElementById('chat-input').disabled = true;
            document.getElementById('send-chat').disabled = true;
            
            const response = await fetch(`/room/${this.game.roomCode}/chat/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.game.getCsrfToken()
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();

            if (data.success) {
                // 清空输入框
                document.getElementById('chat-input').value = '';
            } else {
                this.game.showMessage(data.error || '发送失败', 'error');
                // 恢复输入框内容
                document.getElementById('chat-input').value = message;
            }
            
            // 重新启用输入框
            document.getElementById('chat-input').disabled = false;
            document.getElementById('send-chat').disabled = false;
            document.getElementById('chat-input').focus();
        } catch (error) {
            console.error('发送消息失败:', error);
            this.game.showMessage('网络错误，消息发送失败', 'error');
            // 恢复输入框内容
            document.getElementById('chat-input').value = message;
            
            // 重新启用输入框
            document.getElementById('chat-input').disabled = false;
            document.getElementById('send-chat').disabled = false;
        }
    }

    async requestUndo() {
        try {
            const response = await fetch(`/room/${this.game.roomCode}/undo/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                if (data.board) {
                    // 悔棋成功，先更新 lastMove，再更新棋盘
                    if (data.last_move) {
                        this.game.lastMove = data.last_move;
                        this.game.liveLastMove = data.last_move;
                    } else {
                        this.game.lastMove = null;
                        this.game.liveLastMove = null;
                    }
                    this.game.updateBoard(data.board);
                    this.game.currentTurn = data.current_turn;
                }
                this.game.showMessage(data.message || '操作成功', 'success');
            } else {
                this.game.showMessage(data.error || '操作失败', 'error');
            }
        } catch (error) {
            console.error('悔棋请求失败:', error);
            this.game.showMessage('网络错误，请重试', 'error');
        }
    }

    async rejectUndo() {
        try {
            const response = await fetch(`/room/${this.game.roomCode}/reject_undo/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                this.game.showMessage(data.message || '已拒绝悔棋请求', 'success');
                
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
                this.game.showMessage(data.error || '操作失败', 'error');
            }
        } catch (error) {
            console.error('拒绝悔棋请求失败:', error);
            this.game.showMessage('网络错误，请重试', 'error');
        }
    }

    async requestDraw() {
        try {
            const response = await fetch(`/room/${this.game.roomCode}/draw/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                if (data.status) {
                    // 和棋成功，游戏结束
                    this.game.showMessage(data.message || '游戏以和棋结束', 'success');
                    this.game.updateGameState(data);
                } else {
                    // 发送和棋请求成功
                    this.game.showMessage(data.message || '和棋请求已发送', 'success');
                }
            } else {
                this.game.showMessage(data.error || '和棋请求失败', 'error');
            }
        } catch (error) {
            console.error('和棋请求失败:', error);
            this.game.showMessage('网络错误，请重试', 'error');
        }
    }

    async rejectDraw() {
        try {
            const response = await fetch(`/room/${this.game.roomCode}/reject_draw/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                this.game.showMessage(data.message || '已拒绝和棋请求', 'success');
            } else {
                this.game.showMessage(data.error || '操作失败', 'error');
            }
        } catch (error) {
            console.error('拒绝和棋请求失败:', error);
            this.game.showMessage('网络错误，请重试', 'error');
        }
    }

    async updateRoomState() {
        try {
            const response = await fetch(`/room/${this.game.roomCode}/state/?last_chat_id=${this.game.lastChatId}`);
            const data = await response.json();

            if (data.error) {
                console.error('获取房间状态失败:', data.error);
                return;
            }
            
            // 添加调试日志
            if (data.room.rematch_requested_by) {
                console.log(`再来一局请求状态: ${data.room.rematch_requested_by === this.game.playerId ? '自己请求' : '对手请求'}`);
            }

            // 始终更新 liveBoard，供 showLiveBoard 使用
            if (data.room.board) {
                this.game.liveBoard = data.room.board;

                // 检测是否有新的落子（对方落子）
                const hasNewMove = data.last_move && (!this.game.liveLastMove ||
                    data.last_move.row !== this.game.liveLastMove.row ||
                    data.last_move.col !== this.game.liveLastMove.col);

                // 如果有新落子且当前在历史查看模式，自动切换到实况
                if (hasNewMove && this.game.history.isViewingHistory) {
                    this.game.history.isViewingHistory = false;
                    this.game.history.viewingIndex = null;
                    // 清除历史高亮
                    document.querySelectorAll('#move-history .move-item').forEach(el => el.classList.remove('history-active'));
                }

                // 更新最后一步（在更新棋盘之前设置，确保红点同步显示）
                if (data.last_move) {
                    this.game.liveLastMove = data.last_move;

                    if (!this.game.history.isViewingHistory) {
                        this.game.lastMove = data.last_move;
                    }
                }

                // 更新棋盘显示
                if (!this.game.history.isViewingHistory) {
                    this.game.updateBoard(data.room.board);
                }
            }

            // 更新游戏状态
            this.game.currentTurn = data.room.current_turn;
            this.game.updateGameState(data.room);

            // 更新玩家信息
            this.game.updatePlayerInfo(data.player, data.opponent);

            // 更新聊天消息
            if (data.chats && data.chats.length > 0) {
                data.chats.forEach(chat => {
                    // 检查消息是否已经存在
                    const messageId = chat.id;
                    const messageExists = document.querySelector(`.chat-message[data-message-id="${messageId}"]`);

                    // 只有当消息不存在时才显示
                    if (!messageExists) {
                        const isOwnMessage = chat.player_id === this.game.playerId;
                        this.game.addChatMessage(chat, isOwnMessage);
                    }

                    this.game.lastChatId = Math.max(this.game.lastChatId, chat.id);
                });
            }

            // 将最后一步追加到移动历史（实时更新）——即使在历史查看，也更新列表但不改变视图
            if (data.last_move) {
                this.game.history.addMoveToHistory(data.last_move);

                // 如果当前不是历史查看模式，确保移动历史中对应的最新条目高亮
                if (!this.game.history.isViewingHistory) {
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
                data.move_history.forEach(m => this.game.history.addMoveToHistory(m));
            }

            // 首次轮询后，如果需要自动跳转到历史第一步（仅当游戏已结束时）
            if (this.game.history.shouldAutoJumpToFirstMove) {
                this.game.history.shouldAutoJumpToFirstMove = false; // 只执行一次
                // 只有在游戏已结束时才自动跳转到历史第一步
                if (data.room.status === 'finished' && this.game.history.moveList && this.game.history.moveList.length > 0) {
                    this.game.history.jumpToMove(0);
                    try { this.game.history.updateHistoryNavButtons(); } catch (e) { /* ignore */ }
                }
            }

            // 处理通知
            if (data.room.notification_message) {
                this.game.showMessage(data.room.notification_message, 'info');
            }
            
            // 检查悔棋请求状态
            if (data.room.undo_requested_by) {
                if (data.room.undo_requested_by !== this.game.playerId) {
                    // 对方发送了悔棋请求，但只有状态发生变化时才显示通知
                    if (this.game.lastUndoStatus !== data.room.undo_requested_by) {
                        this.game.showMessage('对手请求悔棋，请选择同意或拒绝', 'info');
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
                if (data.room.draw_requested_by !== this.game.playerId) {
                    // 对方发送了和棋请求，但只有状态发生变化时才显示通知
                    if (this.game.lastDrawStatus !== data.room.draw_requested_by) {
                        this.game.showMessage('对手请求和棋，请选择同意或拒绝', 'info');
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
            this.game.lastUndoStatus = data.room.undo_requested_by;
            this.game.lastDrawStatus = data.room.draw_requested_by;

            // 检查再来一局请求状态
            const prevRematchStatus = this.game.lastRematchStatus;
            const currentRematchStatus = data.room.rematch_requested_by;
            
            // 检查是否从有请求状态变为无请求，且之前是自己发起的请求
            if (prevRematchStatus === this.game.playerId && !currentRematchStatus && this.game.gameStatus === 'finished') {
                // 自己的请求被对方拒绝了
                this.game.showMessage('对方拒绝了你的再来一局请求', 'info');
                
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
                this.game.lastRematchStatus = currentRematchStatus;
                
                if (currentRematchStatus) {
                if (data.room.rematch_requested_by !== this.game.playerId) {
                    // 对手发送了再来一局请求
                    this.game.showMessage('对手请求再来一局，点击再来一局按钮同意，或点击离开按钮拒绝', 'info');
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
                if (prevRematchStatus && data.room.status === 'playing' && this.game.gameStatus === 'finished') {
                    // 游戏重新开始
                    this.game.showMessage('游戏重新开始', 'success');
                    
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
                        this.game.history.knownMoveKeys.clear();
                    } catch (e) {
                        // ignore
                    }

                    // 重新启用棋盘点击
                    document.querySelectorAll('.cell').forEach(cell => {
                        cell.style.cursor = 'pointer';
                        cell.onclick = null;
                        const row = parseInt(cell.dataset.row);
                        const col = parseInt(cell.dataset.col);
                        cell.addEventListener('click', () => this.game.communication.handleCellClick(row, col));
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
                    if (!this.game.pollingInterval) {
                        this.game.startPolling();
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

    // 请求再来一局
    async requestRematch() {
        try {
            const response = await fetch(`/room/${this.game.roomCode}/rematch/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            const data = await response.json();

            if (data.success) {
                this.game.showMessage(data.message || '再来一局请求已发送', 'success');
            } else {
                this.game.showMessage(data.error || '请求失败', 'error');
            }
        } catch (error) {
            console.error('再来一局请求失败:', error);
            this.game.showMessage('网络错误，请重试', 'error');
        }
    }
}

// 导出 GameCommunication 类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameCommunication;
} else if (typeof window !== 'undefined') {
    window.GameCommunication = GameCommunication;
}
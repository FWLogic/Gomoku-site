// 游戏通信管理器
class GameCommunication {
    constructor(game) {
        this.game = game;
        this.lastOpponentId = null; // 用于跟踪上一个对手的ID
    }

    async handleCellClick(row, col) {
        try {
            // 检查是否是指出禁手的操作
            // 条件：当前是白方，点击的是黑棋，并且游戏正在进行中
            const cellValue = this.game.board[row][col];
            if (this.game.gameStatus === 'playing' && 
                this.game.playerColor === 'white' && 
                cellValue === 1) { // 黑棋
                
                // 发送禁手指出请求
                const forbiddenResponse = await fetch(`/api/claim-forbidden/${this.game.roomCode}/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.game.getCsrfToken()
                    },
                    body: JSON.stringify({ row, col })
                });

                // 检查响应的状态码
                if (!forbiddenResponse.ok) {
                    const errorData = await forbiddenResponse.json().catch(() => ({}));
                    const errorMessage = errorData.error || '无效的禁手指出';
                    this.game.showMessage(errorMessage, 'error');
                    return;
                }
                
                // 检查响应的内容类型
                const forbiddenContentType = forbiddenResponse.headers.get('content-type');
                if (!forbiddenContentType || !forbiddenContentType.includes('application/json')) {
                    const text = await forbiddenResponse.text();
                    console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                    this.game.showMessage('服务器响应错误', 'error');
                    return;
                }

                const forbiddenData = await forbiddenResponse.json();

                if (forbiddenData.success) {
                    // 播放禁手判定音效
                    this.game.audioManager.playWinSound();
                    
                    // 更新棋盘和游戏状态
                    if (forbiddenData.last_move) {
                        this.game.lastMove = forbiddenData.last_move;
                        this.game.liveLastMove = forbiddenData.last_move;
                    }
                    this.game.updateBoard(forbiddenData.board);
                    this.game.updateGameState(forbiddenData);
                } else {
                    this.game.showMessage(forbiddenData.error || '无效的禁手指出', 'error');
                }
                return;
            }
            
            // 检查游戏是否正在进行中
            if (this.game.gameStatus !== 'playing') {
                this.game.showMessage('游戏未开始或已结束', 'error');
                return;
            }

            // 检查是否轮到当前玩家（使用最新的currentTurn值）
            if (this.game.currentTurn !== this.game.playerId) {
                this.game.showMessage('还没轮到你', 'error');
                return;
            }

            const response = await fetch(`/api/make-move/${this.game.roomCode}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.game.getCsrfToken()
                },
                body: JSON.stringify({ row, col })
            });

            // 检查响应的状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '落子失败';
                this.game.showMessage(errorMessage, 'error');
                return;
            }
            
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                return;
            }

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
            
            const response = await fetch(`/api/send-message/${this.game.roomCode}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.game.getCsrfToken()
                },
                body: JSON.stringify({ message })
            });

            // 检查响应的状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '发送失败';
                this.game.showMessage(errorMessage, 'error');
                // 恢复输入框内容
                document.getElementById('chat-input').value = message;
                // 重新启用输入框
                document.getElementById('chat-input').disabled = false;
                document.getElementById('send-chat').disabled = false;
                document.getElementById('chat-input').focus();
                return;
            }
            
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                // 恢复输入框内容
                document.getElementById('chat-input').value = message;
                // 重新启用输入框
                document.getElementById('chat-input').disabled = false;
                document.getElementById('send-chat').disabled = false;
                document.getElementById('chat-input').focus();
                return;
            }

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
            const response = await fetch(`/api/request-undo/${this.game.roomCode}/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            // 检查响应的状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '操作失败';
                this.game.showMessage(errorMessage, 'error');
                return;
            }
            
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                return;
            }

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
                
                // 更新UI状态，确保包含current_turn
                this.game.updateGameState({
                    status: this.game.gameStatus,
                    current_turn: data.current_turn
                });
                
                // 更新移动历史记录
                if (data.move_history) {
                    this.game.history.moveList = [];
                    this.game.history.knownMoveKeys.clear();
                    const container = document.getElementById('move-history');
                    if (container) {
                        container.innerHTML = '';
                        data.move_history.forEach(move => {
                            this.game.history.addMoveToHistory(move);
                        });
                    }
                }
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
            const response = await fetch(`/api/reject-undo/${this.game.roomCode}/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            // 检查响应的状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '操作失败';
                this.game.showMessage(errorMessage, 'error');
                return;
            }
            
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                return;
            }

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
            const response = await fetch(`/api/request-draw/${this.game.roomCode}/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            // 检查响应的状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '和棋请求失败';
                this.game.showMessage(errorMessage, 'error');
                return;
            }
            
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                return;
            }

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
            const response = await fetch(`/api/reject-draw/${this.game.roomCode}/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            // 检查响应的状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '操作失败';
                this.game.showMessage(errorMessage, 'error');
                return;
            }
            
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                return;
            }

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
            
            // 检查响应的状态码
            if (!response.ok) {
                // 如果是404错误，可能是房间已被删除，应该引导用户回到大厅
                if (response.status === 404) {
                    this.game.showMessage('房间不存在或已被删除，即将返回大厅...', 'error');
                    setTimeout(() => {
                        window.location.href = '/lobby/';
                    }, 3000);
                }
                return;
            }
            
            // 检查响应的内容类型，如果不是JSON，则抛出错误
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                return;
            }
            
            const data = await response.json();

            if (data.error) {
                console.error('获取房间状态失败:', data.error);
                return;
            }
            
            // 添加调试日志
            if (data.room.rematch_requested_by) {
                console.log(`再来一局请求状态: ${data.room.rematch_requested_by === this.game.playerId ? '自己请求' : '对手请求'}`);
            }

            // 检查是否是游戏重新开始的情况
            const prevGameStatus = this.game.gameStatus;
            if (prevGameStatus === 'finished' && data.room.status === 'playing') {
                // 游戏重新开始，强制更新棋色标签
                if (data.player && data.opponent) {
                    // 更新当前玩家信息
                    const playerColorElement = document.getElementById('player-color');
                    if (playerColorElement) {
                        playerColorElement.textContent = data.player.color === 'black' ? '黑棋' : '白棋';
                        playerColorElement.className = `player-color color-${data.player.color}`;
                    }
                    
                    // 更新当前玩家棋色变量
                    if (this.game) {
                        this.game.playerColor = data.player.color;
                    }
                    
                    // 更新对手信息
                    const opponentColorElement = document.querySelector('.opponent-info .player-color');
                    if (opponentColorElement) {
                        opponentColorElement.textContent = data.opponent.color === 'black' ? '黑棋' : '白棋';
                        opponentColorElement.className = `player-color color-${data.opponent.color}`;
                    }
                }
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
            
            // 更新对手信息卡片
            console.log('检查对手状态:', data.opponent);
            // 检查对手是否在房间中 - 更准确的判断方式
            const isOpponentInRoom = data.opponent && data.opponent.id;
            
            // 检查是否收到房主离开的通知
            const receivedCreatorLeftNotification = data.room.notification_message && 
                                                   data.room.notification_message.includes('房主已离开房间') &&
                                                   data.room.notification_target === this.game.playerId;
            
            if (isOpponentInRoom && !receivedCreatorLeftNotification) {
                this.updateOpponentInfo(data.opponent, data.room);
                // 记录对手ID，用于检测对手离开
                this.lastOpponentId = data.opponent.id;
                
                // 隐藏离开标签（对手在房间内）
                const leaveTag = document.querySelector('.player-leave-tag');
                if (leaveTag) {
                    leaveTag.style.display = 'none';
                }
            } else if (this.lastOpponentId || receivedCreatorLeftNotification) {
                console.log('对手离开了房间或房主离开了房间');
                // 对手离开了房间或房主离开了房间
                this.handleOpponentLeave();
                this.lastOpponentId = null;
                
                // 如果是房主离开的通知，额外显示一条消息
                if (receivedCreatorLeftNotification) {
                    this.game.showMessage('房主已离开房间', 'info');
                }
            } else if (this.lastOpponentId === null && data.opponent && data.opponent.id) {
                // 新对手加入了房间，更新对手ID
                this.lastOpponentId = data.opponent.id;
            }

            // 更新聊天消息 - 改进的消息同步逻辑
            if (data.chats && data.chats.length > 0) {
                // 按照ID排序确保顺序正确
                const sortedChats = data.chats.slice().sort((a, b) => a.id - b.id);
                
                sortedChats.forEach(chat => {
                    // 更严格的重复检查
                    const messageExists = document.querySelector(`.chat-message[data-message-id="${chat.id}"]`);
                    
                    // 只有当消息不存在时才添加
                    if (!messageExists) {
                        const isOwnMessage = chat.player_id === this.game.playerId;
                        this.game.addChatMessage(chat, isOwnMessage);
                    }
                    
                    // 安全地更新 lastChatId
                    if (chat.id) {
                        this.game.lastChatId = Math.max(this.game.lastChatId, chat.id);
                    }
                });
            } else if (data.chats && data.chats.length === 0 && this.game.lastChatId === 0) {
                // 初始化时没有聊天消息，设置lastChatId为初始值
                this.game.lastChatId = window.lastChatId || 0;
            }

            // 将最后一步追加到移动历史（实时更新）——即使在历史查看，也更新列表但不改变视图
            if (data.last_move) {
                this.game.history.addMoveToHistory(data.last_move);

                // 如果当前不是历史查看模式且不在回顾模式，确保移动历史中对应的最新条目高亮
                if (!this.game.history.isViewingHistory && !this.game.history.isReviewMode) {
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
                // 如果在历史查看模式下，继续保持当前查看的历史步骤高亮
                else if (this.game.history.isViewingHistory && this.game.history.viewingIndex !== null) {
                    try {
                        const container = document.getElementById('move-history');
                        if (container) {
                            // 先移除其他高亮
                            container.querySelectorAll('.move-item.history-active').forEach(el => el.classList.remove('history-active'));
                            // 高亮当前查看的历史步骤
                            const target = container.querySelector(`.move-item[data-index="${this.game.history.viewingIndex}"]`);
                            if (target) {
                                target.classList.add('history-active');
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }

            // 如果后端一次性返回 move history 数组，也一并同步（兼容性）
            if (data.move_history && Array.isArray(data.move_history)) {
                // 清空现有历史记录
                this.game.history.moveList = [];
                this.game.history.knownMoveKeys.clear();
                const container = document.getElementById('move-history');
                if (container) {
                    container.innerHTML = '';
                    data.move_history.forEach(move => {
                        this.game.history.addMoveToHistory(move);
                    });
                    
                    // 如果当前不是历史查看模式且不在回顾模式，确保移动历史中对应的最新条目高亮
                    if (!this.game.history.isViewingHistory && !this.game.history.isReviewMode) {
                        try {
                            // 先移除其他高亮
                            container.querySelectorAll('.move-item.history-active').forEach(el => el.classList.remove('history-active'));
                            // 高亮最后一项（最近添加的）
                            if (container.lastElementChild) {
                                container.lastElementChild.classList.add('history-active');
                            }
                        } catch (e) {
                            // ignore
                        }
                    }
                    // 如果在历史查看模式下，继续保持当前查看的历史步骤高亮
                    else if (this.game.history.isViewingHistory && this.game.history.viewingIndex !== null) {
                        try {
                            // 先移除其他高亮
                            container.querySelectorAll('.move-item.history-active').forEach(el => el.classList.remove('history-active'));
                            // 高亮当前查看的历史步骤
                            const target = container.querySelector(`.move-item[data-index="${this.game.history.viewingIndex}"]`);
                            if (target) {
                                target.classList.add('history-active');
                            }
                        } catch (e) {
                            // ignore
                        }
                    }
                }
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
                    
                    // 获取原始悔棋按钮
                    const undoBtn = document.getElementById('undo-btn');
                    
                    // 隐藏原始悔棋按钮
                    if (undoBtn) {
                        undoBtn.style.display = 'none';
                    }
                    
                    // 查找或创建悔棋按钮组
                    let btnGroup = document.getElementById('undo-btn-group');
                    if (!btnGroup) {
                        btnGroup = document.createElement('div');
                        btnGroup.id = 'undo-btn-group';
                        btnGroup.className = 'btn-group';
                        btnGroup.style.display = 'flex';
                        btnGroup.style.gap = '5px';
                        
                        // 将按钮组插入到原始悔棋按钮的位置
                        if (undoBtn && undoBtn.parentNode) {
                            undoBtn.parentNode.insertBefore(btnGroup, undoBtn.nextSibling);
                        }
                    }
                    
                    // 清空按钮组
                    btnGroup.innerHTML = '';
                    
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
                    
                    // 获取原始和棋按钮
                    const drawBtn = document.getElementById('draw-btn');
                    
                    // 隐藏原始和棋按钮
                    if (drawBtn) {
                        drawBtn.style.display = 'none';
                    }
                    
                    // 查找或创建和棋按钮组
                    let btnGroup = document.getElementById('draw-btn-group');
                    if (!btnGroup) {
                        btnGroup = document.createElement('div');
                        btnGroup.id = 'draw-btn-group';
                        btnGroup.className = 'btn-group';
                        btnGroup.style.display = 'flex';
                        btnGroup.style.gap = '5px';
                        
                        // 将按钮组插入到原始和棋按钮的位置
                        if (drawBtn && drawBtn.parentNode) {
                            drawBtn.parentNode.insertBefore(btnGroup, drawBtn.nextSibling);
                        }
                    }
                    
                    // 清空按钮组
                    btnGroup.innerHTML = '';
                    
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

                        // 更新玩家棋色信息和统计数据
                        if (data.player && data.opponent) {
                            // 更新当前玩家信息
                            const playerColorElement = document.getElementById('player-color');
                            if (playerColorElement) {
                                playerColorElement.textContent = data.player.color === 'black' ? '黑棋' : '白棋';
                                playerColorElement.className = `player-color color-${data.player.color}`;
                            }
                            
                            // 更新当前玩家棋色变量
                            if (this.game) {
                                this.game.playerColor = data.player.color;
                            }
                            
                            // 更新当前玩家统计数据
                            if (data.player.total_wins !== undefined) {
                                document.querySelectorAll('.player-info .stat-item').forEach((el, index) => {
                                    const statLabel = el.querySelector('.stat-label').textContent;
                                    const statValue = el.querySelector('.stat-value');
                                    
                                    if (statLabel === '总胜场') {
                                        statValue.textContent = data.player.total_wins;
                                    } else if (statLabel === '总对局') {
                                        statValue.textContent = data.player.games_played;
                                    } else if (statLabel === '胜率') {
                                        statValue.textContent = data.player.win_rate.toFixed(1) + '%';
                                    }
                                });
                            }
                            
                            // 更新对手信息
                            const opponentColorElement = document.querySelector('.opponent-info .player-color');
                            if (opponentColorElement) {
                                opponentColorElement.textContent = data.opponent.color === 'black' ? '黑棋' : '白棋';
                                opponentColorElement.className = `player-color color-${data.opponent.color}`;
                            }
                            
                            // 更新对手统计数据
                            if (data.opponent.total_wins !== undefined) {
                                document.querySelectorAll('.opponent-info .stat-item').forEach((el, index) => {
                                    const statLabel = el.querySelector('.stat-label').textContent;
                                    const statValue = el.querySelector('.stat-value');
                                    
                                    if (statLabel === '总胜场') {
                                        statValue.textContent = data.opponent.total_wins;
                                    } else if (statLabel === '总对局') {
                                        statValue.textContent = data.opponent.games_played;
                                    } else if (statLabel === '胜率') {
                                        statValue.textContent = data.opponent.win_rate.toFixed(1) + '%';
                                    }
                                });
                            }
                            
                            // 更新棋盘状态
                            this.game.gameStatus = data.status;
                            this.game.currentTurn = data.current_turn;
                            
                            // 重置棋盘
                            this.game.initBoard();
                            this.game.board = data.board;
                            
                            // 清除棋盘上的红点标记
                            try {
                                const cells = document.querySelectorAll('.cell');
                                cells.forEach(cell => {
                                    cell.classList.remove('last-move');
                                    const existingDot = cell.querySelector('.last-move-dot');
                                    if (existingDot) {
                                        existingDot.remove();
                                    }
                                });
                                // 重置 lastMove 和 liveLastMove
                                this.game.lastMove = null;
                                this.game.liveLastMove = null;
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
                            
                            // 更新游戏状态显示
                            const statusElement = document.getElementById('game-status');
                            const turnIndicator = document.getElementById('turn-indicator');
                            if (statusElement) {
                                if (data.current_turn === this.game.playerId) {
                                    statusElement.textContent = '轮到你了';
                                    statusElement.className = 'status-your-turn';
                                    if (turnIndicator) turnIndicator.textContent = '请落子';
                                } else {
                                    statusElement.textContent = '对手回合';
                                    statusElement.className = 'status-opponent-turn';
                                    if (turnIndicator) turnIndicator.textContent = '等待对手...';
                                }
                            }
                            
                            // 如果轮到玩家，播放提醒音效
                            if (data.current_turn === this.game.playerId) {
                                this.game.audioManager.playTurnSound();
                            }
                        }
                    } else if (data.room.status === 'playing' && this.game.gameStatus === 'finished') {
                        // 特殊情况处理：当游戏状态从finished变为playing时，即使prevRematchStatus为空也要处理
                        // 这种情况可能发生在页面刚加载时或者轮询延迟的情况下
                        
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

                        // 更新玩家棋色信息和统计数据
                        if (data.player && data.opponent) {
                            // 更新当前玩家信息
                            const playerColorElement = document.getElementById('player-color');
                            if (playerColorElement) {
                                playerColorElement.textContent = data.player.color === 'black' ? '黑棋' : '白棋';
                                playerColorElement.className = `player-color color-${data.player.color}`;
                            }
                            
                            // 更新当前玩家棋色变量
                            if (this.game) {
                                this.game.playerColor = data.player.color;
                            }
                            
                            // 更新当前玩家统计数据
                            if (data.player.total_wins !== undefined) {
                                document.querySelectorAll('.player-info .stat-item').forEach((el, index) => {
                                    const statLabel = el.querySelector('.stat-label').textContent;
                                    const statValue = el.querySelector('.stat-value');
                                    
                                    if (statLabel === '总胜场') {
                                        statValue.textContent = data.player.total_wins;
                                    } else if (statLabel === '总对局') {
                                        statValue.textContent = data.player.games_played;
                                    } else if (statLabel === '胜率') {
                                        statValue.textContent = data.player.win_rate.toFixed(1) + '%';
                                    }
                                });
                            }
                            
                            // 更新对手信息
                            const opponentColorElement = document.querySelector('.opponent-info .player-color');
                            if (opponentColorElement) {
                                opponentColorElement.textContent = data.opponent.color === 'black' ? '黑棋' : '白棋';
                                opponentColorElement.className = `player-color color-${data.opponent.color}`;
                            }
                            
                            // 更新对手统计数据
                            if (data.opponent.total_wins !== undefined) {
                                document.querySelectorAll('.opponent-info .stat-item').forEach((el, index) => {
                                    const statLabel = el.querySelector('.stat-label').textContent;
                                    const statValue = el.querySelector('.stat-value');
                                    
                                    if (statLabel === '总胜场') {
                                        statValue.textContent = data.opponent.total_wins;
                                    } else if (statLabel === '总对局') {
                                        statValue.textContent = data.opponent.games_played;
                                    } else if (statLabel === '胜率') {
                                        statValue.textContent = data.opponent.win_rate.toFixed(1) + '%';
                                    }
                                });
                            }
                            
                            // 更新棋盘状态
                            this.game.gameStatus = data.status;
                            this.game.currentTurn = data.current_turn;
                            
                            // 重置棋盘
                            this.game.initBoard();
                            this.game.board = data.board;
                            
                            // 清除棋盘上的红点标记
                            try {
                                const cells = document.querySelectorAll('.cell');
                                cells.forEach(cell => {
                                    cell.classList.remove('last-move');
                                    const existingDot = cell.querySelector('.last-move-dot');
                                    if (existingDot) {
                                        existingDot.remove();
                                    }
                                });
                                // 重置 lastMove 和 liveLastMove
                                this.game.lastMove = null;
                                this.game.liveLastMove = null;
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
                            
                            // 更新游戏状态显示
                            const statusElement = document.getElementById('game-status');
                            const turnIndicator = document.getElementById('turn-indicator');
                            if (statusElement) {
                                if (data.current_turn === this.game.playerId) {
                                    statusElement.textContent = '轮到你了';
                                    statusElement.className = 'status-your-turn';
                                    if (turnIndicator) turnIndicator.textContent = '请落子';
                                } else {
                                    statusElement.textContent = '对手回合';
                                    statusElement.className = 'status-opponent-turn';
                                    if (turnIndicator) turnIndicator.textContent = '等待对手...';
                                }
                            }
                            
                            // 如果轮到玩家，播放提醒音效
                            if (data.current_turn === this.game.playerId) {
                                this.game.audioManager.playTurnSound();
                            }
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
            // 只有在网络错误不是由于页面卸载引起的时才显示错误消息
            if (!(error instanceof TypeError && error.message === 'Failed to fetch')) {
                this.game.showMessage('网络错误，请重试', 'error');
            }
        }
    }

    // 处理对手或房主离开
    handleOpponentLeave() {
        console.log('处理对手或房主离开事件');
        // 显示对手信息卡片上的离开标签
        const leaveTag = document.querySelector('.player-leave-tag');
        if (leaveTag) {
            console.log('找到离开标签元素，准备显示');
            leaveTag.style.display = 'block';
            
            // 注意：具体的消息内容已经在updateRoomState中显示过了
            // 这里不再重复显示
        } else {
            console.log('未找到离开标签元素');
        }
    }

    // 更新对手信息卡片
    updateOpponentInfo(opponentData, roomData) {
        // 检查对手信息是否已经显示
        const opponentInfoElement = document.getElementById('opponent-info');
        if (!opponentInfoElement) return;

        // 检查是否已经有对手信息（通过检查是否存在对手的用户名）
        const playerNameElement = opponentInfoElement.querySelector('.player-name');
        const hasOpponent = playerNameElement && playerNameElement.textContent !== '等待对手...';
        
        // 如果已经有对手信息（且不是"等待对手..."），但对手变了，需要更新
        if (hasOpponent && this.lastOpponentId && this.lastOpponentId !== opponentData.id) {
            // 隐藏离开标签（如果有的话）
            const leaveTag = opponentInfoElement.querySelector('.player-leave-tag');
            if (leaveTag) {
                leaveTag.style.display = 'none';
            }
        }

        // 构造对手信息卡片的HTML
        let avatarHtml = '';
        if (opponentData.avatar_url) {
            avatarHtml = `<img src="${opponentData.avatar_url}" alt="avatar" id="opponent-avatar-img" />`;
        } else {
            const initial = opponentData.username.charAt(0).toUpperCase();
            avatarHtml = `<span class="avatar-initial">${initial}</span>`;
        }
        
        const colorText = opponentData.color === 'black' ? '黑棋' : '白棋';
        
        // 构造完整的对手信息HTML
        const opponentInfoHtml = `
<div class="avatar-stack-centered">
    <a class="avatar-link" href="/profile/${opponentData.id}/?ref=room&room_code=${window.roomCode}">
        <div class="avatar-large" id="opponent-avatar">
            ${avatarHtml}
        </div>
    </a>
    <div class="player-details">
        <div class="player-name">${opponentData.username}</div>
        <div class="player-color color-${opponentData.color}">
            ${colorText}
        </div>
    </div>
    <div class="player-leave-tag" style="display: none;">已离开</div>
</div>
<div class="stats-grid">
    <div class="stat-item">
        <div class="stat-label">总胜场</div>
        <div class="stat-value">${opponentData.total_wins || 0}</div>
    </div>
    <div class="stat-item">
        <div class="stat-label">总对局</div>
        <div class="stat-value">${opponentData.games_played || 0}</div>
    </div>
    <div class="stat-item">
        <div class="stat-label">胜率</div>
        <div class="stat-value">${opponentData.win_rate ? opponentData.win_rate.toFixed(1) + '%' : '0.0%'}</div>
    </div>
    <div class="stat-item">
        <div class="stat-label">等级</div>
        <div class="stat-value">
            ${(opponentData.total_wins || 0) < 10 ? '新手' : 
              (opponentData.total_wins || 0) < 50 ? '熟练' : 
              (opponentData.total_wins || 0) < 100 ? '高手' : '大师'}
        </div>
    </div>
</div>`;

        // 替换原有的"等待对手..."内容
        opponentInfoElement.innerHTML = opponentInfoHtml;
        
        // 更新记录的对手ID
        this.lastOpponentId = opponentData.id;
    }

    // 请求再来一局
    async requestRematch() {
        try {
            const response = await fetch(`/api/request-rematch/${this.game.roomCode}/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            // 检查响应的状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '请求失败';
                this.game.showMessage(errorMessage, 'error');
                return;
            }
            
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                return;
            }

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

    // 拒绝再来一局
    async rejectRematch() {
        try {
            const response = await fetch(`/api/reject-rematch/${this.game.roomCode}/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.game.getCsrfToken()
                }
            });

            // 检查响应的状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '操作失败';
                this.game.showMessage(errorMessage, 'error');
                return;
            }
            
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Received non-JSON response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                this.game.showMessage('服务器响应错误', 'error');
                return;
            }

            const data = await response.json();

            if (data.success) {
                this.game.showMessage(data.message || '已拒绝再来一局请求', 'success');
            } else {
                this.game.showMessage(data.error || '操作失败', 'error');
            }
        } catch (error) {
            console.error('拒绝再来一局请求失败:', error);
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
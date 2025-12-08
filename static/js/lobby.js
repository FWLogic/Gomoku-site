// 大厅页面JavaScript代码
document.addEventListener('DOMContentLoaded', function() {
    // 获取CSRF令牌
    const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;

    // 加载在线玩家列表
    loadOnlinePlayers();

    // 定期刷新在线玩家列表（每30秒）
    setInterval(loadOnlinePlayers, 30000);

    // 添加页面可见性变化事件监听，当页面重新可见时刷新在线玩家列表
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            loadOnlinePlayers();
        }
    });

    // 处理复制房间链接按钮
    const copyButtons = document.querySelectorAll('.copy-room-link');
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const roomCode = this.dataset.room;
            const roomUrl = window.location.origin + '/join/' + roomCode + '/';

            navigator.clipboard.writeText(roomUrl).then(() => {
                // 创建临时提示元素
                const toast = document.createElement('div');
                toast.className = 'toast';
                toast.textContent = '房间链接已复制到剪贴板！';
                document.body.appendChild(toast);

                // 3秒后移除提示
                setTimeout(() => {
                    toast.remove();
                }, 3000);
            });
        });
    });

    // 处理删除房间按钮
    const deleteButtons = document.querySelectorAll('.delete-room-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function() {
            const roomCode = this.dataset.room;

            if (confirm('确定要删除这个房间吗？')) {
                fetch(`/room/${roomCode}/delete/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // 创建成功提示
                        const toast = document.createElement('div');
                        toast.className = 'toast success';
                        toast.textContent = data.message;
                        document.body.appendChild(toast);

                        // 3秒后移除提示并刷新页面
                        setTimeout(() => {
                            toast.remove();
                            window.location.reload();
                        }, 1500);
                    } else {
                        // 创建错误提示
                        const toast = document.createElement('div');
                        toast.className = 'toast error';
                        toast.textContent = data.error;
                        document.body.appendChild(toast);

                        // 3秒后移除提示
                        setTimeout(() => {
                            toast.remove();
                        }, 3000);
                    }
                })
                .catch(error => {
                    console.error('删除房间失败:', error);
                    alert('删除房间失败，请重试');
                });
            }
        });
    });

    // 加载在线玩家列表函数
    function loadOnlinePlayers() {
        const onlinePlayersList = document.getElementById('online-players-list');

        // 显示加载中状态
        onlinePlayersList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>加载中...</p>
            </div>
        `;

        // 从服务器获取在线玩家数据
        fetch('/api/online-players/', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.players && data.players.length > 0) {
                // 渲染在线玩家列表
                let playersHTML = '';
                data.players.forEach(player => {
                    playersHTML += `
                        <div class="player-item" data-player-id="${player.id}">
                            <div class="player-avatar">
                                ${player.username.charAt(0).toUpperCase()}
                                <div class="online-indicator"></div>
                            </div>
                            <div class="player-info">
                                <div class="player-name">${player.username}</div>
                                <div class="player-status">胜率: ${player.win_rate}% • 在线中</div>
                            </div>
                            <div class="player-actions">
                                <button class="btn btn-primary invite-btn" data-player-id="${player.id}">
                                    邀请对战
                                </button>
                            </div>
                        </div>
                    `;
                });
                onlinePlayersList.innerHTML = playersHTML;
                
                // 为邀请按钮添加事件监听器
                const inviteButtons = document.querySelectorAll('.invite-btn');
                inviteButtons.forEach(button => {
                    button.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const playerId = this.dataset.playerId;
                        invitePlayer(playerId);
                    });
                });
                
                // 为玩家项添加点击事件
                const playerItems = document.querySelectorAll('.player-item');
                playerItems.forEach(item => {
                    item.addEventListener('click', function() {
                        const playerId = this.dataset.playerId;
                        window.location.href = `/profile/${playerId}/`;
                    });
                });
            } else {
                // 没有在线玩家
                onlinePlayersList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-user-slash"></i>
                        <p>当前没有其他在线玩家</p>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('获取在线玩家失败:', error);
            onlinePlayersList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>加载失败，请刷新页面重试</p>
                </div>
            `;
        });
    }

    // 邀请玩家函数
    function invitePlayer(playerId) {
        fetch(`/api/invite-player/${playerId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 创建成功提示
                const toast = document.createElement('div');
                toast.className = 'toast success';
                toast.textContent = data.message;
                document.body.appendChild(toast);

                // 3秒后移除提示
                setTimeout(() => {
                    toast.remove();
                }, 3000);
            } else {
                // 创建错误提示
                const toast = document.createElement('div');
                toast.className = 'toast error';
                toast.textContent = data.error;
                document.body.appendChild(toast);

                // 3秒后移除提示
                setTimeout(() => {
                    toast.remove();
                }, 3000);
            }
        })
        .catch(error => {
            console.error('邀请玩家失败:', error);
            alert('邀请失败，请重试');
        });
    }
});

// 大厅页面JavaScript代码
document.addEventListener('DOMContentLoaded', function() {
    // 获取CSRF令牌
    const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;

    // 加载在线玩家列表
    loadOnlinePlayers();
    
    // 加载可用房间列表
    loadAvailableRooms();

    // 定期刷新在线玩家列表（每45秒）
    let onlinePlayersInterval = setInterval(loadOnlinePlayers, 45000);
    
    // 定期检查邀请通知（每15秒）
    let invitationsInterval = setInterval(checkInvitations, 15000);

    // 初始加载邀请通知
    checkInvitations();

    // 每3分钟更新一次会话活动时间
    let sessionUpdateInterval = setInterval(() => {
        if (!document.hidden) {
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
    }, 180000); // 180000毫秒 = 3分钟

    // 添加页面可见性变化事件监听，当页面重新可见时刷新在线玩家列表和邀请通知
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            loadOnlinePlayers();
            loadAvailableRooms();
            checkInvitations();
            // 页面重新可见时，立即更新一次session
            fetch('/api/update-session/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken
                }
            }).catch(error => {
                console.error('更新会话活动时间出错:', error);
            });
            // 恢复定时器
            if (!onlinePlayersInterval) {
                onlinePlayersInterval = setInterval(loadOnlinePlayers, 30000);
            }
            if (!invitationsInterval) {
                invitationsInterval = setInterval(checkInvitations, 10000);
            }
        } else {
            // 页面隐藏时，停止定时器
            if (onlinePlayersInterval) {
                clearInterval(onlinePlayersInterval);
                onlinePlayersInterval = null;
            }
            if (invitationsInterval) {
                clearInterval(invitationsInterval);
                invitationsInterval = null;
            }
        }
    });

    // 监听页面关闭/刷新事件，清理session
    window.addEventListener('beforeunload', () => {
        // 使用 sendBeacon 发送异步请求，即使页面关闭也能发送
        const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
        navigator.sendBeacon('/api/clear-session/', blob);
    });

    // 处理复制房间链接按钮
    const copyButtons = document.querySelectorAll('.copy-room-link');
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const roomCode = this.dataset.room;
            const roomUrl = 'http://w.nat123.cc/room/' + roomCode + '/';

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
                .then(response => {
                    // 检查响应是否为JSON格式
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.indexOf('application/json') !== -1) {
                        return response.json();
                    } else {
                        // 如果不是JSON，抛出错误
                        throw new Error('服务器返回了非JSON响应');
                    }
                })
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

    // 处理创建房间按钮，创建后立即刷新房间列表
    const createRoomButton = document.querySelector('.lobby-create-btn');
    if (createRoomButton) {
        createRoomButton.addEventListener('click', function(e) {
            e.preventDefault(); // 阻止默认跳转行为
            
            // 通过AJAX请求创建房间
            fetch('/room/create/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 立即刷新房间列表
                    loadAvailableRooms();
                    
                    // 在当前窗口中跳转到创建的房间
                    window.location.href = `/room/${data.room_code}/`;
                } else {
                    // 创建失败，显示错误信息
                    const toast = document.createElement('div');
                    toast.className = 'toast error';
                    toast.textContent = data.error || '创建房间失败';
                    document.body.appendChild(toast);
                    
                    // 3秒后移除提示
                    setTimeout(() => {
                        toast.remove();
                    }, 3000);
                }
            })
            .catch(error => {
                console.error('创建房间失败:', error);
                alert('创建房间失败，请重试');
            });
        });
    }

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
                    const avatarHtml = player.avatar_url ? ` <img src="${player.avatar_url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" /> ` : player.username.charAt(0).toUpperCase();
                    playersHTML += `
                        <div class="player-item" data-player-id="${player.id}">
                            <div class="player-avatar">
                                ${avatarHtml}
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
    
    // 加载可用房间列表函数
    function loadAvailableRooms() {
        const availableRoomsSection = document.querySelector('.room-list:nth-child(2)'); // 加入房间部分
        
        // 从服务器获取可用房间数据
        fetch('/api/available-rooms/', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.rooms && data.rooms.length > 0) {
                // 渲染可用房间列表
                let roomsHTML = '<h3 class="section-title"><i class="fas fa-users"></i> 加入房间</h3>';
                data.rooms.forEach(room => {
                    roomsHTML += `
                        <div class="room-item">
                            <div class="room-header">
                                <span class="room-code">#${room.room_code}</span>
                                <span class="room-status status-waiting">等待中</span>
                            </div>
                            <div class="room-meta">
                                房主: ${room.creator_username}
                            </div>
                            <div class="room-actions">
                                <a href="/join/${room.room_code}/" class="btn btn-success">
                                    加入房间
                                </a>
                                <button class="btn btn-secondary copy-room-link" data-room="${room.room_code}">
                                    <i class="fas fa-link"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
                availableRoomsSection.innerHTML = roomsHTML;
                
                // 为新添加的复制按钮添加事件监听器
                const newCopyButtons = availableRoomsSection.querySelectorAll('.copy-room-link');
                newCopyButtons.forEach(button => {
                    button.addEventListener('click', function() {
                        const roomCode = this.dataset.room;
                        const roomUrl = 'http://w.nat123.cc/room/' + roomCode + '/';

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
            } else {
                // 没有可用房间
                availableRoomsSection.innerHTML = `
                    <h3 class="section-title"><i class="fas fa-users"></i> 加入房间</h3>
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <p>暂时没有可加入的房间</p>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('获取可用房间失败:', error);
        });
    }

    // 邀请玩家函数
    function invitePlayer(playerId) {
        // 禁用邀请按钮，防止重复点击
        const inviteBtn = document.querySelector(`[data-player-id="${playerId}"].invite-btn`);
        if (inviteBtn) {
            inviteBtn.disabled = true;
            inviteBtn.textContent = '邀请中...';
        }
        
        fetch(`/api/invite-player/${playerId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        })
        .then(response => {
            // 检查响应的内容类型
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.indexOf('application/json') !== -1) {
                return response.json();
            } else {
                // 如果不是JSON，抛出错误
                throw new Error('服务器返回了意外的内容类型');
            }
        })
        .then(data => {
            if (data.success) {
                // 创建成功提示
                const toast = document.createElement('div');
                toast.className = 'toast success';
                toast.textContent = data.message;
                document.body.appendChild(toast);
                
                // 保存邀请ID以便后续跟踪
                if (data.invitation_id) {
                    trackInvitationStatus(data.invitation_id, playerId);
                }

                // 3秒后移除提示
                setTimeout(() => {
                    toast.remove();
                }, 3000);
            } else {
                // 恢复按钮状态
                if (inviteBtn) {
                    inviteBtn.disabled = false;
                    inviteBtn.textContent = '邀请对战';
                }
                
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
            // 恢复按钮状态
            if (inviteBtn) {
                inviteBtn.disabled = false;
                inviteBtn.textContent = '邀请对战';
            }
            
            console.error('邀请玩家失败:', error);
            // 使用更友好的提示方式替代alert
            const toast = document.createElement('div');
            toast.className = 'toast error';
            toast.textContent = '邀请失败，请重试';
            document.body.appendChild(toast);
            
            // 3秒后移除提示
            setTimeout(() => {
                toast.remove();
            }, 3000);
        });
    }
    
    // 跟踪邀请状态
    function trackInvitationStatus(invitationId, playerId) {
        // 创建邀请状态跟踪容器
        const statusContainer = document.createElement('div');
        statusContainer.className = 'invitation-status';
        statusContainer.setAttribute('data-invitation-id', invitationId);
        statusContainer.innerHTML = `
            <div class="status-header">
                <span>邀请已发送</span>
                <button class="status-close-btn" onclick="cancelInvitationStatus(${invitationId}, ${playerId})">&times;</button>
            </div>
            <div class="status-body">
                <p>等待对方回应...</p>
                <div class="status-indicator">
                    <div class="status-dot"></div>
                </div>
            </div>
        `;
        
        // 添加到页面
        let container = document.querySelector('.invitation-status-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'invitation-status-container';
            document.body.appendChild(container);
        }
        container.appendChild(statusContainer);
        
        // 添加动画
        setTimeout(() => {
            statusContainer.classList.add('show');
        }, 100);
        
        // 定期检查邀请状态
        const checkInterval = setInterval(() => {
            checkInvitationStatusUpdate(invitationId, playerId, checkInterval);
        }, 3000); // 每3秒检查一次
        
        // 保存定时器ID到元素上，以便后续清除
        statusContainer.setAttribute('data-interval-id', checkInterval);
    }
    
    // 检查邀请状态更新
    function checkInvitationStatusUpdate(invitationId, playerId, intervalId) {
        fetch(`/api/invitation/${invitationId}/status/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const statusContainer = document.querySelector(`[data-invitation-id="${invitationId}"]`);
                if (!statusContainer) return;
                
                const statusBody = statusContainer.querySelector('.status-body p');
                const statusDot = statusContainer.querySelector('.status-dot');
                
                if (data.status === 'accepted') {
                    // 邀请被接受
                    clearInterval(intervalId);
                    statusBody.textContent = '对方已接受邀请，游戏即将开始';
                    statusDot.className = 'status-dot accepted';
                    
                    // 恢复邀请按钮
                    const inviteBtn = document.querySelector(`[data-player-id="${playerId}"].invite-btn`);
                    if (inviteBtn) {
                        inviteBtn.disabled = false;
                        inviteBtn.textContent = '邀请对战';
                    }
                    
                    // 2秒后进入房间
                    setTimeout(() => {
                        window.location.href = `/room/${data.room_code}/`;
                    }, 2000);
                } else if (data.status === 'rejected') {
                    // 邀请被拒绝
                    clearInterval(intervalId);
                    statusBody.textContent = '对方拒绝了邀请';
                    statusDot.className = 'status-dot rejected';
                    
                    // 恢复邀请按钮
                    const inviteBtn = document.querySelector(`[data-player-id="${playerId}"].invite-btn`);
                    if (inviteBtn) {
                        inviteBtn.disabled = false;
                        inviteBtn.textContent = '邀请对战';
                    }
                    
                    // 5秒后关闭状态提示
                    setTimeout(() => {
                        cancelInvitationStatus(invitationId, playerId);
                    }, 5000);
                } else if (data.status === 'expired') {
                    // 邀请已过期
                    clearInterval(intervalId);
                    statusBody.textContent = '邀请已过期';
                    statusDot.className = 'status-dot expired';
                    
                    // 恢复邀请按钮
                    const inviteBtn = document.querySelector(`[data-player-id="${playerId}"].invite-btn`);
                    if (inviteBtn) {
                        inviteBtn.disabled = false;
                        inviteBtn.textContent = '邀请对战';
                    }
                    
                    // 5秒后关闭状态提示
                    setTimeout(() => {
                        cancelInvitationStatus(invitationId, playerId);
                    }, 5000);
                }
            }
        })
        .catch(error => {
            console.error('检查邀请状态失败:', error);
        });
    }
    
    // 关闭邀请状态提示
    window.cancelInvitationStatus = function(invitationId, playerId) {
        const statusContainer = document.querySelector(`[data-invitation-id="${invitationId}"]`);
        if (statusContainer) {
            // 清除定时器
            const intervalId = statusContainer.getAttribute('data-interval-id');
            if (intervalId) {
                clearInterval(parseInt(intervalId));
            }
            
            // 移除状态提示
            statusContainer.classList.remove('show');
            setTimeout(() => {
                statusContainer.remove();
            }, 300);
        }
        
        // 恢复邀请按钮
        const inviteBtn = document.querySelector(`[data-player-id="${playerId}"].invite-btn`);
        if (inviteBtn) {
            inviteBtn.disabled = false;
            inviteBtn.textContent = '邀请对战';
        }
    };
    
    // 检查邀请通知函数
    function checkInvitations() {
        fetch('/api/invitations/', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.invitations && data.invitations.length > 0) {
                // 显示邀请通知
                data.invitations.forEach(invitation => {
                    showInvitationNotification(invitation);
                });
            }
        })
        .catch(error => {
            console.error('获取邀请通知失败:', error);
        });
    }
    
    // 显示邀请通知
    function showInvitationNotification(invitation) {
        // 检查是否已经显示过这个邀请
        const existingNotification = document.querySelector(`[data-invitation-id="${invitation.id}"]`);
        if (existingNotification) {
            return; // 已显示过，不再重复显示
        }
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = 'invitation-notification';
        notification.setAttribute('data-invitation-id', invitation.id);
        
        // 计算邀请时间
        const invitationTime = new Date(invitation.created_at);
        const timeString = invitationTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        
        notification.innerHTML = `
            <div class="notification-header">
                <i class="fas fa-chess"></i>
                <span>游戏邀请</span>
                <button class="close-btn" onclick="closeInvitation(${invitation.id})">&times;</button>
            </div>
            <div class="notification-body">
                <p><strong>${invitation.sender.username}</strong> 邀请您加入房间 #${invitation.room_code}</p>
                <p class="time">邀请时间: ${timeString}</p>
                <div class="notification-actions">
                    <button class="btn btn-success accept-btn" onclick="acceptInvitation(${invitation.id})">接受</button>
                    <button class="btn btn-danger reject-btn" onclick="rejectInvitation(${invitation.id})">拒绝</button>
                </div>
            </div>
        `;
        
        // 添加到通知容器
        let container = document.querySelector('.invitation-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'invitation-container';
            document.body.appendChild(container);
        }
        container.appendChild(notification);
        
        // 添加动画效果
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // 自动关闭通知（30秒后）
        setTimeout(() => {
            if (document.body.contains(notification)) {
                closeInvitation(invitation.id);
            }
        }, 30000);
    }
    
    // 关闭邀请通知
    window.closeInvitation = function(invitationId) {
        const notification = document.querySelector(`[data-invitation-id="${invitationId}"]`);
        if (notification) {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }
    };
    
    // 接受邀请
    window.acceptInvitation = function(invitationId) {
        fetch(`/api/invitation/${invitationId}/accept/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 关闭通知
                closeInvitation(invitationId);
                
                // 显示成功消息
                const toast = document.createElement('div');
                toast.className = 'toast success';
                toast.textContent = data.message;
                document.body.appendChild(toast);
                
                // 2秒后进入房间
                setTimeout(() => {
                    window.location.href = `/room/${data.room_code}/`;
                }, 2000);
            } else {
                // 显示错误消息
                const toast = document.createElement('div');
                toast.className = 'toast error';
                toast.textContent = data.error;
                document.body.appendChild(toast);
                
                // 3秒后移除提示
                setTimeout(() => {
                    toast.remove();
                }, 3000);
                
                // 关闭通知
                closeInvitation(invitationId);
            }
        })
        .catch(error => {
            console.error('接受邀请失败:', error);
            alert('接受邀请失败，请重试');
            closeInvitation(invitationId);
        });
    };
    
    // 拒绝邀请
    window.rejectInvitation = function(invitationId) {
        fetch(`/api/invitation/${invitationId}/reject/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 关闭通知
                closeInvitation(invitationId);
                
                // 显示成功消息
                const toast = document.createElement('div');
                toast.className = 'toast info';
                toast.textContent = data.message;
                document.body.appendChild(toast);
                
                // 3秒后移除提示
                setTimeout(() => {
                    toast.remove();
                }, 3000);
            } else {
                // 显示错误消息
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
            console.error('拒绝邀请失败:', error);
            alert('拒绝邀请失败，请重试');
            closeInvitation(invitationId);
        });
    };
});
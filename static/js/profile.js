// 个人资料页面JavaScript代码
document.addEventListener('DOMContentLoaded', function() {
    // 这里可以添加个人资料页面的交互功能
    // 例如：编辑资料、查看详细统计等

    // 如果是自己的资料页面，可以添加编辑按钮
    const isOwnProfile = document.querySelector('.profile-header').dataset.isOwn === 'true';

    if (isOwnProfile) {
        // 创建编辑资料按钮
        const editButton = document.createElement('button');
        editButton.className = 'btn btn-primary';
        editButton.innerHTML = '<i class="fas fa-edit"></i> 编辑资料';
        editButton.style.marginTop = '20px';

        // 添加到个人资料区域
        const profileHeader = document.querySelector('.profile-header');
        profileHeader.appendChild(editButton);

        // 点击编辑按钮的处理逻辑
        editButton.addEventListener('click', function() {
            // 打开编辑资料页面
            window.location.href = '/profile/edit/';
        });
    }

    // 添加查看更多记录的按钮
    const recentGames = document.querySelector('.room-item');
    if (recentGames) {
        const moreButton = document.createElement('button');
        moreButton.className = 'btn btn-secondary';
        moreButton.innerHTML = '查看更多游戏记录';
        moreButton.style.marginTop = '15px';
        moreButton.style.width = '100%';

        // 添加到最近游戏区域
        const recentGamesContainer = recentGames.parentElement;
        recentGamesContainer.appendChild(moreButton);

        // Pagination state
        let currentPage = 1;
        const pageSize = 10;
        const profileHeader = document.querySelector('.profile-header');
        const playerId = profileHeader ? profileHeader.dataset.playerId : null;

        function renderGameItem(game, profilePlayerId) {
            const div = document.createElement('div');
            div.className = 'room-item';

            const header = document.createElement('div');
            header.className = 'room-header';

            const code = document.createElement('span');
            code.className = 'room-code';
            code.textContent = `#${game.room_code}`;

            const status = document.createElement('span');
            status.className = 'room-status';
            if (game.winner_id === profilePlayerId) {
                status.textContent = '胜利';
                status.classList.add('status-playing');
            } else if (game.is_draw) {
                status.textContent = '和棋';
                status.classList.add('status-finished');
            } else {
                status.textContent = '失败';
                status.classList.add('status-waiting');
            }

            header.appendChild(code);
            header.appendChild(status);

            const meta = document.createElement('div');
            meta.style = 'font-size: 14px; color: #666; margin-bottom: 10px;';
            const createdAt = new Date(game.created_at);
            const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
            const dd = String(createdAt.getDate()).padStart(2, '0');
            const hh = String(createdAt.getHours()).padStart(2, '0');
            const min = String(createdAt.getMinutes()).padStart(2, '0');
            meta.textContent = `${mm}-${dd} ${hh}:${min} • 对手: ${game.opponent_username}`;

            div.appendChild(header);
            div.appendChild(meta);

            // 如果是自己的资料页，添加查看详情按钮
            const isOwnProfile = profileHeader && profileHeader.dataset.isOwn === 'true';
            if (isOwnProfile) {
                const a = document.createElement('a');
                a.className = 'btn btn-secondary';
                a.style.width = '100%';
                a.href = `/room/${game.room_code}/?ref=profile`;
                a.textContent = '查看详情';
                div.appendChild(a);
            }

            return div;
        }

        async function loadMore() {
            if (!playerId) return;
            currentPage += 1;
            moreButton.disabled = true;
            moreButton.textContent = '加载中...';

            try {
                const resp = await fetch(`/api/player/${playerId}/recent-games/?page=${currentPage}&page_size=${pageSize}`, {
                    credentials: 'same-origin'
                });
                if (!resp.ok) throw new Error('网络错误');
                const data = await resp.json();
                if (!data.success) throw new Error(data.error || '获取失败');

                const list = document.getElementById('recent-games-list');
                if (!list) return;

                const profilePlayerId = parseInt(playerId, 10);

                if (data.games.length === 0) {
                    moreButton.textContent = '没有更多记录';
                    moreButton.disabled = true;
                    return;
                }

                data.games.forEach(g => {
                    const item = renderGameItem(g, profilePlayerId);
                    list.appendChild(item);
                });

                // 如果已加载全部
                const loaded = (currentPage) * pageSize;
                if (loaded >= data.total) {
                    moreButton.textContent = '没有更多记录';
                    moreButton.disabled = true;
                } else {
                    moreButton.textContent = '查看更多游戏记录';
                    moreButton.disabled = false;
                }

            } catch (e) {
                console.error('加载更多失败', e);
                moreButton.textContent = '加载失败，重试';
                moreButton.disabled = false;
            }
        }

        // 点击查看更多按钮的处理逻辑
        moreButton.addEventListener('click', function() {
            loadMore();
        });
    }
});

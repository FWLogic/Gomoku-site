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
            // 这里可以添加编辑资料的功能
            // 例如：显示一个模态框让用户编辑信息
            alert('编辑资料功能尚未实现');
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

        // 点击查看更多按钮的处理逻辑
        moreButton.addEventListener('click', function() {
            // 这里可以添加加载更多游戏记录的功能
            alert('加载更多游戏记录功能尚未实现');
        });
    }
});

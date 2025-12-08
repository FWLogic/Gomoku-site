// 大厅页面JavaScript代码
document.addEventListener('DOMContentLoaded', function() {
    // 获取CSRF令牌
    const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;

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
});

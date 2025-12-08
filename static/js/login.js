// 登录页面JavaScript代码
document.addEventListener('DOMContentLoaded', function() {
    // 登录表单处理
    const loginForm = document.querySelector('form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            const username = document.querySelector('input[name="username"]').value.trim();

            // 简单的客户端验证
            if (!username) {
                e.preventDefault();
                showError('请输入用户名');
                return;
            }

            if (username.length < 2) {
                e.preventDefault();
                showError('用户名至少需要2个字符');
                return;
            }
        });
    }

    // 显示错误信息函数
    function showError(message) {
        // 移除已存在的错误提示
        const existingError = document.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // 创建新的错误提示
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;

        // 插入到表单前面
        loginForm.parentNode.insertBefore(errorDiv, loginForm);
    }
});

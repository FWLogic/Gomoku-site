from django.shortcuts import render, redirect
from django.contrib.auth import login, get_user_model
from game.models import Player, PlayerSession


def login_view(request):
    if request.user.is_authenticated:
        return redirect('lobby')

    if request.method == 'POST':
        username = request.POST.get('username', '').strip()

        if not username:
            return render(request, 'account/login.html', {'error': '请输入用户名'})

        # 获取或创建用户
        User = get_user_model()
        user, created = User.objects.get_or_create(username=username)
        if created:
            user.set_unusable_password()  # 不需要密码
            user.save()
            Player.objects.create(user=user)

        # 登录用户
        login(request, user)

        # 创建会话记录
        PlayerSession.objects.create(
            player=Player.objects.get(user=user),
            session_key=request.session.session_key
        )

        # 设置永不过期的session（30天）
        request.session.set_expiry(60 * 60 * 24 * 30)

        return redirect('lobby')

    return render(request, 'account/login.html')


def logout_view(request):
    from django.contrib.auth import logout

    # 清除会话记录
    if request.user.is_authenticated:
        try:
            PlayerSession.objects.filter(
                player__user=request.user,
                session_key=request.session.session_key
            ).delete()
        except:
            pass

    logout(request)
    return redirect('login')
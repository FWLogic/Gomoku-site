from django.shortcuts import render, redirect
from django.contrib.auth import login, get_user_model
from django.contrib.auth.decorators import login_required
from game.models import Player, PlayerSession, GomokuRoom, MoveHistory, ChatMessage, FriendStats


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


@login_required
def delete_account_confirm(request):
    """显示删除账户确认页面"""
    return render(request, 'account/delete_confirm.html')


@login_required
def delete_account(request):
    """删除用户账户及相关数据"""
    if request.method != 'POST':
        return redirect('delete_account_confirm')

    try:
        # 获取当前用户和玩家信息
        user = request.user
        player = Player.objects.get(user=user)

        # 删除所有与该玩家相关的数据
        # 1. 删除该玩家创建的房间
        GomokuRoom.objects.filter(creator=player).delete()

        # 2. 删除该玩家参与的房间（作为对手）
        GomokuRoom.objects.filter(opponent=player).update(opponent=None)

        # 3. 删除该玩家的移动记录
        MoveHistory.objects.filter(player=player).delete()

        # 4. 删除该玩家的聊天记录
        ChatMessage.objects.filter(player=player).delete()

        # 5. 删除该玩家的好友统计
        FriendStats.objects.filter(player1=player).delete()
        FriendStats.objects.filter(player2=player).delete()

        # 6. 删除该玩家的会话记录
        PlayerSession.objects.filter(player=player).delete()

        # 7. 删除玩家记录
        player.delete()

        # 8. 删除用户记录
        user.delete()

        # 注销并重定向到登录页
        from django.contrib.auth import logout
        logout(request)

        return redirect('login')

    except Exception as e:
        # 如果出错，显示错误页面
        return render(request, 'account/delete_error.html', {'error': str(e)})
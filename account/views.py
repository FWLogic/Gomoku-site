from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q
from django.urls import reverse
from django.http import HttpResponse
from game.models import Player, PlayerSession, GomokuRoom, MoveHistory, ChatMessage, FriendStats
import time
import json
from urllib.parse import quote, unquote


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

        # 设置永不过期的session（10年）
        request.session.set_expiry(60 * 60 * 24 * 365 * 10)

        # 设置永久登录cookie（URL编码中文用户名）
        response = redirect('lobby')
        response.set_cookie('permanent_username', quote(username, safe=''), max_age=60*60*24*365*10, httponly=True)
        return response

    # 检查是否存在永久登录cookie
    permanent_username_encoded = request.COOKIES.get('permanent_username')
    if permanent_username_encoded:
        try:
            # URL解码用户名
            permanent_username = unquote(permanent_username_encoded)
            User = get_user_model()
            user = User.objects.get(username=permanent_username)
            login(request, user)
            
            # 更新会话记录
            PlayerSession.objects.create(
                player=Player.objects.get(user=user),
                session_key=request.session.session_key
            )
            
            # 刷新cookie过期时间（保持编码）
            response = redirect('lobby')
            response.set_cookie('permanent_username', permanent_username_encoded, max_age=60*60*24*365*10, httponly=True)
            return response
        except User.DoesNotExist:
            pass

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

    # 清除永久登录cookie
    response = redirect('login')
    response.delete_cookie('permanent_username')
    logout(request)
    return response


@login_required
def profile_view(request, player_id=None):
    """显示用户资料页面"""
    # 如果没有提供player_id，则显示当前用户的资料
    if player_id is None:
        player = get_object_or_404(Player, user=request.user)
        is_own_profile = True
    else:
        player = get_object_or_404(Player, id=player_id)
        is_own_profile = (player.user == request.user)
    
    # 获取对战统计
    stats_list = []
    if is_own_profile:
        # 获取自己的对战统计
        friend_stats = FriendStats.objects.filter(
            Q(player1=player) | Q(player2=player)
        ).select_related('player1', 'player2')
        
        for stats in friend_stats:
            opponent = stats.player2 if stats.player1 == player else stats.player1
            wins = stats.get_wins_for_player(player)
            # 计算失败场次：总场次 - 胜利场次 - 平局场次
            losses = stats.total_games - wins - stats.draws
            stats_list.append({
                'opponent': opponent,
                'wins': wins,
                'losses': losses,
                'draws': stats.draws,
                'last_played': stats.last_played
            })
    
    # 获取最近的游戏记录
    recent_games = GomokuRoom.objects.filter(
        Q(creator=player) | Q(opponent=player),
        status='finished'
    ).order_by('-created_at')[:10]
    
    context = {
        'profile_player': player,
        'is_own_profile': is_own_profile,
        'stats_list': stats_list,
        'recent_games': recent_games,
    }
    
    return render(request, 'account/profile.html', context)


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


@login_required
def edit_profile(request):
    """编辑当前用户的资料：头像、用户名、简介"""
    user = request.user
    player = get_object_or_404(Player, user=user)

    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        bio = request.POST.get('bio', '').strip()
        avatar_file = request.FILES.get('avatar')

        User = get_user_model()

        # 验证用户名是否已被使用（除当前用户外）
        if username and username != user.username:
            if User.objects.filter(username=username).exclude(pk=user.pk).exists():
                messages.error(request, '用户名已被占用')
                return render(request, 'account/edit_profile.html', {'player': player, 'user': user})
            else:
                user.username = username
                user.save()

        # 保存简介
        player.bio = bio

        # 保存头像文件（如果上传）
        if avatar_file:
            # 简单的图片类型与大小校验（限制为2MB）
            content_type = avatar_file.content_type if hasattr(avatar_file, 'content_type') else ''
            if not content_type.startswith('image/'):
                messages.error(request, '请上传图片文件作为头像')
                return render(request, 'account/edit_profile.html', {'player': player, 'user': user})
            if avatar_file.size > 2 * 1024 * 1024:
                messages.error(request, '头像文件过大，最大允许 2MB')
                return render(request, 'account/edit_profile.html', {'player': player, 'user': user})

            # 自动裁剪并缩放图片到 256x256（中心裁剪为正方形）
            try:
                from PIL import Image
                import io
                from django.core.files.base import ContentFile

                image = Image.open(avatar_file)
                # Convert to RGB to ensure consistent format (especially for PNG with transparency)
                if image.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    background.paste(image, mask=image.split()[-1])
                    image = background
                else:
                    image = image.convert('RGB')

                width, height = image.size
                # center crop to square
                min_side = min(width, height)
                left = (width - min_side) // 2
                top = (height - min_side) // 2
                right = left + min_side
                bottom = top + min_side
                image = image.crop((left, top, right, bottom))

                # resize to desired size
                target_size = 256
                # Use Resampling enum if available (Pillow >=9), otherwise fallback
                resample_filter = getattr(Image, 'Resampling', None)
                if resample_filter:
                    resample_filter = Image.Resampling.LANCZOS
                else:
                    resample_filter = Image.LANCZOS

                image = image.resize((target_size, target_size), resample_filter)

                # Save processed image to memory
                thumb_io = io.BytesIO()
                image.save(thumb_io, format='JPEG', quality=90)
                thumb_file = ContentFile(thumb_io.getvalue())

                # remove old avatar file if exists
                try:
                    if player.avatar:
                        player.avatar.delete(save=False)
                except:
                    pass

                # Create a filename
                fname = f"avatar_{player.user.username}_{int(time.time())}.jpg"
                player.avatar.save(fname, thumb_file, save=False)

            except Exception as e:
                messages.error(request, f'处理头像时出错: {str(e)}')
                return render(request, 'account/edit_profile.html', {'player': player, 'user': user})
        # 允许用户通过表单清除头像（例如发送空文件并设置 clear_avatar=true）
        if request.POST.get('clear_avatar') == '1':
            player.avatar.delete(save=False)
            player.avatar = None

        player.save()

        messages.success(request, '资料已更新')
        # redirect back to profile, with a cache-busting query param so avatar updates show immediately
        ts = int(time.time())
        # Preserve optional ref/room_code so that returning from profile can go back to origin (e.g., room)
        ref = request.GET.get('ref') or request.POST.get('ref')
        room_code = request.GET.get('room_code') or request.POST.get('room_code')
        redirect_url = reverse('player_profile', args=[player.id]) + f'?updated={ts}'
        if ref:
            redirect_url += f'&ref={ref}'
            if room_code:
                redirect_url += f'&room_code={room_code}'
        return redirect(redirect_url)

    return render(request, 'account/edit_profile.html', {'player': player, 'user': user})
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta
from ..models import *


@login_required
def lobby(request):
    player, created = Player.objects.get_or_create(user=request.user)

    # 更新或创建会话
    session, created = PlayerSession.objects.update_or_create(
        player=player,
        session_key=request.session.session_key,
        defaults={'last_activity': timezone.now()}
    )

    # 获取活跃房间
    my_active_rooms = GomokuRoom.objects.filter(
        Q(creator=player) | Q(opponent=player),
        status__in=['waiting', 'playing']
    ).order_by('-created_at')

    # 获取可加入的公共房间
    available_rooms = GomokuRoom.objects.filter(
        status='waiting',
        opponent__isnull=True
    ).exclude(creator=player).order_by('-created_at')[:10]

    # 获取好友列表（曾经对战过的玩家）
    friend_stats = FriendStats.objects.filter(
        Q(player1=player) | Q(player2=player)
    ).select_related('player1', 'player2').order_by('-last_played')

    friends = []
    for stats in friend_stats:
        friend = stats.player2 if stats.player1 == player else stats.player1
        friends.append({
            'player': friend,
            'wins': stats.get_wins_for_player(player),
            'total_games': stats.total_games,
            'last_played': stats.last_played
        })

    return render(request, 'game/lobby.html', {
        'player': player,
        'my_rooms': my_active_rooms,
        'available_rooms': available_rooms,
        'friends': friends[:10],  # 显示最近10个好友
    })


@login_required
@require_GET
def get_online_players(request):
    """获取在线玩家列表"""
    current_player = Player.objects.get(user=request.user)

    # 获取最近5分钟内有活动记录的玩家
    five_minutes_ago = timezone.now() - timedelta(minutes=5)

    # 先更新当前用户的会话活动时间
    updated_sessions = PlayerSession.objects.filter(
        player=current_player,
        session_key=request.session.session_key
    ).update(last_activity=timezone.now())

    # 如果没有会话记录，创建一个
    if updated_sessions == 0:
        PlayerSession.objects.create(
            player=current_player,
            session_key=request.session.session_key,
            last_activity=timezone.now()
        )

    # 使用values获取不重复的玩家ID，然后再获取完整的会话对象
    online_player_ids = PlayerSession.objects.filter(
        last_activity__gte=five_minutes_ago
    ).values_list('player_id', flat=True).distinct()

    # 获取每个玩家的最新会话
    online_sessions = []
    for player_id in online_player_ids:
        latest_session = PlayerSession.objects.filter(
            player_id=player_id,
            last_activity__gte=five_minutes_ago
        ).order_by('-last_activity').select_related('player').first()
        if latest_session:
            online_sessions.append(latest_session)

    # 获取在线玩家
    online_players = []
    for session in online_sessions:
        player = session.player
        if player != current_player:
            # 检查玩家是否已在游戏中
            in_game = GomokuRoom.objects.filter(
                Q(creator=player) | Q(opponent=player),
                status='playing'
            ).exists()

            online_players.append({
                'id': player.id,
                'username': player.user.username,
                'win_rate': round(player.win_rate(), 1),
                'in_game': in_game,
                'avatar_url': player.avatar.url if player.avatar else None,
            })

    return JsonResponse({
        'success': True,
        'players': online_players
    })
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from django.utils import timezone
import json
from ..models import *


@login_required
def player_profile(request, player_id=None):
    """查看玩家资料"""
    if player_id:
        profile_player = get_object_or_404(Player, id=player_id)
    else:
        profile_player = get_object_or_404(Player, user=request.user)

    # 获取对战统计
    friend_stats = FriendStats.objects.filter(
        Q(player1=profile_player) | Q(player2=profile_player)
    ).select_related('player1', 'player2')

    stats_list = []
    for stats in friend_stats:
        opponent = stats.player2 if stats.player1 == profile_player else stats.player1
        stats_list.append({
            'opponent': opponent,
            'wins': stats.get_wins_for_player(profile_player),
            'losses': stats.player2_wins if opponent == stats.player1 else stats.player1_wins,
            'draws': stats.draws,
            'total_games': stats.total_games,
            'last_played': stats.last_played
        })

    # 最近游戏
    recent_games = GomokuRoom.objects.filter(
        Q(creator=profile_player) | Q(opponent=profile_player),
        status='finished'
    ).order_by('-created_at')[:10]

    return render(request, 'account/profile.html', {
        'profile_player': profile_player,
        'stats_list': stats_list,
        'recent_games': recent_games,
        'is_own_profile': profile_player.user == request.user
    })


@login_required
@require_GET
def get_player_recent_games(request, player_id):
    """返回玩家的最近游戏记录（分页）"""
    try:
        profile_player = Player.objects.get(id=player_id)
    except Player.DoesNotExist:
        return JsonResponse({'success': False, 'error': '玩家不存在'}, status=404)

    # 分页参数
    try:
        page = int(request.GET.get('page', 1))
    except:
        page = 1
    try:
        page_size = int(request.GET.get('page_size', 10))
    except:
        page_size = 10

    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 10

    offset = (page - 1) * page_size

    games_qs = GomokuRoom.objects.filter(
        Q(creator=profile_player) | Q(opponent=profile_player),
        status='finished'
    ).order_by('-created_at')

    total = games_qs.count()
    games = games_qs[offset:offset + page_size]

    results = []
    for game in games:
        opponent = None
        if game.creator == profile_player:
            opponent = game.opponent
        else:
            opponent = game.creator

        results.append({
            'room_code': game.room_code,
            'created_at': game.created_at.isoformat(),
            'opponent_username': opponent.user.username if opponent else '未知',
            'winner_id': game.winner.id if game.winner else None,
            'is_draw': game.is_draw,
        })

    return JsonResponse({
        'success': True,
        'page': page,
        'page_size': page_size,
        'total': total,
        'games': results,
    })
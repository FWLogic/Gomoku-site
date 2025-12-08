from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
import json
from datetime import datetime
import random
from django.utils import timezone
from .models import *


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
def create_room(request):
    player = get_object_or_404(Player, user=request.user)

    # 创建新房间
    room = GomokuRoom.objects.create(
        creator=player,
        status='waiting'
    )

    # 随机决定谁先走
    room.current_turn = player
    room.save()

    return redirect('game_room', room_code=room.room_code)


@login_required
def join_room(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        if room.status != 'waiting':
            return JsonResponse({'error': '房间已满或已开始游戏'}, status=400)

        if room.creator == player:
            return redirect('game_room', room_code=room_code)

        if room.opponent is None:
            room.opponent = player
            room.status = 'playing'
            room.save()

            # 创建或更新好友统计
            friend_stats, created = FriendStats.objects.get_or_create(
                player1=min(room.creator, room.opponent, key=lambda p: p.id),
                player2=max(room.creator, room.opponent, key=lambda p: p.id)
            )

            return redirect('game_room', room_code=room_code)
        else:
            return JsonResponse({'error': '房间已满'}, status=400)

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)


@login_required
def game_room(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    # 更新会话活动时间
    PlayerSession.objects.update_or_create(
        player=player,
        session_key=request.session.session_key,
        defaults={'last_activity': timezone.now()}
    )

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        # 检查是否有权限进入房间
        if room.creator != player and (room.opponent != player if room.opponent else True):
            return redirect('lobby')

        # 获取对手信息
        opponent = None
        if room.opponent:
            opponent = room.opponent if room.opponent != player else room.creator

        # 获取好友对战统计
        friend_stats = None
        if opponent:
            friend_stats = FriendStats.objects.filter(
                Q(player1=player, player2=opponent) | Q(player1=opponent, player2=player)
            ).first()

        # 获取聊天记录
        chat_messages = ChatMessage.objects.filter(room=room).select_related('player').order_by('timestamp')[:50]
        
        # 获取最后一条聊天消息的ID
        last_chat_id = 0
        if chat_messages:
            # 转换为列表以便访问最后一个元素
            chat_messages_list = list(chat_messages)
            last_chat_id = chat_messages_list[-1].id

        # 获取移动历史
        move_history = MoveHistory.objects.filter(room=room).order_by('move_number')

        # 确定玩家颜色
        player_color = 'black' if (room.creator == player and room.current_turn == room.creator) or \
                                  (room.opponent == player and room.current_turn == room.opponent) else 'white'

        return render(request, 'game/room.html', {
            'room': room,
            'player': player,
            'opponent': opponent,
            'friend_stats': friend_stats,
            'chat_messages': chat_messages,
            'move_history': move_history,
            'player_color': player_color,
            'board': room.get_board(),
            'board_size': range(room.board_size),
            'last_chat_id': last_chat_id,
        })

    except GomokuRoom.DoesNotExist:
        return redirect('lobby')


@login_required
@require_POST
@csrf_exempt
def make_move(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    try:
        data = json.loads(request.body)
        row = int(data.get('row'))
        col = int(data.get('col'))

        room = GomokuRoom.objects.get(room_code=room_code)

        # 验证
        if room.status != 'playing':
            return JsonResponse({'error': '游戏未开始或已结束'}, status=400)

        if room.current_turn != player:
            return JsonResponse({'error': '现在不是你的回合'}, status=400)

        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不是该房间的玩家'}, status=403)

        # 检查位置是否合法
        if row < 0 or row >= room.board_size or col < 0 or col >= room.board_size:
            return JsonResponse({'error': '非法位置'}, status=400)

        board = room.get_board()
        if board[row][col] != 0:
            return JsonResponse({'error': '该位置已有棋子'}, status=400)

        # 放置棋子
        stone_value = 1 if player == room.creator else 2
        board[row][col] = stone_value
        room.set_board(board)

        # 记录移动
        move_number = MoveHistory.objects.filter(room=room).count() + 1
        MoveHistory.objects.create(
            room=room,
            player=player,
            row=row,
            col=col,
            move_number=move_number
        )

        # 检查胜利
        winner = check_winner(board, row, col, stone_value, room.board_size)

        if winner:
            room.winner = player
            room.status = 'finished'

            # 更新统计数据
            player.total_wins += 1
            player.games_played += 1
            player.save()

            # 更新对手的游戏次数
            opponent = room.opponent if room.opponent != player else room.creator
            opponent.games_played += 1
            opponent.save()

            # 更新好友统计
            update_friend_stats(room.creator, room.opponent, player, False)

        elif is_board_full(board, room.board_size):
            room.is_draw = True
            room.status = 'finished'

            # 更新游戏次数
            player.games_played += 1
            player.save()
            opponent = room.opponent if room.opponent != player else room.creator
            opponent.games_played += 1
            opponent.save()

            # 更新好友统计
            update_friend_stats(room.creator, room.opponent, None, True)
        else:
            # 切换回合
            room.current_turn = room.opponent if room.current_turn == room.creator else room.creator

        room.save()

        return JsonResponse({
            'success': True,
            'board': board,
            'current_turn': room.current_turn.id if room.current_turn else None,
            'winner': room.winner.id if room.winner else None,
            'is_draw': room.is_draw,
            'status': room.status
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


def check_winner(board, row, col, stone_value, board_size):
    """检查五子棋胜利条件"""
    directions = [
        [(0, 1), (0, -1)],  # 水平
        [(1, 0), (-1, 0)],  # 垂直
        [(1, 1), (-1, -1)],  # 对角线
        [(1, -1), (-1, 1)]  # 反对角线
    ]

    for dir_pair in directions:
        count = 1  # 当前位置

        # 检查两个方向
        for dx, dy in dir_pair:
            nx, ny = row + dx, col + dy
            while 0 <= nx < board_size and 0 <= ny < board_size and board[nx][ny] == stone_value:
                count += 1
                nx += dx
                ny += dy

        if count >= 5:
            return True

    return False


def is_board_full(board, board_size):
    """检查棋盘是否已满"""
    for i in range(board_size):
        for j in range(board_size):
            if board[i][j] == 0:
                return False
    return True


def update_friend_stats(player1, player2, winner, is_draw):
    """更新好友对战统计"""
    if not player2:  # 没有对手
        return

    # 确保 player1.id < player2.id 以保持一致性
    p1, p2 = (player1, player2) if player1.id < player2.id else (player2, player1)

    stats, created = FriendStats.objects.get_or_create(player1=p1, player2=p2)

    if is_draw:
        stats.draws += 1
    elif winner:
        if winner == p1:
            stats.player1_wins += 1
        else:
            stats.player2_wins += 1

    stats.total_games += 1
    stats.save()


@login_required
@require_POST
@csrf_exempt
def send_chat(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    try:
        data = json.loads(request.body)
        message = data.get('message', '').strip()

        if not message:
            return JsonResponse({'error': '消息不能为空'}, status=400)

        room = GomokuRoom.objects.get(room_code=room_code)

        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不在这个房间中'}, status=403)

        # 保存消息
        chat = ChatMessage.objects.create(
            room=room,
            player=player,
            message=message
        )

        return JsonResponse({
            'success': True,
            'message': {
                'id': chat.id,
                'player': player.user.username,
                'content': message,
                'timestamp': chat.timestamp.isoformat()
            }
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
@csrf_exempt
def request_undo(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        if room.status != 'playing':
            return JsonResponse({'error': '游戏未进行中'}, status=400)

        # 获取最后两步移动
        last_moves = MoveHistory.objects.filter(room=room).order_by('-move_number')[:2]

        if len(last_moves) < 2:
            return JsonResponse({'error': '没有可悔棋的移动'}, status=400)

        # 移除最后两步
        board = room.get_board()
        for move in last_moves[:2]:
            board[move.row][move.col] = 0
            move.delete()

        room.set_board(board)
        room.current_turn = player  # 悔棋后轮到请求的玩家
        room.save()

        return JsonResponse({
            'success': True,
            'board': board,
            'current_turn': player.id
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
@csrf_exempt
def request_draw(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        if room.status != 'playing':
            return JsonResponse({'error': '游戏未进行中'}, status=400)

        # 这里可以实现和棋请求逻辑（需要对手同意）
        # 简化版：直接设置为和棋
        room.status = 'finished'
        room.is_draw = True
        room.save()

        # 更新游戏次数
        room.creator.games_played += 1
        room.creator.save()
        if room.opponent:
            room.opponent.games_played += 1
            room.opponent.save()

        # 更新好友统计
        if room.opponent:
            update_friend_stats(room.creator, room.opponent, None, True)

        return JsonResponse({
            'success': True,
            'status': room.status,
            'is_draw': True
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_GET
def get_room_state(request, room_code):
    """获取房间实时状态（用于轮询）"""
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        # 验证访问权限
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '无访问权限'}, status=403)

        # 获取最新聊天消息
        last_chat_id = request.GET.get('last_chat_id', 0)
        try:
            last_chat_id = int(last_chat_id)
        except:
            last_chat_id = 0

        new_chats = ChatMessage.objects.filter(
            room=room,
            id__gt=last_chat_id
        ).select_related('player').order_by('timestamp')

        # 获取移动历史
        move_history = MoveHistory.objects.filter(room=room).order_by('-move_number')[:10]

        opponent = room.opponent if room.opponent != player else room.creator

        return JsonResponse({
            'room': {
                'status': room.status,
                'current_turn': room.current_turn.id if room.current_turn else None,
                'winner': room.winner.id if room.winner else None,
                'is_draw': room.is_draw,
                'board': room.get_board(),
            },
            'player': {
                'id': player.id,
                'username': player.user.username,
                'color': 'black' if (room.creator == player and room.current_turn == room.creator) or \
                                    (room.opponent == player and room.current_turn == room.opponent) else 'white'
            },
            'opponent': {
                'id': opponent.id if opponent else None,
                'username': opponent.user.username if opponent else None,
            },
            'chats': [
                {
                    'id': chat.id,
                    'player': chat.player.user.username,
                    'message': chat.message,
                    'timestamp': chat.timestamp.isoformat()
                } for chat in new_chats
            ],
            'last_move': {
                'row': move_history[0].row if move_history else None,
                'col': move_history[0].col if move_history else None,
                'player': move_history[0].player.user.username if move_history else None
            } if move_history else None
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)


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
@require_POST
def delete_room(request, room_code):
    """删除房间函数"""
    player = Player.objects.get(user=request.user)
    
    try:
        room = GomokuRoom.objects.get(room_code=room_code)
        
        # 只有房主可以删除房间，且房间状态必须为等待中
        if room.creator != player or room.status != 'waiting':
            return JsonResponse({'success': False, 'error': '无权删除此房间'})
            
        room.delete()
        return JsonResponse({'success': True, 'message': '房间已成功删除'})
    except GomokuRoom.DoesNotExist:
        return JsonResponse({'success': False, 'error': '房间不存在'})


@login_required
@require_GET
def get_online_players(request):
    """获取在线玩家列表"""
    current_player = Player.objects.get(user=request.user)

    # 获取最近5分钟内有活动记录的玩家
    from datetime import timedelta
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
                'in_game': in_game
            })

    return JsonResponse({
        'success': True,
        'players': online_players
    })


@login_required
@require_POST
@csrf_exempt
def invite_player(request, player_id):
    """邀请玩家对战"""
    current_player = Player.objects.get(user=request.user)
    invited_player = get_object_or_404(Player, id=player_id)

    # 检查是否已经存在等待中的房间
    existing_room = GomokuRoom.objects.filter(
        creator=current_player,
        status='waiting',
        opponent__isnull=True
    ).first()

    if existing_room:
        # 如果已有房间，直接返回房间链接
        return JsonResponse({
            'success': True,
            'message': f'已向 {invited_player.user.username} 发送邀请，房间号: {existing_room.room_code}',
            'room_code': existing_room.room_code
        })
    else:
        # 创建新房间
        room = GomokuRoom.objects.create(
            creator=current_player,
            status='waiting'
        )

        # 随机决定谁先走
        room.current_turn = current_player
        room.save()

        return JsonResponse({
            'success': True,
            'message': f'已向 {invited_player.user.username} 发送邀请，房间号: {room.room_code}',
            'room_code': room.room_code
        })


@login_required
@require_POST
@csrf_exempt
def update_session(request):
    """更新会话活动时间"""
    player = Player.objects.get(user=request.user)

    # 更新会话活动时间
    updated = PlayerSession.objects.filter(
        player=player,
        session_key=request.session.session_key
    ).update(last_activity=timezone.now())

    # 如果没有会话记录，创建一个
    if updated == 0:
        PlayerSession.objects.create(
            player=player,
            session_key=request.session.session_key,
            last_activity=timezone.now()
        )

    return JsonResponse({
        'success': True,
        'message': '会话活动时间已更新'
    })
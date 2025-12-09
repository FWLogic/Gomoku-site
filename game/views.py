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

        # 确定对手
        opponent = room.opponent if room.opponent != player else room.creator

        # 获取最后两步移动
        last_moves = MoveHistory.objects.filter(room=room).order_by('-move_number')[:2]

        if len(last_moves) < 1:
            return JsonResponse({'error': '没有可悔棋的移动'}, status=400)

        # 检查是否已经有悔棋请求
        if room.undo_requested_by:
            if room.undo_requested_by == player:
                return JsonResponse({'error': '你已经发送过悔棋请求，请等待对方回应'}, status=400)
            else:
                # 对方发送了悔棋请求，当前玩家是回应方
                # 执行悔棋 - 根据情况撤销一步或两步
                board = room.get_board()

                # 检查最后两步棋是否由不同玩家下出
                moves_to_undo = 1  # 默认撤销一步
                if len(last_moves) >= 2 and last_moves[0].player != last_moves[1].player:
                    # 如果最后两步是不同玩家下的，说明对方已经回应了，需要撤销两步
                    moves_to_undo = 2

                # 撤销指定步数的棋子
                for i in range(moves_to_undo):
                    move = last_moves[i]
                    board[move.row][move.col] = 0
                    move.delete()

                room.set_board(board)
                # 悔棋后回到请求悔棋的一方
                undo_requester = room.undo_requested_by  # 先保存请求悔棋的玩家
                room.undo_requested_by = None  # 清除悔棋请求
                room.current_turn = undo_requester  # 设置为请求悔棋的玩家

                # 设置通知消息，只发送给请求悔棋的玩家
                room.notification_message = '悔棋成功'
                room.notification_target = undo_requester  # 设置通知目标为请求悔棋的玩家
                room.save()

                return JsonResponse({
                    'success': True,
                    'board': board,
                    'current_turn': player.id,
                    'message': '已同意悔棋请求'
                })

        # 发送悔棋请求
        room.undo_requested_by = player
        room.save()

        return JsonResponse({
            'success': True,
            'message': f'已向{opponent.user.username}发送悔棋请求，等待对方回应'
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
@csrf_exempt
def reject_undo(request, room_code):
    """处理拒绝悔棋请求"""
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不在这个房间中'}, status=403)

        # 检查游戏是否正在进行中
        if room.status != 'playing':
            return JsonResponse({'error': '游戏未进行中'}, status=400)

        # 检查是否有悔棋请求
        if not room.undo_requested_by:
            return JsonResponse({'error': '没有悔棋请求需要拒绝'}, status=400)

        # 检查是否是对方发起的请求
        if room.undo_requested_by == player:
            return JsonResponse({'error': '不能拒绝自己发起的请求'}, status=400)

        # 确定对手
        opponent = room.undo_requested_by

        # 清除悔棋请求并设置通知消息，只发送给悔棋请求者
        room.undo_requested_by = None
        room.notification_message = f'你的悔棋请求被{player.user.username}拒绝了'
        room.notification_target = opponent  # 设置通知目标为悔棋请求者
        room.save()

        return JsonResponse({
            'success': True,
            'message': f'已拒绝{opponent.user.username}的悔棋请求'
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
@csrf_exempt
def reject_draw(request, room_code):
    """处理拒绝和棋请求"""
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不在这个房间中'}, status=403)

        # 检查游戏是否正在进行中
        if room.status != 'playing':
            return JsonResponse({'error': '游戏未进行中'}, status=400)

        # 检查是否有和棋请求
        if not room.draw_requested_by:
            return JsonResponse({'error': '没有和棋请求需要拒绝'}, status=400)

        # 检查是否是对方发起的请求
        if room.draw_requested_by == player:
            return JsonResponse({'error': '不能拒绝自己发起的请求'}, status=400)

        # 确定对手
        opponent = room.draw_requested_by

        # 清除和棋请求并设置通知消息，只发送给和棋请求者
        room.draw_requested_by = None
        room.notification_message = f'你的和棋请求被{player.user.username}拒绝了'
        room.notification_target = opponent  # 设置通知目标为和棋请求者
        room.save()

        return JsonResponse({
            'success': True,
            'message': f'已拒绝{opponent.user.username}的和棋请求'
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
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

        # 确定对手
        opponent = room.opponent if room.opponent != player else room.creator

        # 检查是否已经有和棋请求
        if room.draw_requested_by:
            if room.draw_requested_by == player:
                return JsonResponse({'error': '你已经发送过和棋请求，请等待对方回应'}, status=400)
            else:
                # 对方发送了和棋请求，当前玩家是回应方
                # 同意和棋
                room.status = 'finished'
                room.is_draw = True
                room.draw_requested_by = None  # 清除和棋请求
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
                    'is_draw': True,
                    'message': '双方同意和棋，游戏结束'
                })

        # 发送和棋请求
        room.draw_requested_by = player
        room.save()

        return JsonResponse({
            'success': True,
            'message': f'已向{opponent.user.username}发送和棋请求，等待对方回应'
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

        # 获取通知消息（如果有）
        notification_message = room.notification_message
        should_show_notification = False

        if notification_message:
            # 如果有指定目标玩家，只发送给该玩家
            if room.notification_target:
                should_show_notification = room.notification_target == player
            # 如果没有指定目标玩家，默认显示给所有玩家
            else:
                should_show_notification = True

            # 清除通知消息，确保只显示一次
            if should_show_notification:
                room.notification_message = None
                room.notification_target = None
                room.save()
            else:
                # 如果不应该显示给当前玩家，则不返回通知
                notification_message = None
        
        return JsonResponse({
            'room': {
                'status': room.status,
                'current_turn': room.current_turn.id if room.current_turn else None,
                'winner': room.winner.id if room.winner else None,
                'is_draw': room.is_draw,
                'board': room.get_board(),
                'undo_requested_by': room.undo_requested_by.id if room.undo_requested_by else None,
                'draw_requested_by': room.draw_requested_by.id if room.draw_requested_by else None,
                'rematch_requested_by': room.rematch_requested_by.id if room.rematch_requested_by else None,
                'notification_message': notification_message,
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

    # 如果没有房间，创建新房间
    if not existing_room:
        room = GomokuRoom.objects.create(
            creator=current_player,
            status='waiting'
        )
        # 随机决定谁先走
        room.current_turn = current_player
        room.save()
    else:
        room = existing_room
    
    # 检查是否已经发送过邀请
    existing_invitation = Invitation.objects.filter(
        sender=current_player,
        receiver=invited_player,
        room=room,
        status='pending'
    ).first()
    
    if existing_invitation:
        return JsonResponse({
            'success': False,
            'error': f'已经向 {invited_player.user.username} 发送过邀请，请等待对方回应'
        })
    
    # 创建邀请记录
    invitation = Invitation.objects.create(
        sender=current_player,
        receiver=invited_player,
        room=room,
        status='pending'
    )
    
    return JsonResponse({
        'success': True,
        'message': f'已向 {invited_player.user.username} 发送邀请，房间号: {room.room_code}',
        'room_code': room.room_code,
        'invitation_id': invitation.id
    })


@login_required
@require_POST
@csrf_exempt
def accept_invitation(request, invitation_id):
    """接受游戏邀请"""
    player = Player.objects.get(user=request.user)
    
    try:
        invitation = Invitation.objects.get(id=invitation_id, receiver=player, status='pending')
        room = invitation.room
        
        # 检查房间状态
        if room.status != 'waiting' or room.opponent is not None:
            invitation.status = 'expired'
            invitation.save()
            return JsonResponse({
                'success': False,
                'error': '邀请已过期或房间已满'
            })
        
        # 加入房间
        room.opponent = player
        room.status = 'playing'
        room.save()
        
        # 更新邀请状态
        invitation.status = 'accepted'
        invitation.save()
        
        # 创建或更新好友统计
        friend_stats, created = FriendStats.objects.get_or_create(
            player1=min(room.creator, room.opponent, key=lambda p: p.id),
            player2=max(room.creator, room.opponent, key=lambda p: p.id)
        )
        
        return JsonResponse({
            'success': True,
            'message': f'已接受邀请，即将进入房间 {room.room_code}',
            'room_code': room.room_code
        })
    except Invitation.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': '邀请不存在或已被处理'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'处理邀请时出错: {str(e)}'
        })


@login_required
@require_POST
@csrf_exempt
def reject_invitation(request, invitation_id):
    """拒绝游戏邀请"""
    player = Player.objects.get(user=request.user)
    
    try:
        invitation = Invitation.objects.get(id=invitation_id, receiver=player, status='pending')
        
        # 更新邀请状态
        invitation.status = 'rejected'
        invitation.save()
        
        return JsonResponse({
            'success': True,
            'message': '已拒绝邀请'
        })
    except Invitation.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': '邀请不存在或已被处理'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'处理邀请时出错: {str(e)}'
        })


@login_required
@require_GET
def get_invitations(request):
    """获取当前用户的待处理邀请"""
    player = Player.objects.get(user=request.user)
    
    # 获取待处理的邀请
    pending_invitations = Invitation.objects.filter(
        receiver=player,
        status='pending'
    ).select_related('sender', 'room').order_by('-created_at')
    
    invitations_data = []
    for invitation in pending_invitations:
        invitations_data.append({
            'id': invitation.id,
            'sender': {
                'id': invitation.sender.id,
                'username': invitation.sender.user.username
            },
            'room_code': invitation.room.room_code,
            'created_at': invitation.created_at.isoformat()
        })
    
    return JsonResponse({
        'success': True,
        'invitations': invitations_data
    })


@login_required
@require_GET
def get_invitation_status(request, invitation_id):
    """获取邀请状态"""
    player = Player.objects.get(user=request.user)
    
    try:
        invitation = Invitation.objects.get(id=invitation_id, sender=player)
        
        return JsonResponse({
            'success': True,
            'status': invitation.status,
            'room_code': invitation.room.room_code
        })
    except Invitation.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': '邀请不存在'
        })


@login_required
@require_POST
@csrf_exempt
def request_rematch(request, room_code):
    """处理再来一局请求"""
    player = get_object_or_404(Player, user=request.user)
    
    try:
        room = GomokuRoom.objects.get(room_code=room_code)
        
        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不在这个房间中'}, status=403)
            
        # 检查游戏是否已结束
        if room.status != 'finished':
            return JsonResponse({'error': '游戏尚未结束'}, status=400)
            
        # 确定对手
        opponent = room.opponent if room.opponent != player else room.creator
        
        # 检查是否已经有再来一局请求
        if room.rematch_requested_by:
            if room.rematch_requested_by == player:
                return JsonResponse({'error': '你已经发送过再来一局请求，请等待对方回应'}, status=400)
            else:
                # 对方发送了再来一局请求，当前玩家是回应方
                # 重置游戏状态
                room.status = 'playing'
                room.board_state = json.dumps([[0 for _ in range(room.board_size)] for _ in range(room.board_size)])
                room.winner = None
                room.is_draw = False
                room.rematch_requested_by = None
                room.undo_requested_by = None
                room.draw_requested_by = None
                
                # 随机决定谁先走
                room.current_turn = random.choice([room.creator, room.opponent])
                room.save()
                
                # 清除移动历史
                MoveHistory.objects.filter(room=room).delete()
                
                return JsonResponse({
                    'success': True,
                    'status': room.status,
                    'current_turn': room.current_turn.id,
                    'board': room.get_board(),
                    'message': f'双方同意再来一局，{room.current_turn.user.username}先手'
                })
        
        # 发送再来一局请求
        room.rematch_requested_by = player
        room.save()
        
        return JsonResponse({
            'success': True,
            'message': f'已向{opponent.user.username}发送再来一局请求，等待对方回应'
        })
        
    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


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


@login_required
@require_POST
@csrf_exempt
def reject_rematch(request, room_code):
    """处理拒绝再来一局请求"""
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不在这个房间中'}, status=403)

        # 检查游戏是否已结束
        if room.status != 'finished':
            return JsonResponse({'error': '游戏尚未结束'}, status=400)

        # 检查是否有再来一局请求
        if not room.rematch_requested_by:
            return JsonResponse({'error': '没有再来一局请求需要拒绝'}, status=400)
            
        # 检查是否是对方发起的请求
        if room.rematch_requested_by == player:
            return JsonResponse({'error': '不能拒绝自己发起的请求'}, status=400)
            
        # 确定对手
        opponent = room.rematch_requested_by
        
        # 清除再来一局请求
        room.rematch_requested_by = None
        room.save()
        
        return JsonResponse({
            'success': True,
            'message': f'已拒绝{opponent.user.username}的再来一局请求'
        })
        
    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)
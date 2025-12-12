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
from ..models import *


@login_required
def create_room(request):
    player = get_object_or_404(Player, user=request.user)

    # 创建新房间
    import random
    room = GomokuRoom.objects.create(
        creator=player,
        status='waiting',
        creator_is_black=random.choice([True, False]),  # 随机决定创建者的棋色
        creator_present=True
    )

    # 设置玩家棋色分配
    player_colors = {
        str(room.creator.id): 'black' if room.creator_is_black else 'white'
    }
    room.set_player_colors(player_colors)
    
    # 确保黑棋先手
    if room.creator_is_black:
        room.current_turn = room.creator
    # 如果创建者是白棋，将在对手加入时设置先手
    
    room.save()
    
    # 如果是AJAX请求，返回JSON响应
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'success': True,
            'room_code': room.room_code,
            'message': '房间创建成功'
        })

    return redirect('room', room_code=room.room_code)


@login_required
def join_room(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        # 如果玩家是房主
        if room.creator == player:
            # 如果房间处于等待状态且有对手，则恢复游戏状态
            if room.status == 'waiting' and room.opponent:
                room.status = 'playing'
                room.save()
            # 如果房间处于等待状态但没有对手（对手也离开了），则当作新玩家加入处理
            elif room.status == 'waiting' and not room.opponent:
                room.opponent = player
                room.status = 'playing'
                
                # 更新玩家棋色分配
                player_colors = room.get_player_colors()
                player_colors[str(player.id)] = 'white' if room.creator_is_black else 'black'
                room.set_player_colors(player_colors)
                
                # 确保黑棋先手
                if room.creator_is_black:
                    room.current_turn = room.creator
                else:
                    room.current_turn = room.opponent
                room.save()
                
                # 创建或更新好友统计
                friend_stats, created = FriendStats.objects.get_or_create(
                    player1=min(room.creator, room.opponent, key=lambda p: p.id),
                    player2=max(room.creator, room.opponent, key=lambda p: p.id)
                )
            
            return redirect('room', room_code=room_code)

        # 如果房间在等待状态，允许玩家加入（无论是新玩家还是重新加入的玩家）
        if room.status == 'waiting':
            # 如果房间没有对手，这是一个新玩家加入
            if room.opponent is None:
                room.opponent = player
                room.status = 'playing'
                
                # 更新玩家棋色分配
                player_colors = room.get_player_colors()
                player_colors[str(player.id)] = 'white' if room.creator_is_black else 'black'
                room.set_player_colors(player_colors)
                
                # 确保黑棋先手
                if room.creator_is_black:
                    room.current_turn = room.creator
                else:
                    room.current_turn = room.opponent
                room.save()

                # 创建或更新好友统计
                friend_stats, created = FriendStats.objects.get_or_create(
                    player1=min(room.creator, room.opponent, key=lambda p: p.id),
                    player2=max(room.creator, room.opponent, key=lambda p: p.id)
                )

                return redirect('room', room_code=room_code)
            else:
                # 房间已有对手，拒绝加入
                return JsonResponse({'error': '房间已满'}, status=400)
        else:
            return JsonResponse({'error': '房间已满或已开始游戏'}, status=400)

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)


@login_required
def game_room(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    # 更新会话活动时间（不使用select_for_update）
    PlayerSession.objects.get_or_create(
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

        # 确定玩家颜色 - 使用统一的棋色分配系统
        player_color = room.get_player_color(player)
        
        # 确定对手颜色 - 使用统一的棋色分配系统
        opponent_color = None
        if opponent:
            opponent_color = room.get_player_color(opponent)

        return render(request, 'game/room.html', {
            'room': room,
            'player': player,
            'opponent': opponent,
            'friend_stats': friend_stats,
            'chat_messages': chat_messages,
            'move_history': move_history,
            'player_color': player_color,
            'opponent_color': opponent_color,
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

        # 放置棋子 - 根据统一的棋色分配系统确定棋子值
        stone_value = 1 if room.is_player_black(player) else 2
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
            room.finished_at = timezone.now()

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
            room.finished_at = timezone.now()

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
@require_POST
@csrf_exempt
def leave_room(request, room_code):
    """离开房间函数"""
    player = get_object_or_404(Player, user=request.user)
    
    try:
        room = GomokuRoom.objects.get(room_code=room_code)
        
        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'success': False, 'error': '你不在这个房间中'})
        
        # 房主和对手离开使用相同逻辑处理
        # 设置通知消息告知另一方有人离开了
        if room.creator == player and room.opponent:
            # 房主离开，通知对手
            room.notification_message = '房主已离开房间'
            room.notification_target = room.opponent
        elif room.opponent == player and room.creator:
            # 对手离开，通知房主
            room.notification_message = '对手已离开房间'
            room.notification_target = room.creator
        
        # 如果离开的是房主
        if room.creator == player:
            pass  # 房主离开不需要特殊操作，房间仍归其所有
        # 如果离开的是对手
        elif room.opponent == player:
            room.opponent = None
        
        # 将房间状态改为等待中，允许该玩家重新加入
        room.status = 'waiting'
        
        room.save()
        return JsonResponse({'success': True, 'message': '你已离开房间'})
        
    except GomokuRoom.DoesNotExist:
        return JsonResponse({'success': False, 'error': '房间不存在'})


# 新增一个API接口，用于获取可用房间列表供前端刷新
@login_required
@require_GET
def get_available_rooms(request):
    """获取可用房间列表"""
    player = Player.objects.get(user=request.user)
    
    # 获取可加入的公共房间，包括：
    # 1. 等待中且没有对手的房间
    # 2. 等待中但对手已离开的房间（opponent为None但之前有过对手）
    available_rooms = GomokuRoom.objects.filter(
        status='waiting'
    ).exclude(creator=player).order_by('-created_at')[:10]
    
    rooms_data = []
    for room in available_rooms:
        rooms_data.append({
            'room_code': room.room_code,
            'creator_username': room.creator.user.username,
            'created_at': room.created_at.strftime('%m-%d %H:%M')
        })
    
    return JsonResponse({
        'success': True,
        'rooms': rooms_data
    })

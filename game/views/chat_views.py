from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
import json
from ..models import *


@login_required
@require_POST
@csrf_exempt
def send_chat(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    try:
        data = json.loads(request.body)
        message = data.get('message', '').strip()
        temp_id = data.get('tempId', '')  # 获取临时ID

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
                'player_id': player.id,
                'player': player.user.username,
                'message': message,
                'timestamp': chat.timestamp.isoformat(),
                'tempId': temp_id  # 返回临时ID，用于前端识别
            }
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
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

        # 如果last_chat_id为0，说明是初次加载，不需要返回已存在的消息（因为这些消息已经在页面上渲染了）
        if last_chat_id == 0:
            new_chats = []
        else:
            new_chats = ChatMessage.objects.filter(
                room=room,
                id__gt=last_chat_id
            ).select_related('player').order_by('timestamp')

        # 获取移动历史
        move_history = MoveHistory.objects.filter(room=room).order_by('move_number')

        # 检查对手是否真的还在房间中
        opponent = room.opponent if room.opponent != player else room.creator
        
        # 如果房间状态是playing但没有对手，可能对手离开了
        if room.status == 'playing' and not opponent:
            # 检查是否是因为对手删除账户导致的
            if room.opponent is None:
                # 对手确实离开了房间
                pass  # opponent已经是None，直接使用
            else:
                # 其他情况，确保对手信息正确
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
        
        # 确定棋色 - 使用存储的棋色信息
        
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
                'created_at': room.created_at.isoformat(),
                'finished_at': room.finished_at.isoformat() if room.finished_at else None,
            },
            'player': {
                'id': player.id,
                'username': player.user.username,
                'color': room.get_player_color(player),
                'avatar_url': player.avatar.url if player.avatar else None,
            },
            'opponent': {
                'id': opponent.id if opponent else None,
                'username': opponent.user.username if opponent else None,
                'color': room.get_player_color(opponent) if opponent else None,
                'avatar_url': opponent.avatar.url if opponent and opponent.avatar else None,
            },
            'chats': [
                {
                    'id': chat.id,
                    'player_id': chat.player.id,
                    'player': chat.player.user.username,
                    'message': chat.message,
                    'timestamp': chat.timestamp.isoformat()
                } for chat in new_chats
            ],
            'move_history': [{
                'move_number': move.move_number,
                'row': move.row,
                'col': move.col,
                'player_username': move.player.user.username
            } for move in move_history],
            'last_move': {
                'row': move_history.last().row if move_history else None,
                'col': move_history.last().col if move_history else None,
                'player': move_history.last().player.user.username if move_history else None,
                'move_number': move_history.last().move_number if move_history else None
            } if move_history else None
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)

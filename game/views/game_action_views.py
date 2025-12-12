from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import Q
import json
import random
from ..models import *


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
                room.finished_at = timezone.now()
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
                
                # 重新随机分配棋色
                import random
                room.creator_is_black = random.choice([True, False])
                
                # 确保黑棋先手
                if room.creator_is_black:
                    room.current_turn = room.creator
                else:
                    room.current_turn = room.opponent
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
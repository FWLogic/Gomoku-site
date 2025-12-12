from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from ..models import *
import json
import random


def check_winner(board, row, col, piece, board_size):
    """检查是否有玩家获胜"""
    directions = [
        [(0, 1), (0, -1)],   # 水平
        [(1, 0), (-1, 0)],   # 垂直
        [(1, 1), (-1, -1)],  # 主对角线
        [(1, -1), (-1, 1)]   # 副对角线
    ]

    for direction_pair in directions:
        count = 1  # 包含当前棋子
        
        # 向一个方向计数
        dx, dy = direction_pair[0]
        r, c = row + dx, col + dy
        while 0 <= r < board_size and 0 <= c < board_size and board[r][c] == piece:
            count += 1
            r += dx
            c += dy
        
        # 向相反方向计数
        dx, dy = direction_pair[1]
        r, c = row + dx, col + dy
        while 0 <= r < board_size and 0 <= c < board_size and board[r][c] == piece:
            count += 1
            r += dx
            c += dy
        
        # 如果连成五子或以上则获胜（白棋可以超过五子获胜，黑棋必须正好五子）
        if piece == 2 and count >= 5:  # 白棋
            return True
        elif piece == 1 and count == 5:  # 黑棋
            return True
            
    return False


def count_consecutive_pieces(board, row, col, dx, dy, piece, board_size):
    """计算某个方向上的连续同色棋子数量"""
    count = 0
    r, c = row + dx, col + dy
    while 0 <= r < board_size and 0 <= c < board_size and board[r][c] == piece:
        count += 1
        r += dx
        c += dy
    return count


def count_open_pieces(board, row, col, dx, dy, piece, board_size):
    """计算某个方向上可连成的开放棋子数量（包括跳棋情况）"""
    # 向一个方向搜索
    pieces_before_gap = 0  # 跳点前的棋子数
    pieces_after_gap = 0   # 跳点后的棋子数
    gap_count = 0          # 跳点数
    
    r, c = row + dx, col + dy
    
    # 向一个方向搜索
    while 0 <= r < board_size and 0 <= c < board_size:
        if board[r][c] == piece:
            if gap_count == 0:
                pieces_before_gap += 1
            elif gap_count == 1:
                pieces_after_gap += 1
            else:
                break
        elif board[r][c] == 0:
            gap_count += 1
            if gap_count > 1:
                break
        else:  # 遇到对方棋子
            break
        r += dx
        c += dy
    
    # 重置参数，向相反方向搜索
    r, c = row - dx, col - dy
    gap_count = 0
    
    while 0 <= r < board_size and 0 <= c < board_size:
        if board[r][c] == piece:
            if gap_count == 0:
                pieces_before_gap += 1
            elif gap_count == 1:
                pieces_after_gap += 1
            else:
                break
        elif board[r][c] == 0:
            gap_count += 1
            if gap_count > 1:
                break
        else:  # 遇到对方棋子
            break
        r -= dx
        c -= dy
    
    # 总棋子数
    total_pieces = pieces_before_gap + pieces_after_gap + 1  # +1 为当前位置
    
    # 判断是否为活三(3子)或活四(4子)
    if total_pieces == 3 or total_pieces == 4:
        # 检查两端是否开放
        is_open = True
        
        # 检查正向端点
        end_r1, end_c1 = row, col
        for _ in range(pieces_before_gap + pieces_after_gap + 1):
            end_r1 += dx
            end_c1 += dy
        
        # 检查反向端点
        end_r2, end_c2 = row, col
        for _ in range(pieces_before_gap + pieces_after_gap + 1):
            end_r2 -= dx
            end_c2 -= dy
        
        # 检查端点是否在边界内且为空
        if not ((0 <= end_r1 < board_size and 0 <= end_c1 < board_size and board[end_r1][end_c1] == 0) and
                (0 <= end_r2 < board_size and 0 <= end_c2 < board_size and board[end_r2][end_c2] == 0)):
            is_open = False
        
        if is_open:
            return total_pieces
    
    return 0


def is_forbidden_move(board, row, col, board_size):
    """检查黑棋是否犯规（禁手）"""
    # 临时移除刚下的棋子，检查周围的棋型
    board[row][col] = 0
    
    # 检查长连（超过五子）
    directions = [
        [(0, 1), (0, -1)],   # 水平
        [(1, 0), (-1, 0)],   # 垂直
        [(1, 1), (-1, -1)],  # 主对角线
        [(1, -1), (-1, 1)]   # 副对角线
    ]
    
    # 检查长连禁手
    for direction_pair in directions:
        count = 1  # 包含当前棋子位置
        
        # 向一个方向计数
        dx, dy = direction_pair[0]
        count += count_consecutive_pieces(board, row, col, dx, dy, 1, board_size)
        
        # 向相反方向计数
        dx, dy = direction_pair[1]
        count += count_consecutive_pieces(board, row, col, dx, dy, 1, board_size)
        
        # 如果形成超过五子的连线，则为长连禁手
        if count > 5:
            board[row][col] = 1  # 恢复棋子
            return True
    
    # 检查三三禁手和四四禁手
    open_threes = 0  # 活三数量
    open_fours = 0   # 活四数量
    
    # 检查每个方向是否能形成活三或活四（包括跳活三和跳活四）
    for direction_pair in directions:
        # 计算这个方向上的棋子分布
        dx1, dy1 = direction_pair[0]
        dx2, dy2 = direction_pair[1]
        
        # 获取这个方向上的棋子情况
        count1 = count_consecutive_pieces(board, row, col, dx1, dy1, 1, board_size)
        count2 = count_consecutive_pieces(board, row, col, dx2, dy2, 1, board_size)
        
        total_count = count1 + count2 + 1  # 加上当前位置的棋子
        
        # 检查是否能形成活三（两边无阻挡，共3子）
        if total_count == 3:
            # 检查两端是否为空位
            r1, c1 = row + dx1 * (count1 + 1), col + dy1 * (count1 + 1)
            r2, c2 = row + dx2 * (count2 + 1), col + dy2 * (count2 + 1)
            
            # 检查两端是否在边界内且为空
            if (0 <= r1 < board_size and 0 <= c1 < board_size and board[r1][c1] == 0 and
                0 <= r2 < board_size and 0 <= c2 < board_size and board[r2][c2] == 0):
                open_threes += 1
        
        # 检查是否能形成活四（两边无阻挡，共4子）
        elif total_count == 4:
            # 检查两端是否为空位
            r1, c1 = row + dx1 * (count1 + 1), col + dy1 * (count1 + 1)
            r2, c2 = row + dx2 * (count2 + 1), col + dy2 * (count2 + 1)
            
            # 检查两端是否在边界内且为空
            if (0 <= r1 < board_size and 0 <= c1 < board_size and board[r1][c1] == 0 and
                0 <= r2 < board_size and 0 <= c2 < board_size and board[r2][c2] == 0):
                open_fours += 1
        
        # 检查跳活三和跳活四
        # 修改此处逻辑以更好地检测跳活三和跳活四
        jump_open_count1 = count_open_pieces(board, row, col, dx1, dy1, 1, board_size)
        jump_open_count2 = count_open_pieces(board, row, col, dx2, dy2, 1, board_size)
        
        if jump_open_count1 == 3:  # 跳活三
            open_threes += 1
        elif jump_open_count1 == 4:  # 跳活四
            open_fours += 1
            
        if jump_open_count2 == 3:  # 跳活三
            open_threes += 1
        elif jump_open_count2 == 4:  # 跳活四
            open_fours += 1
    
    # 恢复棋子
    board[row][col] = 1
    
    # 判断是否为三三禁手或四四禁手
    if open_threes >= 2:  # 三三禁手
        return True
    if open_fours >= 2:   # 四四禁手
        return True
    
    return False


@login_required
@require_POST
@csrf_exempt
def make_move(request, room_code):
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)

        # 检查游戏是否正在进行中
        if room.status != 'playing':
            return JsonResponse({'error': '游戏未开始或已结束'}, status=400)

        # 检查是否轮到该玩家（使用最新的room对象）
        room.refresh_from_db()  # 确保获取最新的状态
        if room.current_turn != player:
            return JsonResponse({'error': '还没轮到你'}, status=400)

        # 解析请求数据
        data = json.loads(request.body)
        row = data.get('row')
        col = data.get('col')

        # 验证坐标有效性
        if row is None or col is None or not (0 <= row < room.board_size and 0 <= col < room.board_size):
            return JsonResponse({'error': '无效的坐标'}, status=400)

        # 获取当前棋盘状态
        board = room.get_board()

        # 检查该位置是否已有棋子
        if board[row][col] != 0:
            return JsonResponse({'error': '该位置已有棋子'}, status=400)

        # 确定玩家棋子类型 (1=黑棋, 2=白棋)
        if (player == room.creator and room.creator_is_black) or (player == room.opponent and not room.creator_is_black):
            piece = 1  # 黑棋
        else:
            piece = 2  # 白棋

        # 在棋盘上放置棋子
        board[row][col] = piece

        # 更新棋盘状态
        room.set_board(board)

        # 创建移动历史记录
        move_number = room.moves.count() + 1
        MoveHistory.objects.create(
            room=room,
            player=player,
            row=row,
            col=col,
            move_number=move_number
        )

        # 检查是否获胜
        winner = check_winner(board, row, col, piece, room.board_size)
        
        # 检查黑棋是否犯规（禁手）
        forbidden_move = False
        is_long_connection = False
        if piece == 1:  # 黑棋落子后检查禁手
            forbidden_move = is_forbidden_move(board, row, col, room.board_size)
            
            # 如果是禁手，进一步检查是否为长连禁手
            if forbidden_move:
                # 检查是否为长连禁手
                board[row][col] = 0  # 临时移除刚下的棋子
                directions = [
                    [(0, 1), (0, -1)],   # 水平
                    [(1, 0), (-1, 0)],   # 垂直
                    [(1, 1), (-1, -1)],  # 主对角线
                    [(1, -1), (-1, 1)]   # 副对角线
                ]
                
                for direction_pair in directions:
                    count = 1  # 包含当前棋子位置
                    
                    # 向一个方向计数
                    dx, dy = direction_pair[0]
                    count += count_consecutive_pieces(board, row, col, dx, dy, 1, room.board_size)
                    
                    # 向相反方向计数
                    dx, dy = direction_pair[1]
                    count += count_consecutive_pieces(board, row, col, dx, dy, 1, room.board_size)
                    
                    # 如果形成超过五子的连线，则为长连禁手
                    if count > 5:
                        is_long_connection = True
                        break
                
                board[row][col] = 1  # 恢复棋子
                
                # 如果是长连禁手，直接判负
                if is_long_connection:
                    # 黑棋长连犯规，白棋获胜
                    room.status = 'finished'
                    # 白棋玩家获胜
                    if room.creator_is_black:
                        room.winner = room.opponent
                        # 当创建者是黑棋时，对手(白棋)获胜，所以当前回合应该设为对手
                        room.current_turn = room.opponent
                    else:
                        room.winner = room.creator
                        # 当创建者是白棋时，创建者获胜，所以当前回合应该设为创建者
                        room.current_turn = room.creator
                    room.finished_at = timezone.now()
                    
                    # 更新玩家统计数据
                    if room.opponent:  # 确保对手存在
                        # 白棋玩家获胜
                        if room.creator_is_black:
                            # 创建者是黑棋，对手是白棋并获胜
                            room.opponent.total_wins += 1
                            room.opponent.games_played += 1
                            room.creator.games_played += 1
                            
                            # 更新好友统计
                            friend_stat, created = FriendStats.objects.get_or_create(
                                player1=min(room.creator, room.opponent, key=lambda x: x.id),
                                player2=max(room.creator, room.opponent, key=lambda x: x.id)
                            )
                            if room.opponent == friend_stat.player1:
                                friend_stat.player1_wins += 1
                            else:
                                friend_stat.player2_wins += 1
                            friend_stat.total_games += 1
                            friend_stat.save()
                        else:
                            # 创建者是白棋并获胜
                            room.creator.total_wins += 1
                            room.creator.games_played += 1
                            room.opponent.games_played += 1
                            
                            # 更新好友统计
                            friend_stat, created = FriendStats.objects.get_or_create(
                                player1=min(room.creator, room.opponent, key=lambda x: x.id),
                                player2=max(room.creator, room.opponent, key=lambda x: x.id)
                            )
                            if room.creator == friend_stat.player1:
                                friend_stat.player1_wins += 1
                            else:
                                friend_stat.player2_wins += 1
                            friend_stat.total_games += 1
                            friend_stat.save()
                        
                        room.creator.save()
                        room.opponent.save()
                    
                    room.save()

                    return JsonResponse({
                        'success': True,
                        'board': board,
                        'current_turn': room.current_turn.id if room.current_turn else None,
                        'last_move': {
                            'row': row,
                            'col': col,
                            'player': player.user.username,
                            'move_number': move_number
                        },
                        'status': room.status,
                        'winner': room.winner.id if room.winner else None,
                        'is_forbidden': True,
                        'message': '黑棋长连犯规，白棋获胜！'
                    })
        
        if winner:
            # 有玩家获胜
            room.status = 'finished'
            room.winner = player
            room.finished_at = timezone.now()
            
            # 更新玩家统计数据
            if room.opponent:  # 确保对手存在
                if player == room.creator:
                    room.creator.total_wins += 1
                    room.creator.games_played += 1
                    room.opponent.games_played += 1
                    
                    # 更新好友统计
                    friend_stat, created = FriendStats.objects.get_or_create(
                        player1=min(room.creator, room.opponent, key=lambda x: x.id),
                        player2=max(room.creator, room.opponent, key=lambda x: x.id)
                    )
                    if room.creator == friend_stat.player1:
                        friend_stat.player1_wins += 1
                    else:
                        friend_stat.player2_wins += 1
                    friend_stat.total_games += 1
                    friend_stat.save()
                else:
                    room.opponent.total_wins += 1
                    room.opponent.games_played += 1
                    room.creator.games_played += 1
                    
                    # 更新好友统计
                    friend_stat, created = FriendStats.objects.get_or_create(
                        player1=min(room.creator, room.opponent, key=lambda x: x.id),
                        player2=max(room.creator, room.opponent, key=lambda x: x.id)
                    )
                    if room.opponent == friend_stat.player1:
                        friend_stat.player1_wins += 1
                    else:
                        friend_stat.player2_wins += 1
                    friend_stat.total_games += 1
                    friend_stat.save()
                
                room.creator.save()
                room.opponent.save()
        
        elif not winner and not (forbidden_move and is_long_connection):
            # 没有人获胜且不是长连禁手，继续游戏
            # 切换回合
            if room.current_turn == room.creator:
                room.current_turn = room.opponent
            else:
                room.current_turn = room.creator

        room.save()

        return JsonResponse({
            'success': True,
            'board': board,
            'current_turn': room.current_turn.id if room.current_turn else None,
            'last_move': {
                'row': row,
                'col': col,
                'player': player.user.username,
                'move_number': move_number
            },
            'status': room.status,
            'winner': room.winner.id if room.winner else None
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
@csrf_exempt
def request_undo(request, room_code):
    """处理悔棋请求"""
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)
        
        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不在这个房间中'}, status=403)

        # 检查游戏是否正在进行中
        if room.status != 'playing':
            return JsonResponse({'error': '游戏未进行中'}, status=400)

        # 获取最后几步棋的信息
        last_moves = MoveHistory.objects.filter(room=room).order_by('-move_number')[:2]
        last_moves = list(last_moves)

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

                # 确定要撤销的步数
                # 情况1: 当前回合是悔棋方的回合 -> 对方还没落子，只需要撤销一步
                # 情况2: 当前回合是对方的回合 -> 对方已经落子，需要撤销两步
                moves_to_undo = 1  # 默认撤销一步（对方还没落子）
                if room.current_turn != player:
                    # 当前回合不是悔棋方的回合，说明对方已经落子，需要撤销两步
                    moves_to_undo = min(2, len(last_moves))  # 最多撤销两步

                # 撤销指定步数的棋子
                removed_moves = []  # 记录被删除的移动编号
                for i in range(moves_to_undo):
                    move = last_moves[i]
                    board[move.row][move.col] = 0
                    removed_moves.append(move.move_number)
                    move.delete()

                # 重新整理剩余移动的编号，确保它们是连续的
                if removed_moves:
                    # 获取所有剩余的移动并按编号排序
                    remaining_moves = MoveHistory.objects.filter(room=room).order_by('move_number')
                    # 重新分配编号
                    for idx, move in enumerate(remaining_moves):
                        move.move_number = idx + 1
                        move.save()

                room.set_board(board)
                # 悔棋后回到请求悔棋的一方
                undo_requester = room.undo_requested_by  # 先保存请求悔棋的玩家
                room.undo_requested_by = None  # 清除悔棋请求
                room.current_turn = undo_requester  # 设置为请求悔棋的玩家

                # 设置通知消息，只发送给请求悔棋的玩家
                room.notification_message = '悔棋成功'
                room.notification_target = undo_requester  # 设置通知目标为请求悔棋的玩家
                room.save()

                # 获取最新的移动历史作为last_move返回
                latest_move = MoveHistory.objects.filter(room=room).order_by('-move_number').first()
                
                # 获取所有移动历史记录用于更新前端
                move_history = MoveHistory.objects.filter(room=room).order_by('move_number')
                
                return JsonResponse({
                    'success': True,
                    'board': board,
                    'current_turn': room.current_turn.id if room.current_turn else None,
                    'last_move': {
                        'row': latest_move.row,
                        'col': latest_move.col
                    } if latest_move else None,
                    'move_history': [{
                        'move_number': move.move_number,
                        'row': move.row,
                        'col': move.col,
                        'player_username': move.player.user.username
                    } for move in move_history],
                    'message': '已同意悔棋请求'
                })

        # 发送悔棋请求
        opponent = room.creator if player == room.opponent else room.opponent
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
            return JsonResponse({'error': '没有悔棋请求'}, status=400)

        # 检查是否是请求方
        opponent = room.creator if player == room.opponent else room.opponent
        if room.undo_requested_by != opponent:
            return JsonResponse({'error': '没有来自该玩家的悔棋请求'}, status=400)

        # 拒绝悔棋请求
        requester = room.undo_requested_by
        room.undo_requested_by = None
        room.notification_message = '对方拒绝了你的悔棋请求'
        room.notification_target = requester
        room.save()

        return JsonResponse({
            'success': True,
            'message': '已拒绝悔棋请求'
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
@csrf_exempt
def request_draw(request, room_code):
    """处理和棋请求"""
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)
        
        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不在这个房间中'}, status=403)

        # 检查游戏是否正在进行中
        if room.status != 'playing':
            return JsonResponse({'error': '游戏未进行中'}, status=400)

        # 检查是否已经有和棋请求
        if room.draw_requested_by:
            if room.draw_requested_by == player:
                return JsonResponse({'error': '你已经发送过和棋请求，请等待对方回应'}, status=400)
            else:
                # 对方发送了和棋请求，当前玩家是回应方
                # 执行和棋
                room.status = 'finished'
                room.is_draw = True
                room.finished_at = timezone.now()
                room.draw_requested_by = None
                room.save()

                return JsonResponse({
                    'success': True,
                    'status': 'finished',
                    'is_draw': True,
                    'message': '游戏以和棋结束'
                })

        # 发送和棋请求
        room.draw_requested_by = player
        room.save()

        return JsonResponse({
            'success': True,
            'message': '已发送和棋请求，等待对方回应'
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
            return JsonResponse({'error': '没有和棋请求'}, status=400)

        # 检查是否是请求方
        opponent = room.creator if player == room.opponent else room.opponent
        if room.draw_requested_by != opponent:
            return JsonResponse({'error': '没有来自该玩家的和棋请求'}, status=400)

        # 拒绝和棋请求
        room.draw_requested_by = None
        room.notification_message = '对方拒绝了你的和棋请求'
        room.notification_target = opponent
        room.save()

        return JsonResponse({
            'success': True,
            'message': '已拒绝和棋请求'
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


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

        # 检查是否已经有再来一局请求
        if room.rematch_requested_by:
            if room.rematch_requested_by == player:
                return JsonResponse({'error': '你已经发送过再来一局请求，请等待对方回应'}, status=400)
            else:
                # 对方发送了再来一局请求，当前玩家是回应方
                # 开始新游戏
                room.status = 'playing'
                room.winner = None
                room.is_draw = False
                room.board_state = json.dumps([[0 for _ in range(room.board_size)] for _ in range(room.board_size)])
                
                # 随机分配棋色，确保公平性
                room.creator_is_black = random.choice([True, False])
                
                # 确保黑棋先手
                if room.creator_is_black:
                    room.current_turn = room.creator
                else:
                    room.current_turn = room.opponent
                
                # 更新玩家棋色分配字典
                player_colors = {
                    str(room.creator.id): 'black' if room.creator_is_black else 'white',
                    str(room.opponent.id): 'white' if room.creator_is_black else 'black'
                }
                room.set_player_colors(player_colors)
                
                # 删除所有移动历史
                room.moves.all().delete()
                
                # 清除请求和其他状态
                room.rematch_requested_by = None
                room.undo_requested_by = None
                room.draw_requested_by = None
                room.notification_message = None
                room.notification_target = None
                
                # 保存房间状态
                room.save()
                
                # 重新获取房间对象以确保数据是最新的
                room.refresh_from_db()

                # 获取更新后的统计数据
                room.creator.refresh_from_db()
                if room.opponent:
                    room.opponent.refresh_from_db()
                
                # 获取对手对象（根据当前玩家确定）
                opponent = room.opponent if player == room.creator else room.creator
                
                return JsonResponse({
                    'success': True,
                    'status': 'playing',
                    'board': room.get_board(),
                    'current_turn': room.current_turn.id,
                    'message': '游戏重新开始',
                    'player': {
                        'id': player.id,
                        'color': room.get_player_color(player),
                        'total_wins': player.total_wins,
                        'games_played': player.games_played,
                        'win_rate': player.win_rate()
                    },
                    'opponent': {
                        'id': opponent.id,
                        'color': room.get_player_color(opponent),
                        'total_wins': opponent.total_wins,
                        'games_played': opponent.games_played,
                        'win_rate': opponent.win_rate()
                    }
                })

        # 发送再来一局请求
        room.rematch_requested_by = player
        room.save()

        return JsonResponse({
            'success': True,
            'message': '已发送再来一局请求，等待对方回应'
        })

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
            return JsonResponse({'error': '没有再来一局请求'}, status=400)

        # 检查是否是请求方
        opponent = room.creator if player == room.opponent else room.opponent
        if room.rematch_requested_by != opponent:
            return JsonResponse({'error': '没有来自该玩家的再来一局请求'}, status=400)

        # 拒绝再来一局请求
        requester = room.rematch_requested_by
        room.rematch_requested_by = None
        room.notification_message = '对方拒绝了你的再来一局请求'
        room.notification_target = requester
        room.save()

        return JsonResponse({
            'success': True,
            'message': '已拒绝再来一局请求'
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


def is_position_forbidden_point(board, row, col, board_size):
    """
    检查棋盘上指定位置是否为禁手点（真正意义上的禁手交点）
    与 is_forbidden_move 不同，这个函数检查的是当前位置是否是现有禁手形状的交点
    """
    # 首先确保该位置是黑棋
    if board[row][col] != 1:
        return False
    
    # 保存当前位置的值
    original_value = board[row][col]
    # 临时将该位置设为空位
    board[row][col] = 0
    # 检查如果在该位置放置黑棋是否会形成禁手
    would_be_forbidden = is_forbidden_move(board, row, col, board_size)
    # 恢复原值
    board[row][col] = original_value
    
    # 如果放置黑棋会形成禁手，说明当前位置是禁手形状的交点
    return would_be_forbidden


@login_required
@require_POST
@csrf_exempt
def claim_forbidden(request, room_code):
    """处理指出禁手的请求"""
    player = get_object_or_404(Player, user=request.user)

    try:
        room = GomokuRoom.objects.get(room_code=room_code)
        
        # 验证用户是否在房间中
        if player not in [room.creator, room.opponent]:
            return JsonResponse({'error': '你不在这个房间中'}, status=403)

        # 检查游戏是否正在进行中
        if room.status != 'playing':
            return JsonResponse({'error': '游戏未进行中'}, status=400)

        # 检查是否是白方玩家
        is_player_white = ((player == room.creator and not room.creator_is_black) or 
                          (player == room.opponent and room.creator_is_black))
        
        if not is_player_white:
            return JsonResponse({'error': '只有白方可以指出禁手'}, status=400)

        # 检查是否是白方的回合且尚未落子
        # 根据规范，白方必须在自己的回合开始前指出禁手才有效
        if room.current_turn != player:
            return JsonResponse({'error': '只有在你的回合开始前才能指出禁手'}, status=400)

        # 解析请求数据
        data = json.loads(request.body)
        row = data.get('row')
        col = data.get('col')

        # 验证坐标有效性
        if row is None or col is None or not (0 <= row < room.board_size and 0 <= col < room.board_size):
            return JsonResponse({'error': '无效的坐标'}, status=400)

        # 获取当前棋盘状态
        board = room.get_board()

        # 检查该位置是否为黑棋
        if board[row][col] != 1:  # 1代表黑棋
            return JsonResponse({'error': '该位置不是黑棋'}, status=400)

        # 检查是否为禁手点（真正意义上的禁手交点）
        is_forbidden_point = is_position_forbidden_point(board, row, col, room.board_size)
        
        # 如果不是禁手点，直接返回错误信息
        if not is_forbidden_point:
            return JsonResponse({
                'success': False,
                'error': '该位置不是禁手'
            })
        
        # 如果是禁手点，检查是否是刚刚下的棋（通过检查移动历史确保这是最新的一步）
        last_move = MoveHistory.objects.filter(room=room).order_by('-move_number').first()
        if not last_move or last_move.row != row or last_move.col != col:
            # 如果不是最新一步棋，则不允许指出禁手
            return JsonResponse({'error': '只能指出对手刚刚下的禁手棋'}, status=400)
        
        # 是禁手且是最新下的棋，白方获胜
        room.status = 'finished'
        room.winner = player  # 白方玩家获胜
        room.finished_at = timezone.now()
        
        # 更新玩家统计数据
        if room.opponent:  # 确保对手存在
            if player == room.creator:
                room.creator.total_wins += 1
            else:
                room.opponent.total_wins += 1
            room.creator.games_played += 1
            room.opponent.games_played += 1
            
            # 更新好友统计
            friend_stat, created = FriendStats.objects.get_or_create(
                player1=min(room.creator, room.opponent, key=lambda x: x.id),
                player2=max(room.creator, room.opponent, key=lambda x: x.id)
            )
            if player == room.creator:
                if room.creator == friend_stat.player1:
                    friend_stat.player1_wins += 1
                else:
                    friend_stat.player2_wins += 1
            else:
                if room.opponent == friend_stat.player1:
                    friend_stat.player1_wins += 1
                else:
                    friend_stat.player2_wins += 1
            friend_stat.total_games += 1
            friend_stat.save()
            
            room.creator.save()
            room.opponent.save()
        
        room.save()

        return JsonResponse({
            'success': True,
            'board': board,
            'status': room.status,
            'winner': room.winner.id if room.winner else None,
            'message': '禁手判定正确，白方获胜！'
        })

    except GomokuRoom.DoesNotExist:
        return JsonResponse({'error': '房间不存在'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)
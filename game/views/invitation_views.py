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
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from ..models import *


@login_required
@require_POST
@csrf_exempt
def update_session(request):
    """更新会话活动时间"""
    try:
        player = Player.objects.get(user=request.user)
    except Player.DoesNotExist:
        player = Player.objects.create(user=request.user)

    # 更新会话活动时间
    updated = PlayerSession.objects.filter(
        player=player,
        session_key=request.session.session_key
    ).update(last_activity=timezone.now())

    # 如果没有会话记录，创建一个
    if updated == 0:
        PlayerSession.objects.get_or_create(
            player=player,
            session_key=request.session.session_key,
            defaults={'last_activity': timezone.now()}
        )

    return JsonResponse({
        'success': True,
        'message': '会话活动时间已更新'
    })


@csrf_exempt
@require_POST
def clear_session(request):
    """清理会话记录（用户关闭页面时调用）"""
    # 如果用户已登录，删除对应的session记录
    if request.user.is_authenticated:
        try:
            player = Player.objects.get(user=request.user)
            PlayerSession.objects.filter(
                player=player,
                session_key=request.session.session_key
            ).delete()
        except Player.DoesNotExist:
            pass

    return JsonResponse({
        'success': True,
        'message': '会话已清理'
    })
"""我的网站 URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from game.views.lobby_views import (
    lobby,
    get_online_players,
    update_session,
    clear_session
)
from game.views.room_views import (
    create_room,
    join_room,
    game_room,
    get_available_rooms,
    delete_room,
    leave_room
)
from account import views as account_views
from game.views.invitation_views import (
    invite_player,
    accept_invitation,
    reject_invitation,
    get_invitations,
    get_invitation_status
)
from game.views.chat_views import (
    send_chat,
    get_room_state
)
from game.views.game_action_views import (
    make_move,
    request_undo,
    reject_undo,
    request_draw,
    reject_draw,
    request_rematch,
    reject_rematch,
    claim_forbidden
)

urlpatterns = [
    path('', RedirectView.as_view(url='/lobby/', permanent=False)),  # 添加根路径重定向到大厅
    path('admin/', admin.site.urls),
    path('lobby/', lobby, name='lobby'),
    path('accounts/login/', account_views.login_view, name='login'),
    path('accounts/logout/', account_views.logout_view, name='logout'),
    path('accounts/delete/confirm/', account_views.delete_account_confirm, name='delete_account_confirm'),
    path('accounts/delete/', account_views.delete_account, name='delete_account'),
    path('profile/edit/', account_views.edit_profile, name='edit_profile'),
    path('profile/<int:player_id>/', account_views.profile_view, name='player_profile'),
    path('profile/', account_views.profile_view, name='profile'),
    path('room/create/', create_room, name='create_room'),
    path('join/<str:room_code>/', join_room, name='join_room'),
    path('room/<str:room_code>/', game_room, name='room'),
    path('room/<str:room_code>/delete/', delete_room, name='delete_room'),
    path('room/<str:room_code>/leave/', leave_room, name='leave_room'),
    path('room/<str:room_code>/state/', get_room_state, name='get_room_state'),
    
    # API URLs
    path('api/online-players/', get_online_players, name='get_online_players'),
    path('api/available-rooms/', get_available_rooms, name='get_available_rooms'),
    path('api/update-session/', update_session, name='update_session'),
    path('api/clear-session/', clear_session, name='clear_session'),
    
    # 邀请系统API
    path('api/invite-player/<int:player_id>/', invite_player, name='invite_player'),
    path('api/invitation/<int:invitation_id>/accept/', accept_invitation, name='accept_invitation'),
    path('api/invitation/<int:invitation_id>/reject/', reject_invitation, name='reject_invitation'),
    path('api/invitations/', get_invitations, name='get_invitations'),
    path('api/invitation/<int:invitation_id>/status/', get_invitation_status, name='get_invitation_status'),
    
    # 聊天API
    path('api/send-message/<str:room_code>/', send_chat, name='send_message'),
    path('api/get-messages/<str:room_code>/<int:last_id>/', get_room_state, name='get_messages'),
    
    # 游戏操作API
    path('api/make-move/<str:room_code>/', make_move, name='make_move'),
    path('api/request-undo/<str:room_code>/', request_undo, name='request_undo'),
    path('api/reject-undo/<str:room_code>/', reject_undo, name='reject_undo'),
    path('api/request-draw/<str:room_code>/', request_draw, name='request_draw'),
    path('api/reject-draw/<str:room_code>/', reject_draw, name='reject_draw'),
    path('api/request-rematch/<str:room_code>/', request_rematch, name='request_rematch'),
    path('api/reject-rematch/<str:room_code>/', reject_rematch, name='reject_rematch'),
    path('api/claim-forbidden/<str:room_code>/', claim_forbidden, name='claim_forbidden'),
    
    # 房间状态获取
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
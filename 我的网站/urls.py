"""
URL configuration for 我的网站 project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
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
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from account.views import login_view, logout_view, delete_account_confirm, delete_account
from game.views import *

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', login_view, name='login'),
    path('login/', login_view),
    path('logout/', logout_view, name='logout'),
    path('lobby/', lobby, name='lobby'),
    path('create-room/', create_room, name='create_room'),
    path('join/<str:room_code>/', join_room, name='join_room'),
    path('room/<str:room_code>/', game_room, name='game_room'),
    path('room/<str:room_code>/move/', make_move, name='make_move'),
    path('room/<str:room_code>/chat/', send_chat, name='send_chat'),
    path('room/<str:room_code>/undo/', request_undo, name='request_undo'),
    path('room/<str:room_code>/draw/', request_draw, name='request_draw'),
    path('room/<str:room_code>/rematch/', request_rematch, name='request_rematch'),
    path('room/<str:room_code>/reject_rematch/', reject_rematch, name='reject_rematch'),
    path('room/<str:room_code>/delete/', delete_room, name='delete_room'),
    path('room/<str:room_code>/state/', get_room_state, name='get_room_state'),
    path('profile/', player_profile, name='profile'),
    path('profile/<int:player_id>/', player_profile, name='player_profile'),
    path('account/delete/', delete_account, name='delete_account'),
    path('account/delete/confirm/', delete_account_confirm, name='delete_account_confirm'),
    path('api/online-players/', get_online_players, name='get_online_players'),
    path('api/invite-player/<int:player_id>/', invite_player, name='invite_player'),
    path('api/invitations/', get_invitations, name='get_invitations'),
    path('api/invitation/<int:invitation_id>/status/', get_invitation_status, name='get_invitation_status'),
    path('api/invitation/<int:invitation_id>/accept/', accept_invitation, name='accept_invitation'),
    path('api/invitation/<int:invitation_id>/reject/', reject_invitation, name='reject_invitation'),
    path('api/update-session/', update_session, name='update_session'),
]

# 开发环境下的静态文件服务
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])

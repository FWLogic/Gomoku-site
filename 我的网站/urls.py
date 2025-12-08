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
from account.views import login_view, logout_view
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
    path('room/<str:room_code>/delete/', delete_room, name='delete_room'),
    path('room/<str:room_code>/state/', get_room_state, name='get_room_state'),
    path('profile/', player_profile, name='profile'),
    path('profile/<int:player_id>/', player_profile, name='player_profile'),
]

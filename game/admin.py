from django.contrib import admin
from .models import *


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ('user', 'total_wins', 'games_played', 'win_rate')
    search_fields = ('user__username',)
    readonly_fields = ('win_rate',)


@admin.register(FriendStats)
class FriendStatsAdmin(admin.ModelAdmin):
    list_display = ('player1', 'player2', 'player1_wins', 'player2_wins', 'draws', 'total_games')
    search_fields = ('player1__user__username', 'player2__user__username')


@admin.register(GomokuRoom)
class GomokuRoomAdmin(admin.ModelAdmin):
    list_display = ('room_code', 'creator', 'opponent', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('room_code', 'creator__user__username', 'opponent__user__username')
    readonly_fields = ('room_code', 'created_at')


@admin.register(MoveHistory)
class MoveHistoryAdmin(admin.ModelAdmin):
    list_display = ('room', 'player', 'row', 'col', 'move_number', 'timestamp')
    list_filter = ('timestamp',)
    search_fields = ('room__room_code', 'player__user__username')


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('room', 'player', 'message_preview', 'timestamp')
    list_filter = ('timestamp',)
    search_fields = ('message', 'player__user__username')

    def message_preview(self, obj):
        return obj.message[:50] + '...' if len(obj.message) > 50 else obj.message

    message_preview.short_description = '消息'


@admin.register(PlayerSession)
class PlayerSessionAdmin(admin.ModelAdmin):
    list_display = ('player', 'created_at', 'last_activity')
    list_filter = ('created_at', 'last_activity')
    search_fields = ('player__user__username', 'session_key')
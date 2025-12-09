from django.db import models
from django.conf import settings
import json


class Player(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    total_wins = models.IntegerField(default=0)
    games_played = models.IntegerField(default=0)

    def __str__(self):
        return self.user.username

    def win_rate(self):
        return (self.total_wins / self.games_played * 100) if self.games_played > 0 else 0


class FriendStats(models.Model):
    player1 = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='friend_stats1')
    player2 = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='friend_stats2')
    player1_wins = models.IntegerField(default=0)
    player2_wins = models.IntegerField(default=0)
    draws = models.IntegerField(default=0)
    total_games = models.IntegerField(default=0)
    last_played = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('player1', 'player2')

    def get_wins_for_player(self, player):
        if player == self.player1:
            return self.player1_wins
        elif player == self.player2:
            return self.player2_wins
        return 0


class GomokuRoom(models.Model):
    ROOM_STATUS = (
        ('waiting', '等待对手'),
        ('playing', '游戏中'),
        ('finished', '已结束'),
    )

    room_code = models.CharField(max_length=8, unique=True)
    creator = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='created_gomoku_rooms')
    opponent = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='joined_gomoku_rooms')
    status = models.CharField(max_length=10, choices=ROOM_STATUS, default='waiting')
    created_at = models.DateTimeField(auto_now_add=True)
    board_size = models.IntegerField(default=15)  # 15x15 五子棋棋盘
    current_turn = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, related_name='current_turn_rooms')
    winner = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='won_rooms')
    is_draw = models.BooleanField(default=False)

    # 存储棋盘状态
    board_state = models.TextField(default='[]')  # JSON格式存储棋盘

    def get_board(self):
        try:
            return json.loads(self.board_state)
        except:
            return [[0 for _ in range(self.board_size)] for _ in range(self.board_size)]

    def set_board(self, board):
        self.board_state = json.dumps(board)

    def save(self, *args, **kwargs):
        if not self.room_code:
            import random, string
            self.room_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

        if not self.board_state or self.board_state == '[]':
            self.board_state = json.dumps([[0 for _ in range(self.board_size)] for _ in range(self.board_size)])

        super().save(*args, **kwargs)


class MoveHistory(models.Model):
    room = models.ForeignKey(GomokuRoom, on_delete=models.CASCADE, related_name='moves')
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    row = models.IntegerField()
    col = models.IntegerField()
    move_number = models.IntegerField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['move_number']


class ChatMessage(models.Model):
    room = models.ForeignKey(GomokuRoom, on_delete=models.CASCADE, related_name='chats')
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    message = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']


class PlayerSession(models.Model):
    """记录登录会话"""
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    session_key = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('player', 'session_key')


class Invitation(models.Model):
    """游戏邀请模型"""
    INVITATION_STATUS = (
        ('pending', '等待中'),
        ('accepted', '已接受'),
        ('rejected', '已拒绝'),
        ('expired', '已过期'),
    )
    
    sender = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='sent_invitations')
    receiver = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='received_invitations')
    room = models.ForeignKey(GomokuRoom, on_delete=models.CASCADE, related_name='invitations')
    status = models.CharField(max_length=10, choices=INVITATION_STATUS, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.sender.user.username}邀请{self.receiver.user.username}加入房间{self.room.room_code}"

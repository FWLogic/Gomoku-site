// 音频管理器
class AudioManager {
    constructor() {
        // 创建音频上下文
        this.audioContext = null;
        this.sounds = {};
        this.enabled = true;
        
        // 初始化基础音效
        this.initSounds();
    }
    
    initSounds() {
        // 创建简单的音调作为音效替代方案
        try {
            // 使用 Web Audio API 创建简单音效
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log("Web Audio API 不支持，将使用基础提示音");
        }
    }
    
    // 播放落子音效
    playMoveSound() {
        if (!this.enabled) return;
        
        if (this.audioContext) {
            this.playTone(440, 0.1, 0.1); // A音，持续0.1秒
        } else {
            // 降级到系统提示音
            console.log('\x07'); // 触发系统提示音
        }
    }
    
    // 播放胜利音效
    playWinSound() {
        if (!this.enabled) return;
        
        if (this.audioContext) {
            // 播放胜利音调序列
            this.playTone(523.25, 0.2, 0.3); // C
            setTimeout(() => this.playTone(659.25, 0.2, 0.3), 300); // E
            setTimeout(() => this.playTone(783.99, 0.2, 0.5), 600); // G
        } else {
            // 降级到系统提示音
            console.log('\x07\x07'); // 双提示音
        }
    }
    
    // 播放失败音效
    playLoseSound() {
        if (!this.enabled) return;
        
        if (this.audioContext) {
            // 播放失败音调
            this.playTone(220, 0.3, 0.5); // 低音A
        } else {
            // 降级到系统提示音
            console.log('\x07'); // 单提示音
        }
    }
    
    // 播放和棋音效
    playDrawSound() {
        if (!this.enabled) return;
        
        if (this.audioContext) {
            // 播放和棋音调
            this.playTone(330, 0.2, 0.3); // 低音E
            setTimeout(() => this.playTone(330, 0.2, 0.3), 300); // 低音E
        } else {
            // 降级到系统提示音
            console.log('\x07'); // 单提示音
        }
    }
    
    // 播放提醒音效（轮到玩家）
    playTurnSound() {
        if (!this.enabled) return;
        
        if (this.audioContext) {
            this.playTone(880, 0.05, 0.1); // 高音A，短促
        } else {
            // 降级到系统提示音
            console.log('\x07'); // 单提示音
        }
    }
    
    // 创建并播放一个音调
    playTone(frequency, duration, volume = 0.1) {
        if (!this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gainNode.gain.value = volume;
            
            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
            }, duration * 1000);
        } catch (e) {
            console.log("播放音效时出错:", e);
        }
    }
    
    // 切换音效开关
    toggleSound() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

// 导出 AudioManager 类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
} else if (typeof window !== 'undefined') {
    window.AudioManager = AudioManager;
}
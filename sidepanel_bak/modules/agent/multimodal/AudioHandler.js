// 音频处理器
// 负责音频录制、播放、转换等多媒体处理

class AudioHandler {
  constructor() {
    this.maxFileSize = 25 * 1024 * 1024; // 25MB
    this.allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/webm'];
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  /**
   * 验证音频文件
   */
  validateFile(file) {
    if (!file) {
      return { valid: false, error: '未选择文件' };
    }

    if (!this.allowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: `不支持的文件类型: ${file.type}` 
      };
    }

    if (file.size > this.maxFileSize) {
      return { 
        valid: false, 
        error: `文件过大: ${(file.size / 1024 / 1024).toFixed(2)}MB (最大${this.maxFileSize / 1024 / 1024}MB)` 
      };
    }

    return { valid: true };
  }

  /**
   * 读取音频为DataURL
   */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 获取音频时长
   */
  getAudioDuration(dataUrl) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        resolve(audio.duration);
      };
      audio.onerror = reject;
      audio.src = dataUrl;
    });
  }

  /**
   * 开始录音
   */
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.start();
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: '无法访问麦克风: ' + error.message 
      };
    }
  }

  /**
   * 停止录音
   */
  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve({ success: false, error: '没有正在进行的录音' });
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];
        
        if (this.mediaRecorder.stream) {
          this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        resolve({ 
          success: true, 
          blob: audioBlob 
        });
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * 将Blob转换为DataURL
   */
  blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 创建音频预览URL
   */
  createPreviewUrl(dataUrl) {
    return dataUrl;
  }

  /**
   * 撤销预览URL
   */
  revokePreviewUrl(url) {
    // DataURL不需要撤销
  }

  /**
   * 播放音频
   */
  playAudio(dataUrl) {
    const audio = new Audio(dataUrl);
    audio.play();
    return audio;
  }

  /**
   * 获取音频信息
   */
  async getAudioInfo(dataUrl) {
    const duration = await this.getAudioDuration(dataUrl);
    
    return {
      duration: Math.round(duration),
      size: Math.round(dataUrl.length * 0.75) // 估算大小
    };
  }
}

// 导出
window.AudioHandler = AudioHandler;

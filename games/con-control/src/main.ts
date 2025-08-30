// Frontend terminal interface with voice input and streaming AI responses

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

class Terminal {
  private micButton: HTMLButtonElement;
  private voiceStatus: HTMLElement;
  private transcript: HTMLElement;
  private aiResponse: HTMLElement;
  private typingIndicator: HTMLElement;
  private isListening = false;
  private recognition: any = null;

  constructor() {
    this.micButton = document.getElementById('mic-button') as HTMLButtonElement;
    this.voiceStatus = document.getElementById('voice-status') as HTMLElement;
    this.transcript = document.getElementById('transcript') as HTMLElement;
    this.aiResponse = document.getElementById('ai-response') as HTMLElement;
    this.typingIndicator = document.getElementById('typing-indicator') as HTMLElement;

    this.initializeSpeechRecognition();
    this.setupEventListeners();
  }

  private initializeSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
      this.recognition = new (window as any).webkitSpeechRecognition();
    } else if ('SpeechRecognition' in window) {
      this.recognition = new (window as any).SpeechRecognition();
    }

    if (this.recognition) {
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.micButton.classList.add('listening');
        this.voiceStatus.textContent = 'Listening... speak now';
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        this.transcript.textContent = finalTranscript || interimTranscript;

        if (finalTranscript) {
          this.sendToShipAI(finalTranscript);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.micButton.classList.remove('listening');
        this.voiceStatus.textContent = 'Click microphone to speak to Ship AI';
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        this.voiceStatus.textContent = `Error: ${event.error}`;
        this.isListening = false;
        this.micButton.classList.remove('listening');
      };
    } else {
      this.voiceStatus.textContent = 'Voice recognition not supported. Use text input instead.';
      this.micButton.disabled = true;
    }
  }

  private setupEventListeners() {
    this.micButton.addEventListener('click', () => {
      if (this.recognition) {
        if (this.isListening) {
          this.recognition.stop();
        } else {
          this.recognition.start();
        }
      }
    });

    // Add keyboard shortcut for spacebar to activate mic
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space' && !this.isListening && this.recognition) {
        event.preventDefault();
        this.recognition.start();
      }
    });
  }

  private async sendToShipAI(message: string) {
    this.showTypingIndicator();
    this.transcript.textContent = `You: ${message}`;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message,
          sessionId: this.getSessionId()
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      this.aiResponse.textContent = '';
      this.hideTypingIndicator();

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += new TextDecoder().decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'text') {
                this.aiResponse.textContent += parsed.content;
                this.scrollToBottom();
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error communicating with Ship AI:', error);
      this.hideTypingIndicator();
      this.aiResponse.textContent = 'Error: Unable to communicate with Ship AI. Please try again.';
    }
  }

  private showTypingIndicator() {
    this.typingIndicator.style.display = 'block';
  }

  private hideTypingIndicator() {
    this.typingIndicator.style.display = 'none';
  }

  private scrollToBottom() {
    this.aiResponse.scrollTop = this.aiResponse.scrollHeight;
  }

  private getSessionId(): string {
    let sessionId = localStorage.getItem('ship-ai-session');
    if (!sessionId) {
      sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ship-ai-session', sessionId);
    }
    return sessionId;
  }
}

// Initialize terminal when page loads
document.addEventListener('DOMContentLoaded', () => {
  new Terminal();
});

export class SpeechInput {
  private recognition: any = null;  // SpeechRecognition
  private _transcript: string = '';
  private _isListening: boolean = false;
  private _supported: boolean = false;
  private _onTranscript: ((text: string) => void) | null = null;

  constructor() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this._supported = true;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript.trim()) {
          this._transcript += finalTranscript;
          if (this._onTranscript) {
            this._onTranscript(finalTranscript.trim());
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          // Mic permission denied — stop retrying
          console.warn('[SPEECH] Mic permission denied. Use Chrome and allow mic access.');
          this._isListening = false;
          return;
        }
        console.warn('[SPEECH] Error:', event.error);
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // Auto-restart on transient errors
          if (this._isListening) {
            setTimeout(() => this.start(), 500);
          }
        }
      };

      this.recognition.onend = () => {
        // Auto-restart if we're supposed to be listening
        if (this._isListening) {
          setTimeout(() => {
            try { this.recognition.start(); } catch {}
          }, 100);
        }
      };
    }
  }

  get supported(): boolean { return this._supported; }
  get isListening(): boolean { return this._isListening; }
  get transcript(): string { return this._transcript; }

  onTranscript(cb: (text: string) => void): void {
    this._onTranscript = cb;
  }

  start(): void {
    if (!this._supported || this._isListening) return;
    this._isListening = true;
    try {
      this.recognition.start();
    } catch {}
  }

  stop(): void {
    this._isListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch {}
    }
  }

  clearTranscript(): void {
    this._transcript = '';
  }

  // Inject text as if it were spoken — for text input fallback
  injectText(text: string): void {
    if (!text.trim()) return;
    this._transcript += text + ' ';
    if (this._onTranscript) {
      this._onTranscript(text.trim());
    }
  }
}

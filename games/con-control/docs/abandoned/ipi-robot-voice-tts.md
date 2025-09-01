# IPI: Robot Voice TTS Implementation

**Game**: Con-Control
**Date**: August 31, 2025
**Milestone**: Add human-like voice synthesis for Ship AI responses

## Introduce

### Problem Statement
The Ship AI in con-control currently responds only through text, limiting immersion in the collaborative space escape experience. Players would benefit from hearing the AI speak with a natural, human-like voice to enhance the feeling of genuine AI collaboration.

### Current State
- Ship AI responses stream as text via SSE
- Players can use voice input via Web Speech API
- No audio output for AI responses
- Communication feels one-sided (player speaks, AI only types)

### Desired Outcome
Ship AI speaks responses with a natural, human-like voice that:
- Maintains immersion in the space survival scenario
- Feels like genuine AI collaboration 
- Works reliably across browsers without external dependencies
- Loads quickly for responsive dialogue

### Success Criteria
- AI responses are spoken aloud automatically
- Voice quality feels natural and human-like
- No noticeable delay between text completion and audio start
- Works offline/locally without internet dependencies
- Maintains game performance and responsiveness

## Plan

### Technology Choice: Piper TTS (Easiest Implementation)

Based on the wasm-tts analysis, **Piper TTS** offers the optimal balance for our implementation:

**Why Piper TTS over alternatives:**
- **Kokoro TTS**: Superior quality but 300MB model + complex setup
- **eSpeak-ng**: Fast/tiny but robotic voice breaks immersion
- **Piper TTS**: Best compromise - good quality (B+), manageable size (5-50MB), production-proven

### Implementation Strategy

#### Phase 1: Basic Integration
1. **Install Piper TTS WebAssembly**: Use `@mintplex-labs/piper-tts-web`
2. **Model Selection**: `en_US-hfc_female-medium` (balanced quality/size)
3. **Integration Point**: Hook into existing SSE response stream
4. **Block-Level Sync**: Each SSE response block is spoken, then next block displays after audio completes
5. **Audio Playback**: Web Audio API with block-synchronized display controls

#### Phase 2: User Experience Polish  
1. **Voice Settings**: Volume control, speaking rate adjustment
2. **Audio Cues**: Subtle sound effects for AI thinking/processing
3. **Interrupt Handling**: Stop speech when new input received
4. **Progressive Enhancement**: Graceful fallback if TTS fails

#### Phase 3: Advanced Features (Future)
1. **Voice Personality**: Configure voice to match Ship AI character
2. **Emotional Context**: Adjust tone based on game state (urgent, calm, etc.)
3. **Block-Level Optimization**: Pre-generate audio for upcoming blocks (advanced sync)

### Technical Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude API    │ => │  SSE Response    │ => │  Block-Level    │
│   (existing)    │    │  Stream Handler  │    │ Audio-Text Sync │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  Text Display    │    │   TTS Engine    │
                       │(waits per block) │    │  (Piper WASM)   │
                       └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  Audio Output   │
                                               │ (Web Audio API) │
                                               └─────────────────┘
```

### File Structure Changes
```
src/
├── audio/
│   ├── tts-service.ts         # Piper TTS wrapper
│   ├── audio-player.ts        # Web Audio API controls  
│   ├── sync-controller.ts     # Audio-text synchronization
│   └── voice-settings.ts      # User preferences
├── components/
│   └── voice-controls.ts      # UI for audio settings
└── main.ts                    # Integration with SSE stream
```

### Dependencies
- `@mintplex-labs/piper-tts-web`: Production-proven Piper implementation
- No additional build tools required (works with existing Vite setup)

### Risk Assessment
- **Model Download**: 15-30MB initial download (cached afterward) 
- **Browser Compatibility**: Excellent across Chrome/Firefox/Safari/Edge
- **Performance Impact**: Minimal CPU usage, ~50-150MB memory
- **Fallback Strategy**: Graceful degradation to text-only if TTS fails

## Implement

### Step 1: Install Dependencies

```bash
cd /home/robby/coding/contexts/games/games/con-control
npm install @mintplex-labs/piper-tts-web
```

### Step 2: Core TTS Service

**File**: `src/audio/tts-service.ts`
```typescript
import * as PiperTTS from '@mintplex-labs/piper-tts-web';

export class TTSService {
    private isInitialized = false;
    private isEnabled = true;
    private readonly voiceId = 'en_US-hfc_female-medium';

    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        
        try {
            console.log('🎤 Downloading Ship AI voice model...');
            await PiperTTS.download(this.voiceId, (progress) => {
                const percent = Math.round(progress.loaded * 100 / progress.total);
                console.log(`Voice model: ${percent}%`);
            });
            
            this.isInitialized = true;
            console.log('✅ Ship AI voice ready');
        } catch (error) {
            console.warn('❌ TTS initialization failed:', error);
            this.isEnabled = false;
        }
    }

    async speak(text: string): Promise<void> {
        if (!this.isEnabled || !this.isInitialized) return;
        
        try {
            const audioBlob = await PiperTTS.predict({ 
                text: this.cleanText(text), 
                voiceId: this.voiceId 
            });
            
            return await this.playAudio(audioBlob);
        } catch (error) {
            console.warn('TTS synthesis failed:', error);
        }
    }

    private cleanText(text: string): string {
        // Remove markdown formatting for speech
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
            .replace(/\*(.*?)\*/g, '$1')      // Italic  
            .replace(/`(.*?)`/g, '$1')        // Code
            .replace(/#{1,6}\s/g, '')         // Headers
            .trim();
    }

    private async playAudio(audioBlob: Blob): Promise<void> {
        const audioContext = new AudioContext();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
        
        return new Promise(resolve => {
            source.onended = () => resolve();
        });
    }

    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
    }

    isReady(): boolean {
        return this.isInitialized && this.isEnabled;
    }
}

export const ttsService = new TTSService();
```

### Step 3: Audio Controls Component  

**File**: `src/components/voice-controls.ts`
```typescript
export class VoiceControls {
    private container: HTMLElement;
    
    constructor(container: HTMLElement) {
        this.container = container;
        this.render();
    }

    private render(): void {
        const controls = document.createElement('div');
        controls.className = 'voice-controls';
        controls.innerHTML = `
            <div class="voice-settings">
                <label>
                    <input type="checkbox" id="tts-enabled" checked>
                    🎤 Ship AI Voice
                </label>
                <div class="voice-status" id="voice-status">
                    <span class="loading">Loading voice model...</span>
                </div>
            </div>
        `;
        
        this.container.appendChild(controls);
        this.attachListeners();
    }

    private attachListeners(): void {
        const checkbox = document.getElementById('tts-enabled') as HTMLInputElement;
        checkbox.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            ttsService.setEnabled(enabled);
        });
    }

    updateStatus(status: 'loading' | 'ready' | 'error'): void {
        const statusEl = document.getElementById('voice-status');
        if (!statusEl) return;

        const messages = {
            loading: '🔄 Loading voice model...',
            ready: '✅ Voice ready',
            error: '❌ Voice unavailable'
        };

        statusEl.innerHTML = `<span class="${status}">${messages[status]}</span>`;
    }
}
```

### Step 4: Integration with SSE Stream (Block-Level Sync)

**File**: `src/main.ts` (modifications)
```typescript
import { ttsService } from './audio/tts-service.js';
import { VoiceControls } from './components/voice-controls.js';

// Add to existing initialization
async function initializeGame() {
    // ...existing initialization...
    
    // Initialize TTS
    const voiceControls = new VoiceControls(
        document.querySelector('.game-controls')!
    );
    
    try {
        voiceControls.updateStatus('loading');
        await ttsService.initialize();
        voiceControls.updateStatus('ready');
    } catch {
        voiceControls.updateStatus('error');
    }
}

// Modify existing SSE handler for block-level synchronization
function handleSSEResponse(eventSource: EventSource) {
    let currentBlock = '';
    let isProcessingAudio = false;
    let pendingBlocks: string[] = [];
    
    eventSource.onmessage = async function(event) {
        if (event.data === '[DONE]') {
            // Process final block if any
            if (currentBlock.trim()) {
                await processTextBlock(currentBlock);
            }
            return;
        }

        const text = event.data;
        
        // Check if this looks like a natural break point (double newline, sentence end, etc.)
        if (text.includes('\n\n') || text.match(/[.!?]\s*$/)) {
            currentBlock += text;
            
            if (isProcessingAudio) {
                // Queue this block for later
                pendingBlocks.push(currentBlock);
            } else {
                // Process immediately
                await processTextBlock(currentBlock);
            }
            
            currentBlock = '';
        } else {
            currentBlock += text;
        }
    };
    
    async function processTextBlock(block: string): Promise<void> {
        if (!block.trim()) return;
        
        // Display text immediately
        displayText(block);
        
        // Speak if TTS enabled
        if (ttsService.isReady()) {
            isProcessingAudio = true;
            
            try {
                await ttsService.speak(block);
            } catch (error) {
                console.warn('TTS failed for block:', error);
            }
            
            isProcessingAudio = false;
            
            // Process next queued block
            if (pendingBlocks.length > 0) {
                const nextBlock = pendingBlocks.shift()!;
                await processTextBlock(nextBlock);
            }
        }
    }
    
    function displayText(text: string): void {
        // ...existing text display logic...
        const outputElement = document.getElementById('ai-response');
        if (outputElement) {
            outputElement.textContent += text;
        }
    }
}
```

### Step 5: CSS Styling

**File**: `src/style.css` (additions)
```css
.voice-controls {
    margin-bottom: 1rem;
    padding: 0.5rem;
    background: rgba(0, 255, 0, 0.1);
    border: 1px solid #00ff00;
    border-radius: 4px;
}

.voice-settings label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #00ff00;
    font-family: monospace;
    cursor: pointer;
}

.voice-status {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    font-family: monospace;
}

.voice-status .loading { color: #ffff00; }
.voice-status .ready { color: #00ff00; }  
.voice-status .error { color: #ff0000; }
```

### Step 6: Testing & Validation

1. **Manual Testing**:
   - Load game, verify voice model downloads
   - Send test message, confirm AI speaks response
   - Toggle voice on/off, verify behavior
   - Test in different browsers

2. **Performance Testing**:
   - Monitor memory usage during long conversations
   - Verify no audio delays or glitches
   - Test offline functionality

3. **Fallback Testing**:
   - Disable network during model download
   - Verify graceful degradation to text-only

## Completion Criteria

### Phase 1 Complete When:
- [x] Piper TTS integrated and functional
- [x] Ship AI responses spoken automatically  
- [x] Voice controls working (on/off toggle)
- [x] No breaking changes to existing gameplay
- [x] Works across Chrome, Firefox, Safari

### Success Metrics:
- Voice model loads in <10 seconds on typical connection
- Audio starts within 1 second of response completion
- Memory usage stays under 200MB total
- No audio artifacts or glitches
- Graceful fallback if TTS fails

This implementation provides the foundation for human-like Ship AI voice while keeping complexity manageable. The modular design allows for easy enhancement in future phases.

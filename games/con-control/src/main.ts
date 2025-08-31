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
  private floatingTranscript: HTMLElement;
  private chatHistory: HTMLElement;
  private typingIndicator: HTMLElement;
  private textInputFallback: HTMLElement;
  private textInput: HTMLInputElement;
  private sendButton: HTMLButtonElement;
  private introScreen: HTMLElement;
  private mainTerminal: HTMLElement;
  private winScreen: HTMLElement;
  private restartHarderBtn: HTMLButtonElement;
  private restartFullBtn: HTMLButtonElement;
  private costDisplay: HTMLElement;
  private sessionCost: HTMLElement;
  private sessionTokens: HTMLElement;
  private isListening = false;
  private isAiResponding = false;
  private isUsingFallback = false; // Track if we're using text input fallback
  private recognition: any = null;
  private currentAiMessage: HTMLElement | null = null;
  private typewriterQueue: Array<{text: string, callback?: () => void}> = [];
  private isTypewriting = false;
  private mouseX = 0;
  private mouseY = 0;

  constructor() {
    this.micButton = document.getElementById('mic-button') as HTMLButtonElement;
    this.voiceStatus = document.getElementById('voice-status') as HTMLElement;
    this.transcript = document.getElementById('transcript') as HTMLElement;
    this.floatingTranscript = document.getElementById('floating-transcript') as HTMLElement;
    this.chatHistory = document.getElementById('chat-history') as HTMLElement;
    this.typingIndicator = document.getElementById('typing-indicator') as HTMLElement;
    this.textInputFallback = document.getElementById('text-input-fallback') as HTMLElement;
    this.textInput = document.getElementById('text-input') as HTMLInputElement;
    this.sendButton = document.getElementById('send-button') as HTMLButtonElement;
    this.introScreen = document.getElementById('intro-screen') as HTMLElement;
    this.mainTerminal = document.getElementById('main-terminal') as HTMLElement;
    this.winScreen = document.getElementById('win-screen') as HTMLElement;
    this.restartHarderBtn = document.getElementById('restart-harder-btn') as HTMLButtonElement;
    this.restartFullBtn = document.getElementById('restart-full-btn') as HTMLButtonElement;
    this.costDisplay = document.getElementById('cost-display') as HTMLElement;
    this.sessionCost = document.getElementById('session-cost') as HTMLElement;
    this.sessionTokens = document.getElementById('session-tokens') as HTMLElement;

    this.initializeIntroScreen();
    this.initializeSpeechRecognition();
    this.setupEventListeners();
    this.setupWinScreen();
    this.updateMicButtonState();
  }

  private initializeIntroScreen() {
    const introContinue = document.getElementById('intro-continue') as HTMLButtonElement;
    
    introContinue.addEventListener('click', () => {
      this.transitionToTerminal();
    });

    // Also allow pressing Enter to continue
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.introScreen.classList.contains('hidden')) {
        this.transitionToTerminal();
      }
    });
  }

  private transitionToTerminal() {
    // Fade out intro screen
    this.introScreen.classList.add('fade-out');
    
    // After fade out completes, hide intro and show terminal
    setTimeout(() => {
      this.introScreen.classList.add('hidden');
      this.mainTerminal.style.opacity = '1';
      this.mainTerminal.classList.add('fade-in');
    }, 1000);
  }

  private initializeSpeechRecognition() {
    // Check for speech recognition support with better detection
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      console.log('✅ Speech recognition supported');
    } else {
      console.log('❌ Speech recognition not supported in this browser');
    }

    if (this.recognition) {
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        console.log('🎤 Speech recognition started');
        this.isListening = true;
        this.updateMicButtonState();
        this.voiceStatus.textContent = 'Listening... speak now';
        this.showFloatingTranscript();
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

        const currentTranscript = finalTranscript || interimTranscript;
        this.transcript.textContent = currentTranscript;
        this.updateFloatingTranscript(currentTranscript);

        if (finalTranscript) {
          console.log('🗣️ Final transcript:', finalTranscript);
          this.hideFloatingTranscript();
          this.sendToShipAI(finalTranscript);
        }
      };

      this.recognition.onend = () => {
        console.log('🎤 Speech recognition ended');
        this.isListening = false;
        this.updateMicButtonState();
        this.hideFloatingTranscript();
        if (!this.isAiResponding && !this.isUsingFallback) {
          this.voiceStatus.textContent = 'Click microphone or press SPACE to speak to Ship AI';
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('❌ Speech recognition error:', event.error);
        
        let errorMessage = 'Speech error';
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'No speech detected. Try speaking louder.';
            break;
          case 'audio-capture':
            errorMessage = 'Microphone access denied or unavailable.';
            break;
          case 'not-allowed':
            errorMessage = 'Microphone permission denied. Please allow microphone access.';
            break;
          case 'network':
            errorMessage = 'Network error. Check your internet connection.';
            break;
          default:
            errorMessage = `Speech error: ${event.error}`;
        }
        
        this.voiceStatus.textContent = errorMessage;
        this.isListening = false;
        this.updateMicButtonState();
        this.hideFloatingTranscript();
      };
      
      // Success - speech recognition is available
      this.voiceStatus.textContent = 'Click microphone or press SPACE to speak to Ship AI';
      
    } else {
      // No speech recognition support - show fallback text input
      this.isUsingFallback = true;
      this.voiceStatus.innerHTML = `
        <div style="color: #ff6666;">⚠ Speech recognition not supported in this browser.</div>
        <div style="color: #888; font-size: 12px; margin-top: 5px;">
          Using text input fallback. For speech: try Chrome, Edge, or Safari.
        </div>
      `;
      this.micButton.disabled = true;
      this.micButton.classList.add('disabled');
      
      // Show the text input fallback
      this.textInputFallback.style.display = 'flex';
    }
  }

  private setupEventListeners() {
    this.micButton.addEventListener('click', () => {
      if (this.recognition && !this.isAiResponding) {
        if (this.isListening) {
          this.recognition.stop();
        } else {
          this.recognition.start();
        }
      }
    });

    // Restart game button
    const restartButton = document.getElementById('restart-button') as HTMLButtonElement;
    restartButton.addEventListener('click', () => {
      this.restartGame();
    });

    // Add keyboard shortcut for spacebar to activate mic
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space' && !this.isListening && !this.isAiResponding && this.recognition) {
        event.preventDefault();
        this.recognition.start();
      }
    });

    // Track mouse position for floating transcript
    document.addEventListener('mousemove', (event) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
      if (this.isListening) {
        this.positionFloatingTranscript();
      }
    });

    // Text input fallback listeners (for when speech recognition isn't available)
    this.sendButton.addEventListener('click', () => {
      this.sendTextMessage();
    });

    this.textInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.sendTextMessage();
      }
    });
  }

  private sendTextMessage() {
    const message = this.textInput.value.trim();
    if (message) {
      this.textInput.value = '';
      this.sendToShipAI(message);
    }
  }

  private updateMicButtonState() {
    this.micButton.classList.remove('listening', 'disabled');
    
    if (this.isUsingFallback) {
      // Keep mic disabled in fallback mode
      this.micButton.classList.add('disabled');
      this.micButton.disabled = true;
    } else if (this.isAiResponding) {
      this.micButton.classList.add('disabled');
    } else if (this.isListening) {
      this.micButton.classList.add('listening');
    }
  }

  private showFloatingTranscript() {
    this.floatingTranscript.style.display = 'block';
    this.positionFloatingTranscript();
  }

  private hideFloatingTranscript() {
    this.floatingTranscript.style.display = 'none';
    this.floatingTranscript.textContent = '';
  }

  private updateFloatingTranscript(text: string) {
    this.floatingTranscript.textContent = text;
    this.positionFloatingTranscript();
  }

  private positionFloatingTranscript() {
    if (this.floatingTranscript.style.display === 'block') {
      this.floatingTranscript.style.left = `${this.mouseX + 10}px`;
      this.floatingTranscript.style.top = `${this.mouseY - 40}px`;
    }
  }

  private async sendToShipAI(message: string) {
    // Add player message to chat
    this.addPlayerMessage(message);
    this.showTypingIndicator();
    this.transcript.textContent = '';
    
    // Block mic during AI response
    this.isAiResponding = true;
    this.updateMicButtonState();
    if (!this.isUsingFallback) {
      this.voiceStatus.textContent = 'Ship AI is responding...';
    }

    try {
      // First, send the message to the server and get a stream URL
      const sessionId = this.getSessionId();
      
      // Create EventSource for SSE
      const eventSource = new EventSource(`/api/chat?message=${encodeURIComponent(message)}&sessionId=${encodeURIComponent(sessionId)}`);
      
      // Create new AI message element
      this.currentAiMessage = this.createAiMessage();
      this.hideTypingIndicator();

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'text') {
            if (this.currentAiMessage && parsed.content) {
              // Use typewriter effect for text content
              this.addToTypewriterQueue(parsed.content);
            }
          } else if (parsed.type === 'tool_call') {
            // Queue tool call display after current typewriting completes
            this.addToTypewriterQueue('', () => {
              this.addToolUsage(parsed.name, parsed.input);
            });
          } else if (parsed.type === 'tool_result') {
            // Queue tool result display after current typewriting completes
            this.addToTypewriterQueue('', () => {
              this.addToolResult(parsed.name, parsed.result);
            });
          } else if (parsed.type === 'system_warning') {
            // Add system warning with special styling
            this.addToTypewriterQueue('', () => {
              this.addSystemWarning(parsed.content);
            });
          } else if (parsed.type === 'cost_update') {
            // Update cost display
            this.updateCostDisplay(parsed.data);
          } else if (parsed.type === 'done') {
            eventSource.close();
            // Re-enable mic when AI is done
            this.isAiResponding = false;
            this.updateMicButtonState();
            if (!this.isUsingFallback) {
              this.voiceStatus.textContent = 'Click microphone or press SPACE to speak to Ship AI';
            }
            
            // Check for win condition if game state is provided
            if (parsed.gameState) {
              this.checkForWinCondition(parsed);
            }
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        this.hideTypingIndicator();
        if (this.currentAiMessage) {
          this.currentAiMessage.textContent = 'Error: Unable to communicate with Ship AI. Please try again.';
        }
        eventSource.close();
        // Re-enable mic on error
        this.isAiResponding = false;
        this.updateMicButtonState();
        if (!this.isUsingFallback) {
          this.voiceStatus.textContent = 'Click microphone or press SPACE to speak to Ship AI';
        }
      };

    } catch (error) {
      console.error('Error communicating with Ship AI:', error);
      this.hideTypingIndicator();
      if (this.currentAiMessage) {
        this.currentAiMessage.textContent = 'Error: Unable to communicate with Ship AI. Please try again.';
      }
      // Re-enable mic on error
      this.isAiResponding = false;
      this.updateMicButtonState();
      if (!this.isUsingFallback) {
        this.voiceStatus.textContent = 'Click microphone or press SPACE to speak to Ship AI';
      }
    }
  }

  private showTypingIndicator() {
    this.typingIndicator.style.display = 'block';
  }

  private hideTypingIndicator() {
    this.typingIndicator.style.display = 'none';
  }

  private scrollToBottom() {
    // Automatically scroll to bottom so new text pushes old text up and off screen
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }

  private addPlayerMessage(message: string) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message player-message';
    messageEl.textContent = `> ${message}`;
    this.chatHistory.appendChild(messageEl);
    this.scrollToBottom();
  }

  private createAiMessage(): HTMLElement {
    const messageEl = document.createElement('div');
    messageEl.className = 'message ai-message';
    messageEl.innerHTML = '> '; // Use innerHTML so we can append to it properly
    this.chatHistory.appendChild(messageEl);
    this.scrollToBottom();
    return messageEl;
  }

  private addToolUsage(toolName: string, toolInput: any) {
    if (this.currentAiMessage) {
      // Add tool usage inline with the current AI message (on new line)
      const toolText = `\n[ACCESSING: ${toolName.toUpperCase()}${toolInput && Object.keys(toolInput).length > 0 ? ` - ${JSON.stringify(toolInput)}` : ''}]`;
      this.currentAiMessage.innerHTML += `<span class="tool-usage-inline">${toolText}</span>`;
      this.scrollToBottom();
    }
  }

  private addToolResult(_toolName: string, _toolResult: any) {
    // Tool results are now handled silently - the AI will communicate any failures in its response
    // No visual feedback needed for tool execution status
  }

  private addSystemWarning(content: string) {
    if (this.currentAiMessage) {
      // Add system warning with clean yellow styling (on new line)
      const warningText = `\n\n${content}`;
      this.currentAiMessage.innerHTML += `<span style="color: #ffcc00; font-weight: bold;">${warningText}</span>`;
      this.scrollToBottom();
    }
  }

  private getSessionId(): string {
    let sessionId = localStorage.getItem('ship-ai-session');
    if (!sessionId) {
      sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ship-ai-session', sessionId);
    }
    return sessionId;
  }

  // Typewriter effect methods
  private addToTypewriterQueue(text: string, callback?: () => void) {
    this.typewriterQueue.push({ text, callback });
    if (!this.isTypewriting) {
      this.processTypewriterQueue();
    }
  }

  private processTypewriterQueue() {
    if (this.typewriterQueue.length === 0) {
      this.isTypewriting = false;
      return;
    }

    this.isTypewriting = true;
    const { text, callback } = this.typewriterQueue.shift()!;
    this.typewriteText(text, () => {
      if (callback) callback();
      this.processTypewriterQueue();
    });
  }

  private typewriteText(text: string, onComplete: () => void) {
    if (!this.currentAiMessage) return;
    
    let i = 0;
    const cursor = '<span class="typewriter-cursor">█</span>';
    
    const type = () => {
      if (i < text.length) {
        // Remove cursor, add character, add cursor back
        const currentContent = this.currentAiMessage!.innerHTML.replace(cursor, '');
        this.currentAiMessage!.innerHTML = currentContent + text.charAt(i) + cursor;
        i++;
        this.scrollToBottom();
        
        // Vary typing speed for more natural feel (20% faster)
        const delay = text.charAt(i-1) === ' ' ? 16 : 
                     text.charAt(i-1) === '.' ? 80 :
                     text.charAt(i-1) === ',' ? 40 :
                     Math.random() * 24 + 16;
        
        setTimeout(type, delay);
      } else {
        // Remove cursor when done
        const finalContent = this.currentAiMessage!.innerHTML.replace(cursor, '');
        this.currentAiMessage!.innerHTML = finalContent;
        onComplete();
      }
    };
    
    type();
  }

  private async restartGame() {
    try {
      // Get current session ID to clear it on the backend
      const sessionId = localStorage.getItem('ship-ai-session');
      
      // Clear session from backend if it exists
      if (sessionId) {
        await fetch(`/api/restart?sessionId=${encodeURIComponent(sessionId)}`, {
          method: 'POST'
        });
      }
      
      // Clear local session storage
      localStorage.removeItem('ship-ai-session');
      
      // Refresh the page for complete reset
      window.location.reload();
      
    } catch (error) {
      console.error('Error restarting game:', error);
      // Fallback: just clear local storage and refresh
      localStorage.removeItem('ship-ai-session');
      window.location.reload();
    }
  }

  private setupWinScreen() {
    // Setup restart harder button
    this.restartHarderBtn.addEventListener('click', () => {
      this.restartHarder();
    });

    // Setup full restart button  
    this.restartFullBtn.addEventListener('click', () => {
      this.restartGame();
    });
  }

  private async restartHarder() {
    try {
      const sessionId = localStorage.getItem('ship-ai-session');
      
      if (sessionId) {
        const response = await fetch(`/api/restart-harder?sessionId=${encodeURIComponent(sessionId)}`, {
          method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success && result.sessionId) {
          // Store new session ID
          localStorage.setItem('ship-ai-session', result.sessionId);
          
          // Hide win screen and refresh page for new game
          this.winScreen.style.display = 'none';
          window.location.reload();
        } else {
          console.error('Failed to restart with harder difficulty:', result);
          // Fallback to regular restart
          this.restartGame();
        }
      } else {
        // No session, fallback to regular restart
        this.restartGame();
      }
    } catch (error) {
      console.error('Error restarting with harder difficulty:', error);
      // Fallback to regular restart
      this.restartGame();
    }
  }

  private checkForWinCondition(data: any) {
    // Check if the AI response indicates game completion
    if (data.gameState && data.gameState.gamePhase === 'complete' && data.gameState.completionStats) {
      this.showWinScreen(data.gameState);
    }
  }

  private showWinScreen(gameState: any) {
    const { completionStats, difficulty } = gameState;
    
    // Format oxygen remaining time
    const oxygenElement = document.getElementById('win-oxygen-time') as HTMLElement;
    if (completionStats.oxygenRemaining && !completionStats.oxygenRemaining.isExpired) {
      oxygenElement.textContent = completionStats.oxygenRemaining.formatted;
    } else {
      oxygenElement.textContent = '00:00';
    }
    
    // Format total mission time
    const totalTimeElement = document.getElementById('win-total-time') as HTMLElement;
    if (completionStats.totalDuration) {
      const totalMinutes = Math.floor(completionStats.totalDuration / (1000 * 60));
      const totalSeconds = Math.floor((completionStats.totalDuration % (1000 * 60)) / 1000);
      totalTimeElement.textContent = `${totalMinutes.toString().padStart(2, '0')}:${totalSeconds.toString().padStart(2, '0')}`;
    } else {
      totalTimeElement.textContent = '--:--';
    }
    
    // Show difficulty level
    const difficultyElement = document.getElementById('win-difficulty') as HTMLElement;
    difficultyElement.textContent = `Level ${difficulty?.level || 0}`;
    
    // Update button text based on difficulty
    if (difficulty?.level >= 4) {
      // At maximum difficulty (1 minute oxygen)
      this.restartHarderBtn.textContent = '🔥 Ultimate Challenge (1 min)';
    } else {
      const nextOxygenTime = Math.max(18 - ((difficulty?.level + 1) * 5), 1);
      this.restartHarderBtn.textContent = `🚀 Harder Challenge (${nextOxygenTime} min)`;
    }
    
    // Show the win screen
    this.winScreen.style.display = 'flex';
    
    console.log('🎉 Win screen displayed!', { gameState });
  }

  /**
   * Update the cost display with new session cost data
   * @param costData - Cost data from cost_update event
   */
  private updateCostDisplay(costData: any) {
    // Show the cost display if hidden
    this.costDisplay.style.display = 'block';
    
    // Update cost amount
    this.sessionCost.textContent = costData.formattedCost || '$0.00';
    
    // Update token count
    this.sessionTokens.textContent = `${costData.formattedTokens || '0'} tokens`;
  }
}

// Initialize terminal when page loads
document.addEventListener('DOMContentLoaded', () => {
  new Terminal();
});

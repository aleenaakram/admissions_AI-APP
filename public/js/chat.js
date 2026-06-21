class ChatController {
  constructor() {
    this.messagesContainer = document.getElementById('chat-messages');
    this.inputField = document.getElementById('chat-input');
    this.sendButton = document.getElementById('chat-send');
    this.resetButton = document.querySelector('.reset-chat-btn');
    
    // Sidebar elements
    this.progressBar = document.getElementById('progress-bar');
    this.progressPercent = document.getElementById('progress-percent');
    this.qualificationAlert = document.getElementById('qualification-alert');
    
    this.fields = {
      fullName: { item: document.getElementById('field-fullName'), val: document.getElementById('val-fullName'), required: true },
      phoneNumber: { item: document.getElementById('field-phoneNumber'), val: document.getElementById('val-phoneNumber'), required: true },
      interest: { item: document.getElementById('field-interest'), val: document.getElementById('val-interest'), required: true },
      email: { item: document.getElementById('field-email'), val: document.getElementById('val-email'), required: false },
      city: { item: document.getElementById('field-city'), val: document.getElementById('val-city'), required: false },
      experienceLevel: { item: document.getElementById('field-experienceLevel'), val: document.getElementById('val-experienceLevel'), required: false }
    };

    this.isWaiting = false;
    this.setupEvents();
    this.initChat();
  }

  initChat() {
    this.messagesContainer.innerHTML = '';
    this.renderMessage("assistant", `Welcome to the Future Academy! I am your Admissions Assistant. I can communicate in English and Roman Urdu.\n\nTo help you discover courses and map out a personalized learning roadmap, let's start with a few questions. What is your name?\n\n*Urdu:* Future Academy mein khushamdeed! Main aapka Admissions Assistant hoon. Main English aur Roman Urdu mein baat kar sakta hoon. Aapka poora naam kya hai?`);
    
    // Reset Sidebar UI
    this.updateProgress({});
    this.qualificationAlert.classList.add('inactive');
  }

  setupEvents() {
    this.sendButton.addEventListener('click', () => this.sendMessage());
    this.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });

    this.resetButton.addEventListener('click', () => {
      if (confirm("Reset current conversation session? This starts a brand new application.")) {
        // Generate new session ID
        window.AdmissionsAI.sessionId = 'sess-' + Math.random().toString(36).substring(2, 11);
        this.initChat();
        window.AdmissionsAI.logTerminal(`[SYSTEM] Session reset. New session established: ${window.AdmissionsAI.sessionId}`, 'system');
      }
    });
  }

  renderMessage(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `message message-${sender}`;
    
    // Simple line break and markdown replacement for bold/bullet points
    let formattedText = text
      .replace(/\n/g, '<br>')
      .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
      .replace(/✓/g, '<span style="color:#10b981">✓</span>');
      
    bubble.innerHTML = formattedText;
    
    this.messagesContainer.appendChild(bubble);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  showTyping() {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator message-assistant';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    
    this.messagesContainer.appendChild(indicator);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  hideTyping() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  async sendMessage() {
    const message = this.inputField.value.trim();
    if (!message || this.isWaiting) return;
    
    this.inputField.value = '';
    this.renderMessage('user', message);
    
    this.isWaiting = true;
    this.showTyping();
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: window.AdmissionsAI.sessionId,
          message: message,
          settings: window.AdmissionsAI.settings
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server returned error: ${response.status}`);
      }
      
      const data = await response.json();
      
      this.hideTyping();
      this.renderMessage('assistant', data.reply);
      
      // Update sidebar state
      this.updateProgress(data.extractedInfo);
      
      if (data.isQualified) {
        this.qualificationAlert.classList.remove('inactive');
      }

    } catch (error) {
      console.error("Chat Error:", error);
      this.hideTyping();
      this.renderMessage('assistant', "I apologize, but I encountered an error connecting to the server. Please verify the backend logs.");
    } finally {
      this.isWaiting = false;
    }
  }

  updateProgress(extractedInfo) {
    let completedCount = 0;
    let requiredCaptured = 0;
    const totalRequired = 3;
    const totalOptional = 3;

    // Standard fields scan
    for (const [key, field] of Object.entries(this.fields)) {
      const val = extractedInfo[key];
      if (val && val !== 'N/A' && val !== 'Not Captured') {
        field.item.classList.add('completed');
        field.val.textContent = val;
        
        if (field.required) requiredCaptured++;
        completedCount++;
      } else {
        field.item.classList.remove('completed');
        field.val.textContent = 'Not Captured';
      }
    }

    // Custom Percentage formulation: 
    // Each required is 25% (total 75%), each optional is 8.33% (total 25%)
    let pct = 0;
    for (const [key, field] of Object.entries(this.fields)) {
      const val = extractedInfo[key];
      if (val && val !== 'N/A' && val !== 'Not Captured') {
        if (field.required) {
          pct += 25;
        } else {
          pct += 8.33;
        }
      }
    }
    
    pct = Math.min(Math.round(pct), 100);
    this.progressBar.style.width = `${pct}%`;
    this.progressPercent.textContent = `${pct}% Qualified`;
  }
}

// Bind chat controller to window scope
document.addEventListener('DOMContentLoaded', () => {
  window.ChatHandler = new ChatController();
});

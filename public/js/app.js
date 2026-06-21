// Global state and configurations
window.AdmissionsAI = {
  // Generates unique Session IDs per browser load
  sessionId: 'sess-' + Math.random().toString(36).substring(2, 11),
  
  // Settings Object (Synchronized with LocalStorage)
  settings: {
    aiProvider: 'gemini',
    geminiKey: '',
    openaiKey: '',
    gateway: 'none',
    twilioSid: '',
    twilioToken: '',
    twilioFrom: '',
    twilioTo: '',
    whatsappToken: '',
    whatsappPhoneId: '',
    whatsappTo: ''
  },

  // Log broker
  initSSE() {
    console.log("[SSE Init] Connecting to server log broker...");
    const eventSource = new EventSource('/api/logs');
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.handleSSEEvent(payload);
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("SSE connection interrupted. Reconnecting in 5s...");
      eventSource.close();
      setTimeout(() => this.initSSE(), 5000);
    };
  },

  handleSSEEvent(event) {
    const { type, data, timestamp } = event;
    const timeStr = new Date(timestamp).toLocaleTimeString();
    
    switch (type) {
      case 'chat_received':
        this.logTerminal(`[${timeStr}] [INCOMING] Received chat from user: "${data.message}"`, 'info');
        window.WorkflowHandler.highlightNode('node-chat');
        window.WorkflowHandler.highlightLink('link-chat-parser');
        break;
        
      case 'llm_invoke_start':
        this.logTerminal(`[${timeStr}] [AI ROUTER] Invoking LLM Completion via provider: "${data.provider}"`, 'info');
        window.WorkflowHandler.highlightNode('node-parser');
        window.WorkflowHandler.highlightLink('link-parser-llm');
        break;

      case 'llm_invoke_fallback':
        this.logTerminal(`[${timeStr}] [AI FALLBACK] ${data.reason}`, 'warning');
        // If fallback is due to API error (not just missing key), show a banner in the chat
        if (data.reason && data.reason.includes('failed')) {
          this.showChatBanner(
            '⚠️ AI API Error — running in Local Mode. Go to API Settings to fix or clear your key.',
            'warning'
          );
        }
        break;
        
      case 'llm_invoke_success':
        this.logTerminal(`[${timeStr}] [AI RESPONSE] Extracted variables: Name="${data.extracted.fullName || 'N/A'}", Phone="${data.extracted.phoneNumber || 'N/A'}", Interest="${data.extracted.interest || 'N/A'}"`, 'success');
        window.WorkflowHandler.highlightNode('node-llm');
        break;

      case 'llm_invoke_error':
        this.logTerminal(`[${timeStr}] [AI ERROR] LLM execution failed: ${data.error}`, 'error');
        break;
        
      case 'db_save_start':
        this.logTerminal(`[${timeStr}] [DATABASE] Qualifying Lead! Storing details for student: ${data.name}...`, 'info');
        window.WorkflowHandler.highlightLink('link-llm-db');
        break;
        
      case 'db_save_success':
        this.logTerminal(`[${timeStr}] [DATABASE SUCCESS] Lead saved in leads.json. Total leads: ${data.count}`, 'success');
        window.WorkflowHandler.highlightNode('node-db');
        // Refresh CRM grid
        if (window.CRMHandler) window.CRMHandler.fetchLeads();
        break;
        
      case 'whatsapp_send_start':
        this.logTerminal(`[${timeStr}] [WHATSAPP ROUTE] Dispatching notification webhook to provider: "${data.provider}"`, 'info');
        window.WorkflowHandler.highlightLink('link-llm-wa');
        break;
        
      case 'whatsapp_send_success':
        if (data.success) {
          const detail = data.provider === 'mock' ? 'Visual Mock Screen updated' : `API status OK. ID: ${data.response?.sid || data.response?.messages?.[0]?.id || 'N/A'}`;
          this.logTerminal(`[${timeStr}] [WHATSAPP SUCCESS] Dispatched successfully via ${data.provider}. Details: ${detail}`, 'success');
          window.WorkflowHandler.highlightNode('node-wa');
          // Add notification to mock phone
          window.WorkflowHandler.addMockWhatsAppMessage(data.body);
        } else {
          this.logTerminal(`[${timeStr}] [WHATSAPP ERROR] Failed to dispatch via ${data.provider}: ${data.error}`, 'error');
        }
        break;
    }
  },

  logTerminal(message, type = 'system') {
    const terminal = document.getElementById('logs-terminal-body');
    if (!terminal) return;
    
    const line = document.createElement('div');
    line.className = `terminal-line ${type}-line`;
    line.textContent = message;
    
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
  },

  showChatBanner(message, type = 'warning') {
    // Remove any existing banner
    const existing = document.getElementById('chat-api-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'chat-api-banner';
    banner.style.cssText = `
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12.5px;
      color: #fde68a;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 8px 0;
      animation: fadeIn 0.3s ease;
    `;
    banner.innerHTML = `
      <span>${message}</span>
      <button onclick="clearAllApiKeys(); document.getElementById('chat-api-banner')?.remove();" 
        style="margin-left:auto; background:rgba(245,158,11,0.2); border:1px solid rgba(245,158,11,0.4); 
               color:#fde68a; padding:4px 10px; border-radius:5px; cursor:pointer; font-size:11px; white-space:nowrap;">
        Clear Key &amp; Fix
      </button>
    `;
    const container = document.getElementById('chat-messages');
    if (container) {
      container.prepend(banner);
    }
  }
};

// Handle Settings Load / Save
const STORAGE_KEY = 'admissions_ai_settings';
function loadSettings() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      window.AdmissionsAI.settings = { ...window.AdmissionsAI.settings, ...JSON.parse(data) };
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(window.AdmissionsAI.settings));
}

function clearAllApiKeys() {
  window.AdmissionsAI.settings.geminiKey = '';
  window.AdmissionsAI.settings.openaiKey = '';
  saveSettings();
  // Clear the input fields
  const geminiKeyEl = document.getElementById('settings-gemini-key');
  const openaiKeyEl = document.getElementById('settings-openai-key');
  if (geminiKeyEl) geminiKeyEl.value = '';
  if (openaiKeyEl) openaiKeyEl.value = '';
  // Show a success message
  const indicator = document.getElementById('settings-save-success');
  if (indicator) {
    indicator.textContent = '✓ API Keys cleared! Using local engine.';
    indicator.classList.add('show');
    setTimeout(() => {
      indicator.classList.remove('show');
      indicator.textContent = '✓ Settings Saved locally!';
    }, 3000);
  }
  window.AdmissionsAI.logTerminal('[SETTINGS] API keys cleared. Chatbot now using local NLP engine.', 'warning');
}

// Bind Settings DOM Elements
function setupSettingsUI() {
  const provider = document.getElementById('settings-provider');
  const geminiKey = document.getElementById('settings-gemini-key');
  const openaiKey = document.getElementById('settings-openai-key');
  const geminiGroup = document.getElementById('settings-gemini-group');
  const openaiGroup = document.getElementById('settings-openai-group');
  
  const gateway = document.getElementById('settings-gateway');
  const twilioFields = document.getElementById('gateway-twilio-fields');
  const cloudFields = document.getElementById('gateway-cloud-fields');
  
  const twilioSid = document.getElementById('settings-twilio-sid');
  const twilioToken = document.getElementById('settings-twilio-token');
  const twilioFrom = document.getElementById('settings-twilio-from');
  const twilioTo = document.getElementById('settings-twilio-to');
  
  const cloudToken = document.getElementById('settings-cloud-token');
  const cloudPhoneId = document.getElementById('settings-cloud-phoneid');
  const cloudTo = document.getElementById('settings-cloud-to');
  
  const saveBtn = document.getElementById('save-settings-btn');
  const saveSuccess = document.getElementById('settings-save-success');

  // Load state to inputs
  provider.value = window.AdmissionsAI.settings.aiProvider;
  geminiKey.value = window.AdmissionsAI.settings.geminiKey;
  openaiKey.value = window.AdmissionsAI.settings.openaiKey;
  
  gateway.value = window.AdmissionsAI.settings.gateway;
  twilioSid.value = window.AdmissionsAI.settings.twilioSid;
  twilioToken.value = window.AdmissionsAI.settings.twilioToken;
  twilioFrom.value = window.AdmissionsAI.settings.twilioFrom;
  twilioTo.value = window.AdmissionsAI.settings.twilioTo;
  
  cloudToken.value = window.AdmissionsAI.settings.whatsappToken;
  cloudPhoneId.value = window.AdmissionsAI.settings.whatsappPhoneId;
  cloudTo.value = window.AdmissionsAI.settings.whatsappTo;

  // Toggle Visibility Helper
  function toggleInputs() {
    // Provider
    if (provider.value === 'gemini') {
      geminiGroup.classList.remove('hidden');
      openaiGroup.classList.add('hidden');
    } else {
      geminiGroup.classList.add('hidden');
      openaiGroup.classList.remove('hidden');
    }
    
    // Gateway
    if (gateway.value === 'twilio') {
      twilioFields.classList.remove('hidden');
      cloudFields.classList.add('hidden');
    } else if (gateway.value === 'whatsapp_cloud') {
      twilioFields.classList.add('hidden');
      cloudFields.classList.remove('hidden');
    } else {
      twilioFields.classList.add('hidden');
      cloudFields.classList.add('hidden');
    }
  }

  provider.addEventListener('change', toggleInputs);
  gateway.addEventListener('change', toggleInputs);
  toggleInputs();

  // Save Event
  saveBtn.addEventListener('click', () => {
    window.AdmissionsAI.settings = {
      aiProvider: provider.value,
      geminiKey: geminiKey.value.trim(),
      openaiKey: openaiKey.value.trim(),
      gateway: gateway.value,
      twilioSid: twilioSid.value.trim(),
      twilioToken: twilioToken.value.trim(),
      twilioFrom: twilioFrom.value.trim(),
      twilioTo: twilioTo.value.trim(),
      whatsappToken: cloudToken.value.trim(),
      whatsappPhoneId: cloudPhoneId.value.trim(),
      whatsappTo: cloudTo.value.trim()
    };
    
    saveSettings();
    
    // Update node details
    const providerText = provider.value === 'gemini' ? 'Google Gemini' : 'OpenAI GPT';
    document.getElementById('node-llm-provider').textContent = providerText;
    
    saveSuccess.classList.add('show');
    setTimeout(() => {
      saveSuccess.classList.remove('show');
    }, 2500);
  });

  // Add Clear Keys button dynamically
  const clearKeysBtn = document.createElement('button');
  clearKeysBtn.className = 'btn btn-secondary';
  clearKeysBtn.style.cssText = 'margin-left: 12px; border-color: rgba(239,68,68,0.3); color: #fca5a5;';
  clearKeysBtn.textContent = 'Clear API Keys';
  clearKeysBtn.addEventListener('click', clearAllApiKeys);
  saveBtn.parentElement.appendChild(clearKeysBtn);
}

// Tab Switching Routing
function setupTabRouting() {
  const tabs = document.querySelectorAll('.nav-item');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const activeTabName = tab.getAttribute('data-tab');
      
      // Update sidebar
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update Panel visibility
      panels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.getAttribute('id') === `tab-${activeTabName}`) {
          panel.classList.add('active');
        }
      });
      
      // Hook: CRM fetch
      if (activeTabName === 'crm') {
        window.CRMHandler.fetchLeads();
      }
    });
  });
}

// Global App entrypoint
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupSettingsUI();
  setupTabRouting();
  window.AdmissionsAI.initSSE();
  
  // Set node provider text initially
  const providerText = window.AdmissionsAI.settings.aiProvider === 'gemini' ? 'Google Gemini' : 'OpenAI GPT';
  document.getElementById('node-llm-provider').textContent = providerText;
  
  // Clear Logs Btn
  document.getElementById('clear-logs-btn').addEventListener('click', () => {
    document.getElementById('logs-terminal-body').innerHTML = '<div class="terminal-line system-line">[LOGS CLEARED] Listening for new triggers...</div>';
  });
});

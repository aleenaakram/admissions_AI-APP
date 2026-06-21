class WorkflowController {
  constructor() {
    this.phoneScreen = document.getElementById('whatsapp-screen-messages');
    this.emptyHint = document.getElementById('wa-empty-hint');
  }

  highlightNode(nodeId) {
    const node = document.getElementById(nodeId);
    if (!node) return;

    node.classList.add('active');
    
    // Pulse animation clear after duration
    setTimeout(() => {
      node.classList.remove('active');
    }, 2500);
  }

  highlightLink(linkId) {
    const link = document.getElementById(linkId);
    if (!link) return;

    link.classList.add('active');
    
    setTimeout(() => {
      link.classList.remove('active');
    }, 2500);
  }

  addMockWhatsAppMessage(text) {
    if (this.emptyHint) {
      this.emptyHint.classList.add('hidden');
    }

    const bubble = document.createElement('div');
    bubble.className = 'wa-message-out';
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Format ticks and breaks in WhatsApp view
    const formatted = text
      .replace(/\n/g, '<br>')
      .replace(/✓/g, '✅')
      .replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
      
    bubble.innerHTML = `
      ${formatted}
      <span class="msg-time">${timeStr}</span>
    `;

    this.phoneScreen.appendChild(bubble);
    this.phoneScreen.scrollTop = this.phoneScreen.scrollHeight;

    // Small vibration pulse simulation to phone card
    const phone = document.querySelector('.phone-case');
    if (phone) {
      phone.style.animation = 'phoneShake 0.4s ease';
      setTimeout(() => {
        phone.style.animation = '';
      }, 400);
    }
  }
}

// Add CSS shake animation dynamically if needed
const style = document.createElement('style');
style.textContent = `
  @keyframes phoneShake {
    0%, 100% { transform: rotate(0deg) scale(1); }
    25% { transform: rotate(1deg) scale(1.01); }
    75% { transform: rotate(-1deg) scale(1.01); }
  }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
  window.WorkflowHandler = new WorkflowController();
});

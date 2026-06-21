class CRMController {
  constructor() {
    this.tableBody = document.getElementById('crm-table-body');
    this.emptyState = document.getElementById('crm-empty-state');
    this.searchInput = document.getElementById('crm-search');
    this.interestFilter = document.getElementById('crm-filter-interest');
    
    this.clearBtn = document.getElementById('clear-crm-btn');
    this.refreshBtn = document.getElementById('refresh-crm-btn');
    
    // Stats elements
    this.statTotal = document.getElementById('crm-stat-total');
    this.statPopular = document.getElementById('crm-stat-popular');
    this.statTime = document.getElementById('crm-stat-time');
    this.statDate = document.getElementById('crm-stat-date');
    
    // Modal Elements
    this.modal = document.getElementById('lead-modal');
    this.modalClose = document.getElementById('modal-close');
    
    this.leadsList = [];
    this.setupEvents();
  }

  setupEvents() {
    this.refreshBtn.addEventListener('click', () => this.fetchLeads());
    this.clearBtn.addEventListener('click', () => this.clearCRM());
    this.searchInput.addEventListener('input', () => this.renderLeads());
    this.interestFilter.addEventListener('change', () => this.renderLeads());
    
    this.modalClose.addEventListener('click', () => this.closeModal());
    window.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }

  async fetchLeads() {
    try {
      const response = await fetch('/api/leads');
      if (!response.ok) throw new Error("Failed to fetch leads");
      
      this.leadsList = await response.json();
      this.calculateStats();
      this.renderLeads();
    } catch (error) {
      console.error("CRM Fetch Error:", error);
      window.AdmissionsAI.logTerminal(`[CRM ERROR] Failed to fetch leads: ${error.message}`, 'error');
    }
  }

  calculateStats() {
    const total = this.leadsList.length;
    this.statTotal.textContent = total;
    
    if (total === 0) {
      this.statPopular.textContent = 'N/A';
      this.statTime.textContent = '-- : --';
      this.statDate.textContent = 'No recent submissions';
      return;
    }

    // Determine Top Interest
    const counts = {};
    this.leadsList.forEach(lead => {
      counts[lead.interest] = (counts[lead.interest] || 0) + 1;
    });
    
    let popularInterest = 'N/A';
    let maxCount = 0;
    for (const [interest, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        popularInterest = interest;
      }
    }
    
    this.statPopular.textContent = popularInterest;

    // Last Activity Time
    const lastLead = this.leadsList[0];
    const d = new Date(lastLead.timestamp);
    this.statTime.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.statDate.textContent = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  getBadgeClass(interest) {
    switch (interest) {
      case 'AI & Automation': return 'badge-ai';
      case 'Social Media Marketing': return 'badge-marketing';
      case 'Graphic Design': return 'badge-design';
      case 'Video Editing': return 'badge-video';
      case 'Web Development': return 'badge-web';
      case 'App Development': return 'badge-app';
      default: return 'badge-other';
    }
  }

  renderLeads() {
    const query = this.searchInput.value.toLowerCase().trim();
    const courseFilter = this.interestFilter.value;
    
    // Filter logic
    const filtered = this.leadsList.filter(lead => {
      const matchesSearch = 
        lead.name.toLowerCase().includes(query) ||
        lead.phone.includes(query) ||
        lead.email.toLowerCase().includes(query);
        
      const matchesCourse = courseFilter === '' || lead.interest === courseFilter;
      
      return matchesSearch && matchesCourse;
    });

    this.tableBody.innerHTML = '';
    
    if (filtered.length === 0) {
      this.emptyState.classList.remove('hidden');
      return;
    }
    
    this.emptyState.classList.add('hidden');

    filtered.forEach(lead => {
      const tr = document.createElement('tr');
      const timeStr = new Date(lead.timestamp).toLocaleString();
      
      tr.innerHTML = `
        <td>${timeStr}</td>
        <td><strong>${lead.name}</strong></td>
        <td>
          <div class="crm-contact-cell">
            <span>📞 ${lead.phone}</span>
            <small>📧 ${lead.email}</small>
          </div>
        </td>
        <td><span class="badge ${this.getBadgeClass(lead.interest)}">${lead.interest}</span></td>
        <td>
          <button class="btn btn-secondary btn-small view-details-btn">View Outline</button>
          <button class="btn btn-icon btn-small delete-lead-btn" style="color: #ef4444; border-color: rgba(239,68,68,0.2);" title="Delete Record">×</button>
        </td>
      `;
      
      // Bind Detail Modal Click
      tr.querySelector('.view-details-btn').addEventListener('click', () => {
        this.openModal(lead);
      });
      
      // Bind Delete Click
      tr.querySelector('.delete-lead-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete lead: ${lead.name}?`)) {
          this.deleteLead(lead.id);
        }
      });

      this.tableBody.appendChild(tr);
    });
  }

  async deleteLead(id) {
    try {
      const response = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error("Failed to delete lead");
      
      window.AdmissionsAI.logTerminal(`[CRM] Lead record deleted: ${id}`, 'system');
      this.fetchLeads();
    } catch (error) {
      console.error(error);
      window.AdmissionsAI.logTerminal(`[CRM ERROR] Failed to delete: ${error.message}`, 'error');
    }
  }

  async clearCRM() {
    if (confirm("WARNING: Are you sure you want to clear the entire CRM database? This cannot be undone.")) {
      try {
        const response = await fetch('/api/leads/clear', { method: 'POST' });
        if (!response.ok) throw new Error("Failed to clear leads");
        
        window.AdmissionsAI.logTerminal(`[CRM] Database cleared successfully.`, 'system');
        this.fetchLeads();
      } catch (error) {
        console.error(error);
        window.AdmissionsAI.logTerminal(`[CRM ERROR] Clear failed: ${error.message}`, 'error');
      }
    }
  }

  openModal(lead) {
    document.getElementById('modal-lead-name').textContent = `Student Detail File: ${lead.name}`;
    document.getElementById('modal-lead-phone').textContent = lead.phone;
    document.getElementById('modal-lead-email').textContent = lead.email;
    
    const badge = document.getElementById('modal-lead-interest');
    badge.className = `badge ${this.getBadgeClass(lead.interest)}`;
    badge.textContent = lead.interest;
    
    document.getElementById('modal-lead-timestamp').textContent = new Date(lead.timestamp).toLocaleString();
    document.getElementById('modal-lead-summary').textContent = lead.summary;
    
    // Roadmap layout
    const roadmapContainer = document.getElementById('modal-lead-roadmap');
    roadmapContainer.innerHTML = '';
    
    if (lead.roadmap && lead.roadmap.modules) {
      lead.roadmap.modules.forEach(m => {
        const modDiv = document.createElement('div');
        modDiv.className = 'timeline-module';
        
        const topicsLi = m.topics.map(t => `<li>${t}</li>`).join('');
        modDiv.innerHTML = `
          <h5>${m.title}</h5>
          <ul>${topicsLi}</ul>
        `;
        
        roadmapContainer.appendChild(modDiv);
      });
      
      document.getElementById('modal-lead-capstone').classList.remove('hidden');
      document.getElementById('modal-lead-capstone-text').textContent = lead.roadmap.finalProject || "Design a capstone project.";
    } else {
      document.getElementById('modal-lead-capstone').classList.add('hidden');
      roadmapContainer.innerHTML = '<p>No details parsed in roadmap outline.</p>';
    }

    this.modal.classList.add('active');
  }

  closeModal() {
    this.modal.classList.remove('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.CRMHandler = new CRMController();
});

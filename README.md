# Admissions AI - Student Admissions Assistant & CRM Hub

Admissions AI is a premium, fully-functional, self-contained AI-powered admissions chatbot and CRM platform built with Node.js and Express. It naturally communicates with prospective students in **English and Roman Urdu**, dynamically generates customized 4-module learning roadmaps, captures lead information, stores leads in a CRM Dashboard, and automates WhatsApp message notifications.

The system is designed with a **Workflow Pipeline & Live Logs** dashboard that visualizes data flows in real-time and displays live API logs and a WhatsApp mobile screen simulator.

---

## Key Features

1. **Multilingual AI Conversational Chatbot**:
   - Seamlessly detects and replies in English or Roman Urdu (e.g., "mujhe AI seekhni hai" -> Urdu response).
   - Converses naturally to qualify student requirements step-by-step.
   - Monitors captured fields in real-time via a **Live Data Capture** extraction sidebar.

2. **Dynamic Personalized Course Recommendation**:
   - The LLM constructs custom 4-module course syllabi and final capstone projects based on student goals, experience, and interests. No hardcoded paths.

3. **Custom CRM Dashboard**:
   - Lists qualified leads with timestamps, contact info, interest badges, and actions.
   - Computes real-time KPI metrics (Total Leads, Popular Course, Last Activity).
   - Features search querying, drop-down course filtering, record deletion, and database clearing.
   - Displays a slide-out modal drawer detailing the AI conversation summary and the personalized roadmap.

4. **Interactive Workflow and WhatsApp Simulator**:
   - Features an SVG-based workflow pipeline that animates and glows as events occur (e.g. Chat -> AI Extract -> CRM Save -> WhatsApp Send).
   - Displays a mock smartphone interface showing the actual formatted template sent to the student's phone.
   - Embeds a live SSE (Server-Sent Events) log terminal printing formatted JSON payloads.

5. **Flexible Integration & Settings**:
   - Switch AI engines (Google Gemini or OpenAI GPT models) directly from the UI.
   - Connect Twilio Sandbox or WhatsApp Cloud API (Meta Developer Account) for live WhatsApp messaging.
   - Falls back to a local NLP keyword classifier if no API keys are provided, keeping the application 100% functional and interactive out-of-the-box.

---

## File Structure

```
├── server.js              # Express server, LLM integration, file DB, and SSE log broker
├── package.json           # Project dependencies & npm dev/start scripts
├── .env                   # Live environment configuration keys
├── .env.example           # Template environment file
├── database/
│   └── leads.json         # File-based JSON database (stores captured leads)
└── public/
    ├── index.html         # Main dashboard markup (Chatbot, CRM, Workflow, Settings)
    ├── css/
    │   └── style.css      # Custom stylesheet (glassmorphism UI tokens & animation styles)
    └── js/
        ├── app.js         # Core routing, LocalStorage configs, and SSE stream receiver
        ├── chat.js        # Chat UI rendering, input triggers, and progress trackers
        ├── crm.js         # Leads table controller, filters, KPIs, and detail drawers
        └── workflow.js    # Node pulse lights and simulated WhatsApp bubble injector
```

---

## Quick Start Setup

### 1. Installation
Ensure you have Node.js (v18+) installed. Clone/navigate to the project directory and install the packages:
```bash
npm install
```

### 2. Configure Environment Variables (Optional)
Copy `.env.example` to a new `.env` file and input your keys, or configure them dynamically in the dashboard's **API Settings** tab:
```bash
cp .env.example .env
```

### 3. Launch Server
Start the development server:
```bash
npm run start
```
The server will boot up at **`http://localhost:5000`**.

---

## API Documentation

### 1. Chat Interaction
- **Endpoint**: `POST /api/chat`
- **Body JSON**:
  ```json
  {
    "sessionId": "sess-xyz123",
    "message": "mujhe AI seekhni hai",
    "settings": {
      "aiProvider": "gemini",
      "geminiKey": "AIzaSy..."
    }
  }
  ```
- **Response JSON**:
  ```json
  {
    "reply": "Zabardast! AI mein kis type ki specialization mein interest hai?",
    "extractedInfo": {
      "fullName": null,
      "phoneNumber": null,
      "interest": "AI & Automation",
      "email": null,
      "city": null,
      "experienceLevel": null
    },
    "isQualified": false,
    "roadmap": null
  }
  ```

### 2. Fetch Leads
- **Endpoint**: `GET /api/leads`
- **Response**: Array of captured qualified student profiles including name, phone, email, interest, roadmap, AI summary, and timestamp.

### 3. Clear Leads
- **Endpoint**: `POST /api/leads/clear`
- **Response**: `{ "success": true, "message": "CRM database cleared." }`

### 4. Delete Lead
- **Endpoint**: `DELETE /api/leads/:id`
- **Response**: `{ "success": true, "message": "Lead deleted." }`

### 5. Live Logs SSE Broker
- **Endpoint**: `GET /api/logs`
- **Response**: Event-Stream connection broadcasting event payloads (`chat_received`, `llm_invoke_start`, `llm_invoke_success`, `db_save_success`, `whatsapp_send_success`).

---

## WhatsApp Gateway Setup

### Method A: Twilio Sandbox (Recommended for Testing)
1. Go to your **Twilio Console** and retrieve your **Account SID** and **Auth Token**.
2. Navigate to **Messaging > Try it Out > Send a WhatsApp Message** to configure the WhatsApp Sandbox.
3. Note the Twilio Sandbox WhatsApp number (e.g. `+14155238886`) and send the join code (e.g., `join word-word`) from your phone to connect.
4. Input these credentials into the **API Settings** panel in our application, configure your number as the recipient, and save settings.
5. Converse with the chatbot. Once qualified, a real WhatsApp notification will be sent to your device!

### Method B: WhatsApp Cloud API (Meta Developers)
1. Log in to the **Meta Developer Portal** and create a Business App.
2. Set up **WhatsApp Product** inside the app.
3. Copy the **Temporary/Permanent Access Token** and your **Phone Number ID**.
4. Configure your recipient number in the developer sandbox.
5. Save these configurations in our application settings. Note that sending template messages requires setting up a matching approved template (e.g., named `admissions_welcome`).

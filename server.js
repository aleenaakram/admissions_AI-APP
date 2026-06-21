const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create database directory if it doesn't exist
const DB_DIR = path.join(__dirname, 'database');
const DB_FILE = path.join(DB_DIR, 'leads.json');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR);
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

// Global In-Memory Sessions
const sessions = new Map();

// SSE Clients for real-time logs
let sseClients = [];

// SSE Endpoint
app.get('/api/logs', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  
  sseClients.push(res);
  
  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Broadcast event to SSE clients
function broadcastEvent(type, data) {
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    client.write(`data: ${payload}\n\n`);
  });
  console.log(`[SSE Broadcast] ${type}:`, JSON.stringify(data).slice(0, 120) + '...');
}

// System Prompt for the LLM
const SYSTEM_PROMPT = `
You are the AI Admissions Assistant for the "Future Academy".
Your goal is to converse with prospective students, understand their interests, qualify them, and dynamically generate a personalized 4-module learning roadmap with a final project once they are qualified.

RULES:
1. MULTILINGUAL:
   - Detect the user's language. If they speak English, reply in English.
   - If they speak Roman Urdu (e.g. "mujhe admission lena hai", "AI seekhni hai"), reply in Roman Urdu. Keep the tone friendly, conversational, and natural.
   - Respond in the same language/style as the user.
2. QUALIFICATION & LEAD CAPTURE:
   - You must collect the following details. Do NOT ask for them all at once! Ask naturally.
     - Required: Full Name, Phone Number, Area of Interest.
     - Optional: Email Address, City, Experience Level.
   - Possible fields of Interest:
     - AI & Automation
     - Social Media Marketing
     - Graphic Design
     - Video Editing
     - Web Development
     - App Development
     - Other
   - If their interest is not in the list, categorize as "Other" but ask details.
3. CONVERSATIONAL FLOW:
   - Do NOT say "Here is a list of questions to answer".
   - Start with a warm greeting. If the student states an interest, acknowledge it and ask for their name, then phone number, then other fields naturally.
   - Maintain context. Respond to their queries about courses, career prospects, etc.
4. ROADMAP GENERATION (Only when Qualified):
   - You are qualified once you have at least Name, Phone Number, and Area of Interest.
   - Once qualified, you MUST generate a personalized course recommendation with 4 modules and a final project, tailored to their background and goals.
   - The roadmap must NOT be hardcoded. It must be dynamically customized.
5. RESPONSE FORMAT:
   - You must ALWAYS reply with a valid JSON object matching the JSON schema.
   - Do not include any markdown backticks (\`\`\`json ... \`\`\`) in your response text, return ONLY the raw JSON string.

JSON Schema to return:
{
  "reply": "friendly response to user in their language (either Roman Urdu or English)",
  "extractedInfo": {
    "fullName": "Name if found, else null",
    "phoneNumber": "Phone number if found, else null",
    "interest": "One of the interests listed or Other, if discovered, else null",
    "email": "Email if found, else null",
    "city": "City if found, else null",
    "experienceLevel": "Experience level if found, else null"
  },
  "isQualified": true/false (set to true ONLY when fullName, phoneNumber, and interest are all captured),
  "summary": "Short 1-2 sentence lead summary (only when isQualified is true, else null)",
  "roadmap": {
    "modules": [
      {
        "title": "Module 1 title",
        "topics": ["topic 1", "topic 2"]
      },
      {
        "title": "Module 2 title",
        "topics": ["topic 1", "topic 2"]
      },
      {
        "title": "Module 3 title",
        "topics": ["topic 1", "topic 2"]
      },
      {
        "title": "Module 4 title",
        "topics": ["topic 1", "topic 2"]
      }
    ],
    "finalProject": "Title and brief description of final project"
  } (only generate when isQualified is true, else null)
}
`;

// Helper: Mock LLM engine fallback if no API keys are provided
function mockChatEngine(message, session) {
  const history = session.history;
  const lowerMsg = message.toLowerCase();
  
  // Track language preference in the session state
  if (lowerMsg.includes('urdu') || lowerMsg.includes('roman') || lowerMsg.includes('m baat') || lowerMsg.includes('urdu m')) {
    session.language = 'urdu';
  } else if (lowerMsg.includes('english') || lowerMsg.includes('eng')) {
    session.language = 'english';
  }
  
  // Default detection if not set
  if (!session.language) {
    const detectsUrdu = lowerMsg.match(/(?:mujhe|hai|seekhni|seekhna|karna|naam|rabta|kia|kya|kese|kaise|he|ap|baat|kry|kryan)/i);
    if (detectsUrdu) {
      session.language = 'urdu';
    } else {
      session.language = 'english';
    }
  }
  
  const isRomanUrdu = session.language === 'urdu';
  
  // Extract info from history
  const info = {
    fullName: null,
    phoneNumber: null,
    interest: null,
    email: null,
    city: null,
    experienceLevel: null
  };
  
  // Scan history for captured info
  history.forEach(h => {
    if (h.extracted) {
      Object.assign(info, h.extracted);
    }
  });

  // Extract from current message
  if (lowerMsg.includes('ai') || lowerMsg.includes('automation') || lowerMsg.includes('n8n')) {
    info.interest = 'AI & Automation';
  } else if (lowerMsg.includes('marketing') || lowerMsg.includes('social') || lowerMsg.includes('fb') || lowerMsg.includes('smm')) {
    info.interest = 'Social Media Marketing';
  } else if (lowerMsg.includes('design') || lowerMsg.includes('graphic') || lowerMsg.includes('photoshop') || lowerMsg.includes('illustrator')) {
    info.interest = 'Graphic Design';
  } else if (lowerMsg.includes('web') || lowerMsg.includes('html') || lowerMsg.includes('react') || lowerMsg.includes('javascript') || lowerMsg.includes('css')) {
    info.interest = 'Web Development';
  } else if (lowerMsg.includes('video') || lowerMsg.includes('editing') || lowerMsg.includes('premiere')) {
    info.interest = 'Video Editing';
  } else if (lowerMsg.includes('app') || lowerMsg.includes('flutter') || lowerMsg.includes('android') || lowerMsg.includes('ios')) {
    info.interest = 'App Development';
  }

  // Simple name extraction (e.g. "my name is ali" or "i am bilal" or just "ali")
  if (lowerMsg.match(/(?:my name is|i am|me\s+)?([a-z\s]{3,15})$/) && !info.fullName) {
    const match = message.match(/(?:my name is|i am|me\s+)?([A-Za-z\s]{3,15})$/i);
    if (match && !['yes', 'no', 'ai', 'marketing', 'design', 'hello', 'hi', 'salam', 'urdu', 'roman', 'english', 'baat'].includes(match[1].toLowerCase().trim())) {
      info.fullName = match[1].trim();
    }
  }
  // Alternate: if the user sends a single word after we asked for name
  if (history.length > 0 && history[history.length - 1].role === 'assistant') {
    const lastReply = history[history.length - 1].content.toLowerCase();
    if (lastReply.includes('name') || lastReply.includes('naam')) {
      if (message.split(' ').length <= 3) {
        const cleanName = message.replace(/(?:my name is|i am|me|naam|hai|mera)/gi, '').trim();
        if (cleanName.length > 2 && !cleanName.toLowerCase().includes('english') && !cleanName.toLowerCase().includes('urdu')) {
          info.fullName = cleanName;
        }
      }
    } else if (lastReply.includes('number') || lastReply.includes('phone') || lastReply.includes('rabta')) {
      const phoneMatch = message.match(/[\d\-+]{7,15}/);
      if (phoneMatch) {
        info.phoneNumber = phoneMatch[0];
      }
    } else if (lastReply.includes('email')) {
      const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        info.email = emailMatch[0];
      }
    }
  }

  // Scan phone number specifically
  const phoneMatch = message.match(/[\d\-+]{7,15}/);
  if (phoneMatch && !info.phoneNumber) {
    info.phoneNumber = phoneMatch[0];
  }

  // Scan email
  const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && !info.email) {
    info.email = emailMatch[0];
  }

  let reply = '';
  
  // Check if the user is asking to switch languages specifically
  const isLangSwitchRequest = lowerMsg.includes('speak') || lowerMsg.includes('talk') || lowerMsg.includes('baat') || lowerMsg.includes('kry');
  const justSwitchedLang = isLangSwitchRequest && history.length > 0 && 
    (lowerMsg.includes('urdu') || lowerMsg.includes('roman') || lowerMsg.includes('english'));

  if (!info.interest) {
    if (isRomanUrdu) {
      if (justSwitchedLang) {
        reply = "Bilkul! Main ab se Roman Urdu mein baat karoon ga. Aap kis course mein interest rakhte hain? Hum AI & Automation, Social Media Marketing, Graphic Design, Video Editing, aur Web/App Development offer karte hain.";
      } else {
        reply = "Aap kis course mein interest rakhte hain? Hum AI & Automation, Social Media Marketing, Graphic Design, Video Editing, aur Web/App Development offer karte hain.";
      }
    } else {
      if (justSwitchedLang) {
        reply = "Sure! I will speak in English. Which course are you interested in? We offer AI & Automation, Social Media Marketing, Graphic Design, Video Editing, and Web/App Development.";
      } else {
        reply = "Which course are you interested in? We offer AI & Automation, Social Media Marketing, Graphic Design, Video Editing, and Web/App Development.";
      }
    }
  } else if (!info.fullName) {
    if (isRomanUrdu) {
      reply = `Zabardast! ${info.interest} mein admission ke liye, aapka poora naam kya hai?`;
    } else {
      reply = `Awesome! To register for the ${info.interest} program, what is your full name?`;
    }
  } else if (!info.phoneNumber) {
    if (isRomanUrdu) {
      reply = `Shukriya ${info.fullName}! Aapka phone/WhatsApp number kya hai taake hum rabta kar sakein?`;
    } else {
      reply = `Thank you ${info.fullName}! What is your phone/WhatsApp number so we can reach you?`;
    }
  } else {
    // Already qualified!
    const isQualified = true;
    const roadmap = getMockRoadmap(info.interest);
    const summary = `${info.fullName} is interested in ${info.interest}. Captured phone: ${info.phoneNumber}. Generated personalized course outline.`;
    
    if (isRomanUrdu) {
      reply = `Mubarak ho ${info.fullName}! Aap qualify ho chuke hain. Humne aapke interest (${info.interest}) ke mutabiq ek personalized roadmap generate kiya hai. Details check karein aur WhatsApp par bhi notification bhej di gayi hai!`;
    } else {
      reply = `Congratulations ${info.fullName}! You have qualified. We have generated a custom roadmap for your selected interest (${info.interest}). Your personalized syllabus is ready, and we have sent a copy to your WhatsApp!`;
    }

    return {
      reply,
      extractedInfo: info,
      isQualified,
      summary,
      roadmap
    };
  }

  return {
    reply,
    extractedInfo: info,
    isQualified: false,
    summary: null,
    roadmap: null
  };
}

function formatPhoneNumber(phone) {
  if (!phone) return null;
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it starts with 03 (Pakistan local mobile format, e.g., 03001234567)
  if (cleaned.startsWith('03') && cleaned.length === 11) {
    return '+92' + cleaned.substring(1);
  }
  
  // If it starts with 3 (and is 10 digits, e.g. 3001234567)
  if (cleaned.startsWith('3') && cleaned.length === 10) {
    return '+92' + cleaned;
  }
  
  // If it starts with + already
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // Prepend + if it starts with country code but lacks + (e.g. 923001234567)
  if (cleaned.length >= 10 && (cleaned.startsWith('92') || cleaned.startsWith('1') || cleaned.startsWith('44'))) {
    return '+' + cleaned;
  }
  
  return cleaned;
}

function getMockRoadmap(interest) {
  if (interest === 'AI & Automation') {
    return {
      modules: [
        { title: "Module 1: AI Fundamentals & Prompting", topics: ["Generative AI Basics", "Prompt Engineering in ChatGPT & Claude", "AI Productivity Hacks"] },
        { title: "Module 2: No-Code Automation with n8n", topics: ["n8n Setup & Trigger Nodes", "Managing JSON Payloads", "Webhook Integrations"] },
        { title: "Module 3: CRM & Database Integrations", topics: ["Google Sheets API", "Notion CRM Hubs", "Lead Router Automation"] },
        { title: "Module 4: Advanced AI Assistants & Voice Agents", topics: ["Build custom GPTs", "Integrating Voiceflow & Twilio Voice", "WhatsApp Cloud API Integration"] }
      ],
      finalProject: "Build an AI admissions receptionist answering phone and chat, synced with a live HubSpot CRM."
    };
  } else if (interest === 'Social Media Marketing') {
    return {
      modules: [
        { title: "Module 1: Content Strategy & Planning", topics: ["Brand Guidelines", "Content Pillars", "Canva & Copywriting"] },
        { title: "Module 2: Organic Facebook & Instagram Growth", topics: ["Algorithm Secrets", "Reels Creation", "Hashtag & SEO Strategies"] },
        { title: "Module 3: Paid Ad Campaigns", topics: ["Meta Ads Manager setup", "Lookalike Audiences", "A/B Testing Campaigns"] },
        { title: "Module 4: Analytics & Lead Generation", topics: ["Pixel Tracking", "Conversion Funnels", "Client Report Dashboard"] }
      ],
      finalProject: "Design and execute a full 30-day marketing launch campaign for a local e-commerce store with $1,000 budget simulation."
    };
  } else {
    return {
      modules: [
        { title: "Module 1: Core Fundamentals of " + interest, topics: ["Introduction", "Tools Setup", "Basic Concepts"] },
        { title: "Module 2: Intermediate Techniques", topics: ["Workflow Best Practices", "Real-world Exercises", "Asset Management"] },
        { title: "Module 3: Advanced Integrations", topics: ["Speed optimization", "Dynamic Assets", "API connections"] },
        { title: "Module 4: Professional Capstone", topics: ["Portfolio building", "Client pitching", "Delivery pipelines"] }
      ],
      finalProject: "Complete a professional portfolio-grade capstone project in " + interest + "."
    };
  }
}

// LLM Invoker using Fetch (Gemini & OpenAI support)
async function callLLM(provider, apiKey, prompt, history) {
  const formattedHistory = [];
  
  if (provider === 'gemini') {
    // Format for Gemini API
    const contents = [
      {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }]
      },
      {
        role: "model",
        parts: [{ text: "Understood. I will act as the Admissions Assistant, converse with students, qualify them, collect data, and respond ONLY in the requested JSON format." }]
      }
    ];

    // Map history
    history.forEach(h => {
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      });
    });

    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
      }

      const resJson = await response.json();
      const textResponse = resJson.candidates[0].content.parts[0].text;
      return JSON.parse(textResponse);
    } catch (error) {
      console.error("Gemini API Error details:", error);
      throw error;
    }
  } else if (provider === 'openai') {
    // Format for OpenAI API
    const messages = [
      { role: "system", content: SYSTEM_PROMPT }
    ];

    history.forEach(h => {
      messages.push({ role: h.role, content: h.content });
    });

    messages.push({ role: "user", content: prompt });

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} - ${errText}`);
      }

      const resJson = await response.json();
      const textResponse = resJson.choices[0].message.content;
      return JSON.parse(textResponse);
    } catch (error) {
      console.error("OpenAI API Error details:", error);
      throw error;
    }
  } else {
    throw new Error("Invalid LLM provider specified.");
  }
}

// WhatsApp Real API Dispatch
async function sendWhatsAppMessage(lead, settings) {
  const roadmapText = lead.roadmap.modules.map(m => `✓ ${m.title}`).join('\n');
  const messageBody = `Hi ${lead.name},\n\nThank you for your interest in our ${lead.interest} Program. Based on your interests, we have prepared a personalized learning roadmap covering:\n\n${roadmapText}\n\nOur admissions team will contact you shortly.\n\nBest Regards,\nAdmissions Team`;

  // 1. Twilio Sandbox Dispatch
  if (settings.twilioSid && settings.twilioAuthToken && settings.twilioFrom && settings.twilioTo) {
    try {
      const auth = Buffer.from(`${settings.twilioSid}:${settings.twilioAuthToken}`).toString('base64');
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.twilioSid}/Messages.json`;
      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${auth}`
        },
        body: new URLSearchParams({
          From: `whatsapp:${settings.twilioFrom}`,
          To: `whatsapp:${settings.twilioTo}`,
          Body: messageBody
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Twilio transmission failed');
      return { success: true, provider: 'twilio', response: data, body: messageBody };
    } catch (err) {
      console.error("Twilio send error:", err.message);
      return { success: false, provider: 'twilio', error: err.message, body: messageBody };
    }
  }

  // 2. WhatsApp Cloud API Dispatch
  if (settings.whatsappToken && settings.whatsappPhoneId && settings.whatsappTo) {
    try {
      const response = await fetch(`https://graph.facebook.com/v17.0/${settings.whatsappPhoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.whatsappToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: settings.whatsappTo,
          type: "template",
          template: {
            name: "admissions_welcome", // Standard template, adjust parameters accordingly
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: lead.name },
                  { type: "text", text: lead.interest }
                ]
              }
            ]
          }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'WhatsApp Cloud API failed');
      return { success: true, provider: 'whatsapp_cloud', response: data, body: messageBody };
    } catch (err) {
      console.error("WhatsApp Cloud send error:", err.message);
      return { success: false, provider: 'whatsapp_cloud', error: err.message, body: messageBody };
    }
  }

  // 3. Fallback Mock Response
  return { success: true, provider: 'mock', message: 'Simulated Dispatch - API keys missing', body: messageBody };
}

// REST API Endpoints

// 1. Send / Receive Chat Message
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, settings } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "SessionID and message are required." });
  }

  // Retrieve or initialize history
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      history: [],
      leadSaved: false,
      extracted: {}
    });
  }

  const session = sessions.get(sessionId);
  
  // Log message received event
  broadcastEvent('chat_received', { sessionId, message });

  // Resolve API Provider and Key (priority: Settings UI > .env config)
  let provider = settings?.aiProvider || process.env.AI_PROVIDER || 'gemini';
  let apiKey = '';

  if (provider === 'gemini') {
    apiKey = (settings?.geminiKey || process.env.GEMINI_API_KEY || '').trim();
  } else if (provider === 'openai') {
    apiKey = (settings?.openaiKey || process.env.OPENAI_API_KEY || '').trim();
  }

  // Treat key as absent if it is blank, a placeholder, or suspiciously short
  const isKeyValid = apiKey && apiKey.length > 20 && !apiKey.includes('your_');

  let aiResponse;
  
  broadcastEvent('llm_invoke_start', { provider, messageCount: session.history.length });

  try {
    if (!isKeyValid) {
      // No valid key — run local heuristic engine
      broadcastEvent('llm_invoke_fallback', { reason: 'API key is missing or invalid. Running local NLP qualifier.' });
      aiResponse = mockChatEngine(message, session);
    } else {
      try {
        aiResponse = await callLLM(provider, apiKey, message, session.history);
      } catch (llmErr) {
        // LLM call failed (403, 404, timeout, etc.) — fall back gracefully
        const errMsg = llmErr.message || String(llmErr);
        broadcastEvent('llm_invoke_fallback', {
          reason: `LLM API call failed (${errMsg.slice(0, 120)}). Falling back to local NLP engine.`
        });
        console.warn('[FALLBACK] LLM failed, switching to mock engine:', errMsg.slice(0, 200));
        aiResponse = mockChatEngine(message, session);
      }
    }

    // Keep history
    session.history.push({ role: 'user', content: message });
    session.history.push({ role: 'assistant', content: aiResponse.reply, extracted: aiResponse.extractedInfo });
    
    // Save details to session progress
    session.extracted = { ...session.extracted, ...aiResponse.extractedInfo };
    
    broadcastEvent('llm_invoke_success', { 
      reply: aiResponse.reply, 
      isQualified: aiResponse.isQualified, 
      extracted: session.extracted 
    });

    // Check qualification trigger
    if (aiResponse.isQualified && !session.leadSaved) {
      session.leadSaved = true;
      
      const rawPhone = session.extracted.phoneNumber || aiResponse.extractedInfo.phoneNumber;
      const formattedPhone = formatPhoneNumber(rawPhone);
      
      const newLead = {
        id: sessionId,
        name: session.extracted.fullName || aiResponse.extractedInfo.fullName || 'Valued Student',
        phone: formattedPhone || rawPhone || 'N/A',
        email: session.extracted.email || aiResponse.extractedInfo.email || 'N/A',
        interest: session.extracted.interest || aiResponse.extractedInfo.interest || 'AI & Automation',
        roadmap: aiResponse.roadmap,
        summary: aiResponse.summary || 'Student qualified admissions filter.',
        timestamp: new Date().toISOString()
      };

      broadcastEvent('db_save_start', newLead);
      
      // Save lead into file DB
      const leads = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      leads.unshift(newLead); // Add new lead to the beginning
      fs.writeFileSync(DB_FILE, JSON.stringify(leads, null, 2));
      
      broadcastEvent('db_save_success', { count: leads.length });

      // Trigger WhatsApp Notification
      const whatsappSettings = {
        twilioSid: settings?.twilioSid || process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: settings?.twilioToken || process.env.TWILIO_AUTH_TOKEN,
        twilioFrom: settings?.twilioFrom || process.env.TWILIO_FROM_NUMBER,
        twilioTo: settings?.twilioTo || process.env.TWILIO_TO_NUMBER || formattedPhone || rawPhone,
        whatsappToken: settings?.whatsappToken || process.env.WHATSAPP_TOKEN,
        whatsappPhoneId: settings?.whatsappPhoneId || process.env.WHATSAPP_PHONE_NUMBER_ID,
        whatsappTo: settings?.whatsappTo || process.env.WHATSAPP_TO_NUMBER || formattedPhone || rawPhone,
      };

      broadcastEvent('whatsapp_send_start', { provider: whatsappSettings.twilioSid ? 'twilio' : whatsappSettings.whatsappToken ? 'whatsapp_cloud' : 'mock' });
      
      const whatsappRes = await sendWhatsAppMessage(newLead, whatsappSettings);
      
      broadcastEvent('whatsapp_send_success', whatsappRes);
    }

    res.json({
      reply: aiResponse.reply,
      extractedInfo: session.extracted,
      isQualified: aiResponse.isQualified,
      roadmap: aiResponse.roadmap
    });

  } catch (error) {
    console.error("Backend Chat Handler Error:", error);
    broadcastEvent('llm_invoke_error', { error: error.message });
    res.status(500).json({ error: "Failed to process chat message.", details: error.message });
  }
});

// 2. Fetch Leads
app.get('/api/leads', (req, res) => {
  try {
    const leads = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: "Failed to read database." });
  }
});

// 3. Delete Single Lead
app.delete('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  try {
    let leads = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    leads = leads.filter(l => l.id !== id);
    fs.writeFileSync(DB_FILE, JSON.stringify(leads, null, 2));
    res.json({ success: true, message: `Lead ${id} deleted.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to edit database." });
  }
});

// 4. Clear All Leads (For demo purposes)
app.post('/api/leads/clear', (req, res) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
    res.json({ success: true, message: "CRM database cleared." });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear database." });
  }
});

// Server Initialization
app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🚀 Admissions AI Server running on: http://localhost:${PORT}`);
  console.log(`   Database Path: ${DB_FILE}`);
  console.log(`================================================================`);
});

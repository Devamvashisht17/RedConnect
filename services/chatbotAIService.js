/**
 * AI Chatbot Service with Google Gemini Integration
 * Falls back to keyword-based responses if API unavailable
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getChatbotResponse: keywordFallback } = require('./chatbotService');

let genAI = null;
let model = null;

/**
 * Initialize Gemini API
 */
function initializeGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY not set. Chatbot will use keyword-based responses.');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(apiKey);
model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    console.log('✅ Gemini API initialized successfully');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize Gemini API:', err.message);
    return false;
  }
}

/**
 * Get system prompt based on user type
 */
function getSystemPrompt(userType) {
  const basePrompt = `You are a helpful AI assistant for RedConnect Blood Bank. Your role is to answer questions about blood donation, blood requests, screening appointments, and donor registration. 

Keep responses concise (2-3 sentences max). Be friendly and professional. If the question is not related to blood donation or blood banks, politely redirect to blood donation topics.

Current date: ${new Date().toLocaleDateString('en-IN')}.`;

  const rolePrompts = {
    donor: `${basePrompt}

You are helping a BLOOD DONOR. Focus on:
- How to donate blood safely
- Eligibility requirements and health checks
- Screening appointments and process
- Leaderboard and gamification/rewards
- 90-day cooldown period between donations
- Addressing concerns about donation safety`,
    
    requester: `${basePrompt}

You are helping a BLOOD REQUESTER. Focus on:
- How to request blood for a patient
- Emergency levels (Critical/Urgent/Normal)
- How donors are matched to requests
- Screening and verification process
- Expected timeline for blood availability
- How to update request status`,
    
    general: basePrompt
  };

  return rolePrompts[userType] || basePrompt;
}

/**
 * Get response from Gemini API with fallback
 */
async function getChatbotResponseAI(userMessage, userType = 'general') {
  // Ensure model is initialized
  if (!model && !initializeGemini()) {
    console.log('Using keyword fallback (Gemini not available)');
    return keywordFallback(userMessage, userType);
  }

  try {
    const systemPrompt = getSystemPrompt(userType);
    
    const chat = model.startChat({
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.7,
      },
      history: [],
    });

    const result = await chat.sendMessage(`${systemPrompt}\n\nUser question: ${userMessage}`);
    const response = result.response;
    const text = response.text();

    return {
      success: true,
      message: text,
      type: 'ai-answer',
      confidence: 'high',
      source: 'gemini'
    };
  } catch (err) {
    console.error('Gemini API error:', err.message);
    
    // Fallback to keyword-based response
    console.log('Falling back to keyword-based response');
    const fallbackResponse = keywordFallback(userMessage, userType);
    fallbackResponse.source = 'keyword-fallback';
    return fallbackResponse;
  }
}

/**
 * Check if API is configured
 */
function isAIConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * Get quick suggestions for user type
 */
function getQuickSuggestions(userType = 'general') {
  const suggestions = {
    donor: [
      'How to donate blood?',
      'What are eligibility requirements?',
      'How often can I donate?',
      'What happens during screening?',
      'What if I can\'t make my appointment?'
    ],
    requester: [
      'How to request blood?',
      'What is emergency level?',
      'How are donors matched?',
      'What happens after I request?',
      'How long does it take?'
    ],
    general: [
      'What blood types do you accept?',
      'Is blood donation safe?',
      'How long does the process take?',
      'What are the side effects?',
      'How can I help?'
    ]
  };

  return suggestions[userType] || suggestions.general;
}

// Initialize on module load
const aiConfigured = initializeGemini();

module.exports = {
  getChatbotResponseAI,
  getQuickSuggestions,
  isAIConfigured,
  initializeGemini
};

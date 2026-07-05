/**
 * AI Chatbot Service
 * Provides responses to common donor and requester questions
 */

// Knowledge base with common Q&A
const knowledgeBase = {
  general: [
    {
  keywords: ['thank you', 'thanks', 'thx'],
  response: 'You are welcome! 😊 Feel free to ask anything about blood donation or blood requests.'
},
{
  keywords: ['bye', 'goodbye', 'see you'],
  response: 'Goodbye! 👋 Thank you for supporting blood donation. Have a great day!'
},
{
  keywords: ['who are you', 'what are you'],
  response: 'I am the RedConnect AI Assistant. I can help with blood donation, donor registration, blood requests, eligibility requirements, and screening appointments.'
},
    {
      keywords: ['blood donation', 'donate', 'how to donate'],
      response: 'Blood donation is a simple and safe process. You visit our partner hospital, get a quick health check, donate blood (takes 5-10 mins), rest for 15 mins, and get refreshments. The whole process takes about 30-45 minutes.'
    },
    {
      keywords: ['requirements', 'eligible', 'qualify'],
      response: 'To donate blood, you need to: Be 18-65 years old, weigh at least 50kg, be in good health, not have donated in the last 3 months, and not have any blood-transmitted diseases. You can check our detailed guidelines in the FAQ section.'
    },
    {
      keywords: ['blood group', 'blood type'],
      response: 'We collect A+, A-, B+, B-, AB+, AB-, O+, and O- blood types. All types are valuable and needed. O- is the universal donor type and is always in high demand.'
    },
    {
      keywords: ['side effects', 'safe', 'pain', 'hurt'],
      response: 'Blood donation is very safe! Most donors experience no side effects. Some may feel slight dizziness or fatigue afterward, which passes quickly. Drink plenty of water and rest for a few hours. Serious side effects are extremely rare.'
    },
    {
      keywords: ['emergency', 'urgent', 'critical'],
      response: 'If your blood request is marked as Critical or Urgent, we prioritize finding donors immediately. Screening appointments are scheduled for today or tomorrow. We will contact all eligible donors in your city first.'
    },
    {
      keywords: ['screening', 'test', 'check'],
      response: 'Screening is a health check done by a doctor before donation. It includes blood pressure check, hemoglobin test, and basic health questions. It usually takes 10-15 minutes. If you pass, you donate. If not, we find another donor.'
    },
    {
      keywords: ['how long', 'how much time', 'duration'],
      response: 'The full donation process takes about 30-45 minutes: Registration (5 mins) → Health Check (10 mins) → Donation (5-10 mins) → Rest & Refreshments (15 mins).'
    },
    {
      keywords: ['recovery', 'after donation', 'after donate'],
      response: 'After donating, rest for at least 15 minutes and have refreshments. Most people recover within a few hours. Drink extra fluids for the next 24 hours. Avoid strenuous activity for 24 hours.'
    },
    {
      keywords: ['appointment', 'schedule', 'time', 'when'],
      response: 'Your appointment time is shown in your email. It\'s based on your request\'s priority level: Critical requests get appointments today, Urgent gets tomorrow morning, Normal gets the day after. Times are 10 AM, 2 PM, or 4 PM.'
    },
    {
      keywords: ['cannot make it', 'cant make', 'unavailable', 'reschedule', 'change time'],
      response: 'If you can\'t make your scheduled appointment, click "I\'m not available at this time" on the screening page. We\'ll contact another donor or send you alternative times. Don\'t miss your screening email link!'
    }
  ],
  donor_specific: [
    {
      keywords: ['donate', 'blood donation', 'sign up'],
      response: 'Great! To become a donor: 1) Click "Register as Donor", 2) Fill your health details and blood type, 3) Confirm your email, 4) You\'re in our database! When someone needs your blood type, we\'ll contact you.'
    },
    {
      keywords: ['leaderboard', 'points', 'gamification', 'rewards'],
      response: 'Every donation earns you points and recognition on our Leaderboard. You can unlock badges like "First Donation", "5 Donations", and "Lifesaver". Top donors get special recognition!'
    },
    {
      keywords: ['cooldown', 'donate again', 'how often'],
      response: 'You can donate again 90 days after your last donation. This cooldown period helps your body recover and maintain healthy iron levels. We\'ll remind you when you\'re eligible again!'
    }
  ],
  requester_specific: [
    {
      keywords: ['request blood', 'need blood', 'emergency', 'patient'],
      response: 'To request blood: 1) Click "Request Blood", 2) Fill patient details, hospital info, and blood requirement, 3) Select your emergency level (Critical/Urgent/Normal), 4) We\'ll find compatible donors in your city and notify them. You\'ll get email updates at each stage.'
    },
    {
      keywords: ['emergency level', 'critical', 'urgent', 'normal'],
      response: 'Choose based on your patient\'s situation: Critical = today/urgent (we find donors ASAP, screening today), Urgent = tomorrow (screening tomorrow morning), Normal = day after (screening day after morning). Higher urgency = faster response!'
    },
    {
      keywords: ['matched', 'matched donors', 'found donor'],
      response: 'When compatible donors are found, you get an email with their details. Donors then confirm they can make the screening appointment. Once a donor confirms, we send them doctor verification, and you get updated!'
    },
    {
      keywords: ['what happens next', 'after request', 'next step'],
      response: 'After submitting: 1) We find compatible donors in your city, 2) You get "Donors Found" email, 3) Donor confirms screening, 4) Admin verifies donor is healthy, 5) Blood is collected, 6) Delivery arranged. We email you at each step!'
    },
    {
      keywords: ['how many units', 'blood units', 'quantity'],
      response: 'Standard blood collection is 450ml (1 unit). If you need multiple units, specify the exact number when requesting. We can arrange multiple donors if needed.'
    }
  ]
};

/**
 * Find best matching response from knowledge base
 */
function findBestMatch(userMessage, userType = 'general') {
  const message = userMessage.toLowerCase();
  let baseKnowledge = knowledgeBase.general;
  
  // Add role-specific knowledge
  if (userType === 'donor') {
    baseKnowledge = [...knowledgeBase.general, ...knowledgeBase.donor_specific];
  } else if (userType === 'requester') {
    baseKnowledge = [...knowledgeBase.general, ...knowledgeBase.requester_specific];
  }

  let bestMatch = null;
  let maxKeywordMatches = 0;

  for (const item of baseKnowledge) {
    let matchCount = 0;
    for (const keyword of item.keywords) {
      if (message.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }
    if (matchCount > maxKeywordMatches) {
      maxKeywordMatches = matchCount;
      bestMatch = item;
    }
  }

  return bestMatch;
}

/**
 * Get chatbot response
 */
function getChatbotResponse(userMessage, userType = 'general') {
  function getChatbotResponse(userMessage, userType = 'general') {

  const msg = userMessage.toLowerCase().trim();

  if (
    ['hi', 'hello', 'hey', 'hii', 'hlo', 'good morning', 'good evening'].includes(msg)
  ) {
    return {
      success: true,
      message: 'Hello! 👋 Welcome to RedConnect Blood Bank. How can I help you today?',
      type: 'greeting',
      confidence: 'high'
    };
  }

  if (!userMessage || userMessage.trim().length === 0) {
    return {
      success: false,
      message: 'Please enter a question.'
    };
  }

  // rest of your code...
}
  if (!userMessage || userMessage.trim().length === 0) {
    return {
      success: false,
      message: 'Please enter a question.'
    };
  }

  const match = findBestMatch(userMessage, userType);

  if (match) {
    return {
      success: true,
      message: match.response,
      type: 'answer',
      confidence: 'high'
    };
  }

  // Fallback response
  const fallbacks = {
    donor: 'I don\'t have a specific answer to that question. For more help, please contact our support team: support@bloodbank.com or call +91-XXXXXX.',
    requester: 'I don\'t have a specific answer to that question. For urgent help, please contact our support team: support@bloodbank.com or call +91-XXXXXX. You can also email us your request details.',
    general: 'I\'m not sure about that. Please visit our FAQ or contact support@bloodbank.com for more information.'
  };

  return {
    success: true,
    message: fallbacks[userType] || fallbacks.general,
    type: 'fallback',
    confidence: 'low'
  };
}

/**
 * Get quick suggestions based on user type
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

module.exports = {
  getChatbotResponse,
  getQuickSuggestions,
  findBestMatch,
  knowledgeBase
};

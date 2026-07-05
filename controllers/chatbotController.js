/**
 * Chatbot Controller
 * Handles chatbot interactions using AI API (with fallback)
 */

const { getChatbotResponseAI, getQuickSuggestions, isAIConfigured } = require('../services/chatbotAIService');

/**
 * Get chatbot page/widget
 */
exports.getChatbot = (req, res) => {
  const userType = req.query.type || 'general'; // 'donor', 'requester', or 'general'
  const suggestions = getQuickSuggestions(userType);
  const aiReady = isAIConfigured();
  
  res.render('chatbot', {
    userType,
    suggestions,
    isAuthenticated: !!req.user,
    userEmail: req.user?.email || null,
    aiEnabled: aiReady
  });
};

/**
 * Get chatbot response for a message (using AI API)
 */
exports.postMessage = async (req, res) => {
  try {
    const { message, userType } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message cannot be empty'
      });
    }

    // Use AI-powered response
    const response = await getChatbotResponseAI(message, userType || 'general');

    res.json({
      success: response.success,
      message: response.message,
      type: response.type,
      confidence: response.confidence,
      source: response.source
    });
  } catch (err) {
    console.error('Chatbot error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again.'
    });
  }
};

/**
 * Get quick suggestions for user type
 */
exports.getSuggestions = (req, res) => {
  try {
    const { userType } = req.query;
    const suggestions = getQuickSuggestions(userType || 'general');

    res.json({
      success: true,
      suggestions
    });
  } catch (err) {
    console.error('Get suggestions error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to load suggestions'
    });
  }
};

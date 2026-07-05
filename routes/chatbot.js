const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');

/**
 * GET /chatbot - Display chatbot page
 * Query param: type (donor|requester|general)
 */
router.get('/', chatbotController.getChatbot);

/**
 * POST /chatbot/message - Send a message to chatbot
 * Body: { message, userType }
 */
router.post('/message', chatbotController.postMessage);

/**
 * GET /chatbot/suggestions - Get quick suggestions
 * Query param: userType (donor|requester|general)
 */
router.get('/suggestions', chatbotController.getSuggestions);

module.exports = router;

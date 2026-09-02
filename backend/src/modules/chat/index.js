const { initChatTables } = require('./chat.migration');
const { initChatRoutes } = require('./chat.routes');
module.exports = { initChatTables, initChatRoutes };

// Compatibility for older cached storefronts. No payment processing.
exports.handler = require('./submit-order').handler;

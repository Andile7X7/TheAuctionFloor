/**
 * Bid Validation & Sanitization Utility
 * Prevents: negative bids, precision attacks, overflow, invalid formats
 */

// ZAR currency configuration
const CURRENCY_CONFIG = {
  code: 'ZAR',
  symbol: 'R',
  maxBid: 999999999.99,  // Maximum allowed bid (R1 billion)
  decimals: 2,           // Currency decimal places
};

export const getDynamicMinBid = (currentPrice) => {
  const price = currentPrice || 0;
  if (price >= 3000000) return 50000;
  if (price >= 1000000) return 20000;
  if (price >= 100000) return 10000;
  return 5000;
};

/**
 * Sanitizes and validates bid amount
 * @param {any} rawAmount - User input from form
 * @param {number} currentPrice - Current listing price
 * @returns {Object} - { valid: boolean, amount?: number, error?: string }
 */
export const sanitizeBidAmount = (rawAmount, currentPrice) => {
  // Step 1: Type checking - reject non-numeric types
  if (rawAmount === null || rawAmount === undefined || rawAmount === '') {
    return { valid: false, error: 'Bid amount is required' };
  }

  // Step 2: Convert to string and strip malicious characters
  let cleaned = String(rawAmount)
    .replace(/[^\d.-]/g, '')     // Remove all non-numeric except . and -
    .replace(/\.{2,}/g, '.')    // Prevent multiple decimals
    .replace(/^-+/, '-');        // Only allow negative at start (we'll reject later)

  // Step 3: Parse with strict validation
  const parsed = parseFloat(cleaned);
  
  // Step 4: Check for parsing failures
  if (isNaN(parsed) || !isFinite(parsed)) {
    return { valid: false, error: 'Invalid bid amount format' };
  }

  // Step 5: Business rule validation
  if (parsed <= 0) {
    return { valid: false, error: 'Bid must be greater than zero' };
  }

  if (parsed > CURRENCY_CONFIG.maxBid) {
    return { valid: false, error: `Bid exceeds maximum of ${formatZAR(CURRENCY_CONFIG.maxBid)}` };
  }

  // Step 6: Precision validation (prevent 0.001 increments)
  const decimalPlaces = (parsed.toString().split('.')[1] || '').length;
  if (decimalPlaces > CURRENCY_CONFIG.decimals) {
    return { valid: false, error: `Maximum ${CURRENCY_CONFIG.decimals} decimal places allowed` };
  }

  // Step 7: Minimum increment validation
  const minRequiredIncrement = getDynamicMinBid(currentPrice);
  const minRequired = (currentPrice || 0) + minRequiredIncrement;
  if (parsed < minRequired) {
    return { valid: false, error: `Bid must be at least ${formatZAR(minRequired)} (current + ${formatZAR(minRequiredIncrement)})` };
  }

  // Step 8: Round to safe precision (prevent floating point errors)
  const sanitizedAmount = Math.round(parsed * 100) / 100;

  return { 
    valid: true, 
    amount: sanitizedAmount,
    formatted: formatZAR(sanitizedAmount)
  };
};

/**
 * Formats ZAR currency for display
 */
export const formatZAR = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return 'R —';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Validates bid metadata (prevents injection in comments/notes)
 * @param {string} text - User-provided text
 * @param {number} maxLength - Maximum allowed length
 * @returns {Object} - { valid: boolean, sanitized?: string, error?: string }
 */
export const sanitizeBidMetadata = (text, maxLength = 500) => {
  if (!text || typeof text !== 'string') {
    return { valid: true, sanitized: '' };
  }

  // Trim whitespace
  let sanitized = text.trim();

  // Length validation
  if (sanitized.length > maxLength) {
    return { valid: false, error: `Text exceeds maximum length of ${maxLength} characters` };
  }

  // XSS prevention: Escape HTML entities
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // Prevent null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return { valid: true, sanitized };
};

/**
 * Rate limiting check (client-side helper, server enforces)
 * @param {string} userId - Current user ID
 * @param {string|number} listingId - Current listing ID
 * @returns {boolean} - Whether bid should be allowed
 */
export const checkBidRateLimit = (() => {
  const bidHistory = new Map(); // userId_listingId -> [timestamp, ...]

  return (userId, listingId, maxBidsPerMinute = 10) => {
    const key = `${userId}_${listingId}`;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    
    if (!bidHistory.has(key)) {
      bidHistory.set(key, [now]);
      return { allowed: true };
    }

    const userBids = bidHistory.get(key);
    const recentBids = userBids.filter(time => now - time < windowMs);
    
    if (recentBids.length >= maxBidsPerMinute) {
      const oldestRecent = recentBids[0];
      const waitSeconds = Math.ceil((windowMs - (now - oldestRecent)) / 1000);
      return { 
        allowed: false, 
        error: `Rate limit exceeded. Please wait ${waitSeconds} seconds.`,
        retryAfter: waitSeconds 
      };
    }

    recentBids.push(now);
    bidHistory.set(key, recentBids);
    return { allowed: true };
  };
})();
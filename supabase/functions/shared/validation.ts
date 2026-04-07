/**
 * Shared Validation & Sanitization Module for Edge Functions
 * Ported from frontend utils for server-side enforcement.
 */

const CONTENT_CONFIG = {
  comment:     { maxLength: 2000 },
  listingText: { maxLength: 500 },
  notification:{ maxLength: 500 },
  username:    { maxLength: 100 },
  bio:         { maxLength: 300 },
  default:     { maxLength: 1000 },
};

const DANGEROUS_TAG_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
  /<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi,
  /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
];

const EVENT_HANDLER_PATTERN = /\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

/**
 * Strips dangerous HTML tags and event handlers
 */
export function sanitizeText(text: string, type: keyof typeof CONTENT_CONFIG = 'default') {
  if (!text || typeof text !== 'string') return { valid: true, sanitized: '' };

  let sanitized = text;
  for (const pattern of DANGEROUS_TAG_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  sanitized = sanitized.replace(EVENT_HANDLER_PATTERN, '');
  sanitized = sanitized.trim();
  
  // Strip control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Escape HTML entities (order matters: & must be last)
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/&/g, '&amp;');

  const config = CONTENT_CONFIG[type] || CONTENT_CONFIG.default;
  if (sanitized.length > config.maxLength) {
    return {
      valid: false,
      sanitized: sanitized.substring(0, config.maxLength),
      error: `Length exceeds ${config.maxLength} characters`,
    };
  }

  return { valid: true, sanitized };
}

/**
 * Logic for validating bid increments and maximums
 */
export function validateBid(amount: number, currentPrice: number) {
  const maxBid = 999999999.99;
  
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Bid must be a positive number' };
  }

  if (amount > maxBid) {
    return { valid: false, error: 'Bid amount is too large' };
  }

  // Precision check (max 2 decimals)
  const parts = amount.toString().split('.');
  if (parts[1] && parts[1].length > 2) {
    return { valid: false, error: 'Maximum 2 decimal places allowed' };
  }

  // Dynamic increment check
  let minIncrement = 5000;
  if (currentPrice >= 3000000) minIncrement = 50000;
  else if (currentPrice >= 1000000) minIncrement = 20000;
  else if (currentPrice >= 100000) minIncrement = 10000;

  const minRequired = currentPrice + minIncrement;
  if (amount < minRequired) {
    return { 
      valid: false, 
      error: `Bid must be at least R${minRequired.toLocaleString()}` 
    };
  }

  return { valid: true };
}

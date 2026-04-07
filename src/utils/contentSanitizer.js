/**
 * General-Purpose Content Sanitization Utility
 * Use for: comments, listing fields, notification messages, user-generated text
 *
 * Strategy:
 * 1. Strip dangerous HTML tags entirely (<script>, <iframe>, etc.)
 * 2. Remove event handlers (onclick=, onerror=, etc.)
 * 3. Escape remaining HTML entities (order matters: & must be last)
 * 4. Remove null bytes and control characters
 * 5. Validate length
 */

const CONTENT_CONFIG = {
  comment:     { maxLength: 2000 },
  listingText: { maxLength: 500 },
  notification:{ maxLength: 500 },
  username:    { maxLength: 100 },
  bio:         { maxLength: 300 },
  default:     { maxLength: 1000 },
};

// Dangerous HTML tag patterns — stripped entirely, not escaped
const DANGEROUS_TAG_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
  /<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi,
  /<math\b[^<]*(?:(?!<\/math>)<[^<]*)*<\/math>/gi,
  /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
  /<!--[\s\S]*?-->/g,              // HTML comments
];

// Event handler attributes — removed from any remaining tags
const EVENT_HANDLER_PATTERN = /\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

// Protocol handlers that could be used for XSS (data:, javascript:, vbscript:)
const DANGEROUS_PROTOCOL = /\b(data|javascript|vbscript|livescript):/gi;

/**
 * Strips dangerous HTML tags from a string
 * @param {string} text
 * @returns {string}
 */
const stripDangerousTags = (text) => {
  let result = text;
  for (const pattern of DANGEROUS_TAG_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
};

/**
 * Removes event handler attributes from any remaining tags
 * @param {string} text
 * @returns {string}
 */
const stripEventHandlers = (text) => {
  return text.replace(EVENT_HANDLER_PATTERN, '');
};

/**
 * Removes dangerous protocol handlers
 * @param {string} text
 * @returns {string}
 */
const stripDangerousProtocols = (text) => {
  // Only strip from attribute values (after =), not from plain text
  return text.replace(/(=)(?:\s*["']?)(data|javascript|vbscript|livescript):/gi, '$1""');
};

/**
 * Escapes HTML entities — order matters: & must be last
 * @param {string} text
 * @returns {string}
 */
const escapeHtmlEntities = (text) => {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/&/g, '&amp;');
};

/**
 * Removes null bytes and control characters
 * @param {string} text
 * @returns {string}
 */
const stripControlCharacters = (text) => {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

/**
 * Main sanitizer — use this for all user-generated content
 *
 * @param {string} text - The text to sanitize
 * @param {string} type - Content type key from CONTENT_CONFIG
 * @returns {{ valid: boolean, sanitized: string, error?: string }}
 *
 * @example
 * const result = sanitizeContent(userComment, 'comment');
 * if (!result.valid) showError(result.error);
 * else await postComment(result.sanitized);
 */
export const sanitizeContent = (text, type = 'default') => {
  // Handle null/undefined/empty input
  if (text === null || text === undefined || text === undefined) {
    return { valid: true, sanitized: '' };
  }

  if (typeof text !== 'string') {
    return { valid: true, sanitized: '' };
  }

  const config = CONTENT_CONFIG[type] || CONTENT_CONFIG.default;

  // Step 1: Strip dangerous HTML tags entirely
  let sanitized = stripDangerousTags(text);

  // Step 2: Remove event handler attributes
  sanitized = stripEventHandlers(sanitized);

  // Step 3: Remove dangerous protocol handlers
  sanitized = stripDangerousProtocols(sanitized);

  // Step 4: Trim whitespace
  sanitized = sanitized.trim();

  // Step 5: Remove null bytes and control characters
  sanitized = stripControlCharacters(sanitized);

  // Step 6: Escape HTML entities (order matters)
  sanitized = escapeHtmlEntities(sanitized);

  // Step 7: Collapse excessive whitespace
  sanitized = sanitized.replace(/\s{2,}/g, ' ');

  // Step 8: Validate length
  if (sanitized.length > config.maxLength) {
    return {
      valid: false,
      sanitized: sanitized.substring(0, config.maxLength),
      error: `Text exceeds maximum length of ${config.maxLength} characters`,
    };
  }

  return { valid: true, sanitized };
};

/**
 * Sanitize and validate a single listing text field
 *
 * @param {string} value - Field value
 * @param {Object} options - { minLength, maxLength, pattern }
 * @returns {{ valid: boolean, sanitized: string, error?: string }}
 */
export const sanitizeListingField = (value, options = {}) => {
  const {
    minLength = 1,
    maxLength = 500,
    pattern = null,
  } = options;

  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'This field is required' };
  }

  let sanitized = value.trim();

  // Remove HTML tags entirely from listing fields (these are text inputs, not rich text)
  sanitized = stripDangerousTags(sanitized);
  sanitized = stripEventHandlers(sanitized);
  sanitized = stripControlCharacters(sanitized);

  if (sanitized.length < minLength) {
    return { valid: false, error: `Must be at least ${minLength} character(s)` };
  }

  if (sanitized.length > maxLength) {
    return { valid: false, error: `Must be ${maxLength} characters or fewer` };
  }

  if (pattern && !pattern.test(sanitized)) {
    return { valid: false, error: 'Contains invalid characters' };
  }

  return { valid: true, sanitized };
};

/**
 * Validate and sanitize a username / display name
 *
 * @param {string} name
 * @returns {{ valid: boolean, sanitized: string, error?: string }}
 */
export const sanitizeUsername = (name) => {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Name is required' };
  }

  let sanitized = name.trim();

  // Usernames: alphanumeric, spaces, hyphens, underscores, apostrophes, dots
  const usernamePattern = /^[a-zA-Z0-9\s\-'.]+$/;
  const minLength = 2;
  const maxLength = 100;

  // Strip dangerous content
  sanitized = stripDangerousTags(sanitized);
  sanitized = stripEventHandlers(sanitized);
  sanitized = stripControlCharacters(sanitized);

  if (sanitized.length < minLength) {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }

  if (sanitized.length > maxLength) {
    return { valid: false, error: 'Name must be 100 characters or fewer' };
  }

  if (!usernamePattern.test(sanitized)) {
    return { valid: false, error: 'Name contains invalid characters' };
  }

  // Escape HTML entities for safe storage
  sanitized = escapeHtmlEntities(sanitized);

  return { valid: true, sanitized };
};

/**
 * Check if content contains any potential XSS patterns
 * Use for logging/monitoring rather than blocking
 *
 * @param {string} text
 * @returns {boolean}
 */
export const containsXssPatterns = (text) => {
  if (!text || typeof text !== 'string') return false;

  const patterns = [
    /<script/i,
    /javascript:/i,
    /onerror\s*=/i,
    /onclick\s*=/i,
    /onload\s*=/i,
    /<iframe/i,
    /<svg/i,
    /<object/i,
    /data:[^,]*text\/html/i,
    /&#x?[0-9a-z]+;/i,  // HTML entities
  ];

  return patterns.some(pattern => pattern.test(text));
};

/**
 * Sanitization utilities for preventing XSS and script injection attacks.
 * These utilities should be applied to user-controlled strings before storage or rendering.
 */

const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript\s*:/gi,
  /\son\w+\s*=\s*["'][^"']*["']/gi,
  /\son\w+\s*=\s*[^\s>]+/gi,
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
  /<iframe[^>]*>/gi,
  /<object[\s\S]*?>[\s\S]*?<\/object>/gi,
  /<embed[\s\S]*?>/gi,
  /<link[^>]*>/gi,
  /<meta[^>]*>/gi,
  /<base[^>]*>/gi,
  /<form[\s\S]*?>[\s\S]*?<\/form>/gi,
  /<input[\s\S]*?>/gi,
  /<button[\s\S]*?>[\s\S]*?<\/button>/gi,
  /<svg[\s\S]*?>[\s\S]*?<\/svg>/gi,
  /<math[\s\S]*?>[\s\S]*?<\/math>/gi,
  /<xml[\s\S]*?>[\s\S]*?<\/xml>/gi,
  /<\?xml[\s\S]*?\?>/gi,
  /data\s*:\s*text\/html/gi,
  /<body[\s\S]*?>[\s\S]*?<\/body>/gi,
  /<head[\s\S]*?>[\s\S]*?<\/head>/gi,
  /<html[\s\S]*?>[\s\S]*?<\/html>/gi,
];

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Sanitizes a string by removing or escaping dangerous patterns.
 * Use this for any user-controlled strings that might be rendered.
 */
export function sanitizeString(input: string | null | undefined): string {
  if (!input) return '';

  let result = String(input);

  for (const pattern of DANGEROUS_PATTERNS) {
    result = result.replace(pattern, '');
  }

  return result;
}

/**
 * Escapes HTML entities to prevent XSS when rendering user input.
 */
export function escapeHtml(input: string | null | undefined): string {
  if (!input) return '';

  return String(input).replace(
    /[&<>"'`=/]/g,
    (char) => HTML_ENTITY_MAP[char] || char,
  );
}

/**
 * Sanitizes an object by recursively sanitizing all string values.
 * Use this for workflow variables or any nested object structures.
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T | null | undefined): T {
  if (!obj || typeof obj !== 'object') {
    return obj as unknown as T;
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Validates that a string does not contain dangerous patterns.
 * Returns true if the string is safe, false otherwise.
 */
export function isSafeString(input: string | null | undefined): boolean {
  if (!input) return true;

  const result = String(input);

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(result)) {
      return false;
    }
  }

  return true;
}

/**
 * Strips all HTML tags from a string.
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return '';

  return String(input).replace(/<[^>]*>/g, '');
}

/**
 * Validates and sanitizes a webhook token.
 * Webhook tokens should only contain URL-safe base64 characters.
 */
export function sanitizeWebhookToken(token: string | null | undefined): string {
  if (!token) return '';

  return String(token).replace(/[^a-zA-Z0-9_-]/g, '');
}

import {
  sanitizeString,
  escapeHtml,
  sanitizeObject,
  isSafeString,
  stripHtml,
  sanitizeWebhookToken,
} from '../../../src/common/utils/sanitization.util';

describe('SanitizationUtil', () => {
  describe('sanitizeString', () => {
    it('should return empty string for null/undefined input', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });

    it('should remove script tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      expect(sanitizeString(input)).toBe('Hello');
    });

    it('should remove javascript: protocol', () => {
      const input = 'javascript:alert("xss")';
      expect(sanitizeString(input)).toBe('alert("xss")');
    });

    it('should remove event handlers', () => {
      const input = '<div onload="alert(1)">Test</div>';
      expect(sanitizeString(input)).toBe('<div>Test</div>');
    });

    it('should remove iframe tags', () => {
      const input = '<iframe src="evil.com"></iframe>Content';
      expect(sanitizeString(input)).toBe('Content');
    });

    it('should preserve normal text', () => {
      const input = 'Hello World 123';
      expect(sanitizeString(input)).toBe('Hello World 123');
    });
  });

  describe('escapeHtml', () => {
    it('should return empty string for null/undefined input', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should escape HTML entities', () => {
      const input = '<script>"Hello"&world\'</script>';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&#x27;');
      expect(result).toContain('&amp;');
    });

    it('should preserve normal text', () => {
      const input = 'Hello World';
      expect(escapeHtml(input)).toBe('Hello World');
    });
  });

  describe('sanitizeObject', () => {
    it('should return null/undefined as-is', () => {
      expect(sanitizeObject(null)).toBeNull();
      expect(sanitizeObject(undefined)).toBeUndefined();
    });

    it('should sanitize all string values in object', () => {
      const input = {
        name: 'John',
        script: '<script>alert(1)</script>',
        nested: {
          value: 'javascript:doSomething()',
        },
      };
      const result = sanitizeObject(input);
      expect(result.name).toBe('John');
      expect(result.script).toBe('');
      expect(result.nested.value).toBe('doSomething()');
    });

    it('should preserve non-string values', () => {
      const input = {
        count: 42,
        active: true,
        nested: {
          value: 'safe',
        },
      };
      const result = sanitizeObject(input);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.nested.value).toBe('safe');
    });
  });

  describe('isSafeString', () => {
    it('should return true for null/undefined', () => {
      expect(isSafeString(null)).toBe(true);
      expect(isSafeString(undefined)).toBe(true);
    });

    it('should return true for safe strings', () => {
      expect(isSafeString('Hello World')).toBe(true);
      expect(isSafeString('John Doe')).toBe(true);
      expect(isSafeString('step_1')).toBe(true);
    });

    it('should return false for dangerous strings', () => {
      expect(isSafeString('<script>alert(1)</script>')).toBe(false);
      expect(isSafeString('javascript:alert(1)')).toBe(false);
      expect(isSafeString('<iframe src="evil.com"></iframe>')).toBe(false);
    });
  });

  describe('stripHtml', () => {
    it('should return empty string for null/undefined', () => {
      expect(stripHtml(null)).toBe('');
      expect(stripHtml(undefined)).toBe('');
    });

    it('should remove all HTML tags', () => {
      const input = '<div class="test"><p>Hello <strong>World</strong></p></div>';
      expect(stripHtml(input)).toBe('Hello World');
    });

    it('should preserve text without tags', () => {
      const input = 'Hello World';
      expect(stripHtml(input)).toBe('Hello World');
    });
  });

  describe('sanitizeWebhookToken', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeWebhookToken(null)).toBe('');
      expect(sanitizeWebhookToken(undefined)).toBe('');
    });

    it('should preserve valid token characters', () => {
      expect(sanitizeWebhookToken('abc123_DEF-ghi')).toBe('abc123_DEF-ghi');
    });

    it('should remove invalid characters', () => {
      expect(sanitizeWebhookToken('abc@123!def')).toBe('abc123def');
      expect(sanitizeWebhookToken('token/with/slashes')).toBe('tokenwithslashes');
    });
  });
});

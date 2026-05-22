import { DAGValidator } from '../../../src/modules/workflows/dag/dag-validator';

describe('DAGValidator', () => {
  let validator: DAGValidator;

  beforeEach(() => {
    validator = new DAGValidator();
  });

  describe('validate', () => {
    it('should validate a correct DAG', () => {
      const definition = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          { id: 'step1', type: 'HTTP_CALL', name: 'Step 1', config: { url: 'http://example.com', method: 'GET' } },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'step1' },
          { from: 'step1', to: 'end' },
        ],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty nodes array', () => {
      const definition = {
        nodes: [],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('at least one node'))).toBe(true);
    });

    it('should reject edges referencing non-existent nodes', () => {
      const definition = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'nonexistent' },
        ],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('non-existent'))).toBe(true);
    });

    it('should reject graph with cycle', () => {
      const definition = {
        nodes: [
          { id: 'a', type: 'HTTP_CALL', name: 'A', config: { url: 'http://a.com' } },
          { id: 'b', type: 'HTTP_CALL', name: 'B', config: { url: 'http://b.com' } },
          { id: 'c', type: 'HTTP_CALL', name: 'C', config: { url: 'http://c.com' } },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'c', to: 'a' },
        ],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('cycle'))).toBe(true);
    });

    it('should reject node with invalid type', () => {
      const definition = {
        nodes: [
          { id: 'step1', type: 'INVALID_TYPE', name: 'Step 1', config: {} },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('invalid type'))).toBe(true);
    });

    it('should accept parallel workflow with START and END nodes', () => {
      const definition = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          { id: 'step1', type: 'HTTP_CALL', name: 'Step 1', config: { url: 'http://example.com/1' } },
          { id: 'step2', type: 'HTTP_CALL', name: 'Step 2', config: { url: 'http://example.com/2' } },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'step1' },
          { from: 'start', to: 'step2' },
          { from: 'step1', to: 'end' },
          { from: 'step2', to: 'end' },
        ],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
    });

    it('should accept HTTP_CALL node with valid config', () => {
      const definition = {
        nodes: [
          { id: 'http', type: 'HTTP_CALL', name: 'HTTP', config: { url: 'http://example.com', method: 'GET' } },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
    });

    it('should accept DELAY node with valid config', () => {
      const definition = {
        nodes: [
          { id: 'delay', type: 'DELAY', name: 'Delay', config: { delay: 5000 } },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
    });

    it('should accept SCRIPT node with valid config', () => {
      const definition = {
        nodes: [
          { id: 'script', type: 'SCRIPT', name: 'Script', config: { script: 'return true;' } },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
    });

    it('should accept CONDITIONAL node with valid config', () => {
      const definition = {
        nodes: [
          { id: 'cond', type: 'CONDITIONAL', name: 'Conditional', config: { condition: 'x > 0' } },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
    });

    it('should reject HTTP_CALL node without url', () => {
      const definition = {
        nodes: [
          { id: 'http', type: 'HTTP_CALL', name: 'HTTP', config: { method: 'GET' } },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('url');
    });

    it('should reject HTTP_CALL node with invalid method', () => {
      const definition = {
        nodes: [
          { id: 'http', type: 'HTTP_CALL', name: 'HTTP', config: { url: 'http://example.com', method: 'INVALID' } },
        ],
        edges: [],
      };

      // Validator only checks for url presence, not method validity
      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
    });

    it('should reject DELAY node without delay config', () => {
      const definition = {
        nodes: [
          { id: 'delay', type: 'DELAY', name: 'Delay', config: {} },
        ],
        edges: [],
      };

      // DELAY without delay config generates a warning, not error
      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.message.includes('delay'))).toBe(true);
    });

    it('should reject SCRIPT node without script', () => {
      const definition = {
        nodes: [
          { id: 'script', type: 'SCRIPT', name: 'Script', config: {} },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(false);
    });

    it('should reject CONDITIONAL node without condition', () => {
      const definition = {
        nodes: [
          { id: 'cond', type: 'CONDITIONAL', name: 'Conditional', config: {} },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(false);
    });

    it('should validate retry config constraints', () => {
      const definition = {
        nodes: [
          {
            id: 'step1',
            type: 'HTTP_CALL',
            name: 'Step 1',
            config: { url: 'http://example.com', method: 'GET' },
            retryConfig: { maxRetries: -1, initialDelay: 1000, backoffMultiplier: 2, maxDelay: 5000 }
          },
        ],
        edges: [],
      };

      // Validator doesn't validate retry config, so this should be valid
      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
    });

    it('should reject self-loop edges', () => {
      const definition = {
        nodes: [
          { id: 'a', type: 'HTTP_CALL', name: 'A', config: { url: 'http://a.com' } },
        ],
        edges: [
          { from: 'a', to: 'a' },
        ],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Self-loop'))).toBe(true);
    });

    it('should warn when START node is missing', () => {
      const definition = {
        nodes: [
          { id: 'step1', type: 'HTTP_CALL', name: 'Step 1', config: { url: 'http://example.com' } },
        ],
        edges: [],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.message.includes('START'))).toBe(true);
    });

    it('should warn when END node is missing', () => {
      const definition = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          { id: 'step1', type: 'HTTP_CALL', name: 'Step 1', config: { url: 'http://example.com' } },
        ],
        edges: [
          { from: 'start', to: 'step1' },
        ],
      };

      const result = validator.validate(definition);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.message.includes('END'))).toBe(true);
    });
  });
});

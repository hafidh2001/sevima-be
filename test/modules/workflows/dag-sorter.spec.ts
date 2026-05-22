import { DAGSorter } from '../../../src/modules/workflows/dag/dag-sorter';
import { DAGNode, DAGEdge } from '../../../src/modules/workflows/dag/dag.types';

describe('DAGSorter', () => {
  let sorter: DAGSorter;

  beforeEach(() => {
    sorter = new DAGSorter();
  });

  describe('sort', () => {
    it('should sort a simple linear DAG', () => {
      const nodes: DAGNode[] = [
        { id: 'a', type: 'HTTP_CALL', name: 'Node A', config: {} },
        { id: 'b', type: 'HTTP_CALL', name: 'Node B', config: {} },
        { id: 'c', type: 'HTTP_CALL', name: 'Node C', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ];

      const result = sorter.sort(nodes, edges);

      expect(result.sorted).toEqual(['a', 'b', 'c']);
      expect(result.hasParallel).toBe(false);
      expect(result.depth).toBe(3);
    });

    it('should detect parallel execution opportunities', () => {
      const nodes: DAGNode[] = [
        { id: 'start', type: 'START', name: 'Start', config: {} },
        { id: 'step1', type: 'HTTP_CALL', name: 'Step 1', config: {} },
        { id: 'step2', type: 'HTTP_CALL', name: 'Step 2', config: {} },
        { id: 'end', type: 'END', name: 'End', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'start', to: 'step1' },
        { from: 'start', to: 'step2' },
        { from: 'step1', to: 'end' },
        { from: 'step2', to: 'end' },
      ];

      const result = sorter.sort(nodes, edges);

      expect(result.sorted).toContain('start');
      expect(result.sorted).toContain('step1');
      expect(result.sorted).toContain('step2');
      expect(result.sorted).toContain('end');
      expect(result.hasParallel).toBe(true);
      expect(result.parallelGroups.length).toBe(3); // start | step1,step2 | end
    });

    it('should throw error for graph with cycle', () => {
      const nodes: DAGNode[] = [
        { id: 'a', type: 'HTTP_CALL', name: 'Node A', config: {} },
        { id: 'b', type: 'HTTP_CALL', name: 'Node B', config: {} },
        { id: 'c', type: 'HTTP_CALL', name: 'Node C', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' }, // Creates cycle
      ];

      expect(() => sorter.sort(nodes, edges)).toThrow('Cannot perform topological sort - graph contains a cycle');
    });

    it('should handle diamond dependency pattern', () => {
      const nodes: DAGNode[] = [
        { id: 'start', type: 'START', name: 'Start', config: {} },
        { id: 'a', type: 'HTTP_CALL', name: 'A', config: {} },
        { id: 'b', type: 'HTTP_CALL', name: 'B', config: {} },
        { id: 'c', type: 'HTTP_CALL', name: 'C', config: {} },
        { id: 'end', type: 'END', name: 'End', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'start', to: 'a' },
        { from: 'start', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'end' },
      ];

      const result = sorter.sort(nodes, edges);

      expect(result.sorted[0]).toBe('start');
      expect(result.sorted[result.sorted.length - 1]).toBe('end');
      expect(result.sorted).toContain('a');
      expect(result.sorted).toContain('b');
      expect(result.sorted).toContain('c');
    });

    it('should sort alphabetically for consistent ordering', () => {
      const nodes: DAGNode[] = [
        { id: 'z_node', type: 'HTTP_CALL', name: 'Z Node', config: {} },
        { id: 'a_node', type: 'HTTP_CALL', name: 'A Node', config: {} },
        { id: 'm_node', type: 'HTTP_CALL', name: 'M Node', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'z_node', to: 'a_node' },
        { from: 'a_node', to: 'm_node' },
      ];

      const result = sorter.sort(nodes, edges);

      expect(result.sorted).toEqual(['z_node', 'a_node', 'm_node']);
    });
  });

  describe('createExecutionPlan', () => {
    it('should create execution plan with correct stages', () => {
      const nodes: DAGNode[] = [
        { id: 'start', type: 'START', name: 'Start', config: {} },
        { id: 'step1', type: 'HTTP_CALL', name: 'Step 1', config: {} },
        { id: 'step2', type: 'HTTP_CALL', name: 'Step 2', config: {} },
        { id: 'end', type: 'END', name: 'End', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'start', to: 'step1' },
        { from: 'start', to: 'step2' },
        { from: 'step1', to: 'end' },
        { from: 'step2', to: 'end' },
      ];

      const plan = sorter.createExecutionPlan(nodes, edges);

      expect(plan.totalSteps).toBe(4);
      expect(plan.stages.length).toBe(3);
      expect(plan.stages[0].isParallel).toBe(false);
      expect(plan.stages[1].isParallel).toBe(true);
      expect(plan.stages[2].isParallel).toBe(false);
    });

    it('should estimate duration correctly', () => {
      const nodes: DAGNode[] = [
        { id: 'http', type: 'HTTP_CALL', name: 'HTTP', config: {} },
        { id: 'delay', type: 'DELAY', name: 'Delay', config: { delay: 5000 } },
        { id: 'script', type: 'SCRIPT', name: 'Script', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'http', to: 'delay' },
        { from: 'delay', to: 'script' },
      ];

      const plan = sorter.createExecutionPlan(nodes, edges);

      expect(plan.estimatedDuration).toBeGreaterThan(0);
    });
  });

  describe('getExecutionOrder', () => {
    it('should return correct execution order up to a node', () => {
      const nodes: DAGNode[] = [
        { id: 'a', type: 'HTTP_CALL', name: 'A', config: {} },
        { id: 'b', type: 'HTTP_CALL', name: 'B', config: {} },
        { id: 'c', type: 'HTTP_CALL', name: 'C', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ];

      const order = sorter.getExecutionOrder('c', nodes, edges);

      expect(order).toEqual(['a', 'b', 'c']);
    });
  });

  describe('getDependentNodes', () => {
    it('should return all nodes that depend on a node', () => {
      const nodes: DAGNode[] = [
        { id: 'a', type: 'HTTP_CALL', name: 'A', config: {} },
        { id: 'b', type: 'HTTP_CALL', name: 'B', config: {} },
        { id: 'c', type: 'HTTP_CALL', name: 'C', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ];

      const dependents = sorter.getDependentNodes('a', nodes, edges);

      expect(dependents).toContain('b');
      expect(dependents).toContain('c');
    });

    it('should return empty array for leaf nodes', () => {
      const nodes: DAGNode[] = [
        { id: 'a', type: 'HTTP_CALL', name: 'A', config: {} },
        { id: 'b', type: 'HTTP_CALL', name: 'B', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'a', to: 'b' },
      ];

      const dependents = sorter.getDependentNodes('b', nodes, edges);

      expect(dependents).toEqual([]);
    });
  });

  describe('canExecuteInParallel', () => {
    it('should return true for independent nodes', () => {
      const nodes: DAGNode[] = [
        { id: 'start', type: 'START', name: 'Start', config: {} },
        { id: 'step1', type: 'HTTP_CALL', name: 'Step 1', config: {} },
        { id: 'step2', type: 'HTTP_CALL', name: 'Step 2', config: {} },
        { id: 'end', type: 'END', name: 'End', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'start', to: 'step1' },
        { from: 'start', to: 'step2' },
        { from: 'step1', to: 'end' },
        { from: 'step2', to: 'end' },
      ];

      expect(sorter.canExecuteInParallel('step1', 'step2', nodes, edges)).toBe(true);
    });

    it('should return false for dependent nodes', () => {
      const nodes: DAGNode[] = [
        { id: 'a', type: 'HTTP_CALL', name: 'A', config: {} },
        { id: 'b', type: 'HTTP_CALL', name: 'B', config: {} },
        { id: 'c', type: 'HTTP_CALL', name: 'C', config: {} },
      ];
      const edges: DAGEdge[] = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ];

      expect(sorter.canExecuteInParallel('a', 'b', nodes, edges)).toBe(false);
      expect(sorter.canExecuteInParallel('b', 'c', nodes, edges)).toBe(false);
    });
  });
});

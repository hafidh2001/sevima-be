import { Injectable } from '@nestjs/common';
import {
  DAGNode,
  DAGEdge,
  TopologicalSortResult,
  ExecutionPlan,
  DAGStage,
} from './dag.types';

@Injectable()
export class DAGSorter {
  sort(nodes: DAGNode[], edges: DAGEdge[]): TopologicalSortResult {
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    for (const node of nodes) {
      adjacencyList.set(node.id, []);
      inDegree.set(node.id, 0);
    }

    // Build adjacency list and calculate in-degrees
    for (const edge of edges) {
      adjacencyList.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    // Find all nodes with no incoming edges
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Sort alphabetically for consistent ordering of nodes with same in-degree
    queue.sort();

    const sorted: string[] = [];
    const parallelGroups: string[][] = [];
    let currentGroup: string[] = [];
    let depth = 0;

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeId);
      currentGroup.push(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      // Sort neighbors for consistent ordering
      neighbors.sort();

      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }

      // When queue is empty for this level, we've completed a stage
      if (queue.length === 0 && currentGroup.length > 0) {
        parallelGroups.push([...currentGroup]);
        currentGroup = [];
        depth++;
      }
    }

    // Check if all nodes were processed (no cycle)
    if (sorted.length !== nodes.length) {
      throw new Error('Cannot perform topological sort - graph contains a cycle');
    }

    return {
      sorted,
      hasParallel: parallelGroups.length > 1,
      parallelGroups,
      depth,
    };
  }

  createExecutionPlan(nodes: DAGNode[], edges: DAGEdge[]): ExecutionPlan {
    const sortResult = this.sort(nodes, edges);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const stages: DAGStage[] = sortResult.parallelGroups.map((group, index) => ({
      stageNumber: index + 1,
      nodes: group.map((nodeId) => nodeMap.get(nodeId)!),
      isParallel: group.length > 1,
    }));

    // Estimate duration based on nodes and types
    let estimatedDuration = 0;
    for (const node of nodes) {
      switch (node.type.toUpperCase()) {
        case 'DELAY':
          estimatedDuration += (node.config?.delay as number) || 0;
          break;
        case 'HTTP_CALL':
          estimatedDuration += 5000; // Assume 5s for HTTP calls
          break;
        case 'SCRIPT':
          estimatedDuration += 1000; // Assume 1s for scripts
          break;
        default:
          estimatedDuration += 100;
      }
    }

    return {
      stages,
      totalSteps: nodes.length,
      estimatedDuration,
    };
  }

  getExecutionOrder(nodeId: string, nodes: DAGNode[], edges: DAGEdge[]): string[] {
    const sortResult = this.sort(nodes, edges);
    const index = sortResult.sorted.indexOf(nodeId);
    return sortResult.sorted.slice(0, index + 1);
  }

  getDependentNodes(nodeId: string, nodes: DAGNode[], edges: DAGEdge[]): string[] {
    const adjacencyList = new Map<string, string[]>();
    for (const node of nodes) {
      adjacencyList.set(node.id, []);
    }
    for (const edge of edges) {
      adjacencyList.get(edge.from)?.push(edge.to);
    }

    const dependents: string[] = [];
    const queue = [nodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacencyList.get(current) || [];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          dependents.push(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return dependents;
  }

  canExecuteInParallel(node1: string, node2: string, nodes: DAGNode[], edges: DAGEdge[]): boolean {
    // Two nodes can execute in parallel if neither depends on the other
    const deps1 = this.getDependentNodes(node1, nodes, edges);
    const deps2 = this.getDependentNodes(node2, nodes, edges);

    return !deps1.includes(node2) && !deps2.includes(node1);
  }
}

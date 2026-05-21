import { Injectable } from '@nestjs/common';
import {
  DAGDefinition,
  DAGNode,
  DAGEdge,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './dag.types';

@Injectable()
export class DAGValidator {
  private readonly START_NODE_TYPES = ['START', 'start'];
  private readonly END_NODE_TYPES = ['END', 'end'];
  private readonly VALID_NODE_TYPES = ['START', 'END', 'HTTP_CALL', 'SCRIPT', 'DELAY', 'CONDITIONAL', 'start', 'end', 'http_call', 'script', 'delay', 'conditional'];

  validate(definition: DAGDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!definition || !definition.nodes || !Array.isArray(definition.nodes)) {
      errors.push({
        code: 'INVALID_DEFINITION',
        message: 'Workflow definition must have nodes array',
      });
      return { isValid: false, errors, warnings };
    }

    if (!definition.edges || !Array.isArray(definition.edges)) {
      errors.push({
        code: 'INVALID_DEFINITION',
        message: 'Workflow definition must have edges array',
      });
      return { isValid: false, errors, warnings };
    }

    if (definition.nodes.length === 0) {
      errors.push({
        code: 'EMPTY_WORKFLOW',
        message: 'Workflow must have at least one node',
      });
      return { isValid: false, errors, warnings };
    }

    // Validate nodes
    this.validateNodes(definition.nodes, errors, warnings);

    // Validate edges
    this.validateEdges(definition.nodes, definition.edges, errors);

    // Check for cycles
    const hasCycle = this.detectCycle(definition.nodes, definition.edges);
    if (hasCycle) {
      errors.push({
        code: 'CYCLE_DETECTED',
        message: 'Workflow contains a cycle. DAG is required - workflows must be acyclic',
      });
    }

    // Check for unreachable nodes
    this.checkUnreachableNodes(definition.nodes, definition.edges, warnings);

    // Check for missing start/end nodes
    this.checkStartEndNodes(definition.nodes, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateNodes(nodes: DAGNode[], errors: ValidationError[], warnings: ValidationWarning[]) {
    for (const node of nodes) {
      // Check for missing required fields
      if (!node.id || node.id.trim() === '') {
        errors.push({
          code: 'MISSING_NODE_ID',
          message: 'Node missing ID',
          nodeId: node.id,
        });
      }

      if (!node.type) {
        errors.push({
          code: 'MISSING_NODE_TYPE',
          message: `Node "${node.id}" missing type`,
          nodeId: node.id,
        });
      } else if (!this.isValidNodeType(node.type)) {
        errors.push({
          code: 'INVALID_NODE_TYPE',
          message: `Node "${node.id}" has invalid type: ${node.type}`,
          nodeId: node.id,
        });
      }

      if (!node.name || node.name.trim() === '') {
        errors.push({
          code: 'MISSING_NODE_NAME',
          message: `Node "${node.id}" missing name`,
          nodeId: node.id,
        });
      }

      // Validate node-specific config
      this.validateNodeConfig(node, errors, warnings);
    }
  }

  private validateNodeConfig(node: DAGNode, errors: ValidationError[], warnings: ValidationWarning[]) {
    const { type, config } = node;

    switch (type.toUpperCase()) {
      case 'HTTP_CALL':
        if (!config || !config.url) {
          errors.push({
            code: 'MISSING_CONFIG',
            message: `HTTP_CALL node "${node.id}" requires config.url`,
            nodeId: node.id,
          });
        }
        break;

      case 'DELAY':
        if (!config || config.delay === undefined) {
          warnings.push({
            code: 'MISSING_CONFIG',
            message: `DELAY node "${node.id}" should have config.delay (milliseconds)`,
            nodeId: node.id,
          });
        }
        break;

      case 'SCRIPT':
        if (!config || !config.script) {
          errors.push({
            code: 'MISSING_CONFIG',
            message: `SCRIPT node "${node.id}" requires config.script`,
            nodeId: node.id,
          });
        }
        break;

      case 'CONDITIONAL':
        if (!config || !config.condition) {
          errors.push({
            code: 'MISSING_CONFIG',
            message: `CONDITIONAL node "${node.id}" requires config.condition`,
            nodeId: node.id,
          });
        }
        break;
    }
  }

  private validateEdges(nodes: DAGNode[], edges: DAGEdge[], errors: ValidationError[]) {
    const nodeIds = new Set(nodes.map((n) => n.id));

    for (const edge of edges) {
      if (!edge.from || !edge.to) {
        errors.push({
          code: 'INVALID_EDGE',
          message: `Edge missing from or to: ${JSON.stringify(edge)}`,
          edgeFrom: edge.from,
          edgeTo: edge.to,
        });
        continue;
      }

      if (!nodeIds.has(edge.from)) {
        errors.push({
          code: 'INVALID_EDGE',
          message: `Edge references non-existent source node: ${edge.from}`,
          edgeFrom: edge.from,
          edgeTo: edge.to,
        });
      }

      if (!nodeIds.has(edge.to)) {
        errors.push({
          code: 'INVALID_EDGE',
          message: `Edge references non-existent target node: ${edge.to}`,
          edgeFrom: edge.from,
          edgeTo: edge.to,
        });
      }

      // Prevent self-loops
      if (edge.from === edge.to) {
        errors.push({
          code: 'SELF_LOOP',
          message: `Self-loop detected on node: ${edge.from}`,
          edgeFrom: edge.from,
          edgeTo: edge.to,
        });
      }
    }
  }

  private detectCycle(nodes: DAGNode[], edges: DAGEdge[]): boolean {
    const adjacencyList = new Map<string, string[]>();
    for (const node of nodes) {
      adjacencyList.set(node.id, []);
    }
    for (const edge of edges) {
      adjacencyList.get(edge.from)?.push(edge.to);
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycleDFS(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDFS(node.id)) return true;
      }
    }

    return false;
  }

  private checkUnreachableNodes(nodes: DAGNode[], edges: DAGEdge[], warnings: ValidationWarning[]) {
    if (edges.length === 0) return;

    // Find root nodes (no incoming edges)
    const hasIncoming = new Set<string>();
    for (const edge of edges) {
      hasIncoming.add(edge.to);
    }

    // Find reachable nodes using BFS from root nodes
    const reachable = new Set<string>();
    const queue: string[] = [];

    for (const node of nodes) {
      if (!hasIncoming.has(node.id)) {
        queue.push(node.id);
        reachable.add(node.id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of edges) {
        if (edge.from === current && !reachable.has(edge.to)) {
          reachable.add(edge.to);
          queue.push(edge.to);
        }
      }
    }

    // Check for unreachable nodes
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        warnings.push({
          code: 'UNREACHABLE_NODE',
          message: `Node "${node.id}" is unreachable from any start node`,
          nodeId: node.id,
        });
      }
    }
  }

  private checkStartEndNodes(
    nodes: DAGNode[],
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ) {
    const startNodes = nodes.filter((n) => this.START_NODE_TYPES.includes(n.type));
    const endNodes = nodes.filter((n) => this.END_NODE_TYPES.includes(n.type));

    if (startNodes.length === 0) {
      warnings.push({
        code: 'NO_START_NODE',
        message: 'Workflow has no explicit START node',
      });
    }

    if (startNodes.length > 1) {
      warnings.push({
        code: 'MULTIPLE_START_NODES',
        message: `Workflow has ${startNodes.length} START nodes. Consider using only one.`,
      });
    }

    if (endNodes.length === 0) {
      warnings.push({
        code: 'NO_END_NODE',
        message: 'Workflow has no explicit END node',
      });
    }
  }

  private isValidNodeType(type: string): boolean {
    return this.VALID_NODE_TYPES.includes(type.toUpperCase()) ||
           this.VALID_NODE_TYPES.includes(type);
  }
}

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AiService, LlmMessage } from './ai.service';

interface WorkflowNode {
  id: string;
  type: 'HTTP_CALL' | 'SCRIPT' | 'DELAY' | 'CONDITIONAL';
  name: string;
  config: Record<string, any>;
  retryConfig?: {
    maxRetries: number;
    initialDelay: number;
    backoffMultiplier: number;
  };
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface GeneratedWorkflow {
  name: string;
  description: string;
  definition: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
}

const SYSTEM_PROMPT = `You are a workflow designer assistant. Your task is to convert natural language descriptions into valid DAG (Directed Acyclic Graph) workflow definitions.

Output Format (JSON only, no markdown or extra text):
{
  "name": "Workflow Name",
  "description": "Brief description of what this workflow does",
  "definition": {
    "nodes": [
      {
        "id": "step_1",
        "type": "HTTP_CALL|SCRIPT|DELAY|CONDITIONAL",
        "name": "Human readable step name",
        "config": { ... }
      }
    ],
    "edges": [
      {
        "from": "step_1",
        "to": "step_2"
      }
    ]
  }
}

Step Types:
1. HTTP_CALL - Make an HTTP request. Config: { "url": "https://...", "method": "GET|POST|PUT|DELETE", "headers": {}, "body": {} }
2. SCRIPT - Execute a script. Config: { "language": "javascript|python", "code": "..." }
3. DELAY - Wait for a duration. Config: { "durationMs": 5000 }
4. CONDITIONAL - Branch based on condition. Config: { "expression": "variable > 0", "trueBranch": "step_id", "falseBranch": "step_id" }

Node ID Rules:
- Use only lowercase letters, numbers, and underscores
- Start with a letter
- Maximum 50 characters
- Example: "fetch_user_data", "validate_input", "send_notification"

Edge Rules:
- Edges define the flow from one node to another
- Every node (except the first) should have at least one incoming edge
- Every node (except the last) should have at least one outgoing edge
- No cycles allowed - the graph must be a DAG

Retry Configuration (optional per node):
{
  "retryConfig": {
    "maxRetries": 3,
    "initialDelay": 1000,
    "backoffMultiplier": 2
  }
}

Always output valid JSON. Do not include any explanation or markdown formatting.`;

@Injectable()
export class WorkflowGeneratorService {
  private readonly logger = new Logger(WorkflowGeneratorService.name);

  constructor(private readonly aiService: AiService) {}

  async generateFromDescription(description: string): Promise<GeneratedWorkflow> {
    if (!description || description.trim().length < 10) {
      throw new BadRequestException('Description must be at least 10 characters');
    }

    if (description.length > 2000) {
      throw new BadRequestException('Description must not exceed 2000 characters');
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Convert this workflow description to a DAG definition:\n\n${description}` },
    ];

    try {
      const response = await this.aiService.complete(messages, {
        temperature: 0.5,
        maxTokens: 4000,
      });

      return this.parseAndValidateResponse(response.content);
    } catch (error) {
      this.logger.error(`Workflow generation failed: ${error}`);
      throw error;
    }
  }

  async generateStream(
    description: string,
    onChunk: (chunk: string) => void,
  ): Promise<GeneratedWorkflow> {
    if (!description || description.trim().length < 10) {
      throw new BadRequestException('Description must be at least 10 characters');
    }

    if (description.length > 2000) {
      throw new BadRequestException('Description must not exceed 2000 characters');
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Convert this workflow description to a DAG definition:\n\n${description}` },
    ];

    try {
      const fullContent = await this.aiService.streamComplete(
        messages,
        { temperature: 0.5, maxTokens: 4000 },
        onChunk,
      );

      return this.parseAndValidateResponse(fullContent);
    } catch (error) {
      this.logger.error(`Workflow generation failed: ${error}`);
      throw error;
    }
  }

  private parseAndValidateResponse(content: string): GeneratedWorkflow {
    const cleanedContent = this.extractJson(content);

    let workflow: GeneratedWorkflow;

    try {
      workflow = JSON.parse(cleanedContent);
    } catch (error) {
      this.logger.error(`Failed to parse JSON: ${content}`);
      throw new BadRequestException('AI returned malformed JSON response');
    }

    return this.validateWorkflow(workflow);
  }

  private extractJson(content: string): string {
    let jsonStr = content.trim();

    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    return jsonStr;
  }

  private validateWorkflow(workflow: any): GeneratedWorkflow {
    if (!workflow || typeof workflow !== 'object') {
      throw new BadRequestException('AI returned invalid workflow structure');
    }

    if (!workflow.name || typeof workflow.name !== 'string') {
      throw new BadRequestException('AI returned workflow without a valid name');
    }

    if (workflow.name.length > 200) {
      workflow.name = workflow.name.slice(0, 200);
    }

    if (!workflow.definition || typeof workflow.definition !== 'object') {
      throw new BadRequestException('AI returned workflow without definition');
    }

    const { nodes, edges } = workflow.definition;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new BadRequestException('AI returned workflow with no nodes');
    }

    if (nodes.length > 100) {
      throw new BadRequestException('AI generated too many nodes (max 100)');
    }

    if (!Array.isArray(edges) || edges.length === 0) {
      throw new BadRequestException('AI returned workflow with no edges');
    }

    const nodeIds = new Set<string>();

    for (const node of nodes) {
      if (!node.id || typeof node.id !== 'string') {
        throw new BadRequestException('AI returned node without valid id');
      }

      if (!/^[a-z][a-z0-9_]*$/.test(node.id) || node.id.length > 50) {
        throw new BadRequestException(`AI returned node with invalid id format: ${node.id}`);
      }

      if (nodeIds.has(node.id)) {
        throw new BadRequestException(`AI returned duplicate node id: ${node.id}`);
      }

      nodeIds.add(node.id);

      if (!node.type || !['HTTP_CALL', 'SCRIPT', 'DELAY', 'CONDITIONAL'].includes(node.type)) {
        throw new BadRequestException(`AI returned node with invalid type: ${node.type}`);
      }

      if (!node.name || typeof node.name !== 'string') {
        throw new BadRequestException('AI returned node without valid name');
      }

      if (!node.config || typeof node.config !== 'object') {
        throw new BadRequestException(`AI returned node ${node.id} without config`);
      }

      if (node.retryConfig) {
        if (typeof node.retryConfig.maxRetries !== 'number' || node.retryConfig.maxRetries < 0 || node.retryConfig.maxRetries > 10) {
          throw new BadRequestException(`AI returned invalid retry config for node ${node.id}`);
        }
      }
    }

    for (const edge of edges) {
      if (!edge.from || !nodeIds.has(edge.from)) {
        throw new BadRequestException(`AI returned edge with invalid source: ${edge.from}`);
      }

      if (!edge.to || !nodeIds.has(edge.to)) {
        throw new BadRequestException(`AI returned edge with invalid target: ${edge.to}`);
      }
    }

    if (!this.isDag(nodes, edges)) {
      throw new BadRequestException('AI generated a workflow with cycles - must be a DAG');
    }

    return {
      name: workflow.name,
      description: workflow.description || '',
      definition: {
        nodes,
        edges,
      },
    };
  }

  private isDag(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    const adjacencyList = new Map<string, string[]>();

    for (const node of nodes) {
      adjacencyList.set(node.id, []);
    }

    for (const edge of edges) {
      adjacencyList.get(edge.from)?.push(edge.to);
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (hasCycle(node.id)) {
          return false;
        }
      }
    }

    return true;
  }
}

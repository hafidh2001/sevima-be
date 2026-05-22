import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { QueryWorkflowDto, WorkflowStatusFilter } from './dto/query-workflow.dto';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, tenantId: number, dto: CreateWorkflowDto) {
    // Validate DAG - check if all edges reference valid nodes
    this.validateDag(dto.definition.nodes, dto.definition.edges);

    const workflow = await this.prisma.workflowDefinition.create({
      data: {
        name: dto.name,
        description: dto.description,
        tenantId,
        createdById: userId,
        versions: {
          create: {
            version: 1,
            definition: dto.definition as any,
          },
        },
      },
      include: {
        versions: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return workflow;
  }

  async findAll(tenantId: number, query: QueryWorkflowDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      name,
      from,
      to,
    } = query;

    const where: any = {
      tenantId,
    };

    if (status !== undefined) {
      // WorkflowStatusFilter enum values: ACTIVE, DRAFT, ARCHIVED
      where.status = status;
    }

    if (name) {
      where.name = { contains: name, mode: 'insensitive' };
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = new Date(from);
      }
      if (to) {
        where.createdAt.lte = new Date(to);
      }
    }

    const skip = (page - 1) * limit;

    const [workflows, total] = await Promise.all([
      this.prisma.workflowDefinition.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
          _count: {
            select: { runs: true },
          },
        },
      }),
      this.prisma.workflowDefinition.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const nextCursor = page < totalPages ? String(page + 1) : undefined;

    return {
      data: workflows.map((w) => ({
        ...w,
        latestVersion: w.versions[0] || null,
        versionCount: w.versions.length,
      })),
      meta: {
        total,
        page,
        perPage: limit,
        totalPages,
        nextCursor,
      },
    };
  }

  async findOne(tenantId: number, id: number) {
    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { id, tenantId },
      include: {
        tenant: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        versions: {
          orderBy: { version: 'desc' },
        },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID ${id} not found`);
    }

    return workflow;
  }

  async findVersions(tenantId: number, id: number) {
    await this.ensureWorkflowExists(id, tenantId);

    const versions = await this.prisma.workflowVersion.findMany({
      where: { workflowDefinitionId: id },
      orderBy: { version: 'desc' },
    });

    return versions;
  }

  async getVersion(tenantId: number, id: number, version: number) {
    await this.ensureWorkflowExists(id, tenantId);

    const workflowVersion = await this.prisma.workflowVersion.findUnique({
      where: {
        workflowDefinitionId_version: {
          workflowDefinitionId: id,
          version,
        },
      },
    });

    if (!workflowVersion) {
      throw new NotFoundException(`Version ${version} not found for workflow ${id}`);
    }

    return workflowVersion;
  }

  async update(userId: number, tenantId: number, id: number, dto: UpdateWorkflowDto) {
    await this.ensureWorkflowExists(id, tenantId);

    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { id, tenantId },
    });

    // If definition is being updated, create a new version
    if (dto.definition) {
      this.validateDag(dto.definition.nodes, dto.definition.edges);

      const latestVersion = await this.prisma.workflowVersion.findFirst({
        where: { workflowDefinitionId: id },
        orderBy: { version: 'desc' },
      });

      const newVersion = (latestVersion?.version || 0) + 1;

      await this.prisma.workflowVersion.create({
        data: {
          workflowDefinitionId: id,
          version: newVersion,
          definition: dto.definition as any,
        },
      });
    }

    // Update basic info
    const updated = await this.prisma.workflowDefinition.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
        },
      },
    });

    return updated;
  }

  async rollback(tenantId: number, id: number, targetVersion: number) {
    await this.ensureWorkflowExists(id, tenantId);

    const versionToRollback = await this.prisma.workflowVersion.findUnique({
      where: {
        workflowDefinitionId_version: {
          workflowDefinitionId: id,
          version: targetVersion,
        },
      },
    });

    if (!versionToRollback) {
      throw new NotFoundException(`Version ${targetVersion} not found`);
    }

    const latestVersion = await this.prisma.workflowVersion.findFirst({
      where: { workflowDefinitionId: id },
      orderBy: { version: 'desc' },
    });

    // Create a new version with the content of the target version
    const newVersion = (latestVersion?.version || 0) + 1;

    const rolledBack = await this.prisma.workflowVersion.create({
      data: {
        workflowDefinitionId: id,
        version: newVersion,
        definition: versionToRollback.definition as any,
      },
    });

    return {
      message: `Successfully rolled back to version ${targetVersion} as version ${newVersion}`,
      version: rolledBack,
    };
  }

  async updateStatus(tenantId: number, id: number, status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED') {
    await this.ensureWorkflowExists(id, tenantId);

    return this.prisma.workflowDefinition.update({
      where: { id },
      data: { status },
    });
  }

  async delete(tenantId: number, id: number) {
    await this.ensureWorkflowExists(id, tenantId);

    await this.prisma.workflowDefinition.delete({
      where: { id },
    });

    return { message: `Workflow ${id} deleted successfully` };
  }

  private async ensureWorkflowExists(id: number, tenantId: number) {
    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { id, tenantId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID ${id} not found`);
    }
  }

  private validateDag(nodes: any[], edges: any[]) {
    if (!nodes || nodes.length === 0) {
      throw new BadRequestException('Workflow must have at least one node');
    }

    const nodeIds = new Set(nodes.map((n) => n.id));

    // Check all edges reference valid nodes
    for (const edge of edges) {
      if (!nodeIds.has(edge.from)) {
        throw new BadRequestException(`Edge references non-existent node: ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        throw new BadRequestException(`Edge references non-existent node: ${edge.to}`);
      }
    }

    // Check for cycles using DFS
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
          if (hasCycle(neighbor)) return true;
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
          throw new BadRequestException('Workflow definition contains a cycle - DAG is required');
        }
      }
    }
  }
}

import { PrismaClient, Role, StepType, StepStatus, RunStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...\n');

  // Define tenants
  const tenants = [
    {
      name: 'FlowForge Demo',
      slug: 'flowforge-demo',
      description: 'Demo tenant for FlowForge platform testing',
    },
    {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      description: 'Enterprise technology solutions provider',
    },
    {
      name: 'TechStart Indonesia',
      slug: 'techstart-id',
      description: 'Indonesian startup focused on fintech innovation',
    },
    {
      name: 'Global Systems Inc',
      slug: 'global-systems',
      description: 'Global enterprise with distributed teams',
    },
    {
      name: 'DevOps Automation Co',
      slug: 'devops-auto',
      description: 'DevOps and CI/CD automation specialist',
    },
  ];

  // Create tenants
  for (const tenantData of tenants) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: tenantData.slug },
      update: {},
      create: {
        name: tenantData.name,
        slug: tenantData.slug,
        isActive: true,
      },
    });
    console.log(`✓ Created tenant: ${tenant.name}`);
  }

  // Password hash for "password123" - bcrypt hash
  const passwordHash = '$2b$10$Lz2kyo8DJ2sKP5To6kuuvOQKtVorzQQPsNN0xveB2NOPGg6xzi/xC';

  // Create users for each tenant
  const tenantSlugs = tenants.map((t) => t.slug);
  const usersData = [
    { email: 'admin@flowforge.dev', name: 'Admin User', role: Role.ADMIN, tenantSlug: 'flowforge-demo' },
    { email: 'editor@flowforge.dev', name: 'Editor User', role: Role.EDITOR, tenantSlug: 'flowforge-demo' },
    { email: 'viewer@flowforge.dev', name: 'Viewer User', role: Role.VIEWER, tenantSlug: 'flowforge-demo' },
    { email: 'admin@acme.corp', name: 'Sarah Mitchell', role: Role.ADMIN, tenantSlug: 'acme-corp' },
    { email: 'dev@acme.corp', name: 'James Wilson', role: Role.EDITOR, tenantSlug: 'acme-corp' },
    { email: 'analyst@acme.corp', name: 'Emily Chen', role: Role.VIEWER, tenantSlug: 'acme-corp' },
    { email: 'admin@techstart.id', name: 'Budi Santoso', role: Role.ADMIN, tenantSlug: 'techstart-id' },
    { email: 'developer@techstart.id', name: 'Anita Putri', role: Role.EDITOR, tenantSlug: 'techstart-id' },
    { email: 'admin@global.systems', name: 'Michael Brown', role: Role.ADMIN, tenantSlug: 'global-systems' },
    { email: 'engineer@global.systems', name: 'Lisa Anderson', role: Role.EDITOR, tenantSlug: 'global-systems' },
    { email: 'viewer@global.systems', name: 'David Kim', role: Role.VIEWER, tenantSlug: 'global-systems' },
    { email: 'admin@devops.auto', name: 'Alex Turner', role: Role.ADMIN, tenantSlug: 'devops-auto' },
    { email: 'pipeline@devops.auto', name: 'Maria Garcia', role: Role.EDITOR, tenantSlug: 'devops-auto' },
  ];

  const users: Record<string, { id: number; email: string; tenantId: number }> = {};

  for (const userData of usersData) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: userData.tenantSlug } });
    if (!tenant) continue;

    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        password: passwordHash,
        name: userData.name,
        role: userData.role,
        tenantId: tenant.id,
        isActive: true,
      },
    });
    users[userData.email] = { id: user.id, email: user.email, tenantId: user.tenantId };
    console.log(`  ✓ Created user: ${user.email} (${user.role})`);
  }

  // Create workflows for each tenant
  const workflowsData = [
    // FlowForge Demo
    {
      tenantSlug: 'flowforge-demo',
      name: 'User Onboarding Workflow',
      description: 'Automated user onboarding with email verification and profile setup',
      createdByEmail: 'admin@flowforge.dev',
    },
    {
      tenantSlug: 'flowforge-demo',
      name: 'Data Sync Pipeline',
      description: 'Synchronize data between external API and internal database',
      createdByEmail: 'editor@flowforge.dev',
    },
    // Acme Corp
    {
      tenantSlug: 'acme-corp',
      name: 'Order Processing Pipeline',
      description: 'End-to-end order fulfillment workflow with inventory check',
      createdByEmail: 'admin@acme.corp',
    },
    {
      tenantSlug: 'acme-corp',
      name: 'Customer Notification Service',
      description: 'Send notifications via email, SMS, and push channels',
      createdByEmail: 'dev@acme.corp',
    },
    {
      tenantSlug: 'acme-corp',
      name: 'Monthly Report Generator',
      description: 'Generate and distribute monthly business reports',
      createdByEmail: 'analyst@acme.corp',
    },
    // TechStart Indonesia
    {
      tenantSlug: 'techstart-id',
      name: 'Payment Verification Flow',
      description: 'Verify and process payment transactions with fraud detection',
      createdByEmail: 'admin@techstart.id',
    },
    {
      tenantSlug: 'techstart-id',
      name: 'KYC Document Processing',
      description: 'Process and validate customer KYC documents',
      createdByEmail: 'developer@techstart.id',
    },
    // Global Systems
    {
      tenantSlug: 'global-systems',
      name: 'Infrastructure Provisioning',
      description: 'Automated cloud infrastructure setup and configuration',
      createdByEmail: 'admin@global.systems',
    },
    {
      tenantSlug: 'global-systems',
      name: 'Backup and Recovery',
      description: 'Automated backup scheduling with disaster recovery',
      createdByEmail: 'engineer@global.systems',
    },
    // DevOps Automation
    {
      tenantSlug: 'devops-auto',
      name: 'CI/CD Pipeline',
      description: 'Continuous integration and deployment automation',
      createdByEmail: 'admin@devops.auto',
    },
    {
      tenantSlug: 'devops-auto',
      name: 'Security Scanning Workflow',
      description: 'Automated security vulnerability scanning and reporting',
      createdByEmail: 'pipeline@devops.auto',
    },
    {
      tenantSlug: 'devops-auto',
      name: 'Infrastructure Monitoring',
      description: 'Real-time infrastructure health monitoring and alerting',
      createdByEmail: 'admin@devops.auto',
    },
  ];

  const workflowIds: number[] = [];
  let workflowCounter = 1;

  for (const wfData of workflowsData) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: wfData.tenantSlug } });
    const creator = users[wfData.createdByEmail];
    if (!tenant || !creator) continue;

    const workflow = await prisma.workflowDefinition.upsert({
      where: { id: workflowCounter },
      update: {},
      create: {
        name: wfData.name,
        description: wfData.description,
        tenantId: tenant.id,
        createdById: creator.id,
        isActive: true,
      },
    });
    workflowIds.push(workflow.id);

    // Create version 1 for each workflow
    await prisma.workflowVersion.upsert({
      where: {
        workflowDefinitionId_version: {
          workflowDefinitionId: workflow.id,
          version: 1,
        },
      },
      update: {},
      create: {
        workflowDefinitionId: workflow.id,
        version: 1,
        definition: {
          nodes: [
            { id: 'start', type: 'START', name: 'Start' },
            { id: 'step1', type: 'HTTP_CALL', name: 'Initialize', config: { url: 'https://api.example.com/init' } },
            { id: 'step2', type: 'DELAY', name: 'Wait', config: { delay: 2000 } },
            { id: 'step3', type: 'SCRIPT', name: 'Process', config: { script: 'return { status: "ok" }' } },
            { id: 'end', type: 'END', name: 'End' },
          ],
          edges: [
            { from: 'start', to: 'step1' },
            { from: 'step1', to: 'step2' },
            { from: 'step2', to: 'step3' },
            { from: 'step3', to: 'end' },
          ],
        },
      },
    });

    console.log(`  ✓ Created workflow: ${workflow.name} (v1)`);
    workflowCounter++;
  }

  // Create workflow runs with different statuses
  const runStatuses = [
    { status: RunStatus.SUCCESS, count: 5 },
    { status: RunStatus.FAILED, count: 2 },
    { status: RunStatus.RUNNING, count: 2 },
    { status: RunStatus.PENDING, count: 1 },
  ];

  let runCounter = 1;
  for (let i = 0; i < workflowIds.length; i++) {
    const workflowId = workflowIds[i];
    const wfVersion = await prisma.workflowVersion.findFirst({ where: { workflowDefinitionId: workflowId } });
    if (!wfVersion) continue;

    const statusCount = runStatuses[i % runStatuses.length];

    for (let j = 0; j < statusCount.count; j++) {
      const isCompleted = statusCount.status === RunStatus.SUCCESS || statusCount.status === RunStatus.FAILED;
      const startedAt = new Date(Date.now() - Math.random() * 86400000 * 7); // Random within 7 days

      await prisma.workflowRun.upsert({
        where: { id: runCounter },
        update: {},
        create: {
          workflowDefinitionId: workflowId,
          workflowVersionId: wfVersion.id,
          status: statusCount.status,
          startedAt: startedAt,
          completedAt: isCompleted ? new Date(startedAt.getTime() + Math.random() * 60000) : null,
        },
      });

      // Create step runs for each workflow run
      const stepDefs = [
        { stepId: 'step1', stepName: 'Initialize', stepType: StepType.HTTP_CALL },
        { stepId: 'step2', stepName: 'Wait', stepType: StepType.DELAY },
        { stepId: 'step3', stepName: 'Process', stepType: StepType.SCRIPT },
      ];

      for (let k = 0; k < stepDefs.length; k++) {
        const stepDef = stepDefs[k];
        let stepStatus: StepStatus = StepStatus.SUCCESS;

        if (statusCount.status === RunStatus.FAILED && k === 1) {
          stepStatus = StepStatus.FAILED;
        } else if (statusCount.status === RunStatus.RUNNING) {
          stepStatus = k < 2 ? StepStatus.SUCCESS : StepStatus.RUNNING;
        } else if (statusCount.status === RunStatus.PENDING) {
          stepStatus = StepStatus.PENDING;
        }

        await prisma.stepRun.upsert({
          where: { id: runCounter * 10 + k },
          update: {},
          create: {
            workflowRunId: runCounter,
            stepId: stepDef.stepId,
            stepName: stepDef.stepName,
            stepType: stepDef.stepType,
            status: stepStatus,
            retryCount: (stepStatus as string) === 'FAILED' ? 3 : 0,
            maxRetries: 3,
            output: (stepStatus as string) === 'SUCCESS' ? { result: 'success' } : undefined,
            error: (stepStatus as string) === 'FAILED' ? 'Connection timeout after 30000ms' : undefined,
            startedAt: new Date(startedAt.getTime() + k * 10000),
            completedAt: (stepStatus as string) === 'SUCCESS' ? new Date(startedAt.getTime() + (k + 1) * 10000) : undefined,
          },
        });
      }

      runCounter++;
    }
  }

  console.log(`\n✅ Database seed completed successfully!`);
  console.log(`   - ${tenants.length} tenants`);
  console.log(`   - ${usersData.length} users`);
  console.log(`   - ${workflowsData.length} workflows`);
  console.log(`   - ${runCounter - 1} workflow runs`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    // @ts-ignore
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

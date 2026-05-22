import { PrismaClient, Role, StepType, StepStatus, RunStatus, LogLevel } from '@prisma/client';

const prisma = new PrismaClient();

// Password hash for "password123"
const PASSWORD_HASH = '$2b$10$Lz2kyo8DJ2sKP5To6kuuvOQKtVorzQQPsNN0xveB2NOPGg6xzi/xC';

// DAG definition template
const createDAGDefinition = (stepName: string) => ({
  nodes: [
    { id: 'start', type: 'START', name: 'Start' },
    { id: 'step1', type: 'HTTP_CALL', name: `Fetch ${stepName}`, config: { url: `https://api.example.com/${stepName.toLowerCase().replace(/\s+/g, '-')}` } },
    { id: 'step2', type: 'DELAY', name: 'Processing Delay', config: { delay: 1000 } },
    { id: 'step3', type: 'SCRIPT', name: 'Validate & Transform', config: { script: `return { status: "processed", data: "${stepName}" }` } },
    { id: 'step4', type: 'CONDITIONAL', name: 'Check Result', config: { condition: 'status === "processed"' } },
    { id: 'step5', type: 'HTTP_CALL', name: 'Notify Success', config: { url: 'https://api.example.com/notify' } },
    { id: 'end', type: 'END', name: 'End' },
  ],
  edges: [
    { from: 'start', to: 'step1' },
    { from: 'step1', to: 'step2' },
    { from: 'step2', to: 'step3' },
    { from: 'step3', to: 'step4' },
    { from: 'step4', to: 'step5', condition: 'true' },
    { from: 'step5', to: 'end' },
  ],
});

async function main() {
  console.log('Starting database seed...\n');

  // Create tenants
  const tenants = [
    { name: 'FlowForge Demo', slug: 'flowforge-demo', description: 'Demo tenant for FlowForge platform' },
    { name: 'Acme Corporation', slug: 'acme-corp', description: 'Enterprise technology solutions' },
    { name: 'TechStart Indonesia', slug: 'techstart-id', description: 'Indonesian fintech startup' },
    { name: 'Global Systems Inc', slug: 'global-systems', description: 'Global enterprise with distributed teams' },
    { name: 'DevOps Automation Co', slug: 'devops-auto', description: 'DevOps and CI/CD specialist' },
  ];

  const createdTenants: Record<string, { id: number; name: string; slug: string }> = {};
  for (const tenant of tenants) {
    const created = await prisma.tenant.upsert({
      where: { slug: tenant.slug },
      update: {},
      create: { name: tenant.name, slug: tenant.slug, isActive: true },
    });
    createdTenants[tenant.slug] = created;
    console.log(`✓ Tenant: ${created.name}`);
  }

  // Create users - each tenant has Admin, Editor, Viewer + 2 extra users for demo variety
  const usersData = [
    // FlowForge Demo
    { email: 'admin@flowforge.dev', name: 'Admin User', role: Role.ADMIN, tenantSlug: 'flowforge-demo' },
    { email: 'editor@flowforge.dev', name: 'Editor User', role: Role.EDITOR, tenantSlug: 'flowforge-demo' },
    { email: 'viewer@flowforge.dev', name: 'Viewer User', role: Role.VIEWER, tenantSlug: 'flowforge-demo' },
    { email: 'dev@flowforge.dev', name: 'Developer User', role: Role.EDITOR, tenantSlug: 'flowforge-demo' },
    // Acme Corp
    { email: 'admin@acme.corp', name: 'Sarah Mitchell', role: Role.ADMIN, tenantSlug: 'acme-corp' },
    { email: 'dev@acme.corp', name: 'James Wilson', role: Role.EDITOR, tenantSlug: 'acme-corp' },
    { email: 'analyst@acme.corp', name: 'Emily Chen', role: Role.VIEWER, tenantSlug: 'acme-corp' },
    { email: 'lead@acme.corp', name: 'Robert Taylor', role: Role.EDITOR, tenantSlug: 'acme-corp' },
    // TechStart Indonesia
    { email: 'admin@techstart.id', name: 'Budi Santoso', role: Role.ADMIN, tenantSlug: 'techstart-id' },
    { email: 'developer@techstart.id', name: 'Anita Putri', role: Role.EDITOR, tenantSlug: 'techstart-id' },
    { email: 'qa@techstart.id', name: 'Dewi Lestari', role: Role.VIEWER, tenantSlug: 'techstart-id' },
    { email: 'lead@techstart.id', name: 'Ahmad Rizki', role: Role.EDITOR, tenantSlug: 'techstart-id' },
    // Global Systems
    { email: 'admin@global.systems', name: 'Michael Brown', role: Role.ADMIN, tenantSlug: 'global-systems' },
    { email: 'engineer@global.systems', name: 'Lisa Anderson', role: Role.EDITOR, tenantSlug: 'global-systems' },
    { email: 'viewer@global.systems', name: 'David Kim', role: Role.VIEWER, tenantSlug: 'global-systems' },
    { email: 'ops@global.systems', name: 'Jennifer Martinez', role: Role.EDITOR, tenantSlug: 'global-systems' },
    // DevOps Automation
    { email: 'admin@devops.auto', name: 'Alex Turner', role: Role.ADMIN, tenantSlug: 'devops-auto' },
    { email: 'pipeline@devops.auto', name: 'Maria Garcia', role: Role.EDITOR, tenantSlug: 'devops-auto' },
    { email: 'sre@devops.auto', name: 'Chris Johnson', role: Role.EDITOR, tenantSlug: 'devops-auto' },
    { email: 'intern@devops.auto', name: 'Sam Wilson', role: Role.VIEWER, tenantSlug: 'devops-auto' },
  ];

  const users: Record<string, { id: number; email: string; tenantId: number }> = {};
  for (const userData of usersData) {
    const tenant = createdTenants[userData.tenantSlug];
    if (!tenant) continue;

    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        password: PASSWORD_HASH,
        name: userData.name,
        role: userData.role,
        tenantId: tenant.id,
        isActive: true,
      },
    });
    users[userData.email] = { id: user.id, email: user.email, tenantId: user.tenantId };
    console.log(`  ✓ User: ${user.email} (${user.role})`);
  }

  // Workflow templates per tenant for variety
  const workflowTemplates: Record<string, string[]> = {
    'flowforge-demo': [
      'User Onboarding Workflow',
      'Data Sync Pipeline',
      'Email Notification Service',
      'Report Generation Pipeline',
    ],
    'acme-corp': [
      'Order Processing Pipeline',
      'Customer Notification Service',
      'Inventory Check Workflow',
      'Monthly Report Generator',
      'Invoice Processing',
    ],
    'techstart-id': [
      'Payment Verification Flow',
      'KYC Document Processing',
      'Transaction Monitoring',
      'Fraud Detection Pipeline',
    ],
    'global-systems': [
      'Infrastructure Provisioning',
      'Backup and Recovery',
      'Server Health Check',
      'Deployment Automation',
    ],
    'devops-auto': [
      'CI/CD Pipeline',
      'Security Scanning Workflow',
      'Infrastructure Monitoring',
      'Log Aggregation Service',
      'Alert Management System',
    ],
  };

  // Create workflows - each user creates 2-3 workflows
  let workflowIdCounter = 1;
  const workflows: { id: number; name: string; tenantId: number; createdById: number }[] = [];

  for (const userEmail of Object.keys(users)) {
    const user = users[userEmail];
    const templates = workflowTemplates[Object.keys(createdTenants).find(slug => createdTenants[slug].id === user.tenantId) || ''] || [];

    // Each user creates 2-3 workflows
    const userWfCount = 2 + (workflowIdCounter % 2);
    for (let i = 0; i < userWfCount && i < templates.length; i++) {
      const templateName = templates[(workflowIdCounter + i) % templates.length];
      const workflowName = `${templateName} ${user.email.split('@')[0].split('.')[0].toUpperCase()}`;

      const workflow = await prisma.workflowDefinition.upsert({
        where: { id: workflowIdCounter },
        update: {},
        create: {
          name: workflowName,
          description: `${templateName} managed by ${user.email}`,
          tenantId: user.tenantId,
          createdById: user.id,
          isActive: workflowIdCounter % 5 !== 0, // Some workflows are "draft" (inactive)
        },
      });

      workflows.push({
        id: workflow.id,
        name: workflow.name,
        tenantId: workflow.tenantId,
        createdById: workflow.createdById,
      });

      // Create 1-2 versions per workflow
      const versionCount = 1 + (workflowIdCounter % 2);
      for (let v = 1; v <= versionCount; v++) {
        await prisma.workflowVersion.upsert({
          where: {
            workflowDefinitionId_version: {
              workflowDefinitionId: workflow.id,
              version: v,
            },
          },
          update: {},
          create: {
            workflowDefinitionId: workflow.id,
            version: v,
            definition: createDAGDefinition(workflowName),
          },
        });
      }

      console.log(`  ✓ Workflow: ${workflow.name} (${versionCount} version${versionCount > 1 ? 's' : ''})`);
      workflowIdCounter++;
    }
  }

  // Create workflow runs - each workflow has multiple runs with varied statuses
  const runStatuses = [
    'SUCCESS' as const,
    'SUCCESS' as const,
    'SUCCESS' as const,
    'FAILED' as const,
    'RUNNING' as const,
    'PENDING' as const,
  ];

  let runIdCounter = 1;
  let totalRuns = 0;
  let totalSteps = 0;
  let totalLogs = 0;

  for (const workflow of workflows) {
    // Each workflow has 5-10 runs
    const runCount = 5 + (workflow.id % 6);

    for (let r = 0; r < runCount; r++) {
      const status = runStatuses[runIdCounter % runStatuses.length] as RunStatus;
      const isCompleted = status === 'SUCCESS' || status === 'FAILED';
      const startedAt = new Date(Date.now() - Math.random() * 86400000 * 30); // Random within 30 days

      const run = await prisma.workflowRun.upsert({
        where: { id: runIdCounter },
        update: {},
        create: {
          workflowDefinitionId: workflow.id,
          workflowVersionId: workflow.id, // Use workflow id as version id (simplified)
          status,
          startedAt,
          completedAt: isCompleted ? new Date(startedAt.getTime() + Math.random() * 60000 + 5000) : null,
        },
      });

      // Create step runs for each run
      const stepDefs = [
        { stepId: 'step1', stepName: 'Fetch Data', stepType: StepType.HTTP_CALL },
        { stepId: 'step2', stepName: 'Processing Delay', stepType: StepType.DELAY },
        { stepId: 'step3', stepName: 'Validate & Transform', stepType: StepType.SCRIPT },
        { stepId: 'step4', stepName: 'Check Result', stepType: StepType.CONDITIONAL },
        { stepId: 'step5', stepName: 'Notify', stepType: StepType.HTTP_CALL },
      ];

      for (let s = 0; s < stepDefs.length; s++) {
        const stepDef = stepDefs[s];
        let stepStatus: StepStatus = StepStatus.SUCCESS;

        if (status === 'FAILED' && s === 2) {
          stepStatus = StepStatus.FAILED;
        } else if (status === 'RUNNING') {
          stepStatus = s < 3 ? StepStatus.SUCCESS : StepStatus.RUNNING;
        } else if (status === 'PENDING') {
          stepStatus = StepStatus.PENDING;
        }

        const stepStartedAt = new Date(startedAt.getTime() + s * 5000);
        const stepCompletedAt = stepStatus === StepStatus.SUCCESS || stepStatus === StepStatus.FAILED
          ? new Date(stepStartedAt.getTime() + Math.random() * 3000 + 1000)
          : null;

        const stepRun = await prisma.stepRun.upsert({
          where: { id: runIdCounter * 100 + s },
          update: {},
          create: {
            workflowRunId: run.id,
            stepId: stepDef.stepId,
            stepName: stepDef.stepName,
            stepType: stepDef.stepType,
            status: stepStatus,
            retryCount: stepStatus === StepStatus.FAILED ? (s === 2 ? 3 : 1) : 0,
            maxRetries: 3,
            output: stepStatus === StepStatus.SUCCESS ? { result: 'success', duration: Math.floor(Math.random() * 1000) } : undefined,
            error: stepStatus === StepStatus.FAILED ? 'Connection timeout after 30000ms' : undefined,
            startedAt: stepStartedAt,
            completedAt: stepCompletedAt,
            userId: s === 2 ? workflow.createdById : undefined, // Assign processing step to creator
          },
        });

        // Create logs for each step run
        const logCount = 2 + Math.floor(Math.random() * 4);
        for (let l = 0; l < logCount; l++) {
          const logLevel = l === 0 ? LogLevel.INFO : (Math.random() > 0.8 ? LogLevel.WARN : LogLevel.DEBUG);
          await prisma.stepLog.create({
            data: {
              stepRunId: stepRun.id,
              level: logLevel,
              message: l === 0
                ? `[${stepDef.stepName}] Started execution`
                : l === logCount - 1
                  ? `[${stepDef.stepName}] ${stepStatus === StepStatus.SUCCESS ? 'Completed successfully' : 'Failed with error'}`
                  : `[${stepDef.stepName}] Processing step ${l + 1}/${logCount}`,
              metadata: { stepIndex: s, logIndex: l, timestamp: new Date().toISOString() },
            },
          });
          totalLogs++;
        }
        totalSteps++;
      }

      totalRuns++;
      runIdCounter++;
    }
  }

  console.log(`\n✅ Database seed completed successfully!`);
  console.log(`   - ${tenants.length} tenants`);
  console.log(`   - ${usersData.length} users`);
  console.log(`   - ${workflows.length} workflows`);
  console.log(`   - ${totalRuns} workflow runs`);
  console.log(`   - ${totalSteps} step runs`);
  console.log(`   - ${totalLogs} step logs`);
  console.log(`\n📧 All users password: password123`);
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

import { PrismaClient, WorkflowStatus, StepType, StepStatus, RunStatus, LogLevel } from '@prisma/client';

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

  // Create roles
  const roles = await Promise.all([
    prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } }),
    prisma.role.upsert({ where: { name: 'EDITOR' }, update: {}, create: { name: 'EDITOR' } }),
    prisma.role.upsert({ where: { name: 'VIEWER' }, update: {}, create: { name: 'VIEWER' } }),
  ]);
  const roleMap = Object.fromEntries(roles.map(r => [r.name, r.id]));
  console.log(`✓ Roles created: ADMIN=${roleMap.ADMIN}, EDITOR=${roleMap.EDITOR}, VIEWER=${roleMap.VIEWER}`);

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
    const created = await prisma.tenant.create({
      data: { name: tenant.name, slug: tenant.slug, isActive: true },
    });
    createdTenants[tenant.slug] = created;
    console.log(`✓ Tenant: ${created.name}`);
  }

  // Create users - 5-6 users per tenant = 25-30 users total
  const usersData = [
    // FlowForge Demo (6 users)
    { email: 'admin@flowforge.dev', name: 'Admin User', roleName: 'ADMIN', tenantSlug: 'flowforge-demo' },
    { email: 'editor@flowforge.dev', name: 'Editor User', roleName: 'EDITOR', tenantSlug: 'flowforge-demo' },
    { email: 'viewer@flowforge.dev', name: 'Viewer User', roleName: 'VIEWER', tenantSlug: 'flowforge-demo' },
    { email: 'dev1@flowforge.dev', name: 'Developer One', roleName: 'EDITOR', tenantSlug: 'flowforge-demo' },
    { email: 'dev2@flowforge.dev', name: 'Developer Two', roleName: 'EDITOR', tenantSlug: 'flowforge-demo' },
    { email: 'analyst@flowforge.dev', name: 'Analyst User', roleName: 'VIEWER', tenantSlug: 'flowforge-demo' },
    // Acme Corp (6 users)
    { email: 'admin@acme.corp', name: 'Sarah Mitchell', roleName: 'ADMIN', tenantSlug: 'acme-corp' },
    { email: 'dev@acme.corp', name: 'James Wilson', roleName: 'EDITOR', tenantSlug: 'acme-corp' },
    { email: 'analyst@acme.corp', name: 'Emily Chen', roleName: 'VIEWER', tenantSlug: 'acme-corp' },
    { email: 'lead@acme.corp', name: 'Robert Taylor', roleName: 'EDITOR', tenantSlug: 'acme-corp' },
    { email: 'qa@acme.corp', name: 'Linda Martinez', roleName: 'VIEWER', tenantSlug: 'acme-corp' },
    { email: 'intern@acme.corp', name: 'Kevin Lee', roleName: 'VIEWER', tenantSlug: 'acme-corp' },
    // TechStart Indonesia (6 users)
    { email: 'admin@techstart.id', name: 'Budi Santoso', roleName: 'ADMIN', tenantSlug: 'techstart-id' },
    { email: 'developer@techstart.id', name: 'Anita Putri', roleName: 'EDITOR', tenantSlug: 'techstart-id' },
    { email: 'qa@techstart.id', name: 'Dewi Lestari', roleName: 'VIEWER', tenantSlug: 'techstart-id' },
    { email: 'lead@techstart.id', name: 'Ahmad Rizki', roleName: 'EDITOR', tenantSlug: 'techstart-id' },
    { email: 'dev@techstart.id', name: 'Rina Wati', roleName: 'EDITOR', tenantSlug: 'techstart-id' },
    { email: 'analyst@techstart.id', name: 'Joko Pramono', roleName: 'VIEWER', tenantSlug: 'techstart-id' },
    // Global Systems (5 users)
    { email: 'admin@global.systems', name: 'Michael Brown', roleName: 'ADMIN', tenantSlug: 'global-systems' },
    { email: 'engineer@global.systems', name: 'Lisa Anderson', roleName: 'EDITOR', tenantSlug: 'global-systems' },
    { email: 'viewer@global.systems', name: 'David Kim', roleName: 'VIEWER', tenantSlug: 'global-systems' },
    { email: 'ops@global.systems', name: 'Jennifer Martinez', roleName: 'EDITOR', tenantSlug: 'global-systems' },
    { email: 'sre@global.systems', name: 'Thomas Lee', roleName: 'EDITOR', tenantSlug: 'global-systems' },
    // DevOps Automation (6 users)
    { email: 'admin@devops.auto', name: 'Alex Turner', roleName: 'ADMIN', tenantSlug: 'devops-auto' },
    { email: 'pipeline@devops.auto', name: 'Maria Garcia', roleName: 'EDITOR', tenantSlug: 'devops-auto' },
    { email: 'sre@devops.auto', name: 'Chris Johnson', roleName: 'EDITOR', tenantSlug: 'devops-auto' },
    { email: 'intern@devops.auto', name: 'Sam Wilson', roleName: 'VIEWER', tenantSlug: 'devops-auto' },
    { email: 'devops1@devops.auto', name: 'Rachel Green', roleName: 'EDITOR', tenantSlug: 'devops-auto' },
    { email: 'devops2@devops.auto', name: 'Mark Davis', roleName: 'VIEWER', tenantSlug: 'devops-auto' },
  ];

  const users: Record<string, { id: number; email: string; tenantId: number }> = {};
  for (const userData of usersData) {
    const tenant = createdTenants[userData.tenantSlug];
    if (!tenant) continue;

    const user = await prisma.user.create({
      data: {
        email: userData.email,
        password: PASSWORD_HASH,
        name: userData.name,
        roleId: roleMap[userData.roleName as keyof typeof roleMap],
        tenantId: tenant.id,
        isActive: true,
      },
    });
    users[userData.email] = { id: user.id, email: user.email, tenantId: user.tenantId };
    console.log(`  ✓ User: ${user.email} (${userData.roleName})`);
  }

  // Workflow templates per tenant
  const workflowTemplates: Record<string, string[]> = {
    'flowforge-demo': [
      'User Onboarding Workflow',
      'Data Sync Pipeline',
      'Email Notification Service',
      'Report Generation Pipeline',
      'Lead Scoring Automation',
    ],
    'acme-corp': [
      'Order Processing Pipeline',
      'Customer Notification Service',
      'Inventory Check Workflow',
      'Monthly Report Generator',
      'Invoice Processing',
      'Shipping Tracking Workflow',
    ],
    'techstart-id': [
      'Payment Verification Flow',
      'KYC Document Processing',
      'Transaction Monitoring',
      'Fraud Detection Pipeline',
      'Balance Check Automation',
    ],
    'global-systems': [
      'Infrastructure Provisioning',
      'Backup and Recovery',
      'Server Health Check',
      'Deployment Automation',
      'Certificate Renewal',
    ],
    'devops-auto': [
      'CI/CD Pipeline',
      'Security Scanning Workflow',
      'Infrastructure Monitoring',
      'Log Aggregation Service',
      'Alert Management System',
      'Secret Rotation',
    ],
  };

  // Create workflows - each user creates 2-3 workflows with varied statuses
  let workflowIdCounter = 1;
  const workflows: { id: number; name: string; tenantId: number; createdById: number; status: WorkflowStatus }[] = [];

  for (const userEmail of Object.keys(users)) {
    const user = users[userEmail];
    const templates = workflowTemplates[Object.keys(createdTenants).find(slug => createdTenants[slug].id === user.tenantId) || ''] || [];

    // Each user creates 2-3 workflows
    const userWfCount = 2 + (workflowIdCounter % 2);
    for (let i = 0; i < userWfCount && i < templates.length; i++) {
      const templateName = templates[(workflowIdCounter + i) % templates.length];
      const workflowName = `${templateName} ${user.email.split('@')[0].split('.')[0].toUpperCase()}`;

      // Determine workflow status: active, draft, or archived
      const statusVariant = workflowIdCounter % 10;
      let status: WorkflowStatus = WorkflowStatus.ACTIVE;
      if (statusVariant === 0) {
        status = WorkflowStatus.DRAFT;
      } else if (statusVariant === 1) {
        status = WorkflowStatus.ARCHIVED;
      }

      const workflow = await prisma.workflowDefinition.create({
        data: {
          name: workflowName,
          description: `${templateName} managed by ${user.email}`,
          tenantId: user.tenantId,
          createdById: user.id,
          status,
        },
      });

      workflows.push({
        id: workflow.id,
        name: workflow.name,
        tenantId: workflow.tenantId,
        createdById: workflow.createdById,
        status: workflow.status,
      });

      // Create 1-2 versions per workflow
      const versionCount = 1 + (workflowIdCounter % 2);
      for (let v = 1; v <= versionCount; v++) {
        await prisma.workflowVersion.create({
          data: {
            workflowDefinitionId: workflow.id,
            version: v,
            definition: createDAGDefinition(workflowName),
          },
        });
      }

      console.log(`  ✓ Workflow: ${workflow.name} (v${versionCount}) [${status.toLowerCase()}]`);
      workflowIdCounter++;
    }
  }

  // Create workflow runs - each workflow has multiple runs with varied statuses
  const runStatuses: RunStatus[] = [
    RunStatus.SUCCESS,
    RunStatus.SUCCESS,
    RunStatus.SUCCESS,
    RunStatus.SUCCESS,
    RunStatus.FAILED,
    RunStatus.RUNNING,
    RunStatus.PENDING,
    RunStatus.TIMED_OUT,
  ];

  let runIdCounter = 1;
  let totalRuns = 0;
  let totalSteps = 0;
  let totalLogs = 0;

  for (const workflow of workflows) {
    // Each workflow has 5-10 runs
    const runCount = 5 + (workflow.id % 6);

    for (let r = 0; r < runCount; r++) {
      const status = runStatuses[runIdCounter % runStatuses.length];
      const isCompleted = status === RunStatus.SUCCESS || status === RunStatus.FAILED || status === RunStatus.TIMED_OUT;
      const startedAt = new Date(Date.now() - Math.random() * 86400000 * 30);

      const run = await prisma.workflowRun.create({
        data: {
          workflowDefinitionId: workflow.id,
          workflowVersionId: workflow.id,
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

        if (status === RunStatus.FAILED && s === 2) {
          stepStatus = StepStatus.FAILED;
        } else if (status === RunStatus.RUNNING) {
          stepStatus = s < 3 ? StepStatus.SUCCESS : StepStatus.RUNNING;
        } else if (status === RunStatus.PENDING) {
          stepStatus = StepStatus.PENDING;
        } else if (status === RunStatus.TIMED_OUT) {
          stepStatus = s < 4 ? StepStatus.SUCCESS : StepStatus.SKIPPED;
        }

        const stepStartedAt = new Date(startedAt.getTime() + s * 5000);
        const stepCompletedAt = stepStatus === StepStatus.SUCCESS || stepStatus === StepStatus.FAILED
          ? new Date(stepStartedAt.getTime() + Math.random() * 3000 + 1000)
          : null;

        const stepRun = await prisma.stepRun.create({
          data: {
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
            userId: s === 2 ? workflow.createdById : undefined,
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

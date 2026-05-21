import { PrismaClient, Role, StepType, StepStatus, RunStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'flowforge-demo' },
    update: {},
    create: {
      name: 'FlowForge Demo Tenant',
      slug: 'flowforge-demo',
      isActive: true,
    },
  });
  console.log(`Created tenant: ${tenant.name}`);

  // Create Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@flowforge.dev' },
    update: {},
    create: {
      email: 'admin@flowforge.dev',
      password: '$2b$10$8INGoLZNJ3eLeRts.n5B6exw2LWNr8ahzEhuOZBtnJ0NKMCHP./Ry', // bcrypt hash for "12345"
      name: 'Admin User',
      role: Role.ADMIN,
      tenantId: tenant.id,
      isActive: true,
    },
  });
  console.log(`Created admin user: ${adminUser.email}`);

  // Create Editor User
  const editorUser = await prisma.user.upsert({
    where: { email: 'editor@flowforge.dev' },
    update: {},
    create: {
      email: 'editor@flowforge.dev',
      password: '$2b$10$abcdefghijklmnopqrstuv', // Placeholder
      name: 'Editor User',
      role: Role.EDITOR,
      tenantId: tenant.id,
      isActive: true,
    },
  });
  console.log(`Created editor user: ${editorUser.email}`);

  // Create Viewer User
  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@flowforge.dev' },
    update: {},
    create: {
      email: 'viewer@flowforge.dev',
      password: '$2b$10$abcdefghijklmnopqrstuv', // Placeholder
      name: 'Viewer User',
      role: Role.VIEWER,
      tenantId: tenant.id,
      isActive: true,
    },
  });
  console.log(`Created viewer user: ${viewerUser.email}`);

  // Create Workflow Definition
  const workflow = await prisma.workflowDefinition.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Demo Workflow',
      description: 'A demo workflow for testing the orchestration engine',
      tenantId: tenant.id,
      createdById: adminUser.id,
      isActive: true,
    },
  });
  console.log(`Created workflow: ${workflow.name}`);

  // Create Workflow Version (v1)
  const workflowVersion = await prisma.workflowVersion.upsert({
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
          { id: 'start', type: 'START', name: 'Start Node' },
          { id: 'step1', type: 'HTTP_CALL', name: 'Fetch User Data', config: { url: 'https://api.example.com/users' } },
          { id: 'step2', type: 'DELAY', name: 'Wait 5 seconds', config: { delay: 5000 } },
          { id: 'step3', type: 'SCRIPT', name: 'Process Data', config: { script: 'return data.map(x => x * 2)' } },
          { id: 'end', type: 'END', name: 'End Node' },
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
  console.log(`Created workflow version: ${workflowVersion.version}`);

  // Create a Workflow Run (completed successfully)
  const completedRun = await prisma.workflowRun.upsert({
    where: { id: 1 },
    update: {},
    create: {
      workflowDefinitionId: workflow.id,
      workflowVersionId: workflowVersion.id,
      status: RunStatus.SUCCESS,
      startedAt: new Date(Date.now() - 60000),
      completedAt: new Date(),
    },
  });
  console.log(`Created completed workflow run: ${completedRun.id}`);

  // Create Step Runs for completed workflow
  const stepRuns = [
    { stepId: 'step1', stepName: 'Fetch User Data', stepType: StepType.HTTP_CALL, status: StepStatus.SUCCESS },
    { stepId: 'step2', stepName: 'Wait 5 seconds', stepType: StepType.DELAY, status: StepStatus.SUCCESS },
    { stepId: 'step3', stepName: 'Process Data', stepType: StepType.SCRIPT, status: StepStatus.SUCCESS },
  ];

  for (const step of stepRuns) {
    await prisma.stepRun.upsert({
      where: { id: stepRuns.indexOf(step) + 1 },
      update: {},
      create: {
        workflowRunId: completedRun.id,
        ...step,
        retryCount: 0,
        maxRetries: 3,
        output: { result: 'success' },
        startedAt: new Date(Date.now() - 50000),
        completedAt: new Date(Date.now() - 40000),
      },
    });
  }
  console.log(`Created ${stepRuns.length} step runs for completed workflow`);

  // Create a Workflow Run (failed)
  const failedRun = await prisma.workflowRun.upsert({
    where: { id: 2 },
    update: {},
    create: {
      workflowDefinitionId: workflow.id,
      workflowVersionId: workflowVersion.id,
      status: RunStatus.FAILED,
      startedAt: new Date(Date.now() - 120000),
      completedAt: new Date(Date.now() - 60000),
    },
  });
  console.log(`Created failed workflow run: ${failedRun.id}`);

  // Create Step Run for failed workflow
  await prisma.stepRun.upsert({
    where: { id: 4 },
    update: {},
    create: {
      workflowRunId: failedRun.id,
      stepId: 'step1',
      stepName: 'Fetch User Data',
      stepType: StepType.HTTP_CALL,
      status: StepStatus.FAILED,
      retryCount: 3,
      maxRetries: 3,
      error: 'Connection timeout after 30000ms',
      startedAt: new Date(Date.now() - 110000),
      completedAt: new Date(Date.now() - 60000),
    },
  });
  console.log('Created failed step run');

  // Create a running workflow
  const runningRun = await prisma.workflowRun.upsert({
    where: { id: 3 },
    update: {},
    create: {
      workflowDefinitionId: workflow.id,
      workflowVersionId: workflowVersion.id,
      status: RunStatus.RUNNING,
      startedAt: new Date(Date.now() - 10000),
    },
  });
  console.log(`Created running workflow run: ${runningRun.id}`);

  // Create Step Runs for running workflow
  await prisma.stepRun.upsert({
    where: { id: 5 },
    update: {},
    create: {
      workflowRunId: runningRun.id,
      stepId: 'step1',
      stepName: 'Fetch User Data',
      stepType: StepType.HTTP_CALL,
      status: StepStatus.SUCCESS,
      startedAt: new Date(Date.now() - 8000),
      completedAt: new Date(Date.now() - 5000),
      output: { data: [{ id: 1, name: 'John' }] },
    },
  });

  await prisma.stepRun.upsert({
    where: { id: 6 },
    update: {},
    create: {
      workflowRunId: runningRun.id,
      stepId: 'step2',
      stepName: 'Wait 5 seconds',
      stepType: StepType.DELAY,
      status: StepStatus.RUNNING,
      startedAt: new Date(Date.now() - 3000),
    },
  });
  console.log('Created running step runs');

  console.log('\n✅ Database seed completed successfully!');
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

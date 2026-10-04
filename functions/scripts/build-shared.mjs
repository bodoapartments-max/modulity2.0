import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const functionsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(functionsRoot, '..');
const outputRoot = resolve(functionsRoot, 'src/generated');
const files = [
  'src/agents/automat/automatContracts.js', 'src/agents/automat/buildPlanValidator.js', 'src/agents/automat/planIntegrity.js', 'src/agents/automat/automatApplyContract.js',
  'src/core/data/entityType.js', 'src/core/data/entity.js', 'src/core/data/actorRef.js',
  'src/core/audit/auditActions.js', 'src/core/audit/auditEntry.js',
  'src/core/analytics/analyticsDefinition.js', 'src/core/analytics/reportDefinition.js',
  'src/core/workspace/widgetDefinition.js', 'src/core/workspace/workset.js', 'src/core/workspace/notification.js',
  'src/core/workspace/moduleCategory.js',
  'src/core/utils/technicalCode.js',
  'src/modules/module.js', 'src/modules/forms/formSchemaValidator.js',
  'src/capabilities/contracts/capabilityContracts.js',
  'src/core/recordCommands/recordCommandContract.js',
  'src/core/recordCommands/recordCommandEngine.js',
  'src/core/recordCommands/recordActionPolicy.js',
  'src/core/recordCommands/recordLifecycle.js',
  'src/core/ledger/ledgerCommandContract.js',
  'src/core/ledger/ledgerBook.js',
  'src/core/ledger/ledgerEntry.js',
  'src/core/ledger/ledgerBlock.js',
  'src/core/ledger/ledgerSourceDefinition.js',
  'src/core/notifications/notificationContract.js',
  'src/core/notifications/notificationPolicy.js',
  'src/core/notifications/recipientResolution.js',
  'src/core/notifications/deliveryRouter.js',
  'src/core/data/record.js',
  'src/core/data/actorRef.js',
  'src/core/utils/generateId.js',
];

await rm(outputRoot, { recursive: true, force: true });
for (const file of files) {
  const target = resolve(outputRoot, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(projectRoot, file), target);
}

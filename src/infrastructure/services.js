/**
 * Modulity 2.0 — Configured Service Instances
 *
 * Wires repositories to application services.
 * Higher layers import from here.
 */

import { repositories } from './repositories.js';
import { firebaseDb } from './firebase/firebaseApp.js';
import { createWorkspaceService } from '../core/workspace/workspaceService.js';
import { createOrganizationService } from '../core/workspace/organizationService.js';
import { createMembershipService } from '../core/workspace/membershipService.js';
import { createGroupService } from '../core/workspace/groupService.js';
import { createOrganizationAtomic } from './firebase/firestoreOrganizationBootstrap.js';
import { createEntityTypeService } from '../core/data/entityTypeService.js';
import { createEntityService } from '../core/data/entityService.js';
import { createRelationshipService } from '../core/data/relationshipService.js';
import { createRecordService } from '../core/data/recordService.js';
import { createRecordQueryService } from '../core/data/recordQueryService.js';
import { createRecordOperationService } from '../core/data/recordOperationService.js';
import { createRecordDeliveryService } from '../core/data/recordDeliveryService.js';
import { createRecordFolderService } from '../core/data/recordFolderService.js';
import { createFormRequestService } from '../core/data/formRequestService.js';
import { createSecureShareService } from '../core/data/secureShareService.js';
import { createFileService } from '../core/data/fileService.js';
import { createModuleService } from '../modules/moduleService.js';
import { createModuleSubmissionService } from '../modules/moduleSubmissionService.js';
import { createLedgerService } from '../core/ledger/ledgerService.js';
import { createLedgerQueryService } from '../core/ledger/ledgerQueryService.js';
import { createAuditService } from '../core/audit/auditService.js';
import { startAuditBridge } from '../core/audit/auditBridge.js';
import { eventBus } from '../core/events/eventBus.js';

export function bootstrapServices(servicesInstance) {
  startAuditBridge(eventBus, servicesInstance.audit);
  startNotificationBridge(eventBus, servicesInstance.notification);
  return servicesInstance;
}
import { createWorksetService } from '../core/workspace/worksetService.js';
import {
  createWidgetService,
  createWidgetQueryService,
  createNotificationService,
  createWorkspacePreferenceService,
} from '../core/workspace/workspaceExperienceServices.js';
import { startNotificationBridge } from '../core/workspace/notificationBridge.js';
import { createConversationService } from '../core/workspace/conversationService.js';
import { createAnalyticsExecutionService } from '../core/analytics/analyticsExecutionService.js';
import { createWidgetExecutionService } from '../core/analytics/widgetExecutionService.js';
import { createReportService } from '../core/analytics/reportService.js';
import { createCapabilityDefinitionService } from '../capabilities/definition/capabilityDefinitionService.js';
import { createCapabilityRuntime } from '../capabilities/runtime/capabilityRuntime.js';
import { createBuiltInCapabilityRegistry } from '../capabilities/registry/builtInCapabilityCatalog.js';
import { createCalendarEngine, validateCalendarDefinitionV1 } from '../engines/calendar/index.js';
import { recordCommandClient } from './firebase/recordCommandClient.js';
import { buildCreateRecordCommand } from '../core/recordCommands/recordCommandContract.js';
import { generateId } from '../core/utils/generateId.js';

function createServices() {
  if (!repositories) {
    console.error('[services] Repositories are not available.');
    return null;
  }

  const entitySvc = createEntityService({
    entityRepo: repositories.entities,
    entityTypeRepo: repositories.entityTypes,
  });

  const recordSvc = createRecordService({
    recordRepo: repositories.records,
    entityRepo: repositories.entities,
  });

  const recordQuerySvc = createRecordQueryService({
    recordRepo: repositories.records,
    deliveryRepo: repositories.deliveries,
    userRecordStateRepo: repositories.userRecordState,
  });

  const recordOpSvc = createRecordOperationService({
    recordRepo: repositories.records,
  });

  const deliverySvc = createRecordDeliveryService({
    deliveryRepo: repositories.deliveries,
    recordRepo: repositories.records,
    membershipRepo: repositories.memberships,
    workspaceRepo: repositories.workspaces,
  });

  const folderSvc = createRecordFolderService({
    folderRepo: repositories.folders,
    userRecordStateRepo: repositories.userRecordState,
  });

  const formRequestSvc = createFormRequestService({
    formRequestRepo: repositories.formRequests,
    moduleRepo: repositories.modules,
    membershipRepo: repositories.memberships,
    workspaceRepo: repositories.workspaces,
  });

  const secureShareSvc = createSecureShareService({
    shareTokenRepo: repositories.shareTokens,
    recordRepo: repositories.records,
  });

  const auditSvc = createAuditService({
    auditEntryRepo: repositories.auditEntries,
  });

  const ledgerSvc = createLedgerService({
    ledgerBookRepo: repositories.ledgerBooks,
    ledgerEntryRepo: repositories.ledgerEntries,
    recordRepo: repositories.records,
    auditService: auditSvc,
  });

  const ledgerQuerySvc = createLedgerQueryService({
    ledgerEntryRepo: repositories.ledgerEntries,
  });
  const notificationSvc = createNotificationService({ notificationRepo: repositories.notifications });
  const analyticsExecutionSvc = createAnalyticsExecutionService({
    recordRepo: repositories.records,
    moduleRepo: repositories.modules,
    entityRepo: repositories.entities,
    relationshipRepo: repositories.relationships,
  });
  const widgetExecutionSvc = createWidgetExecutionService({ analyticsExecutionService: analyticsExecutionSvc });
  const reportSvc = createReportService({
    reportRepo: repositories.reports,
    analyticsExecutionService: analyticsExecutionSvc,
    moduleRepo: repositories.modules,
  });

  const recordCommand = Object.freeze({
    async submit({ workspaceId, moduleId, actor: _actor, values, isDraft = false, operationId = generateId() }) {
      const command = buildCreateRecordCommand({ operationId, workspaceId, moduleId, values, isDraft });
      return recordCommandClient.execute(command);
    },
  });

  return {
    workspace: createWorkspaceService({
      workspaceRepo: repositories.workspaces,
      personRepo: repositories.persons,
    }),
    organization: createOrganizationService({
      organizationRepo: repositories.organizations,
      workspaceRepo: repositories.workspaces,
      membershipRepo: repositories.memberships,
      atomicBootstrap: firebaseDb
        ? (params) => createOrganizationAtomic(firebaseDb, params)
        : null,
    }),
    membership: createMembershipService({
      membershipRepo: repositories.memberships,
      personRepo: repositories.persons,
    }),
    group: createGroupService({
      groupRepo: repositories.groups,
    }),
    entityType: createEntityTypeService({
      entityTypeRepo: repositories.entityTypes,
    }),
    entity: entitySvc,
    relationship: createRelationshipService({
      relationshipRepo: repositories.relationships,
      entityRepo: repositories.entities,
    }),
    record: recordSvc,
    file: createFileService({
      fileRepo: repositories.files,
    }),
    module: createModuleService({
      moduleRepo: repositories.modules,
      entityTypeRepo: repositories.entityTypes,
    }),
    moduleSubmission: createModuleSubmissionService({
      moduleRepo: repositories.modules,
      recordService: recordSvc,
      entityService: entitySvc,
      recordCommand,
    }),
    recordCommand,
    recordQuery: recordQuerySvc,
    recordOperation: recordOpSvc,
    delivery: deliverySvc,
    folder: folderSvc,
    formRequest: formRequestSvc,
    secureShare: secureShareSvc,
    ledger: ledgerSvc,
    ledgerQuery: ledgerQuerySvc,
    audit: auditSvc,
    workset: createWorksetService({ worksetRepo: repositories.worksets, moduleRepo: repositories.modules }),
    widget: createWidgetService({ widgetRepo: repositories.widgets }),
    widgetQuery: createWidgetQueryService({ recordQueryService: recordQuerySvc, relationshipRepo: repositories.relationships }),
    widgetExecution: widgetExecutionSvc,
    report: reportSvc,
    analyticsExecution: analyticsExecutionSvc,
    notification: notificationSvc,
    conversation: createConversationService({ conversationRepo: repositories.conversations }),
    capabilityDefinition: createCapabilityDefinitionService({
      capabilityDefinitionRepo: repositories.capabilityDefinitions,
      moduleRepo: repositories.modules,
      entityTypeRepo: repositories.entityTypes,
    }),
    capabilityRuntime: (() => {
      const capabilityRegistry = createBuiltInCapabilityRegistry({
        calendar: { definitionValidator: validateCalendarDefinitionV1 },
      });
      const runtime = createCapabilityRuntime({
        registry: capabilityRegistry,
        recordRepo: repositories.records,
        moduleRepo: repositories.modules,
        entityRepo: repositories.entities,
      });
      runtime.registerEngineFactory('calendar', '1.0.0', createCalendarEngine);
      return runtime;
    })(),
    workspacePreference: createWorkspacePreferenceService({
      preferenceRepo: repositories.workspacePreferences,
      worksetRepo: repositories.worksets,
    }),
  };
}

export const services = createServices();
export default services;

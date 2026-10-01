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
    }),
    moduleSubmission: createModuleSubmissionService({
      moduleRepo: repositories.modules,
      recordService: recordSvc,
      entityService: entitySvc,
    }),
    recordQuery: recordQuerySvc,
    recordOperation: recordOpSvc,
    delivery: deliverySvc,
    folder: folderSvc,
    formRequest: formRequestSvc,
    secureShare: secureShareSvc,
  };
}

export const services = createServices();
export default services;

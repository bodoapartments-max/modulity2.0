import { generateId } from '../utils/generateId.js';
import { createReportDefinition, REPORT_STATUSES } from './reportDefinition.js';

export function createReportService({ reportRepo, analyticsExecutionService, moduleRepo }) {
  async function validateSources(workspaceId, dataSources) {
    for (const source of dataSources) {
      if (source.sourceType === 'RECORDS') {
        const module = await moduleRepo.getById(workspaceId, source.moduleId);
        if (!module || module.status === 'ARCHIVED') throw new Error('Source Module is missing or archived');
      }
    }
  }

  async function create(params) {
    await validateSources(params.workspaceId, params.dataSources);
    return reportRepo.create(createReportDefinition({ ...params, reportId: generateId() }));
  }

  async function update(workspaceId, reportId, changes, actor) {
    const existing = await reportRepo.getById(workspaceId, reportId);
    if (!existing) throw new Error('Report not found');
    if (existing.createdBy.actorId !== actor.actorId) throw new Error('Only the Report creator may edit it');
    const candidate = createReportDefinition({ ...existing, ...changes, reportId, workspaceId, version: existing.version + 1, createdBy: existing.createdBy });
    await validateSources(workspaceId, candidate.dataSources);
    const { createdAt: _createdAt, updatedAt: _updatedAt, archivedAt: _archivedAt, ...safeChanges } = candidate;
    return reportRepo.update(workspaceId, reportId, safeChanges);
  }

  async function archive(workspaceId, reportId, actor) {
    return update(workspaceId, reportId, { status: REPORT_STATUSES.ARCHIVED }, actor);
  }

  async function execute(workspaceId, reportId) {
    const report = await reportRepo.getById(workspaceId, reportId);
    if (!report || report.status !== REPORT_STATUSES.ACTIVE) throw new Error('Report is not available');
    return analyticsExecutionService.execute(report);
  }

  async function preview(params) {
    await validateSources(params.workspaceId, params.dataSources);
    return analyticsExecutionService.execute(createReportDefinition({ ...params, reportId: params.reportId || 'preview', version: params.version || 1 }));
  }

  return { create, update, archive, execute, preview, get: reportRepo.getById, list: reportRepo.listByWorkspace };
}

import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';

export function createFirestoreReportRepository(db) {
  const col = (workspaceId) => collection(db, 'workspaces', workspaceId, 'reportDefinitions');
  const ref = (workspaceId, reportId) => doc(db, 'workspaces', workspaceId, 'reportDefinitions', reportId);
  const map = (snapshot) => {
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return { ...data, reportId: snapshot.id, createdAt: data._createdAt?.toDate?.()?.toISOString?.() || null, updatedAt: data._updatedAt?.toDate?.()?.toISOString?.() || null, archivedAt: data._archivedAt?.toDate?.()?.toISOString?.() || null };
  };
  return {
    async create(report) {
      const { createdAt: _createdAt, updatedAt: _updatedAt, archivedAt: _archivedAt, ...data } = report;
      await setDoc(ref(report.workspaceId, report.reportId), { ...data, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp(), _archivedAt: null });
      return report;
    },
    async getById(workspaceId, reportId) { return map(await getDoc(ref(workspaceId, reportId))); },
    async listByWorkspace(workspaceId) {
      const snapshot = await getDocs(query(col(workspaceId), where('status', '==', 'ACTIVE'), orderBy('_updatedAt', 'desc'), limit(100)));
      return snapshot.docs.map(map);
    },
    async update(workspaceId, reportId, changes) {
      await updateDoc(ref(workspaceId, reportId), { ...changes, _updatedAt: serverTimestamp(), ...(changes.status === 'ARCHIVED' ? { _archivedAt: serverTimestamp() } : {}) });
      return map(await getDoc(ref(workspaceId, reportId)));
    },
  };
}

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, limit, startAfter,
  serverTimestamp,
} from 'firebase/firestore';

function mapSnapshot(snapshot, idField) {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    ...data,
    [idField]: snapshot.id,
    createdAt: data._createdAt?.toDate?.()?.toISOString?.() || null,
    updatedAt: data._updatedAt?.toDate?.()?.toISOString?.() || null,
    readAt: data._readAt?.toDate?.()?.toISOString?.() || null,
  };
}

export function createFirestoreWorksetRepository(db) {  const ref = (workspaceId, id) => doc(db, 'workspaces', workspaceId, 'worksets', id);
  const col = (workspaceId) => collection(db, 'workspaces', workspaceId, 'worksets');
  return {
    async create(workset) {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...data } = workset;
      await setDoc(ref(workset.workspaceId, workset.worksetId), { ...data, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() });
      return workset;
    },
    async getById(workspaceId, id) { return mapSnapshot(await getDoc(ref(workspaceId, id)), 'worksetId'); },
    async listByWorkspace(workspaceId) {
      const snapshot = await getDocs(query(col(workspaceId), where('status', '==', 'ACTIVE'), limit(100)));
      return snapshot.docs.map((item) => mapSnapshot(item, 'worksetId'));
    },
    async update(workspaceId, id, changes) {
      await updateDoc(ref(workspaceId, id), { ...changes, _updatedAt: serverTimestamp() });
      return mapSnapshot(await getDoc(ref(workspaceId, id)), 'worksetId');
    },
  };
}

export function createFirestoreModuleCategoryRepository(db) {
  const ref = (workspaceId, id) => doc(db, 'workspaces', workspaceId, 'moduleCategories', id);
  const col = (workspaceId) => collection(db, 'workspaces', workspaceId, 'moduleCategories');
  return {
    async create(category) {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...data } = category;
      await setDoc(ref(category.workspaceId, category.categoryId), { ...data, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() });
      return category;
    },
    async getById(workspaceId, id) { return mapSnapshot(await getDoc(ref(workspaceId, id)), 'categoryId'); },
    async getByCode(workspaceId, code) {
      const snapshot = await getDocs(query(col(workspaceId), where('categoryCode', '==', code), limit(1)));
      const first = snapshot.docs[0];
      return first ? mapSnapshot(first, 'categoryId') : null;
    },
    async list(workspaceId) {
      const snapshot = await getDocs(query(col(workspaceId), orderBy('sortOrder', 'asc'), limit(200)));
      return snapshot.docs.map((item) => mapSnapshot(item, 'categoryId'));
    },
    async update(workspaceId, id, changes) {
      await updateDoc(ref(workspaceId, id), { ...changes, _updatedAt: serverTimestamp() });
      return mapSnapshot(await getDoc(ref(workspaceId, id)), 'categoryId');
    },
  };
}

export function createFirestoreWidgetRepository(db) {
  const ref = (workspaceId, id) => doc(db, 'workspaces', workspaceId, 'widgetDefinitions', id);
  const col = (workspaceId) => collection(db, 'workspaces', workspaceId, 'widgetDefinitions');
  return {
    async create(widget) {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...data } = widget;
      await setDoc(ref(widget.workspaceId, widget.widgetId), { ...data, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() });
      return widget;
    },
    async getById(workspaceId, id) { return mapSnapshot(await getDoc(ref(workspaceId, id)), 'widgetId'); },
    async listByWorkspace(workspaceId) {
      const snapshot = await getDocs(query(col(workspaceId), where('status', '==', 'ACTIVE'), limit(100)));
      return snapshot.docs.map((item) => mapSnapshot(item, 'widgetId'));
    },
    async listForUser(workspaceId, userId) {
      const snapshot = await getDocs(query(col(workspaceId), where('ownerUserId', '==', userId), where('status', '==', 'ACTIVE'), limit(50)));
      return snapshot.docs.map((item) => mapSnapshot(item, 'widgetId'));
    },
    async update(workspaceId, id, changes) {
      await updateDoc(ref(workspaceId, id), { ...changes, _updatedAt: serverTimestamp() });
      return mapSnapshot(await getDoc(ref(workspaceId, id)), 'widgetId');
    },
  };
}

export function createFirestoreNotificationRepository(db) {
  const ref = (workspaceId, id) => doc(db, 'workspaces', workspaceId, 'notifications', id);
  const col = (workspaceId) => collection(db, 'workspaces', workspaceId, 'notifications');
  return {
    async create(notification) {
      const { createdAt: _createdAt, readAt: _readAt, ...data } = notification;
      await setDoc(ref(notification.workspaceId, notification.notificationId), { ...data, _createdAt: serverTimestamp(), _readAt: null });
      return notification;
    },
    async listForUser(workspaceId, userId, pageSize = 25) {
      const snapshot = await getDocs(query(col(workspaceId), where('recipientUserId', '==', userId), orderBy('_createdAt', 'desc'), limit(Math.min(pageSize, 50))));
      return snapshot.docs.map((item) => mapSnapshot(item, 'notificationId'));
    },
    // Bounded, cursor-paginated listing for the Notification Center.
    // Cursor = the last document snapshot of the previous page (opaque to UI state).
    async listForUserPage(workspaceId, userId, { pageSize = 25, afterSnapshot = null } = {}) {
      const constraints = [where('recipientUserId', '==', userId), orderBy('_createdAt', 'desc'), limit(Math.min(pageSize, 50) + 1)];
      if (afterSnapshot) constraints.push(startAfter(afterSnapshot));
      const snapshot = await getDocs(query(col(workspaceId), ...constraints));
      const limitValue = Math.min(pageSize, 50);
      const hasMore = snapshot.docs.length > limitValue;
      const items = snapshot.docs.slice(0, limitValue).map((item) => mapSnapshot(item, 'notificationId'));
      const nextCursor = hasMore ? snapshot.docs[limitValue - 1] : null;
      return { items, hasMore, nextCursor };
    },
    async updateStatus(workspaceId, id, status) {
      await updateDoc(ref(workspaceId, id), { status, _readAt: status === 'READ' ? serverTimestamp() : null });
    },
    async countUnread(workspaceId, userId) {
      const snapshot = await getDocs(query(col(workspaceId), where('recipientUserId', '==', userId), where('status', '==', 'UNREAD'), limit(100)));
      return snapshot.size;
    },
  };
}

export function createFirestoreWorkspacePreferenceRepository(db) {
  const ref = (workspaceId, userId) => doc(db, 'workspaces', workspaceId, 'userWorkspacePreferences', userId);
  return {
    async get(workspaceId, userId) { return mapSnapshot(await getDoc(ref(workspaceId, userId)), 'userId'); },
    async upsert(workspaceId, userId, changes) {
      await setDoc(ref(workspaceId, userId), { workspaceId, userId, ...changes, _updatedAt: serverTimestamp() }, { merge: true });
      return this.get(workspaceId, userId);
    },
  };
}

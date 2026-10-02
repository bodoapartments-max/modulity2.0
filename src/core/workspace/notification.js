export const NOTIFICATION_STATUSES = Object.freeze({ UNREAD: 'UNREAD', READ: 'READ', ARCHIVED: 'ARCHIVED' });

export function createNotification({
  notificationId, workspaceId, recipientUserId, type, title, message = '',
  resourceType = null, resourceId = null, actionUrl = null,
  status = NOTIFICATION_STATUSES.UNREAD, metadata = {}, createdAt = null, readAt = null,
}) {
  if (!notificationId || !workspaceId || !recipientUserId) throw new Error('Notification identity is required');
  if (!type || !title?.trim()) throw new Error('Notification type and title are required');
  if (!Object.values(NOTIFICATION_STATUSES).includes(status)) throw new Error('Invalid Notification status');
  return Object.freeze({
    notificationId, workspaceId, recipientUserId, type, title: title.trim(), message: message.trim(),
    resourceType, resourceId, actionUrl, status, metadata: Object.freeze({ ...metadata }), createdAt, readAt,
  });
}

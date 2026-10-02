const EVENT_MAPPINGS = Object.freeze({
  'record.sent': (event) => ({
    recipientUserId: event.payload?.recipientUserId,
    type: 'RECORD_SENT',
    title: 'Record received',
    message: 'A Record was shared with you.',
    resourceType: 'RECORD',
    resourceId: event.payload?.recordId,
    actionUrl: event.payload?.recordId ? `/app/records/${event.payload.recordId}` : '/app/records',
    metadata: { deliveryId: event.payload?.deliveryId || null },
  }),
});

export function startNotificationBridge(eventBus, notificationService) {
  if (!notificationService) return () => {};
  return eventBus.on('*', async (event) => {
    const map = EVENT_MAPPINGS[event.eventType];
    if (!map || !event.workspaceId) return;
    const notification = map(event);
    if (!notification.recipientUserId) return;
    try {
      await notificationService.create({ workspaceId: event.workspaceId, ...notification });
    } catch {
      // Notification delivery is best-effort until a durable backend dispatcher exists.
    }
  });
}

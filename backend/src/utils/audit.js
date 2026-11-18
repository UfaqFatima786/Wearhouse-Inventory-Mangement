import ActivityLog from '../models/ActivityLog.js';

export default async function audit(user, action, entity, entityId, details = {}) {
  await ActivityLog.create({
    user: user._id,
    userName: user.name,
    action,
    entity,
    entityId: String(entityId),
    details
  });
}

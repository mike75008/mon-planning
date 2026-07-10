export function splitDayData(data = {}) {
  const checked = {};
  const attachments = data._attachments || {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "_attachments") continue;
    if (typeof value === "boolean") checked[key] = value;
  }
  return { checked, attachments };
}

export function mergeDayData(checked, attachments) {
  const payload = { ...checked };
  if (attachments && Object.keys(attachments).length > 0) {
    payload._attachments = attachments;
  }
  return payload;
}

export function attachmentCount(attachments, blockId) {
  return (attachments[blockId] || []).length;
}

export function totalAttachmentCount(attachments) {
  return Object.values(attachments || {}).reduce((sum, list) => sum + list.length, 0);
}

export function requireProjectIndex(project, index) {
  if (project?.folder && (!index || index.root !== project.folder.root)) {
    throw new Error('Project files are not ready. Wait for indexing or rescan the folder.')
  }
}

export function retainAttachments(attachments) {
  return attachments.map(({ name, path, kind, bytes, text }) => ({ name, path, kind, bytes, text }))
}

export function retryAttachments(message) {
  const attachments = message.attachments ?? []
  if (attachments.some((a) => typeof a.text !== 'string')) {
    throw new Error('This older message did not save its attachment text. Reattach the files and send a new message to retry it.')
  }
  return attachments
}

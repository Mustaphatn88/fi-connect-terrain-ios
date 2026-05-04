import { openDB } from 'idb';

const DB_NAME = 'bioplus-terrain-pwa';
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('queue')) {
      db.createObjectStore('queue', { keyPath: 'messageId' });
    }
    if (!db.objectStoreNames.contains('documents')) {
      db.createObjectStore('documents', { keyPath: 'id' });
    }
  }
});

export async function enqueueUpload(item) {
  const db = await dbPromise;
  await db.put('queue', item);
}

export async function getQueuedUploads() {
  const db = await dbPromise;
  const items = await db.getAll('queue');
  return items.sort((left, right) => left.createdAt - right.createdAt);
}

export async function removeQueuedUpload(messageId) {
  const db = await dbPromise;
  await db.delete('queue', messageId);
}

export async function markQueuedUploadAttempt(messageId, error) {
  const db = await dbPromise;
  const existing = await db.get('queue', messageId);
  if (!existing) {
    return;
  }
  existing.attemptCount = (existing.attemptCount || 0) + 1;
  existing.lastError = error || '';
  await db.put('queue', existing);
}

export async function clearQueue() {
  const db = await dbPromise;
  await db.clear('queue');
}

export async function saveGeneratedDocument(document) {
  const db = await dbPromise;
  await db.put('documents', document);
}

export async function getGeneratedDocuments() {
  const db = await dbPromise;
  const docs = await db.getAll('documents');
  return docs.sort((left, right) => right.createdAt - left.createdAt);
}

export async function removeGeneratedDocument(id) {
  const db = await dbPromise;
  await db.delete('documents', id);
}

export async function clearGeneratedDocuments() {
  const db = await dbPromise;
  await db.clear('documents');
}

import {
  QUEUE_FLUSH_INTERVAL_MS,
  RATE_LIMIT_BACKOFF_MS,
  RELAY_BASE_URL,
  RELAY_TOPIC
} from './constants.js';
import {
  buildFallbackBody,
  buildRemoteAttachmentName,
  buildRemoteMessage,
  buildRemoteTitle,
  getOrCreateDeviceId,
  getOrCreateTerrainClientId,
  relayPublishUrl,
  sanitizeFileName
} from './utils.js';
import {
  enqueueUpload,
  getQueuedUploads,
  markQueuedUploadAttempt,
  removeQueuedUpload
} from './storage.js';

export class RelayUploader {
  constructor({ onStatusChange, onPendingChange }) {
    this.onStatusChange = onStatusChange;
    this.onPendingChange = onPendingChange;
    this.started = false;
    this.timerId = null;
    this.flushing = false;
    this.nextAllowedFlushAt = 0;
    this.terrainClientId = getOrCreateTerrainClientId();
    this.deviceId = getOrCreateDeviceId();
  }

  async start() {
    if (this.started) {
      await this.flush();
      return;
    }
    this.started = true;
    this.reportStatus('Service de transmission actif.');
    window.addEventListener('online', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.flush();
      }
    });
    this.timerId = window.setInterval(() => this.flush(), QUEUE_FLUSH_INTERVAL_MS);
    await this.reportPending();
    await this.flush();
  }

  async enqueue(item) {
    const enrichedItem = {
      ...item,
      fileName: sanitizeFileName(item.fileName),
      createdAt: item.createdAt || Date.now(),
      attemptCount: 0,
      lastError: ''
    };
    await enqueueUpload(enrichedItem);
    await this.reportPending();
    this.reportStatus('Fichier mis en file pour synchronisation.');
    await this.flush();
  }

  async publishTestMessage() {
    const messageId = `test-${crypto.randomUUID()}`;
    const response = await fetch(relayPublishUrl(RELAY_BASE_URL, RELAY_TOPIC, messageId), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: 'TEST TERRAIN',
        Priority: 'default'
      },
      body: `test message from terrain ${this.terrainClientId}`
    });
    if (!response.ok) {
      throw await this.toRelayError(response);
    }
    this.reportStatus('Message de test transmis.');
  }

  async flush() {
    if (this.flushing) {
      return;
    }
    if (Date.now() < this.nextAllowedFlushAt) {
      this.reportStatus('Relais limité, nouvelle tentative différée.');
      return;
    }
    this.flushing = true;
    try {
      const items = await getQueuedUploads();
      await this.reportPending(items.length);
      if (!items.length) {
        this.reportStatus('Synchronisation active.');
        return;
      }

      for (const item of items) {
        try {
          await this.uploadAttachment(item);
          await removeQueuedUpload(item.messageId);
          this.reportStatus(`Fiche transmise: ${item.fileName}`);
          await this.reportPending();
        } catch (error) {
          const reason = this.shortReason(error);
          const fallbackSent = await this.tryFallback(item, reason);
          if (fallbackSent) {
            await removeQueuedUpload(item.messageId);
            this.reportStatus(`Secours texte transmis: ${item.fileName}`);
            await this.reportPending();
            continue;
          }

          await markQueuedUploadAttempt(item.messageId, reason);
          if (error?.statusCode === 429) {
            this.nextAllowedFlushAt = Date.now() + Math.max(error.retryAfterMs || RATE_LIMIT_BACKOFF_MS, RATE_LIMIT_BACKOFF_MS);
            this.reportStatus('Relais public limité, nouvelle tentative dans 2 minutes.');
          } else {
            this.reportStatus(`Envoi en attente: ${reason}`);
          }
          return;
        }
      }
    } finally {
      this.flushing = false;
      await this.reportPending();
    }
  }

  async uploadAttachment(item) {
    const response = await fetch(relayPublishUrl(RELAY_BASE_URL, RELAY_TOPIC, item.messageId), {
      method: 'PUT',
      headers: {
        'Content-Type': item.mimeType,
        Filename: buildRemoteAttachmentName(item, this.terrainClientId, this.deviceId),
        Title: buildRemoteTitle(item),
        Message: buildRemoteMessage(item),
        Priority: 'default',
        Tags: 'page_with_curl'
      },
      body: item.blob
    });
    if (!response.ok) {
      throw await this.toRelayError(response);
    }
  }

  async tryFallback(item, failureReason) {
    try {
      const response = await fetch(relayPublishUrl(RELAY_BASE_URL, RELAY_TOPIC, `${item.messageId}-txt`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          Filename: buildRemoteAttachmentName(item, this.terrainClientId, this.deviceId, 'txt'),
          Title: 'Fiche texte de secours',
          Message: buildRemoteMessage(item),
          Priority: 'default',
          Tags: 'memo,page_facing_up'
        },
        body: buildFallbackBody(item, failureReason, this.terrainClientId, this.deviceId)
      });
      if (!response.ok) {
        throw await this.toRelayError(response);
      }
      return true;
    } catch {
      return false;
    }
  }

  async toRelayError(response) {
    const body = await response.text().catch(() => '');
    const retryAfter = Number(response.headers.get('Retry-After') || '');
    return {
      statusCode: response.status,
      body,
      retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined
    };
  }

  shortReason(error) {
    if (!error) {
      return 'Erreur inconnue';
    }
    if (error.statusCode) {
      return `HTTP ${error.statusCode}`;
    }
    return error.message || String(error);
  }

  async reportPending(forcedValue) {
    const count = Number.isFinite(forcedValue) ? forcedValue : (await getQueuedUploads()).length;
    this.onPendingChange?.(count);
  }

  reportStatus(text) {
    this.onStatusChange?.(text);
  }
}

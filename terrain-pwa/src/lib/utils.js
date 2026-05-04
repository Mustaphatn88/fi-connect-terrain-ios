import {
  CLIENT_STORAGE_KEY,
  DEFAULT_REFERENCE_LINES,
  DEFAULT_SETTINGS,
  DEFAULT_WORK_LINES,
  DEVICE_STORAGE_KEY
} from './constants.js';

export function createDefaultDraft() {
  return {
    ficheNumber: autoFicheNumber(),
    interventionDate: todayString(),
    laboratoryName: '',
    locality: '',
    serialNumber: '',
    intervenant: '',
    interventionTime: '',
    travelTime: '',
    description: '',
    workLines: Array.from({ length: DEFAULT_WORK_LINES }, () => ''),
    references: Array.from({ length: DEFAULT_REFERENCE_LINES }, () => ({
      reference: '',
      designation: '',
      quantity: 1
    })),
    referenceCount: 0,
    observation: 'Rien à Signaler'
  };
}

export function normalizeDraft(rawDraft = {}) {
  const draft = structuredClone(rawDraft);
  draft.ficheNumber = String(draft.ficheNumber || '').trim() || autoFicheNumber();
  draft.interventionDate = String(draft.interventionDate || '').trim() || todayString();
  draft.laboratoryName = String(draft.laboratoryName || '').trim();
  draft.locality = String(draft.locality || '').trim();
  draft.serialNumber = String(draft.serialNumber || '').trim();
  draft.intervenant = String(draft.intervenant || '').trim() === 'LAM' ? '' : String(draft.intervenant || '').trim();
  draft.interventionTime = String(draft.interventionTime || '').trim();
  draft.travelTime = String(draft.travelTime || '').trim();
  draft.description = String(draft.description || '').trim();
  draft.observation = String(draft.observation || '').trim() || 'Rien à Signaler';
  draft.referenceCount = clampNumber(draft.referenceCount, 0, DEFAULT_REFERENCE_LINES);

  draft.workLines = Array.from({ length: DEFAULT_WORK_LINES }, (_, index) => String(draft.workLines?.[index] || '').trim());
  draft.references = Array.from({ length: DEFAULT_REFERENCE_LINES }, (_, index) => {
    const line = draft.references?.[index] || {};
    return {
      reference: String(line.reference || '').trim(),
      designation: String(line.designation || '').trim(),
      quantity: clampNumber(line.quantity, 1, 99)
    };
  });

  return draft;
}

export function normalizeSettings(rawSettings = {}) {
  return {
    companyName: String(rawSettings.companyName || DEFAULT_SETTINGS.companyName).trim() || DEFAULT_SETTINGS.companyName,
    companyAddress: String(rawSettings.companyAddress || DEFAULT_SETTINGS.companyAddress).trim() || DEFAULT_SETTINGS.companyAddress,
    companyPhone: String(rawSettings.companyPhone || DEFAULT_SETTINGS.companyPhone).trim() || DEFAULT_SETTINGS.companyPhone,
    companyEmail: String(rawSettings.companyEmail || DEFAULT_SETTINGS.companyEmail).trim() || DEFAULT_SETTINGS.companyEmail,
    logoDataUrl: String(rawSettings.logoDataUrl || '').trim()
  };
}

export function todayString(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function autoFicheNumber(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  return `${dd}${mm}${yy}${hh}`;
}

export function timestampFileString(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${sec}`;
}

export function humanDateTime(timestamp) {
  if (!timestamp) {
    return '-';
  }
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp));
}

export function contactBlock(settings) {
  return [
    settings.companyAddress?.trim(),
    settings.companyPhone?.trim() ? `TEL: ${settings.companyPhone.trim()}` : '',
    settings.companyEmail?.trim() ? `Email : ${settings.companyEmail.trim()}` : ''
  ].filter(Boolean).join('\n');
}

export function readJsonStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getOrCreateTerrainClientId() {
  let existing = localStorage.getItem(CLIENT_STORAGE_KEY);
  if (!existing) {
    existing = `terrain-${crypto.randomUUID()}`;
    localStorage.setItem(CLIENT_STORAGE_KEY, existing);
  }
  return existing;
}

export function getOrCreateDeviceId() {
  let existing = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!existing) {
    existing = `ios-web-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_STORAGE_KEY, existing);
  }
  return existing;
}

export function encodeFilenamePart(value) {
  const safeValue = String(value || '').trim() || '-';
  return btoa(unescape(encodeURIComponent(safeValue)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function sanitizeFileName(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .trim();
  return cleaned || 'fiche_intervention.bin';
}

export function buildRemoteAttachmentName(item, terrainClientId, deviceId, extensionOverride) {
  const extension = extensionOverride || String(item.fileName).split('.').pop() || 'bin';
  return [
    'relay',
    encodeFilenamePart(item.interventionDate),
    encodeFilenamePart(item.technician),
    encodeFilenamePart(item.client),
    encodeFilenamePart(item.ficheNumber),
    encodeFilenamePart(terrainClientId),
    encodeFilenamePart(deviceId)
  ].join('__') + `.${extension}`;
}

export function buildRemoteTitle(item) {
  const label = item.attachmentType === 'photo'
    ? 'Capture fiche imprimée'
    : item.attachmentType === 'pdf'
      ? 'Fiche intervention PDF'
      : 'Fiche intervention';
  return [
    label,
    item.client || 'Client inconnu',
    item.interventionDate || 'Date inconnue'
  ].join(' | ');
}

export function buildRemoteMessage(item) {
  return `type=${item.attachmentType}; fiche=${item.ficheNumber || '-'}; client=${item.client || '-'}; technicien=${item.technician || '-'}; date=${item.interventionDate || '-'}`;
}

export function buildFallbackText(draft) {
  const workLines = draft.workLines
    .map((line, index) => line.trim() ? `${index + 1}. ${line.trim()}` : null)
    .filter(Boolean);
  const references = draft.references
    .slice(0, draft.referenceCount)
    .map((line, index) => {
      const reference = line.reference.trim();
      const designation = line.designation.trim();
      if (!reference && !designation) {
        return null;
      }
      return `${index + 1}. Ref=${reference || '-'}, Designation=${designation || '-'}, Qte=${clampNumber(line.quantity, 1, 99)}`;
    })
    .filter(Boolean);

  return [
    "FICHE D'INTERVENTION",
    `Numero de fiche: ${draft.ficheNumber}`,
    `Date d'intervention: ${draft.interventionDate}`,
    `Laboratoire / client: ${draft.laboratoryName}`,
    `Localite: ${draft.locality}`,
    `Numero de serie: ${draft.serialNumber}`,
    `Intervenant: ${draft.intervenant}`,
    `Temps intervention: ${draft.interventionTime}`,
    `Temps deplacement: ${draft.travelTime}`,
    '',
    'Description du problematique:',
    draft.description || '-',
    '',
    'Travail effectue:',
    workLines.length ? workLines.join('\n') : '-',
    '',
    'Pieces / articles:',
    references.length ? references.join('\n') : '-',
    '',
    'Observation:',
    draft.observation || '-'
  ].join('\n');
}

export function buildFallbackBody(item, failureReason, terrainClientId, deviceId) {
  return [
    "FICHE D'INTERVENTION - TEXTE DE SECOURS",
    `Type de fichier d'origine: ${item.attachmentType}`,
    `Raison de secours transmission: ${failureReason}`,
    `Client terrain: ${terrainClientId}`,
    `Device ID: ${deviceId}`,
    `Message ID: ${item.messageId}`,
    '',
    item.fallbackText
  ].join('\n');
}

export function validateDraft(draft) {
  const issues = [];
  if (!draft.laboratoryName.trim()) {
    issues.push('Le champ laboratoire / client est requis.');
  }
  if (!draft.locality.trim()) {
    issues.push('Le champ localité est requis.');
  }
  if (!draft.intervenant.trim()) {
    issues.push("Le champ intervenant est requis.");
  }
  const hasWork = draft.workLines.some((line) => line.trim());
  if (!draft.description.trim() && !hasWork) {
    issues.push("Ajoutez une description ou au moins une ligne de travail.");
  }
  for (let index = 0; index < draft.referenceCount; index += 1) {
    const line = draft.references[index];
    if (!line.reference.trim() || !line.designation.trim()) {
      issues.push(`La pièce ${index + 1} doit être complètement renseignée.`);
    }
  }
  return issues;
}

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function blobToDataUrl(blob) {
  return fileToDataUrl(blob);
}

export async function compressImage(file, maxDimension = 1800, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  bitmap.close();
  return blob;
}

export function makeDownload(fileOrBlob, fileName, mimeType) {
  const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([fileOrBlob], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function shareOrDownload(blob, fileName, mimeType) {
  const file = new File([blob], fileName, { type: mimeType });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: fileName,
      files: [file]
    });
    return;
  }
  makeDownload(blob, fileName, mimeType);
}

export function relayPublishUrl(baseUrl, topic, messageId) {
  const safeId = encodeURIComponent(messageId);
  return `${baseUrl}/${topic}/${safeId}`;
}

export function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function formatBytes(bytes) {
  if (!bytes) {
    return '0 o';
  }
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

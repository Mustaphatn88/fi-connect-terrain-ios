import './styles.css';

import {
  DRAFT_STORAGE_KEY,
  SETTINGS_STORAGE_KEY
} from './lib/constants.js';
import {
  clearArticleCatalog,
  getArticleCatalog,
  clearGeneratedDocuments,
  getGeneratedDocuments,
  saveArticleCatalog,
  saveGeneratedDocument
} from './lib/storage.js';
import { generateInterventionPdf } from './lib/pdf.js';
import { RelayUploader } from './lib/relay.js';
import { importCatalogFromSqlite } from './lib/catalog.js';
import {
  blobToDataUrl,
  buildFallbackText,
  compressImage,
  contactBlock,
  createDefaultDraft,
  fileToDataUrl,
  formatBytes,
  getOrCreateTerrainClientId,
  humanDateTime,
  normalizeDraft,
  normalizeSettings,
  readJsonStorage,
  sanitizeFileName,
  shareOrDownload,
  timestampFileString,
  todayString,
  autoFicheNumber,
  validateDraft,
  writeJsonStorage
} from './lib/utils.js';

const state = {
  settings: normalizeSettings(readJsonStorage(SETTINGS_STORAGE_KEY, {})),
  draft: normalizeDraft(readJsonStorage(DRAFT_STORAGE_KEY, createDefaultDraft())),
  documents: [],
  catalog: createEmptyCatalog(),
  syncStatus: 'Synchronisation active.',
  pendingCount: 0,
  companyPanelOpen: false,
  installGuideDismissed: false
};

const elements = {};
const catalogIndex = {
  byReference: new Map(),
  byDesignation: new Map()
};

const uploader = new RelayUploader({
  onStatusChange: (text) => {
    state.syncStatus = text;
    renderSyncState();
  },
  onPendingChange: (count) => {
    state.pendingCount = count;
    renderSyncState();
  }
});

init().catch((error) => {
  console.error('PWA init failed', error);
  showToast(`Initialisation impossible: ${error.message || error}`);
});

async function init() {
  cacheDom();
  await hydrateCatalog();
  wireEvents();
  renderForm();
  renderCompany();
  renderCatalog();
  renderInstallGuide();
  await refreshDocuments();
  renderSyncState();
  elements.terrainClientIdText.textContent = getOrCreateTerrainClientId();
  await uploader.start();
  registerServiceWorker();
}

function cacheDom() {
  Object.assign(elements, {
    heroLogo: document.querySelector('#heroLogo'),
    companyContactBlock: document.querySelector('#companyContactBlock'),
    installSummaryText: document.querySelector('#installSummaryText'),
    appModeBadge: document.querySelector('#appModeBadge'),
    syncStatusBadge: document.querySelector('#syncStatusBadge'),
    pendingBadge: document.querySelector('#pendingBadge'),
    syncStatusText: document.querySelector('#syncStatusText'),
    terrainClientIdText: document.querySelector('#terrainClientIdText'),
    installGuidePanel: document.querySelector('#installGuidePanel'),
    installGuideTitle: document.querySelector('#installGuideTitle'),
    installGuideText: document.querySelector('#installGuideText'),
    installStepsList: document.querySelector('#installStepsList'),
    dismissInstallGuideButton: document.querySelector('#dismissInstallGuideButton'),
    copyAppLinkButton: document.querySelector('#copyAppLinkButton'),
    forceSyncButton: document.querySelector('#forceSyncButton'),
    companySummary: document.querySelector('#companySummary'),
    companyPanel: document.querySelector('#companyPanel'),
    toggleCompanyButton: document.querySelector('#toggleCompanyButton'),
    companyName: document.querySelector('#companyName'),
    companyAddress: document.querySelector('#companyAddress'),
    companyPhone: document.querySelector('#companyPhone'),
    companyEmail: document.querySelector('#companyEmail'),
    companyLogoInput: document.querySelector('#companyLogoInput'),
    saveCompanyButton: document.querySelector('#saveCompanyButton'),
    resetLogoButton: document.querySelector('#resetLogoButton'),
    catalogSummary: document.querySelector('#catalogSummary'),
    importCatalogButton: document.querySelector('#importCatalogButton'),
    clearCatalogButton: document.querySelector('#clearCatalogButton'),
    catalogFileInput: document.querySelector('#catalogFileInput'),
    catalogReferenceOptions: document.querySelector('#catalogReferenceOptions'),
    referenceCountValueLabel: document.querySelector('#referenceCountValueLabel'),
    ficheNumber: document.querySelector('#ficheNumber'),
    interventionDate: document.querySelector('#interventionDate'),
    laboratoryName: document.querySelector('#laboratoryName'),
    locality: document.querySelector('#locality'),
    serialNumber: document.querySelector('#serialNumber'),
    intervenant: document.querySelector('#intervenant'),
    interventionTime: document.querySelector('#interventionTime'),
    travelTime: document.querySelector('#travelTime'),
    description: document.querySelector('#description'),
    observation: document.querySelector('#observation'),
    workLines: document.querySelector('#workLines'),
    referenceCount: document.querySelector('#referenceCount'),
    referenceLines: document.querySelector('#referenceLines'),
    saveDraftButton: document.querySelector('#saveDraftButton'),
    newDraftButton: document.querySelector('#newDraftButton'),
    exportPdfButton: document.querySelector('#exportPdfButton'),
    sharePdfButton: document.querySelector('#sharePdfButton'),
    capturePhotoButton: document.querySelector('#capturePhotoButton'),
    testLinkButton: document.querySelector('#testLinkButton'),
    photoCaptureInput: document.querySelector('#photoCaptureInput'),
    documentSummary: document.querySelector('#documentSummary'),
    generatedDocuments: document.querySelector('#generatedDocuments'),
    clearDocumentsButton: document.querySelector('#clearDocumentsButton'),
    autoNumberButton: document.querySelector('#autoNumberButton'),
    todayButton: document.querySelector('#todayButton')
  });
}

function wireEvents() {
  elements.toggleCompanyButton.addEventListener('click', () => {
    state.companyPanelOpen = !state.companyPanelOpen;
    renderCompany();
  });

  elements.dismissInstallGuideButton.addEventListener('click', () => {
    state.installGuideDismissed = true;
    renderInstallGuide();
  });

  elements.copyAppLinkButton.addEventListener('click', async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const temp = document.createElement('input');
        temp.value = window.location.href;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        temp.remove();
      }
      showToast('Lien copié. Ouvre-le dans Safari sur iPhone.');
    } catch (error) {
      showToast(`Copie impossible: ${error.message || error}`);
    }
  });

  elements.forceSyncButton.addEventListener('click', async () => {
    try {
      await uploader.flush();
      showToast('Relance de la synchronisation demandée.');
    } catch (error) {
      showToast(`Relance impossible: ${error.message || error}`);
    }
  });

  elements.saveCompanyButton.addEventListener('click', async () => {
    const selectedLogo = elements.companyLogoInput.files?.[0];
    if (selectedLogo) {
      state.settings.logoDataUrl = await fileToDataUrl(selectedLogo);
    }
    state.settings.companyName = elements.companyName.value.trim() || state.settings.companyName;
    state.settings.companyAddress = elements.companyAddress.value.trim() || state.settings.companyAddress;
    state.settings.companyPhone = elements.companyPhone.value.trim();
    state.settings.companyEmail = elements.companyEmail.value.trim();
    persistSettings();
    renderCompany();
    showToast('Coordonnées société enregistrées.');
  });

  elements.resetLogoButton.addEventListener('click', () => {
    state.settings.logoDataUrl = '';
    elements.companyLogoInput.value = '';
    persistSettings();
    renderCompany();
    showToast('Logo société réinitialisé.');
  });

  const draftBindings = [
    'ficheNumber',
    'interventionDate',
    'laboratoryName',
    'locality',
    'serialNumber',
    'intervenant',
    'interventionTime',
    'travelTime',
    'description',
    'observation'
  ];

  draftBindings.forEach((key) => {
    elements[key].addEventListener('input', () => {
      state.draft[key] = elements[key].value;
      persistDraft();
    });
  });

  elements.autoNumberButton.addEventListener('click', () => {
    state.draft.ficheNumber = autoFicheNumber();
    elements.ficheNumber.value = state.draft.ficheNumber;
    persistDraft();
  });

  elements.todayButton.addEventListener('click', () => {
    state.draft.interventionDate = todayString();
    elements.interventionDate.value = state.draft.interventionDate;
    persistDraft();
  });

  elements.referenceCount.addEventListener('change', () => {
    state.draft.referenceCount = Number(elements.referenceCount.value);
    persistDraft();
    renderReferenceCounter();
    renderReferenceLines();
  });

  elements.importCatalogButton.addEventListener('click', () => {
    elements.catalogFileInput.click();
  });

  elements.catalogFileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const importedCatalog = await importCatalogFromSqlite(file);
      state.catalog = importedCatalog;
      rebuildCatalogIndex();
      await saveArticleCatalog(importedCatalog);
      renderCatalog();
      renderReferenceLines();
      showToast(`Base importée: ${importedCatalog.articleCount} article(s) depuis ${file.name}.`);
    } catch (error) {
      console.error(error);
      showToast(`Import SQLite impossible: ${error.message || error}`);
    } finally {
      elements.catalogFileInput.value = '';
    }
  });

  elements.clearCatalogButton.addEventListener('click', async () => {
    await clearArticleCatalog();
    state.catalog = createEmptyCatalog();
    rebuildCatalogIndex();
    state.draft.references = state.draft.references.map((line) => ({
      ...line,
      source: 'manual'
    }));
    persistDraft();
    renderCatalog();
    renderReferenceLines();
    showToast('Base pièces réinitialisée.');
  });

  elements.saveDraftButton.addEventListener('click', () => {
    syncDraftFromInputs();
    persistDraft();
    showToast('Brouillon enregistré.');
  });

  elements.newDraftButton.addEventListener('click', () => {
    state.draft = createDefaultDraft();
    persistDraft();
    renderForm();
    showToast('Nouvelle fiche prête.');
  });

  elements.exportPdfButton.addEventListener('click', () => handlePdfExport(false));
  elements.sharePdfButton.addEventListener('click', () => handlePdfExport(true));

  elements.capturePhotoButton.addEventListener('click', () => {
    elements.photoCaptureInput.click();
  });

  elements.photoCaptureInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      syncDraftFromInputs();
      const compressed = await compressImage(file);
      const fileName = sanitizeFileName(`Fiche_Imprimee_${state.draft.ficheNumber || 'sans_numero'}_${timestampFileString()}.jpg`);
      const record = await persistGeneratedDocument({
        kind: 'photo',
        fileName,
        mimeType: 'image/jpeg',
        blob: compressed,
        ficheNumber: state.draft.ficheNumber,
        client: state.draft.laboratoryName,
        technician: state.draft.intervenant
      });
      await uploader.enqueue({
        messageId: crypto.randomUUID(),
        fileName,
        blob: compressed,
        mimeType: 'image/jpeg',
        attachmentType: 'photo',
        interventionDate: state.draft.interventionDate,
        technician: state.draft.intervenant,
        client: state.draft.laboratoryName,
        ficheNumber: state.draft.ficheNumber,
        fallbackText: buildFallbackText(state.draft),
        createdAt: Date.now()
      });
      await refreshDocuments();
      await shareOrDownload(record.blob, record.fileName, record.mimeType);
      showToast('Capture enregistrée et mise en file d’envoi.');
    } catch (error) {
      console.error(error);
      showToast(`Capture impossible: ${error.message || error}`);
    } finally {
      elements.photoCaptureInput.value = '';
    }
  });

  elements.testLinkButton.addEventListener('click', async () => {
    try {
      await uploader.publishTestMessage();
      showToast('Message de test transmis.');
    } catch (error) {
      console.error(error);
      showToast(`Échec du test: ${uploader.shortReason(error)}`);
    }
  });

  elements.clearDocumentsButton.addEventListener('click', async () => {
    await clearGeneratedDocuments();
    state.documents = [];
    renderDocuments();
    showToast('Historique local des documents nettoyé.');
  });
}

function renderCompany() {
  elements.companyName.value = state.settings.companyName;
  elements.companyAddress.value = state.settings.companyAddress;
  elements.companyPhone.value = state.settings.companyPhone;
  elements.companyEmail.value = state.settings.companyEmail;
  elements.companyPanel.classList.toggle('hidden', !state.companyPanelOpen);
  elements.toggleCompanyButton.textContent = state.companyPanelOpen ? 'Fermer la société' : 'Configurer la société';
  elements.companySummary.textContent = [
    state.settings.companyName,
    state.settings.companyAddress,
    state.settings.companyPhone ? `TEL: ${state.settings.companyPhone}` : '',
    state.settings.companyEmail ? `Email : ${state.settings.companyEmail}` : ''
  ].filter(Boolean).join('\n');
  elements.companyContactBlock.textContent = contactBlock(state.settings);
  elements.heroLogo.src = state.settings.logoDataUrl || './fiche_intervention_logo.png';
}

function renderInstallGuide() {
  const installState = detectInstallState();
  const installed = installState.standalone;
  const browserLabel = installState.isIos && !installState.isSafari ? 'Ouvre cette page dans Safari.' : 'App web prête.';
  elements.appModeBadge.textContent = installed ? 'Mode app iPhone' : 'Mode navigateur';
  elements.installSummaryText.textContent = installed
    ? 'Version installée sur l’écran d’accueil. La file d’envoi repart automatiquement à l’ouverture et au retour réseau.'
    : installState.isIos
      ? 'Pour une vraie expérience iPhone, installe cette fiche depuis Safari sur l’écran d’accueil.'
      : 'Cette version web fonctionne aussi depuis un navigateur moderne, mais l’installation sur écran d’accueil reste idéale sur iPhone.';

  if (installed) {
    elements.installGuidePanel.classList.add('hidden');
    return;
  }

  if (state.installGuideDismissed) {
    elements.installGuidePanel.classList.add('hidden');
    return;
  }

  elements.installGuidePanel.classList.remove('hidden');

  if (installState.isIos && installState.isSafari) {
    elements.installGuideTitle.textContent = 'Installer sur l’écran d’accueil';
    elements.installGuideText.textContent =
      'Safari permet d’utiliser FI Connect Terrain comme une app iPhone: ouvre le menu de partage, ajoute l’app à l’écran d’accueil, puis valide l’ouverture comme app.';
    elements.installStepsList.innerHTML = `
      <div class="install-step"><strong>1.</strong><span>Ouvre cette page dans Safari.</span></div>
      <div class="install-step"><strong>2.</strong><span>Touche Partager.</span></div>
      <div class="install-step"><strong>3.</strong><span>Ajouter à l’écran d’accueil.</span></div>
      <div class="install-step"><strong>4.</strong><span>Ouvrir comme app.</span></div>
    `;
    return;
  }

  if (installState.isIos) {
    elements.installGuideTitle.textContent = 'Passer par Safari';
    elements.installGuideText.textContent =
      'Sur iPhone, la meilleure installation passe par Safari. Ouvre ce lien dans Safari, puis ajoute-le à l’écran d’accueil pour obtenir le mode app.';
    elements.installStepsList.innerHTML = `
      <div class="install-step"><strong>1.</strong><span>${browserLabel}</span></div>
      <div class="install-step"><strong>2.</strong><span>Reviens sur cette page.</span></div>
      <div class="install-step"><strong>3.</strong><span>Partager.</span></div>
      <div class="install-step"><strong>4.</strong><span>Ajouter à l’écran d’accueil.</span></div>
    `;
    return;
  }

  elements.installGuideTitle.textContent = 'Installer la web app';
  elements.installGuideText.textContent =
    'Cette version peut être installée comme application web. Sur iPhone, ouvre-la ensuite dans Safari pour profiter de l’expérience la plus stable.';
  elements.installStepsList.innerHTML = `
    <div class="install-step"><strong>1.</strong><span>Déploie l’app en HTTPS.</span></div>
    <div class="install-step"><strong>2.</strong><span>Ouvre l’URL sur iPhone.</span></div>
    <div class="install-step"><strong>3.</strong><span>Passe par Safari.</span></div>
    <div class="install-step"><strong>4.</strong><span>Ajoute-la à l’écran d’accueil.</span></div>
  `;
}

function detectInstallState() {
  const ua = window.navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = isIos && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return { isIos, isSafari, standalone };
}

function renderForm() {
  const draft = normalizeDraft(state.draft);
  state.draft = draft;

  elements.ficheNumber.value = draft.ficheNumber;
  elements.interventionDate.value = draft.interventionDate;
  elements.laboratoryName.value = draft.laboratoryName;
  elements.locality.value = draft.locality;
  elements.serialNumber.value = draft.serialNumber;
  elements.intervenant.value = draft.intervenant;
  elements.interventionTime.value = draft.interventionTime;
  elements.travelTime.value = draft.travelTime;
  elements.description.value = draft.description;
  elements.observation.value = draft.observation;

  renderWorkLines();
  renderReferenceCounter();
  renderReferenceLines();
}

function renderWorkLines() {
  elements.workLines.innerHTML = '';
  state.draft.workLines.forEach((line, index) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'line-row';
    wrapper.innerHTML = `
      <span class="line-badge">${index + 1}</span>
      <textarea rows="2" data-work-index="${index}" placeholder="${index === 0 ? 'Opération réalisée' : ''}"></textarea>
    `;
    const textarea = wrapper.querySelector('textarea');
    textarea.value = line;
    textarea.addEventListener('input', () => {
      state.draft.workLines[index] = textarea.value;
      persistDraft();
    });
    elements.workLines.appendChild(wrapper);
  });
}

function renderReferenceCounter() {
  elements.referenceCount.innerHTML = '';
  for (let count = 0; count <= 7; count += 1) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    if (count === state.draft.referenceCount) {
      option.selected = true;
    }
    elements.referenceCount.appendChild(option);
  }
  elements.referenceCountValueLabel.textContent = state.draft.referenceCount
    ? `${state.draft.referenceCount} pièce(s)`
    : 'Aucune pièce';
}

function renderCatalog() {
  const hasCatalog = state.catalog.articleCount > 0;
  elements.catalogSummary.textContent = hasCatalog
    ? `${state.catalog.articleCount} article(s) • table ${state.catalog.tableName} • ${state.catalog.fileName}`
    : 'Aucune base importée pour le moment.';
  renderCatalogOptions();
}

function renderCatalogOptions() {
  elements.catalogReferenceOptions.innerHTML = '';
  state.catalog.articles.slice(0, 800).forEach((article) => {
    const option = document.createElement('option');
    option.value = article.reference;
    option.label = article.designation;
    elements.catalogReferenceOptions.appendChild(option);
  });
}

function renderReferenceLines() {
  elements.referenceLines.innerHTML = '';
  if (!state.draft.referenceCount) {
    elements.referenceLines.innerHTML = '<div class="empty-state">Aucune pièce renseignée pour le moment.</div>';
    return;
  }

  for (let index = 0; index < state.draft.referenceCount; index += 1) {
    const line = state.draft.references[index];
    const card = document.createElement('div');
    card.className = 'reference-card';
    card.innerHTML = `
      <div class="reference-card__head">
        <strong>Pièce ${index + 1}</strong>
        <div class="hero-card__badges">
          <span class="doc-kind">${line.source === 'catalog' ? 'BASE' : 'LIBRE'}</span>
          <span class="doc-chip">Qté ${line.quantity}</span>
        </div>
      </div>
      <label class="field">
        <span>Référence</span>
        <input type="text" data-reference-index="${index}" data-key="reference" list="catalogReferenceOptions" placeholder="Référence (base ou saisie libre)" />
      </label>
      <label class="field">
        <span>Désignation</span>
        <input type="text" data-reference-index="${index}" data-key="designation" placeholder="Désignation" />
      </label>
      <label class="field">
        <span>Quantité</span>
        <input type="number" min="1" max="99" data-reference-index="${index}" data-key="quantity" />
      </label>
      <p class="document-card__meta">${line.source === 'catalog'
        ? 'Pièce issue de la base importée.'
        : 'Saisie libre autorisée pour une pièce hors base.'}</p>
    `;
    card.querySelector('[data-key="reference"]').value = line.reference;
    card.querySelector('[data-key="designation"]').value = line.designation;
    card.querySelector('[data-key="quantity"]').value = String(line.quantity);
    card.querySelectorAll('[data-reference-index]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.key;
        state.draft.references[index][key] = key === 'quantity' ? Number(input.value || 1) : input.value;
        if (key !== 'quantity' && state.draft.references[index].source === 'catalog') {
          state.draft.references[index].source = 'manual';
        }
        persistDraft();
      });
      if (input.dataset.key === 'reference' || input.dataset.key === 'designation') {
        input.addEventListener('change', () => {
          tryApplyCatalogMatch(index, input.dataset.key, input.value);
        });
      }
    });
    elements.referenceLines.appendChild(card);
  }
}

function renderSyncState() {
  elements.syncStatusBadge.textContent = state.pendingCount ? 'Envoi en cours' : 'Synchronisé';
  elements.pendingBadge.textContent = `${state.pendingCount} en attente`;
  elements.syncStatusText.textContent = state.syncStatus;
}

async function handlePdfExport(shareAfter) {
  try {
    syncDraftFromInputs();
    const issues = validateDraft(state.draft);
    if (issues.length) {
      showToast(issues.join(' '));
      return;
    }

    const payload = await generateInterventionPdf({
      draft: state.draft,
      settings: state.settings,
      logoDataUrl: state.settings.logoDataUrl || null
    });
    const record = await persistGeneratedDocument({
      kind: 'pdf',
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      blob: payload.blob,
      ficheNumber: state.draft.ficheNumber,
      client: state.draft.laboratoryName,
      technician: state.draft.intervenant
    });
    await uploader.enqueue({
      messageId: crypto.randomUUID(),
      fileName: payload.fileName,
      blob: payload.blob,
      mimeType: payload.mimeType,
      attachmentType: 'pdf',
      interventionDate: state.draft.interventionDate,
      technician: state.draft.intervenant,
      client: state.draft.laboratoryName,
      ficheNumber: state.draft.ficheNumber,
      fallbackText: buildFallbackText(state.draft),
      createdAt: Date.now()
    });
    await refreshDocuments();
    if (shareAfter) {
      await shareOrDownload(record.blob, record.fileName, record.mimeType);
    } else {
      openDocument(record);
    }
    showToast('PDF généré et mis en file d’envoi.');
  } catch (error) {
    console.error(error);
    showToast(`PDF impossible: ${error.message || error}`);
  }
}

async function persistGeneratedDocument(document) {
  const id = crypto.randomUUID();
  const record = {
    id,
    createdAt: Date.now(),
    ...document
  };
  await saveGeneratedDocument(record);
  return record;
}

async function refreshDocuments() {
  state.documents = await getGeneratedDocuments();
  renderDocuments();
}

function renderDocuments() {
  const total = state.documents.length;
  const counts = state.documents.reduce((acc, doc) => {
    acc[doc.kind] = (acc[doc.kind] || 0) + 1;
    return acc;
  }, { pdf: 0, photo: 0, text: 0 });

  elements.documentSummary.textContent = total
    ? `${total} document(s) local(aux)\n${counts.pdf || 0} PDF • ${counts.photo || 0} photo(s) • ${counts.text || 0} texte(s)`
    : 'Aucun document local pour le moment.';

  elements.generatedDocuments.innerHTML = '';
  if (!total) {
    elements.generatedDocuments.innerHTML = '<div class="empty-state">Les PDF et captures générés sur iPhone apparaîtront ici.</div>';
    return;
  }

  state.documents.forEach((doc) => {
    const card = document.createElement('article');
    card.className = 'document-card';
    card.innerHTML = `
      <div class="document-card__head">
        <div>
          <div class="doc-kind">${labelForKind(doc.kind)}</div>
          <h3 class="document-card__title">${doc.fileName}</h3>
          <p class="document-card__meta">${doc.client || 'Client non renseigné'} • ${doc.technician || 'Technicien non renseigné'}</p>
          <p class="document-card__meta">${humanDateTime(doc.createdAt)} • ${formatBytes(doc.blob?.size || 0)}</p>
        </div>
        <span class="doc-chip">${doc.ficheNumber || '-'}</span>
      </div>
      <div class="document-card__actions">
        <button class="doc-action" data-action="open">Ouvrir</button>
        <button class="doc-action" data-action="share">Partager</button>
      </div>
    `;
    card.querySelector('[data-action="open"]').addEventListener('click', () => openDocument(doc));
    card.querySelector('[data-action="share"]').addEventListener('click', () => shareOrDownload(doc.blob, doc.fileName, doc.mimeType));
    elements.generatedDocuments.appendChild(card);
  });
}

function openDocument(doc) {
  const url = URL.createObjectURL(doc.blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function persistDraft() {
  state.draft = normalizeDraft(state.draft);
  writeJsonStorage(DRAFT_STORAGE_KEY, state.draft);
}

function persistSettings() {
  state.settings = normalizeSettings(state.settings);
  writeJsonStorage(SETTINGS_STORAGE_KEY, state.settings);
}

function syncDraftFromInputs() {
  state.draft = normalizeDraft({
    ...state.draft,
    ficheNumber: elements.ficheNumber.value,
    interventionDate: elements.interventionDate.value,
    laboratoryName: elements.laboratoryName.value,
    locality: elements.locality.value,
    serialNumber: elements.serialNumber.value,
    intervenant: elements.intervenant.value,
    interventionTime: elements.interventionTime.value,
    travelTime: elements.travelTime.value,
    description: elements.description.value,
    observation: elements.observation.value,
    referenceCount: Number(elements.referenceCount.value)
  });
  persistDraft();
}

function labelForKind(kind) {
  switch (kind) {
    case 'photo':
      return 'PHOTO';
    case 'pdf':
      return 'PDF';
    default:
      return 'FICHIER';
  }
}

async function hydrateCatalog() {
  const storedCatalog = await getArticleCatalog();
  state.catalog = storedCatalog?.articles?.length
    ? {
        ...createEmptyCatalog(),
        ...storedCatalog
      }
    : createEmptyCatalog();
  rebuildCatalogIndex();
}

function rebuildCatalogIndex() {
  catalogIndex.byReference.clear();
  catalogIndex.byDesignation.clear();
  state.catalog.articles.forEach((article) => {
    const referenceKey = normalizeLookup(article.reference);
    const designationKey = normalizeLookup(article.designation);
    if (referenceKey && !catalogIndex.byReference.has(referenceKey)) {
      catalogIndex.byReference.set(referenceKey, article);
    }
    if (designationKey && !catalogIndex.byDesignation.has(designationKey)) {
      catalogIndex.byDesignation.set(designationKey, article);
    }
  });
}

function tryApplyCatalogMatch(index, key, value) {
  const lookup = normalizeLookup(value);
  if (!lookup) {
    return;
  }

  const match = key === 'designation'
    ? catalogIndex.byDesignation.get(lookup)
    : catalogIndex.byReference.get(lookup);

  if (!match) {
    state.draft.references[index].source = 'manual';
    persistDraft();
    renderReferenceLines();
    return;
  }

  state.draft.references[index] = {
    ...state.draft.references[index],
    reference: match.reference,
    designation: match.designation,
    quantity: state.draft.references[index].quantity || 1,
    source: 'catalog'
  };
  persistDraft();
  renderReferenceLines();
}

function normalizeLookup(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase()
    .trim();
}

function createEmptyCatalog() {
  return {
    fileName: '',
    tableName: '',
    importedAt: 0,
    articleCount: 0,
    articles: []
  };
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) {
    existing.remove();
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3400);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}

window.addEventListener('online', renderInstallGuide);
window.addEventListener('offline', renderInstallGuide);
window.addEventListener('pageshow', renderInstallGuide);

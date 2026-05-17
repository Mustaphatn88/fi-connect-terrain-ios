import { jsPDF } from 'jspdf';
import { contactBlock, workflowLabel } from './utils.js';
import { DEFAULT_PDF_LOGO_DATA_URL } from './defaultPdfLogoDataUrl.js';

const ANDROID_PAGE_WIDTH = 1240;
const ANDROID_PAGE_HEIGHT = 1754;

const DARK_TEXT = '#18212D';
const MUTED_TEXT = '#5A6675';
const TOP_BAR = '#5D90D5';
const CARD_TINT = '#F4F8FF';
const BORDER_COLOR = '#7AA6DF';
const PAGE_FILL = '#FBFCFE';
const ZEBRA_FILL = '#F8FAFD';

let fontBuffersPromise;

export async function generateInterventionPdf({ draft, settings, logoDataUrl }) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  await ensureFonts(pdf);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min(pageWidth / ANDROID_PAGE_WIDTH, pageHeight / ANDROID_PAGE_HEIGHT);
  const px = (value) => value * scale;
  const rect = (left, top, right, bottom) => ({
    x: px(left),
    y: px(top),
    width: px(right - left),
    height: px(bottom - top)
  });

  const logo = await resolveLogoDataUrl(logoDataUrl);

  drawPage(pdf, draft, settings, logo, px, rect, pageWidth, pageHeight);

  const blob = pdf.output('blob');
  const fileName = `Fiche_Intervention_${draft.ficheNumber || 'sans_numero'}.pdf`;
  return { blob, fileName, mimeType: 'application/pdf' };
}

function drawPage(pdf, draft, settings, logoDataUrl, px, rect, pageWidth, pageHeight) {
  drawOuterFrame(pdf, px, pageWidth, pageHeight);

  const headerRect = rect(72, 72, 1240 - 72, 292);
  drawFilledRoundedCard(pdf, headerRect, CARD_TINT, px(16), px(2.8));

  if (logoDataUrl) {
    try {
      const logoWidth = px(180);
      const logoHeight = px(112);
      pdf.addImage(
        logoDataUrl,
        imageFormatFor(logoDataUrl),
        headerRect.x + px(22),
        headerRect.y + px(24),
        logoWidth,
        logoHeight,
        undefined,
        'FAST'
      );
    } catch {
      // Ignore unsupported logo payloads and keep the PDF alive.
    }
  }

  drawLine(pdf, headerRect.x + px(232), headerRect.y + px(18), headerRect.x + px(232), headerRect.y + headerRect.height - px(18), px(1.8));

  const headerTextX = headerRect.x + px(266);
  writeText(pdf, "Fiche d'intervention", headerTextX, headerRect.y + px(58), {
    font: 'times',
    style: 'bold',
    size: px(33),
    color: DARK_TEXT
  });
  writeText(pdf, "Rapport d'intervention technique", headerTextX, headerRect.y + px(88), {
    font: 'helvetica',
    style: 'normal',
    size: px(17),
    color: MUTED_TEXT
  });

  const ficheBox = rect(1240 - 72 - 278, 72 + 24, 1240 - 72 - 22, 72 + 90);
  drawFilledRoundedCard(pdf, ficheBox, CARD_TINT, px(12), px(2.8));
  writeText(pdf, 'N° de fiche', ficheBox.x + px(18), ficheBox.y + px(24), {
    font: 'helvetica',
    style: 'normal',
    size: px(14),
    color: MUTED_TEXT
  });
  writeText(pdf, safeText(draft.ficheNumber), ficheBox.x + px(18), ficheBox.y + px(54), {
    font: 'BerlinSansFB',
    style: 'bold',
    size: px(18),
    color: DARK_TEXT
  });

  const companyLines = [settings.companyName || 'BIOPLUS', ...contactBlock(settings).split('\n').filter(Boolean)];
  drawWrappedLines(
    pdf,
    companyLines.join('\n'),
    {
      x: headerTextX,
      y: headerRect.y + px(108),
      width: headerRect.width - px(298),
      height: px(156)
    },
    {
      font: 'helvetica',
      style: 'bold',
      size: px(17),
      color: DARK_TEXT,
      lineHeight: px(21),
      maxLines: 5
    }
  );

  drawAccentRail(pdf, headerRect.x + px(14), headerRect.y + headerRect.height - px(12), headerRect.width - px(28), px(8));

  const addressRect = rect(72, 292 + 18, 402, 292 + 18 + 138);
  const clientRect = rect(426, 292 + 18, 1240 - 72, 292 + 18 + 138);

  drawTitledCard(pdf, addressRect, 'Adresse', px);
  drawTitledCard(pdf, clientRect, 'Information client', px);

  drawWrappedLines(
    pdf,
    companyLines.join('\n'),
    {
      x: addressRect.x + px(18),
      y: addressRect.y + px(38),
      width: addressRect.width - px(36),
      height: addressRect.height - px(54)
    },
    {
      font: 'BerlinSansFB',
      style: 'bold',
      size: px(18),
      color: DARK_TEXT,
      lineHeight: px(22),
      maxLines: 5
    }
  );

  const clientTextX = clientRect.x + px(18);
  drawLabelValue(pdf, 'Client / labo', safeText(draft.laboratoryName), clientTextX, clientRect.y + px(48), px);
  drawLabelValue(pdf, 'Localité', safeText(draft.locality), clientTextX, clientRect.y + px(72), px);
  drawLabelValue(pdf, 'NS', safeText(draft.serialNumber), clientTextX, clientRect.y + px(96), px);
  drawLabelValue(pdf, 'Statut', workflowLabel(draft.workflowStatus), clientTextX, clientRect.y + px(120), px);

  const metricTop = addressRect.y + addressRect.height + px(18);
  const metricWidth = px((1096 - 48) / 3);
  const metricHeight = px(94);
  const metrics = [
    { label: 'Date', value: safeText(draft.interventionDate) },
    { label: 'Intervention', value: safeText(draft.interventionTime) },
    { label: 'Déplacement', value: safeText(draft.travelTime) }
  ];

  metrics.forEach((metric, index) => {
    const x = px(72) + (metricWidth + px(24)) * index;
    drawMetricCard(pdf, { x, y: metricTop, width: metricWidth, height: metricHeight }, metric.label, metric.value, px);
  });

  const descriptionTop = metricTop + metricHeight + px(18);
  const descriptionRect = rect(72, unscale(descriptionTop, px), 1240 - 72, unscale(descriptionTop + px(136), px));
  drawTextCard(
    pdf,
    descriptionRect,
    'Description du problème',
    emptyFallback(draft.description, 'Aucune description renseignée.'),
    {
      font: 'BerlinSansFB',
      style: 'normal',
      size: px(18),
      color: DARK_TEXT,
      lineHeight: px(21),
      maxLines: 5,
      align: 'left'
    },
    px
  );

  const workTop = descriptionRect.y + descriptionRect.height + px(18);
  const workRect = rect(72, unscale(workTop, px), 1240 - 72, unscale(workTop + px(284), px));
  drawWorkSection(pdf, workRect, draft, px);

  const referencesTop = workRect.y + workRect.height + px(18);
  const referencesRect = rect(72, unscale(referencesTop, px), 1240 - 72, unscale(referencesTop + px(356), px));
  drawReferencesSection(pdf, referencesRect, draft, px);

  const signaturesTop = referencesRect.y + referencesRect.height + px(18);
  const signaturesRect = rect(72, unscale(signaturesTop, px), 1240 - 72, unscale(signaturesTop + px(158), px));
  drawSignatureSection(pdf, signaturesRect, draft, px);

  const observationTop = signaturesRect.y + signaturesRect.height + px(18);
  const observationRect = rect(72, unscale(observationTop, px), 1240 - 72, unscale(observationTop + px(116), px));
  drawTextCard(
    pdf,
    observationRect,
    'Observation',
    emptyFallback(draft.observation, 'Rien à Signaler'),
    {
      font: 'BerlinSansFB',
      style: 'normal',
      size: px(18),
      color: DARK_TEXT,
      lineHeight: px(21),
      maxLines: 3,
      align: 'center'
    },
    px
  );

  writeText(pdf, 'Page 1', px(1240 - 72 - 120), px(1754 - 72), {
    font: 'helvetica',
    style: 'normal',
    size: px(14),
    color: MUTED_TEXT
  });
}

function drawOuterFrame(pdf, px, pageWidth, pageHeight) {
  pdf.setFillColor(PAGE_FILL);
  pdf.setDrawColor(BORDER_COLOR);
  pdf.setLineWidth(px(2.8));
  pdf.roundedRect(px(44), px(44), pageWidth - px(88), pageHeight - px(88), px(14), px(14), 'FD');
  pdf.setFillColor(TOP_BAR);
  pdf.rect(px(44), px(44), pageWidth - px(88), px(10), 'F');
}

function drawTitledCard(pdf, cardRect, title, px) {
  drawFilledRoundedCard(pdf, cardRect, '#FFFFFF', px(14), px(2.8));
  pdf.setFont('times', 'bold');
  pdf.setFontSize(px(20));
  const textWidth = pdf.getTextWidth(title) + px(32);
  const maxWidth = cardRect.width - px(32);
  const floatingWidth = Math.min(textWidth, maxWidth);
  const floatingRect = {
    x: cardRect.x + (cardRect.width / 2) - (floatingWidth / 2),
    y: cardRect.y - px(14),
    width: floatingWidth,
    height: px(30)
  };
  pdf.setFillColor('#FFFFFF');
  pdf.roundedRect(floatingRect.x, floatingRect.y, floatingRect.width, floatingRect.height, px(12), px(12), 'F');
  writeText(pdf, title, floatingRect.x + px(16), floatingRect.y + px(21), {
    font: 'times',
    style: 'bold',
    size: px(20),
    color: DARK_TEXT
  });
}

function drawMetricCard(pdf, cardRect, label, value, px) {
  drawFilledRoundedCard(pdf, cardRect, CARD_TINT, px(14), px(2.8));
  writeText(pdf, label, cardRect.x + px(18), cardRect.y + px(24), {
    font: 'helvetica',
    style: 'normal',
    size: px(14),
    color: MUTED_TEXT
  });
  writeText(pdf, value, cardRect.x + (cardRect.width / 2), cardRect.y + px(64), {
    font: 'BerlinSansFB',
    style: 'bold',
    size: px(26),
    color: DARK_TEXT,
    align: 'center'
  });
}

function drawTextCard(pdf, cardRect, title, body, style, px) {
  drawTitledCard(pdf, cardRect, title, px);
  drawWrappedLines(
    pdf,
    body,
    {
      x: cardRect.x + px(18),
      y: cardRect.y + px(40),
      width: cardRect.width - px(36),
      height: cardRect.height - px(54)
    },
    style
  );
}

function drawWorkSection(pdf, cardRect, draft, px) {
  drawTitledCard(pdf, cardRect, 'Travail effectué', px);

  const rowTop = cardRect.y + px(36);
  const rowHeight = ((cardRect.y + cardRect.height) - rowTop - px(12)) / 7;

  for (let index = 0; index < 7; index += 1) {
    const top = rowTop + (index * rowHeight);
    const bottom = top + rowHeight;

    if (index % 2 === 0) {
      pdf.setFillColor(ZEBRA_FILL);
      pdf.roundedRect(cardRect.x + px(10), top + px(3), cardRect.width - px(20), rowHeight - px(6), px(8), px(8), 'F');
    }

    if (index > 0) {
      drawLine(pdf, cardRect.x + px(10), top, cardRect.x + cardRect.width - px(10), top, px(1.8));
    }

    writeText(pdf, `${index + 1}.`, cardRect.x + px(18), top + px(24), {
      font: 'BerlinSansFB',
      style: 'bold',
      size: px(18),
      color: DARK_TEXT
    });

    const rawLine = String(draft.workLines?.[index] || '').trim();
    const line = rawLine || (index === 0 ? 'Aucune opération renseignée.' : '');
    drawWrappedLines(
      pdf,
      line,
      {
        x: cardRect.x + px(56),
        y: top + px(7),
        width: cardRect.width - px(74),
        height: rowHeight - px(13)
      },
      {
        font: rawLine ? 'BerlinSansFB' : 'helvetica',
        style: rawLine ? 'normal' : 'normal',
        size: px(18),
        color: rawLine ? DARK_TEXT : MUTED_TEXT,
        lineHeight: px(20),
        maxLines: 2,
        align: 'left'
      }
    );
  }
}

function drawReferencesSection(pdf, cardRect, draft, px) {
  drawTitledCard(pdf, cardRect, 'Références', px);

  const tableRect = {
    x: cardRect.x + px(10),
    y: cardRect.y + px(38),
    width: cardRect.width - px(20),
    height: cardRect.height - px(48)
  };
  const refDividerX = tableRect.x + px(220);
  const qtyDividerX = tableRect.x + tableRect.width - px(96);
  const headerBottomY = tableRect.y + px(36);
  const rowHeight = (tableRect.height - px(36)) / 7;

  pdf.setFillColor(CARD_TINT);
  pdf.roundedRect(tableRect.x, tableRect.y, tableRect.width, px(36), px(10), px(10), 'F');
  drawLine(pdf, tableRect.x, headerBottomY, tableRect.x + tableRect.width, headerBottomY, px(1.8));
  drawLine(pdf, refDividerX, tableRect.y, refDividerX, tableRect.y + tableRect.height, px(1.8));
  drawLine(pdf, qtyDividerX, tableRect.y, qtyDividerX, tableRect.y + tableRect.height, px(1.8));

  writeText(pdf, 'REF', tableRect.x + px(16), tableRect.y + px(24), {
    font: 'helvetica',
    style: 'bold',
    size: px(17),
    color: DARK_TEXT
  });
  writeText(pdf, 'DESIGNATION', refDividerX + px(16), tableRect.y + px(24), {
    font: 'helvetica',
    style: 'bold',
    size: px(17),
    color: DARK_TEXT
  });
  writeText(pdf, 'QTE', qtyDividerX + px(22), tableRect.y + px(24), {
    font: 'helvetica',
    style: 'bold',
    size: px(17),
    color: DARK_TEXT
  });

  const rows = Array.from({ length: 7 }, (_, index) => {
    const source = draft.references?.[index] || {};
    return {
      reference: String(source.reference || '').trim(),
      designation: String(source.designation || '').trim(),
      quantity: source.quantity
    };
  });

  rows.forEach((row, index) => {
    const rowTop = headerBottomY + (index * rowHeight);
    if (index > 0) {
      drawLine(pdf, tableRect.x, rowTop, tableRect.x + tableRect.width, rowTop, px(1.8));
    }

    const rowBottom = rowTop + rowHeight;
    drawWrappedLines(
      pdf,
      row.reference,
      {
        x: tableRect.x + px(12),
        y: rowTop + px(8),
        width: px(220) - px(24),
        height: rowHeight - px(14)
      },
      {
        font: 'BerlinSansFB',
        style: 'normal',
        size: px(18),
        color: DARK_TEXT,
        lineHeight: px(19),
        maxLines: 2,
        align: 'left'
      }
    );

    drawWrappedLines(
      pdf,
      row.designation,
      {
        x: refDividerX + px(12),
        y: rowTop + px(8),
        width: (qtyDividerX - refDividerX) - px(24),
        height: rowHeight - px(14)
      },
      {
        font: 'BerlinSansFB',
        style: 'normal',
        size: px(18),
        color: DARK_TEXT,
        lineHeight: px(19),
        maxLines: 2,
        align: 'left'
      }
    );

    const showQuantity = row.reference || row.designation;
    drawWrappedLines(
      pdf,
      showQuantity ? String(row.quantity || 1) : '',
      {
        x: qtyDividerX + px(6),
        y: rowTop + px(10),
        width: px(84),
        height: rowHeight - px(20)
      },
      {
        font: 'BerlinSansFB',
        style: 'bold',
        size: px(18),
        color: DARK_TEXT,
        lineHeight: px(18),
        maxLines: 1,
        align: 'center'
      }
    );

    if (index === rows.length - 1) {
      drawLine(pdf, tableRect.x, rowBottom, tableRect.x + tableRect.width, rowBottom, px(1.8));
    }
  });
}

function drawSignatureSection(pdf, cardRect, draft, px) {
  drawTitledCard(pdf, cardRect, 'Signatures & cachet', px);

  const contentTop = cardRect.y + px(38);
  const centerX = cardRect.x + (cardRect.width / 2);
  drawLine(pdf, centerX, contentTop + px(8), centerX, cardRect.y + cardRect.height - px(14), px(1.8));

  const leftLabelX = cardRect.x + px(18);
  const rightLabelX = centerX + px(18);
  const labelBaseline = contentTop + px(20);

  writeText(pdf, 'Intervenant', leftLabelX, labelBaseline, {
    font: 'helvetica',
    style: 'bold',
    size: px(17),
    color: DARK_TEXT
  });
  writeText(pdf, 'Client / labo', rightLabelX, labelBaseline, {
    font: 'helvetica',
    style: 'bold',
    size: px(17),
    color: DARK_TEXT
  });

  const nameLineY = cardRect.y + cardRect.height - px(36);
  const signTop = contentTop + px(18);
  const signBottom = nameLineY - px(12);
  const leftSignRect = {
    x: cardRect.x + px(18),
    y: signTop,
    width: (centerX - px(18)) - (cardRect.x + px(18)),
    height: signBottom - signTop
  };
  const rightSignRect = {
    x: rightLabelX,
    y: signTop,
    width: (cardRect.x + cardRect.width - px(18)) - rightLabelX,
    height: signBottom - signTop
  };

  drawSignatureSlot(pdf, draft.technicianSignatureDataUrl, leftSignRect, px);
  drawSignatureSlot(pdf, draft.clientSignatureDataUrl, rightSignRect, px);

  drawLine(pdf, cardRect.x + px(18), nameLineY, centerX - px(18), nameLineY, px(1.8));
  drawLine(pdf, rightLabelX, nameLineY, cardRect.x + cardRect.width - px(18), nameLineY, px(1.8));

  writeText(pdf, safeText(draft.intervenant), leftLabelX, cardRect.y + cardRect.height - px(12), {
    font: 'BerlinSansFB',
    style: 'normal',
    size: px(18),
    color: DARK_TEXT
  });
  writeText(pdf, safeText(draft.laboratoryName), rightLabelX, cardRect.y + cardRect.height - px(12), {
    font: 'BerlinSansFB',
    style: 'normal',
    size: px(18),
    color: DARK_TEXT
  });
}

function drawSignatureSlot(pdf, dataUrl, slotRect, px) {
  if (!dataUrl) {
    drawWrappedLines(
      pdf,
      'Signature à recueillir',
      {
        x: slotRect.x,
        y: slotRect.y + (slotRect.height / 2) - px(14),
        width: slotRect.width,
        height: px(36)
      },
      {
        font: 'helvetica',
        style: 'normal',
        size: px(14),
        color: MUTED_TEXT,
        lineHeight: px(16),
        maxLines: 1,
        align: 'center'
      }
    );
    return;
  }

  try {
    const availableWidth = Math.max(px(1), slotRect.width - px(4));
    const availableHeight = Math.max(px(1), slotRect.height - px(8));
    const drawHeight = availableHeight * 0.94;
    const drawWidth = availableWidth * 0.62;
    const drawRight = slotRect.x + slotRect.width - px(2);
    const drawTop = (slotRect.y + slotRect.height - drawHeight) - (availableHeight * 0.02);
    pdf.addImage(
      dataUrl,
      imageFormatFor(dataUrl),
      drawRight - drawWidth,
      drawTop,
      drawWidth,
      drawHeight,
      undefined,
      'FAST'
    );
  } catch {
    drawWrappedLines(
      pdf,
      'Signature à recueillir',
      {
        x: slotRect.x,
        y: slotRect.y + (slotRect.height / 2) - px(14),
        width: slotRect.width,
        height: px(36)
      },
      {
        font: 'helvetica',
        style: 'normal',
        size: px(14),
        color: MUTED_TEXT,
        lineHeight: px(16),
        maxLines: 1,
        align: 'center'
      }
    );
  }
}

function drawFilledRoundedCard(pdf, rect, fillColor, radius, strokeWidth) {
  pdf.setFillColor(fillColor);
  pdf.setDrawColor(BORDER_COLOR);
  pdf.setLineWidth(strokeWidth);
  pdf.roundedRect(rect.x, rect.y, rect.width, rect.height, radius, radius, 'FD');
}

function drawAccentRail(pdf, x, y, width, height) {
  pdf.setFillColor(TOP_BAR);
  pdf.roundedRect(x, y, width, height, height, height, 'F');
}

function drawLabelValue(pdf, label, value, x, baselineY, px) {
  const labelText = `${label} :`;
  writeText(pdf, labelText, x, baselineY, {
    font: 'helvetica',
    style: 'bold',
    size: px(17),
    color: DARK_TEXT
  });
  writeText(pdf, value, x + pdf.getTextWidth(labelText) + px(10), baselineY, {
    font: 'BerlinSansFB',
    style: 'normal',
    size: px(19),
    color: DARK_TEXT
  });
}

function writeText(pdf, text, x, y, options) {
  pdf.setFont(options.font, options.style);
  pdf.setFontSize(options.size);
  pdf.setTextColor(options.color);
  pdf.text(String(text), x, y, options.align ? { align: options.align } : undefined);
}

function drawWrappedLines(pdf, text, rect, style) {
  const content = String(text || '');
  pdf.setFont(style.font, style.style);
  pdf.setFontSize(style.size);
  const lines = splitWithMaxLines(pdf, content, rect.width, style.maxLines, style.align === 'center');
  if (!lines.length) {
    return;
  }

  pdf.setTextColor(style.color);

  lines.forEach((line, index) => {
    const baselineY = rect.y + (index * style.lineHeight) + style.size;
    if (style.align === 'center') {
      pdf.text(line, rect.x + (rect.width / 2), baselineY, { align: 'center' });
    } else {
      pdf.text(line, rect.x, baselineY);
    }
  });
}

function splitWithMaxLines(pdf, text, width, maxLines, centered = false) {
  if (!text) {
    return [];
  }

  const rawLines = pdf.splitTextToSize(text, Math.max(width, 1));
  if (rawLines.length <= maxLines) {
    return rawLines;
  }

  const lines = rawLines.slice(0, maxLines);
  const ellipsis = '...';
  let lastLine = String(lines[maxLines - 1] || '');
  const maxWidth = Math.max(width, 1);
  while (lastLine.length > 1 && pdf.getTextWidth(`${lastLine}${ellipsis}`) > maxWidth) {
    lastLine = lastLine.slice(0, -1);
  }
  lines[maxLines - 1] = centered ? `${lastLine}${ellipsis}`.trim() : `${lastLine}${ellipsis}`;
  return lines;
}

function drawLine(pdf, x1, y1, x2, y2, width) {
  pdf.setDrawColor(BORDER_COLOR);
  pdf.setLineWidth(width);
  pdf.line(x1, y1, x2, y2);
}

function safeText(value) {
  return String(value || '').trim() || '-';
}

function emptyFallback(value, fallback) {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
}

function unscale(value, px) {
  return value / px(1);
}

function imageFormatFor(dataUrl) {
  return dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
}

async function ensureFonts(pdf) {
  if (!fontBuffersPromise) {
    fontBuffersPromise = Promise.all([
      fetch('./fonts/berlin_sans_fb_regular.ttf').then((response) => response.arrayBuffer()),
      fetch('./fonts/berlin_sans_fb_bold.ttf').then((response) => response.arrayBuffer())
    ]).catch(() => null);
  }

  const buffers = await fontBuffersPromise;
  if (!buffers) {
    return;
  }

  const [regularBuffer, boldBuffer] = buffers;
  pdf.addFileToVFS('berlin_sans_fb_regular.ttf', arrayBufferToBinaryString(regularBuffer));
  pdf.addFont('berlin_sans_fb_regular.ttf', 'BerlinSansFB', 'normal');
  pdf.addFileToVFS('berlin_sans_fb_bold.ttf', arrayBufferToBinaryString(boldBuffer));
  pdf.addFont('berlin_sans_fb_bold.ttf', 'BerlinSansFB', 'bold');
}

async function resolveLogoDataUrl(logoDataUrl) {
  if (logoDataUrl) {
    return logoDataUrl;
  }
  return DEFAULT_PDF_LOGO_DATA_URL;
}

function arrayBufferToBinaryString(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return binary;
}

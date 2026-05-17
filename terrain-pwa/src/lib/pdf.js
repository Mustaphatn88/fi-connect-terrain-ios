import { jsPDF } from 'jspdf';
import { contactBlock, workflowLabel } from './utils.js';

const BORDER_COLOR = '#77a7e1';
const FILL_TINT = '#eef5ff';
const TITLE_COLOR = '#202631';
const MUTED_TEXT = '#617792';
const PAGE_MARGIN = 24;
const SECTION_GAP = 10;
let fontsReadyPromise;

export async function generateInterventionPdf({ draft, settings, logoDataUrl }) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });
  await ensureFonts(pdf);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - (PAGE_MARGIN * 2);

  drawPageFrame(pdf, pageWidth, pageHeight);

  let cursorY = PAGE_MARGIN;
  cursorY = await drawHeader(pdf, draft, settings, logoDataUrl, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawAddressAndClientSection(pdf, draft, settings, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawMetricsRow(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawDescription(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawWorkSection(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawReferencesSection(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawSignatureSection(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  drawObservation(pdf, draft, cursorY, PAGE_MARGIN, contentWidth, pageHeight);

  const blob = pdf.output('blob');
  const fileName = `Fiche_Intervention_${draft.ficheNumber || 'sans_numero'}.pdf`;
  return { blob, fileName, mimeType: 'application/pdf' };
}

async function drawHeader(pdf, draft, settings, logoDataUrl, y, x, width) {
  const height = 102;
  drawCard(pdf, x, y, width, height, FILL_TINT);

  const logoRect = { x: x + 12, y: y + 12, width: 90, height: 58 };
  const dividerX = x + 112;
  const ficheBox = { x: x + width - 126, y: y + 12, width: 116, height: 38 };

  if (logoDataUrl) {
    try {
      const format = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      pdf.addImage(logoDataUrl, format, logoRect.x, logoRect.y, logoRect.width, logoRect.height, undefined, 'FAST');
    } catch {
      // Keep PDF generation alive if logo payload is unsupported.
    }
  }

  pdf.setDrawColor(BORDER_COLOR);
  pdf.setLineWidth(0.9);
  pdf.line(dividerX, y + 10, dividerX, y + height - 10);
  pdf.line(x + 18, y + height - 10, x + width - 18, y + height - 10);

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(25);
  pdf.text("Fiche d'intervention", x + 128, y + 31);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11.8);
  pdf.setTextColor(MUTED_TEXT);
  pdf.text("Rapport d'intervention technique", x + 128, y + 51);

  pdf.setFont('BerlinSansFB', 'bold');
  pdf.setFontSize(12.8);
  pdf.setTextColor(TITLE_COLOR);
  pdf.text(settings.companyName || 'BIOPLUS', x + 128, y + 66);

  pdf.setFont('BerlinSansFB', 'normal');
  pdf.setFontSize(10.2);
  drawMultiline(pdf, contactBlock(settings), x + 128, y + 79, 225, 10.4, 3);

  drawCard(pdf, ficheBox.x, ficheBox.y, ficheBox.width, ficheBox.height, FILL_TINT, 8);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.8);
  pdf.setTextColor(MUTED_TEXT);
  pdf.text('N° de fiche', ficheBox.x + 10, ficheBox.y + 13);
  pdf.setFont('BerlinSansFB', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(TITLE_COLOR);
  pdf.text(draft.ficheNumber || '-', ficheBox.x + 10, ficheBox.y + 30);

  return y + height;
}

function drawAddressAndClientSection(pdf, draft, settings, y, x, width) {
  const gap = 12;
  const leftWidth = 162;
  const rightWidth = width - leftWidth - gap;
  const height = 76;

  drawTitledCard(pdf, 'Adresse', x, y, leftWidth, height);
  drawTitledCard(pdf, 'Information client', x + leftWidth + gap, y, rightWidth, height);

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(11.5);
  drawMultiline(pdf, settings.companyName || 'BIOPLUS', x + 12, y + 26, leftWidth - 24, 12, 1);

  pdf.setFont('BerlinSansFB', 'bold');
  pdf.setFontSize(10.8);
  const companyBlock = [
    settings.companyAddress || '-',
    settings.companyPhone ? `TEL: ${settings.companyPhone}` : '',
    settings.companyEmail ? `Email : ${settings.companyEmail}` : ''
  ].filter(Boolean).join('\n');
  drawMultiline(pdf, companyBlock, x + 12, y + 40, leftWidth - 24, 11.6, 4);

  const infoX = x + leftWidth + gap + 12;
  pdf.setFont('BerlinSansFB', 'bold');
  pdf.setFontSize(12);
  const clientLines = [
    `Client / labo :  ${draft.laboratoryName || '-'}`,
    `Localité :  ${draft.locality || '-'}`,
    `NS :  ${draft.serialNumber || '-'}`,
    `Statut :  ${workflowLabel(draft.workflowStatus)}`
  ];
  clientLines.forEach((line, index) => {
    pdf.text(line, infoX, y + 26 + (index * 14));
  });

  return y + height;
}

function drawMetricsRow(pdf, draft, y, x, width) {
  const gap = 12;
  const boxWidth = (width - (gap * 2)) / 3;
  const height = 56;

  drawMetricCard(pdf, 'Date', draft.interventionDate || '-', x, y, boxWidth, height);
  drawMetricCard(pdf, 'Intervention', draft.interventionTime || '-', x + boxWidth + gap, y, boxWidth, height);
  drawMetricCard(pdf, 'Déplacement', draft.travelTime || '-', x + ((boxWidth + gap) * 2), y, boxWidth, height);

  return y + height;
}

function drawMetricCard(pdf, label, value, x, y, width, height) {
  drawCard(pdf, x, y, width, height, FILL_TINT, 8);
  pdf.setTextColor(MUTED_TEXT);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.7);
  pdf.text(label, x + 10, y + 14);
  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('BerlinSansFB', 'bold');
  pdf.setFontSize(13.2);
  pdf.text(String(value || '-'), x + (width / 2), y + 38, { align: 'center' });
}

function drawDescription(pdf, draft, y, x, width) {
  const height = 74;
  drawTitledCard(pdf, 'Description du problème', x, y, width, height);
  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('BerlinSansFB', 'normal');
  pdf.setFontSize(11.2);
  drawMultiline(pdf, draft.description || '-', x + 12, y + 30, width - 24, 13, 3);
  return y + height;
}

function drawWorkSection(pdf, draft, y, x, width) {
  const height = 152;
  drawTitledCard(pdf, 'Travail effectué', x, y, width, height);

  const top = y + 30;
  const lineCount = 7;
  const rowHeight = 18;

  pdf.setDrawColor(BORDER_COLOR);
  pdf.setLineWidth(0.7);
  for (let index = 0; index <= lineCount; index += 1) {
    const lineY = top + (index * rowHeight);
    pdf.line(x + 12, lineY, x + width - 12, lineY);
  }

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('BerlinSansFB', 'bold');
  pdf.setFontSize(10.6);
  for (let index = 0; index < lineCount; index += 1) {
    const baseY = top + 14 + (index * rowHeight);
    pdf.text(`${index + 1}.`, x + 18, baseY);
    const value = truncateText(pdf, draft.workLines[index] || '', width - 70);
    if (value) {
      pdf.setFont('BerlinSansFB', 'normal');
      pdf.text(value, x + 42, baseY);
      pdf.setFont('BerlinSansFB', 'bold');
    }
  }

  return y + height;
}

function drawReferencesSection(pdf, draft, y, x, width) {
  const height = 176;
  drawTitledCard(pdf, 'Références', x, y, width, height);

  const top = y + 34;
  const left = x + 12;
  const tableWidth = width - 24;
  const refWidth = 104;
  const qtyWidth = 50;
  const desWidth = tableWidth - refWidth - qtyWidth;
  const rowHeight = 19;
  const rowCount = 6;

  pdf.setDrawColor(BORDER_COLOR);
  pdf.setLineWidth(0.7);

  for (let index = 0; index <= rowCount + 1; index += 1) {
    const rowY = top + (index * rowHeight);
    pdf.line(left, rowY, left + tableWidth, rowY);
  }

  pdf.line(left + refWidth, top, left + refWidth, top + (rowHeight * (rowCount + 1)));
  pdf.line(left + refWidth + desWidth, top, left + refWidth + desWidth, top + (rowHeight * (rowCount + 1)));

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('BerlinSansFB', 'bold');
  pdf.setFontSize(10.2);
  pdf.text('REF', left + 6, top + 14);
  pdf.text('DESIGNATION', left + refWidth + 6, top + 14);
  pdf.text('QTE', left + refWidth + desWidth + 20, top + 14);

  const lines = draft.references
    .slice(0, draft.referenceCount)
    .filter((line) => line.reference.trim() || line.designation.trim())
    .slice(0, rowCount);

  pdf.setFont('BerlinSansFB', 'normal');
  pdf.setFontSize(9.6);
  lines.forEach((line, index) => {
    const textY = top + 14 + ((index + 1) * rowHeight);
    pdf.text(truncateText(pdf, line.reference || '-', refWidth - 12), left + 6, textY);
    pdf.text(truncateText(pdf, line.designation || '-', desWidth - 12), left + refWidth + 6, textY);
    pdf.text(String(line.quantity || 1), left + refWidth + desWidth + 20, textY);
  });

  return y + height;
}

function drawSignatureSection(pdf, draft, y, x, width) {
  const height = 92;
  drawTitledCard(pdf, 'Signatures & cachet', x, y, width, height);

  const midX = x + (width / 2);
  const labelY = y + 34;
  const signAreaY = y + 32;
  const signAreaHeight = 30;
  const lineY = y + 68;
  const nameY = y + 84;

  pdf.setDrawColor(BORDER_COLOR);
  pdf.setLineWidth(0.8);
  pdf.line(midX, y + 32, midX, y + height - 14);
  pdf.line(x + 22, lineY, midX - 18, lineY);
  pdf.line(midX + 18, lineY, x + width - 22, lineY);

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('BerlinSansFB', 'bold');
  pdf.setFontSize(10.8);
  pdf.text('Intervenant', x + 20, labelY);
  pdf.text('Client / labo', midX + 20, labelY);

  const leftSignRect = { x: x + 108, y: signAreaY, width: midX - x - 138, height: signAreaHeight };
  const rightSignRect = { x: midX + 108, y: signAreaY, width: x + width - midX - 138, height: signAreaHeight };

  drawSignatureImage(pdf, draft.technicianSignatureDataUrl, leftSignRect.x, leftSignRect.y, leftSignRect.width, leftSignRect.height);
  drawSignatureImage(pdf, draft.clientSignatureDataUrl, rightSignRect.x, rightSignRect.y, rightSignRect.width, rightSignRect.height);

  if (!draft.technicianSignatureDataUrl) {
    drawSignaturePlaceholder(pdf, 'Signature à recueillir', leftSignRect);
  }
  if (!draft.clientSignatureDataUrl) {
    drawSignaturePlaceholder(pdf, 'Signature à recueillir', rightSignRect);
  }

  pdf.setFont('BerlinSansFB', 'normal');
  pdf.setFontSize(10.6);
  pdf.setTextColor(TITLE_COLOR);
  pdf.text(truncateText(pdf, draft.intervenant || '-', midX - x - 40), x + 20, nameY);
  pdf.text(truncateText(pdf, draft.laboratoryName || '-', x + width - midX - 40), midX + 20, nameY);

  return y + height;
}

function drawObservation(pdf, draft, y, x, width, pageHeight) {
  const footerReserve = 34;
  const height = Math.max(70, pageHeight - footerReserve - y - PAGE_MARGIN);
  drawTitledCard(pdf, 'Observation', x, y, width, height);
  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('BerlinSansFB', 'normal');
  pdf.setFontSize(11.2);
  drawMultiline(pdf, draft.observation || 'Rien à Signaler', x + 12, y + 34, width - 24, 13, 3);

  pdf.setTextColor(MUTED_TEXT);
  pdf.setFontSize(10.2);
  pdf.text('Page 1', x + width - 12, y + height - 10, { align: 'right' });
  return y + height;
}

function drawTitledCard(pdf, title, x, y, width, height) {
  drawCard(pdf, x, y, width, height, '#ffffff');
  const titleWidth = pdf.getTextWidth(title) + 22;
  const titleX = x + ((width - titleWidth) / 2);
  pdf.setFillColor('#ffffff');
  pdf.rect(titleX, y - 10, titleWidth, 18, 'F');
  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(12.6);
  pdf.text(title, x + (width / 2), y + 4, { align: 'center' });
}

function drawCard(pdf, x, y, width, height, fillColor = '#ffffff', radius = 10) {
  pdf.setDrawColor(BORDER_COLOR);
  pdf.setFillColor(fillColor);
  pdf.setLineWidth(1);
  pdf.roundedRect(x, y, width, height, radius, radius, 'FD');
}

function truncateText(pdf, value, width) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  const ellipsis = '...';
  if (pdf.getTextWidth(text) <= width) {
    return text;
  }

  let output = text;
  while (output.length > 1 && pdf.getTextWidth(`${output}${ellipsis}`) > width) {
    output = output.slice(0, -1);
  }
  return `${output}${ellipsis}`;
}

function drawMultiline(pdf, text, x, y, width, lineHeight, maxLines = 4) {
  const lines = pdf.splitTextToSize(String(text || ''), width).slice(0, maxLines);
  lines.forEach((line, index) => {
    pdf.text(line, x, y + (index * lineHeight));
  });
}

function drawSignaturePlaceholder(pdf, text, rect) {
  pdf.setTextColor(MUTED_TEXT);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.8);
  pdf.text(text, rect.x + (rect.width / 2), rect.y + 18, { align: 'center' });
}

function drawSignatureImage(pdf, dataUrl, x, y, width, height) {
  if (!dataUrl) {
    return;
  }

  try {
    const format = dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
    const drawWidth = width * 0.84;
    const drawHeight = height * 1.1;
    const drawX = x + ((width - drawWidth) / 2);
    const drawY = y + height - drawHeight + 4;
    pdf.addImage(dataUrl, format, drawX, drawY, drawWidth, drawHeight, undefined, 'FAST');
  } catch {
    // Ignore unsupported image payloads and keep the PDF alive.
  }
}

function drawPageFrame(pdf, pageWidth, pageHeight) {
  pdf.setLineWidth(1);
  pdf.setDrawColor(BORDER_COLOR);
  pdf.roundedRect(10, 10, pageWidth - 20, pageHeight - 20, 12, 12);
}

async function ensureFonts(pdf) {
  if (!fontsReadyPromise) {
    fontsReadyPromise = Promise.all([
      fetch('./fonts/berlin_sans_fb_regular.ttf').then((response) => response.arrayBuffer()),
      fetch('./fonts/berlin_sans_fb_bold.ttf').then((response) => response.arrayBuffer())
    ]).then(([regularBuffer, boldBuffer]) => {
      pdf.addFileToVFS('berlin_sans_fb_regular.ttf', arrayBufferToBinaryString(regularBuffer));
      pdf.addFont('berlin_sans_fb_regular.ttf', 'BerlinSansFB', 'normal');
      pdf.addFileToVFS('berlin_sans_fb_bold.ttf', arrayBufferToBinaryString(boldBuffer));
      pdf.addFont('berlin_sans_fb_bold.ttf', 'BerlinSansFB', 'bold');
    }).catch(() => {
      // Keep default fonts if custom font loading fails.
    });
  }
  await fontsReadyPromise;
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

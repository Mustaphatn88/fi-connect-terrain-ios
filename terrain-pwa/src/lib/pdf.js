import { jsPDF } from 'jspdf';
import { contactBlock } from './utils.js';

const STROKE_COLOR = '#8fb7d9';
const TITLE_COLOR = '#1e2530';
const MUTED_TEXT = '#4b6278';
const PAGE_MARGIN = 24;
const SECTION_GAP = 10;

export async function generateInterventionPdf({ draft, settings, logoDataUrl }) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - (PAGE_MARGIN * 2);

  drawPageFrame(pdf, pageWidth, pageHeight);
  await drawHeader(pdf, draft, settings, logoDataUrl, PAGE_MARGIN, contentWidth);

  let cursorY = PAGE_MARGIN + 90 + SECTION_GAP;
  cursorY = drawGeneralInformation(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawDescription(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawWorkSection(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawReferencesSection(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  cursorY = drawSignatureSection(pdf, draft, cursorY, PAGE_MARGIN, contentWidth) + SECTION_GAP;
  drawObservation(pdf, draft, cursorY, PAGE_MARGIN, contentWidth);

  const blob = pdf.output('blob');
  const fileName = `Fiche_Intervention_${draft.ficheNumber || 'sans_numero'}.pdf`;
  return { blob, fileName, mimeType: 'application/pdf' };
}

async function drawHeader(pdf, draft, settings, logoDataUrl, x, width) {
  const y = PAGE_MARGIN;
  const height = 90;
  roundedRect(pdf, x, y, width, height, STROKE_COLOR, '#ffffff');

  if (logoDataUrl) {
    try {
      const format = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      pdf.addImage(logoDataUrl, format, x + 10, y + 10, 86, 50, undefined, 'FAST');
    } catch {
      // Ignore unsupported logo payloads and keep the PDF generation alive.
    }
  }

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('Fiche d\'intervention', x + 110, y + 24);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11.5);
  pdf.text(settings.companyName || 'BIOPLUS', x + 110, y + 44);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(MUTED_TEXT);
  drawMultiline(pdf, contactBlock(settings), x + 110, y + 58, 240, 11, 3);

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(`N° fiche : ${draft.ficheNumber || '-'}`, x + width - 16, y + 24, { align: 'right' });
  pdf.text(`Date : ${draft.interventionDate || '-'}`, x + width - 16, y + 40, { align: 'right' });
}

function drawGeneralInformation(pdf, draft, y, x, width) {
  const height = 104;
  drawFieldset(pdf, 'Informations générales', x, y, width, height);

  const rows = [
    ['Date', draft.interventionDate || '-', 'Intervenant', draft.intervenant || '-'],
    ['Client / labo', draft.laboratoryName || '-', 'Temps intervention', draft.interventionTime || '-'],
    ['Localité', draft.locality || '-', 'Temps déplacement', draft.travelTime || '-'],
    ['NS / série', draft.serialNumber || '-', '', '']
  ];

  const leftX = x + 14;
  const rightX = x + (width / 2) + 6;
  pdf.setFontSize(10.2);
  rows.forEach((row, index) => {
    const lineY = y + 34 + (index * 18);
    drawLabelValue(pdf, row[0], row[1], leftX, lineY, 246);
    if (row[2]) {
      drawLabelValue(pdf, row[2], row[3], rightX, lineY, 246);
    }
  });

  return y + height;
}

function drawDescription(pdf, draft, y, x, width) {
  const height = 72;
  drawFieldset(pdf, 'Description du problème', x, y, width, height);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.1);
  drawMultiline(pdf, draft.description || '-', x + 14, y + 30, width - 28, 11.5, 3);
  return y + height;
}

function drawWorkSection(pdf, draft, y, x, width) {
  const height = 136;
  drawFieldset(pdf, 'Travail effectué', x, y, width, height);

  const top = y + 22;
  const lineCount = 7;
  const rowHeight = 16;
  pdf.setDrawColor(STROKE_COLOR);
  pdf.setLineWidth(0.7);

  for (let index = 0; index <= lineCount; index += 1) {
    const lineY = top + (index * rowHeight);
    pdf.line(x + 14, lineY, x + width - 14, lineY);
  }

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.3);
  for (let index = 0; index < lineCount; index += 1) {
    const baseY = top + 12 + (index * rowHeight);
    pdf.text(`${index + 1}.`, x + 18, baseY);
    const value = truncateText(pdf, draft.workLines[index] || '', width - 62);
    if (value) {
      pdf.setFont('helvetica', 'normal');
      pdf.text(value, x + 40, baseY);
      pdf.setFont('helvetica', 'bold');
    }
  }

  return y + height;
}

function drawReferencesSection(pdf, draft, y, x, width) {
  const height = 156;
  drawFieldset(pdf, 'Références / articles', x, y, width, height);

  const top = y + 26;
  const left = x + 14;
  const refWidth = 132;
  const qtyWidth = 42;
  const desWidth = width - 28 - refWidth - qtyWidth;
  const rowHeight = 18;
  const rowCount = 6;

  pdf.setDrawColor(STROKE_COLOR);
  pdf.setLineWidth(0.7);
  pdf.line(left, top + rowHeight, left + width - 28, top + rowHeight);
  pdf.line(left + refWidth, top, left + refWidth, top + (rowHeight * (rowCount + 1)));
  pdf.line(left + refWidth + desWidth, top, left + refWidth + desWidth, top + (rowHeight * (rowCount + 1)));

  for (let index = 0; index <= rowCount; index += 1) {
    const rowY = top + (index * rowHeight);
    pdf.line(left, rowY, left + width - 28, rowY);
  }

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.2);
  pdf.text('REF', left + 6, top + 12);
  pdf.text('DESIGNATION', left + refWidth + 6, top + 12);
  pdf.text('QTE', left + refWidth + desWidth + 6, top + 12);

  const lines = draft.references
    .slice(0, draft.referenceCount)
    .filter((line) => line.reference.trim() || line.designation.trim())
    .slice(0, rowCount);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.6);
  lines.forEach((line, index) => {
    const textY = top + 12 + ((index + 1) * rowHeight);
    pdf.text(truncateText(pdf, line.reference || '-', refWidth - 12), left + 6, textY);
    pdf.text(truncateText(pdf, line.designation || '-', desWidth - 12), left + refWidth + 6, textY);
    pdf.text(String(line.quantity || 1), left + refWidth + desWidth + 6, textY);
  });

  if ((draft.referenceCount || 0) > rowCount) {
    pdf.setFontSize(8.8);
    pdf.setTextColor(MUTED_TEXT);
    pdf.text(`+ ${(draft.referenceCount || 0) - rowCount} autre(s) pièce(s)`, x + width - 18, y + height - 8, { align: 'right' });
  }

  return y + height;
}

function drawSignatureSection(pdf, draft, y, x, width) {
  const height = 96;
  drawFieldset(pdf, 'Signatures & cachet', x, y, width, height);

  const columnWidth = (width / 2) - 20;
  const leftColumnX = x + 14;
  const rightColumnX = x + (width / 2) + 6;
  const labelY = y + 24;
  const boxY = y + 30;
  const nameLineY = y + 74;
  const nameTextY = y + 88;

  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.8);
  pdf.text('Intervenant', leftColumnX, labelY);
  pdf.text('Client / labo', rightColumnX, labelY);

  pdf.setDrawColor(STROKE_COLOR);
  pdf.setLineWidth(0.8);
  const signBoxXLeft = leftColumnX + 88;
  const signBoxXRight = rightColumnX + 88;
  const signBoxWidth = columnWidth - 100;
  const signBoxHeight = 30;
  pdf.roundedRect(signBoxXLeft, boxY, signBoxWidth, signBoxHeight, 8, 8);
  pdf.roundedRect(signBoxXRight, boxY, signBoxWidth, signBoxHeight, 8, 8);
  pdf.line(leftColumnX, nameLineY, x + (width / 2) - 14, nameLineY);
  pdf.line(rightColumnX, nameLineY, x + width - 14, nameLineY);

  drawSignatureImage(pdf, draft.technicianSignatureDataUrl, signBoxXLeft, boxY, signBoxWidth, signBoxHeight);
  drawSignatureImage(pdf, draft.clientSignatureDataUrl, signBoxXRight, boxY, signBoxWidth, signBoxHeight);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.6);
  pdf.text(truncateText(pdf, draft.intervenant || '-', columnWidth - 8), leftColumnX, nameTextY);
  pdf.text(truncateText(pdf, draft.laboratoryName || '-', columnWidth - 8), rightColumnX, nameTextY);

  return y + height;
}

function drawObservation(pdf, draft, y, x, width) {
  const height = 72;
  drawFieldset(pdf, 'Observation', x, y, width, height);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.3);
  drawMultiline(pdf, draft.observation || 'Rien à Signaler', x + 14, y + 32, width - 28, 12, 3);
  return y + height;
}

function drawFieldset(pdf, title, x, y, width, height) {
  roundedRect(pdf, x, y, width, height, STROKE_COLOR, '#ffffff');
  const titleWidth = pdf.getTextWidth(title) + 14;
  const titleX = x + width - titleWidth - 18;
  pdf.setFillColor('#ffffff');
  pdf.rect(titleX - 2, y - 7, titleWidth + 4, 14, 'F');
  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12.5);
  pdf.text(title, titleX, y + 4);
}

function drawLabelValue(pdf, label, value, x, y, maxWidth) {
  pdf.setTextColor(TITLE_COLOR);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${label} :`, x, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(truncateText(pdf, value || '-', maxWidth - (pdf.getTextWidth(`${label} :`) + 8)), x + pdf.getTextWidth(`${label} :`) + 8, y);
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

function drawPageFrame(pdf, pageWidth, pageHeight) {
  pdf.setLineWidth(1);
  pdf.setDrawColor(STROKE_COLOR);
  pdf.roundedRect(12, 12, pageWidth - 24, pageHeight - 24, 12, 12);
}

function roundedRect(pdf, x, y, width, height, strokeColor, fillColor) {
  pdf.setDrawColor(strokeColor);
  pdf.setFillColor(fillColor);
  pdf.setLineWidth(1);
  pdf.roundedRect(x, y, width, height, 10, 10, 'FD');
}

function drawMultiline(pdf, text, x, y, width, lineHeight, maxLines = 4) {
  const lines = pdf.splitTextToSize(String(text || ''), width).slice(0, maxLines);
  lines.forEach((line, index) => {
    pdf.text(line, x, y + (index * lineHeight));
  });
}

function drawSignatureImage(pdf, dataUrl, x, y, width, height) {
  if (!dataUrl) {
    return;
  }

  try {
    const format = dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
    const drawWidth = width * 0.86;
    const drawHeight = height * 0.9;
    const drawX = x + ((width - drawWidth) / 2);
    const drawY = y + height - drawHeight - 2;
    pdf.addImage(dataUrl, format, drawX, drawY, drawWidth, drawHeight, undefined, 'FAST');
  } catch {
    // Ignore unsupported image payloads and keep the PDF alive.
  }
}

import { jsPDF } from 'jspdf';
import {
  contactBlock
} from './utils.js';

export async function generateInterventionPdf({ draft, settings, logoDataUrl }) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 30;
  const contentWidth = pageWidth - (margin * 2);

  drawPageFrame(pdf, margin, pageWidth, pageHeight);
  await drawHeader(pdf, draft, settings, logoDataUrl, margin, contentWidth);

  let cursorY = 142;
  cursorY = drawCard(pdf, 'Informations générales', [
    [`Date : ${draft.interventionDate || '-'}`, `Intervenant : ${draft.intervenant || '-'}`],
    [`Client / labo : ${draft.laboratoryName || '-'}`, `Temps intervention : ${draft.interventionTime || '-'}`],
    [`Localité : ${draft.locality || '-'}`, `Temps déplacement : ${draft.travelTime || '-'}`],
    [`NS : ${draft.serialNumber || '-'}`, '']
  ], cursorY, contentWidth, margin, 130);

  cursorY = drawTextCard(pdf, 'Description du problème', draft.description || 'Aucune description renseignée.', cursorY + 12, contentWidth, margin, 88);

  const workLines = draft.workLines
    .map((line, index) => line.trim() ? `${index + 1}. ${line.trim()}` : null)
    .filter(Boolean)
    .join('\n') || 'Aucune opération renseignée.';
  cursorY = drawTextCard(pdf, 'Travail effectué', workLines, cursorY + 12, contentWidth, margin, 154);

  const references = draft.references
    .slice(0, draft.referenceCount)
    .map((line, index) => {
      const ref = line.reference.trim();
      const des = line.designation.trim();
      if (!ref && !des) {
        return null;
      }
      return `${index + 1}. ${ref || '-'} • ${des || '-'} • Qté ${line.quantity || 1}`;
    })
    .filter(Boolean)
    .join('\n') || 'Aucune pièce renseignée.';
  cursorY = drawTextCard(pdf, 'Pièces / articles', references, cursorY + 12, contentWidth, margin, 164);

  cursorY = drawSignatureCard(pdf, draft, cursorY + 12, contentWidth, margin);
  drawTextCard(pdf, 'Observation', draft.observation || 'Rien à Signaler', cursorY + 12, contentWidth, margin, 74);

  const blob = pdf.output('blob');
  const fileName = `Fiche_Intervention_${draft.ficheNumber || 'sans_numero'}.pdf`;
  return { blob, fileName, mimeType: 'application/pdf' };
}

async function drawHeader(pdf, draft, settings, logoDataUrl, margin, contentWidth) {
  const x = margin;
  const y = margin;
  const h = 100;
  roundedRect(pdf, x, y, contentWidth, h, '#dbe8f2', '#f6fbff');

  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, 'PNG', x + 12, y + 12, 88, 56, undefined, 'FAST');
    } catch {
      // Ignore unsupported logo payloads and keep the PDF generation alive.
    }
  }

  pdf.setTextColor('#1a2230');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('Fiche d\'intervention', x + 118, y + 28);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor('#586272');
  pdf.text('Rapport d’intervention technique', x + 118, y + 46);

  pdf.setTextColor('#1a2230');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(settings.companyName || 'BIOPLUS', x + 118, y + 66);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  drawMultiline(pdf, contactBlock(settings), x + 118, y + 80, 250, 12);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(`N° de fiche : ${draft.ficheNumber || '-'}`, x + contentWidth - 18, y + 26, { align: 'right' });
}

function drawCard(pdf, title, rows, startY, width, x, height) {
  roundedRect(pdf, x, startY, width, height, '#dbe8f2', '#ffffff');
  pdf.setTextColor('#0f2330');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(title, x + 12, startY + 18);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  rows.forEach((row, index) => {
    const lineY = startY + 38 + (index * 18);
    if (row[0]) {
      pdf.text(row[0], x + 12, lineY);
    }
    if (row[1]) {
      pdf.text(row[1], x + 290, lineY);
    }
  });
  return startY + height;
}

function drawTextCard(pdf, title, text, startY, width, x, height) {
  roundedRect(pdf, x, startY, width, height, '#dbe8f2', '#ffffff');
  pdf.setTextColor('#0f2330');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(title, x + 12, startY + 18);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  drawMultiline(pdf, text, x + 12, startY + 36, width - 24, 13);
  return startY + height;
}

function drawSignatureCard(pdf, draft, startY, width, x) {
  const height = 88;
  roundedRect(pdf, x, startY, width, height, '#dbe8f2', '#ffffff');
  pdf.setTextColor('#0f2330');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Signatures & cachet', x + 12, startY + 18);

  pdf.setFontSize(11);
  pdf.text('Intervenant', x + 18, startY + 42);
  pdf.text('Client / labo', x + (width / 2) + 18, startY + 42);

  pdf.setLineWidth(0.8);
  pdf.setDrawColor('#9fc0d7');
  pdf.line(x + 18, startY + height - 22, x + (width / 2) - 18, startY + height - 22);
  pdf.line(x + (width / 2) + 18, startY + height - 22, x + width - 18, startY + height - 22);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(draft.intervenant || '-', x + 18, startY + height - 8);
  pdf.text(draft.laboratoryName || '-', x + (width / 2) + 18, startY + height - 8);

  return startY + height;
}

function drawPageFrame(pdf, margin, pageWidth, pageHeight) {
  pdf.setLineWidth(1.2);
  pdf.setDrawColor('#9fc0d7');
  pdf.roundedRect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin, 12, 12);
}

function roundedRect(pdf, x, y, w, h, strokeColor, fillColor) {
  pdf.setDrawColor(strokeColor);
  pdf.setFillColor(fillColor);
  pdf.setLineWidth(1);
  pdf.roundedRect(x, y, w, h, 10, 10, 'FD');
}

function drawMultiline(pdf, text, x, y, width, lineHeight) {
  const lines = pdf.splitTextToSize(String(text || ''), width);
  lines.forEach((line, index) => {
    pdf.text(line, x, y + (index * lineHeight));
  });
}

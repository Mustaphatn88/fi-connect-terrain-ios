import Foundation
import UIKit

enum InterventionPDFGenerator {
    static func generate(
        draft: InterventionDraft,
        settings: CompanySettings,
        logoImage: UIImage?
    ) throws -> GeneratedDocumentRecord {
        let fileName = "Fiche_Intervention_\(draft.ficheNumber.isEmpty ? "sans_numero" : draft.ficheNumber).pdf"
        let outputURL = AppPaths.pdfDirectory.appendingPathComponent(fileName)
        if AppPaths.fileManager.fileExists(atPath: outputURL.path) {
            try? AppPaths.fileManager.removeItem(at: outputURL)
        }

        let pageRect = CGRect(x: 0, y: 0, width: 595, height: 842)
        let renderer = UIGraphicsPDFRenderer(bounds: pageRect)
        try renderer.writePDF(to: outputURL) { context in
            context.beginPage()
            let cg = context.cgContext

            let margin: CGFloat = 28
            let contentWidth = pageRect.width - (margin * 2)
            let accent = UIColor(red: 0.36, green: 0.56, blue: 0.84, alpha: 1.0)
            let border = UIColor(red: 0.48, green: 0.65, blue: 0.87, alpha: 1.0)
            let ink = UIColor(red: 0.10, green: 0.13, blue: 0.18, alpha: 1.0)
            let muted = UIColor(red: 0.35, green: 0.40, blue: 0.46, alpha: 1.0)

            cg.setFillColor(UIColor.white.cgColor)
            cg.fill(pageRect)

            let outerRect = CGRect(x: margin / 2, y: margin / 2, width: pageRect.width - margin, height: pageRect.height - margin)
            drawRoundedBorder(rect: outerRect, in: cg, borderColor: border)

            var y = margin
            let headerRect = CGRect(x: margin, y: y, width: contentWidth, height: 110)
            drawSectionFrame(rect: headerRect, in: cg, borderColor: border, fillColor: UIColor(red: 0.96, green: 0.98, blue: 1.0, alpha: 1))
            if let logoImage {
                logoImage.draw(in: CGRect(x: headerRect.minX + 12, y: headerRect.minY + 12, width: 96, height: 60))
            }
            drawText("Fiche d'intervention", font: .boldSystemFont(ofSize: 24), color: ink, rect: CGRect(x: headerRect.minX + 120, y: headerRect.minY + 12, width: contentWidth - 132, height: 28))
            drawText("Rapport d'intervention technique", font: .systemFont(ofSize: 12), color: muted, rect: CGRect(x: headerRect.minX + 120, y: headerRect.minY + 40, width: contentWidth - 132, height: 18))
            drawText(settings.companyName, font: .boldSystemFont(ofSize: 13), color: ink, rect: CGRect(x: headerRect.minX + 120, y: headerRect.minY + 62, width: contentWidth - 132, height: 18))
            drawText(settings.contactBlock, font: .systemFont(ofSize: 11), color: ink, rect: CGRect(x: headerRect.minX + 120, y: headerRect.minY + 78, width: contentWidth - 132, height: 32))
            drawText("N° de fiche : \(draft.ficheNumber.isEmpty ? "-" : draft.ficheNumber)", font: .boldSystemFont(ofSize: 12), color: ink, rect: CGRect(x: headerRect.maxX - 180, y: headerRect.minY + 12, width: 160, height: 18), alignment: .right)
            y = headerRect.maxY + 14

            let generalRect = CGRect(x: margin, y: y, width: contentWidth, height: 130)
            drawTitledCard(title: "Informations générales", rect: generalRect, cg: cg, border: border)
            drawText("Date : \(draft.interventionDate.isEmpty ? "-" : draft.interventionDate)", font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: generalRect.minX + 12, y: generalRect.minY + 28, width: 160, height: 18))
            drawText("Client / labo : \(draft.laboratoryName.isEmpty ? "-" : draft.laboratoryName)", font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: generalRect.minX + 12, y: generalRect.minY + 46, width: 260, height: 18))
            drawText("Localité : \(draft.locality.isEmpty ? "-" : draft.locality)", font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: generalRect.minX + 12, y: generalRect.minY + 64, width: 260, height: 18))
            drawText("NS : \(draft.serialNumber.isEmpty ? "-" : draft.serialNumber)", font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: generalRect.minX + 12, y: generalRect.minY + 82, width: 260, height: 18))
            drawText("Intervenant : \(draft.intervenant.isEmpty ? "-" : draft.intervenant)", font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: generalRect.minX + 290, y: generalRect.minY + 28, width: 220, height: 18))
            drawText("Temps intervention : \(draft.interventionTime.isEmpty ? "-" : draft.interventionTime)", font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: generalRect.minX + 290, y: generalRect.minY + 46, width: 220, height: 18))
            drawText("Temps déplacement : \(draft.travelTime.isEmpty ? "-" : draft.travelTime)", font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: generalRect.minX + 290, y: generalRect.minY + 64, width: 220, height: 18))
            y = generalRect.maxY + 12

            let problemRect = CGRect(x: margin, y: y, width: contentWidth, height: 86)
            drawTitledCard(title: "Description du problème", rect: problemRect, cg: cg, border: border)
            drawText(draft.description.isEmpty ? "Aucune description renseignée." : draft.description, font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: problemRect.minX + 12, y: problemRect.minY + 28, width: contentWidth - 24, height: 48))
            y = problemRect.maxY + 12

            let workRect = CGRect(x: margin, y: y, width: contentWidth, height: 156)
            drawTitledCard(title: "Travail effectué", rect: workRect, cg: cg, border: border)
            let workLines = draft.workLines.enumerated().compactMap { index, value in
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : "\(index + 1). \(trimmed)"
            }
            drawText(workLines.isEmpty ? "Aucune opération renseignée." : workLines.joined(separator: "\n"), font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: workRect.minX + 12, y: workRect.minY + 28, width: contentWidth - 24, height: 118))
            y = workRect.maxY + 12

            let referencesRect = CGRect(x: margin, y: y, width: contentWidth, height: 170)
            drawTitledCard(title: "Pièces / articles", rect: referencesRect, cg: cg, border: border)
            let references = draft.references.prefix(draft.referenceCount).enumerated().compactMap { index, line in
                let reference = line.reference.trimmingCharacters(in: .whitespacesAndNewlines)
                let designation = line.designation.trimmingCharacters(in: .whitespacesAndNewlines)
                if reference.isEmpty && designation.isEmpty { return nil }
                return "\(index + 1). \(reference.isEmpty ? "-" : reference) • \(designation.isEmpty ? "-" : designation) • Qté \(max(1, line.quantity))"
            }
            drawText(references.isEmpty ? "Aucune pièce renseignée." : references.joined(separator: "\n"), font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: referencesRect.minX + 12, y: referencesRect.minY + 28, width: contentWidth - 24, height: 132))
            y = referencesRect.maxY + 12

            let signatureRect = CGRect(x: margin, y: y, width: contentWidth, height: 88)
            drawTitledCard(title: "Signatures & cachet", rect: signatureRect, cg: cg, border: border)
            cg.setStrokeColor(border.cgColor)
            cg.strokeLineSegments(between: [
                CGPoint(x: signatureRect.minX + 20, y: signatureRect.maxY - 22),
                CGPoint(x: signatureRect.midX - 20, y: signatureRect.maxY - 22),
                CGPoint(x: signatureRect.midX + 20, y: signatureRect.maxY - 22),
                CGPoint(x: signatureRect.maxX - 20, y: signatureRect.maxY - 22)
            ])
            drawText("Intervenant", font: .boldSystemFont(ofSize: 12), color: ink, rect: CGRect(x: signatureRect.minX + 18, y: signatureRect.minY + 28, width: 180, height: 18))
            drawText(draft.intervenant.isEmpty ? "-" : draft.intervenant, font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: signatureRect.minX + 18, y: signatureRect.maxY - 18, width: 180, height: 14))
            drawText("Client / labo", font: .boldSystemFont(ofSize: 12), color: ink, rect: CGRect(x: signatureRect.midX + 18, y: signatureRect.minY + 28, width: 180, height: 18))
            drawText(draft.laboratoryName.isEmpty ? "-" : draft.laboratoryName, font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: signatureRect.midX + 18, y: signatureRect.maxY - 18, width: 180, height: 14))
            y = signatureRect.maxY + 12

            let observationRect = CGRect(x: margin, y: y, width: contentWidth, height: 72)
            drawTitledCard(title: "Observation", rect: observationRect, cg: cg, border: border)
            drawText(draft.observation.isEmpty ? "Rien à Signaler" : draft.observation, font: .systemFont(ofSize: 12), color: ink, rect: CGRect(x: observationRect.minX + 12, y: observationRect.minY + 28, width: contentWidth - 24, height: 32))

            drawText("Page 1", font: .systemFont(ofSize: 10), color: muted, rect: CGRect(x: margin, y: pageRect.height - 28, width: contentWidth, height: 12), alignment: .right)
            _ = accent
        }

        return GeneratedDocumentRecord(
            filePath: outputURL.path,
            fileName: fileName,
            createdAt: Date()
        )
    }

    private static func drawRoundedBorder(rect: CGRect, in cg: CGContext, borderColor: UIColor) {
        let path = UIBezierPath(roundedRect: rect, cornerRadius: 12)
        borderColor.setStroke()
        path.lineWidth = 1.5
        path.stroke()
    }

    private static func drawSectionFrame(rect: CGRect, in cg: CGContext, borderColor: UIColor, fillColor: UIColor) {
        let path = UIBezierPath(roundedRect: rect, cornerRadius: 10)
        fillColor.setFill()
        path.fill()
        borderColor.setStroke()
        path.lineWidth = 1.2
        path.stroke()
    }

    private static func drawTitledCard(title: String, rect: CGRect, cg: CGContext, border: UIColor) {
        drawSectionFrame(rect: rect, in: cg, borderColor: border, fillColor: .white)
        drawText(title, font: .boldSystemFont(ofSize: 13), color: .black, rect: CGRect(x: rect.minX + 12, y: rect.minY + 8, width: rect.width - 24, height: 18))
    }

    private static func drawText(
        _ text: String,
        font: UIFont,
        color: UIColor,
        rect: CGRect,
        alignment: NSTextAlignment = .left
    ) {
        let style = NSMutableParagraphStyle()
        style.alignment = alignment
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style
        ]
        NSString(string: text).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes, context: nil)
    }
}

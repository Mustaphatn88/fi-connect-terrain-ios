import Foundation

struct CompanySettings: Codable, Equatable {
    var companyName: String = "BIOPLUS"
    var companyAddress: String = "16 Rue Salaheddine Ayoubi, Tunis"
    var companyPhone: String = "+216 71 890 840"
    var companyEmail: String = "direction@bioplus.tn"
    var logoPath: String = ""

    var contactBlock: String {
        [
            companyAddress.trimmingCharacters(in: .whitespacesAndNewlines),
            companyPhone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : "TEL: \(companyPhone.trimmingCharacters(in: .whitespacesAndNewlines))",
            companyEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : "Email : \(companyEmail.trimmingCharacters(in: .whitespacesAndNewlines))"
        ]
        .compactMap { $0?.isEmpty == false ? $0 : nil }
        .joined(separator: "\n")
    }
}

struct InterventionReferenceLine: Codable, Equatable, Identifiable {
    var id: UUID = UUID()
    var reference: String = ""
    var designation: String = ""
    var quantity: Int = 1
}

struct InterventionDraft: Codable, Equatable {
    static let maxWorkLines = 7
    static let maxReferences = 7

    var ficheNumber: String = ""
    var interventionDate: String = ""
    var laboratoryName: String = ""
    var locality: String = ""
    var serialNumber: String = ""
    var intervenant: String = ""
    var interventionTime: String = ""
    var travelTime: String = ""
    var description: String = ""
    var workLines: [String] = Array(repeating: "", count: maxWorkLines)
    var references: [InterventionReferenceLine] = Array(repeating: InterventionReferenceLine(), count: maxReferences)
    var referenceCount: Int = 0
    var observation: String = ""

    mutating func normalize() {
        if workLines.count < Self.maxWorkLines {
            workLines.append(contentsOf: Array(repeating: "", count: Self.maxWorkLines - workLines.count))
        } else if workLines.count > Self.maxWorkLines {
            workLines = Array(workLines.prefix(Self.maxWorkLines))
        }

        if references.count < Self.maxReferences {
            references.append(contentsOf: Array(repeating: InterventionReferenceLine(), count: Self.maxReferences - references.count))
        } else if references.count > Self.maxReferences {
            references = Array(references.prefix(Self.maxReferences))
        }

        referenceCount = max(0, min(referenceCount, Self.maxReferences))
    }

    static func newDefault() -> InterventionDraft {
        InterventionDraft(
            ficheNumber: Self.autoFicheNumber(),
            interventionDate: Self.todayString(),
            observation: "Rien à Signaler"
        )
    }

    static func autoFicheNumber(from date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "ddMMyyHH"
        return formatter.string(from: date)
    }

    static func todayString(from date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "dd/MM/yyyy"
        return formatter.string(from: date)
    }
}

struct GeneratedDocumentRecord: Codable, Equatable, Identifiable {
    var id: String { filePath }
    let filePath: String
    let fileName: String
    let createdAt: Date

    var fileURL: URL {
        URL(fileURLWithPath: filePath)
    }
}

enum AttachmentType: String, Codable {
    case pdf
    case photo
    case file
}

struct PendingUploadItem: Codable, Equatable, Identifiable {
    var id: String { messageId }
    let messageId: String
    let fileName: String
    let localFilePath: String
    let mimeType: String
    let attachmentType: AttachmentType
    let interventionDate: String
    let technician: String
    let client: String
    let ficheNumber: String
    let fallbackText: String
    let createdAt: Date
    var attemptCount: Int = 0
    var lastError: String? = nil

    var fileURL: URL {
        URL(fileURLWithPath: localFilePath)
    }
}

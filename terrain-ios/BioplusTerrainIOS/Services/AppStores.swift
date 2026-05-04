import Foundation
import UIKit

enum AppPaths {
    static let fileManager = FileManager.default

    static var applicationSupportDirectory: URL {
        let url = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        if !fileManager.fileExists(atPath: url.path) {
            try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        }
        return url
    }

    static var documentsDirectory: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
    }

    static var pdfDirectory: URL {
        let url = documentsDirectory.appendingPathComponent("Intervention PDFs", isDirectory: true)
        if !fileManager.fileExists(atPath: url.path) {
            try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        }
        return url
    }

    static var captureDirectory: URL {
        let url = documentsDirectory.appendingPathComponent("Captured Interventions", isDirectory: true)
        if !fileManager.fileExists(atPath: url.path) {
            try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        }
        return url
    }

    static var queueDirectory: URL {
        let url = applicationSupportDirectory.appendingPathComponent("QueuedUploads", isDirectory: true)
        if !fileManager.fileExists(atPath: url.path) {
            try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        }
        return url
    }
}

final class CompanySettingsStore {
    private let settingsURL = AppPaths.applicationSupportDirectory.appendingPathComponent("company-settings.json")
    private let logoURL = AppPaths.applicationSupportDirectory.appendingPathComponent("company-logo.jpg")

    func load() -> CompanySettings {
        guard
            let data = try? Data(contentsOf: settingsURL),
            let settings = try? JSONDecoder().decode(CompanySettings.self, from: data)
        else {
            return CompanySettings()
        }
        return settings
    }

    func save(_ settings: CompanySettings) {
        if let data = try? JSONEncoder().encode(settings) {
            try? data.write(to: settingsURL, options: [.atomic])
        }
    }

    @discardableResult
    func saveLogoData(_ data: Data?, into settings: CompanySettings) -> CompanySettings {
        var updated = settings
        if let data, !data.isEmpty {
            try? data.write(to: logoURL, options: [.atomic])
            updated.logoPath = logoURL.path
        } else {
            try? AppPaths.fileManager.removeItem(at: logoURL)
            updated.logoPath = ""
        }
        save(updated)
        return updated
    }

    func logoImage(for settings: CompanySettings) -> UIImage? {
        guard !settings.logoPath.isEmpty else { return nil }
        return UIImage(contentsOfFile: settings.logoPath)
    }
}

final class InterventionDraftStore {
    private let draftURL = AppPaths.applicationSupportDirectory.appendingPathComponent("intervention-draft.json")

    func load() -> InterventionDraft? {
        guard
            let data = try? Data(contentsOf: draftURL),
            var draft = try? JSONDecoder().decode(InterventionDraft.self, from: data)
        else {
            return nil
        }
        if draft.intervenant == "LAM" {
            draft.intervenant = ""
            save(draft)
        }
        draft.normalize()
        return draft
    }

    func save(_ draft: InterventionDraft) {
        var normalized = draft
        normalized.normalize()
        if let data = try? JSONEncoder().encode(normalized) {
            try? data.write(to: draftURL, options: [.atomic])
        }
    }

    func clear() {
        try? AppPaths.fileManager.removeItem(at: draftURL)
    }
}

final class LastGeneratedDocumentStore {
    private let recordURL = AppPaths.applicationSupportDirectory.appendingPathComponent("last-generated-document.json")

    func load() -> GeneratedDocumentRecord? {
        guard
            let data = try? Data(contentsOf: recordURL),
            let record = try? JSONDecoder().decode(GeneratedDocumentRecord.self, from: data)
        else {
            return nil
        }
        return AppPaths.fileManager.fileExists(atPath: record.filePath) ? record : nil
    }

    func save(_ record: GeneratedDocumentRecord) {
        if let data = try? JSONEncoder().encode(record) {
            try? data.write(to: recordURL, options: [.atomic])
        }
    }
}

actor PendingUploadStore {
    private let storeURL = AppPaths.applicationSupportDirectory.appendingPathComponent("pending-uploads.json")

    func load() -> [PendingUploadItem] {
        guard
            let data = try? Data(contentsOf: storeURL),
            let items = try? JSONDecoder().decode([PendingUploadItem].self, from: data)
        else {
            return []
        }
        return items.sorted { $0.createdAt < $1.createdAt }
    }

    func enqueue(_ item: PendingUploadItem) async {
        var items = load()
        items.removeAll { $0.messageId == item.messageId }
        items.append(item)
        persist(items.sorted { $0.createdAt < $1.createdAt })
    }

    func remove(messageId: String) async {
        var items = load()
        items.removeAll { $0.messageId == messageId }
        persist(items)
    }

    func markAttempt(messageId: String, error: String?) async {
        var items = load()
        guard let index = items.firstIndex(where: { $0.messageId == messageId }) else { return }
        items[index].attemptCount += 1
        items[index].lastError = error
        persist(items)
    }

    func count() -> Int {
        load().count
    }

    private func persist(_ items: [PendingUploadItem]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: storeURL, options: [.atomic])
    }
}

import Foundation
import Network
import UIKit

enum RelayConfig {
    static let baseURL = URL(string: "https://ntfy.sh")!
    static let topic = "fiche-3478abcd-9f41-4c2e-a6b7-17db6a55ad19-intervention-pdf"

    static func publishURL(messageId: String) -> URL {
        let escaped = messageId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? messageId
        return baseURL.appendingPathComponent(topic).appendingPathComponent(escaped)
    }
}

@MainActor
final class RelayUploadService: ObservableObject {
    static let shared = RelayUploadService()

    @Published private(set) var statusText: String = "Service de synchronisation en démarrage"
    @Published private(set) var pendingCount: Int = 0

    private let uploadStore = PendingUploadStore()
    private let userDefaults = UserDefaults.standard
    private var pathMonitor: NWPathMonitor?
    private let monitorQueue = DispatchQueue(label: "relay-path-monitor")
    private var retryTimer: Timer?
    private var started = false
    private var isFlushing = false
    private var nextAllowedFlushAt = Date.distantPast

    private init() {}

    func start() {
        guard !started else {
            Task {
                await refreshPendingCount()
                await flushPendingUploads()
            }
            return
        }
        started = true
        startPathMonitor()
        retryTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { await self?.flushPendingUploads() }
        }
        Task {
            await refreshPendingCount()
            await flushPendingUploads()
        }
    }

    func sceneDidBecomeActive() {
        Task {
            await flushPendingUploads()
        }
    }

    func enqueueGeneratedPDF(draft: InterventionDraft, document: GeneratedDocumentRecord) async throws {
        try await enqueueFile(
            sourceURL: document.fileURL,
            fileName: document.fileName,
            mimeType: "application/pdf",
            attachmentType: .pdf,
            draft: draft
        )
    }

    func enqueueCapturedPhoto(draft: InterventionDraft, photoURL: URL) async throws {
        try await enqueueFile(
            sourceURL: photoURL,
            fileName: photoURL.lastPathComponent,
            mimeType: "image/jpeg",
            attachmentType: .photo,
            draft: draft
        )
    }

    func publishTestMessage() {
        Task {
            do {
                try await sendTestMessage()
                statusText = "Message de test transmis."
            } catch {
                statusText = "Échec du message de test : \(shortMessage(error))"
            }
        }
    }

    private func enqueueFile(
        sourceURL: URL,
        fileName: String,
        mimeType: String,
        attachmentType: AttachmentType,
        draft: InterventionDraft
    ) async throws {
        let messageId = UUID().uuidString
        let sanitizedName = sanitizeFileName(fileName)
        let targetURL = AppPaths.queueDirectory.appendingPathComponent("\(messageId)_\(sanitizedName)")
        if AppPaths.fileManager.fileExists(atPath: targetURL.path) {
            try? AppPaths.fileManager.removeItem(at: targetURL)
        }
        try AppPaths.fileManager.copyItem(at: sourceURL, to: targetURL)

        let item = PendingUploadItem(
            messageId: messageId,
            fileName: sanitizedName,
            localFilePath: targetURL.path,
            mimeType: mimeType,
            attachmentType: attachmentType,
            interventionDate: draft.interventionDate,
            technician: draft.intervenant,
            client: draft.laboratoryName,
            ficheNumber: draft.ficheNumber,
            fallbackText: buildFallbackText(from: draft),
            createdAt: Date()
        )
        await uploadStore.enqueue(item)
        await refreshPendingCount()
        statusText = "Fichier mis en file pour synchronisation."
        await flushPendingUploads()
    }

    private func refreshPendingCount() async {
        pendingCount = await uploadStore.count()
    }

    func flushPendingUploads() async {
        guard !isFlushing else { return }
        guard Date() >= nextAllowedFlushAt else {
            statusText = "Relais occupé, nouvelle tentative différée."
            return
        }
        isFlushing = true
        let backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "RelayUploadFlush")
        defer {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            isFlushing = false
        }

        let items = await uploadStore.load()
        pendingCount = items.count
        guard !items.isEmpty else {
            statusText = "Synchronisation active"
            return
        }

        for item in items {
            do {
                try await upload(item)
                await uploadStore.remove(messageId: item.messageId)
                try? AppPaths.fileManager.removeItem(atPath: item.localFilePath)
                pendingCount = max(0, pendingCount - 1)
                statusText = "Fiche transmise avec succès."
            } catch {
                let reason = shortMessage(error)
                let fallbackSucceeded = await uploadFallbackIfNeeded(item: item, failureReason: reason)
                if fallbackSucceeded {
                    await uploadStore.remove(messageId: item.messageId)
                    try? AppPaths.fileManager.removeItem(atPath: item.localFilePath)
                    pendingCount = max(0, pendingCount - 1)
                    statusText = "Texte de secours transmis."
                    continue
                }

                await uploadStore.markAttempt(messageId: item.messageId, error: reason)
                if let httpError = error as? RelayHTTPError, httpError.statusCode == 429 {
                    nextAllowedFlushAt = Date().addingTimeInterval(max(httpError.retryAfterSeconds ?? 120, 120))
                    statusText = "Relais public limité, nouvelle tentative dans 2 minutes."
                } else {
                    statusText = "Envoi en attente : \(reason)"
                }
                pendingCount = await uploadStore.count()
                return
            }
        }
    }

    private func upload(_ item: PendingUploadItem) async throws {
        var request = URLRequest(url: RelayConfig.publishURL(messageId: item.messageId))
        request.httpMethod = "PUT"
        request.timeoutInterval = 45
        request.setValue(item.mimeType, forHTTPHeaderField: "Content-Type")
        request.setValue(buildRemoteAttachmentName(from: item), forHTTPHeaderField: "Filename")
        request.setValue(buildRemoteTitle(from: item), forHTTPHeaderField: "Title")
        request.setValue(buildRemoteMessage(from: item), forHTTPHeaderField: "Message")
        request.setValue("default", forHTTPHeaderField: "Priority")
        request.setValue("page_with_curl", forHTTPHeaderField: "Tags")

        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: item.fileURL)
        try validate(response: response, data: data)
    }

    private func uploadFallbackIfNeeded(item: PendingUploadItem, failureReason: String) async -> Bool {
        do {
            let body = buildFallbackBody(item: item, failureReason: failureReason)
            var request = URLRequest(url: RelayConfig.publishURL(messageId: "\(item.messageId)-txt"))
            request.httpMethod = "PUT"
            request.timeoutInterval = 45
            request.setValue("text/plain; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.setValue(buildRemoteAttachmentName(from: item, extensionOverride: "txt"), forHTTPHeaderField: "Filename")
            request.setValue("Fiche texte de secours", forHTTPHeaderField: "Title")
            request.setValue(buildRemoteMessage(from: item), forHTTPHeaderField: "Message")
            request.setValue("default", forHTTPHeaderField: "Priority")
            request.setValue("memo,page_facing_up", forHTTPHeaderField: "Tags")

            let (data, response) = try await URLSession.shared.upload(for: request, from: body.data(using: .utf8) ?? Data())
            try validate(response: response, data: data)
            return true
        } catch {
            return false
        }
    }

    private func sendTestMessage() async throws {
        let messageId = "test-\(UUID().uuidString)"
        var request = URLRequest(url: RelayConfig.publishURL(messageId: messageId))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("text/plain; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.setValue("TEST TERRAIN", forHTTPHeaderField: "Title")
        request.setValue("default", forHTTPHeaderField: "Priority")
        let body = "test message from terrain \(terrainClientId)"
        let (data, response) = try await URLSession.shared.upload(for: request, from: body.data(using: .utf8) ?? Data())
        try validate(response: response, data: data)
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw RelayHTTPError(statusCode: -1, body: "Réponse HTTP invalide", retryAfterSeconds: nil)
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw RelayHTTPError(
                statusCode: http.statusCode,
                body: body.prefix(240).description,
                retryAfterSeconds: Double(http.value(forHTTPHeaderField: "Retry-After") ?? "")
            )
        }
    }

    private func startPathMonitor() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            if path.status == .satisfied {
                Task { @MainActor in
                    await self.flushPendingUploads()
                }
            }
        }
        monitor.start(queue: monitorQueue)
        pathMonitor = monitor
    }

    private var terrainClientId: String {
        let key = "terrain_client_id_ios"
        if let existing = userDefaults.string(forKey: key), !existing.isEmpty {
            return existing
        }
        let created = "terrain-\(UUID().uuidString)"
        userDefaults.set(created, forKey: key)
        return created
    }

    private var deviceId: String {
        let key = "terrain_device_id_ios"
        if let existing = userDefaults.string(forKey: key), !existing.isEmpty {
            return existing
        }
        let created = "ios-\(UUID().uuidString)"
        userDefaults.set(created, forKey: key)
        return created
    }

    private func buildRemoteAttachmentName(from item: PendingUploadItem, extensionOverride: String? = nil) -> String {
        let ext = extensionOverride ?? item.fileName.split(separator: ".").last.map(String.init) ?? "bin"
        return [
            "relay",
            encodeFilenamePart(item.interventionDate),
            encodeFilenamePart(item.technician),
            encodeFilenamePart(item.client),
            encodeFilenamePart(item.ficheNumber),
            encodeFilenamePart(terrainClientId),
            encodeFilenamePart(deviceId)
        ].joined(separator: "__") + ".\(ext)"
    }

    private func buildRemoteTitle(from item: PendingUploadItem) -> String {
        let typeLabel: String
        switch item.attachmentType {
        case .photo:
            typeLabel = "Capture fiche imprimée"
        case .pdf:
            typeLabel = "Fiche intervention PDF"
        case .file:
            typeLabel = "Fiche intervention"
        }
        return [
            typeLabel,
            item.client.isEmpty ? "Client inconnu" : item.client,
            item.interventionDate.isEmpty ? "Date inconnue" : item.interventionDate
        ].joined(separator: " | ")
    }

    private func buildRemoteMessage(from item: PendingUploadItem) -> String {
        "type=\(item.attachmentType.rawValue); fiche=\(item.ficheNumber.isEmpty ? "-" : item.ficheNumber); client=\(item.client.isEmpty ? "-" : item.client); technicien=\(item.technician.isEmpty ? "-" : item.technician); date=\(item.interventionDate.isEmpty ? "-" : item.interventionDate)"
    }

    private func buildFallbackBody(item: PendingUploadItem, failureReason: String) -> String {
        [
            "FICHE D'INTERVENTION - TEXTE DE SECOURS",
            "Type de fichier d'origine: \(item.attachmentType.rawValue)",
            "Raison de secours transmission: \(failureReason)",
            "Client terrain: \(terrainClientId)",
            "Device ID: \(deviceId)",
            "Message ID: \(item.messageId)",
            "",
            item.fallbackText
        ].joined(separator: "\n")
    }

    private func buildFallbackText(from draft: InterventionDraft) -> String {
        let workLines = draft.workLines.enumerated().compactMap { index, line in
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : "\(index + 1). \(trimmed)"
        }
        let references = draft.references.prefix(draft.referenceCount).enumerated().compactMap { index, line in
            let reference = line.reference.trimmingCharacters(in: .whitespacesAndNewlines)
            let designation = line.designation.trimmingCharacters(in: .whitespacesAndNewlines)
            if reference.isEmpty && designation.isEmpty { return nil }
            return "\(index + 1). Ref=\(reference.isEmpty ? "-" : reference), Designation=\(designation.isEmpty ? "-" : designation), Qte=\(max(1, line.quantity))"
        }

        return """
        FICHE D'INTERVENTION
        Numero de fiche: \(draft.ficheNumber)
        Date d'intervention: \(draft.interventionDate)
        Laboratoire / client: \(draft.laboratoryName)
        Localite: \(draft.locality)
        Numero de serie: \(draft.serialNumber)
        Intervenant: \(draft.intervenant)
        Temps intervention: \(draft.interventionTime)
        Temps deplacement: \(draft.travelTime)

        Description du problematique:
        \(draft.description.isEmpty ? "-" : draft.description)

        Travail effectue:
        \(workLines.isEmpty ? "-" : workLines.joined(separator: "\n"))

        Pieces / articles:
        \(references.isEmpty ? "-" : references.joined(separator: "\n"))

        Observation:
        \(draft.observation.isEmpty ? "-" : draft.observation)
        """
    }

    private func encodeFilenamePart(_ value: String) -> String {
        let safe = value.isEmpty ? "-" : value
        let base64 = Data(safe.utf8).base64EncodedString()
        return base64
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func sanitizeFileName(_ name: String) -> String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
        let scalarView = name.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" }
        let normalized = String(scalarView)
        return normalized.isEmpty ? "fiche_intervention.bin" : normalized
    }

    private func shortMessage(_ error: Error) -> String {
        if let relayError = error as? RelayHTTPError {
            return "HTTP \(relayError.statusCode)"
        }
        return (error as NSError).localizedDescription
    }
}

struct RelayHTTPError: LocalizedError {
    let statusCode: Int
    let body: String
    let retryAfterSeconds: Double?

    var errorDescription: String? {
        if body.isEmpty {
            return "HTTP \(statusCode)"
        }
        return "HTTP \(statusCode): \(body)"
    }
}

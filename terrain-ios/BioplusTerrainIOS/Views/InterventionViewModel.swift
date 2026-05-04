import Combine
import SwiftUI
import UIKit

struct ShareTarget: Identifiable {
    let id = UUID()
    let url: URL
}

struct PreviewTarget: Identifiable {
    let id = UUID()
    let url: URL
}

@MainActor
final class InterventionViewModel: ObservableObject {
    @Published var draft: InterventionDraft
    @Published var companySettings: CompanySettings
    @Published var companyLogoImage: UIImage?
    @Published var syncStatusText: String = "Synchronisation active"
    @Published var pendingCount: Int = 0
    @Published var lastGeneratedDocument: GeneratedDocumentRecord?
    @Published var alertMessage: String?
    @Published var shareTarget: ShareTarget?
    @Published var previewTarget: PreviewTarget?
    @Published var isShowingCompanySettings = false
    @Published var isShowingCamera = false

    private let draftStore = InterventionDraftStore()
    private let settingsStore = CompanySettingsStore()
    private let lastDocumentStore = LastGeneratedDocumentStore()
    private let relayService = RelayUploadService.shared
    private var cancellables = Set<AnyCancellable>()

    init() {
        let loadedSettings = settingsStore.load()
        self.companySettings = loadedSettings
        self.companyLogoImage = settingsStore.logoImage(for: loadedSettings)
        self.draft = draftStore.load() ?? InterventionDraft.newDefault()
        self.lastGeneratedDocument = lastDocumentStore.load()

        relayService.$statusText
            .receive(on: RunLoop.main)
            .sink { [weak self] value in
                self?.syncStatusText = value
            }
            .store(in: &cancellables)

        relayService.$pendingCount
            .receive(on: RunLoop.main)
            .sink { [weak self] value in
                self?.pendingCount = value
            }
            .store(in: &cancellables)
    }

    func start() {
        relayService.start()
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            relayService.sceneDidBecomeActive()
        case .background, .inactive:
            saveDraft(silent: true)
        @unknown default:
            break
        }
    }

    func saveDraft(silent: Bool = false) {
        draft.normalize()
        draftStore.save(draft)
        if !silent {
            alertMessage = "Brouillon enregistré."
        }
    }

    func resetDraft() {
        draft = InterventionDraft.newDefault()
        draftStore.save(draft)
    }

    func fillToday() {
        draft.interventionDate = InterventionDraft.todayString()
    }

    func generateAutoNumber() {
        draft.ficheNumber = InterventionDraft.autoFicheNumber()
    }

    func setCompanyLogo(_ data: Data?) {
        companySettings = settingsStore.saveLogoData(data, into: companySettings)
        companyLogoImage = settingsStore.logoImage(for: companySettings)
    }

    func saveCompanySettings() {
        companySettings.companyName = companySettings.companyName.trimmingCharacters(in: .whitespacesAndNewlines)
        companySettings.companyAddress = companySettings.companyAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        companySettings.companyPhone = companySettings.companyPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        companySettings.companyEmail = companySettings.companyEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        settingsStore.save(companySettings)
        companyLogoImage = settingsStore.logoImage(for: companySettings)
    }

    func requestCameraCapture() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            alertMessage = "La caméra n'est pas disponible sur cet appareil."
            return
        }
        isShowingCamera = true
    }

    func exportPDF(shareAfterExport: Bool) {
        draft.normalize()
        let issues = validateDraft()
        guard issues.isEmpty else {
            alertMessage = issues.joined(separator: "\n")
            return
        }

        do {
            let record = try InterventionPDFGenerator.generate(
                draft: draft,
                settings: companySettings,
                logoImage: companyLogoImage
            )
            lastGeneratedDocument = record
            lastDocumentStore.save(record)
            draftStore.save(draft)
            if shareAfterExport {
                previewTarget = nil
                shareTarget = ShareTarget(url: record.fileURL)
            } else {
                shareTarget = nil
                previewTarget = PreviewTarget(url: record.fileURL)
            }
            Task {
                do {
                    try await relayService.enqueueGeneratedPDF(draft: draft, document: record)
                } catch {
                    await MainActor.run {
                        self.alertMessage = "PDF généré, mais mise en file d’envoi impossible : \((error as NSError).localizedDescription)"
                    }
                }
            }
        } catch {
            alertMessage = "Impossible de générer le PDF : \((error as NSError).localizedDescription)"
        }
    }

    func handleCapturedImage(_ image: UIImage) {
        draft.normalize()
        let targetURL = AppPaths.captureDirectory
            .appendingPathComponent("Fiche_Imprimee_\(draft.ficheNumber.isEmpty ? "sans_numero" : draft.ficheNumber)_\(timestampString()).jpg")
        guard let jpegData = image.jpegData(compressionQuality: 0.82) else {
            alertMessage = "Impossible de préparer la capture."
            return
        }

        do {
            try jpegData.write(to: targetURL, options: [.atomic])
            Task {
                do {
                    try await relayService.enqueueCapturedPhoto(draft: draft, photoURL: targetURL)
                    await MainActor.run {
                        self.previewTarget = PreviewTarget(url: targetURL)
                        self.alertMessage = "Capture enregistrée et mise en file d’envoi."
                    }
                } catch {
                    await MainActor.run {
                        self.alertMessage = "Capture enregistrée, mais mise en file impossible : \((error as NSError).localizedDescription)"
                    }
                }
            }
        } catch {
            alertMessage = "Impossible d’enregistrer la capture : \((error as NSError).localizedDescription)"
        }
    }

    func sendTestMessage() {
        relayService.publishTestMessage()
        alertMessage = "Message de test en cours d’envoi."
    }

    func openLastGeneratedDocument() {
        guard let record = lastGeneratedDocument else {
            alertMessage = "Aucun document récent disponible."
            return
        }
        guard FileManager.default.fileExists(atPath: record.filePath) else {
            lastGeneratedDocument = nil
            alertMessage = "Le dernier document n'est plus disponible sur l'appareil."
            return
        }
        previewTarget = PreviewTarget(url: record.fileURL)
    }

    func bindingForWorkLine(at index: Int) -> Binding<String> {
        Binding(
            get: { self.draft.workLines[index] },
            set: { self.draft.workLines[index] = $0 }
        )
    }

    func bindingForReference(at index: Int) -> Binding<InterventionReferenceLine> {
        Binding(
            get: { self.draft.references[index] },
            set: { self.draft.references[index] = $0 }
        )
    }

    private func validateDraft() -> [String] {
        var issues: [String] = []
        if draft.laboratoryName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append("• Le champ laboratoire / client est requis.")
        }
        if draft.locality.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append("• Le champ localité est requis.")
        }
        if draft.intervenant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append("• Le champ intervenant est requis.")
        }
        let hasWork = draft.workLines.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !hasWork {
            issues.append("• Ajoutez une description ou au moins une ligne de travail.")
        }
        for index in 0..<draft.referenceCount {
            let line = draft.references[index]
            let ref = line.reference.trimmingCharacters(in: .whitespacesAndNewlines)
            let des = line.designation.trimmingCharacters(in: .whitespacesAndNewlines)
            if ref.isEmpty || des.isEmpty {
                issues.append("• La pièce \(index + 1) doit être complètement renseignée.")
            }
        }
        return issues
    }

    private func timestampString() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "yyyyMMdd_HHmmss"
        return formatter.string(from: Date())
    }
}

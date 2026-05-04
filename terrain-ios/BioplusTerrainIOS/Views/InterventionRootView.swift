import PhotosUI
import SwiftUI

struct InterventionRootView: View {
    @ObservedObject var viewModel: InterventionViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    heroCard
                    companyCard
                    generalInfoCard
                    descriptionCard
                    workCard
                    referencesCard
                    observationCard
                    actionCard
                }
                .padding(16)
            }
            .background(Color(red: 0.95, green: 0.97, blue: 0.96).ignoresSafeArea())
            .navigationTitle("Terrain iOS")
            .sheet(isPresented: $viewModel.isShowingCompanySettings) {
                CompanySettingsSheet(viewModel: viewModel)
            }
            .fullScreenCover(isPresented: $viewModel.isShowingCamera) {
                CameraCaptureView { image in
                    viewModel.isShowingCamera = false
                    viewModel.handleCapturedImage(image)
                } onCancel: {
                    viewModel.isShowingCamera = false
                }
                .ignoresSafeArea()
            }
            .sheet(item: $viewModel.shareTarget) { target in
                ShareSheet(items: [target.url])
            }
            .sheet(item: $viewModel.previewTarget) { target in
                FilePreviewController(url: target.url)
            }
            .alert("Information", isPresented: Binding(
                get: { viewModel.alertMessage != nil },
                set: { if !$0 { viewModel.alertMessage = nil } }
            )) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(viewModel.alertMessage ?? "")
            }
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                logoView
                    .frame(width: 54, height: 54)
                    .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 4) {
                    Text("Fiche d’intervention")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(.white)
                    Text("Version iOS terrain compatible avec les boîtes Android central et démo.")
                        .font(.subheadline)
                        .foregroundStyle(Color.white.opacity(0.88))
                }

                Spacer(minLength: 8)

                statusBadge(text: "Envoi \(viewModel.pendingCount)", tint: .white, background: .white.opacity(0.92), foreground: Color(red: 0.06, green: 0.36, blue: 0.35))
            }

            Text(viewModel.companySettings.contactBlock)
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.86))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.37, blue: 0.36),
                    Color(red: 0.10, green: 0.28, blue: 0.39)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous)
        )
    }

    private var companyCard: some View {
        card(title: "Société") {
            VStack(alignment: .leading, spacing: 10) {
                Text(viewModel.companySettings.companyName)
                    .font(.headline)
                Text(viewModel.companySettings.contactBlock)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Configurer la société") {
                    viewModel.isShowingCompanySettings = true
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var generalInfoCard: some View {
        card(title: "Informations générales") {
            VStack(spacing: 12) {
                HStack(spacing: 10) {
                    TextField("N° de fiche", text: $viewModel.draft.ficheNumber)
                        .textFieldStyle(.roundedBorder)
                    Button("Auto") { viewModel.generateAutoNumber() }
                        .buttonStyle(.borderedProminent)
                }

                HStack(spacing: 10) {
                    TextField("Date d’intervention", text: $viewModel.draft.interventionDate)
                        .textFieldStyle(.roundedBorder)
                    Button("Ajd.") { viewModel.fillToday() }
                        .buttonStyle(.bordered)
                }

                Group {
                    TextField("Laboratoire / client", text: $viewModel.draft.laboratoryName)
                    TextField("Localité", text: $viewModel.draft.locality)
                    TextField("NS / Numéro de série", text: $viewModel.draft.serialNumber)
                    TextField("Intervenant", text: $viewModel.draft.intervenant)
                    TextField("Temps intervention", text: $viewModel.draft.interventionTime)
                    TextField("Temps déplacement", text: $viewModel.draft.travelTime)
                }
                .textFieldStyle(.roundedBorder)
            }
        }
    }

    private var descriptionCard: some View {
        card(title: "Description du problème") {
            TextEditor(text: $viewModel.draft.description)
                .frame(minHeight: 110)
                .padding(8)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                )
        }
    }

    private var workCard: some View {
        card(title: "Travail effectué") {
            VStack(spacing: 10) {
                ForEach(0..<InterventionDraft.maxWorkLines, id: \.self) { index in
                    HStack(alignment: .top, spacing: 10) {
                        Text("\(index + 1)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 26, height: 26)
                            .background(Color(red: 0.05, green: 0.37, blue: 0.36), in: Circle())
                        TextField(index == 0 ? "Opération réalisée" : "", text: viewModel.bindingForWorkLine(at: index), axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                    }
                }
            }
        }
    }

    private var referencesCard: some View {
        card(title: "Pièces / articles") {
            VStack(alignment: .leading, spacing: 12) {
                Stepper("Nombre de pièces : \(viewModel.draft.referenceCount)", value: $viewModel.draft.referenceCount, in: 0...InterventionDraft.maxReferences)
                ForEach(0..<viewModel.draft.referenceCount, id: \.self) { index in
                    let binding = viewModel.bindingForReference(at: index)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Pièce \(index + 1)")
                            .font(.subheadline.weight(.semibold))
                        TextField("Référence", text: binding.reference)
                            .textFieldStyle(.roundedBorder)
                        TextField("Désignation", text: binding.designation)
                            .textFieldStyle(.roundedBorder)
                        Stepper("Quantité : \(binding.wrappedValue.quantity)", value: binding.quantity, in: 1...99)
                    }
                    .padding(12)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.gray.opacity(0.15), lineWidth: 1)
                    )
                }
            }
        }
    }

    private var observationCard: some View {
        card(title: "Observation") {
            TextEditor(text: $viewModel.draft.observation)
                .frame(minHeight: 80)
                .padding(8)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                )
        }
    }

    private var actionCard: some View {
        card(title: "Actions & transmission") {
            VStack(alignment: .leading, spacing: 12) {
                statusBadge(
                    text: "\(viewModel.syncStatusText) • \(viewModel.pendingCount) en attente",
                    tint: Color(red: 0.05, green: 0.37, blue: 0.36),
                    background: Color(red: 0.86, green: 0.94, blue: 0.92),
                    foreground: Color(red: 0.05, green: 0.37, blue: 0.36)
                )

                HStack {
                    Button("Enregistrer") {
                        viewModel.saveDraft()
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Nouvelle fiche") {
                        viewModel.resetDraft()
                    }
                    .buttonStyle(.bordered)
                }

                HStack {
                    Button("Exporter PDF") {
                        viewModel.exportPDF(shareAfterExport: false)
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Partager PDF") {
                        viewModel.exportPDF(shareAfterExport: true)
                    }
                    .buttonStyle(.bordered)
                }

                HStack {
                    Button("Capturer la fiche") {
                        viewModel.requestCameraCapture()
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Tester la liaison") {
                        viewModel.sendTestMessage()
                    }
                    .buttonStyle(.bordered)
                }

                Button("Ouvrir le dernier document") {
                    viewModel.openLastGeneratedDocument()
                }
                .buttonStyle(.bordered)

                if let last = viewModel.lastGeneratedDocument {
                    Text("Dernier document : \(last.fileName)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var logoView: some View {
        Group {
            if let image = viewModel.companyLogoImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "doc.text.image")
                    .resizable()
                    .scaledToFit()
                    .padding(10)
                    .foregroundStyle(.white)
            }
        }
    }

    private func card<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(Color(red: 0.06, green: 0.20, blue: 0.19))
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.gray.opacity(0.12), lineWidth: 1)
        )
    }

    private func statusBadge(text: String, tint: Color, background: Color, foreground: Color) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(background, in: Capsule())
            .overlay(
                Capsule().stroke(tint.opacity(0.15), lineWidth: 1)
            )
    }
}

private struct CompanySettingsSheet: View {
    @ObservedObject var viewModel: InterventionViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var selectedLogo: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            Form {
                Section("Coordonnées") {
                    TextField("Nom société", text: $viewModel.companySettings.companyName)
                    TextField("Adresse société", text: $viewModel.companySettings.companyAddress, axis: .vertical)
                    TextField("Téléphone société", text: $viewModel.companySettings.companyPhone)
                    TextField("E-mail société", text: $viewModel.companySettings.companyEmail)
                }

                Section("Logo") {
                    HStack(spacing: 12) {
                        Group {
                            if let image = viewModel.companyLogoImage {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFit()
                            } else {
                                Image(systemName: "photo")
                                    .resizable()
                                    .scaledToFit()
                                    .padding(12)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .frame(width: 72, height: 72)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))

                        VStack(alignment: .leading, spacing: 8) {
                            PhotosPicker("Choisir un logo", selection: $selectedLogo, matching: .images)
                            Button("Logo par défaut", role: .destructive) {
                                viewModel.setCompanyLogo(nil)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Profil société")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        viewModel.saveCompanySettings()
                        dismiss()
                    }
                }
            }
            .onChange(of: selectedLogo) { _, newItem in
                guard let newItem else { return }
                Task {
                    if let data = try? await newItem.loadTransferable(type: Data.self) {
                        await MainActor.run {
                            viewModel.setCompanyLogo(data)
                        }
                    }
                }
            }
        }
    }
}

import SwiftUI

@main
struct BioplusTerrainIOSApp: App {
    @StateObject private var viewModel = InterventionViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            InterventionRootView(viewModel: viewModel)
                .task {
                    viewModel.start()
                }
                .onChange(of: scenePhase) { newPhase in
                    viewModel.handleScenePhase(newPhase)
                }
        }
    }
}

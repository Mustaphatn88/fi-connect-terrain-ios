# Bioplus Terrain iOS

Cette base iOS native reproduit le flux terrain Android actuel et transmet les documents vers les apps Android `central` et `demo` via le même relais public `ntfy.sh`.

## Ce qui est déjà implémenté

- formulaire terrain complet
- identité société configurable
- génération PDF locale
- capture photo de fiche imprimée
- file locale d’envoi avec renvoi automatique
- message de test
- même format de transmission que l’app Android terrain
- enregistrement des PDF et captures dans l’app Fichiers iOS
- partage natif des PDF générés

## Compatibilité

Le protocole d’envoi est identique à Android :

- relais : `https://ntfy.sh`
- topic : `fiche-3478abcd-9f41-4c2e-a6b7-17db6a55ad19-intervention-pdf`
- nom de pièce jointe : `relay__...`
- mêmes métadonnées encodées dans le nom de fichier
- mêmes messages de secours texte

Les apps Android `central` et `demo` n’ont donc pas besoin d’être modifiées pour recevoir les envois iOS.

## Où sont enregistrés les documents iOS

Les documents sont générés côté iOS dans le dossier `Documents` de l’app :

- `Intervention PDFs`
- `Captured Interventions`

Le projet active aussi :

- `UIFileSharingEnabled`
- `LSSupportsOpeningDocumentsInPlace`

Les PDF et captures restent donc accessibles depuis l’app **Fichiers** sur iPhone, depuis Finder sur Mac, ou via le partage intégré iOS.

## Création du projet Xcode

Le poste actuel est sous Windows, donc la compilation iOS finale doit se faire sur un Mac avec Xcode.

## Alternative sans Mac local

Une chaîne **cloud macOS** est maintenant préparée dans le projet :

- workflow GitHub Actions : [ios-native-from-zero.yml](C:/Users/MDaba/Documents/New%20project/.github/workflows/ios-native-from-zero.yml)
- guide complet : [CLOUD_BUILD_GUIDE.md](C:/Users/MDaba/Documents/New%20project/terrain-ios/CLOUD_BUILD_GUIDE.md)

Cette chaîne permet :

- de vérifier la compilation iOS sur runner macOS
- puis, si les secrets Apple sont fournis, de produire une **IPA signée**

### Option recommandée

1. Installer [XcodeGen](https://github.com/yonaskolb/XcodeGen) sur le Mac.
2. Ouvrir le dossier `terrain-ios`.
3. Exécuter :

```bash
xcodegen generate
open BioplusTerrainIOS.xcodeproj
```

4. Régler l’équipe de signature Apple dans Xcode.
5. Lancer sur iPhone ou simulateur.

## Important pour la compatibilité Android

Le nom de pièce jointe et les métadonnées sont déjà alignés sur Android :

- même topic `ntfy`
- même nom `relay__...`
- même encodage Base64 URL-safe
- même message de test
- même texte de secours si un PDF ou une photo ne peut pas être relayé

## Limite iOS importante

iOS ne permet pas un service d’arrière-plan permanent comme Android.  
La file locale est fiable, mais les renvois automatiques se font surtout :

- quand l’app est active
- quand elle revient au premier plan
- quand le réseau redevient disponible

Pour une app terrain émettrice, c’est généralement suffisant.

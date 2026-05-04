# Build iPhone Natif Sans Mac Local

Ce guide permet de construire la version **native iPhone** de `FI Connect Terrain` depuis **GitHub Actions sur macOS**, sans disposer d'un Mac physique.

## Ce que le workflow fait

Le workflow GitHub Actions :

1. démarre une machine `macos-latest`
2. installe `XcodeGen`
3. génère `BioplusTerrainIOS.xcodeproj`
4. construit l'app en mode **simulateur non signé**
5. peut aussi produire une **IPA signée** si les secrets Apple sont fournis

Fichier du workflow :

- [.github/workflows/ios-native-from-zero.yml](C:/Users/MDaba/Documents/New%20project/.github/workflows/ios-native-from-zero.yml)

## Déclenchement

### Build de vérification

Le job de vérification se lance automatiquement si :

- un fichier dans `terrain-ios/**` change
- ou si le workflow lui-même change

### Build IPA signé

Le build signé se lance manuellement depuis :

- `Actions`
- `Build Terrain iOS Native From Zero`
- `Run workflow`
- cocher `Construire aussi une IPA signée`

## Secrets Apple requis pour l'IPA signée

Dans le dépôt GitHub :

- `Settings`
- `Secrets and variables`
- `Actions`

Créer ces secrets :

### `IOS_DEVELOPMENT_TEAM`

Ton identifiant d'équipe Apple Developer.

### `IOS_CERTIFICATE_P12_BASE64`

Le certificat `.p12` encodé en Base64.

### `IOS_CERTIFICATE_PASSWORD`

Le mot de passe du fichier `.p12`.

### `IOS_PROVISIONING_PROFILE_BASE64`

Le fichier `.mobileprovision` encodé en Base64.

### `IOS_KEYCHAIN_PASSWORD`

Un mot de passe libre, utilisé temporairement dans le runner macOS.

## Variable facultative

Dans :

- `Settings`
- `Secrets and variables`
- `Actions`
- `Variables`

Tu peux créer :

### `IOS_EXPORT_METHOD`

Valeurs possibles selon ton besoin :

- `development`
- `ad-hoc`
- `app-store`

Si rien n'est défini, le workflow prend `ad-hoc`.

## Comment convertir les fichiers Apple en Base64 sous Windows

### Pour le certificat `.p12`

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\chemin\certificat.p12")) | Set-Clipboard
```

### Pour le profil `.mobileprovision`

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\chemin\profil.mobileprovision")) | Set-Clipboard
```

Ensuite, colle le contenu dans les secrets GitHub correspondants.

## Résultat du workflow

### Sans secrets Apple

Tu auras :

- un build de validation iOS
- un log de compilation

### Avec secrets Apple

Tu auras en plus :

- une archive `.xcarchive`
- une **IPA signée** téléchargeable depuis les artifacts GitHub

## Important

Construire une vraie app iPhone native sans Mac local est **possible**, mais **Apple impose toujours la signature**.

Donc :

- **workflow macOS cloud** : oui
- **IPA installable sans compte/signature Apple** : non

## Recommandation pratique

Pour aller vite :

1. lancer d'abord le build simulateur
2. vérifier que `terrain-ios` compile
3. ensuite seulement ajouter les secrets Apple
4. lancer la génération IPA signée

# FI Connect Terrain PWA

Cette version remplace le besoin d’un build iOS natif quand aucun Mac n’est disponible.

## Ce que fait cette app

- formulaire terrain complet
- société configurable
- génération PDF locale
- capture photo de fiche imprimée
- stockage local du brouillon
- file d’attente locale avec renvoi automatique
- message de test
- compatibilité avec les apps Android `central` et `demo`
- installation iPhone depuis Safari avec guide intégré
- comportement plus proche d’une vraie app via écran d’accueil
- shell local mis en cache pour continuer à ouvrir l’app même hors ligne après le premier chargement

## Compatibilité Android

Le protocole d’envoi est volontairement le même que l’app terrain Android :

- relais : `https://ntfy.sh`
- topic : `fiche-3478abcd-9f41-4c2e-a6b7-17db6a55ad19-intervention-pdf`
- nom de fichier distant : `relay__...`
- mêmes métadonnées encodées
- même secours texte

Les apps Android réceptrices n’ont donc pas besoin d’être modifiées.

## Lancer en local

```bash
npm install
npm run dev
```

## Build production

```bash
npm run build
```

Le build final est généré dans `terrain-pwa/dist`.

## Déploiement HTTPS

Le plus simple est GitHub Pages.  
Le workflow est déjà prêt dans :

`C:\Users\MDaba\Documents\New project\.github\workflows\deploy-terrain-pwa.yml`

Après push sur GitHub, active Pages dans le dépôt puis lance le workflow.

## Installation sur iPhone

1. Ouvrir l’URL déployée dans Safari.
2. Taper `Partager`.
3. Choisir `Ajouter à l’écran d’accueil`.
4. Activer `Ouvrir comme app` si proposé.

## Conseils de déploiement

- utiliser impérativement une URL `HTTPS`
- ouvrir la première fois l’app avec du réseau pour charger le shell local
- une fois installée, lancer la PWA depuis l’écran d’accueil, pas depuis un onglet navigateur
- pour les meilleurs résultats iPhone, toujours privilégier `Safari`

## Limites à connaître

- ce n’est pas un `.ipa` natif
- les renvois automatiques sont fiables quand l’app web est ouverte, revient au premier plan ou quand le réseau revient
- iOS Web est bien plus réaliste qu’un faux build iOS sous Windows, mais reste moins libre qu’Android pour l’arrière-plan

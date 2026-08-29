<p align="center">
  <img src="store-assets/promo/readme-banner.svg" alt="TimeTrack" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/DrummingBird1/timetrack-extension/actions/workflows/test.yml"><img src="https://github.com/DrummingBird1/timetrack-extension/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/DrummingBird1/timetrack-extension/releases/latest"><img src="https://img.shields.io/github/v/release/DrummingBird1/timetrack-extension?label=release" alt="Latest release"></a>
  <a href="https://drummingbird1.github.io/timetrack-extension/"><img src="https://img.shields.io/badge/website-live-6366f1" alt="Website"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.he.md">עברית</a> ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.es.md">Español</a> ·
  <b>Français</b>
</p>

# TimeTrack — un suivi du temps de navigation respectueux de la vie privée

Une extension Chrome moderne qui mesure le temps actif que vous passez sur chaque site web — une alternative à Webtime Tracker respectueuse de la vie privée et axée sur le local, avec des analyses approfondies, des objectifs, une sauvegarde cloud et l'export de données.

**[🌐 Site web](https://drummingbird1.github.io/timetrack-extension/)** · **[📋 Journal des modifications](CHANGELOG.md)** · **[🔒 Politique de confidentialité](store-assets/PRIVACY.md)**

> Toutes les données restent **locales**, sur votre appareil. Rien n'est envoyé nulle part, sauf si vous activez explicitement la sauvegarde cloud.

## ✨ Fonctionnalités

- **Suivi intelligent et automatique** — ne comptabilise que le temps *actif* : fenêtre au premier plan et vous n'êtes pas inactif. Possibilité de continuer à compter pendant la lecture audio en arrière-plan.
- **Design moderne** — thèmes sombre/clair/automatique, prise en charge complète du RTL, graphiques fluides conçus sur mesure.
- **Tableau de bord riche** avec 4 onglets :
  - **Vue d'ensemble** — cartes récapitulatives (aujourd'hui / période / moyenne / score de concentration / série en cours), un graphique de tendance dans le temps, une répartition par catégorie et les sites les plus visités.
  - **Sites** — un tableau consultable et triable avec le temps, les visites, la part et une limite par site ; **épinglez** des sites en haut de la liste, et recherchez dans **tout l'historique**, pas seulement la période sélectionnée.
  - **Analyses intelligentes** — une carte de chaleur jour de la semaine × heure, la répartition horaire, le temps productif par rapport au temps de distraction, et votre heure la plus chargée.
  - **Paramètres** — un contrôle complet, avec une **barre de recherche des paramètres** pour tout retrouver rapidement.
- **Catégories intelligentes** — classification automatique des sites (productivité, réseaux sociaux, divertissement, actualités, et plus encore) + un **score de concentration de 0 à 100**. Chaque classification est modifiable.
- **Mode concentration (Pomodoro)** — des cycles travail→pause qui bloquent les sites distrayants, un mode « liste blanche » (bloque tout sauf ce que vous autorisez), des **pauses longues** toutes les quelques cycles, un blocage/autorisation par **domaine spécifique** (pas seulement par catégorie), et des raccourcis clavier (Alt+Maj+F).
- **Sites non suivis** — une liste de sites qui ne sont jamais comptabilisés, gérée depuis les Paramètres ou directement depuis la vue détaillée d'un site (« Ne pas suivre ce site »), où vous pouvez aussi **fusionner l'historique entre domaines** (par exemple lors du changement de nom d'un site) et consulter la **première/dernière visite**.
- **Analyses automatisées** — « Réseaux sociaux en hausse de 30 % par rapport à la semaine dernière », votre jour le plus chargé, et plus encore.
- **Import CSV et vraies icônes de site (optionnel)** — un chemin de migration depuis d'autres outils de suivi.
- **Objectifs et limites** — une limite de temps quotidienne, une limite par site, des objectifs quotidiens et hebdomadaires, un **avertissement à l'approche des 80 %** avant l'alerte de dépassement (avec un bouton de report d'une heure directement sur la notification), et un résumé hebdomadaire automatique.
- **Comparaison de périodes et détail par site** — cette semaine par rapport à la semaine dernière, et cliquer sur un site ouvre une chronologie quotidienne **ainsi qu'une répartition horaire** (les heures de pointe de ce site).
- **Périodes personnalisées** — en plus des périodes rapides (aujourd'hui / 7 / 30 / 90 jours / tout).
- **Sauvegarde cloud chiffrée** — synchronisation avec Google ou un serveur personnalisé (HTTPS), avec un chiffrement optionnel par phrase secrète AES-256 (zero-knowledge, avec un **indicateur de robustesse de la phrase secrète**), et un **aperçu avant restauration** (période, temps total, nombre de sites) pour ne jamais restaurer à l'aveugle.
- **Export/import** — JSON (sauvegarde complète) et CSV (tout, ou seulement la vue actuelle).
- **Six langues** — hébreu, anglais, arabe, russe, espagnol et français, avec changement en direct.
- **Confidentialité** — aucune permission `host`, aucun suivi externe, aucun appel réseau involontaire (les icônes sont générées localement), suppression automatique des anciennes données.

## 🚀 Installation

L'extension n'étant pas encore disponible sur le Chrome Web Store, installez-la en mode développeur :

1. Ouvrez `chrome://extensions`
2. Activez le **mode développeur** (en haut à droite)
3. Cliquez sur **Charger l'extension non empaquetée**
4. Sélectionnez le dossier **`extension/`** (c'est ce dossier qui est chargé/envoyé au store)
5. Épinglez l'extension à votre barre d'outils — et commencez à naviguer 🎉

Cliquer sur l'icône ouvre une popup rapide ; le bouton « Ouvrir le tableau de bord complet » ouvre le tableau de bord.

## ☁️ Configurer la sauvegarde cloud

- **Synchronisation Google** — activez « Synchroniser avec le compte Google » dans les Paramètres. Les données sont sauvegardées automatiquement via le mécanisme de synchronisation propre à Chrome (plafonné à ~100 Ko ; les jours les plus anciens sont supprimés si nécessaire, mais vos données locales restent complètes).
- **Serveur personnalisé** — indiquez une URL (et un jeton optionnel) pour un point de terminaison que vous contrôlez ; l'extension y envoie la sauvegarde complète en `POST`.
- **Fichier** — vous pouvez toujours exporter en JSON/CSV manuellement et l'enregistrer où vous le souhaitez.

## 🔧 Développement

Aucune étape de build, aucune dépendance — du JavaScript modulaire pur. La suite de tests (74 cas) s'exécute depuis `dist` :

```bash
cd dist
npm test               # node --test (no external dependencies)
pwsh build.ps1          # builds the upload zip from extension/
```

Pour l'architecture, le modèle de données et une carte complète des fichiers, voir **[CLAUDE.md](CLAUDE.md)**.

## 📁 Structure

```
extension/               ← the shippable extension (load/upload this folder)
  manifest.json          — extension config (MV3)
  background.js          — the tracking engine (service worker)
  src/lib/                — shared logic (storage, stats, charts, backup, crypto, i18n)
  src/popup/               — the quick popup
  src/dashboard/            — the full dashboard
  src/blocked/              — the focus-mode block page
  icons/                  — icons
store-assets/            ← store assets: privacy policy, listing copy, images
  site/                  — marketing website source (published to GitHub Pages)
dist/                    ← dev tooling: tests, package.json, build.ps1, and the built zip
archive/                 ← superseded assets (old images/build versions)
```

## 🔒 Permissions et pourquoi elles sont nécessaires

| Permission | Utilisation |
|---|---|
| `storage` / `unlimitedStorage` | Stocker les données de temps et les paramètres localement |
| `tabs` | Identifier le domaine de l'onglet actif |
| `idle` | Arrêter le comptage pendant votre inactivité |
| `alarms` | Enregistrement périodique et sauvegarde automatique |
| `notifications` | Alertes pour les limites de temps |
| `favicon` (optionnel) | Vraies icônes de site depuis le cache local de Chrome — uniquement si activé manuellement |

Aucune permission `host`, et aucun accès au contenu des pages — uniquement le nom de domaine.

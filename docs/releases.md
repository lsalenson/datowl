# Publier une mise à jour

Les apps installées vérifient au démarrage, puis toutes les 6 heures, s'il existe une
nouvelle version. Si oui, une notification propose **Update and Restart** : l'app
télécharge la mise à jour, vérifie sa signature, se remplace et redémarre.
On peut aussi forcer la vérification avec **Settings › Check for Updates…**.

## Publier

```bash
scripts/release.sh 0.2.0 "Ce qui change"
```

Le script met la version à jour (`Cargo.toml`, `tauri.conf.json`, `package.json`), la
commite sur `main` et pousse le tag `v0.2.0`. Il refuse de partir si l'arbre de travail
n'est pas propre. Le tag déclenche [`.github/workflows/release.yml`](../.github/workflows/release.yml),
qui compile sur les trois OS et publie la release une fois **tous** les builds réussis :

| OS | Installeur | Mise à jour automatique |
| --- | --- | --- |
| macOS (universel) | `Datowl_0.2.0_universal.dmg` | `Datowl.app.tar.gz` |
| Windows x64 | `Datowl_0.2.0_x64-setup.exe` | le même `.exe` |
| Linux x64 | `Datowl_0.2.0_amd64.AppImage`, `Datowl_0.2.0_amd64.deb` | l'`.AppImage` |

Chaque fichier de mise à jour a son `.sig`, et `latest.json` les référence tous.
L'app interroge `https://github.com/lsalenson/datowl/releases/latest/download/latest.json`
(voir `plugins.updater` dans `apps/desktop/src-tauri/tauri.conf.json`).

## Essayer les installeurs sans publier

```bash
gh workflow run release.yml --repo lsalenson/datowl
```

Les installeurs sont alors joints à l'exécution du workflow (onglet **Actions**), sans
release. En local, `npm --prefix apps/desktop run build` ne produit que ceux de l'OS courant.

## Mise en place (une seule fois)

Le workflow signe les mises à jour avec la clé privée, à déposer dans les secrets du dépôt :

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo lsalenson/datowl < ~/.tauri/datowl.key
```

Si la clé a un mot de passe, l'ajouter aussi dans `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## À savoir

- **La clé privée `~/.tauri/datowl.key` ne doit jamais être perdue ni partagée.** Sans
  elle, impossible de publier une mise à jour que les apps installées acceptent ; si elle
  fuit, quelqu'un d'autre peut en publier. Sauvegarde-la (gestionnaire de mots de passe).
- Le dépôt de releases doit être **public** : l'updater télécharge sans authentification.
  Le code peut rester dans un dépôt privé, seuls les binaires y sont publiés.
- **Signature Apple** : l'app est signée « ad hoc ». Les mises à jour automatiques
  fonctionnent, mais à la *première* installation macOS affiche « développeur non
  identifié » (clic droit › Ouvrir). Pour l'éviter : un compte Apple Developer
  (99 $/an), un certificat « Developer ID Application » et la notarisation
  (`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` au moment du build).
- **Signature Windows** : l'installeur n'est pas signé, SmartScreen affiche « Windows a
  protégé votre ordinateur » (Informations complémentaires › Exécuter quand même). Pour
  l'éviter, il faut un certificat de signature de code.
- **Linux** : les mots de passe passent par le Secret Service (GNOME Keyring, KWallet).
  Sans ce service, enregistrer un mot de passe échoue avec une erreur de trousseau.

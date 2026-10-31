# Publier une mise à jour

Les apps installées vérifient au démarrage, puis toutes les 6 heures, s'il existe une
nouvelle version. Si oui, une notification propose **Update and Restart** : l'app
télécharge la mise à jour, vérifie sa signature, se remplace et redémarre.
On peut aussi forcer la vérification avec **Settings › Check for Updates…**.

## Publier

```bash
scripts/release.sh 0.2.0 "Ce qui change"
```

Le script :
1. met la version à jour dans `Cargo.toml`, `tauri.conf.json` et les `package.json` ;
2. compile l'app universelle macOS (Apple Silicon + Intel) ;
3. signe l'archive de mise à jour avec la clé privée `~/.tauri/datowl.key` ;
4. crée la release `v0.2.0` sur `lsalenson/datowl` avec :
   - `Datowl_0.2.0_universal.dmg` pour les nouvelles installations ;
   - `Datowl.app.tar.gz` (+ `.sig`) et `latest.json` pour les mises à jour.

L'app interroge `https://github.com/lsalenson/datowl/releases/latest/download/latest.json`
(voir `plugins.updater` dans `apps/desktop/src-tauri/tauri.conf.json`).

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

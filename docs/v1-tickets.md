# Backlog V1 de Datowl

Tout ce qu'il faut pour que l'outil soit fiable le jour de la V1 : modals, interface, exécution, données, robustesse et qualité. Le site, la communication et l'annonce sont hors périmètre.

**204 tickets** : 45 P0, 124 P1, 35 P2.

## État des P0

42 P0 sur 45 sont corrigés (cases cochées), plus 7 P1 traités au passage. Une ligne **État** indique ce qui n'a pas pu être vérifié en conditions réelles. Rien n'a été exécuté sur Windows ou Linux.

Restent ouverts :

- **V1-058, périmètre** : la correction applique le choix le plus prudent, à confirmer : une V1 de lecture et d'exécution, sans édition de données, sans mode de transaction manuel, sans historique ni import. Tout ce qui n'existe pas a été retiré de l'interface.
- **V1-194, notarisation macOS** : demande un compte Apple Developer et ses secrets dans GitHub.
- **V1-195, licence** : le choix t'appartient.

## Lire ce backlog

| Priorité | Sens |
|---|---|
| **P0** | Bloque la V1 : perte de données, app inutilisable, sécurité, ou fonction affichée qui n'existe pas |
| **P1** | Attendu en V1, sortie possible seulement avec une raison écrite |
| **P2** | Finition, peut suivre juste après |

| Preuve | Nombre | Sens |
|---|---|---|
| `reproduit` | 16 | Observé dans l'UI lancée avec le backend de démo |
| `code` | 123 | Déduit de la lecture du code, **pas encore exécuté** : à reproduire avant de corriger |
| `audit` | 46 | Aucun défaut établi : vérification à faire |
| `décision` | 19 | Un choix produit à faire d'abord |

**Limites de l'audit** : l'app Tauri réelle n'a pas été lancée, ni Windows ou Linux, ni de vraie base. L'UI a été testée dans le navigateur avec `shared/api/mock.ts`. Au moment de l'audit, `cargo test --workspace`, `cargo check --workspace --tests` et `npm --prefix web run typecheck` passaient, sans les tests live Postgres. Chaque référence `fichier:ligne` a été résolue sur le code de la branche `fix/console-exec-channels` et peut dériver ensuite.

## Grille de conformité d'un modal

Un modal est conforme s'il passe ces dix points :

1. **Clavier** : focus initial logique, Tab bouclé, Échap ferme, Entrée valide sauf action destructive.
2. **Focus** : rendu à l'élément d'origine à la fermeture, fond inerte, raccourcis globaux bloqués.
3. **Sémantique** : `role`, `aria-modal`, titre et description reliés, champs étiquetés.
4. **Fermeture** : bouton X présent, aucune saisie perdue sans confirmation.
5. **Validation** : erreur par champ, visible sans survol, sous le champ concerné.
6. **Attente** : état occupé pendant l'action, pas de double envoi.
7. **Échec** : erreur affichée sur place, complète et copiable, aucune promesse rejetée en silence.
8. **Texte** : titre qui nomme l'action, verbe de bouton précis, raccourcis adaptés à l'OS.
9. **Tailles** : correct à 960×600 et 1440×900, avec noms longs et Unicode.
10. **Effet réel** : le résultat est vérifié dans l'état de l'app et sur le disque ou le serveur.

Modals et popups couverts : Data Sources, mot de passe, source depuis une URL, New Project, Open Project, Rename Project, Delete Project, Rename Data Source, Delete Data Source, Rename objet, Drop, Statement Failed, Delete File, palette, filtre de schémas, toast de mise à jour, menus contextuels.

## Ordre conseillé

1. Décisions de périmètre (V1-058) et CI, pour que la suite soit protégée.
2. Section F (perte de données), puis les P0 de G et K.
3. Section A, qui améliore tous les modals, puis B.
4. Section D : retirer ce qui n'existe pas réduit le reste de l'audit visuel.
5. P1 restants, avec passage de la grille sur le build candidat en dernier.

## Sommaire

| Section | Tickets | P0 | P1 | P2 |
|---|---:|---:|---:|---:|
| A. Socle commun des modals | 11 | 3 | 6 | 2 |
| B. Conformité modal par modal | 40 | 7 | 24 | 9 |
| C. Menus contextuels et popups | 6 | 0 | 3 | 3 |
| D. Fonctions visibles mais absentes | 12 | 8 | 3 | 1 |
| E. Raccourcis clavier | 10 | 2 | 7 | 1 |
| F. Sécurité des données et de l'édition | 14 | 8 | 5 | 1 |
| G. Connexion et exécution | 19 | 5 | 12 | 2 |
| H. Grille, table et export | 12 | 2 | 8 | 2 |
| I. Explorateur | 8 | 0 | 5 | 3 |
| J. Projets et OS | 6 | 1 | 4 | 1 |
| K. Robustesse de l'application | 11 | 3 | 7 | 1 |
| L. Sécurité | 9 | 1 | 8 | 0 |
| M. Interface et cohérence visuelle | 17 | 1 | 10 | 6 |
| N. Écrans manquants | 7 | 0 | 6 | 1 |
| O. Qualité et CI | 11 | 2 | 8 | 1 |
| P. Installation et mise à jour de l'app | 11 | 2 | 8 | 1 |
| **Total** | **204** | **45** | **124** | **35** |

## A. Socle commun des modals

Ces tickets corrigent `shared/ui/Modal.tsx` et `AskDialog`, donc tous les dialogues d'un coup. À traiter avant la section B.

- [x] **V1-001 · P0 · `reproduit`** : Le focus n'est pas piégé dans le modal
  - **Constat** : `aria-modal` est absent et le fond reste actif : mesuré avec 8 boutons de la barre d'outils encore focusables derrière Data Sources. `web/src/shared/ui/Modal.tsx:27`
  - **Terminé quand** : Tab et ⇧Tab bouclent dans le modal, le fond est `inert`, `aria-modal="true"` est posé.
- [x] **V1-002 · P0 · `reproduit`** : Les raccourcis globaux agissent derrière un modal
  - **Constat** : ⌘K ouvre la palette par-dessus Data Sources (les deux au z-index 900). ⌘W, ⌘1, ⌘2 et ⌘8 passent par le même écouteur sans garde. `web/src/app/App.tsx:41`
  - **Terminé quand** : Aucun raccourci global ne s'exécute tant qu'un modal est ouvert, sauf ceux du modal lui-même.
- [ ] **V1-003 · P1 · `code`** : Échap ferme la palette et le modal situé dessous
  - **Constat** : L'écouteur de `Modal` ne connaît que `.modal-backdrop` : la palette n'en porte pas, donc Échap ferme les deux. `web/src/shared/ui/Modal.tsx:18`
  - **Terminé quand** : Une pile unique d'overlays existe et Échap ne ferme que le plus haut (modal, palette, menu, popover).
- [x] **V1-004 · P1 · `code`** : Le focus n'est pas rendu à l'élément d'origine
  - **Constat** : Aucune sauvegarde de `document.activeElement` à l'ouverture. Après fermeture, le focus retombe sur `body` et l'éditeur ou l'arbre perd le clavier.
  - **Terminé quand** : À la fermeture, le focus revient à l'élément déclencheur, ou à l'éditeur actif si cet élément a disparu.
- [ ] **V1-005 · P1 · `reproduit`** : Pas de bouton de fermeture dans l'en-tête
  - **Constat** : L'en-tête n'a qu'un titre et `aside` : aucun bouton mesuré. `web/src/shared/ui/Modal.tsx:28`
  - **Terminé quand** : Tous les modals ont un X avec `aria-label`, cohérent avec le reste de l'app.
- [ ] **V1-006 · P1 · `code`** : Titre et description non reliés pour les lecteurs d'écran
  - **Constat** : Le nom vient d'`aria-label`. Le `h2` et le message ne sont pas reliés.
  - **Terminé quand** : `aria-labelledby` et `aria-describedby` sont posés, vérifiés à VoiceOver sur chaque modal.
- [x] **V1-007 · P0 · `code`** : Validation par défaut sur l'action destructive
  - **Constat** : Sans champ, `autoFocus` tombe sur le bouton primaire, même `danger`. Dans l'arbre, ⌦ puis Entrée suffisent à supprimer une source ou exécuter un DROP. `web/src/shared/ui/AskDialog.tsx:43`
  - **Terminé quand** : Pour `danger`, le focus initial va sur Cancel et Entrée ne confirme jamais par défaut.
- [ ] **V1-008 · P1 · `code`** : Dialogues d'information affichés avec Cancel et Close
  - **Constat** : `ask` n'a pas de mode alerte : « Statement Failed » et les erreurs de projet montrent deux boutons équivalents. `web/src/shared/ui/AskDialog.tsx:36`
  - **Terminé quand** : Un mode information n'affiche qu'un bouton, utilisé partout où `confirmLabel: 'Close'` existe.
- [ ] **V1-009 · P1 · `reproduit`** : Les erreurs de saisie ressemblent à une description
  - **Constat** : L'erreur d'URL remplace le texte d'aide et garde la classe `ask-message`, sans style d'erreur. Un champ vide désactive OK sans expliquer pourquoi. `web/src/features/explorer/components/Explorer.tsx:359`
  - **Terminé quand** : `AskOptions` accepte une erreur distincte, affichée sous le champ avec le style d'erreur et `role="alert"`.
- [ ] **V1-010 · P2 · `code`** : Aucun état « en cours » dans les modals
  - **Constat** : Le modal se ferme avant l'action (renommer, supprimer, créer un projet) : rien n'indique le travail ni n'empêche une double action. `web/src/shared/model/ui.ts:142`
  - **Terminé quand** : Les actions longues gardent le modal ouvert, bouton occupé, et affichent leur erreur sur place.
- [ ] **V1-011 · P2 · `audit`** : Matrice de tailles de tous les modals
  - **Constat** : Data Sources tient à 860×552 dans la fenêtre minimale de 960×600 (mesuré). Les autres n'ont pas été mesurés, ni un long SQL dans `ask-preview`.
  - **Terminé quand** : Captures à 960×600 et 1440×900 pour chaque modal, sans débordement ni bouton inaccessible.

## B. Conformité modal par modal

Chaque ticket se termine en passant la grille de conformité ci-dessus.

- [x] **V1-012 · P0 · `reproduit`** : Data Sources : le protocole affiché ne correspond pas à la valeur réelle
  - **Constat** : En passant de PostgreSQL `verify-full` à ClickHouse, le select affiche HTTP alors que l'URL générée reste `https://…` : `prefer` et `verify-full` n'existent pas dans ses options. `web/src/features/connections/components/DataSourcesDialog.tsx:115`
  - **Terminé quand** : Changer de moteur convertit `tls` vers une valeur valide du moteur, avec un test pour chaque couple.
- [x] **V1-013 · P0 · `reproduit`** : Data Sources : port invalide accepté
  - **Constat** : 99999 est accepté dans le champ, et un champ vidé donne 0. `port` est un `u16` côté Rust : l'erreur remonterait brute au moment d'enregistrer. `web/src/features/connections/components/DataSourcesDialog.tsx:301`
  - **Terminé quand** : Plage 1-65535 validée sur place, avec message sous le champ et enregistrement bloqué.
- [x] **V1-014 · P0 · `reproduit`** : Data Sources : modifications perdues sans avertissement
  - **Constat** : Un clic sur le fond ferme le dialogue et jette les brouillons (reproduit). Échap et Cancel suivent le même chemin. `web/src/shared/ui/Modal.tsx:26`
  - **Terminé quand** : Avec des brouillons modifiés, la fermeture demande confirmation, et un clic sur le fond ne ferme plus un formulaire.
- [x] **V1-015 · P0 · `code`** : Data Sources : modifier une source connectée n'a aucun effet immédiat
  - **Constat** : `save` n'écrit que la configuration, la session garde l'ancien hôte, utilisateur ou TLS, sans message. `crates/application/src/connections.rs:24`
  - **Terminé quand** : Enregistrer une source connectée propose de reconnecter, ou signale clairement que le changement attend la reconnexion.
  - **État** : reconnexion proposée après enregistrement ; non testée sur une vraie base.
- [ ] **V1-016 · P1 · `code`** : Data Sources : validation globale peu précise
  - **Constat** : « Name and host are required » ne dit pas quel champ ni quelle source : l'erreur peut viser un brouillon non sélectionné. `web/src/features/connections/components/DataSourcesDialog.tsx:178`
  - **Terminé quand** : Erreur par champ, et sélection automatique de la première source invalide.
- [ ] **V1-017 · P1 · `code`** : Data Sources : le résultat du test devient faux
  - **Constat** : `test` n'est réinitialisé que si la sélection change. Après une modification, « Succeeded » reste affiché, et un test lancé sur A peut s'afficher sur B. `web/src/features/connections/components/DataSourcesDialog.tsx:99`
  - **Terminé quand** : Toute modification efface le résultat, et une réponse d'un test périmé est ignorée.
- [ ] **V1-018 · P1 · `code`** : Data Sources : erreur de test tronquée
  - **Constat** : Le message tient sur une ligne du pied de dialogue, le reste est dans `title`. Les erreurs TLS ou réseau sont longues. `web/src/features/connections/components/DataSourcesDialog.tsx:223`
  - **Terminé quand** : Erreur complète lisible, sélectionnable et copiable, avec la version serveur en cas de succès.
- [ ] **V1-019 · P1 · `code`** : Data Sources : test d'une source sans mot de passe enregistré
  - **Constat** : Sans saisie, on envoie `null`, donc un mot de passe du trousseau absent : l'échec d'authentification ne dit pas que le champ est vide. `web/src/features/connections/components/DataSourcesDialog.tsx:163`
  - **Terminé quand** : Le test demande le mot de passe, ou le message indique qu'aucun n'est enregistré.
- [ ] **V1-020 · P1 · `code`** : Data Sources : impossible d'effacer un mot de passe stocké
  - **Constat** : Un champ vide sur une source existante vaut « garder l'ancien ». Il faut décocher, enregistrer, recocher. `web/src/features/connections/components/DataSourcesDialog.tsx:179`
  - **Terminé quand** : Une action explicite efface le mot de passe, et le champ indique s'il en existe un.
- [x] **V1-021 · P1 · `code`** : Data Sources : suppression sans gestion d'erreur
  - **Constat** : `remove` n'est pas protégé : un échec (trousseau, disque) devient une promesse rejetée sans message. Même chose dans l'explorateur. `web/src/features/connections/components/DataSourcesDialog.tsx:146`
  - **Terminé quand** : L'échec s'affiche à l'utilisateur et l'état reste cohérent avec le disque.
- [ ] **V1-022 · P1 · `code`** : Data Sources : Apply puis OK n'ouvre pas de console
  - **Constat** : La console ne s'ouvre que pour les sources encore `isNew` lors du OK : le résultat dépend de l'ordre des clics. `web/src/features/connections/components/DataSourcesDialog.tsx:181`
  - **Terminé quand** : Le comportement est identique dans les deux parcours et testé.
- [ ] **V1-023 · P1 · `code`** : Data Sources : libellé « Save in Keychain » sur Windows et Linux
  - **Constat** : Le texte est codé en dur, y compris dans le prompt de mot de passe. Le trousseau n'existe sous ce nom que sur macOS. `web/src/features/connections/components/PasswordPrompt.tsx:57`
  - **Terminé quand** : Libellé selon l'OS, ou terme neutre (« Save password »).
- [ ] **V1-024 · P1 · `code`** : Data Sources : TLS désactivé par défaut pour toute nouvelle source
  - **Constat** : `tls: 'disable'` est le défaut, y compris vers un hôte distant, alors que l'import d'URL choisit `prefer`. `web/src/features/connections/components/DataSourcesDialog.tsx:35`
  - **Terminé quand** : Défaut PostgreSQL décidé et cohérent (`prefer` recommandé), avertissement si le trafic n'est pas chiffré vers un hôte non local.
- [ ] **V1-025 · P2 · `reproduit`** : Data Sources : contrôles sans état accessible
  - **Constat** : `aria-pressed` vaut null sur PostgreSQL/ClickHouse (mesuré). Les pastilles sont annoncées par leur code hexadécimal. `web/src/features/connections/components/DataSourcesDialog.tsx:363`
  - **Terminé quand** : Groupe radio pour moteur et couleur, noms de couleurs lisibles.
- [ ] **V1-026 · P2 · `code`** : Data Sources : confort de la liste
  - **Constat** : Le badge affiche toujours « déconnecté », les doublons de nom sont permis, et le nom par défaut ne suit pas l'hôte saisi. `web/src/features/connections/components/DataSourcesDialog.tsx:259`
  - **Terminé quand** : État réel affiché, doublon signalé, nom par défaut suivant l'hôte tant qu'il n'est pas modifié.
- [x] **V1-027 · P0 · `code`** : Mot de passe : enregistré dans le trousseau avant d'être validé
  - **Constat** : « Save » écrit le mot de passe et passe `savePassword` à vrai avant `connect` : un mot de passe faux reste stocké et n'est plus jamais redemandé. `web/src/features/connections/model/connections.ts:76`
  - **Terminé quand** : L'écriture a lieu seulement après connexion réussie, et un échec d'authentification permet de ressaisir.
  - **État** : écriture après connexion réussie ; relu, non testé dans l'app réelle.
- [x] **V1-028 · P1 · `code`** : Mot de passe : le prompt disparaît en cas d'échec
  - **Constat** : Après un échec, le modal est déjà fermé et l'erreur n'est que dans Output, parfois masqué. `web/src/features/connections/model/connections.ts:93`
  - **Terminé quand** : Le prompt reste ouvert avec l'erreur, le bouton passe en attente pendant la connexion.
- [ ] **V1-029 · P2 · `code`** : Mot de passe : cases et saisie
  - **Constat** : « Save » est coché par défaut sans choix explicite, et un mot de passe vide passe sans indication. `web/src/features/connections/components/PasswordPrompt.tsx:11`
  - **Terminé quand** : Valeur par défaut décidée, vide autorisé mais explicite, bascule d'affichage du mot de passe.
- [x] **V1-030 · P0 · `reproduit`** : Source depuis une URL : mot de passe affiché en clair
  - **Constat** : Le champ est de type `text` (mesuré) alors que l'exemple contient un mot de passe : il reste visible à l'écran, y compris après une erreur. `web/src/features/explorer/components/Explorer.tsx:360`
  - **Terminé quand** : Le mot de passe est masqué après saisie ou le champ masque la valeur, et il n'apparaît jamais dans un log.
- [ ] **V1-031 · P2 · `audit`** : Source depuis une URL : formes acceptées
  - **Constat** : Parseur sans test : libpq, JDBC, `http(s)`, IPv6, ports natifs ClickHouse, caractères encodés. `web/src/features/connections/lib/connectionUrl.ts:19`
  - **Terminé quand** : Tests unitaires pour chaque forme, et message d'erreur précis pour chaque rejet.
- [ ] **V1-032 · P1 · `code`** : New Project : parcours et erreurs
  - **Constat** : L'échec ouvre un second dialogue générique titré « Project » et le nom vide n'est pas expliqué. `web/src/app/layout/MainToolbar.tsx:47`
  - **Terminé quand** : L'erreur s'affiche dans le dialogue d'origine et le titre décrit l'action échouée.
- [ ] **V1-033 · P1 · `code`** : Open Project : l'import DataGrip est silencieux
  - **Constat** : Les sources importées arrivent après rechargement, sans bilan. Les sources ignorées et les erreurs ne vont que dans un journal effacé par le rechargement. `web/src/features/projects/model/projects.ts:42`
  - **Terminé quand** : Résumé affiché (importées, ignorées, raison), et aucun doublon en cas de réouverture.
- [ ] **V1-034 · P2 · `audit`** : Rename Project : parcours
  - **Constat** : Nom dupliqué, nom invalide et changement du badge de projet à vérifier. `web/src/app/layout/MainToolbar.tsx:96`
  - **Terminé quand** : Grille passée, règle de `validate_name` expliquée dans le dialogue.
- [ ] **V1-035 · P1 · `code`** : Delete Project : portée et échec partiel
  - **Constat** : Le projet ouvert est absent du sous-menu sans explication, et l'erreur de suppression en cours de route laisse un état partiel. `web/src/app/layout/MainToolbar.tsx:102`
  - **Terminé quand** : Raison visible pour le projet courant, suppression tolérante à l'échec et clé `localStorage` du projet nettoyée.
- [ ] **V1-036 · P1 · `code`** : Rename Data Source : erreur non gérée
  - **Constat** : `save` n'a pas de `catch` : un échec du disque ou du trousseau ne s'affiche nulle part. `web/src/features/explorer/components/Explorer.tsx:292`
  - **Terminé quand** : L'erreur s'affiche, et le nouveau nom se propage à l'arbre, aux onglets et à la barre d'état.
- [ ] **V1-037 · P2 · `code`** : Delete Data Source : deux versions du même dialogue
  - **Constat** : Les deux chemins diffèrent (guillemets ou gras) et dupliquent le texte. `web/src/features/connections/components/DataSourcesDialog.tsx:141`
  - **Terminé quand** : Une seule fonction utilisée par les deux, avec le nombre de consoles supprimées.
- [ ] **V1-038 · P1 · `code`** : Rename objet : échec silencieux de la signature
  - **Constat** : Si la lecture de la signature échoue, l'erreur est avalée : l'aperçu reste vide et valider ne fait rien. `web/src/features/explorer/components/Explorer.tsx:297`
  - **Terminé quand** : L'erreur s'affiche et le bouton reste bloqué tant qu'aucun SQL n'est disponible.
- [ ] **V1-039 · P2 · `code`** : Rename objet : libellé et aperçu
  - **Constat** : Le bouton dit « Refactor » alors que seul un `ALTER` est lancé, sans mise à jour des références. `web/src/features/explorer/components/Explorer.tsx:303`
  - **Terminé quand** : Libellé « Rename » et avertissement sur les dépendances non mises à jour.
- [x] **V1-040 · P0 · `code`** : Drop : niveau de protection insuffisant
  - **Constat** : Un seul clic ou Entrée pour DROP de table, schéma ou base ; aucun rappel de l'environnement ni de CASCADE. `web/src/features/explorer/components/Explorer.tsx:341`
  - **Terminé quand** : Le titre nomme l'objet, le nom de la source est très visible, et DROP de schéma ou base demande de retaper le nom.
- [ ] **V1-041 · P1 · `code`** : Drop : erreur de préparation invisible
  - **Constat** : L'échec de la signature ne va que dans Output, sans dialogue. `web/src/features/explorer/components/Explorer.tsx:335`
  - **Terminé quand** : L'erreur s'affiche à l'utilisateur, même Services fermé.
- [ ] **V1-042 · P1 · `code`** : Statement Failed : erreur peu exploitable
  - **Constat** : Pas de copie de l'erreur ni du SQL, et le message peut être très long. `web/src/features/explorer/components/Explorer.tsx:269`
  - **Terminé quand** : Message et SQL défilants et copiables, pied de dialogue toujours visible.
- [ ] **V1-043 · P1 · `code`** : Delete File : console et fichier confondus
  - **Constat** : Le titre dit « File » pour une console, et le chemin de suppression d'un vrai fichier du projet n'existe pas. `web/src/features/files/components/FilesPanel.tsx:122`
  - **Terminé quand** : Libellé exact et menu contextuel disponible sur les consoles comme sur les fichiers retenus pour la V1.
- [ ] **V1-044 · P1 · `code`** : Palette : rôle et clavier
  - **Constat** : Échap et les flèches ne marchent que depuis l'input. Pas de motif combobox ni de `listbox`. `web/src/app/layout/CommandPalette.tsx:150`
  - **Terminé quand** : Motif combobox ARIA complet, focus piégé, lecture d'écran de l'élément actif.
- [ ] **V1-045 · P1 · `code`** : Palette : contenu incomplet
  - **Constat** : Absents : Files (⌘2), profil, déconnexion, fermeture d'onglet, vérification de mise à jour, projets. La recherche ignore le schéma et la source. `web/src/app/layout/CommandPalette.tsx:120`
  - **Terminé quand** : Toutes les actions disponibles sont accessibles, et `schema.table` est trouvable.
- [ ] **V1-046 · P2 · `code`** : Palette : doublons d'onglets
  - **Constat** : La palette ouvre un objet avec `oid: null` alors que l'arbre fournit un OID : deux onglets pour une même table. `web/src/features/workspace/model/workspace.ts:29`
  - **Terminé quand** : Une seule identité d'objet, testée depuis l'arbre et la palette.
- [ ] **V1-047 · P1 · `code`** : Filtre de schémas : popover
  - **Constat** : Position sans gestion des bords, focus non déplacé, aucun état de chargement ou d'erreur. `web/src/features/explorer/components/SchemaFilterPopover.tsx:46`
  - **Terminé quand** : Popover recadré dans la fenêtre, utilisable au clavier, liste longue défilante, états couverts.
- [ ] **V1-048 · P1 · `code`** : Mise à jour : vérification manuelle muette après « Later »
  - **Constat** : `dismissed` reste vrai pour la même version : Check for Updates n'affiche alors rien. `web/src/features/updates/model/updates.ts:44`
  - **Terminé quand** : Une vérification manuelle réaffiche toujours le résultat, avec un état « Checking… ».
- [ ] **V1-049 · P1 · `code`** : Mise à jour : redémarrage sans précaution
  - **Constat** : Le relancement ne vérifie ni requêtes en cours ni sauvegarde en attente. `web/src/features/updates/model/updates.ts:67`
  - **Terminé quand** : Avertissement si une requête tourne, sauvegarde forcée avant redémarrage.
- [ ] **V1-050 · P2 · `code`** : Mise à jour : finitions du toast
  - **Constat** : Notes de version chargées mais jamais affichées, pas de nouvel essai après erreur, « up to date » jamais auto-fermé, même icône partout. `web/src/features/updates/components/UpdateToast.tsx:37`
  - **Terminé quand** : Notes visibles, bouton Retry, fermeture automatique du toast d'information, icône d'erreur.
- [ ] **V1-051 · P1 · `audit`** : Fenêtre de dossier native
  - **Constat** : `dialog:allow-open` est déclaré, mais le parcours annulation, dossier sans droits et chemin réseau n'a pas été testé sur l'app réelle. `web/src/app/layout/MainToolbar.tsx:27`
  - **Terminé quand** : Parcours testés sur les trois OS, chaque échec a un message.

## C. Menus contextuels et popups

- [ ] **V1-052 · P1 · `code`** : Menus sans navigation clavier
  - **Constat** : Seul Échap est géré : pas de flèches, pas d'Entrée, pas de focus initial, sous-menu au survol uniquement. `web/src/shared/ui/ContextMenu.tsx:27`
  - **Terminé quand** : Motif `menu` WAI-ARIA complet, y compris sous-menus, et touche Menu ou ⇧F10 sur l'arbre.
- [ ] **V1-053 · P1 · `code`** : Sous-menus non repositionnés aux bords
  - **Constat** : Le menu principal est recadré, pas le sous-menu, placé en `left: calc(100% + 4px)`. `web/src/app/styles/app.css:1786`
  - **Terminé quand** : Bascule à gauche et remontée automatiques, testées aux quatre coins à 960×600.
- [ ] **V1-054 · P2 · `code`** : Menus sans hauteur maximale
  - **Constat** : Le recadrage peut donner une position négative si le menu dépasse la fenêtre, et rien ne le fait défiler. `web/src/shared/ui/ContextMenu.tsx:18`
  - **Terminé quand** : Hauteur maximale avec défilement, jamais de position hors écran.
- [ ] **V1-055 · P2 · `code`** : Positions de menu calculées à la main
  - **Constat** : La barre d'état suppose 30 px par ligne et Settings suppose 220 px de large. `web/src/app/layout/StatusBar.tsx:73`
  - **Terminé quand** : `openMenu` gère un ancrage (haut, bas, droite) à partir de la taille réelle.
- [ ] **V1-056 · P2 · `code`** : État coché écrit dans le libellé
  - **Constat** : Le « ✓ » est du texte ajouté au label, sans `menuitemradio` ni `aria-checked`. `web/src/app/layout/EditorArea.tsx:61`
  - **Terminé quand** : Propriété `checked` dans `MenuItem`, utilisée par tous les menus à choix.
- [ ] **V1-057 · P1 · `code`** : Menu d'onglet minimal
  - **Constat** : Seulement Close et Close Other Tabs : pas de Close All, de copie du chemin ni de renommage de console. `web/src/app/layout/EditorArea.tsx:48`
  - **Terminé quand** : Actions retenues pour la V1 présentes, y compris renommer une console (règles déjà dans le domaine).

## D. Fonctions visibles mais absentes

L'app affiche beaucoup d'éléments grisés recopiés de DataGrip. Pour une V1, chacun doit fonctionner ou disparaître.

- [ ] **V1-058 · P0 · `décision`** : Arrêter le périmètre fonctionnel de la V1
  - **Constat** : Plusieurs décisions de cette section dépendent de ce qui entre en V1 : édition de données, transactions, SSH, historique, export. `docs/datagrip-parity.md` en marque plusieurs P0.
  - **Terminé quand** : Liste écrite dans ce fichier, les autres tickets de la section sont ajustés.
- [x] **V1-059 · P0 · `code`** : Masquer les fenêtres d'outils inexistantes
  - **Constat** : 15 entrées sur 18 de « More Tool Windows » sont désactivées (Commit, Find, Debug, Git…). `web/src/app/layout/toolWindows.ts:39`
  - **Terminé quand** : Le menu ne liste que ce qui fonctionne. S'il reste trois fenêtres, il disparaît au profit des boutons.
  - **État** : le menu a disparu, les 3 fenêtres restent en boutons.
- [x] **V1-060 · P0 · `reproduit`** : Nettoyer le menu contextuel de l'explorateur
  - **Constat** : 9 entrées sur 13 sont grisées sur un nœud testé (Modify Virtual View, Quick Documentation, Compare, Diagrams…). `web/src/features/explorer/components/Explorer.tsx:403`
  - **Terminé quand** : Les entrées sans action sont retirées, chaque type de nœud a un menu court et utile.
- [x] **V1-061 · P0 · `code`** : Nettoyer le menu New de l'explorateur
  - **Constat** : 7 entrées inutilisables, dont Query File, Cloud Provider, Templates, Folder et Driver. `web/src/features/explorer/components/Explorer.tsx:382`
  - **Terminé quand** : Seules les entrées actives restent.
- [x] **V1-062 · P0 · `code`** : Nettoyer la barre d'outils de données
  - **Constat** : 11 boutons toujours grisés : historique, première et précédente page, ajout, suppression, annulation, envoi, recherche, import, vue, réglages. `web/src/features/query/components/ResultView.tsx:84`
  - **Terminé quand** : Chaque bouton est implémenté ou retiré, selon le périmètre.
- [x] **V1-063 · P0 · `code`** : Retirer le bouton AI Assistant
  - **Constat** : Bouton désactivé en permanence, avec la mention « not available yet ». `web/src/app/layout/MainToolbar.tsx:214`
  - **Terminé quand** : Retiré de la barre et des fenêtres d'outils.
- [x] **V1-064 · P0 · `code`** : Transaction : contrôles factices
  - **Constat** : « Tx: Auto » est un menu à choix unique, avec Commit et Rollback toujours grisés. Un `BEGIN` manuel laisse une transaction ouverte sans aucun signal. `web/src/app/layout/EditorArea.tsx:131`
  - **Terminé quand** : Mode manuel livré, ou contrôles retirés et indicateur « transaction ouverte » présent dans tous les cas.
  - **État** : contrôles retirés. L'indicateur repose sur la lecture des instructions (BEGIN, COMMIT…), pas sur l'état du serveur : un COMMIT dans une fonction lui échappe.
- [x] **V1-065 · P0 · `code`** : « Edit Data » ouvre une grille en lecture seule
  - **Constat** : Le libellé et F4 promettent une édition, or la grille est `readonly`. `web/src/features/explorer/components/Explorer.tsx:448`
  - **Terminé quand** : Édition livrée, ou renommage en « View Data » partout.
  - **État** : renommé « View Data », F4 actif dans l'arbre.
- [x] **V1-066 · P1 · `code`** : « Generate DDL to Query Console » n'écrit pas dans une console
  - **Constat** : L'action ouvre l'onglet DDL en lecture seule. `web/src/features/explorer/components/Explorer.tsx:460`
  - **Terminé quand** : Le DDL est inséré dans une console, ou l'entrée disparaît.
  - **État** : entrée retirée.
- [ ] **V1-067 · P1 · `reproduit`** : Barre d'état : indications inventées
  - **Constat** : `LF`, `UTF-8` et `4 spaces` sont du texte fixe, affiché même sans éditeur ouvert. Le cadenas dit toujours « Read-write ». `web/src/app/layout/StatusBar.tsx:63`
  - **Terminé quand** : Valeurs réelles du document actif, ou éléments retirés.
- [ ] **V1-068 · P2 · `code`** : Bouton View Options inactif dans Services
  - **Constat** : Grisé en permanence. `web/src/features/query/components/ServicesPanel.tsx:129`
  - **Terminé quand** : Retiré.
- [ ] **V1-069 · P1 · `décision`** : Vérifier la proximité avec DataGrip
  - **Constat** : Libellés, ordre des menus et noms de fenêtres sont repris délibérément. `docs/reverse-datagrip/tickets.md` interdit de recopier textes et icônes.
  - **Terminé quand** : Revue faite des textes et icônes visibles, écarts corrigés, et aucune ressource JetBrains dans le dépôt ni les bundles.

## E. Raccourcis clavier

- [x] **V1-070 · P0 · `code`** : Raccourcis Mac affichés sur Windows et Linux
  - **Constat** : `⌘`, `⇧` et `⌥` sont codés en dur dans tous les menus, infobulles et l'écran d'accueil, alors que le code accepte aussi Ctrl. `web/src/app/layout/EditorArea.tsx:203`
  - **Terminé quand** : Une fonction unique formate les raccourcis selon l'OS, utilisée partout.
  - **État** : formatage vérifié par appel direct ; rendu sur Windows et Linux non vu. Les textes hors de ce formatage restent à relire.
- [x] **V1-071 · P0 · `code`** : ⌘N promis par l'explorateur vide, mais inexistant
  - **Constat** : Le texte invite à utiliser ⌘N, aucun gestionnaire ne l'écoute. C'est le premier écran d'un nouvel utilisateur. `web/src/features/explorer/components/Explorer.tsx:671`
  - **Terminé quand** : Raccourci implémenté ou texte corrigé.
- [ ] **V1-072 · P1 · `code`** : ⌘R annoncé sans effet hors table
  - **Constat** : Annoncé sur Refresh de l'explorateur et Reload Page, seul `TableView` l'écoute. `web/src/features/query/components/ResultView.tsx:83`
  - **Terminé quand** : Fonctionne dans l'arbre et les résultats de console, ou indication retirée.
- [ ] **V1-073 · P1 · `code`** : ⌘F2 annoncé pour annuler, inexistant
  - **Constat** : Annoncé sur le bouton Stop, aucun gestionnaire. Annuler une requête longue au clavier est essentiel. `web/src/app/layout/EditorArea.tsx:182`
  - **Terminé quand** : Raccourci actif quel que soit le focus, documenté.
- [ ] **V1-074 · P1 · `code`** : F4, ⌘−, ⇧⌘F10, ⌥⇧⌘C affichés sans gestionnaire
  - **Constat** : Le code clavier de l'arbre ne couvre que flèches, Entrée, ⌘B, ⇧F6 et Suppr. `web/src/features/explorer/components/Explorer.tsx:497`
  - **Terminé quand** : Audit complet : chaque raccourci affiché fonctionne, les autres sont retirés.
- [x] **V1-075 · P1 · `code`** : « Jump to Query Console » : deux raccourcis, un sens incohérent
  - **Constat** : Barre : ⇧⌘L ; menu : ⇧⌘F10. Or ⇧⌘L crée une nouvelle console. `web/src/features/explorer/components/Explorer.tsx:474`
  - **Terminé quand** : Une action égale un raccourci, partout.
- [ ] **V1-076 · P1 · `audit`** : Claviers AZERTY : ⌘1, ⌘2, ⌘8
  - **Constat** : Le code teste `e.key === '1'`. Sur AZERTY, cette touche produit « & » sans Maj : à vérifier dans WKWebView et WebView2. `web/src/app/App.tsx:49`
  - **Terminé quand** : Testé sur AZERTY et QWERTY, `e.code` utilisé si nécessaire.
- [ ] **V1-077 · P1 · `audit`** : Rechargement natif de la WebView
  - **Constat** : En production, ⌘R, Ctrl+R et F5 hors table peuvent recharger la page et interrompre les sessions. Comportement à vérifier selon l'OS.
  - **Terminé quand** : Rechargement désactivé en production sur les trois OS.
- [x] **V1-078 · P1 · `code`** : ⌘W ne libère pas les résultats
  - **Constat** : `App` appelle `close` sans `dropTab`, contrairement au bouton X. Le tampon reste en mémoire. `web/src/app/App.tsx:55`
  - **Terminé quand** : Chemin de fermeture unique, mémoire libérée dans tous les cas.
- [ ] **V1-079 · P2 · `décision`** : Aide des raccourcis
  - **Constat** : Seul le README les liste.
  - **Terminé quand** : Écran ou commande de palette « Keyboard Shortcuts », généré depuis une table unique.

## F. Sécurité des données et de l'édition

Tickets à fort risque de perte de travail : à traiter tôt.

- [x] **V1-080 · P0 · `code`** : Fermer un onglet réécrit le fichier sans condition
  - **Constat** : Le nettoyage appelle `save()` même sans modification : une modification externe faite entre-temps est écrasée, et la date du fichier change. `web/src/features/editor/components/SqlEditor.tsx:244`
  - **Terminé quand** : Écriture uniquement si le contenu a changé depuis le dernier chargement ou enregistrement.
- [x] **V1-081 · P0 · `code`** : Le texte d'erreur peut remplacer le contenu d'un fichier
  - **Constat** : « Cannot open this file » est mis dans le modèle. Le modèle survit : à la réouverture, la lecture réussit mais le modèle non vide n'est pas remplacé, puis la fermeture l'écrit sur le disque. `web/src/features/editor/components/SqlEditor.tsx:124`
  - **Terminé quand** : Scénario couvert par un test, l'erreur s'affiche hors du modèle, et un fichier illisible n'est jamais écrit.
  - **État** : erreur sortie du modèle ; pas de test automatisé, faute de lanceur côté front.
- [x] **V1-082 · P0 · `code`** : Modèles Monaco jamais libérés
  - **Constat** : `getModel(uri) ?? createModel` sans `dispose` : contenu périmé à la réouverture, mémoire qui grossit, et une console supprimée retrouve son ancien texte si le nom est réutilisé. `web/src/features/editor/components/SqlEditor.tsx:108`
  - **Terminé quand** : Le modèle est libéré à la fermeture de l'onglet, et supprimer puis recréer une console donne un document vide.
- [x] **V1-083 · P0 · `code`** : Une console supprimée peut réapparaître
  - **Constat** : `close` déclenche une sauvegarde au démontage alors que `deleteConsole` part en parallèle, ce qui ouvre une course. La suppression d'une source a le même risque. `web/src/features/files/components/FilesPanel.tsx:130`
  - **Terminé quand** : Annuler la sauvegarde avant de supprimer, avec test de non-régression.
- [x] **V1-084 · P0 · `code`** : Échec de sauvegarde invisible
  - **Constat** : L'erreur ne va que dans Output, sans indicateur modifié ou enregistré sur l'onglet. `web/src/features/editor/components/SqlEditor.tsx:132`
  - **Terminé quand** : Point « non enregistré » sur l'onglet et erreur visible sans ouvrir Services.
  - **État** : bandeau avec Retry et point sur l'onglet ; chemin d'échec relu, non provoqué.
- [x] **V1-085 · P0 · `code`** : Détection des modifications externes absente
  - **Constat** : Un fichier modifié par git ou un autre éditeur n'est ni rechargé ni signalé, et la prochaine frappe l'écrase. `web/src/features/editor/components/SqlEditor.tsx:118`
  - **Terminé quand** : Le changement est détecté au retour de focus, avec rechargement si l'onglet est propre et choix sinon.
  - **État** : vérifiée au retour de focus et au changement d'onglet ; le mock ne permet pas de simuler une écriture externe, à tester dans l'app réelle.
- [ ] **V1-086 · P1 · `décision`** : Enregistrement automatique des fichiers du projet
  - **Constat** : Tout fichier ouvert (y compris `.env` ou du code) s'enregistre 400 ms après chaque frappe, sans confirmation. Acceptable pour une console, surprenant pour un fichier. `web/src/features/editor/components/SqlEditor.tsx:137`
  - **Terminé quand** : Politique décidée, écrite et testée pour les consoles et les fichiers.
- [ ] **V1-087 · P1 · `code`** : Dernières frappes perdues à la fermeture
  - **Constat** : Le délai de 400 ms n'est pas vidé à la fermeture de l'app ni aux rechargements (changement de projet). Aucun `beforeunload` ni `onCloseRequested` dans `web/src`. `web/src/features/projects/model/projects.ts:32`
  - **Terminé quand** : Sauvegarde forcée avant fermeture, redémarrage et changement de projet.
- [ ] **V1-088 · P1 · `code`** : L'écriture perd les permissions du fichier
  - **Constat** : Le temporaire est créé à neuf puis renommé : un script exécutable perd son mode. `with_extension` peut aussi faire entrer deux fichiers en collision. `crates/infrastructure/store/src/files.rs:71`
  - **Terminé quand** : Mode conservé, temporaire au nom unique, test unitaire ajouté.
- [x] **V1-089 · P0 · `code`** : Résultats d'un fichier .sql jamais affichés
  - **Constat** : `ServicesPanel` ne suit que les onglets `console`. Un fichier exécuté bascule vers « results » mais seul Output s'affiche. `web/src/features/query/components/ServicesPanel.tsx:36`
  - **Terminé quand** : Résultats visibles pour tout document SQL, testé sur l'app réelle.
- [x] **V1-090 · P0 · `code`** : Fichier .sql : pas de choix de source, pas de barre d'outils
  - **Constat** : Le fichier prend la source de l'onglet actif, figée à l'ouverture. Sans source, `run` sort en silence. `ConsoleToolbar` n'apparaît que pour une console. `web/src/features/files/components/FilesPanel.tsx:102`
  - **Terminé quand** : Barre commune avec sélecteur de source, Stop visible, message clair si aucune source.
- [x] **V1-091 · P1 · `code`** : Onglets de fichiers non SQL fermés au démarrage
  - **Constat** : Leur `connectionId` vaut `''`, absent de la liste : ils sont fermés à chaque lancement. `web/src/main.tsx:25`
  - **Terminé quand** : Tous les onglets valides sont restaurés, testé.
- [ ] **V1-092 · P1 · `code`** : Opérations de fichiers absentes
  - **Constat** : La fenêtre Files ne permet que d'ouvrir. Pas de création, renommage ni suppression de fichier ; pas de renommage de console.
  - **Terminé quand** : Opérations retenues pour la V1 livrées, sinon le reste est explicitement exclu.
- [ ] **V1-093 · P2 · `code`** : Barre d'état : position du curseur absente sur les fichiers
  - **Constat** : Affichée seulement pour `console`. `web/src/app/layout/StatusBar.tsx:57`
  - **Terminé quand** : Affichée pour tout document, valeur actualisée au changement d'onglet.

## G. Connexion et exécution

- [x] **V1-094 · P0 · `code`** : Connexion perdue : aucune reprise
  - **Constat** : Aucun code de reconnexion : `ensureConnected` renvoie vrai tant que l'état local dit `connected`, et le canal mort reste en cache. Après un redémarrage serveur ou une coupure réseau, tout échoue jusqu'à une déconnexion manuelle. `web/src/features/connections/model/connections.ts:64`
  - **Terminé quand** : La perte est détectée, l'état passe à déconnecté, et la prochaine action reconnecte en signalant que `SET` et transaction sont perdus.
  - **État** : détection à la prochaine action, pas en tâche de fond. Mapping PostgreSQL couvert par un test live ; ClickHouse non testé.
- [x] **V1-095 · P0 · `code`** : Échec de connexion invisible
  - **Constat** : `runSql` sort sans message si la connexion échoue, et l'arbre se replie seul. L'erreur va dans Output, qui peut être fermé. `web/src/features/query/model/runner.ts:38`
  - **Terminé quand** : L'échec s'affiche toujours (nœud d'erreur dans l'arbre, ouverture d'Output ou toast), avec une action Réessayer.
- [x] **V1-096 · P0 · `code`** : Erreur de requête invisible si Services est fermé
  - **Constat** : Services ne s'ouvre qu'à l'arrivée de colonnes. Une erreur SQL laisse un marqueur dans l'éditeur, mais une requête `UPDATE` réussie ou une erreur sans position ne montre rien. `web/src/features/query/model/runner.ts:76`
  - **Terminé quand** : Toute exécution d'une console ouvre Output ou les résultats.
- [x] **V1-097 · P0 · `reproduit`** : Grille de résultats presque invisible par défaut
  - **Constat** : Services prend 24 % de la hauteur : 2 lignes visibles à 1280×800, et l'en-tête seul à 960×600 (mesuré). L'explorateur prend 42 % de la largeur. `web/src/app/App.tsx:107`
  - **Terminé quand** : Disposition par défaut revue, au moins 10 lignes visibles à 1280×800, agrandissement rapide du panneau.
  - **État** : 10 lignes visibles à 1280×800, bouton Maximize ajouté.
- [ ] **V1-098 · P1 · `reproduit`** : Barre de résultats : débordement à la largeur minimale
  - **Constat** : « 10 ms » passe sur deux lignes et les boutons se compriment à 960 px. `web/src/features/query/components/ResultView.tsx:128`
  - **Terminé quand** : Aucun retour à la ligne : éléments secondaires repliés dans un menu.
- [x] **V1-099 · P0 · `code`** : « Last Page » charge jusqu'à 10 millions de lignes
  - **Constat** : Sans confirmation ni limite mémoire : toutes les lignes vont dans le tampon JS. Le défilement automatique suit le même chemin, sans plafond. `web/src/features/query/model/runner.ts:153`
  - **Terminé quand** : Plafond ou avertissement avec Stop efficace, comportement mesuré sur une table de 50 M de lignes.
  - **État** : plafond de 1 000 000 de lignes et confirmation. Mesure sur 50 M de lignes non faite.
- [ ] **V1-100 · P1 · `code`** : Requête lancée pendant une autre : ignorée sans message
  - **Constat** : `if (running) return` dans le runner, alors que l'action du clavier reste disponible. `web/src/features/query/model/runner.ts:41`
  - **Terminé quand** : Un message indique pourquoi, ou un choix est proposé (attendre ou annuler).
- [ ] **V1-101 · P1 · `code`** : Erreur après des lignes partielles masquée
  - **Constat** : Le bandeau n'apparaît que si `rows === 0` : avec des lignes déjà reçues, le résultat semble complet. `web/src/features/query/components/ResultView.tsx:194`
  - **Terminé quand** : Bandeau d'erreur affiché au-dessus des lignes partielles.
- [ ] **V1-102 · P1 · `code`** : Résultat annulé indiscernable
  - **Constat** : Le statut `cancelled` n'a aucun rendu : la barre montre des lignes et 0 ms. `web/src/features/query/components/ResultView.tsx:136`
  - **Terminé quand** : Mention « Cancelled » et durée réelle.
- [ ] **V1-103 · P1 · `code`** : Pagination arrêtée en silence après rename ou drop
  - **Constat** : `releaseOpenResults` met `hasMore` à faux : un résultat coupé à 500 lignes paraît complet. `web/src/features/query/model/runner.ts:218`
  - **Terminé quand** : Le résultat est marqué incomplet, avec une action Recharger.
- [ ] **V1-104 · P1 · `audit`** : Script multi-instructions : pagination des premiers résultats
  - **Constat** : Un canal ne garde qu'un résultat ouvert. Les premiers résultats gardent `hasMore` alors que leur jeton est invalidé. `crates/application/src/query/mod.rs:49`
  - **Terminé quand** : Testé sur PG et CH, avec un état clair sur les résultats non paginables.
- [ ] **V1-105 · P1 · `code`** : Pas de durée en direct
  - **Constat** : Seule une icône tourne pendant une requête longue. `web/src/features/query/components/ResultView.tsx:131`
  - **Terminé quand** : Compteur de durée et de lignes reçues, sans dégrader le chemin de fetch.
- [ ] **V1-106 · P1 · `audit`** : Annulation : matrice complète
  - **Constat** : Tests live pour PG seulement. Manquent : annulation pendant la connexion, le fetch, un script, sur réseau coupé, et `KILL QUERY` en ClickHouse.
  - **Terminé quand** : Matrice exécutée sur les deux moteurs, Stop rend la main en moins de 2 s ou l'explique.
- [ ] **V1-107 · P1 · `audit`** : Découpage SQL en conditions réelles
  - **Constat** : 254 lignes testées unitairement. À vérifier sur dollar-quoting, `COPY`, commentaires imbriqués, `BEGIN…END`, syntaxe CH. `crates/domain/src/query/split.rs:29`
  - **Terminé quand** : Corpus de scripts réels ajouté aux tests.
- [ ] **V1-108 · P1 · `audit`** : Position d'erreur avec caractères multi-octets
  - **Constat** : PG envoie une position en caractères, Monaco attend de l'UTF-16 : un emoji avant l'erreur peut décaler le marqueur. `web/src/features/query/model/runner.ts:114`
  - **Terminé quand** : Test avec accents et emojis, marqueur au bon endroit.
- [ ] **V1-109 · P1 · `audit`** : Complétion SQL
  - **Constat** : Audit à faire sur alias, schémas multiples, identifiants entre guillemets, ClickHouse, et rafraîchissement après DDL. `web/src/features/editor/lib/completion.ts:15`
  - **Terminé quand** : Liste de cas écrite et validée sur les deux moteurs, frappe sans latence perceptible.
- [ ] **V1-110 · P1 · `code`** : Sélecteur de schéma muet et incomplet
  - **Constat** : Avant l'instantané, le clic ne fait rien. Un schéma sans table n'apparaît pas. `web/src/app/layout/EditorArea.tsx:140`
  - **Terminé quand** : La liste vient du catalogue, avec état de chargement. Choix restauré après reconnexion.
- [ ] **V1-111 · P2 · `code`** : Output global, pas par session
  - **Constat** : Une seule liste pour toutes les consoles : le panneau donne pourtant l'impression d'un journal par session. `web/src/shared/model/output.ts:14`
  - **Terminé quand** : Filtrage par session ou choix explicite de journal global, copie d'une ligne possible.
- [ ] **V1-112 · P2 · `code`** : Services : arbre vide sans explication
  - **Constat** : Seul un dossier « Database » s'affiche (reproduit au démarrage). `web/src/features/query/components/ServicesPanel.tsx:149`
  - **Terminé quand** : État vide utile, avec lien vers une nouvelle console.

## H. Grille, table et export

- [x] **V1-113 · P0 · `code`** : Export limité au presse-papiers
  - **Constat** : L'icône Download copie dans le presse-papiers, sans retour visuel ni gestion d'erreur. Pas de fichier, et `dialog:allow-save` n'est pas déclaré. `web/src/features/query/components/ResultView.tsx:78`
  - **Terminé quand** : Export vers fichier avec boîte native, plus copie distincte avec confirmation visible.
  - **État** : boîte native côté Rust ; essayée seulement via le téléchargement du mock.
- [x] **V1-114 · P0 · `code`** : Export partiel sans avertissement
  - **Constat** : Seules les lignes chargées partent, et les filtres de profil sont ignorés : l'export ne correspond pas à l'écran. `web/src/features/query/components/ResultView.tsx:79`
  - **Terminé quand** : Choix explicite (lignes visibles ou tout le résultat côté serveur), avec nombre annoncé.
- [ ] **V1-115 · P1 · `code`** : Export SQL INSERT invalide
  - **Constat** : Noms de colonnes non quotés, et le titre (« Result 1 ») sert de nom de table. `web/src/features/query/lib/export.ts:28`
  - **Terminé quand** : Identifiants quotés selon le moteur, SQL réimportable testé sur PG et CH.
- [ ] **V1-116 · P1 · `code`** : Export JSON et CSV : types et cas limites
  - **Constat** : JSON met tout en chaîne. CSV et TSV ne distinguent pas NULL de la chaîne vide, et TSV écrase les tabulations. Formules CSV non neutralisées. `web/src/features/query/lib/export.ts:5`
  - **Terminé quand** : Comportement documenté et testé unitairement, avec option de représentation de NULL.
- [ ] **V1-117 · P1 · `audit`** : Copie depuis la grille
  - **Constat** : `getCellsForSelection` est actif et NULL se copie en vide. Formats multi-cellules, en-têtes et grandes sélections à vérifier sur chaque WebView. `web/src/features/query/components/ResultGrid.tsx:101`
  - **Terminé quand** : ⌘C vérifié sur les 3 OS, avec une option copie avec en-têtes.
- [ ] **V1-118 · P1 · `code`** : Lecture d'une valeur longue
  - **Constat** : L'affichage coupe à 500 caractères, et l'overlay Glide est le seul moyen de lire JSON ou texte long. `web/src/features/query/components/ResultGrid.tsx:111`
  - **Terminé quand** : Visionneuse de valeur avec défilement, copie et mise en forme JSON.
- [ ] **V1-119 · P1 · `audit`** : Rendu par type de colonne
  - **Constat** : À vérifier avec une table de référence : bool, numeric, dates, fuseaux, JSONB, tableaux, bytea, UUID, Unicode, multi-lignes. ClickHouse : Nullable, Array, Map, Tuple, échappements TSV et `\N`. `crates/infrastructure/clickhouse/src/tsv.rs:78`
  - **Terminé quand** : Fixture ajoutée aux tests live, alignement et NULL corrects partout.
- [ ] **V1-120 · P1 · `décision`** : Table : chargement manuel à l'ouverture
  - **Constat** : Ouvrir une table affiche « Load Data » : le geste principal demande un clic ou un ⌘R de plus. `web/src/features/query/components/TableView.tsx:112`
  - **Terminé quand** : Chargement automatique à la première ouverture, ou choix justifié.
- [ ] **V1-121 · P1 · `audit`** : Table : filtres WHERE et ORDER BY
  - **Constat** : Erreurs, annulation, conservation au rechargement, tri par en-tête combiné à un ORDER BY saisi, identifiants à casse mixte. `web/src/features/query/components/TableView.tsx:29`
  - **Terminé quand** : Parcours testés sur PG et CH.
- [ ] **V1-122 · P2 · `code`** : Tri et largeurs dans les résultats
  - **Constat** : Pas de tri en console (`onHeaderClick` absent). Les largeurs se perdent au rechargement. `web/src/features/query/components/ResultGrid.tsx:75`
  - **Terminé quand** : Choix fait pour le tri, largeurs conservées tant que les colonnes ne changent pas.
- [ ] **V1-123 · P1 · `audit`** : Panneau de profil
  - **Constat** : 362 + 479 lignes sans test. À vérifier : coût des requêtes serveur sur grosse table, annulation, filtres, ClickHouse, petite largeur. `web/src/features/query/components/ProfilePanel.tsx:63`
  - **Terminé quand** : Tests unitaires de `lib/profile.ts`, aucune requête lourde sans action explicite.
- [ ] **V1-124 · P2 · `reproduit`** : Taille de page : libellé obscur
  - **Constat** : « 500 rows » dans la barre d'état n'est compris que par son infobulle. `web/src/app/layout/StatusBar.tsx:68`
  - **Terminé quand** : Libellé clair, ou réglage déplacé dans la barre de résultats.

## I. Explorateur

- [ ] **V1-125 · P1 · `reproduit`** : Arbre sans sémantique d'accessibilité
  - **Constat** : `role` absent sur l'arbre (mesuré), pas de `treeitem` ni `aria-expanded`. Le triangle est un `span` cliquable. `web/src/features/explorer/components/Explorer.tsx:663`
  - **Terminé quand** : Motif `tree` complet, testé à VoiceOver, y compris avec la virtualisation.
- [ ] **V1-126 · P1 · `audit`** : Couverture des objets PostgreSQL et ClickHouse
  - **Constat** : À comparer au besoin réel : séquences, types, index, déclencheurs, partitions, extensions, rôles ; dictionnaires et vues matérialisées en CH. `crates/infrastructure/postgres/src/meta.rs:16`
  - **Terminé quand** : Tableau de couverture écrit, DDL correct sur chaque type retenu.
- [ ] **V1-127 · P1 · `audit`** : Matrice Rename et Drop en base réelle
  - **Constat** : `objectActions.ts` n'a aucun test. À vérifier par moteur et type, avec noms quotés, fonctions surchargées et objets dépendants. `web/src/features/explorer/lib/objectActions.ts:79`
  - **Terminé quand** : Tests unitaires du SQL, parcours live validé pour chaque case.
- [ ] **V1-128 · P1 · `audit`** : Performances sur gros catalogue
  - **Constat** : Virtualisé, mais `useRows` recalcule tout, et `parentOf` balaie les lignes. Non mesuré avec 10 000 tables ou 500 schémas. `web/src/features/explorer/components/Explorer.tsx:232`
  - **Terminé quand** : Mesures sur catalogue synthétique : ouverture, défilement et filtre fluides.
- [ ] **V1-129 · P2 · `code`** : « Expand Selected » replie aussi
  - **Constat** : Le bouton appelle `toggle`. `web/src/features/explorer/components/Explorer.tsx:569`
  - **Terminé quand** : Libellé ou comportement aligné.
- [ ] **V1-130 · P2 · `code`** : Filtre : portée peu claire
  - **Constat** : Seuls les nœuds déjà chargés sont filtrés, ce qui n'est dit qu'en cas d'absence de résultat. Eye et « Show Filter » font doublon. `web/src/features/explorer/components/Explorer.tsx:677`
  - **Terminé quand** : Placeholder explicite, un seul point d'entrée.
- [ ] **V1-131 · P2 · `code`** : État de l'arbre non restauré
  - **Constat** : Sélection et nœuds ouverts sont perdus au redémarrage et au changement de projet.
  - **Terminé quand** : Restauration par projet sans reconnexion automatique non voulue.
- [ ] **V1-132 · P1 · `décision`** : Couleur de source : garde-fou production
  - **Constat** : La couleur n'est qu'un petit point sur l'onglet : faible protection contre une erreur en production. `web/src/app/layout/EditorArea.tsx:87`
  - **Terminé quand** : Décision prise : bandeau coloré, source en lecture seule, ou les deux.

## J. Projets et OS

- [x] **V1-133 · P0 · `code`** : Chemins Windows cassés dans Files
  - **Constat** : Seules les clés contenant `/` sont listées : sur `C:\…` le dossier reste vide. Le nom de projet, les titres d'onglet et le fil d'Ariane découpent aussi sur `/`. `web/src/features/files/components/FilesPanel.tsx:89`
  - **Terminé quand** : Gestion des chemins centralisée et testée, parcours complet validé sur Windows.
  - **État** : fonctions vérifiées avec des chemins Windows ; jamais exécuté sur Windows.
- [ ] **V1-134 · P1 · `code`** : Raccourci de chemin : macOS seulement
  - **Constat** : `~` n'est calculé que pour `/Users/…`. `web/src/features/projects/model/projects.ts:75`
  - **Terminé quand** : Le dossier personnel vient de l'OS.
- [ ] **V1-135 · P1 · `code`** : Changement de projet sans précaution
  - **Constat** : Rechargement immédiat alors que des requêtes peuvent tourner. `web/src/features/projects/model/projects.ts:31`
  - **Terminé quand** : Avertissement si une requête tourne, sauvegarde préalable, état cohérent en cas d'échec.
- [ ] **V1-136 · P1 · `audit`** : Dossier de projet supprimé ou déplacé
  - **Constat** : Non testé : projet ouvert au démarrage, liste, branche git, onglets de fichiers. `crates/application/src/files.rs:24`
  - **Terminé quand** : Message clair et action Relocaliser ou Retirer.
- [ ] **V1-137 · P1 · `audit`** : Premier lancement réel
  - **Constat** : Le mock arrive avec des données de démo : le parcours d'un profil vide n'a jamais été vu dans ces tests. Projet par défaut nommé « datowl ». `crates/infrastructure/store/src/projects.rs:38`
  - **Terminé quand** : Parcours filmé depuis un profil vide jusqu'à la première requête, en moins de 2 minutes, sans documentation.
- [ ] **V1-138 · P2 · `audit`** : Mise à jour des données entre versions
  - **Constat** : Pas de numéro de version dans `connections.json` et `projects.json`. Anciennes clés `datavio` encore gérées. `crates/infrastructure/store/src/lib.rs:32`
  - **Terminé quand** : Champ de version ajouté, test de reprise des données d'une version 0.1.

## K. Robustesse de l'application

- [x] **V1-139 · P0 · `code`** : Fichier de configuration corrompu : l'app ne démarre plus
  - **Constat** : `Projects::open` et `Store::open` propagent l'erreur JSON jusqu'à `setup`, puis `expect` : plantage sans message. `apps/desktop/src-tauri/src/lib.rs:66`
  - **Terminé quand** : Dialogue natif, sauvegarde du fichier fautif, redémarrage possible, aucune perte silencieuse.
  - **État** : testé avec le vrai binaire : démarrage, fichier mis de côté. Le dialogue n'a pas été vu (accès à l'app refusé).
- [x] **V1-140 · P0 · `code`** : Pas de barrière d'erreur React
  - **Constat** : Aucun `ErrorBoundary` dans `web/src` : une exception de rendu donne un écran vide. `web/src/main.tsx:28`
  - **Terminé quand** : Écran de reprise avec détail copiable et bouton Recharger, sauvegarde préservée.
  - **État** : barrière en place ; écran non déclenché en test.
- [x] **V1-141 · P0 · `code`** : Trousseau indisponible : source impossible à enregistrer
  - **Constat** : Sur Linux sans service de secrets ou trousseau verrouillé, `save_connection` échoue avant d'écrire la configuration. `crates/infrastructure/store/src/lib.rs:86`
  - **Terminé quand** : Message exploitable, enregistrement sans mot de passe possible, testé sur Linux minimal.
  - **État** : non testé sur un Linux sans service de secrets.
- [ ] **V1-142 · P1 · `code`** : Échecs au chargement masqués
  - **Constat** : `load().catch(() => {})` au démarrage : un backend en panne ressemble à un compte vide. `web/src/main.tsx:21`
  - **Terminé quand** : L'échec s'affiche à l'écran.
- [ ] **V1-143 · P1 · `code`** : Suppression de source non atomique
  - **Constat** : La configuration est écrite d'abord : si le trousseau échoue ensuite, l'erreur remonte alors que la source a disparu du disque. `crates/infrastructure/store/src/lib.rs:102`
  - **Terminé quand** : Ordre et tolérance revus, avec un test sur échec partiel.
- [ ] **V1-144 · P1 · `code`** : Plusieurs instances de l'app
  - **Constat** : Aucun plugin d'instance unique : deux processus réécrivent les mêmes JSON, le dernier gagne. `apps/desktop/src-tauri/Cargo.toml:36`
  - **Terminé quand** : Instance unique avec mise au premier plan, ou écriture sûre testée.
- [ ] **V1-145 · P1 · `code`** : Pas de fichier de logs
  - **Constat** : `tracing` écrit sur la sortie standard, invisible pour une app installée. `apps/desktop/src-tauri/src/lib.rs:19`
  - **Terminé quand** : Fichier tournant, ouvrable depuis l'app, sans secret ni SQL par défaut.
- [ ] **V1-146 · P1 · `code`** : Taille et état de la fenêtre non restaurés
  - **Constat** : Taille et position fixes à chaque lancement. Explorer, Services et Files ne sont pas persistés, seules les proportions le sont. `web/src/shared/model/ui.ts:126`
  - **Terminé quand** : Fenêtre et visibilité des panneaux restaurées, y compris en cas d'écran débranché.
- [ ] **V1-147 · P1 · `audit`** : Fermeture de l'app en cours de requête
  - **Constat** : Comportement non testé : requêtes en cours, transaction ouverte, résultats paginés.
  - **Terminé quand** : Fermeture propre côté serveur (vérifiée dans `pg_stat_activity`), avertissement si une requête tourne.
- [ ] **V1-148 · P1 · `audit`** : Stabilité longue durée
  - **Constat** : Non mesuré : ouvrir et fermer 200 onglets, 100 exécutions de gros résultats, 8 heures d'inactivité avec connexion ouverte.
  - **Terminé quand** : Mémoire stable, app réactive, reconnexion correcte après veille de l'ordinateur.
- [ ] **V1-149 · P2 · `décision`** : Politique de confidentialité produit
  - **Constat** : Aucune télémétrie trouvée. La seule sortie réseau hors bases est la vérification de mise à jour. `web/src/features/updates/model/updates.ts:76`
  - **Terminé quand** : Comportement écrit dans la documentation et réglage pour couper les vérifications.

## L. Sécurité

- [x] **V1-150 · P0 · `code`** : CSP désactivée
  - **Constat** : `csp: null` alors que l'app affiche des données de bases tierces et expose `write_file` et `execute` par IPC. Une injection HTML deviendrait dangereuse. `apps/desktop/src-tauri/tauri.conf.json:28`
  - **Terminé quand** : CSP stricte compatible Monaco et workers, testée en build de production sur les 3 OS.
  - **État** : testée sur le build de production dans le navigateur, sans violation. À revoir dans WebKit (Tauri) sur les 3 OS.
- [ ] **V1-151 · P1 · `audit`** : Rendu de données non fiables
  - **Constat** : Valeurs, noms d'objets et messages serveur passent dans la grille, les menus et les infobulles. Vérifier qu'aucune chaîne hostile n'est interprétée.
  - **Terminé quand** : Tests avec charges XSS dans tables, colonnes, erreurs et fichiers.
- [ ] **V1-152 · P1 · `audit`** : Bac à sable des fichiers
  - **Constat** : Un seul test unitaire (`..`). Non couvert : liens symboliques vers l'extérieur, chemin réseau, changement de projet pendant une écriture. `crates/infrastructure/store/src/files.rs:102`
  - **Terminé quand** : Tests ajoutés, comportement des liens symboliques décidé.
- [ ] **V1-153 · P1 · `audit`** : Secrets dans les logs et l'interface
  - **Constat** : À vérifier : URL avec mot de passe, Output, erreurs de pilote, journal Tauri, sauvegardes de configuration. `web/src/features/connections/lib/connectionUrl.ts:39`
  - **Terminé quand** : Recherche d'un mot de passe témoin dans tous les journaux et fichiers : aucun résultat.
- [ ] **V1-154 · P1 · `audit`** : Matrice TLS
  - **Constat** : PG : test de rejet d'un certificat non fiable. ClickHouse : aucun test. `Prefer` en CH reste en HTTP, sans signal. `crates/infrastructure/postgres/tests/live.rs:206`
  - **Terminé quand** : Tous les modes testés contre un serveur réel, chaque libellé décrit le comportement réel.
- [ ] **V1-155 · P1 · `décision`** : Certificat CA et certificat client
  - **Constat** : `verify-ca` et `verify-full` ne s'appuient que sur le magasin système : une CA privée ou un certificat client n'est pas utilisable.
  - **Terminé quand** : Champs CA et client livrés, ou limite documentée dans le dialogue.
- [ ] **V1-156 · P1 · `décision`** : Tunnel SSH
  - **Constat** : Absent, marqué P0 dans la parité. Sans lui, une grande partie des bases de production sont inaccessibles.
  - **Terminé quand** : Livré en V1, ou exclusion assumée et documentée.
- [ ] **V1-157 · P1 · `audit`** : Vulnérabilités et dépendances
  - **Constat** : `npm audit` : 6 modérées, toutes via glide-data-grid et linaria. `cargo audit` : 5 alertes, dont `glib` (non-fiabilité) et des crates non maintenues.
  - **Terminé quand** : Chaque alerte est corrigée ou justifiée par écrit, audit lancé en CI.
- [ ] **V1-158 · P1 · `code`** : Permissions Tauri à revoir
  - **Constat** : `core:default` est large, et `process:allow-restart` n'est utile qu'à la mise à jour. `apps/desktop/src-tauri/capabilities/default.json:9`
  - **Terminé quand** : Liste minimale justifiée ligne par ligne.

## M. Interface et cohérence visuelle

- [x] **V1-159 · P0 · `code`** : Aucun indicateur de focus clavier
  - **Constat** : `:focus-visible` n'apparaît pas dans `app.css`. Seuls quelques champs ont un style `:focus`. `web/src/app/styles/app.css:2104`
  - **Terminé quand** : Anneau de focus visible sur tous les éléments interactifs, parcours complet au clavier.
- [ ] **V1-160 · P1 · `reproduit`** : Contraste insuffisant du texte secondaire
  - **Constat** : `rgba(235,231,226,.36)` mesuré sur barre d'état, détails de l'arbre et source d'onglet, en 11-12 px. Le ratio estimé est sous 4,5:1. `web/src/features/explorer/components/Explorer.tsx:726`
  - **Terminé quand** : Ratios mesurés sur le fond réel, AA pour le texte utile.
- [ ] **V1-161 · P1 · `code`** : Textes très petits et pas de zoom
  - **Constat** : 28 règles CSS à 12 px ou moins, aucune commande de zoom. `web/src/features/editor/components/SqlEditor.tsx:38`
  - **Terminé quand** : Zoom interface et taille d'éditeur réglables, sans casser la mise en page.
- [ ] **V1-162 · P2 · `code`** : Mouvement réduit non respecté
  - **Constat** : `prefers-reduced-motion` absent de `app.css`.
  - **Terminé quand** : Animations et clignotement coupés si demandé.
- [ ] **V1-163 · P1 · `audit`** : Rendu par plateforme
  - **Constat** : Seul macOS a la fenêtre translucide. Le fond, la lisibilité et la barre de titre sur Windows et Linux n'ont pas été vus dans ces tests. `web/src/main.tsx:17`
  - **Terminé quand** : Captures validées sur les 3 OS, y compris contraste avec un fond d'écran clair.
- [ ] **V1-164 · P1 · `audit`** : Barre supérieure et feux tricolores macOS
  - **Constat** : Barre de titre `Overlay`, position fixe. À vérifier : chevauchement, double-clic pour agrandir, glisser, plein écran. `apps/desktop/src-tauri/tauri.macos.conf.json:16`
  - **Terminé quand** : Comportement natif sur macOS, barre correcte sur Windows et Linux.
- [ ] **V1-165 · P1 · `audit`** : Matrice des états de tous les boutons
  - **Constat** : Survol, actif, désactivé, sélectionné et focus sur `IconButton`, `btn`, `text-btn`, `tool-select` et `widget`. Infobulle des boutons désactivés à vérifier. `web/src/shared/ui/IconButton.tsx:13`
  - **Terminé quand** : Page ou capture de référence, écarts corrigés.
- [ ] **V1-166 · P1 · `audit`** : Inventaire des états vides
  - **Constat** : Déjà vus : arbre sans source, éditeur vide, Services vide. À passer en revue : Files sans dossier, palette, résultat de 0 ligne, 0 colonne.
  - **Terminé quand** : Chaque état a un texte utile et, si possible, une action.
- [ ] **V1-167 · P1 · `audit`** : Inventaire des états de chargement
  - **Constat** : Mélange de spinner, `-- loading…` et « Loading… » selon les endroits. `web/src/features/editor/components/DdlView.tsx:17`
  - **Terminé quand** : Un seul langage visuel, pas de saut de mise en page, pas de spinner pour moins de 200 ms.
- [ ] **V1-168 · P1 · `audit`** : Noms longs et troncature
  - **Constat** : À tester avec des noms de 120 caractères et de l'Unicode : onglets, fil d'Ariane, arbre, source, résultats, Sessions. `web/src/app/layout/EditorArea.tsx:86`
  - **Terminé quand** : Troncature et infobulle partout, sans casser la barre d'état.
- [ ] **V1-169 · P1 · `code`** : Nombreux onglets
  - **Constat** : La barre défile à la molette, sans amener l'onglet actif en vue. Pas de réordonnancement. `web/src/app/layout/EditorArea.tsx:69`
  - **Terminé quand** : Onglet actif toujours visible, testé avec 40 onglets.
- [ ] **V1-170 · P1 · `audit`** : Panneaux : redimensionnement et repli
  - **Constat** : À tester : tout replier, tailles minimales, restauration après repli, épinglage d'aucun outil, largeur minimale de 960 px. `web/src/app/App.tsx:68`
  - **Terminé quand** : Aucun état sans issue, bouton de réinitialisation de la disposition.
- [ ] **V1-171 · P2 · `code`** : Typographie des libellés
  - **Constat** : « New console » et « New Query Console », « Toggle explorer » et « Database Explorer » cohabitent. `web/src/app/layout/CommandPalette.tsx:60`
  - **Terminé quand** : Règle de casse et glossaire appliqués à tous les textes.
- [ ] **V1-172 · P2 · `code`** : Messages d'erreur techniques
  - **Constat** : « I/O error », « Keychain error » et « Corrupted data sources file » remontent tels quels. `crates/infrastructure/store/src/lib.rs:40`
  - **Terminé quand** : Messages reformulés avec la cause et l'action possible, détail technique disponible.
- [ ] **V1-173 · P2 · `audit`** : CSS inutilisé
  - **Constat** : 2 542 lignes dans un seul fichier, jamais auditées. `web/src/app/styles/app.css:1672`
  - **Terminé quand** : Règles mortes retirées, tokens de couleur et de rayon utilisés partout.
- [ ] **V1-174 · P2 · `décision`** : Thème clair
  - **Constat** : L'app n'a qu'un thème sombre.
  - **Terminé quand** : Décision écrite. S'il est livré, grille et Monaco suivent le thème.
- [ ] **V1-175 · P2 · `code`** : Finaliser le nouveau logo
  - **Constat** : Icônes, logo et `MainToolbar` sont modifiés mais non commités sur la branche courante.
  - **Terminé quand** : Changement relu et commité, icônes correctes à toutes les tailles sur les 3 OS.

## N. Écrans manquants

- [ ] **V1-176 · P1 · `décision`** : Écran de réglages
  - **Constat** : Settings n'est qu'un menu avec 3 entrées. Pas de `⌘,`. `web/src/app/layout/MainToolbar.tsx:124`
  - **Terminé quand** : Réglages minimaux retenus : taille de police, taille de page, mises à jour.
- [ ] **V1-177 · P1 · `code`** : Fenêtre À propos
  - **Constat** : La version n'est qu'une ligne grisée. Rien sur les licences tierces (Monaco, Glide, polices). `web/src/app/layout/MainToolbar.tsx:130`
  - **Terminé quand** : Version copiable, licences affichées, lien vers les logs.
- [ ] **V1-178 · P1 · `audit`** : Menu natif de l'application
  - **Constat** : Aucun menu personnalisé dans `lib.rs` : le menu par défaut de Tauri ne propose ni Réglages, ni Aide. Copier-coller à vérifier sur chaque OS.
  - **Terminé quand** : Menu complet sur macOS, comportement défini sur Windows et Linux.
- [ ] **V1-179 · P1 · `décision`** : Historique des requêtes
  - **Constat** : Bouton présent mais grisé, marqué P0 ou P1 dans la parité.
  - **Terminé quand** : Livré en V1 (par console, recherchable) ou bouton retiré.
- [ ] **V1-180 · P1 · `décision`** : Édition de données
  - **Constat** : Boutons Add, Delete, Revert et Submit présents mais inactifs. C'est une attente de base pour un outil de ce type.
  - **Terminé quand** : Décision écrite. Si elle est incluse : aperçu du DML, Submit et Revert, tests sur PG et CH.
- [ ] **V1-181 · P1 · `décision`** : Source en lecture seule
  - **Constat** : Marquée P0 dans la parité. Le cadenas de la barre d'état suggère cette fonction, qui n'existe pas.
  - **Terminé quand** : Livrée, ou cadenas retiré.
- [ ] **V1-182 · P2 · `décision`** : Documentation utilisateur intégrée
  - **Constat** : Aucun lien d'aide dans l'app.
  - **Terminé quand** : Guide court (connexion, exécution, raccourcis, données stockées) accessible depuis l'app.

## O. Qualité et CI

- [x] **V1-183 · P0 · `code`** : Aucune CI sur les pull requests
  - **Constat** : Le seul workflow est `release.yml`. Tests, typecheck et warnings ne sont vérifiés nulle part automatiquement. `.github/workflows/release.yml:3`
  - **Terminé quand** : Workflow sur push et PR : `cargo test`, `cargo check` sans warning, typecheck, règles d'import, sur les 3 OS.
  - **État** : workflow écrit, jamais exécuté sur GitHub.
- [x] **V1-184 · P0 · `code`** : La release ne lance aucun test
  - **Constat** : Le tag construit et publie directement. Une régression part chez tous les utilisateurs par mise à jour automatique. `scripts/release.sh:42`
  - **Terminé quand** : Publication bloquée par les tests, avec étape de vérification manuelle du draft.
  - **État** : CI requise avant le draft. Environnement `release` à protéger par des relecteurs dans GitHub.
- [ ] **V1-185 · P1 · `code`** : Zéro test côté front
  - **Constat** : Aucun `*.test.*` et pas de lanceur de tests dans `web/package.json`. Les fonctions pures sont les plus simples à couvrir.
  - **Terminé quand** : Tests pour `connectionUrl`, `export`, `objectActions`, `sql`, `profile`, `datagrip`, `updates`.
- [ ] **V1-186 · P1 · `décision`** : Tests de bout en bout de chaque modal
  - **Constat** : Le mock permet de piloter l'UI sans Rust, comme fait pour ce backlog. Dépendance de développement à justifier (règle AGENTS.md).
  - **Terminé quand** : Un scénario par modal : ouverture, clavier, validation, annulation.
- [ ] **V1-187 · P1 · `code`** : Pas de tests live ClickHouse
  - **Constat** : `tests/live.rs` n'existe que pour Postgres. Le moteur est pourtant au même niveau de support. `crates/infrastructure/postgres/tests/live.rs:65`
  - **Terminé quand** : Suite équivalente pour ClickHouse : pagination, session, annulation, erreurs, explorateur.
- [ ] **V1-188 · P1 · `audit`** : Matrice de versions de serveurs
  - **Constat** : Tests sur PG 16 uniquement. Requêtes de catalogue potentiellement sensibles à la version.
  - **Terminé quand** : PG 13 à 17 et deux versions ClickHouse exécutées en CI, versions supportées publiées.
- [ ] **V1-189 · P1 · `audit`** : Compatibilité avec les services managés
  - **Constat** : Non testé : PgBouncer (curseurs en mode transaction), RDS, Neon, Supabase, ClickHouse Cloud, droits limités sur le catalogue.
  - **Terminé quand** : Résultats écrits, limites annoncées dans un message clair à l'utilisateur.
- [ ] **V1-190 · P1 · `code`** : Aucun lint configuré
  - **Constat** : Le code contient `eslint-disable`, mais `web/package.json` n'a pas ESLint. `web/src/features/connections/components/DataSourcesDialog.tsx:96`
  - **Terminé quand** : Lint et règle de hooks actifs en CI, ou commentaires retirés.
- [ ] **V1-191 · P1 · `audit`** : Parité du mock
  - **Constat** : `shared/api/mock.ts` doit rester fonctionnel (AGENTS.md). Il n'est pas vérifié qu'il couvre fichiers, erreurs et projets. `web/src/shared/api/mock.ts:364`
  - **Terminé quand** : Mode démo sur chaque flux, avec scénarios d'erreur activables.
- [ ] **V1-192 · P1 · `audit`** : Performances avant V1
  - **Constat** : Benchmarks présents dans `docs/benchmarks`, à refaire sur le build candidat. Règle d'AGENTS.md : ne pas dégrader le chemin de fetch sans mesure.
  - **Terminé quand** : Mesures de démarrage, fetch, frappe et mémoire comparées, écarts expliqués.
- [ ] **V1-193 · P2 · `code`** : Bundle Monaco de 3,3 Mo
  - **Constat** : 843 Ko compressés, mesuré au build. Son effet sur le temps d'ouverture reste à mesurer. `web/vite.config.ts:26`
  - **Terminé quand** : Mesure faite, chargement différé si le gain est réel.

## P. Installation et mise à jour de l'app

Vérifie que l'app s'installe et fonctionne sur la machine d'un utilisateur. La communication et le site restent hors périmètre.

- [ ] **V1-194 · P0 · `code`** : macOS : app non signée et non notarisée
  - **Constat** : `signingIdentity: "-"` donne une signature ad hoc : Gatekeeper bloque une app téléchargée. `apps/desktop/src-tauri/tauri.macos.conf.json:36`
  - **Terminé quand** : Signature Developer ID et notarisation en CI, ouverture sans contournement sur un Mac neuf.
- [ ] **V1-195 · P0 · `décision`** : Licence du projet
  - **Constat** : Le dépôt est public, sans fichier `LICENSE`. Les licences des dépendances ne sont pas inventoriées.
  - **Terminé quand** : Licence choisie et ajoutée, inventaire tiers généré à chaque build.
- [ ] **V1-196 · P1 · `code`** : Windows : installeur non signé
  - **Constat** : Aucune configuration de signature : SmartScreen avertira les utilisateurs. `.github/workflows/release.yml:45`
  - **Terminé quand** : Signature décidée et mise en place, ou avertissement documenté.
- [ ] **V1-197 · P1 · `audit`** : Matrice d'installation
  - **Constat** : Aucune preuve d'installation réelle : macOS Intel et ARM, Windows 10 et 11 (WebView2 absent), Ubuntu 22 et 24, Fedora.
  - **Terminé quand** : Installation, lancement, connexion et requête validés sur chaque système.
- [ ] **V1-198 · P1 · `code`** : macOS 11 annoncé mais probablement incompatible
  - **Constat** : Minimum à 11.0 et cible `safari15`, alors que le code utilise `findLastIndex`, `.at()` et `randomUUID`, qui demanderaient Safari 15.4 : à confirmer. `apps/desktop/src-tauri/tauri.macos.conf.json:35`
  - **Terminé quand** : Version minimale relevée, ou compatibilité testée sur une vraie machine.
- [ ] **V1-199 · P1 · `audit`** : Effets macOS sur les anciennes versions
  - **Constat** : `liquidGlassClear` est demandé avec un minimum à macOS 11 : à vérifier sur les versions sans cet effet. `apps/desktop/src-tauri/tauri.macos.conf.json:23`
  - **Terminé quand** : Rendu correct et texte lisible sur chaque version supportée.
- [ ] **V1-200 · P1 · `audit`** : Linux : WebKitGTK et grille
  - **Constat** : AppImage et deb non testés dans ces travaux : performance du canvas, polices, presse-papiers, Wayland et X11.
  - **Terminé quand** : Fonctionnement validé sous GNOME et KDE, défauts connus documentés.
- [ ] **V1-201 · P1 · `audit`** : Mise à jour de bout en bout
  - **Constat** : Le mécanisme est écrit. À prouver : mise à jour sur chaque OS, signature falsifiée refusée, données conservées, réseau coupé en cours de téléchargement.
  - **Terminé quand** : Scénarios validés avec une version de test, procédure en cas de mauvaise release.
- [ ] **V1-202 · P1 · `décision`** : Sauvegarde de la clé de mise à jour
  - **Constat** : Perdre la clé privée du `pubkey` empêche toute mise à jour future des apps installées. `apps/desktop/src-tauri/tauri.conf.json:53`
  - **Terminé quand** : Clé sauvegardée hors GitHub, procédure de rotation écrite.
- [ ] **V1-203 · P2 · `audit`** : Désinstallation et données locales
  - **Constat** : Emplacement des données et entrées de trousseau non documentés. Le trousseau survit à une désinstallation.
  - **Terminé quand** : Comportement documenté avec une procédure de remise à zéro.
- [ ] **V1-204 · P1 · `décision`** : Passage en version 1.0.0
  - **Constat** : Version actuelle 0.1.0, pas de `CHANGELOG`. `apps/desktop/src-tauri/tauri.conf.json:5`
  - **Terminé quand** : Critères de sortie écrits (zéro P0 ouvert), changelog créé, passage complet de la grille sur le build candidat.

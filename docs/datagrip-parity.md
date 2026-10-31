# Parité fonctionnelle Datowl ↔ JetBrains DataGrip

> Inventaire des fonctionnalités de DataGrip (documentation officielle 2026.2), comparé à l'état actuel de Datowl, pour planifier la parité.
>
> **Sources** : table des matières complète de la documentation (<https://www.jetbrains.com/help/datagrip/>, ~590 pages, parcourue via `HelpTOC.json`), pages de référence (Data Sources and Drivers dialog, Services tool window, Database Explorer, Query execution, Data Editor and Viewer, Export/Import, Data extractors/loaders, Query execution plan, Schema comparison, Diagrams, MCP Server, AI Tools…), Inspectopedia (inspections SQL et PostgreSQL) et <https://www.jetbrains.com/datagrip/features/>.
>
> **État de Datowl** : déduit de la description fournie (Tauri 2 + Rust, React, Monaco, grille Glide). Une fonctionnalité non mentionnée est considérée comme absente. Les lignes marquées *(à vérifier)* sont des suppositions à confirmer dans le code.

## Légende

| Colonne | Valeurs |
|---|---|
| **Datowl** | ✅ fait · 🟡 partiel · ❌ absent |
| **Priorité** | **P0** : bloquant pour remplacer DataGrip au quotidien · **P1** : important, attendu à moyen terme · **P2** : confort, niche ou différenciation |
| **Pertinent PG/CH** | `PG + CH` : les deux moteurs v1 · `PG` : PostgreSQL seulement · `CH` : ClickHouse seulement · `PG (CH limité)` : utile surtout côté PG, partiellement applicable à CH · `Générique` : fonction d'IDE, indépendante du moteur · `Autres SGBD` : ne concerne que des moteurs hors périmètre v1 |

---

## 1. Sources de données & connexion

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Création / édition de sources de données | Formulaire hôte, port, base, utilisateur, mot de passe ; sources sauvegardées | ✅ | P0 | PG + CH |
| Test de connexion | Vérifie la connexion et permet de copier le diagnostic (version serveur, pilote) | ✅ | P0 | PG + CH |
| Stockage du mot de passe dans le trousseau | Mot de passe stocké dans le stockage sécurisé de l'OS | ✅ | P0 | PG + CH |
| Politique de mémorisation du mot de passe | Jamais / jusqu'au redémarrage / pour la session / pour toujours | 🟡 | P1 | PG + CH |
| Type de connexion « URL only » / collage d'URL | Coller une URL (`postgres://…`, `jdbc:clickhouse://…`) qui remplit automatiquement les champs | ✅ | P1 | PG + CH |
| Méthodes d'authentification | Utilisateur/mot de passe, sans authentification, fichier `pgpass`, Kerberos | 🟡 | P1 (pgpass, sans auth) / P2 (Kerberos) | PG (pgpass, Kerberos), CH (sans auth) |
| Mode TLS/SSL | Activer SSL et choisir le mode de vérification | ✅ | P0 | PG + CH |
| Certificats SSL | Fichier CA, certificat et clé client, choix du truststore (IDE / Java / système) | ❌ | P1 | PG + CH |
| Tunnel SSH intégré | Configurations SSH réutilisables (mot de passe, clé privée, agent ssh), port local, bastion | ❌ | P0 | PG + CH |
| Copier les réglages SSH/SSL d'une autre source | Réutiliser la configuration réseau d'une source existante | ❌ | P2 | PG + CH |
| Propriétés avancées du pilote | Paires clé/valeur passées au pilote (`application_name`, `options`, réglages ClickHouse comme `max_execution_time`) | ❌ | P1 | PG + CH |
| Gestion des pilotes JDBC | Versions de pilotes, pilotes utilisateur, options VM (sans objet tel quel : Datowl utilise des pilotes Rust natifs) | ❌ | P2 | Générique |
| Source en lecture seule | Empêche toute modification depuis l'éditeur de données (et la console si le pilote le permet) | ❌ | P0 | PG + CH |
| Contrôle de transaction par source | Mode Auto / Manuel et niveau d'isolation par défaut | 🟡 | P0 | PG (CH : pas de transactions classiques) |
| Changement de schéma | Automatique / manuel / désactivé ; restaure `search_path` ou la base courante au redémarrage | ❌ | P1 | PG (`search_path`), CH (`USE db`) |
| Fuseau horaire de la source | Fuseau utilisé pour la session et l'affichage des dates | ❌ | P1 | PG + CH |
| Requête keep-alive | Requête périodique pour garder la connexion ouverte | ❌ | P1 | PG + CH |
| Déconnexion automatique | Ferme la connexion après N secondes d'inactivité | ❌ | P2 | PG + CH |
| Mode base unique | N'afficher et n'utiliser que la base configurée (utile derrière PgBouncer) | ❌ | P1 | PG |
| Script de démarrage | SQL exécuté à chaque ouverture de connexion (avec macros) | ❌ | P1 | PG + CH |
| Tâches avant connexion | Lancer un outil ou un script avant la première connexion | ❌ | P2 | Générique |
| Modèles de session | Variantes de session (authentification, lecture seule, script de démarrage, pilote) qui surchargent la source | ❌ | P2 | PG + CH |
| Dupliquer une source | Copier une source avec tous ses réglages | ❌ | P1 | PG + CH |
| Dossiers de sources | Regrouper les sources dans des dossiers, réordonner par glisser-déposer | ❌ | P1 | Générique |
| Couleur par source | Couleur appliquée à l'arbre, aux onglets, au fond de l'éditeur et à la barre d'outils (ex. prod en rouge) | ❌ | P1 | Générique |
| Sources globales / par projet, partage | Niveau global ou projet, copie de la source en XML dans le presse-papiers, export/import ZIP des réglages | 🟡 | P2 | Générique |
| Modèles de sources | Modèles de connexion sauvegardés (synchronisés via le compte JetBrains) | ❌ | P2 | Générique |
| Intégrations cloud | Découverte des bases AWS (RDS, Redshift), Google Cloud SQL, Azure, puis création automatique des sources | ❌ | P2 | PG (RDS, Cloud SQL, Azure PG) |
| Bases dans Docker / Kubernetes | Connexion à une base dans un conteneur ou via un port-forward Kubernetes | ❌ | P2 | PG + CH |
| Annuler une connexion en cours | Interrompre l'établissement d'une connexion lente | ❌ | P1 | PG + CH |
| Déconnecter une source | Action « Deactivate » sur une ou plusieurs sources | 🟡 *(à vérifier)* | P0 | PG + CH |
| CLI de gestion des sources | Commandes `list` / `manage` pour lister et créer des sources | ❌ | P2 | Générique |
| Sources de données DDL | Source « virtuelle » construite à partir de fichiers DDL (avec héritage d'une source parente) | ❌ | P2 | PG + CH |
| Bases de démonstration | Bases d'exemple pour la prise en main | ❌ | P2 | Générique |

## 2. Sessions, transactions & fenêtre Services

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Arbre des sessions | Source > sessions > clients (consoles, éditeurs de données), indicateur connecté/déconnecté | ❌ | P1 | PG + CH |
| Modes de distribution des sessions | Session partagée unique / partagée + introspection séparée / session dédiée par client | ❌ | P1 | PG + CH |
| Plusieurs sessions par source | Créer une nouvelle session et y rattacher une console ; changer de session ou de source | ❌ | P1 | PG + CH |
| Mode transaction manuel | Commit et rollback depuis la barre d'outils (Tx: Auto / Manual) | ❌ | P0 | PG |
| Niveau d'isolation par session | Read committed, repeatable read, serializable… | ❌ | P1 | PG |
| Indicateur de transaction ouverte | Signal visuel et avertissement à la fermeture si une transaction est en cours | ❌ | P0 | PG |
| Annuler les requêtes en cours | Bouton Cancel sur la console ou la session | ✅ | P0 | PG + CH |
| Terminer le processus serveur | Après une double annulation, proposer `pg_cancel_backend` / `pg_terminate_backend` ou `KILL QUERY` | ❌ | P1 | PG + CH |
| Fermer toutes les sessions | Déconnexion de toutes les sessions d'une source | ❌ | P1 | PG + CH |
| Fenêtre Services | Vue centralisée des sessions, onglets Output / Result, ouverture en onglet séparé | 🟡 | P1 | Générique |
| Journal de sortie | Messages serveur (NOTICE, RAISE, logs ClickHouse), erreurs, statistiques | ✅ | P0 | PG + CH |
| Horodatage et pause de la sortie | Horodatage des lignes, pause, effacement, retour à la ligne automatique | 🟡 | P2 | Générique |
| Notification de fin de requête longue | Notification système quand une requête de plus de 20 s se termine | ❌ | P1 | Générique |
| Afficher les sessions internes | Montrer la session d'introspection dans la liste | ❌ | P2 | Générique |

## 3. Introspection & métadonnées

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Chargement paresseux des métadonnées | Les nœuds sont introspectés à l'ouverture | ✅ | P0 | PG + CH |
| Sélection des bases/schémas introspectés | Motif de schémas (`*:*`, `@:@`, `db1:s1,s2`) et cases à cocher par base/schéma | 🟡 | P1 | PG + CH |
| Afficher les schémas système | Basculer `pg_catalog`, `information_schema`, `pg_toast`, `pg_temp`, bases modèles ; base `system` côté CH | 🟡 | P1 | PG + CH |
| Filtre d'objets par type et regex | Ex. `table:-tmp_.*` pour limiter les objets visibles et résolus | 🟡 | P2 | PG + CH |
| Rafraîchir (objet, schéma, source) | Resynchroniser l'arbre ; Force Refresh, oubli du cache d'un schéma | 🟡 *(à vérifier)* | P0 | PG + CH |
| Synchronisation automatique après DDL | Rafraîchit l'arbre quand un `CREATE/ALTER/DROP` est exécuté dans une console | ❌ | P1 | PG + CH |
| Introspection périodique | Rafraîchissement automatique toutes les N minutes | ❌ | P2 | PG + CH |
| Niveaux d'introspection (1/2/3) | Quantité de métadonnées choisie automatiquement selon la taille du schéma, réglable manuellement | ❌ | P2 | PG (non supporté par DataGrip pour CH) |
| Cache de métadonnées persistant | Complétion et navigation disponibles avant connexion ou hors ligne | ❌ | P1 | PG + CH |
| Chargement des sources d'objets | Corps des vues/routines : tous les schémas / hors système / aucun | 🟡 | P2 | PG + CH |
| Avertissement DDL en cache obsolète | Prévenir si l'objet a changé en base depuis l'introspection | ❌ | P2 | PG + CH |
| Objets pré-introspectés des catalogues système | Complétion sur `pg_catalog` / `system.*` sans introspection coûteuse | ❌ | P1 | PG + CH |
| Couverture des objets PostgreSQL | Séquences, types/enums, domaines, triggers, règles, extensions, FDW, tables étrangères, politiques RLS, rôles, tablespaces, partitions | 🟡 | P1 | PG |
| Couverture des objets ClickHouse | Dictionnaires, projections, moteurs, clés de tri/partition, TTL, tables distribuées, utilisateurs/rôles | 🟡 | P1 | CH |
| Projections ClickHouse | Groupe « projections » sous la table, DDL en lecture seule, navigation et recherche | ❌ | P1 | CH |

## 4. Database Explorer

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Arbre hiérarchique | Bases > schémas > tables/vues/vues matérialisées/routines > colonnes/clés/index | ✅ | P0 | PG + CH |
| Recherche rapide dans l'arbre | Taper pour filtrer, filtre mémorisé | ✅ | P0 | Générique |
| Navigation clavier | Flèches, ouverture, dépliage | ✅ | P0 | Générique |
| Menus contextuels | Actions par type de nœud | 🟡 | P0 | PG + CH |
| Options de regroupement | Par type d'objet, éléments d'objet, préfixe de nom (`_`, `-`, `$`), procédures/fonctions séparées, tri alphabétique | 🟡 | P2 | PG + CH |
| Options d'affichage | Groupes vides, nœuds intermédiaires, objets virtuels, fichiers de requêtes, toutes les bases | ❌ | P2 | Générique |
| Commentaires et date de rafraîchissement | Afficher le commentaire de l'objet et la date de dernière introspection | ❌ | P2 | PG (CH : non supporté par DataGrip pour la date) |
| Couleurs sur dossiers et objets | Coloration d'une base, d'un schéma ou d'un dossier | ❌ | P1 | Générique |
| Documentation rapide | Popup avec DDL, commentaire et aperçu des N premières lignes | ❌ | P1 | PG + CH |
| Ouvrir les données | Ouvrir une table/vue dans l'éditeur de données (F4) | ✅ | P0 | PG + CH |
| Aller au DDL | Ouvrir le DDL d'un objet (Ctrl+B) | ✅ | P0 | PG + CH |
| Ouvrir la console de la source | « Jump to Query Console » avec choix parmi les consoles existantes | 🟡 | P1 | Générique |
| Copier la référence | Copier le nom qualifié (`schema.table`) | ❌ *(à vérifier)* | P1 | PG + CH |
| Glisser un objet vers l'éditeur | Insère le nom qualifié dans le SQL | ❌ | P2 | Générique |
| Afficher un groupe en tableau | Liste des tables d'un schéma avec leurs propriétés (taille, lignes, commentaire) | ❌ | P2 | PG + CH |
| Sauvegarde rapide d'une table | Duplique une table en un clic (quick backup) | ❌ | P2 | PG + CH |
| Exécuter une fonction/procédure | Dialogue de saisie des paramètres depuis l'arbre | ❌ | P2 | PG |
| Rafraîchir une vue matérialisée | `REFRESH MATERIALIZED VIEW` depuis le menu | ❌ | P1 | PG |
| Défilement synchronisé avec l'éditeur | Sélectionner dans l'arbre l'objet ouvert dans l'éditeur | ❌ | P2 | Générique |
| Signets sur objets | Marquer un objet de base (F11) | ❌ | P2 | Générique |
| Diagnostics | Dump du modèle de métadonnées, journaux du pilote, mode diagnostic | ❌ | P2 | Générique |

## 5. Objets virtuels

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Clés étrangères virtuelles | FK déclarées côté client (manuellement ou par règles de motifs de colonnes), utilisées par la complétion, la navigation et les diagrammes | ❌ | P2 (P1 pour CH) | PG + CH (essentiel pour CH, sans FK natives) |
| Vues virtuelles | Requête SELECT enregistrée et affichée comme une vue dans l'arbre | ❌ | P2 | PG + CH |
| Colonnes virtuelles | Colonnes calculées par une expression, affichées dans la grille | ❌ | P2 | PG + CH |

## 6. Éditeur SQL : édition & affichage

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Éditeur de code complet | Monaco : coloration, multi-curseurs, rechercher/remplacer avec regex, pliage | ✅ | P0 | Générique |
| Dialectes SQL spécifiques | Grammaire PostgreSQL et ClickHouse par console/fichier (fonctions, types, mots-clés propres) | 🟡 | P0 | PG + CH |
| Erreurs de syntaxe à la volée | Analyse syntaxique selon le dialecte, avant exécution | ❌ | P1 | PG + CH |
| Marqueur d'erreur serveur | Position de l'erreur renvoyée par le serveur soulignée | ✅ | P0 | PG + CH |
| Surlignage de l'instruction courante | Mise en évidence de l'instruction sous le curseur | ✅ | P0 | Générique |
| Étendre/réduire la sélection sémantiquement | Ctrl+W : expression > clause > instruction | 🟡 | P2 | Générique |
| Sticky lines | En-tête de l'instruction englobante figé en haut | ❌ | P2 | Générique |
| Icônes de gouttière | Lancer l'instruction depuis la marge, temps d'exécution affiché | ❌ | P1 | Générique |
| Signets | Signets de ligne (anonymes, mnémoniques) et listes | ❌ | P2 | Générique |
| Vue structure | Liste des instructions du fichier, navigation | ❌ | P2 | Générique |
| Commentaires TODO | Détection et fenêtre TODO | ❌ | P2 | Générique |
| Injection de langage | JSON/regex/XML coloré dans les chaînes SQL | ❌ | P2 | PG + CH |
| Mode Vim | Émulation Vim (plugin IdeaVim) | ❌ | P2 | Générique |
| Macros d'éditeur | Enregistrer et rejouer des séquences d'édition | ❌ | P2 | Générique |

## 7. Complétion de code

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Complétion selon le schéma | Tables, colonnes en portée, `alias.colonne`, `schema.table`, mots-clés, fonctions | ✅ | P0 | PG + CH |
| Complétion propre au dialecte | Fonctions et types natifs (ex. fonctions d'agrégat CH, opérateurs `jsonb` PG) | 🟡 | P1 | PG + CH |
| JOIN … ON via clés étrangères | Propose la condition de jointure complète à partir des FK (réelles ou virtuelles) | ❌ | P0 | PG (CH via FK virtuelles) |
| Liste des colonnes du SELECT | Développer `*` en liste explicite | ❌ | P1 | PG + CH |
| Liste des colonnes d'INSERT | Colonnes et gabarit `VALUES` générés | ❌ | P1 | PG + CH |
| Complétion du GROUP BY | Ajoute les colonnes non agrégées | ❌ | P1 | PG + CH |
| Fonctions fenêtrées | Complétion de `OVER (PARTITION BY … ORDER BY …)` | ❌ | P2 | PG + CH |
| Génération d'alias | Alias proposé automatiquement après un nom de table | ❌ | P1 | PG + CH |
| Noms abrégés | `fa` → `film_actor` (camel hump) | ❌ | P2 | Générique |
| Instructions abrégées / postfix | `sel` → `SELECT … FROM` ; complétion postfix | ❌ | P2 | Générique |
| Noms de nouveaux objets | Suggestions pour `CREATE …` | ❌ | P2 | PG + CH |
| Info sur les paramètres | Signature de fonction affichée pendant la saisie | ❌ | P1 | PG + CH |
| Classement par apprentissage automatique | Tri ML des suggestions, marqueurs de pertinence | ❌ | P2 | Générique |
| Complétion IA pleine ligne | Suggestion de ligne entière par modèle local | ❌ | P2 | Générique |

## 8. Inspections, quick-fixes & intentions

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Références non résolues | Table/colonne inconnue soulignée avant exécution | ❌ | P1 | PG + CH |
| DELETE/UPDATE sans WHERE | Inspection et confirmation obligatoire à l'exécution | ❌ | P0 | PG + CH (CH : `ALTER TABLE … DELETE`) |
| Inspections SQL génériques (≈ 50) | Colonne absente du GROUP BY, référence ambiguë, alias manquants, types incompatibles, CTE/sous-requête inutilisés, `ORDER ASC` redondant, `ELSE NULL` redondant, `COALESCE` redondant, insertion de NULL en NOT NULL, cardinalité de VALUES, JOIN excessifs, littéraux date mal formés… | ❌ | P2 | PG + CH |
| Inspections PostgreSQL | Ex. « Select from procedure call » | ❌ | P2 | PG |
| Profils et sévérités | Activer/désactiver, changer la sévérité, portée, inspections personnalisées | ❌ | P2 | Générique |
| Quick-fixes (Alt+Entrée) | Qualifier un objet, ajouter au GROUP BY, mettre entre guillemets, créer un alias | ❌ | P2 | PG + CH |
| Intentions | Introduire un alias, GROUP BY → DISTINCT, développer `*`, CASE ↔ COALESCE / fonction conditionnelle, avec aperçu | ❌ | P2 | PG + CH |
| Inspection en ligne de commande | Lancer les inspections hors IDE | ❌ | P2 | Générique |

## 9. Navigation, refactoring, mise en forme & génération

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Aller à la déclaration depuis l'éditeur | Cmd+clic sur une table/colonne : DDL ou nœud de l'arbre | ❌ | P1 | PG + CH |
| Find Usages | Usages d'un objet dans les consoles et fichiers | ❌ | P2 | PG + CH |
| Renommer (refactoring) | `ALTER … RENAME` et mise à jour des usages, avec aperçu | 🟡 | P2 | PG + CH |
| Extraire une variable / CTE / fonction table | Transformer une sous-requête en CTE, etc. | ❌ | P2 | PG + CH |
| Reformater le code | Sur sélection ou fichier, à l'enregistrement ou au commit, exclusions | ❌ | P1 | PG + CH |
| Style de code SQL configurable | Casse des mots-clés et identifiants, retours à la ligne, indentation, alignement, alias ; par dialecte et par source ; import/export | ❌ | P1 | PG + CH |
| Appliquer la casse de déclaration | Réécrire les identifiants selon la casse de leur déclaration | ❌ | P2 | PG + CH |
| Live templates | Snippets avec variables (`sel`, `ins`, `upd`…), contexte par dialecte, partage | ❌ | P1 | PG + CH |
| Générer du code (Alt+Insert) | Gabarits `CREATE` pour table, vue, index, fonction, trigger, séquence, type… | ❌ | P2 | PG + CH |
| Génération d'entités Java/POJO | Scripts d'extension générant des classes depuis les tables | ❌ | P2 | Générique |
| Navigation entre fichiers récents | Fichiers et emplacements récents, barre de navigation | ❌ | P2 | Générique |

## 10. Exécution de requêtes

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Exécuter au curseur / sélection / script | Exécution de l'instruction courante, de la sélection ou de tout le script | ✅ | P0 | PG + CH |
| Comportement au curseur configurable | Demander / plus petite instruction / plus grande / script entier / tout depuis le curseur | 🟡 | P2 | Générique |
| Comportement de la sélection | Une seule instruction / instructions séparées / extension intelligente | 🟡 | P2 | Générique |
| Exécuter depuis le curseur jusqu'à la fin | « Everything below caret » | ❌ | P2 | Générique |
| Schéma/base par défaut de la console | Sélecteur dans la barre d'outils (`search_path`, base CH courante) | ✅ | P0 | PG + CH |
| Paramètres utilisateur | `?`, `:nom`, `$1`, `${var}` : dialogue de saisie, mémorisation des valeurs, tableaux | ❌ | P1 | PG + CH |
| Motifs de paramètres personnalisés | Motifs regex configurables, portée (scripts, littéraux) | ❌ | P2 | Générique |
| Confirmation des requêtes dangereuses | Avertissement avant DELETE/UPDATE sans WHERE (et DROP/TRUNCATE) | ❌ | P0 | PG + CH |
| Modes de résolution | Playground (instructions indépendantes) / Script (`SET search_path`, `USE` pris en compte) | ❌ | P2 | PG + CH |
| Délimiteur d'instruction personnalisé | Séparateur en plus du `;` | ❌ | P2 | PG + CH |
| Temps d'exécution dans l'éditeur | Durée affichée sur la première ligne de la requête | ❌ | P1 | Générique |
| Exécuter une requête vers un fichier | SELECT dont le résultat est écrit directement dans un fichier (sans grille) | ❌ | P1 | PG + CH |
| Exécuter des fichiers SQL | Lancer un fichier `.sql` (gros fichiers en streaming), éventuellement sur plusieurs sources | ❌ | P1 | PG + CH |
| Exécuter fonctions/procédures stockées | Dialogue de paramètres, choix de la console | ❌ | P2 | PG |
| Configurations d'exécution | Scripts enregistrés avec source cible, tâches « before launch », exécution groupée | ❌ | P2 | Générique |
| Run Anything | Lancer n'importe quelle configuration ou commande | ❌ | P2 | Générique |

## 11. Résultats de requêtes

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Résultats streamés avec pagination serveur | Curseurs PG, flux HTTP CH | ✅ | P0 | PG + CH |
| Page suivante / tout récupérer / défilement infini | Chargement progressif des lignes | ✅ | P0 | PG + CH |
| Taille de page configurable | Limite de lignes par page | ✅ | P0 | Générique |
| Barre de pagination complète | Première / précédente / suivante / dernière page, nombre total de lignes | 🟡 | P1 | PG + CH |
| Un résultat par instruction | Script multi-instructions : un onglet de résultat par SELECT | 🟡 *(à vérifier)* | P0 | PG + CH |
| Nouvel onglet par requête, épinglage | Garder les résultats précédents ; épingler un onglet | ❌ | P1 | Générique |
| Titre d'onglet depuis un commentaire | `-- Ventes par mois` devient le titre de l'onglet | ❌ | P2 | Générique |
| Résultats dans l'éditeur | Grille affichée sous la requête dans la console | ❌ | P2 | Générique |
| Recharger le résultat / rafraîchissement auto | Ré-exécuter la requête, intervalle de mise à jour | ❌ | P1 (recharger) / P2 (auto) | PG + CH |
| Voir / copier la requête d'origine | Afficher, copier dans la console ou le presse-papiers | ❌ | P2 | Générique |
| Comparer deux résultats | Diff de deux jeux de résultats avec tolérance | ❌ | P2 | PG + CH |
| Éditer un résultat de requête | Y compris résultats de JOIN multi-tables (hors UNION, colonnes calculées) | ❌ | P1 | PG (CH limité) |
| Journal complet des requêtes | Toutes les requêtes envoyées, y compris internes (`database.log`) | 🟡 | P2 | Générique |

## 12. Plan d'exécution

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| EXPLAIN en arbre | Plan affiché en arbre + tableau (coûts de démarrage/total, lignes estimées) | ❌ | P0 | PG (CH : `EXPLAIN` texte à parser) |
| EXPLAIN ANALYZE | Exécution réelle avec temps et lignes effectives | ❌ | P0 | PG (CH : `EXPLAIN PIPELINE` / `ESTIMATE`) |
| Diagramme du plan | Visualisation graphique des nœuds | ❌ | P1 | PG + CH |
| Flame graph | Par coût total ou coût de démarrage | ❌ | P2 | PG |
| Plan brut et copie native | Plan brut (JSON/texte) et copie au format natif du SGBD | ❌ | P1 | PG + CH |

> Note ClickHouse : DataGrip ne propose rien de spécifique pour `EXPLAIN PLAN indexes = 1`, `EXPLAIN PIPELINE` ou `EXPLAIN ESTIMATE`. Un affichage dédié (parties/granules lus, index utilisés) serait un vrai avantage de Datowl.

## 13. Éditeur de données : affichage & exploration

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Grille performante | Grille canvas, gros volumes | ✅ | P0 | Générique |
| Affichage NULL et alignement numérique | Rendu distinct des NULL, nombres alignés à droite | ✅ | P0 | Générique |
| Redimensionner les colonnes | Glisser la bordure d'en-tête | ✅ | P0 | Générique |
| Masquer / réordonner les colonnes | Masquer, afficher, déplacer par glisser, revenir à la vue initiale | ❌ | P1 | Générique |
| Sélection de colonne/ligne | Clic sur l'en-tête, étendre/réduire la sélection | 🟡 *(à vérifier)* | P1 | Générique |
| Rechercher dans la page | Ctrl+F : recherche texte côté client dans la grille | ❌ | P1 | Générique |
| Vue transposée | Lignes et colonnes inversées ; auto-transposition si une seule ligne | ❌ | P1 | Générique |
| Vues Texte et Arbre | Grille rendue en texte via un extracteur ; vue clé/valeur dépliable | ❌ | P2 | Générique |
| Vue enregistrement | Panneau latéral affichant et éditant une ligne (une ou deux colonnes) | ❌ | P1 | Générique |
| Éditeur de valeur | Panneau dédié avec formatage JSON/XML, coloration, retour à la ligne | 🟡 | P0 | PG + CH (`jsonb`, `JSON`) |
| Éditeur de tableaux | Édition des colonnes de type tableau dans une sous-grille | ❌ | P2 | PG + CH |
| Types binaires et images | Affichage hex / texte / UUID, aperçu d'image | ❌ | P2 | PG (`bytea`) + CH |
| Charger / enregistrer un LOB | Charger un fichier dans une cellule, enregistrer le contenu dans un fichier | ❌ | P2 | PG + CH |
| Vue d'agrégats | Somme, moyenne, nombre, min, max, distincts sur la sélection ; scripts d'agrégats personnalisés | ❌ | P1 | Générique |
| Copier le résultat d'agrégat | Copier la somme de la sélection | ❌ | P2 | Générique |
| Superposition de valeur | Valeur complète d'une cellule en popup | ✅ | P1 | Générique |
| Documentation rapide de cellule | Texte long et lignes liées (référencées / référençantes) | 🟡 | P2 | PG |
| Barre d'actions rapides de cellule | Ouvrir une URL, un fichier, naviguer vers les lignes liées | ❌ | P2 | Générique |
| Carte de chaleur | Coloration séquentielle ou divergente par table ou colonne, booléens | ❌ | P2 | Générique |
| Graphiques | Barres, secteurs, aires, lignes, nuage de points, bulles, boursier, histogramme ; séries multiples ; export PNG | ❌ | P2 | Générique |
| Visualiseur géographique | Carte des géométries (WKT, WKB, PostGIS) avec liaison ligne ↔ point | ❌ | P2 | PG (PostGIS) |
| Formats de date/heure personnalisés | Formats par type et fuseau d'affichage | ❌ | P1 | PG + CH |
| Formats numériques personnalisés | Séparateurs décimal/milliers, rendu NaN/Infinity, motifs | ❌ | P2 | Générique |
| Booléens texte ou cases à cocher | Mode d'affichage des booléens | ❌ | P2 | PG + CH |
| Présentation de la grille | Police dédiée, lignes alternées, position de la pagination | ❌ | P2 | Générique |
| Limite d'octets par valeur | Taille maximale chargée par cellule (LOB) | ❌ | P2 | PG + CH |
| Coloration d'une colonne par langage | JSON, XML ou HTML coloré dans les cellules | ❌ | P2 | PG + CH |
| Glisser des noms de colonnes vers le code | Insertion du nom dans l'éditeur SQL | ❌ | P2 | Générique |

## 14. Éditeur de données : filtrage, tri & navigation

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Filtre WHERE côté serveur | Champ WHERE sur les données d'une table | ✅ | P0 | PG + CH |
| Tri ORDER BY / clic sur l'en-tête | Tri serveur sur les données d'une table | ✅ | P0 | PG + CH |
| Complétion dans WHERE / ORDER BY | Colonnes et fonctions proposées dans les champs de filtre | ❌ | P1 | PG + CH |
| Historique des filtres | Conditions récentes (Alt+↓) | ❌ | P1 | Générique |
| Filtre local par colonne | Filtre côté client par valeurs cochables, mémorisé | ❌ | P1 | Générique |
| Filtres rapides depuis une cellule | « Filter by » : `= valeur`, `<>`, `LIKE`, `IS NULL`… | ❌ | P1 | PG + CH |
| Tri multi-colonnes | Tri empilé avec niveaux (Alt+clic) | ❌ | P1 | PG + CH |
| Tri côté client | Tri des résultats de requêtes sans relancer la requête | ❌ | P1 | Générique |
| Tri par défaut sur la PK | Tri ascendant/descendant automatique sur une clé primaire numérique | ❌ | P2 | PG |
| Navigation par clés étrangères | Aller aux lignes référencées / référençantes, sur plusieurs valeurs | ❌ | P0 | PG (CH via FK virtuelles) |
| Aller à la ligne | Ctrl+G, motif `colonne:ligne` | ❌ | P2 | Générique |
| Aller au DDL / à l'arbre depuis la grille | Navigation vers l'objet source | ❌ | P1 | PG + CH |
| Comparer les données de deux tables | Diff de deux grilles (détection de colonnes insérées, tolérance) | ❌ | P2 | PG + CH |

## 15. Éditeur de données : modification

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Édition de cellules | Édition en place (Entrée / double-clic) | ❌ | P0 | PG (CH limité : mutations) |
| Ajouter / supprimer / cloner des lignes | Alt+Inser, suppression de la sélection, clonage | ❌ | P0 | PG (CH : INSERT, DELETE léger) |
| Modifications en attente, Submit / Revert | Changements locaux surlignés, envoi ou annulation (sur la sélection) | ❌ | P0 | PG + CH |
| Aperçu du DML | Prévisualiser les INSERT/UPDATE/DELETE générés avant envoi | ❌ | P0 | PG + CH |
| Envoi immédiat | Option d'envoi automatique de chaque changement | ❌ | P2 | PG |
| Submit and Commit / Rollback | Valider ou annuler en mode transaction manuel | ❌ | P0 | PG |
| NULL et DEFAULT | Raccourcis pour mettre une cellule à NULL ou DEFAULT | ❌ | P0 | PG + CH |
| Générer un UUID | Valeur UUID générée dans la cellule | ❌ | P2 | PG + CH |
| Expressions SQL dans une cellule | `NOW()`, `nextval('seq')`, sous-requêtes comme valeur | ❌ | P2 | PG + CH |
| Édition multi-cellules | Saisie appliquée à toutes les cellules sélectionnées | ❌ | P1 | PG |
| Coller dans la grille | Coller des plages ou des lignes CSV, conversion de types automatique | ❌ | P1 | PG + CH |
| Complétion de valeurs | Suggestions issues des autres valeurs de la colonne | ❌ | P2 | Générique |
| Éditeurs typés | Sélecteur de date/heure, booléen (Espace, lettres t/f/n/d) | ❌ | P1 | PG + CH |
| Vider la table | Supprimer toutes les lignes / TRUNCATE depuis la grille | ❌ | P2 | PG + CH |
| Résolution de conflits | Avertissement si la ligne ou le DDL a changé en base, fusion | ❌ | P2 | PG |
| Respect de la lecture seule | Édition bloquée sur une source ou une table en lecture seule | ❌ | P0 | PG + CH |

## 16. Export

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Copie au presse-papiers multi-format | TSV, CSV, JSON, Markdown, SQL INSERT | ✅ | P0 | Générique |
| Extracteurs supplémentaires | SQL UPDATE, clause WHERE, INSERT multi-lignes, HTML, XML, texte aligné, une ligne, séparateur `|` | 🟡 | P1 (INSERT multi-lignes, WHERE) / P2 (reste) | PG + CH |
| Export vers fichier | Dialogue : format, en-têtes de colonnes/lignes, transposition, DDL incluse, colonnes calculées/générées, fichier de sortie | ❌ | P0 | PG + CH |
| Export d'une table entière | Depuis l'arbre ou la grille, sans limite de pagination | ❌ | P0 | PG + CH |
| Export de plusieurs tables | Sélection multiple dans l'arbre, un fichier par table | ❌ | P1 | PG + CH |
| Export Excel (xlsx) | Avec feuille optionnelle contenant la requête | ❌ | P1 | Générique |
| Copier toute la table | « Export Table to Clipboard » au-delà de la page courante | 🟡 | P1 | Générique |
| Formats CSV personnalisés | Séparateurs de valeurs/lignes, guillemets, texte NULL, en-têtes, échappement | ❌ | P1 | Générique |
| Extracteurs scriptés | API d'extracteurs personnalisés (Groovy/JS dans DataGrip ; JS/Lua possible dans Datowl) | ❌ | P2 | Générique |
| Dump avec pg_dump | Formats plain/custom/directory/tar, schémas/tables, `--clean`, `--if-exists`, `--create`, données seules, COPY/INSERT | ❌ | P1 | PG |
| Exécution des outils dans Docker | pg_dump/pg_restore lancés dans un conteneur | ❌ | P2 | PG |
| Copier une table vers une autre source | « Copy Table to » avec mapping de colonnes | ❌ | P2 | PG + CH |
| Dump mysqldump / bcp | Outils natifs MySQL / SQL Server | ❌ | P2 | Autres SGBD |

> Note ClickHouse : DataGrip ne propose pas de dump natif ClickHouse. Un export `INTO OUTFILE`/`FORMAT Parquet|Native` ou `BACKUP` serait propre à Datowl.

## 17. Import

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Import CSV/TSV | Vers une table nouvelle ou existante : mapping de colonnes, types, encodage, en-tête, lignes ignorées, aperçu | ❌ | P1 | PG + CH |
| Import Excel, JSON, Parquet, Shapefile | Chargeurs de données scriptés (xlsx/xls, json, parquet, shp) | ❌ | P2 | PG + CH (Parquet surtout CH) |
| Glisser-déposer un fichier | Déposer sur un schéma pour créer une table, sur une table pour l'alimenter | ❌ | P2 | Générique |
| Valeurs non convertibles en NULL | Option de tolérance aux erreurs de conversion | ❌ | P2 | Générique |
| Mappings multiples | Fichier → table, table → table, requête → table dans un même dialogue | ❌ | P2 | PG + CH |
| Restauration pg_restore / psql | Restaurer un dump custom/directory/tar ou un script SQL | ❌ | P1 | PG |
| Exécution d'un dump SQL | Exécuter un gros fichier `.sql` (structure puis données) | ❌ | P1 | PG + CH |
| Éditer des fichiers CSV/TSV comme tables | Ouvrir un CSV en grille : tri, transposition, colonnes masquées, export | ❌ | P2 | Générique |

## 18. Outils de schéma (DDL & objets)

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Visualiser le DDL | Tables, vues, vues matérialisées, fonctions | ✅ | P0 | PG + CH |
| DDL des autres objets | Index, séquences, types, triggers, schémas, rôles ; dictionnaires CH | 🟡 | P1 | PG + CH |
| Générer le DDL vers la console / le presse-papiers | Actions dédiées ; « Request and Copy Original DDL » | 🟡 | P1 | PG + CH |
| Générateur SQL | DDL de plusieurs objets, options (qualification, `IF NOT EXISTS`, DROP), un fichier par objet/schéma/type | ❌ | P1 | PG + CH |
| Dialogue Créer / Modifier une table | Colonnes, PK, FK, index, contraintes CHECK, commentaires, aperçu SQL éditable, non modal | ❌ | P1 | PG (CH : moteur, ORDER BY, PARTITION BY, TTL) |
| Créer / modifier base, schéma, vue, index, clés | Dialogues dédiés avec options propres au SGBD (owner, tablespace, template PG) | ❌ | P1 | PG + CH |
| Renommer un objet | `ALTER … RENAME` depuis l'arbre | ✅ | P1 | PG + CH |
| Supprimer (DROP) | Dialogue de confirmation, CASCADE, aperçu | 🟡 | P1 | PG + CH |
| TRUNCATE | Vider une table depuis l'arbre | ❌ | P1 | PG + CH |
| Modifier commentaires et droits | `COMMENT ON`, `GRANT`/`REVOKE` | ❌ | P2 | PG (CH : GRANT) |
| Activer / désactiver triggers et contraintes | Action depuis l'arbre | ❌ | P2 | PG |
| Éditer le source des objets | Modifier une vue/fonction dans son DDL puis soumettre (script de migration généré) | ❌ | P2 | PG + CH |
| Fenêtre Database Changes | Liste des modifications en attente, diff, soumission groupée | ❌ | P2 | PG + CH |
| Utilisateurs et rôles | Création, attribution de privilèges | ❌ | P2 | PG + CH |
| Mapping DDL ↔ fichiers | Dumper une source en fichiers DDL versionnables (« Dump to DDL Data Source ») | ❌ | P2 | PG + CH |
| Modèles de noms générés | Gabarits de noms pour index et clés | ❌ | P2 | Générique |

## 19. Comparaison de schémas & migration

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Comparer deux objets | Deux schémas, tables ou routines, sur la même source ou deux sources différentes | ❌ | P1 | PG + CH |
| Arbre des différences | Ajouts, modifications et suppressions colorés ; vue tableau et diff DDL | ❌ | P1 | PG + CH |
| Script de migration | Script généré, sélection des changements, aperçu, exécution sur la cible | ❌ | P1 | PG + CH |
| Options de migration | Qualification des schémas, recréation si ALTER impossible, noms générés, casse ignorée, placement des contraintes | ❌ | P2 | PG + CH |
| Inverser origine/cible, éléments identiques | Contrôles du dialogue de migration | ❌ | P2 | Générique |

## 20. Diagrammes

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Diagramme ER | Schéma ou sélection de tables avec colonnes, PK et FK | ❌ | P1 | PG (CH via FK virtuelles) |
| Interaction | Ajouter des tables, zoom, déplacement, mise en page automatique, annulation, recherche d'éléments | ❌ | P1 | Générique |
| Personnalisation | Commentaires de colonnes, couleurs des objets et des liens | ❌ | P2 | Générique |
| Export | PNG, SVG, presse-papiers, ouverture dans des éditeurs web (draw.io, Mermaid, PlantUML…) | ❌ | P2 | Générique |
| Analyse de graphe | Chemins entre deux tables, centralité | ❌ | P2 | Générique |
| Popup de diagramme rapide | Aperçu du diagramme sans ouvrir d'onglet | ❌ | P2 | Générique |

## 21. Recherche

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Palette de commandes / Find Action | ⌘K : tables, onglets, actions | ✅ | P0 | Générique |
| Search Everywhere complet | Tous les objets (colonnes, vues, routines, schémas), fichiers, réglages, abréviations | 🟡 | P1 | PG + CH |
| Filtres de recherche | Par source de données et par type d'objet ; recherche dans le contexte d'une source | ❌ | P1 | PG + CH |
| Recherche plein texte dans les données | Toutes les tables d'une base/schéma : contient / commence par / finit par / égal / motif LIKE ; colonnes texte, numériques ou toutes ; N résultats par table ; index plein texte PG (`@@ plainto_tsquery`) | ❌ | P1 | PG + CH |
| Find in Files | Recherche/remplacement dans les consoles et fichiers SQL | ❌ | P2 | Générique |
| Recherche structurelle | Rechercher/remplacer par motifs syntaxiques | ❌ | P2 | Générique |
| Calculs dans la recherche | Évaluer une expression mathématique | ❌ | P2 | Générique |

## 22. Fichiers, consoles & historique

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Console persistée par source | Console SQL rattachée à la source, sauvegardée sur disque | ✅ | P0 | PG + CH |
| Plusieurs consoles par source | Créer, renommer, dupliquer, supprimer, nom par défaut, regroupement par source | 🟡 | P1 | Générique |
| Historique des requêtes | Toutes les requêtes exécutées par source : recherche, réinsertion dans la console | ❌ | P0 | PG + CH |
| Local History | Versions successives des consoles et fichiers, étiquettes, restauration, fichiers supprimés | ❌ | P1 | Générique |
| Onglets / fichiers récemment fermés | Rouvrir un onglet fermé | ❌ | P1 | Générique |
| Fichiers utilisateur | Attacher un dossier de `.sql` ; associer un fichier à une source et un schéma | ❌ | P1 | PG + CH |
| Fichiers de requêtes | Fichiers attachés à une source, affichés sous la source dans l'arbre | ❌ | P2 | Générique |
| Fichiers scratch et buffers | Brouillons hors projet, changement de langage | ❌ | P2 | Générique |
| Fenêtre Files | Arborescence des fichiers, consoles et scratches | 🟡 | P2 | Générique |
| Historique du presse-papiers | Les 100 derniers éléments copiés | ❌ | P2 | Générique |
| Comparer fichiers et dossiers | Visionneuse de diff | ❌ | P2 | Générique |
| Modèles de fichiers | Gabarits de nouveaux fichiers avec variables | ❌ | P2 | Générique |
| Encodage des fichiers | Choix et conversion de l'encodage | ❌ | P2 | Générique |

## 23. Contrôle de version

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Intégration Git | Commit, push/pull, branches, worktrees, diff, merge/rebase, conflits, stash, patchs, historique, tags, signature GPG | ❌ | P2 | Générique |
| GitHub / GitLab | Pull/merge requests, revues, gists/snippets, CI | ❌ | P2 | Générique |
| Actions au commit | Reformatage et inspections avant commit | ❌ | P2 | Générique |
| Schéma versionné | Sources DDL dans Git pour comparer le schéma avec la base | ❌ | P2 | PG + CH |

## 24. IA

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Texte vers SQL | Générer une requête depuis le langage naturel avec le schéma comme contexte | ❌ | P1 | PG + CH |
| Chat IA contextuel | Ajouter des objets de base, fichiers ou résultats comme contexte | ❌ | P2 | PG + CH |
| Expliquer / optimiser / corriger | Explication d'une requête, d'un plan, correction d'une erreur SQL | ❌ | P2 | PG + CH |
| Complétion IA | Lignes et blocs complétés par un modèle | ❌ | P2 | Générique |
| Agents de code | Junie, Claude Agent, Codex, Copilot ; agents externes via ACP | ❌ | P2 | Générique |
| Serveur MCP | Expose `list_database_connections`, `list_database_schemas`, `list_schema_objects`, `get_database_object_description`, `execute_sql_query`, `fetch_query_result`, `preview_table_data`, `cancel_sql_query`, `list_recent_sql_queries`, `test_database_connection`, `create/edit_database_connection` | ❌ | P2 | PG + CH |
| Permissions IA | Autorisations globales : lire/modifier les données, lire/modifier le schéma | ❌ | P2 | PG + CH |
| Choix des modèles | Abonnement, clé personnelle, modèles locaux | ❌ | P2 | Générique |

## 25. Personnalisation, IDE & plugins

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Raccourcis configurables | Keymaps prédéfinis (macOS, Windows, Emacs…), réaffectation, recherche par raccourci | ❌ | P2 | Générique |
| Thèmes et couleurs | Thème clair/sombre, schéma de couleurs de l'éditeur, polices, zoom de l'interface | 🟡 *(à vérifier)* | P2 | Générique |
| Projets | Plusieurs projets (sources, consoles et onglets propres), nouveau / ouvrir un dossier / récents, import des sources d'un projet DataGrip, branche Git affichée | ✅ | P1 | Générique |
| Mises à jour de l'application | Vérification automatique, téléchargement signé et redémarrage | ✅ | P2 | Générique |
| Disposition des fenêtres | Fenêtres d'outils déplaçables, dispositions enregistrées, éditeurs côte à côte | 🟡 | P2 | Générique |
| Onglets d'éditeur | Épingler, diviser, colorer par source, noms d'onglets personnalisés | 🟡 | P1 | Générique |
| Sauvegarde et synchronisation des réglages | Réglages synchronisés entre machines | ❌ | P2 | Générique |
| Accessibilité et langue | Lecteur d'écran, contraste, langue de l'interface | ❌ | P2 | Générique |
| Notifications configurables | Réglages par type de notification | ❌ | P2 | Générique |
| Marketplace de plugins | Vim, Docker, Kubernetes, Terminal, HTTP Client, Big Data Tools (S3, Parquet), Markdown, Terraform, TextMate… | ❌ | P2 | Générique |
| Terminal intégré | Shell dans l'application | ❌ | P2 | Générique |
| Outils externes | Lancer `psql` / `clickhouse-client` avec macros (hôte, base, utilisateur) | ❌ | P2 | PG + CH |
| Console de scripting | Scripts d'automatisation de l'IDE | ❌ | P2 | Générique |
| Aides à la prise en main | Visite guidée, Feature Trainer, Productivity Guide, Presentation Assistant | ❌ | P2 | Générique |

## 26. Fonctionnalités propres à d'autres SGBD (hors périmètre v1)

| Fonctionnalité | Description courte | Datowl | Priorité suggérée | Pertinent PG/CH |
|---|---|---|---|---|
| Débogueur SQL | Points d'arrêt, pas à pas (PL/SQL, etc.) | ❌ | P2 | Autres SGBD |
| Tests unitaires SQL | utPLSQL (Oracle), tSQLt (SQL Server) | ❌ | P2 | Autres SGBD |
| DBMS_OUTPUT | Sortie Oracle / Db2 | ❌ | P2 | Autres SGBD |
| MongoDB | Console JS, édition de documents, export Extended JSON | ❌ | P2 | Autres SGBD |
| Redis, Cassandra, DynamoDB, Couchbase | Prise en charge NoSQL | ❌ | P2 | Autres SGBD |
| Authentifications spécifiques | Wallets/OCI Oracle, Okta/Duo/Google SSO Snowflake, SAML Redshift, Kerberos SQL Server, named pipes et sockets MySQL | ❌ | P2 | Autres SGBD |
| Outils natifs | mysqldump/mysql, bcp | ❌ | P2 | Autres SGBD |

---

## Synthèse chiffrée

| Statut | Nombre de lignes |
|---|---|
| ✅ fait | 35 |
| 🟡 partiel | 39 |
| ❌ absent | 251 |
| **Total** | **325** |

Répartition des manques (🟡 + ❌) par priorité : **P0 : 27**, P1 : 106, P2 : 159 (les lignes à double priorité sont comptées selon la plus haute).

### P0 manquants ou partiels

1. Édition de cellules + modifications en attente avec Submit / Revert
2. Ajouter / supprimer / cloner des lignes
3. Aperçu du DML avant envoi
4. Mode transaction manuel (Commit / Rollback, indicateur de transaction ouverte)
5. Source en lecture seule (et blocage de l'édition)
6. Tunnel SSH intégré
7. Historique des requêtes par source
8. Confirmation des requêtes dangereuses (DELETE/UPDATE sans WHERE)
9. EXPLAIN / EXPLAIN ANALYZE en arbre
10. Export vers fichier et export d'une table entière
11. Navigation par clés étrangères dans la grille
12. Complétion JOIN … ON via clés étrangères
13. Éditeur de valeur avec formatage JSON
14. NULL / DEFAULT dans la grille
15. Dialectes PG/CH dans l'éditeur, un onglet de résultat par instruction, rafraîchir et déconnecter *(partiels ou à vérifier)*

---

## Plan proposé

Les jalons regroupent les P0 et P1 manquants dans un ordre qui limite les dépendances : la mécanique transactionnelle et de sessions sert ensuite à l'édition, à l'import et à la migration de schéma.

### Jalon 1 : Sécurité d'exécution & transactions (fondations)
*Objectif : pouvoir modifier une base en confiance.*
- Mode transaction manuel : Commit / Rollback, niveau d'isolation, indicateur et alerte de transaction ouverte (P0, PG)
- Source en lecture seule, appliquée à la grille et, si possible, à la session (`default_transaction_read_only`, `readonly=1` côté CH) (P0)
- Confirmation des DELETE/UPDATE sans WHERE, DROP et TRUNCATE (P0)
- Sélecteur de schéma/base par défaut par console, changement de schéma auto/manuel (P0/P1)
- Couleur par source, appliquée aux onglets et à la barre d'outils (P1)
- Terminer le processus serveur après une double annulation, annuler une connexion en cours (P1)
- Notification de fin de requête longue, temps d'exécution dans l'éditeur (P1)

### Jalon 2 : Édition de données dans la grille
*Objectif : supprimer le principal manque fonctionnel face à DataGrip.*
- Édition de cellules, ajout/suppression/clonage de lignes, NULL/DEFAULT (P0)
- Modifications en attente, Submit / Revert sur la sélection, aperçu du DML (P0)
- Éditeurs typés (date/heure, booléen), édition multi-cellules, collage de plages et de lignes CSV (P1)
- Édition des résultats de requêtes sur une seule table (P1)
- Stratégie ClickHouse : `INSERT` pour les ajouts, `ALTER TABLE … UPDATE/DELETE` ou DELETE léger, avec avertissement sur le caractère asynchrone des mutations

### Jalon 3 : Exploration avancée des données
*Objectif : atteindre le confort de lecture de DataGrip.*
- Éditeur de valeur latéral avec formatage JSON/XML (P0)
- Navigation par clés étrangères vers les lignes référencées/référençantes (P0)
- Recherche dans la page, filtre local par colonne, filtres rapides « Filter by » (P1)
- Tri multi-colonnes, tri client des résultats de requêtes, historique et complétion des champs WHERE/ORDER BY (P1)
- Masquer/réordonner les colonnes, vue transposée, vue enregistrement, vue d'agrégats (P1)
- Barre de pagination complète, recharger le résultat, un onglet par instruction, épinglage des onglets (P0/P1)
- Formats de date/heure et fuseau d'affichage (P1)

### Jalon 4 : Connectivité & gestion des sources
*Objectif : couvrir les environnements réels (prod derrière un bastion, PgBouncer, clusters CH).*
- Tunnel SSH (clé, agent, bastion, port local) (P0)
- Certificats SSL : CA, certificat et clé client (P1)
- Propriétés avancées du pilote, script de démarrage, keep-alive, fuseau horaire, mode base unique (P1)
- Collage d'URL de connexion, méthodes d'auth `pgpass` / sans auth, politique de mémorisation du mot de passe (P1)
- Dupliquer une source, dossiers de sources (P1)
- Sélection des bases/schémas introspectés, schémas système, synchronisation auto après DDL, cache de métadonnées persistant, catalogues système pré-introspectés (P1)
- Couverture élargie des objets PG (séquences, types, triggers, extensions…) et CH (dictionnaires, projections, moteurs/TTL) (P1)
- Sessions multiples par source et arbre des sessions (P1)

### Jalon 5 : Productivité dans l'éditeur SQL
*Objectif : rattraper l'assistance au code de DataGrip.*
- Historique des requêtes par source (P0)
- Complétion JOIN … ON via FK, expansion de `*`, listes de colonnes INSERT/GROUP BY, génération d'alias, info de paramètres (P0/P1)
- Dialectes PG/CH complets et erreurs de syntaxe à la volée, références non résolues (P0/P1)
- Reformatage et style de code SQL configurable (P1)
- Aller à la déclaration (Cmd+clic), documentation rapide (P1)
- Paramètres utilisateur (`?`, `:nom`, `${var}`) avec dialogue de saisie (P1)
- Plusieurs consoles par source, Local History, onglets récemment fermés, fichiers utilisateur attachés (P1)
- Live templates (P1)
- Search Everywhere sur tous les objets avec filtres source/type (P1)

### Jalon 6 : Plan d'exécution, import/export & outils de schéma
*Objectif : outillage d'analyse et d'administration.*
- EXPLAIN / EXPLAIN ANALYZE PG en arbre + plan brut, diagramme du plan ; vue dédiée `EXPLAIN` ClickHouse (P0/P1)
- Export vers fichier (CSV, JSON, SQL, xlsx), export de table(s) entière(s), formats CSV personnalisés, requête vers fichier (P0/P1)
- Import CSV/TSV avec mapping, exécution de dumps SQL, pg_dump / pg_restore (P1)
- Générateur SQL et DDL des autres objets ; dialogues Créer/Modifier table, renommer, DROP, TRUNCATE, REFRESH MATERIALIZED VIEW (P1)
- Comparaison de schémas et script de migration (P1)
- Diagrammes ER (P1)
- Recherche plein texte dans les données (P1)
- Texte vers SQL par IA, avec le schéma introspecté comme contexte (P1)

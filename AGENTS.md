# AGENTS.md — Datowl

Guide pour les agents (et les humains) qui modifient ce dépôt. Datowl est un IDE base de données façon DataGrip pour **PostgreSQL** et **ClickHouse** : backend Rust (Tauri 2), interface React.

Deux architectures, une par côté :

- **Backend Rust : DDD en couches (hexagonal).** Le domaine ne dépend de rien ; l'application orchestre le domaine via ses ports ; l'infrastructure implémente les ports ; l'interface (Tauri) expose l'application.
- **Front React : feature-based.** Le code est rangé par fonctionnalité métier, pas par type technique. Chaque feature expose une API publique (`index.ts`) et cache le reste.

## Commandes

```bash
cargo check --workspace --tests          # compile tout le backend
cargo test --workspace                   # tests unitaires
npm --prefix web run typecheck           # TypeScript
npm --prefix web run build               # typecheck + bundle
npm --prefix apps/desktop run dev        # app complète (Rust + React)
npm --prefix web run dev                 # UI seule avec le backend de démo (shared/api/mock.ts)
```

Tests d'intégration Postgres : cluster **PostgreSQL 16** jetable, auth `trust` pour le rôle `datowl`, fixture chargée.

```bash
psql -h localhost -p 55432 -U datowl -d postgres -f crates/infrastructure/postgres/tests/fixture.sql
DATOWL_TEST_PG_PORT=55432 cargo test -p datowl-postgres --test live
```

Avant de rendre la main : `cargo test --workspace`, zéro warning sur `cargo check --workspace --tests`, et `npm --prefix web run typecheck`.

---

## Backend : DDD

```
crates/
  domain/                  datowl-domain       modèle, règles, ports — aucune I/O
  application/             datowl-application  cas d'usage (services) — dépend du domaine seulement
  infrastructure/
    postgres/              datowl-postgres     moteur PostgreSQL (tokio-postgres)
    clickhouse/            datowl-clickhouse   moteur ClickHouse (HTTP)
    store/                 datowl-store        persistance locale : JSON, Trousseau, dossier projet, git
apps/desktop/src-tauri/    datowl-desktop      interface : commandes Tauri + racine de composition
```

### Règle de dépendance

```
interface (desktop) ──► application ──► domain ◄── infrastructure
        └──────────────── racine de composition ───────────┘
```

| Crate | Peut dépendre de | Ne doit jamais dépendre de |
|---|---|---|
| `domain` | serde, thiserror, uuid, tokio-util (token d'annulation), async-trait | tokio runtime, fichiers, réseau, Tauri, n'importe quel autre crate Datowl |
| `application` | `domain`, tokio (spawn), serde | infrastructure, Tauri |
| `infrastructure/*` | `domain` | `application`, Tauri, un autre crate d'infrastructure |
| `desktop` | tout | — mais n'y mettre aucune logique métier |

Le desktop est **le seul** endroit qui choisit des adaptateurs concrets (`lib.rs::run`) : `Projects`, `LocalFiles`, `PostgresDriver`, `ClickhouseDriver` sont branchés dans `App::new`. Les autres couches ne voient que des traits.

### Contextes bornés (modules de `domain`)

| Module | Contenu | Ports (traits) |
|---|---|---|
| `datasource` | `ConnectionConfig`, `DriverKind`, `TlsMode` | `DataSourceRepository` (config + mot de passe) |
| `engine` | contrat d'un moteur de base | `Driver`, `Session` |
| `query` | `Row`, `Column`, `PageOutcome`, découpage SQL (`split_statements`, `Dialect`) | `ResultSink` |
| `catalog` | arbre de l'explorateur (`NodeRef`, `TreeNode`, `ObjectRef`), `SchemaSnapshot` pour la complétion | — |
| `project` | `ProjectInfo`, règles de nommage (`validate_name`, `validate_console_name`) | `ProjectRepository`, `ConsoleRepository`, `ProjectFiles` |
| `error` | `Error`, `Result` : l'unique type d'erreur qui traverse les couches | — |

Les règles métier pures (validation d'un nom, découpage d'un script) vivent **dans le domaine**, avec leurs tests unitaires.

### Couche application

Un service par contexte, tous construits par `App::new` et partageant un `Context` (projet ouvert + `SessionRegistry`) :

| Service | Rôle |
|---|---|
| `ConnectionService` | lister / enregistrer / tester / connecter / déconnecter une source |
| `CatalogService` | explorateur, DDL, schéma de complétion, requêtes annexes |
| `QueryService` | exécuter un script (tâche de fond + `RunEvent`), paginer, annuler |
| `ProjectService` | projets, changement de projet (ferme les sessions), import DataGrip |
| `ConsoleService` | consoles SQL du projet |
| `FileService` | dossier du projet (bac à sable) |

Les résultats sont poussés vers l'UI par le port de sortie `RunEvents` ; `BatchingSink` regroupe les lignes (100 d'abord, puis 5 000) avant l'IPC. Les offsets envoyés à l'éditeur sont en **UTF-16** (`query/utf16.rs`).

### Où mettre quoi

- **Nouvelle règle métier** → `domain`, dans le module de son contexte, avec un test.
- **Nouveau cas d'usage** → méthode d'un service de `application` (ou nouveau service ajouté à `App`), qui ne parle qu'aux ports.
- **Nouvel accès disque / réseau / OS** → un trait dans `domain` (port), une implémentation dans `infrastructure/*`, branchée dans `apps/desktop/src-tauri/src/lib.rs`.
- **Nouvelle commande IPC** → `apps/desktop/src-tauri/src/commands/<contexte>.rs` : désérialiser, appeler **un** service, convertir l'erreur. Rien de plus. L'enregistrer dans `generate_handler!`, puis l'ajouter à `web/src/shared/api` (`backend.ts`, `tauri.ts`, `mock.ts`).
- **Nouveau moteur de base** → nouveau crate `crates/infrastructure/<moteur>` qui implémente `Driver` + `Session`, une variante de `DriverKind`, et `.with(MonDriver)` dans la racine de composition. Aucun autre crate ne change.

### Erreurs

Tout cas d'usage renvoie `datowl_domain::Result`. Les erreurs propres à un adaptateur (`StoreError`, erreurs tokio-postgres, reqwest) sont converties en `domain::Error` **dans l'adaptateur** (`impl From<StoreError> for Error`). Le desktop n'a qu'une conversion : `domain::Error → CommandError` (message + position dans la requête).

### Performance : à préserver

Le chemin de fetch est mesuré ; ne pas le dégrader sans le re-mesurer.
- Pagination côté serveur (curseur Postgres, réponse HTTP ClickHouse gardée ouverte).
- Format texte, pas de décodage de types : une valeur = une `String` prête à afficher.
- Dans les boucles par ligne : pas de future recréé par ligne (`cancel.cancelled()` est créé une fois), pas d'allocation évitable.
- `mimalloc` est l'allocateur global de l'app (−30 % de CPU sur le fetch).
- Deux connexions par source Postgres : l'explorateur ne doit jamais attendre derrière une requête longue.

---

## Front : feature-based

```
web/src/
  main.tsx                 amorçage : choix du backend (Tauri ou mock), chargement initial
  app/                     composition de l'application, rien de réutilisable
    App.tsx                assemblage des fenêtres d'outils
    layout/                MainToolbar, StatusBar, CommandPalette, EditorArea, toolWindows
    styles/app.css         styles globaux
  features/
    connections/           sources de données : store, dialogue, mot de passe, URL JDBC
    projects/              projets, import DataGrip
    explorer/              arbre de la base, filtres de schéma, actions sur objets
    editor/                éditeur SQL Monaco, complétion, vue DDL
    query/                 exécution (runner), résultats, grille, profil de colonnes, Services
    files/                 fenêtre Files (dossier du projet)
    workspace/             onglets ouverts (modèle)
    updates/               mises à jour de l'app
  shared/                  sans aucune connaissance métier des features
    api/                   contrat IPC : types, backend Tauri, backend mock
    ui/                    composants génériques : Modal, IconButton, ContextMenu, AskDialog, NodeIcon
    model/                 stores transverses : ui (panneaux, dialogues), output (journal), storage
    lib/                   utilitaires purs (sql.ts)
```

### Anatomie d'une feature

```
features/<nom>/
  index.ts         API publique : la SEULE porte d'entrée depuis l'extérieur
  components/      composants React de la feature
  model/           stores zustand et logique d'état
  lib/             fonctions pures, adaptateurs, constantes
```

Un dossier n'existe que s'il a du contenu. `index.ts` ne réexporte que ce que d'autres parties de l'app utilisent vraiment.

### Règles d'import

| Depuis | Peut importer | Interdit |
|---|---|---|
| `app/` | `@/features/<x>` (index), `@/shared/...` | fichiers internes d'une feature |
| `features/<x>/` | ses propres fichiers en **chemin relatif** ; `@/features/<y>` (index seulement) ; `@/shared/...` | `@/app/...`, `@/features/<y>/model/...` (import profond) |
| `shared/` | `shared/` seulement | `@/features/...`, `@/app/...` |

- Entre features : **toujours** `import { … } from '@/features/<y>'`, jamais un fichier interne.
- **Pas de cycle entre features.** Graphe actuel (à garder acyclique) :
  `query → connections, workspace` · `editor → connections, query, workspace` · `explorer → connections, query, workspace` · `files → connections, projects, workspace` · `projects → connections` · `connections → workspace` · `workspace`, `updates` → rien.
- Si deux features ont besoin l'une de l'autre, inverser la dépendance : la feature « en aval » s'abonne au store de l'autre (exemple : `explorer/model/treeStore.ts` écoute `useConnections` pour oublier l'arbre d'une source supprimée, au lieu que `connections` appelle l'explorateur). Si une orchestration touche plusieurs features, elle va dans `app/`.
- Tout appel au backend passe par `backend` de `@/shared/api`. Jamais `invoke` direct dans une feature.

Vérification rapide des règles :

```bash
grep -rn "from '@/\(features\|app\)" web/src/shared        # doit être vide
grep -rn "from '@/app" web/src/features                    # doit être vide
grep -rnE "from '@/features/[a-z]+/" web/src               # doit être vide (pas d'import profond)
```

### Où mettre quoi

- **Nouvelle fonctionnalité métier** → nouveau dossier `features/<nom>/` avec son `index.ts`, branché dans `app/`.
- **Composant réutilisé par plusieurs features et sans logique métier** → `shared/ui/`.
- **Un store qui ne sert qu'à une feature** → `features/<nom>/model/`, jamais dans `shared/model/`.
- **Un type ou un appel IPC** → `shared/api/types.ts` + `backend.ts`, puis `tauri.ts` et `mock.ts` (le mock doit rester fonctionnel : `npm --prefix web run dev` sert de démo).

### Performance de la grille

Les lignes de résultat vivent hors du state React (`query/lib/buffer.ts`) et la grille Glide est en canvas : ne pas faire passer les lignes par un store zustand ni par un `useState`.

---

## Conventions

- Commentaires et identifiants en anglais ; documentation (README, AGENTS.md, docs/) en français.
- Commentaires rares : ils expliquent un **pourquoi** non évident (choix de perf, contrainte du protocole), pas le quoi.
- Rust : édition 2021, erreurs via `thiserror`, pas de `unwrap()` hors tests et invariants documentés (`expect("… lock poisoned")`).
- TypeScript strict, alias `@/` = `web/src/`.
- Pas de nouvelle dépendance sans raison mesurable.

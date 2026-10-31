# Datowl

IDE base de données façon DataGrip, pour **PostgreSQL** et **ClickHouse**. Backend en Rust (Tauri 2), interface en React.

## Lancer

```bash
cd web && npm install && cd ../apps/desktop && npm install
npm --prefix apps/desktop run dev      # app desktop (Rust + React)
npm --prefix web run dev               # UI seule dans un navigateur, avec un backend de démo
npm --prefix apps/desktop run build    # Datowl.app + .dmg
npm --prefix site run dev              # landing page (Next.js), http://localhost:3210
npm --prefix site run build            # export statique dans site/out/, à héberger tel quel
```

## Organisation

Backend en DDD (domaine → application → infrastructure, interface Tauri), front organisé par features. Règles détaillées dans [AGENTS.md](AGENTS.md).

```
crates/
  domain/           modèle, règles métier et ports (Driver/Session, repositories) — aucune I/O
  application/      cas d'usage : connexions, exécution des requêtes, catalogue, projets, consoles
  infrastructure/
    postgres/       moteur tokio-postgres (pagination par curseur serveur, notices, DDL)
    clickhouse/     moteur HTTP (TSV en streaming, sessions, KILL QUERY)
    store/          sources (JSON), mots de passe (Trousseau macOS), consoles, dossier projet
apps/desktop/       interface : commandes IPC Tauri, racine de composition
web/src/
  app/              assemblage de l'interface (layout, barre d'outils, zone d'édition)
  features/         connections, projects, explorer, editor, query, files, workspace, updates
  shared/           contrat IPC (api), composants génériques (ui), stores transverses (model)
site/               landing page Next.js (bouton d'installation selon l'OS, depuis la dernière release)
```

## Choix qui comptent pour la vitesse

- **Pagination côté serveur.** Postgres : `DECLARE CURSOR` + `FETCH` ; ClickHouse : la réponse HTTP reste ouverte et on lit les lignes à la demande. `SELECT * FROM table_énorme` affiche ses 500 premières lignes immédiatement.
- **Pas de décodage de types.** Postgres envoie le format texte du protocole simple, ClickHouse du `TabSeparated` découpé avec `memchr` : les valeurs arrivent déjà prêtes à afficher.
- **Lots adaptatifs vers l'UI.** 100 lignes d'abord pour un premier affichage instantané, puis des lots de 5 000.
- **Grille canvas.** Les lignes vivent dans un tableau hors du state React ; la grille dessine seulement ce qui est visible.
- **Deux connexions par source Postgres.** L'explorateur et la complétion ne restent jamais bloqués derrière une requête longue.

Mesuré : 200 000 lignes × 3 colonnes récupérées et décodées en ~330 ms (release, Postgres local).

## Raccourcis

| Action | Raccourci |
| --- | --- |
| Exécuter l'instruction sous le curseur (ou la sélection) | ⌘↵ |
| Exécuter tout le script | ⇧⌘↵ |
| DDL de l'objet sélectionné | ⌘B |
| Afficher/masquer l'explorateur | ⌘1 |
| Afficher/masquer Services | ⌘8 |
| Sources de données | ⌘; |

## Tests

```bash
cargo test                                   # tests unitaires
# Tests d'intégration Postgres : une base jetable avec auth trust pour l'utilisateur datowl
psql -h localhost -p 55432 -U datowl -d postgres -f crates/infrastructure/postgres/tests/fixture.sql
DATOWL_TEST_PG_PORT=55432 cargo test -p datowl-postgres --test live
```

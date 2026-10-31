# Benchmarks : Datowl, DataGrip, DBeaver

Mesures faites le 31 octobre 2026, sur une seule machine Linux, avec la même méthode pour les trois applications. Tous les chiffres viennent de `results.json`, qui contient aussi chaque valeur brute. Les journaux complets (processus, fenêtres, progression de l'affichage) sont dans `raw/`, et les captures du premier écran dans `screenshots/`. Aucune valeur n'est estimée : ce qui n'a pas pu être mesuré vaut `null`, et la raison est donnée plus bas.

## Machine et versions

| | |
|---|---|
| CPU | Intel Xeon @ 2,10 GHz, 4 vCPU (VM KVM/Firecracker), sans GPU |
| RAM | 15,7 Go |
| OS | Ubuntu 24.04.5 LTS, noyau 6.18 |
| Affichage | Xvfb 1920×1080×24 + Openbox, rendu logiciel (Mesa llvmpipe) |
| PostgreSQL | 16.15, local, port 55432 |
| Datowl | 0.1.0, build release de ce dépôt (`npx tauri build --no-bundle`), WebKitGTK 2.52.6 |
| DataGrip | 2026.2.6.1 (build 262.11879.103), tarball officiel JetBrains, JBR 25.0.4.1 |
| DBeaver Community | 26.2.3, tarball officiel (GitHub), Java 25.0.4.1 embarqué |

## Résultats (médiane de 5 lancements)

« Chaud » : fichiers de l'app déjà dans le cache disque, après un lancement de chauffe non compté. « Froid » : cache disque vidé (`drop_caches`) juste avant chaque lancement.

| | Datowl | DataGrip | DBeaver (1er écran) | DBeaver (configuré) |
|---|---|---|---|---|
| Écran affiché à +30 s | espace de travail complet | contrat utilisateur JetBrains | assistant « Product Configuration » | espace de travail complet |
| Première fenêtre visible, chaud | 0,20 s | 4,03 s | 0,43 s (splash) | 0,44 s (splash) |
| Écran prêt (*visually complete*), chaud | **2,29 s** | 4,37 s | 4,47 s | 6,28 s |
| Écran prêt, froid | **2,84 s** | 5,62 s | 6,17 s | 8,26 s |
| Temps CPU total, lancement → +30 s | **7,8 s** | 15,8 s | 37,1 s | 18,0 s |
| CPU au repos (moyenne de +20 à +30 s) | **0,03 %** d'un cœur | 1,7 % | 100,6 % (voir limites) | 1,9 % |
| Mémoire PSS à +30 s, tous processus | 473 Mo | 809 Mo | **311 Mo** | 528 Mo |
| Taille sur disque | **14,9 Mo** (+ WebKitGTK système, 128 Mo) | 2 957 Mo | 213 Mo | 213 Mo |

Requête `SELECT * FROM bench_rows` (200 000 lignes × 3 colonnes) :

| | Datowl (moteur seul, sans UI) | DataGrip | DBeaver |
|---|---|---|---|
| Première ligne | 1,8 ms | `null` | `null` |
| Première page de 500 lignes | 2,1 ms | `null` | `null` |
| 200 000 lignes | 188 ms (valeurs : 116 à 297 ms) | `null` | `null` |

### Lecture honnête

- **Démarrage et CPU** : sur cette machine, Datowl affiche son interface complète avant que DataGrip n'affiche son contrat utilisateur, et avant que DBeaver n'affiche son assistant ou son espace de travail. Pour ses 30 premières secondes, Datowl consomme environ deux fois moins de temps CPU que DataGrip ou que DBeaver configuré.
- **Mémoire** : Datowl (473 Mo, processus WebKit compris) n'est **pas** le plus léger dans tous les cas. Il consomme plus que DBeaver bloqué sur son assistant de premier lancement (311 Mo, l'espace de travail n'y est pas encore chargé), mais moins que DBeaver avec son espace de travail ouvert (528 Mo) et moins que DataGrip, qui occupe déjà 809 Mo pour afficher son seul contrat utilisateur. La comparaison à état équivalent (application prête à l'emploi) est celle avec « DBeaver (configuré) ».
- **DataGrip** n'a pas pu être mesuré au-delà de son premier écran, faute de licence (voir limites). Ses chiffres sont donc un plancher : l'IDE réellement ouvert consomme au moins autant.
- **Disque** : le binaire Datowl fait 14,9 Mo, mais il s'appuie sur WebKitGTK installé par le système (128 Mo pour `libwebkit2gtk-4.1-0` et `libjavascriptcoregtk-4.1-0`, sans leurs dépendances). DataGrip et DBeaver embarquent leur propre JVM.

## Méthode

Tout est automatisé dans `scripts/`. Un lancement se déroule ainsi (`measure_launch.py`) :

1. **Environnement neuf.** Avant chaque lancement, on démarre un nouveau serveur Xvfb et un nouvel Openbox (`restart_display.sh`), et l'app reçoit un `HOME` vide. Ce même dossier sert aussi de `user.home` pour les JVM, via `-Duser.home` dans `JAVA_TOOL_OPTIONS`, car Java lit le dossier personnel dans `/etc/passwd` et non dans `$HOME`. Chaque lancement voit donc le même premier écran.
2. **Isolation des processus.** L'app est lancée dans son propre cgroup `cpuacct`. Tous les processus qu'elle crée y sont comptés, y compris `WebKitWebProcess` et `WebKitNetworkProcess` pour Datowl (DBeaver configuré en lance aussi) et `fsnotifier` pour DataGrip.
3. **Première fenêtre visible** : délai entre l'`exec` et le moment où une fenêtre de l'app apparaît dans la liste des clients du gestionnaire de fenêtres (`_NET_CLIENT_LIST`), à l'état `IsViewable`. Sondage toutes les 10 ms. Un splash compte comme fenêtre visible.
4. **Écran prêt (*visually complete*)** : toutes les 50 ms, l'écran est échantillonné sur une grille de 24 lignes × 30 cellules de 64 px, chaque cellule réduite à une empreinte. La mesure est le premier instant à partir duquel au moins 98 % des cellules modifiées par l'app restent identiques à l'écran final à +30 s. Le critère « la fenêtre contient des pixels » est inutilisable sous Xvfb sans compositeur : une fenêtre affichée mais pas encore dessinée y montre des pixels résiduels (le splash, ou l'app lancée juste avant). Les captures toutes les 250 ms (option `--frames`) ont confirmé que la mesure correspond à l'apparition réelle de l'écran.
5. **CPU** : `cpuacct.usage` du cgroup (user+sys de tous les processus). On relève le total à +30 s et la moyenne entre +20 s et +30 s (« au repos »).
6. **Mémoire** : somme des `Pss` de `/proc/<pid>/smaps_rollup` pour tous les processus du cgroup à +30 s. Le PSS répartit les pages partagées entre les processus qui les utilisent. Il évite ainsi de compter deux fois les bibliothèques partagées, contrairement au RSS.
7. Capture d'écran à +30 s, puis arrêt de tout le cgroup (SIGTERM, puis SIGKILL).

Les lancements alternent les applications (Datowl, DataGrip, DBeaver, DBeaver configuré, puis on recommence) pour répartir une éventuelle dérive de la machine sur toutes. Un lancement de chauffe par app n'est pas compté. Viennent ensuite 5 tours « chauds », puis 5 tours « froids ».

**DBeaver (configuré)** : `prepare_dbeaver_profile.sh` lance DBeaver une fois, valide l'assistant de premier lancement avec ses valeurs par défaut (« Apply ») puis quitte DBeaver normalement. Le profil obtenu est recopié dans le `HOME` neuf de chaque lancement. Aucun compte n'est nécessaire.

**Taille sur disque** : `du -sb` du dossier extrait, mesuré avant le premier lancement, car DBeaver écrit ensuite son cache OSGi dans son propre dossier d'installation. Pour Datowl, la taille du binaire, plus à part l'`Installed-Size` des paquets WebKitGTK.

**Requête (Datowl)** : `scripts/datowl-fetch-bench` est un petit programme autonome (hors workspace) qui utilise `datowl-postgres` exactement comme l'app, avec le même allocateur (mimalloc). Chaque mesure ouvre une connexion neuve puis exécute `SELECT * FROM bench_rows`, une fois avec une page de 500 lignes (la taille par défaut de l'UI) et une fois avec une page de 200 000 lignes. Un tour de chauffe n'est pas compté, puis viennent 5 tours. La table est créée par `setup_postgres.sh` : `id bigint`, `label text` (md5), `created_at timestamptz`, 200 000 lignes, 17 Mo.

## Limites

- **Une seule machine virtuelle Linux, sans GPU.** WebKitGTK (Datowl) dessine en logiciel avec llvmpipe, ce qui pèse sur son temps d'affichage et sur la mémoire du `WebKitWebProcess` (environ 300 Mo). Sur macOS (WKWebView, GPU), les chiffres seront différents : ils n'ont **pas** été mesurés ici et ne doivent pas être déduits de ceux-ci.
- **DataGrip** s'arrête sur le contrat utilisateur JetBrains (capture `screenshots/datagrip-first-screen.png`). Après ce contrat, il faut une licence ou un essai lié à un compte JetBrains, exclus par le protocole. L'IDE réellement ouvert (projet, console) n'a donc pas été mesuré.
- **CPU au repos de DBeaver au premier écran (100 %)** : c'est une mesure réelle et reproductible (10 lancements sur 10). `jstack` montre le thread UI qui tourne en boucle dans `GTK3.gtk_events_pending` / `Display.readAndDispatch`, à l'intérieur de `ProductConfigWizardDialog.open`. Ce comportement est propre à cet assistant de premier lancement, ici sous Xvfb. Il n'est pas représentatif d'un DBeaver configuré, qui reste à 1,9 % au repos. Ne pas le présenter comme le CPU au repos habituel de DBeaver.
- **Cache « froid »** : `drop_caches` vide le cache de la VM, mais l'hôte peut garder l'image disque en cache. Le « froid » mesuré est donc relatif.
- **Services de session non comptés** : le bus D-Bus de session et les services qu'il active (at-spi, xdg-desktop-portal, xdg-document-portal, xdg-permission-store) tournent hors du cgroup des apps. Ils ne sont comptés pour aucune d'elles. Un relevé ponctuel les a mesurés à environ 21 Mo de PSS au total.
- **Réseau** : les apps avaient un accès Internet sortant, via le proxy de l'environnement (variables d'environnement et `JAVA_TOOL_OPTIONS`). Les éventuels appels réseau au démarrage (mises à jour, télémétrie) font partie de la mesure.
- **Variabilité de la mémoire** : le PSS dépend des autres processus qui partagent les mêmes bibliothèques. Une série préliminaire, écartée parce que l'affichage n'était pas réinitialisé entre les lancements, donnait des PSS inférieurs de 40 à 65 Mo pour **chacune** des apps. L'ordre entre les apps était le même. La série publiée est la seule faite avec le protocole final.
- **Requêtes, DataGrip et DBeaver (`null`)** : DataGrip n'ouvre aucune console sans accepter le contrat puis activer une licence. Pour DBeaver, on pourrait piloter l'interface (connexion, éditeur SQL, « Fetch all rows », sa page par défaut étant de 200 lignes). Mais la seule indication de fin est un texte dans la barre d'état : sans signal fiable, la mesure ne serait pas reproductible. Nous n'avons pas non plus publié de mesure du seul pilote JDBC : ce ne serait pas l'application.
- **Requêtes, Datowl** : le chiffre couvre le moteur (connexion, curseur serveur, décodage en texte), pas l'IPC vers l'interface ni l'affichage de la grille. Il ne se compare donc pas à un temps mesuré dans l'interface d'une autre app. Il est aussi assez variable d'un tour à l'autre (116 à 297 ms).

## Reproduire

Prérequis : Ubuntu 24.04, root (cgroup `cpuacct` v1, `drop_caches`), Rust, Node 22.

```bash
apt-get install -y libwebkit2gtk-4.1-dev libsoup-3.0-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev pkg-config build-essential postgresql-16 xvfb openbox xdotool wmctrl \
  x11-utils x11-xserver-utils imagemagick dbus-x11
python3 -m venv /opt/bench/venv && /opt/bench/venv/bin/pip install python-xlib

# Datowl
npm --prefix web ci && npm --prefix apps/desktop ci
(cd apps/desktop && npx tauri build --no-bundle)        # -> target/release/Datowl

# DataGrip et DBeaver, extraits à neuf (jamais lancés)
mkdir -p /opt/bench/apps && cd /opt/bench/apps
curl -LO https://download.jetbrains.com/datagrip/datagrip-2026.2.6.1.tar.gz && tar xzf datagrip-2026.2.6.1.tar.gz
curl -LO https://github.com/dbeaver/dbeaver/releases/download/26.2.3/dbeaver-ce-26.2.3-linux-x86_64.tar.gz && tar xzf dbeaver-ce-26.2.3-linux-x86_64.tar.gz
cd -

# Mesures (environ 35 min), puis agrégation
docs/benchmarks/scripts/run_all.sh                       # OUT=/tmp/datowl-bench par défaut
/opt/bench/venv/bin/python docs/benchmarks/scripts/aggregate.py /tmp/datowl-bench docs/benchmarks
```

Variables utiles de `run_all.sh` : `DATOWL_BIN`, `DATAGRIP_DIR`, `DBEAVER_DIR`, `RUNS` (5 par défaut), `OUT`.

| Script | Rôle |
|---|---|
| `setup_postgres.sh` | cluster PostgreSQL 16 jetable (port 55432, auth `trust`, rôle `datowl`), fixture de test et table `bench_rows` |
| `start_display.sh` / `restart_display.sh` | Xvfb, Openbox et bus D-Bus de session ; nouveau serveur X avant chaque lancement |
| `measure_launch.py` | un lancement : fenêtres, écran prêt, CPU, PSS, capture ; sortie JSON |
| `prepare_dbeaver_profile.sh` | profil DBeaver avec l'assistant de premier lancement validé |
| `datowl-fetch-bench/` | bench du chemin de fetch PostgreSQL de Datowl |
| `run_all.sh` | enchaîne tout et écrit les données brutes |
| `aggregate.py` | médianes, versions et machine → `results.json`, `raw/`, `screenshots/` |

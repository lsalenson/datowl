import { Benchmarks } from '@/components/Benchmarks';
import { Footer } from '@/components/Footer';
import { HeroStage } from '@/components/HeroStage';
import { InstallButton } from '@/components/InstallButton';
import { InstallGrid } from '@/components/InstallGrid';
import { Nav } from '@/components/Nav';

const STATS: [string, string][] = [
  ['330 ms', 'pour 200 000 lignes récupérées et décodées'],
  ['100', 'lignes affichées avant même la fin de la requête'],
  ['2', 'connexions par source : l’explorateur ne bloque jamais'],
  ['0 €', 'aucun compte, aucune limite, aucun abonnement'],
];

const FAQ: [string, string][] = [
  ['Qu’est-ce que Datowl ?', 'Un IDE de bureau pour PostgreSQL et ClickHouse : explorateur de schéma, éditeur SQL avec complétion, grille de résultats rapide et panneau Output. Il est écrit en Rust avec une interface React.'],
  ['Datowl est-il vraiment gratuit ?', 'Oui. Pas de compte, pas d’abonnement, pas de version limitée.'],
  ['Quelles bases de données sont prises en charge ?', 'PostgreSQL et ClickHouse, avec des pilotes natifs. Les bases compatibles avec le protocole PostgreSQL fonctionnent aussi.'],
  ['Sur quels systèmes fonctionne Datowl ?', 'macOS, Windows et Linux. Le bouton d’installation détecte votre système et télécharge directement la bonne version.'],
  ['Où sont stockés mes mots de passe ?', 'Dans le trousseau sécurisé de votre système. Les sources de données sont enregistrées localement, rien ne quitte votre machine.'],
  ['Comment se font les mises à jour ?', 'Datowl vérifie au démarrage puis toutes les six heures. Une notification propose « Update and Restart » : la mise à jour est téléchargée, sa signature vérifiée, puis l’app redémarre.'],
  ['macOS affiche « développeur non identifié » ?', 'Au premier lancement, faites un clic droit sur Datowl puis Ouvrir. Les lancements suivants et les mises à jour se font normalement.'],
];

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <Nav />

      <main>
        <section className="frame hero-head">
          <h1>
            Datowl<span className="dot">.</span>
          </h1>
        </section>

        <HeroStage />

        <div className="rule">
          <section className="frame stats">
            {STATS.map(([value, label], i) => (
              <div key={value} className="stat" data-reveal style={{ '--i': i } as React.CSSProperties}>
                <span className="stat-value">{value}</span>
                <span className="stat-label">{label}</span>
              </div>
            ))}
          </section>
        </div>

        <Benchmarks />

        <InstallGrid />

        <div className="rule">
          <section className="frame faq" id="faq">
            <h2 className="section-title" data-reveal>
              Questions fréquentes.
            </h2>
            <div className="faq-list">
              {FAQ.map(([q, a], i) => (
                <details key={q} data-reveal style={{ '--i': i } as React.CSSProperties}>
                  <summary>
                    {q}
                    <Chevron />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <section className="cta">
          <div className="cta-inner">
            <h2 data-reveal>Démarrer.</h2>
            <InstallButton />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

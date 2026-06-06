"use client";

import { useEffect, useState } from "react";
import WaitlistForm from "./WaitlistForm";
import { Icon } from "./icons";
import { DICT, LANGS, type Lang } from "@/lib/i18n";

// To use a REAL logo: drop an image at apps/web/public/logos/<slug>.svg
// (or .png and change EXT). If the file is missing, a colored monogram crest is
// shown instead. `short` = monogram text, `color` = brand color for the crest.
type Uni = { name: string; slug: string; short: string; color: string };
const UNIS: Uni[] = [
  { name: "Harvard", slug: "harvard", short: "H", color: "#A51C30" },
  { name: "Stanford", slug: "stanford", short: "S", color: "#8C1515" },
  { name: "MIT", slug: "mit", short: "MIT", color: "#A31F34" },
  { name: "Yale", slug: "yale", short: "Y", color: "#00356B" },
  { name: "Princeton", slug: "princeton", short: "P", color: "#E77500" },
  { name: "Columbia", slug: "columbia", short: "C", color: "#1D4F91" },
  { name: "UC Berkeley", slug: "berkeley", short: "Cal", color: "#003262" },
  { name: "Cornell", slug: "cornell", short: "C", color: "#B31B1B" },
  { name: "UChicago", slug: "uchicago", short: "U", color: "#800000" },
  { name: "UPenn", slug: "upenn", short: "P", color: "#011F5B" },
  { name: "Caltech", slug: "caltech", short: "Ct", color: "#FF6C0C" },
  { name: "Duke", slug: "duke", short: "D", color: "#00539B" },
  { name: "Johns Hopkins", slug: "jhu", short: "JH", color: "#002D72" },
  { name: "Brown", slug: "brown", short: "B", color: "#4E3629" },
  { name: "NYU", slug: "nyu", short: "NYU", color: "#57068C" },
  { name: "UCLA", slug: "ucla", short: "UCLA", color: "#2774AE" },
  { name: "Carnegie Mellon", slug: "cmu", short: "CMU", color: "#C41230" },
  { name: "Michigan", slug: "michigan", short: "M", color: "#00274C" },
];

const LOGO_EXT = "svg"; // change to "png" if you add PNG files

function UniMark({ u }: { u: Uni }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="lp-uni">
      {broken ? (
        <span className="lp-mono" style={{ ["--c" as string]: u.color }}>
          {u.short}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="lp-logo-img"
          src={`/logos/${u.slug}.${LOGO_EXT}`}
          alt={u.name}
          onError={() => setBroken(true)}
        />
      )}
      <span>{u.name}</span>
    </span>
  );
}

function Marquee({ reverse = false }: { reverse?: boolean }) {
  return (
    <div className={`lp-marquee ${reverse ? "rev" : ""}`}>
      {[0, 1].map((dup) => (
        <div className="lp-track" key={dup} aria-hidden={dup === 1}>
          {UNIS.map((u) => (
            <UniMark u={u} key={`${dup}-${u.slug}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

const FEATURE_ICONS = ["intake", "polish", "essay", "extension", "vault", "agency"];

export default function LandingClient() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = (typeof window !== "undefined" &&
      localStorage.getItem("lang")) as Lang | null;
    if (saved && DICT[saved]) setLang(saved);
  }, []);

  function choose(l: Lang) {
    setLang(l);
    try {
      localStorage.setItem("lang", l);
    } catch {}
    document.documentElement.lang = l;
  }

  const t = DICT[lang];

  return (
    <div className="lp">
      <div className="lp-bg">
        <div className="lp-grid" />
        <div className="lp-blob b1" />
        <div className="lp-blob b2" />
        <div className="lp-blob b3" />
        <div className="lp-scan" />
      </div>

      <header className="lp-nav">
        <span className="lp-logo">
          <span className="dot">◆</span> Common AI
        </span>
        <span className="spacer" />
        <a href="#how">{t.nav.how}</a>
        <a href="#waitlist">{t.nav.waitlist}</a>
        <div className="lp-langs" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={lang === l.code ? "active" : ""}
              onClick={() => choose(l.code)}
              type="button"
            >
              {l.label}
            </button>
          ))}
        </div>
        <a className="btn-ghost" href="/login">
          {t.nav.signin}
        </a>
      </header>

      {/* HERO */}
      <section className="lp-wrap lp-hero">
        <span className="lp-pill">
          <span className="ping" /> {t.pill}
        </span>
        <h1 className="lp-title">
          {t.title1} <span className="grad">{t.title2}</span>
        </h1>
        <p className="lp-sub">{t.subtitle}</p>

        <div id="waitlist">
          <WaitlistForm t={t.form} />
        </div>
        <p className="lp-disclaimer">{t.disclaimer}</p>
      </section>

      {/* MARQUEE */}
      <section className="lp-wrap">
        <p className="lp-marquee-label">{t.marquee}</p>
      </section>
      <div style={{ display: "grid", gap: 14 }}>
        <Marquee />
        <Marquee reverse />
      </div>

      {/* FEATURES */}
      <section className="lp-wrap" id="how">
        <h2 className="lp-section-h">{t.features.title}</h2>
        <p className="lp-section-p">{t.features.sub}</p>
        <div className="lp-features">
          {t.f.map((feat, i) => (
            <div className="lp-card" key={i}>
              <div className="lp-ic">
                <Icon name={FEATURE_ICONS[i]} />
              </div>
              <h3>{feat.t}</h3>
              <p>{feat.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* STEPS */}
      <section className="lp-wrap">
        <h2 className="lp-section-h">{t.steps.title}</h2>
        <div className="lp-steps">
          {t.s.map((step, i) => (
            <div className="lp-step" key={i}>
              <div className="n">{i + 1}</div>
              <h4>{step.t}</h4>
              <p>{step.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="lp-footer">
        © {new Date().getFullYear()} {t.footer}
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import WaitlistForm from "./WaitlistForm";
import { Icon } from "./icons";
import { DICT, LANGS, type Lang } from "@/lib/i18n";

// Real logos are loaded at runtime from a logo service by the school's domain,
// with a favicon fallback, then a colored monogram if both fail. To self-host
// instead, drop a file at public/logos/<slug>.svg and add it as the first
// candidate in logoCandidates(). `short`/`color` = monogram fallback.
type Uni = { name: string; slug: string; short: string; color: string; domain: string };
const UNIS: Uni[] = [
  { name: "Harvard", slug: "harvard", short: "H", color: "#A51C30", domain: "harvard.edu" },
  { name: "Stanford", slug: "stanford", short: "S", color: "#8C1515", domain: "stanford.edu" },
  { name: "MIT", slug: "mit", short: "MIT", color: "#A31F34", domain: "mit.edu" },
  { name: "Yale", slug: "yale", short: "Y", color: "#00356B", domain: "yale.edu" },
  { name: "Princeton", slug: "princeton", short: "P", color: "#E77500", domain: "princeton.edu" },
  { name: "Columbia", slug: "columbia", short: "C", color: "#1D4F91", domain: "columbia.edu" },
  { name: "UC Berkeley", slug: "berkeley", short: "Cal", color: "#003262", domain: "berkeley.edu" },
  { name: "Cornell", slug: "cornell", short: "C", color: "#B31B1B", domain: "cornell.edu" },
  { name: "UChicago", slug: "uchicago", short: "U", color: "#800000", domain: "uchicago.edu" },
  { name: "UPenn", slug: "upenn", short: "P", color: "#011F5B", domain: "upenn.edu" },
  { name: "Caltech", slug: "caltech", short: "Ct", color: "#FF6C0C", domain: "caltech.edu" },
  { name: "Duke", slug: "duke", short: "D", color: "#00539B", domain: "duke.edu" },
  { name: "Johns Hopkins", slug: "jhu", short: "JH", color: "#002D72", domain: "jhu.edu" },
  { name: "Brown", slug: "brown", short: "B", color: "#4E3629", domain: "brown.edu" },
  { name: "NYU", slug: "nyu", short: "NYU", color: "#57068C", domain: "nyu.edu" },
  { name: "UCLA", slug: "ucla", short: "UCLA", color: "#2774AE", domain: "ucla.edu" },
  { name: "Carnegie Mellon", slug: "cmu", short: "CMU", color: "#C41230", domain: "cmu.edu" },
  { name: "Michigan", slug: "michigan", short: "M", color: "#00274C", domain: "umich.edu" },
];

function logoCandidates(u: Uni): string[] {
  // Reliable favicon services that 404 cleanly for unknowns (so onError fires
  // and we fall back to the monogram). Clearbit was dropped — it returns a gray
  // "?" placeholder with a 200 status, which never triggers onError.
  return [
    `https://icons.duckduckgo.com/ip3/${u.domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${u.domain}&sz=64`,
  ];
}

function UniMark({ u }: { u: Uni }) {
  const candidates = logoCandidates(u);
  const [i, setI] = useState(0);
  const failed = i >= candidates.length;
  return (
    <span className="lp-uni">
      {failed ? (
        <span className="lp-mono" style={{ ["--c" as string]: u.color }}>
          {u.short}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="lp-logo-img"
          src={candidates[i]}
          alt={u.name}
          loading="lazy"
          onError={() => setI((n) => n + 1)}
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

  // Cursor spotlight: drive the radial-glow position via CSS variables.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const onMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty("--mx", e.clientX + "px");
      document.documentElement.style.setProperty("--my", e.clientY + "px");
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Constellation: slow-drifting star points connected by faint lines.
  const starsRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = starsRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = 70;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0005,
      vy: (Math.random() - 0.5) * 0.0005,
    }));

    const resize = () => {
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
      }
      ctx.fillStyle = "rgba(170,195,255,.7)";
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = (pts[i].x - pts[j].x) * w;
          const dy = (pts[i].y - pts[j].y) * h;
          const d2 = dx * dx + dy * dy;
          if (d2 < 130 * 130) {
            ctx.strokeStyle = `rgba(120,150,255,${0.12 * (1 - d2 / (130 * 130))})`;
            ctx.beginPath();
            ctx.moveTo(pts[i].x * w, pts[i].y * h);
            ctx.lineTo(pts[j].x * w, pts[j].y * h);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
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
        <canvas ref={starsRef} className="lp-stars" />
        <div className="lp-shoot" style={{ top: "12%", right: "-150px" }} />
        <div className="lp-shoot s2" style={{ top: "34%", right: "-150px" }} />
        <div className="lp-shoot s3" style={{ top: "6%", right: "-150px" }} />
        <div className="lp-scan" />
      </div>
      <div className="lp-spot" aria-hidden="true" />

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
          {t.title1}
          <br />
          <span className="grad">{t.title2}</span>
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

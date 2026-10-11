import { useEffect, useRef } from "react";

const CC_URL = "http://creativecommons.org/licenses/by/4.0/";

const MODELS = [
  { title: "Haunted House (Halloween)", url: "https://skfb.ly/oqxoF", author: "Conrad Justin" },
  { title: "Emerald Bat", url: "https://skfb.ly/owpLM", author: "CataRackta" },
  { title: "Rigged Animated Ghost", url: "https://skfb.ly/oMUDz", author: "Dani" },
];

function ExternalLink({ href, children }) {
  return (
    <a className="hh-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function Credits({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="hh-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="hh-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hh-credits-title"
      >
        <div className="hh-modal__head">
          <h2 id="hh-credits-title" className="hh-modal__title">
            Credits
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="ui-icon-btn"
            onClick={onClose}
            aria-label="Close credits"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <section className="hh-modal__section">
          <h3 className="hh-modal__heading">Sound</h3>
          <p>
            Music by{" "}
            <ExternalLink href="https://pixabay.com/users/soundgallerybydmitrytaras-11640913/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=400868">
              Dmitry Taras
            </ExternalLink>{" "}
            from{" "}
            <ExternalLink href="https://pixabay.com/music//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=400868">
              Pixabay
            </ExternalLink>
            .
          </p>
        </section>
        <section className="hh-modal__section">
          <h3 className="hh-modal__heading">Icon</h3>
          <p>
            Haunted house icon by{" "}
           <ExternalLink href="https://www.flaticon.com/free-icons/haunted-house" title="haunted house icons">Haunted house icons created by Earthz Stocker - Flaticon</ExternalLink>
          </p>
        </section>

        <section className="hh-modal__section">
          <h3 className="hh-modal__heading">3D models</h3>
          <ul className="hh-modal__list">
            {MODELS.map((m) => (
              <li key={m.url}>
                &ldquo;<ExternalLink href={m.url}>{m.title}</ExternalLink>&rdquo; by {m.author} is
                licensed under <ExternalLink href={CC_URL}>Creative Commons Attribution</ExternalLink>.
              </li>
            ))}
          </ul>
        </section>

        <section className="hh-modal__section">
          <h3 className="hh-modal__heading">Website</h3>
          <p>
            Built by <ExternalLink href="https://x.com/Anuj_0720">Anuj</ExternalLink>.
          </p>
        </section>
      </div>
    </div>
  );
}

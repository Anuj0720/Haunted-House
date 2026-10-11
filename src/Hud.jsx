import { Moon, MoonStar, Volume2, VolumeX } from "lucide-react";

function ToggleButton({ on, onClick, label, shortcut, variant, children }) {
  return (
    <button
      type="button"
      className={`ui-panel ui-tbtn ui-tbtn--${variant}${on ? " is-on" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      title={`${label} (${shortcut})`}
    >
      <span className="ui-tbtn__glow" aria-hidden="true" />
      <span className="ui-tbtn__ripple" key={String(on)} aria-hidden="true" />
      {children}
    </button>
  );
}

export default function Hud({
  soundOn,
  onToggleSound,
  bloodOn,
  onToggleBlood,
  moonOn,
  onToggleMoon,
}) {
  return (
    <div className="ui">
      <header className="ui-top">
        <div className="ui-tools">
          <ToggleButton
            variant="blood"
            on={bloodOn}
            onClick={onToggleBlood}
            label={bloodOn ? "Turn blood moon effect off" : "Turn blood moon effect on"}
            shortcut="E"
          >
            <span className="ui-tbtn__icon" aria-hidden="true">
              <Moon size={19} strokeWidth={2} />
            </span>
          </ToggleButton>

          <ToggleButton
            variant="dream"
            on={moonOn}
            onClick={onToggleMoon}
            label={moonOn ? "Turn white moon effect off" : "Turn white moon effect on"}
            shortcut="D"
          >
            <span className="ui-tbtn__icon" aria-hidden="true">
              <MoonStar size={19} strokeWidth={2} />
            </span>
          </ToggleButton>

          <ToggleButton
            variant="sound"
            on={soundOn}
            onClick={onToggleSound}
            label={soundOn ? "Mute sound" : "Unmute sound"}
            shortcut="M"
          >
            <span className="ui-tbtn__icon ui-tbtn__icon--on" aria-hidden="true">
              <Volume2 size={19} strokeWidth={2} />
            </span>
            <span className="ui-tbtn__icon ui-tbtn__icon--off" aria-hidden="true">
              <VolumeX size={19} strokeWidth={2} />
            </span>
          </ToggleButton>
        </div>
      </header>

      <footer className="ui-bottom">
        <p className="ui-hint">Drag to orbit &middot; Scroll to zoom</p>
      </footer>
    </div>
  );
}

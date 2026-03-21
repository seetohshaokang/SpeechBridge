import { BrandLogo } from "./BrandLogo.jsx";

/**
 * Public landing page — shown before sign-in.
 * Describes SpeechBridge features and funnels to auth.
 */
export function LandingPage({
  onGetStarted,
  backendLoading = true,
  backendStatus = null,
}) {
  return (
    <div className="landing">
      {/* ───── Nav ───── */}
      <nav className="landing-nav">
        <div className="landing-brand-lockup">
          <BrandLogo variant="nav" />
          <span className="landing-logo">SpeechBridge</span>
        </div>
        <button className="btn btn--ghost" onClick={onGetStarted}>
          Sign in
        </button>
      </nav>

      {/* ───── Hero ───── */}
      <section className="landing-hero">
        <div className="landing-hero-logo">
          <BrandLogo variant="hero" />
        </div>
        <p className="landing-badge">AI-powered speech coaching</p>
        <h1 className="landing-headline">
          Speak clearly.
          <br />
          <span className="landing-headline--accent">Get heard.</span>
        </h1>
        <p className="landing-sub">
          SpeechBridge transcribes your speech, corrects it with AI, and reads
          the improved version back — so you can practise sounding your best.
        </p>
        <div className="landing-cta-row">
          <button className="btn btn--primary btn--lg" onClick={onGetStarted}>
            Get started — free
          </button>
        </div>
      </section>

      {/* ───── How it works ───── */}
      <section className="landing-section">
        <h2 className="landing-section-title">How it works</h2>
        <p className="landing-section-sub">Three steps. One conversation.</p>

        <ol className="landing-steps">
          <li className="landing-step">
            <div className="landing-step-num">1</div>
            <div>
              <h3>Record or upload</h3>
              <p>
                Speak into the mic or drop an audio file. Gemini's multimodal
                engine transcribes every word.
              </p>
            </div>
          </li>
          <li className="landing-step">
            <div className="landing-step-num">2</div>
            <div>
              <h3>AI correction</h3>
              <p>
                A LangChain agent reviews your transcript, fixes grammar and
                phrasing, and adapts to your personal profile.
              </p>
            </div>
          </li>
          <li className="landing-step">
            <div className="landing-step-num">3</div>
            <div>
              <h3>Listen &amp; learn</h3>
              <p>
                ElevenLabs synthesises natural-sounding audio of the corrected
                text so you can hear the difference.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* ───── Features ───── */}
      <section className="landing-section">
        <h2 className="landing-section-title">Built for real improvement</h2>

        <div className="landing-features">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🎙️</div>
            <h3>Multimodal transcription</h3>
            <p>
              Gemini processes raw audio — no separate STT pipeline needed.
            </p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🧠</div>
            <h3>Context-aware corrections</h3>
            <p>
              Your profile (accent, goals, vocabulary) shapes every suggestion.
            </p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🔊</div>
            <h3>Natural voice playback</h3>
            <p>
              ElevenLabs TTS lets you hear exactly how the corrected sentence
              should sound.
            </p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">📊</div>
            <h3>Session history</h3>
            <p>
              Every session is saved to Convex so you can track progress over
              time.
            </p>
          </div>
        </div>
      </section>

      {/* ───── Architecture glance ───── */}
      <section className="landing-section landing-arch">
        <h2 className="landing-section-title">Under the hood</h2>
        <div className="landing-arch-pills">
          <span className="pill">React</span>
          <span className="pill">FastAPI</span>
          <span className="pill">LangChain</span>
          <span className="pill">Gemini 1.5 Flash</span>
          <span className="pill">ElevenLabs TTS</span>
          <span className="pill">Convex</span>
          <span className="pill">Clerk Auth</span>
        </div>
      </section>

      {/* ───── Final CTA ───── */}
      <section className="landing-section landing-final-cta">
        <h2 className="landing-section-title">Ready to practise?</h2>
        <p className="landing-section-sub">
          Create a free account and start improving your speech today.
        </p>
        <button className="btn btn--primary btn--lg" onClick={onGetStarted}>
          Get started
        </button>
      </section>

      {/* ───── Footer ───── */}
      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} SpeechBridge</span>
      </footer>
    </div>
  );
}

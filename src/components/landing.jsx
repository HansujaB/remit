import { ArrowUpRight, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";

import { SignInButton, SignUpButton } from "@clerk/react";
import { Logo, Scribble } from "./brand";

export function Landing({ authEnabled, onMissing }) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <a href="#/" aria-label="Remit home">
          <Logo />
        </a>
        <div>
          <Button
            className="text-button"
            onClick={() =>
              document
                .getElementById("features")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Features
          </Button>
          {authEnabled ? (
            <SignInButton
              mode="modal"
              forceRedirectUrl={location.origin + "/#/home"}
            >
              <Button className="text-button">
                Log in <ArrowUpRight size={15} />
              </Button>
            </SignInButton>
          ) : (
            <Button className="text-button" onClick={onMissing}>
              Log in <ArrowUpRight size={15} />
            </Button>
          )}
        </div>
      </nav>
      <main>
        <section className="landing-hero">
          <h1>
            Save it. <Scribble single>Find it again.</Scribble>
          </h1>
          <p>Links, PDFs, images, and notes. Organized by topic.</p>
          <div className="hero-actions">
            {authEnabled ? (
              <SignUpButton
                mode="modal"
                forceRedirectUrl={location.origin + "/#/home"}
              >
                <Button className="button primary">
                  Get started <ArrowRight size={17} />
                </Button>
              </SignUpButton>
            ) : (
              <Button className="button primary" onClick={onMissing}>
                Get started <ArrowRight size={17} />
              </Button>
            )}
          </div>
        </section>
        <section className="landing-examples" aria-label="Example saves">
          <article className="example-card">
            <div className="example-preview">
              <svg
                viewBox="0 0 240 160"
                role="img"
                aria-label="Illustrative rangoli pattern"
              >
                <g
                  transform="translate(120 80)"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                >
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                    <g key={angle} transform={`rotate(${angle})`}>
                      <path d="M0 0C-30 -16 -26 -51 0 -56C26 -51 30 -16 0 0Z" />
                      <circle cy="-65" r="2" />
                    </g>
                  ))}
                  <circle r="13" />
                  <circle r="5" />
                </g>
              </svg>
            </div>
            <span className="example-source">PINTEREST · RANGOLI</span>
            <h3>Patterns for your next rangoli</h3>
            <p>Keep pins and reels in the same collection.</p>
          </article>
          <article className="example-card">
            <div className="example-preview">
              <svg
                viewBox="0 0 240 160"
                role="img"
                aria-label="Illustrative system design diagram"
              >
                <g fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="15" y="62" width="52" height="36" rx="5" />
                  <rect x="95" y="62" width="52" height="36" rx="5" />
                  <rect x="180" y="30" width="45" height="30" rx="5" />
                  <rect x="180" y="100" width="45" height="30" rx="5" />
                  <path d="M67 80H95M147 80H163V45H180M163 80V115H180" />
                </g>
                <g fontSize="9" fill="currentColor" textAnchor="middle">
                  <text x="41" y="84">
                    Client
                  </text>
                  <text x="121" y="84">
                    API
                  </text>
                  <text x="202" y="49">
                    Cache
                  </text>
                  <text x="202" y="119">
                    Database
                  </text>
                </g>
              </svg>
            </div>
            <span className="example-source">ARTICLE · SYSTEM DESIGN</span>
            <h3>Understanding distributed systems</h3>
            <p>Bring articles, papers, and posts together.</p>
          </article>
          <article className="example-card">
            <div className="example-preview example-note">
              <span>Design notes</span>
              <strong>
                Space.
                <br />
                Scale.
                <br />
                Contrast.
              </strong>
            </div>
            <span className="example-source">NOTE · DESIGN</span>
            <h3>Notes on visual hierarchy</h3>
            <p>Add your own thoughts alongside your saves.</p>
          </article>
        </section>
        <section className="how-section" id="features">
          <div>
            <span className="eyebrow">FEATURES</span>
            <h2>
              One library.
              <br />
              Organized around you.
            </h2>
          </div>
          <div className="how-steps">
            {[
              [
                "01",
                "Save in one place",
                "Add links, PDFs, images, and notes from a single composer.",
              ],
              [
                "02",
                "Group by topic",
                "Keep related saves together, wherever they came from. Choose and edit their topics.",
              ],
              [
                "03",
                "Find it again",
                "Search titles, notes, and topics. Filter by source and keep favorites close.",
              ],
            ].map(([number, title, text]) => (
              <article key={number}>
                <span className="feature-number">{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <a href="#/" aria-label="Remit home">
          <Logo small />
        </a>
        <span>Your personal library.</span>
      </footer>
    </div>
  );
}

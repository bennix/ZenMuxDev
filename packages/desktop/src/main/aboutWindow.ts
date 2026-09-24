interface CustomAboutDialogHtmlInput {
  applicationName: string;
  appVersion: string;
  copyright: string;
  optimizationLine: string;
  versionLabel: string;
  okButtonLabel: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createCustomAboutDialogHtml(input: CustomAboutDialogHtmlInput): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    />
    <title>${escapeHtml(input.applicationName)}</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        --startup-page-bg: #f4f4f5;
        --about-primary: #0a0a0a;
        --about-primary-foreground: #fafafa;
        --about-primary-active: color-mix(in oklab, var(--about-primary) 80%, transparent);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: var(--startup-page-bg);
      }

      body {
        display: grid;
        place-items: center;
        padding: 0;
        user-select: none;
      }

      .about-window {
        width: 100%;
        max-width: 256px;
        height: 280px;
        display: grid;
        place-items: stretch;
        padding: 0;
        background: transparent;
      }

      .about-card {
        width: 100%;
        height: 100%;
        padding: 22px 15px 14px;
        display: flex;
        flex-direction: column;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: #1d1d1f;
        box-shadow: none;
        -webkit-app-region: drag;
      }

      .content {
        width: 100%;
        max-width: 222px;
        margin: 0 auto;
        flex: 1;
        min-height: 0;
      }

      .app-icon {
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: linear-gradient(180deg, #000000 0%, #151718 100%);
        color: #ffffff;
        box-shadow: 0 10px 13px -3px rgb(0 0 0 / 0.2), 0 4px 5px -3px rgb(0 0 0 / 0.2);
      }

      .app-logo {
        width: 30px;
        height: auto;
        display: block;
      }

      .title {
        margin: 20px 0 0;
        font-size: 13.5px;
        line-height: 1.18;
        font-weight: 700;
        letter-spacing: 0;
      }

      .meta {
        margin-top: 28px;
        display: flex;
        flex-direction: column;
        gap: 17px;
        font-size: 13px;
        line-height: 1.2;
        font-weight: 400;
        letter-spacing: 0;
        color: #303033;
      }


      .ok-button {
        width: 100%;
        height: 36px;
        border: 0;
        border-radius: 18px;
        background: var(--about-primary);
        color: var(--about-primary-foreground);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0;
        outline: none;
        cursor: default;
        -webkit-app-region: no-drag;
      }

      .ok-button:active {
        background: var(--about-primary-active);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --startup-page-bg: #171717;
          --about-primary: #fafafa;
          --about-primary-foreground: #0a0a0a;
          --about-primary-active: color-mix(in oklab, var(--about-primary) 80%, transparent);
        }

        .about-card {
          color: #e8e8e8;
        }

        .meta {
          color: #e2e2e2;
        }
      }
    </style>
  </head>
  <body>
    <main class="about-window" aria-label="${escapeHtml(input.applicationName)} About Window">
      <section class="about-card" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div class="content">
          <div class="app-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="56"
              height="56"
              fill="none"
              viewBox="225 2673 48 48"
              class="app-logo"
              focusable="false"
            >
              <path
                fill="currentColor"
                fill-rule="evenodd"
                d="M247.97 2676.76C250.105 2676.68 254.427 2676.96 257.885 2680.07C260.721 2682.62 261.698 2687.34 261.037 2691C260.431 2694.35 259.004 2697.1 259.563 2699.64C260.122 2702.18 261.545 2703.44 262.756 2703.96C263.926 2704.47 265.056 2704.32 264.841 2705.29C264.625 2706.25 263.163 2706.61 262.095 2706.61C261.509 2706.61 259.738 2706.46 258.953 2705.95C258.024 2705.35 257.817 2704.81 257.464 2704.37C257.404 2704.3 257.298 2704.35 257.312 2704.45C257.473 2705.51 257.917 2707.32 258.637 2708.44C259.22 2709.35 259.461 2710.01 260.797 2711.13C262.132 2712.24 262.756 2713.26 261.457 2713.98C260.304 2714.62 257.797 2713.31 256.322 2711.69C254.995 2710.24 254.071 2708.44 253.705 2707.27C253.51 2706.64 253.314 2705.57 253.119 2704.69C253.093 2704.57 252.935 2704.59 252.931 2704.71C252.866 2706.95 252.514 2709.09 252 2711.38C251.629 2713.03 250.729 2715.04 249.915 2716.26C248.923 2717.75 247.451 2718.21 246.356 2717.81C245.48 2717.48 246.102 2716.37 246.356 2715.42C246.61 2714.46 247.119 2712.46 247.461 2710.26C247.771 2708.27 247.853 2706.31 247.715 2704.44C247.707 2704.33 247.532 2704.31 247.497 2704.42C247.211 2705.3 246.674 2706.74 246.281 2707.63C245.463 2709.46 244.857 2710.27 243.179 2712.2C241.67 2713.94 237.33 2716.4 236.773 2713.98C236.62 2713.32 237.419 2713.03 238.156 2712.46C239.264 2711.59 240.19 2710.06 241.068 2708.18C241.856 2706.5 242.257 2704.88 242.318 2703.84C242.324 2703.74 242.198 2703.7 242.142 2703.78C241.777 2704.32 241.239 2705.04 240.648 2705.64C239.659 2706.65 238.563 2707.68 237.291 2708.18C235.247 2709 233.163 2708.44 233.315 2706.96C233.442 2705.73 234.817 2705.99 236.529 2704.12C238.207 2702.29 238.766 2700.87 238.868 2699.29C238.949 2698.03 237.716 2695.04 237.088 2693.7C236.088 2691.56 235.349 2685.5 238.36 2681.59C242.122 2676.71 246.647 2676.81 247.97 2676.76ZM242.1 2685.3C240.7 2685.3 240 2686.37 240 2687.7C240 2689.03 240.778 2690.1 242.1 2690.1C243.422 2690.1 244.2 2689.03 244.2 2687.7C244.2 2686.37 243.5 2685.3 242.1 2685.3ZM253.5 2685.3C252.1 2685.3 251.4 2686.37 251.4 2687.7C251.4 2689.03 252.178 2690.1 253.5 2690.1C254.822 2690.1 255.6 2689.03 255.6 2687.7C255.6 2686.37 254.9 2685.3 253.5 2685.3Z"
              />
            </svg>
          </div>
          <h1 id="about-title" class="title">
            ${escapeHtml(input.applicationName)}<br />
            ${escapeHtml(input.versionLabel)} ${escapeHtml(input.appVersion)}
          </h1>
          <div class="meta">
            ${input.optimizationLine ? `<div>${escapeHtml(input.optimizationLine)}</div>` : ""}
            <div>${escapeHtml(input.copyright)}</div>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="ok-button" type="button" autofocus>${escapeHtml(input.okButtonLabel)}</button>
      </section>
    </main>
    <script>
      const closeWindow = () => window.close();
      document.querySelector(".ok-button")?.addEventListener("click", closeWindow);
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.key === "Enter") {
          closeWindow();
        }
      });
    </script>
  </body>
</html>`;
}

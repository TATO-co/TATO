// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <title>TATO</title>
        <meta
          name="description"
          content="TATO is the supplier and broker workspace for ingestion, claims, payments, and controlled pilot operations."
        />
        <meta name="theme-color" content="#09172d" />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

const responsiveBackground = `
html, body, #root {
  height: 100%;
  min-height: 100%;
  width: 100%;
}

html {
  background: #050d1b;
}

body {
  margin: 0;
  display: flex;
  background: radial-gradient(circle at top, #0b1f3e 0%, #050d1b 55%, #030a16 100%);
  overflow-y: auto;
  min-height: 100vh;
  min-height: 100dvh;
}

.skip-link {
  position: fixed;
  left: 16px;
  top: 16px;
  z-index: 1000;
  padding: 12px 16px;
  border-radius: 999px;
  border: 1px solid #2b5db0;
  background: #09172d;
  color: #edf4ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
  transform: translateY(-140%);
  transition: transform 160ms ease;
}

.skip-link:focus {
  transform: translateY(0);
}

#root {
  display: flex;
  flex: 1 1 auto;
  min-height: 100vh;
  min-height: 100dvh;
}

@supports (min-height: 100svh) {
  body,
  #root {
    min-height: 100svh;
  }
}`;

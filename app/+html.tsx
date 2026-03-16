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
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
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
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
html, body, #root {
  height: 100%;
  min-height: 100%;
  width: 100%;
}

body {
  margin: 0;
  display: flex;
  background: radial-gradient(circle at top, #0b1f3e 0%, #050d1b 55%, #030a16 100%);
  overflow-y: auto;
}

#root {
  display: flex;
  flex: 1 1 auto;
  min-height: 100vh;
}`;

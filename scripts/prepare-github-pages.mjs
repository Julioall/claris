import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");
const notFoundPath = path.join(distDir, "404.html");
const noJekyllPath = path.join(distDir, ".nojekyll");

// Redirect script for the 404 page — encodes the current path as a query
// parameter and navigates to the app root so index.html is served (200 OK).
// pathSegmentsToKeep = 1 preserves the repo-name segment (e.g. /claris).
// Based on https://github.com/rafgraph/spa-github-pages
const notFoundHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Claris</title>
    <script>
      const pathSegmentsToKeep = 1;
      const l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
        l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      );
    </script>
  </head>
  <body></body>
</html>
`;

// Inject the URL-restoration script into the built index.html so that React
// Router receives the original path after the 404 redirect.
const redirectRestoreScript = `
    <script>
      (function (l) {
        if (l.search[1] === '/') {
          const decoded = l.search.slice(1).split('&').map(function (s) {
            return s.replace(/~and~/g, '&');
          }).join('?');
          window.history.replaceState(null, null,
            l.pathname.slice(0, -1) + decoded + l.hash
          );
        }
      }(window.location));
    </script>`;

let indexHtml = await readFile(indexPath, "utf8");
indexHtml = indexHtml.replace("</head>", redirectRestoreScript + "\n  </head>");
await writeFile(indexPath, indexHtml, "utf8");
await writeFile(notFoundPath, notFoundHtml, "utf8");
await writeFile(noJekyllPath, "", "utf8");

console.log("GitHub Pages artifacts prepared in dist/.");
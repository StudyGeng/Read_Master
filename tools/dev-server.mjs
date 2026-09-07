import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 5500);
const host = "127.0.0.1";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml"
};

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const cleanPath = normalize(decodedPath).replace(/^([/\\])+/, "");
  const target = resolve(join(root, cleanPath));
  const filePath = decodedPath.endsWith("/") ? join(target, "index.html") : target;
  const rootWithSeparator = root.endsWith(sep) ? root : `${root}${sep}`;

  if (filePath !== root && !filePath.startsWith(rootWithSeparator)) {
    throw new Error("Invalid path");
  }

  return filePath;
}

const server = createServer(async (request, response) => {
  try {
    const filePath = resolveRequestPath(request.url);
    const file = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();
    const type = contentTypes[extension] || "application/octet-stream";
    const headers = { "Content-Type": type };

    if (extension === ".pdf") {
      headers["Content-Disposition"] = `inline; filename="${basename(filePath)}"`;
    }

    response.writeHead(200, headers);
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Read_Master running at http://${host}:${port}/`);
});

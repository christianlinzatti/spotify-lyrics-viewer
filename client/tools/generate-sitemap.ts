import fs from "fs";
import path from "path";
import { SitemapStream, streamToPromise } from "sitemap";
import { Readable } from "stream";

const rootDestinations = ["/", "/about"];
const siteUrl = "https://spotify-lyrics-viewer.nitratine.net";

const generateSitemap = async () => {
  const links = rootDestinations.map((dest) => ({
    url: dest,
    priority: 0.8,
    changefreq: "monthly", // Optional: hints to search engines
  }));

  const stream = new SitemapStream({ hostname: siteUrl });
  const xmlBuffer = await streamToPromise(Readable.from(links).pipe(stream));

  // Ensure the output directory exists
  const outputPath = path.resolve("./public/sitemap.xml");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  fs.writeFileSync(outputPath, xmlBuffer.toString());
  console.log("Sitemap created successfully at public/sitemap.xml");
};

generateSitemap().catch(console.error);
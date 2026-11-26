import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("out/facebook-reels");
async function main() {
  const content = JSON.parse(await fs.readFile(path.join(OUT, "content.json"), "utf8"));
  const metadata = {
    title: String(content.title || "Renungan Islami").slice(0, 80),
    description: [content.caption || content.title, "", ...(content.hashtags || []).slice(0, 5)].join("\n").slice(0, 5000),
    hashtags: content.hashtags || []
  };
  await fs.writeFile(path.join(OUT, "facebook-metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
  console.log("Metadata Facebook Reels siap.");
}
main().catch(error => { console.error(error); process.exit(1); });

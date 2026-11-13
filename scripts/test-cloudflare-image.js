
import dotenv from "dotenv";
import fs from "fs/promises";

dotenv.config();

const {
  CF_ACCOUNT_ID,
  CF_API_TOKEN
} = process.env;

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  throw new Error("Cloudflare credentials belum diatur");
}

const endpoint =
  `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    prompt: "Cinematic vertical photograph of a beautiful mosque at sunrise, peaceful atmosphere, golden sunlight, realistic photography, no text, 9:16 composition",
    steps: 4
  })
});

const result = await response.json();

if (!response.ok || !result.success || !result.result?.image) {
  throw new Error(JSON.stringify(result));
}

await fs.mkdir("./public/images", { recursive: true });

await fs.writeFile(
  "./public/images/cloudflare-test.jpg",
  Buffer.from(result.result.image, "base64")
);

console.log("Image berhasil dibuat!");
console.log("Lokasi: public/images/cloudflare-test.jpg");

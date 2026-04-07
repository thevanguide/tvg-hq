/**
 * Generates branded OG images with photo on right, text on left, gradient blend.
 * Run: node scripts/generate-og-images.mjs
 * Outputs PNGs to public/og/
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const CONTENT_DIR = fileURLToPath(new URL("../src/content", import.meta.url));
const OUTPUT_DIR = fileURLToPath(new URL("../public/og", import.meta.url));
const ASSETS_DIR = fileURLToPath(new URL("../src/assets", import.meta.url));

// Brand colors
const DEEP_PINE = "#14331E";
const BRASS = "#A87E3B";
const BG = "#FBFAF7";
const TEXT = "#0F0F0F";

// Dimensions
const WIDTH = 1200;
const HEIGHT = 630;
const PHOTO_WIDTH = 650;  // photo covers right side
const PHOTO_X = WIDTH - PHOTO_WIDTH; // photo starts at x=550
const GRADIENT_WIDTH = 250; // gradient blend zone
const FOOTER_HEIGHT = 70;

// ---------- Fonts ----------
const frauncesBold = await readFile(
  fileURLToPath(new URL("../src/fonts/Fraunces-Bold.ttf", import.meta.url))
).catch(() => null);
const interMedium = await readFile(
  fileURLToPath(new URL("../src/fonts/Inter-Medium.ttf", import.meta.url))
).catch(() => null);
const interRegular = await readFile(
  fileURLToPath(new URL("../src/fonts/Inter-Regular.ttf", import.meta.url))
).catch(() => null);

async function fetchGoogleFont(family, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const cssRes = await fetch(cssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
  });
  const css = await cssRes.text();
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/);
  if (!match) throw new Error(`Could not find font URL for ${family} ${weight}`);
  const fontRes = await fetch(match[1]);
  return Buffer.from(await fontRes.arrayBuffer());
}

let fonts;
if (frauncesBold && interMedium) {
  fonts = [
    { name: "Fraunces", data: frauncesBold, weight: 700, style: "normal" },
    { name: "Inter", data: interMedium, weight: 500, style: "normal" },
    { name: "Inter", data: interRegular || interMedium, weight: 400, style: "normal" },
  ];
} else {
  console.log("Local fonts not found, fetching from Google Fonts...");
  const [fraunces, inter500, inter400] = await Promise.all([
    fetchGoogleFont("Fraunces", 700),
    fetchGoogleFont("Inter", 500),
    fetchGoogleFont("Inter", 400),
  ]);
  fonts = [
    { name: "Fraunces", data: fraunces, weight: 700, style: "normal" },
    { name: "Inter", data: inter500, weight: 500, style: "normal" },
    { name: "Inter", data: inter400, weight: 400, style: "normal" },
  ];
}

// ---------- Photos ----------
// Each photo has a manual focal point to keep the van centered in the crop
const PHOTO_CONFIGS = [
  {
    file: "og-photo1.jpeg",
    // White ProMaster in desert — van is center-right after auto-rotate
    // Use attention-based crop to find the van
    position: "right",
  },
  {
    file: "og-photo2.jpg",
    // Sprinter at sunset on dirt road — van is center of frame
    position: "center",
  },
  {
    file: "og-photo3.jpg",
    // Van on mountain overlook — van is left of center, lower half
    position: "left",
  },
];

async function preparePhotos() {
  const photos = [];
  for (const config of PHOTO_CONFIGS) {
    const path = join(ASSETS_DIR, config.file);
    try {
      const rotated = sharp(path).rotate(); // auto-rotate EXIF
      const meta = await rotated.metadata();

      // Get dimensions after rotation
      const rotW = meta.orientation && meta.orientation >= 5 ? meta.height : meta.width;
      const rotH = meta.orientation && meta.orientation >= 5 ? meta.width : meta.height;

      // Calculate crop to keep van centered
      // First resize so the shorter dimension fills the target
      const scale = Math.max(PHOTO_WIDTH / rotW, HEIGHT / rotH);
      const scaledW = Math.round(rotW * scale);
      const scaledH = Math.round(rotH * scale);

      const buf = await sharp(path)
        .rotate()
        .resize(scaledW, scaledH, { fit: "fill" })
        .resize(PHOTO_WIDTH, HEIGHT, { fit: "cover", position: config.position })
        .png()
        .toBuffer();

      photos.push(buf);
      console.log(`  Photo loaded: ${config.file} (crop: ${config.position})`);
    } catch (e) {
      console.warn(`  Warning: Could not load ${config.file}: ${e.message}`);
    }
  }
  return photos;
}

// ---------- Gradient overlay ----------
// Creates a PNG gradient that fades from BG color (left) to transparent (right)
// This sits on top of the photo's left edge to create the blend
function createGradientOverlay() {
  // SVG with a linear gradient from bg color to transparent
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GRADIENT_WIDTH}" height="${HEIGHT - FOOTER_HEIGHT}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${BG}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${GRADIENT_WIDTH}" height="${HEIGHT - FOOTER_HEIGHT}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ---------- Dark overlay for photo (subtle) ----------
function createDarkOverlay() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO_WIDTH}" height="${HEIGHT - FOOTER_HEIGHT}">
    <rect width="${PHOTO_WIDTH}" height="${HEIGHT - FOOTER_HEIGHT}" fill="black" opacity="0.15"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ---------- Category from frontmatter ----------
function getCategoryLabel(fm, filePath) {
  // Use frontmatter category first
  if (fm?.category) {
    const cat = fm.category.toLowerCase();
    const labels = {
      insurance: "Insurance",
      registration: "Registration",
      certification: "Certification",
      blog: "Blog",
    };
    if (labels[cat]) return labels[cat];
    // Capitalize first letter as fallback
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }
  // Fall back to path detection
  for (const [key, label] of Object.entries({ insurance: "Insurance", registration: "Registration", certification: "Certification", blog: "Blog" })) {
    if (filePath.includes(`/${key}/`)) return label;
  }
  return "Guide";
}

// ---------- Frontmatter parser ----------
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

// ---------- Find MDX files ----------
async function findMdxFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await findMdxFiles(full)));
    else if (entry.name.endsWith(".mdx")) files.push(full);
  }
  return files;
}

// ---------- Satori text template (left side only, transparent bg) ----------
function textTemplate(title, category) {
  const displayTitle = title.length > 80 ? title.slice(0, 77) + "..." : title;

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        padding: "0",
      },
      children: [
        // Main content area — text on left
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flexGrow: 1,
              padding: "50px 60px 40px",
              maxWidth: `${PHOTO_X + 60}px`, // text stays in left portion
            },
            children: [
              // Eyebrow
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    fontSize: "15px",
                    fontFamily: "Inter",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.18em",
                    color: BRASS,
                    marginBottom: "20px",
                  },
                  children: category,
                },
              },
              // Title
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    fontFamily: "Fraunces",
                    fontWeight: 700,
                    fontSize: displayTitle.length > 55 ? "34px" : "42px",
                    lineHeight: 1.2,
                    color: TEXT,
                    letterSpacing: "-0.015em",
                  },
                  children: displayTitle,
                },
              },
            ],
          },
        },
        // Footer bar
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 60px",
              height: `${FOOTER_HEIGHT}px`,
              backgroundColor: DEEP_PINE,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    fontFamily: "Fraunces",
                    fontWeight: 700,
                    fontSize: "22px",
                    color: "#FFFFFF",
                    letterSpacing: "-0.01em",
                  },
                  children: "The Van Guide",
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    fontFamily: "Inter",
                    fontWeight: 400,
                    fontSize: "15px",
                    color: BRASS,
                  },
                  children: "thevanguide.com",
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ---------- Main ----------
async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const [photos, gradientBuf, darkBuf] = await Promise.all([
    preparePhotos(),
    createGradientOverlay(),
    createDarkOverlay(),
  ]);

  if (photos.length === 0) {
    console.error("No photos found in src/assets/. Exiting.");
    process.exit(1);
  }

  const mdxFiles = await findMdxFiles(CONTENT_DIR);
  let generated = 0;
  let skipped = 0;
  let photoIndex = 0;

  for (const file of mdxFiles) {
    const content = await readFile(file, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm?.ogImage || !fm?.title) {
      skipped++;
      continue;
    }

    const outputName = basename(fm.ogImage);
    const outputPath = join(OUTPUT_DIR, outputName);
    const category = getCategoryLabel(fm, relative(CONTENT_DIR, file));

    // Use photo 3 (mountain overlook) for all cards
    const photo = photos[2];

    // 1. Render text layer with satori → PNG
    const svg = await satori(textTemplate(fm.title, category), {
      width: WIDTH,
      height: HEIGHT,
      fonts,
    });
    const textPng = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();

    // 2. Compose final image with sharp
    const bodyHeight = HEIGHT - FOOTER_HEIGHT;

    // Crop photo to body area (exclude footer)
    const photoCropped = await sharp(photo)
      .resize(PHOTO_WIDTH, bodyHeight, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    const result = await sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 4,
        background: { r: 251, g: 250, b: 247, alpha: 1 }, // BG color
      },
    })
      .png()
      .composite([
        // Photo on right side (body area only)
        { input: photoCropped, top: 0, left: PHOTO_X },
        // Dark overlay on photo for readability
        { input: darkBuf, top: 0, left: PHOTO_X },
        // Gradient fade from bg into photo
        { input: gradientBuf, top: 0, left: PHOTO_X },
        // Text layer on top of everything
        { input: Buffer.from(textPng), top: 0, left: 0 },
      ])
      .png()
      .toBuffer();

    await writeFile(outputPath, result);
    console.log(`  ✓ ${outputName} (photo ${(photoIndex - 1) % photos.length + 1})`);
    generated++;
  }

  console.log(`\nGenerated ${generated} OG images (${photos.length} photos in rotation), skipped ${skipped} files.`);
}

main().catch(console.error);

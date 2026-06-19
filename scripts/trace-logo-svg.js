const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const potrace = require("potrace");

const ROOT = process.cwd();
const TMP_DIR = path.join(ROOT, ".tmp-logo-trace");

const logos = [
  {
    input: "01_logo_principal_horizontal.png",
    output: "public/brand/notecode-logo-horizontal-white.svg",
    label: "NoteCode",
    turdSize: 80,
  },
  {
    input: "02_icono_standalone.png",
    output: "public/brand/notecode-mark-white.svg",
    label: "NoteCode monogram",
    turdSize: 120,
  },
  {
    input: "05_version_apilada.png",
    output: "public/brand/notecode-logo-stacked-white.svg",
    label: "NoteCode",
    turdSize: 80,
  },
];

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trace(input, params) {
  return new Promise((resolve, reject) => {
    potrace.trace(input, params, (error, svg) => {
      if (error) reject(error);
      else resolve(svg);
    });
  });
}

function extractPath(svg) {
  const match = svg.match(/<path\b[^>]*\bd="([^"]+)"[^>]*>/);
  if (!match) throw new Error("Potrace did not return a path.");
  return match[1];
}

async function createTraceSource(input, tmpPath) {
  const source = path.join(ROOT, input);
  const sourceImage = sharp(source).ensureAlpha();
  const metadata = await sourceImage.metadata();
  const raw = await sourceImage.raw().toBuffer();
  const width = metadata.width;
  const height = metadata.height;
  const mask = Buffer.alloc(width * height);

  for (let i = 0; i < width * height; i++) {
    mask[i] = raw[i * 4 + 3] > 84 ? 0 : 255;
  }

  await sharp(mask, {
    raw: {
      width,
      height,
      channels: 1,
    },
  })
    .resize(width * 4, height * 4, { kernel: "lanczos3" })
    .blur(0.7)
    .threshold(150)
    .median(3)
    .png()
    .toFile(tmpPath);

  return { width, height };
}

async function createWhiteSvg(logo) {
  const target = path.join(ROOT, logo.output);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const tmpPath = path.join(TMP_DIR, `${path.basename(logo.output, ".svg")}.png`);
  const { width, height } = await createTraceSource(logo.input, tmpPath);
  const traced = await trace(tmpPath, {
    color: "#fff",
    background: "transparent",
    threshold: 128,
    turdSize: logo.turdSize,
    alphaMax: 1,
    optCurve: true,
    optTolerance: 0.28,
  });
  const pathData = extractPath(traced);
  const titleId = path.basename(logo.output, ".svg").replace(/[^a-z0-9_-]/gi, "-");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId}-title">
  <title id="${titleId}-title">${escapeXml(logo.label)}</title>
  <g transform="scale(0.25)" fill="#fff" fill-rule="evenodd">
    <path d="${pathData}"/>
  </g>
</svg>
`;

  fs.writeFileSync(target, svg);
  console.log(`${logo.output}: ${width}x${height}`);
}

Promise.all(logos.map(createWhiteSvg)).catch((error) => {
  console.error(error);
  process.exit(1);
});

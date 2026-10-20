/**
 * Builds 4:3 landscape versions of the Dash flavor posters for the product detail panel.
 *
 * The posters are 2:3 and the device spans ~65% of their height, so a plain landscape
 * crop would cut off either the device or the "Snowplus" / flavor-name header. Instead
 * the full poster is kept undistorted in the centre and the sides are filled with a
 * heavily blurred version of the poster's own colours, feathered into the edges.
 *
 * sharp is not a site dependency (Netlify installs deps on every deploy), so install it
 * ad hoc:   npm i --no-save sharp && node scripts/make-dash-landscape.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC_DIR = path.join(__dirname, '../images/dash');
const OUT_DIR = path.join(SRC_DIR, 'landscape');
const WIDTH = 960;
const HEIGHT = 720;
const FEATHER = 0.08;
const STRIP = 0.12;
const BLUR = 60;

function featherMask(width, height) {
    const edge = Math.round(width * FEATHER);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#fff" stop-opacity="0"/>
            <stop offset="${edge / width}" stop-color="#fff" stop-opacity="1"/>
            <stop offset="${1 - edge / width}" stop-color="#fff" stop-opacity="1"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`;
    return Buffer.from(svg);
}

async function build(file) {
    const src = path.join(SRC_DIR, file);
    const poster = await sharp(src).resize({ height: HEIGHT }).toBuffer({ resolveWithObject: true });
    const posterWidth = Math.min(poster.info.width, WIDTH);

    // Each side is the poster's own outer strip, stretched and blurred, so the backdrop continues
    // the gradient next to the seam instead of repeating the fruit.
    const sideWidth = Math.ceil((WIDTH - posterWidth) / 2);
    const stripWidth = Math.round(posterWidth * STRIP);
    const side = (left) => sharp(poster.data)
        .extract({ left, top: 0, width: stripWidth, height: HEIGHT })
        .resize(sideWidth, HEIGHT, { fit: 'fill' })
        .toBuffer();
    const backdrop = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#ffffff' } })
        .composite([
            { input: await side(0), left: 0, top: 0 },
            { input: poster.data, left: Math.round((WIDTH - poster.info.width) / 2), top: 0 },
            { input: await side(poster.info.width - stripWidth), left: WIDTH - sideWidth, top: 0 },
        ])
        .png()
        .toBuffer()
        .then(buf => sharp(buf).blur(BLUR).modulate({ saturation: 0.92 }).toBuffer());

    const feathered = await sharp(poster.data)
        .extract({ left: Math.floor((poster.info.width - posterWidth) / 2), top: 0, width: posterWidth, height: HEIGHT })
        .ensureAlpha()
        .composite([{ input: featherMask(posterWidth, HEIGHT), blend: 'dest-in' }])
        .png()
        .toBuffer();

    await sharp(backdrop)
        .composite([{ input: feathered, left: Math.round((WIDTH - posterWidth) / 2), top: 0 }])
        .webp({ quality: 80 })
        .toFile(path.join(OUT_DIR, file.replace(/\.[^.]+$/, '.webp')));
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const files = fs.readdirSync(SRC_DIR).filter(f => /\.(webp|jpe?g|png)$/i.test(f));
    for (const file of files) {
        await build(file);
        console.log('landscape', file);
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});

// @ts-nocheck
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { registerFonts } from "../../utils/canvasFonts";
import sharp from "sharp";

// font stack: inter for text, noto color emoji for emoji glyphs
const FONT_TEXT = '"Inter", "Noto Color Emoji"';

// color palette for cycling
const TEXT_COLORS = [
  '#FFFFFF', // white (default)
  '#FFD700', // gold
  '#00FFFF', // cyan
  '#FF69B4', // pink
  '#7CFC00', // lawn green
  '#FF8C00', // dark orange
  '#E6E6FA', // lavender
  '#FF4444', // red
];

interface QuoteStyle {
  bold: boolean;
  italic: boolean;
  colorIndex: number;
  showQuotes: boolean;
}

const DEFAULT_STYLE: QuoteStyle = {
  bold: false,
  italic: true,
  colorIndex: 0,
  showQuotes: true,
};

/**
 * auto-fit font size so text never overflows
 * starts at maxSize and shrinks until all text fits within the allowed area
 */
function calculateFitFontSize(ctx: any, text: string, maxWidth: number, maxLines: number, fontFamily: string, style: QuoteStyle, maxSize = 32, minSize = 14): number {
  let fontSize = maxSize;

  while (fontSize >= minSize) {
    const weight = style.bold ? 'bold' : 'normal';
    const slant = style.italic ? 'italic' : '';
    ctx.font = `${slant} ${weight} ${fontSize}px ${fontFamily}`.trim();

    const lineHeight = fontSize * 1.35;
    const words = text.split(' ');
    let line = '';
    let lineCount = 0;

    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line !== '') {
        lineCount++;
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    if (line) lineCount++;

    if (lineCount <= maxLines) return fontSize;
    fontSize -= 2;
  }

  return minSize;
}

/**
 * generate a quote image from message content
 * layout: left half = user avatar, right half = quote text
 */
async function generateQuoteImage(messageContent: string, author: any, style: QuoteStyle = DEFAULT_STYLE): Promise<Buffer> {
  // ensure fonts are downloaded + registered before drawing
  await registerFonts();
  const width = 800;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // enable color emoji rendering
  ctx.textDrawingMode = 'glyph';

  // black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  try {
    // load and draw user avatar on left side
    const avatarUrl = typeof author.avatarURL === 'string' 
      ? author.avatarURL 
      : author.displayAvatarURL?.({ extension: 'png', forceStatic: true, size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const avatar = await loadImage(avatarUrl);

    // draw avatar covering left portion (half screen)
    const avatarWidth = width / 2;
    ctx.drawImage(avatar, 0, 0, avatarWidth, height);

    // create smooth gradient overlay that blends the avatar into black
    const gradient = ctx.createLinearGradient(avatarWidth - 250, 0, avatarWidth, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // right side - quote text
    const textStartX = avatarWidth + 60;
    const textWidth = width - textStartX - 60;
    const maxLines = 6;

    // auto-fit font size
    const quotedText = style.showQuotes !== false ? `"${messageContent}"` : messageContent;
    const fontSize = calculateFitFontSize(ctx, quotedText, textWidth, maxLines, FONT_TEXT, style);
    const lineHeight = fontSize * 1.35;

    // apply final font style
    const weight = style.bold ? 'bold' : 'normal';
    const slant = style.italic ? 'italic' : '';
    ctx.fillStyle = TEXT_COLORS[style.colorIndex] || TEXT_COLORS[0];
    ctx.font = `${slant} ${weight} ${fontSize}px ${FONT_TEXT}`.trim();
    ctx.textAlign = 'left';

    // word wrap
    const words = quotedText.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > textWidth && line !== '') {
        lines.push(line.trim());
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line.trim());

    // limit and truncate last line if needed
    const displayLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      const last = displayLines[maxLines - 1];
      displayLines[maxLines - 1] = last.substring(0, Math.max(0, last.length - 3)) + '...';
    }

    // center vertically
    const totalTextHeight = displayLines.length * lineHeight;
    const y = (height - totalTextHeight) / 2 + 20;

    // draw text lines
    displayLines.forEach((textLine, i) => {
      ctx.fillText(textLine, textStartX, y + i * lineHeight);
    });

    // author attribution
    ctx.fillStyle = '#aaaaaa';
    ctx.font = `16px ${FONT_TEXT}`;
    ctx.textAlign = 'left';
    const authorName = author.displayName || author.username || 'Unknown';
    const authorY = y + displayLines.length * lineHeight + 40;
    ctx.fillText(`- ${authorName}`, textStartX, authorY);

    // username/tag below
    ctx.fillStyle = '#666666';
    ctx.font = `13px ${FONT_TEXT}`;
    const tag = `@${author.username || 'unknown'}`;
    ctx.fillText(tag, textStartX, authorY + 20);

    // aero branding in bottom right
    ctx.fillStyle = '#444444';
    ctx.font = `12px ${FONT_TEXT}`;
    ctx.textAlign = 'right';
    ctx.fillText('Aero-Chan', width - 20, height - 15);
  } catch (error: any) {
    console.error('Failed to generate quote image:', error);
    // fallback - just text on black
    ctx.fillStyle = '#ffffff';
    ctx.font = `24px ${FONT_TEXT}`;
    ctx.textAlign = 'center';
    ctx.fillText(messageContent.substring(0, 100), width / 2, height / 2);
    ctx.fillStyle = '#888888';
    ctx.font = `16px ${FONT_TEXT}`;
    ctx.fillText(`- ${author.username}`, width / 2, height / 2 + 40);
  }

  // convert to buffer
  return canvas.toBuffer('image/png');
}

/**
 * convert a png buffer to a single-frame gif using sharp
 */
async function convertToGif(pngBuffer: Buffer): Promise<Buffer> {
  return await sharp(pngBuffer)
    .gif()
    .toBuffer();
}

export { generateQuoteImage, convertToGif, TEXT_COLORS, DEFAULT_STYLE };
export type { QuoteStyle };
export default {
  generateQuoteImage,
  convertToGif,
  TEXT_COLORS,
  DEFAULT_STYLE
};
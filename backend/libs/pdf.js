const PDFDocument = require("pdfkit");
const { formatInZone } = require("./time");
const { symbolFor } = require("./money");

// Renders the same {title, headers, rows, summary} shape the CSV and Excel
// builders take, so every report format stays in step from one source.
//
// This is the copy that gets printed, emailed to an accountant, or handed to a
// landlord — so it carries the shop's letterhead and says what its numbers are
// in. A page of unattributed figures is not a document.
//
// Landscape by default: the sales report is 14 columns wide and is unreadable
// squeezed onto portrait A4.

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";
const HEAD_BG = "#1e293b";
const ZEBRA = "#f8fafc";
const ACCENT = "#1d4ed8";

// Columns holding money or counts. They are right-aligned, because digits only
// line up for comparison when their last digit does.
const NUMERIC_HEADER = /(qty|quantity|price|cost|total|value|profit|revenue|discount|tax|amount|units|sales|net|gross|refunded)/i;

const columnWidths = (doc, headers, rows, available) => {
  const sample = rows.slice(0, 200);

  const natural = headers.map((header, index) => {
    doc.font(FONT_BOLD).fontSize(7);
    let widest = doc.widthOfString(String(header ?? ""));

    doc.font(FONT).fontSize(7);
    for (const row of sample) {
      const w = doc.widthOfString(String(row[index] ?? ""));
      if (w > widest) widest = w;
    }
    // Keep any single column from eating the page.
    return Math.min(Math.max(widest + 10, 28), 150);
  });

  const total = natural.reduce((sum, w) => sum + w, 0);
  const scale = available / total;
  return natural.map((w) => w * scale);
};

const truncate = (doc, text, width) => {
  const s = String(text ?? "");
  if (doc.widthOfString(s) <= width) return s;
  let out = s;
  while (out.length > 1 && doc.widthOfString(`${out}…`) > width) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
};

const buildPdfBuffer = ({
  title,
  subtitle,
  generatedBy,
  headers,
  rows,
  summary,
  shop = {},
  currency = "EUR",
  timezone = "UTC",
}) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 28,
      bufferPages: true,
      info: {
        Title: `${title}${shop.name ? ` — ${shop.name}` : ""}`,
        Author: shop.name || "E360 Inventory Suite",
        Creator: "E360 Inventory Suite",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const available = right - left;

    // ── Letterhead: whose figures these are.
    const top = doc.y;

    doc.font(FONT_BOLD).fontSize(15).fillColor(INK).text(shop.name || "", left, top);
    const addressLines = [...(shop.addressLines || []), shop.phone].filter(Boolean);
    if (addressLines.length) {
      doc.font(FONT).fontSize(8).fillColor(MUTED).text(addressLines.join("  ·  "), left);
    }

    // Report identity, right-aligned against the letterhead.
    doc.font(FONT_BOLD).fontSize(15).fillColor(ACCENT).text(title, left, top, {
      width: available,
      align: "right",
    });
    if (subtitle) {
      doc
        .font(FONT)
        .fontSize(8)
        .fillColor(MUTED)
        .text(subtitle, left, doc.y, { width: available, align: "right" });
    }

    doc.moveDown(0.5);

    // A rule under the letterhead — the line that makes it read as a document.
    const ruleY = Math.max(doc.y, top + 34);
    doc.moveTo(left, ruleY).lineTo(right, ruleY).strokeColor(ACCENT).lineWidth(1.5).stroke();
    doc.y = ruleY + 6;

    // Provenance: who ran it, when, how much of it, and in what money.
    doc
      .font(FONT)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `Generated ${formatInZone(new Date(), timezone)} (${timezone})` +
          (generatedBy ? `   ·   by ${generatedBy}` : "") +
          `   ·   ${rows.length} record${rows.length === 1 ? "" : "s"}` +
          `   ·   Amounts in ${currency} (${symbolFor(currency)})`,
        left,
        doc.y,
        { width: available }
      );

    doc.moveDown(0.6);

    const widths = columnWidths(doc, headers, rows, available);
    const rowHeight = 14;
    const align = headers.map((h) => (NUMERIC_HEADER.test(h) ? "right" : "left"));

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, available, rowHeight + 2).fill(HEAD_BG);
      doc.font(FONT_BOLD).fontSize(7).fillColor("#ffffff");
      let x = left;
      headers.forEach((header, index) => {
        doc.text(truncate(doc, header, widths[index] - 8), x + 4, y + 5, {
          width: widths[index] - 8,
          align: align[index],
          lineBreak: false,
        });
        x += widths[index];
      });
      doc.y = y + rowHeight + 2;
    };

    drawHeader();

    // ── Rows
    doc.font(FONT).fontSize(7);
    rows.forEach((row, rowIndex) => {
      // New page before we run off the bottom, repeating the header so a page 3
      // is still readable on its own.
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 14) {
        doc.addPage();
        drawHeader();
        doc.font(FONT).fontSize(7);
      }

      const y = doc.y;
      if (rowIndex % 2 === 1) {
        doc.rect(left, y, available, rowHeight).fill(ZEBRA);
      }

      doc.fillColor(INK);
      let x = left;
      row.forEach((cell, index) => {
        doc.text(truncate(doc, cell, widths[index] - 8), x + 4, y + 4, {
          width: widths[index] - 8,
          align: align[index],
          lineBreak: false,
        });
        x += widths[index];
      });

      doc
        .moveTo(left, y + rowHeight)
        .lineTo(right, y + rowHeight)
        .strokeColor(RULE)
        .lineWidth(0.3)
        .stroke();

      doc.y = y + rowHeight;
    });

    // ── Summary: the part anyone actually reads. Boxed, so it is not mistaken
    // for another data row.
    if (summary && summary.length) {
      const boxHeight = summary.length * 13 + 26;

      if (doc.y + boxHeight > doc.page.height - doc.page.margins.bottom - 14) {
        doc.addPage();
      }

      doc.moveDown(0.8);
      const boxTop = doc.y;
      const boxWidth = Math.min(300, available);

      doc.rect(left, boxTop, boxWidth, boxHeight).fillAndStroke("#f1f5f9", RULE);

      doc
        .font(FONT_BOLD)
        .fontSize(9)
        .fillColor(INK)
        .text("SUMMARY", left + 10, boxTop + 8, { lineBreak: false });

      let y = boxTop + 22;
      summary.forEach(([label, value]) => {
        doc.font(FONT).fontSize(8).fillColor(MUTED).text(String(label), left + 10, y, {
          width: boxWidth - 130,
          lineBreak: false,
        });
        doc
          .font(FONT_BOLD)
          .fontSize(8)
          .fillColor(INK)
          .text(String(value), left + boxWidth - 120, y, {
            width: 110,
            align: "right",
            lineBreak: false,
          });
        y += 13;
      });

      doc.y = boxTop + boxHeight;
    }

    // ── Page furniture (bufferPages lets us number once the count is known).
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      const footY = doc.page.height - doc.page.margins.bottom + 6;

      doc
        .moveTo(left, footY - 4)
        .lineTo(right, footY - 4)
        .strokeColor(RULE)
        .lineWidth(0.5)
        .stroke();

      doc.font(FONT).fontSize(7).fillColor(MUTED);
      doc.text(shop.name || "", left, footY, { lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, left, footY, {
        width: available,
        align: "right",
        lineBreak: false,
      });
    }

    doc.end();
  });

module.exports = { buildPdfBuffer };

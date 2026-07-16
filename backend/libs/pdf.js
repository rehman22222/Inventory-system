const PDFDocument = require("pdfkit");
const { formatDateTime } = require("./csv");

// Renders the same {title, headers, rows, summary} shape the CSV and Excel
// builders take, so every report format stays in step from one source.
//
// Landscape by default: the sales report is 14 columns wide and is unreadable
// squeezed onto portrait A4.

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";
const HEAD_BG = "#f3f4f6";
const ZEBRA = "#fafafa";

// Column widths proportional to the widest cell in each column, so a "Qty"
// column doesn't get the same room as "Description".
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
    return Math.min(Math.max(widest + 8, 26), 140);
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

const buildPdfBuffer = ({ title, subtitle, generatedBy, headers, rows, summary }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 28,
      bufferPages: true,
      info: { Title: title, Author: generatedBy || "E360 Inventory Suite" },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const available = right - left;

    // ── Header
    doc.font(FONT_BOLD).fontSize(16).fillColor(INK).text(title, left, doc.y);
    if (subtitle) {
      doc.moveDown(0.2);
      doc.font(FONT).fontSize(9).fillColor(MUTED).text(subtitle);
    }
    doc.moveDown(0.2);
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `Generated ${formatDateTime(new Date())}` +
          (generatedBy ? `  ·  by ${generatedBy}` : "") +
          `  ·  ${rows.length} record${rows.length === 1 ? "" : "s"}`
      );

    doc.moveDown(0.6);

    const widths = columnWidths(doc, headers, rows, available);
    const rowHeight = 14;

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, available, rowHeight).fill(HEAD_BG);
      doc.font(FONT_BOLD).fontSize(7).fillColor(INK);
      let x = left;
      headers.forEach((header, index) => {
        doc.text(truncate(doc, header, widths[index] - 6), x + 3, y + 4, {
          width: widths[index] - 6,
          lineBreak: false,
        });
        x += widths[index];
      });
      doc.y = y + rowHeight;
    };

    drawHeader();

    // ── Rows
    doc.font(FONT).fontSize(7);
    rows.forEach((row, rowIndex) => {
      // New page before we run off the bottom, repeating the header.
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
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
        doc.text(truncate(doc, cell, widths[index] - 6), x + 3, y + 4, {
          width: widths[index] - 6,
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

    // ── Summary
    if (summary && summary.length) {
      if (doc.y + summary.length * rowHeight + 30 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      doc.moveDown(1);
      doc.font(FONT_BOLD).fontSize(10).fillColor(INK).text("Summary", left, doc.y);
      doc.moveDown(0.3);

      summary.forEach(([label, value]) => {
        const y = doc.y;
        doc.font(FONT).fontSize(8).fillColor(MUTED).text(String(label), left + 3, y, {
          width: 180,
          lineBreak: false,
        });
        doc.font(FONT_BOLD).fontSize(8).fillColor(INK).text(String(value), left + 190, y, {
          width: 120,
          lineBreak: false,
        });
        doc.y = y + 13;
      });
    }

    // ── Page numbers (bufferPages lets us number once the count is known)
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc
        .font(FONT)
        .fontSize(7)
        .fillColor(MUTED)
        .text(
          `Page ${i + 1} of ${range.count}`,
          left,
          doc.page.height - doc.page.margins.bottom + 8,
          { width: available, align: "center", lineBreak: false }
        );
    }

    doc.end();
  });

module.exports = { buildPdfBuffer };

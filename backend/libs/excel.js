const ExcelJS = require("exceljs");
const { formatInZone } = require("./time");
const { excelMoneyFormat, symbolFor } = require("./money");

const NUMERIC_HEADER =
  /(qty|quantity|price|cost|total|value|profit|revenue|discount|tax|amount|units|sales|net|gross|refunded)/i;
const MONEY_HEADER =
  /(price|cost|total|value|profit|revenue|discount|tax|amount|net|gross|refunded)/i;
const DATE_HEADER = /(date|time|opened|closed|expiry|generated)/i;
const MONEY_SUMMARY =
  /(profit|sales|revenue|cost|value|discount|tax|amount|net|gross|refunded|takings)/i;

const COLORS = {
  ink: "FF0F172A",
  slate: "FF475569",
  muted: "FF64748B",
  line: "FFDCE3EA",
  surface: "FFF8FAFC",
  white: "FFFFFFFF",
  emerald: "FF059669",
  emeraldDark: "FF047857",
  emeraldSoft: "FFECFDF5",
  red: "FFB91C1C",
  redSoft: "FFFEE2E2",
  amber: "FFB45309",
  amberSoft: "FFFEF3C7",
  green: "FF15803D",
  greenSoft: "FFDCFCE7",
  purple: "FF6B21A8",
  purpleSoft: "FFF3E8FF",
};

/* A row worth picking out of a long report at a glance.
 *
 * The same three the sales screen marks, so a row does not change meaning
 * between the screen and the download:
 *
 *   refund  — money going OUT, the most exceptional row on the page
 *   credit  — sold, not yet paid for
 *   deal    — an offer was given; an ordinary sale, just a cheaper one
 *
 * Credit is AMBER, the colour of the till's own credit button and of the credit
 * row on the sales screen. It was printed red here for a while; the shop asked
 * for the button's colour, and one idea wearing one colour everywhere is worth
 * more than a download's habit. That freed the ordinary red for refunds, which
 * is where a red belongs — the row where money goes out.
 */
const ROW_KIND_FILLS = {
  refund: { bg: "redSoft", ink: "red" },
  credit: { bg: "amberSoft", ink: "amber" },
  deal: { bg: "purpleSoft", ink: "purple" },
};

const toNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const toExcelDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const match = String(value ?? "")
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
  if (!match) return null;

  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );
};

const safeWorksheetName = (title, reportType) => {
  if (reportType === "inventory") return "Inventory";
  const clean = String(title || "Report")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || "Report").slice(0, 31);
};

const columnLetter = (number) => {
  let value = number;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

const semanticWidth = (header, values) => {
  const label = String(header || "");
  const longest = Math.max(
    label.length,
    ...values.map((value) => String(value ?? "").length)
  );

  if (/^name$|product|description/i.test(label)) {
    return Math.min(
      Math.max(longest + 2, /^name$/i.test(label) ? 30 : 24),
      /description/i.test(label) ? 44 : /^name$/i.test(label) ? 42 : 34
    );
  }
  if (/category/i.test(label)) return Math.min(Math.max(longest + 2, 18), 26);
  if (/supplier|customer/i.test(label)) {
    return Math.min(Math.max(longest + 2, 18), 30);
  }
  if (/barcode|receipt|reference|email|ip address/i.test(label)) {
    return Math.min(Math.max(longest + 2, 16), 28);
  }
  if (/date|time|opened|closed/i.test(label)) return /time/i.test(label) ? 21 : 16;
  if (/status|payment|source|action|entity/i.test(label)) {
    return Math.min(Math.max(longest + 2, 14), 22);
  }
  if (NUMERIC_HEADER.test(label)) return Math.min(Math.max(longest + 2, 12), 16);
  return Math.min(Math.max(longest + 2, 12), 28);
};

const styleMergedCard = (ws, labelRow, valueRow, startCol, endCol) => {
  for (let row = labelRow; row <= valueRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = ws.getCell(row, col);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.emeraldSoft },
      };
      const border = {};
      if (row === labelRow) {
        border.top = { style: "thin", color: { argb: COLORS.line } };
      }
      if (row === valueRow) {
        border.bottom = { style: "thin", color: { argb: COLORS.line } };
      }
      if (col === startCol) {
        border.left = { style: "thin", color: { argb: COLORS.line } };
      }
      if (col === endCol) {
        border.right = { style: "thin", color: { argb: COLORS.line } };
      }
      cell.border = border;
    }
  }
  ws.getCell(labelRow, startCol).border = {
    ...ws.getCell(labelRow, startCol).border,
    left: { style: "medium", color: { argb: COLORS.emerald } },
  };
  ws.getCell(valueRow, startCol).border = {
    ...ws.getCell(valueRow, startCol).border,
    left: { style: "medium", color: { argb: COLORS.emerald } },
  };
};

/**
 * Build a presentation-ready .xlsx workbook from a report definition.
 * CSV stays available as a flat data export; this workbook is the human-facing
 * version with hierarchy, live KPI formulas, filters and print settings.
 */
async function buildWorkbookBuffer({
  title,
  subtitle,
  generatedBy,
  headers = [],
  rows = [],
  // One entry per row, naming what it is — see ROW_KIND_FILLS. Only the sales
  // reports send it; everything else prints exactly as it always did.
  rowKinds,
  summary = [],
  shop = {},
  currency = "EUR",
  timezone = "UTC",
  reportType,
}) {
  if (!Array.isArray(headers) || headers.length === 0) {
    throw new Error("A report needs at least one column");
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = shop.name || "E360 Inventory Suite";
  wb.company = shop.name || "E360 Inventory Suite";
  wb.subject = title || "Business report";
  wb.title = title || "Report";
  wb.created = new Date();
  wb.modified = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  wb.calcProperties.forceFullCalc = true;

  const colCount = headers.length;
  const lastCol = columnLetter(colCount);
  const isInventory =
    reportType === "inventory" ||
    (/inventory/i.test(String(title)) &&
      headers.some((header) => /stock status/i.test(String(header))));
  const moneyFmt = excelMoneyFormat(currency);
  const numericCols = headers.map((header) =>
    NUMERIC_HEADER.test(String(header))
  );
  const moneyCols = headers.map((header) => MONEY_HEADER.test(String(header)));
  const dateCols = headers.map((header) => DATE_HEADER.test(String(header)));
  const paymentColumn = headers.findIndex((header) => /^payment$/i.test(String(header)));
  const shouldMarkCreditRows = reportType === "combined-sales" && paymentColumn >= 0;

  const ws = wb.addWorksheet(safeWorksheetName(title, reportType), {
    properties: {
      defaultRowHeight: 19,
      tabColor: { argb: COLORS.emerald },
    },
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.55,
        bottom: 0.55,
        header: 0.2,
        footer: 0.25,
      },
    },
    headerFooter: {
      oddFooter: `&L${shop.name || "E360 Inventory Suite"}&CPage &P of &N&R${currency}`,
    },
  });
  const banner = ws.addRow([shop.name || "E360 Inventory Suite"]);
  banner.height = 36;
  ws.mergeCells(`A${banner.number}:${lastCol}${banner.number}`);
  banner.getCell(1).font = {
    name: "Aptos Display",
    size: 20,
    bold: true,
    color: { argb: COLORS.white },
  };
  banner.getCell(1).alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
  };
  for (let col = 1; col <= colCount; col += 1) {
    ws.getCell(banner.number, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.ink },
    };
  }

  const address = [...(shop.addressLines || []), shop.phone]
    .filter(Boolean)
    .join("  •  ");
  const addressRow = ws.addRow([address || "Business report"]);
  addressRow.height = 22;
  ws.mergeCells(`A${addressRow.number}:${lastCol}${addressRow.number}`);
  addressRow.getCell(1).font = {
    name: "Aptos",
    size: 9,
    color: { argb: "FFD1FAE5" },
  };
  addressRow.getCell(1).alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 2,
  };
  for (let col = 1; col <= colCount; col += 1) {
    ws.getCell(addressRow.number, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.emeraldDark },
    };
  }

  const topSpacer = ws.addRow([]);
  topSpacer.height = 9;

  const titleRow = ws.addRow([title || "Report"]);
  titleRow.height = 31;
  ws.mergeCells(`A${titleRow.number}:${lastCol}${titleRow.number}`);
  titleRow.getCell(1).font = {
    name: "Aptos Display",
    size: 18,
    bold: true,
    color: { argb: COLORS.ink },
  };
  titleRow.getCell(1).alignment = {
    vertical: "middle",
    horizontal: "left",
  };

  if (subtitle) {
    const subtitleRow = ws.addRow([subtitle]);
    subtitleRow.height = 21;
    ws.mergeCells(`A${subtitleRow.number}:${lastCol}${subtitleRow.number}`);
    subtitleRow.getCell(1).font = {
      name: "Aptos",
      size: 10,
      italic: true,
      color: { argb: COLORS.slate },
    };
    subtitleRow.getCell(1).alignment = {
      vertical: "middle",
      horizontal: "left",
    };
  }

  const generatedAt = formatInZone(new Date(), timezone);
  const metadata = [
    `Generated ${generatedAt}`,
    generatedBy ? `Prepared by ${generatedBy}` : "",
    `${rows.length.toLocaleString("en-US")} records`,
    `${currency} (${symbolFor(currency)})`,
    timezone,
  ]
    .filter(Boolean)
    .join("  •  ");
  const metadataRow = ws.addRow([metadata]);
  metadataRow.height = 21;
  ws.mergeCells(`A${metadataRow.number}:${lastCol}${metadataRow.number}`);
  metadataRow.getCell(1).font = {
    name: "Aptos",
    size: 9,
    color: { argb: COLORS.muted },
  };
  metadataRow.getCell(1).alignment = {
    vertical: "middle",
    horizontal: "left",
  };

  const kpiCells = new Map();
  if (summary.length) {
    const summarySpacer = ws.addRow([]);
    summarySpacer.height = 9;
    const cardsPerRow = Math.min(5, Math.max(1, Math.floor(colCount / 2)));

    for (let index = 0; index < summary.length; index += cardsPerRow) {
      const group = summary.slice(index, index + cardsPerRow);
      const labelRowNumber = ws.addRow([]).number;
      const valueRowNumber = ws.addRow([]).number;
      ws.getRow(labelRowNumber).height = 21;
      ws.getRow(valueRowNumber).height = 30;

      group.forEach(([label, value], groupIndex) => {
        const startCol =
          Math.floor((groupIndex * colCount) / group.length) + 1;
        const endCol = Math.floor(
          ((groupIndex + 1) * colCount) / group.length
        );
        if (endCol > startCol) {
          ws.mergeCells(labelRowNumber, startCol, labelRowNumber, endCol);
          ws.mergeCells(valueRowNumber, startCol, valueRowNumber, endCol);
        }
        styleMergedCard(
          ws,
          labelRowNumber,
          valueRowNumber,
          startCol,
          endCol
        );

        const labelCell = ws.getCell(labelRowNumber, startCol);
        labelCell.value = String(label).toUpperCase();
        labelCell.font = {
          name: "Aptos",
          size: 8,
          bold: true,
          color: { argb: COLORS.emeraldDark },
        };
        labelCell.alignment = {
          vertical: "bottom",
          horizontal: "left",
          indent: 1,
        };

        const valueCell = ws.getCell(valueRowNumber, startCol);
        const numericValue = toNumber(value);
        valueCell.value =
          numericValue === null ? String(value ?? "") : numericValue;
        valueCell.font = {
          name: "Aptos Display",
          size: 14,
          bold: true,
          color: { argb: COLORS.ink },
        };
        valueCell.alignment = {
          vertical: "top",
          horizontal: "left",
          indent: 1,
        };
        if (numericValue !== null) {
          valueCell.numFmt = MONEY_SUMMARY.test(String(label))
            ? moneyFmt
            : "#,##0";
        }
        kpiCells.set(String(label).trim().toLowerCase(), {
          cell: valueCell,
          result: numericValue ?? value,
        });
      });
    }
  }

  const tableSpacer = ws.addRow([]);
  tableSpacer.height = 12;
  const headerRowNumber = ws.rowCount + 1;
  const firstDataRow = headerRowNumber + 1;

  const typedRows = rows.map((row) =>
    headers.map((header, index) => {
      const value = row[index];
      if (dateCols[index]) {
        const date = toExcelDate(value);
        if (date) return date;
      }
      if (numericCols[index]) {
        const number = toNumber(value);
        if (number !== null) return number;
      }
      return value === null || value === undefined ? "" : String(value);
    })
  );

  const tableName = `${
    String(reportType || title || "Report")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 20) || "Report"
  }Table`;
  ws.addTable({
    name: tableName,
    ref: `A${headerRowNumber}`,
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium2",
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      showColumnStripes: false,
    },
    columns: headers.map((header) => ({ name: String(header) })),
    rows: typedRows,
  });

  const headerRow = ws.getRow(headerRowNumber);
  headerRow.height = 30;
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font = {
      name: "Aptos",
      size: 10,
      bold: true,
      color: { argb: COLORS.white },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.ink },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: numericCols[col - 1] ? "right" : "left",
      wrapText: true,
    };
    cell.border = {
      bottom: { style: "medium", color: { argb: COLORS.emerald } },
    };
  });

  const lastDataRow = headerRowNumber + typedRows.length;
  for (
    let rowNumber = firstDataRow;
    rowNumber <= lastDataRow;
    rowNumber += 1
  ) {
    const row = ws.getRow(rowNumber);
    row.height = 21;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = {
        name: "Aptos",
        size: 9,
        color: { argb: COLORS.ink },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: numericCols[col - 1]
          ? "right"
          : dateCols[col - 1]
            ? "center"
            : "left",
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: COLORS.line } },
      };
      if (moneyCols[col - 1]) cell.numFmt = moneyFmt;
      else if (numericCols[col - 1]) cell.numFmt = "#,##0";
      else if (dateCols[col - 1]) {
        cell.numFmt = /time/i.test(String(headers[col - 1]))
          ? "dd mmm yyyy hh:mm"
          : "dd mmm yyyy";
      } else {
        cell.numFmt = "@";
      }
    });
    if (rowNumber % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.surface },
        };
      });
    }
    /* What this row is.

       The sales reports say so outright. Anything else falls back to reading
       the Payment column, which is how credit rows were marked before
       rowKinds existed. */
    const kind =
      (Array.isArray(rowKinds) ? rowKinds[rowNumber - firstDataRow] : "") ||
      (shouldMarkCreditRows &&
      String(
        typedRows[rowNumber - firstDataRow]?.[paymentColumn] || "",
      ).toLowerCase() === "credit"
        ? "credit"
        : "");
    const marked = ROW_KIND_FILLS[kind];
    if (marked) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS[marked.bg] },
        };
        cell.font = {
          ...(cell.font || {}),
          bold: true,
          color: { argb: COLORS[marked.ink] },
        };
      });
    }
  }

  const statusColumn = headers.findIndex((header) =>
    /stock status/i.test(String(header))
  );
  if (statusColumn >= 0 && typedRows.length) {
    const statusLetter = columnLetter(statusColumn + 1);
    const statusRange = `${statusLetter}${firstDataRow}:${statusLetter}${lastDataRow}`;
    ws.addConditionalFormatting({
      ref: statusRange,
      rules: [
        {
          type: "containsText",
          operator: "containsText",
          text: "Out of stock",
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: COLORS.redSoft },
            },
            font: { bold: true, color: { argb: COLORS.red } },
          },
        },
        {
          type: "containsText",
          operator: "containsText",
          text: "Low",
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: COLORS.amberSoft },
            },
            font: { bold: true, color: { argb: COLORS.amber } },
          },
        },
        {
          type: "containsText",
          operator: "containsText",
          text: "OK",
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: COLORS.greenSoft },
            },
            font: { bold: true, color: { argb: COLORS.green } },
          },
        },
      ],
    });
  }

  const expiryColumn = headers.findIndex((header) =>
    /expiry date/i.test(String(header))
  );
  if (expiryColumn >= 0 && typedRows.length) {
    const expiryLetter = columnLetter(expiryColumn + 1);
    const expiryRange = `${expiryLetter}${firstDataRow}:${expiryLetter}${lastDataRow}`;
    ws.addConditionalFormatting({
      ref: expiryRange,
      rules: [
        {
          type: "expression",
          formulae: [
            `AND($${expiryLetter}${firstDataRow}<>"",$${expiryLetter}${firstDataRow}<TODAY())`,
          ],
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: COLORS.redSoft },
            },
            font: { bold: true, color: { argb: COLORS.red } },
          },
        },
        {
          type: "expression",
          formulae: [
            `AND($${expiryLetter}${firstDataRow}<>"",$${expiryLetter}${firstDataRow}>=TODAY(),$${expiryLetter}${firstDataRow}<=TODAY()+30)`,
          ],
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: COLORS.amberSoft },
            },
            font: { bold: true, color: { argb: COLORS.amber } },
          },
        },
      ],
    });
  }

  headers.forEach((header, index) => {
    const values = rows.map((row) => row[index]);
    ws.getColumn(index + 1).width = semanticWidth(header, values);
  });

  if (isInventory) {
    const headerMap = new Map(
      headers.map((header, index) => [
        String(header).trim().toLowerCase(),
        columnLetter(index + 1),
      ])
    );
    const setFormula = (label, formula) => {
      const target = kpiCells.get(label.toLowerCase());
      if (target) {
        target.cell.value = { formula, result: target.result };
      }
    };
    const nameCol = headerMap.get("name") || "A";
    const quantityCol = headerMap.get("quantity");
    const costCol = headerMap.get("unit cost");
    const retailCol = headerMap.get("retail value");
    const safeEnd = Math.max(firstDataRow, lastDataRow);

    setFormula(
      "Total Products",
      typedRows.length
        ? `COUNTA(${nameCol}${firstDataRow}:${nameCol}${safeEnd})`
        : "0"
    );
    if (quantityCol) {
      setFormula(
        "Total Units in Stock",
        typedRows.length
          ? `SUM(${quantityCol}${firstDataRow}:${quantityCol}${safeEnd})`
          : "0"
      );
    }
    if (quantityCol && costCol) {
      setFormula(
        "Total Cost Value",
        typedRows.length
          ? `SUMPRODUCT(${quantityCol}${firstDataRow}:${quantityCol}${safeEnd},${costCol}${firstDataRow}:${costCol}${safeEnd})`
          : "0"
      );
    }
    if (retailCol) {
      setFormula(
        "Total Retail Value",
        typedRows.length
          ? `SUM(${retailCol}${firstDataRow}:${retailCol}${safeEnd})`
          : "0"
      );
    }
    if (quantityCol && costCol && retailCol) {
      setFormula(
        "Potential Profit",
        typedRows.length
          ? `SUM(${retailCol}${firstDataRow}:${retailCol}${safeEnd})-SUMPRODUCT(${quantityCol}${firstDataRow}:${quantityCol}${safeEnd},${costCol}${firstDataRow}:${costCol}${safeEnd})`
          : "0"
      );
    }
  }

  const finalRow = Math.max(headerRowNumber, lastDataRow);
  ws.views = [
    {
      state: "frozen",
      ySplit: headerRowNumber,
      activeCell: `A${firstDataRow}`,
      showGridLines: false,
      zoomScale: 90,
      zoomScaleNormal: 90,
    },
  ];
  ws.pageSetup.printArea = `A1:${lastCol}${finalRow}`;
  ws.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;

  return wb.xlsx.writeBuffer();
}

module.exports = { buildWorkbookBuffer };

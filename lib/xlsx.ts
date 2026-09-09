import "server-only";
import ExcelJS from "exceljs";

/** Builds a single-sheet .xlsx workbook from an array of flat row objects —
 *  the object keys become the header row, in order. Used for admin agreement
 *  exports alongside the existing CSV export (lib/csv.ts), never for reading
 *  untrusted spreadsheets. */
export async function toXlsxBuffer(rows: Record<string, string | number>[], sheetName = "Sheet1"): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(Math.max(h.length + 2, 14), 40) }));
    sheet.getRow(1).font = { bold: true };
    rows.forEach((r) => sheet.addRow(r));
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

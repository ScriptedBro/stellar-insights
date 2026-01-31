import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

type ExportRow = Record<string, unknown>;
type ExportColumn = { id: string; label: string };

const formatExportValue = (colId: string, value: unknown): string => {
  if (colId === "date") {
    const dateValue =
      value instanceof Date
        ? value
        : typeof value === "string" || typeof value === "number"
          ? new Date(value)
          : null;
    return dateValue ? format(dateValue, "yyyy-MM-dd HH:mm:ss") : "";
  }

  if (colId === "success_rate" && typeof value === "number") {
    return `${(value * 100).toFixed(2)}%`;
  }

  if ((colId === "total_volume" || colId === "tvl") && typeof value === "number") {
    return `$${value.toLocaleString()}`;
  }

  if (colId === "latency" && typeof value === "number") {
    return `${value} ms`;
  }

  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value.toString();
  return JSON.stringify(value);
};

export function generateCSV(
  data: ExportRow[],
  columns: ExportColumn[],
) {
  const headers = columns.map((c) => c.label).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = formatExportValue(col.id, row[col.id]);
        if (value.includes(",")) return `"${value}"`;
        return value;
      })
      .join(","),
  );

  const csv = [headers, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `analytics_export_${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function generateJSON(
  data: ExportRow[],
  columns: ExportColumn[],
) {
  // Filter data to only include selected columns
  const filteredData = data.map((row) => {
    const newRow: Record<string, unknown> = {};
    columns.forEach((col) => {
      newRow[col.id] = row[col.id]; // keep raw values for JSON
    });
    return newRow;
  });

  const json = JSON.stringify(filteredData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `analytics_export_${format(new Date(), "yyyy-MM-dd")}.json`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function generatePDF(
  data: ExportRow[],
  columns: ExportColumn[],
  dateRange: { start: Date | null; end: Date | null },
) {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("Analytics Export Report", 14, 22);

  doc.setFontSize(11);
  doc.setTextColor(100);
  const dateStr = `Generated on: ${format(new Date(), "PPpp")}`;
  doc.text(dateStr, 14, 30);

  if (dateRange.start && dateRange.end) {
    doc.text(
      `Range: ${format(dateRange.start, "yyyy-MM-dd")} to ${format(dateRange.end, "yyyy-MM-dd")}`,
      14,
      36,
    );
  }

  // Table
  const tableHeaders = columns.map((c) => c.label);
  const tableData = data.map((row) =>
    columns.map((col) => formatExportValue(col.id, row[col.id])),
  );

  autoTable(doc, {
    head: [tableHeaders],
    body: tableData,
    startY: 44,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] }, // Blue-500
    styles: { fontSize: 8 },
  });

  doc.save(`analytics_report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}

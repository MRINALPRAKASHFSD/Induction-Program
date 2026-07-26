/**
 * src/lib/export-utils.ts
 *
 * Utilities for exporting analytics data to various formats (CSV, PNG, PDF).
 */

/**
 * Converts an array of objects to a CSV string and triggers a download.
 */
export function exportToCSV(data: any[], filename: string) {
  if (!data || !data.length) {
    console.warn("No data available to export");
    return;
  }

  // Extract headers
  const headers = Object.keys(data[0]);
  
  // Convert data to CSV format
  const csvRows = [];
  csvRows.push(headers.join(',')); // Add header row

  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      // Escape commas and quotes
      const escaped = ('' + (val ?? '')).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers a print/PDF dialog for the whole page or a specific element.
 * In a fully robust implementation, this could use jsPDF + html2canvas.
 */
export function exportToPDF(elementId?: string, title: string = "Analytics Report") {
  // Simple fallback: trigger print dialog.
  // The CSS print media query should hide everything except the target element.
  window.print();
}

/**
 * Downloads a DOM element (like a Recharts SVG container) as a PNG.
 * NOTE: For Recharts, you typically need to serialize the SVG to a canvas first.
 */
export async function exportElementAsPNG(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Element with ID ${elementId} not found`);
    return;
  }

  try {
    // We dynamically import html2canvas to avoid bloating the initial bundle
    // if the user doesn't click export. 
    // Assuming html2canvas is installed. If not, this will throw.
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      backgroundColor: null, // Transparent
      scale: 2 // Higher resolution
    });

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error("Failed to export as PNG:", err);
    alert("Export to PNG failed. Ensure html2canvas is installed.");
  }
}

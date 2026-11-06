import * as XLSX from 'xlsx';

/**
 * Universal Excel (.xlsx) exporter using SheetJS.
 * Produces genuine, compliant .xlsx files that open in Excel without errors.
 */
export function exportToExcel(
  sheets: { name: string; data: any[] }[],
  fileName = 'sales_analytics_report.xlsx'
) {
  try {
    const wb = XLSX.utils.book_new();

    sheets.forEach(({ name, data }) => {
      const cleanName = name.replace(/[\\/?*[\]]/g, '').slice(0, 31) || 'Sheet1';
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ status: 'No records available' }]);

      // Auto-fit column widths
      if (data.length > 0) {
        const keys = Object.keys(data[0]);
        ws['!cols'] = keys.map(key => {
          const maxValLen = data.reduce((max, row) => {
            const val = row[key];
            return Math.max(max, val !== null && val !== undefined ? String(val).length : 0);
          }, key.length);
          return { wch: Math.min(Math.max(maxValLen + 2, 10), 50) };
        });
      }

      XLSX.utils.book_append_sheet(wb, ws, cleanName);
    });

    const safeName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    XLSX.writeFile(wb, safeName);
    return true;
  } catch (err) {
    console.error('Failed to export Excel file:', err);
    return false;
  }
}

/**
 * Standard CSV exporter with UTF-8 BOM so Excel opens it without character encoding errors.
 */
export function exportToCsv(data: any[], fileName = 'report.csv') {
  try {
    if (!data || data.length === 0) {
      alert('No data available to export.');
      return false;
    }

    const headers = Object.keys(data[0]);
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(h => escapeCsv(row[h])).join(','))
    ];

    // Prepend UTF-8 BOM (\uFEFF) so Excel parses Unicode/special characters correctly
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    console.error('Failed to export CSV file:', err);
    return false;
  }
}

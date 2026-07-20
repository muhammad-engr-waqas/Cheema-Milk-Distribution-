import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PdfColumn {
  header: string;
  dataKey: string;
}

export const downloadTransactionsPDF = (
  title: string,
  columns: PdfColumn[],
  data: any[],
  filename: string
) => {
  // Landscape orientation taake sab columns ek line mein fit hon
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Page width landscape A4 = 297mm, usable ~277mm (10mm margins each side)
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const usableWidth = pageWidth - margin * 2;

  // Header
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Cheema Milk Collection & Commission Agent', margin, 11);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(title, margin, 16);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-PK')}`, margin, 20);

  // Column widths — equal distribution across usable width
  const colWidth = usableWidth / columns.length;
  const columnStyles: Record<string, { cellWidth: number }> = {};
  columns.forEach((_, i) => {
    columnStyles[i] = { cellWidth: colWidth };
  });

  autoTable(doc, {
    startY: 24,
    head: [columns.map(c => c.header)],
    body: data.map(item => columns.map(c => item[c.dataKey] ?? '-')),
    theme: 'grid',
    styles: {
      fontSize: 6.5,          // Chota font — sab ek line mein
      cellPadding: 1.5,
      overflow: 'linebreak',
      halign: 'left',
      valign: 'middle',
      minCellHeight: 6,
    },
    headStyles: {
      fillColor: [15, 118, 110], // emerald-700
      textColor: 255,
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles,
    margin: { left: margin, right: margin },
    tableWidth: usableWidth,
  });

  doc.save(`${filename}.pdf`);
};

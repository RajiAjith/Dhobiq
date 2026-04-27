import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export const generateInvoicePDF = (invoice, customer, logoUrl) => {
  const doc = new jsPDF();

  // Header background
  doc.setFillColor(240, 244, 248); // Light blue background
  doc.rect(0, 0, 210, 297, 'F');

  // Header Logo and Title
  if (logoUrl) {
    try {
      const img = new Image();
      img.src = logoUrl;
      doc.addImage(img, 'PNG', 14, 15, 30, 30);
    } catch (e) {
      console.log('Error adding logo', e);
    }
  }

  doc.setTextColor(0, 51, 102); // Dark blue text
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("Dhobiq Laundry", 50, 25);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Your Clothes Our Care!", 50, 32);

  doc.setFontSize(36);
  doc.text("Invoice", 140, 30);

  // Customer & Invoice Details
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Left side - Customer
  doc.setFont("helvetica", "bold");
  doc.text("To:", 14, 50);
  doc.setFont("helvetica", "normal");
  doc.text(`Name : ${customer?.name || ''}`, 30, 50);
  doc.text(`Address : ${customer?.address || ''}`, 30, 55);
  doc.text(`Mob : ${customer?.phone || ''}`, 30, 60);

  // Right side - Invoice Info
  const formattedDate = invoice.date ? format(new Date(invoice.date), 'MMMM dd, yyyy') : '';
  doc.text(`Date :`, 130, 50);
  doc.text(formattedDate, 155, 50);
  doc.text(`Invoice # :`, 130, 55);
  doc.text(invoice.invoiceNumber, 155, 55);
  if (customer?.id) {
    doc.text(`Customer ID :`, 130, 60);
    doc.text(customer.id, 155, 60);
  }

  // Table
  const tableData = invoice.items.map((item, index) => [
    index + 1,
    item.name,
    item.quantity,
    `Rs.${Number(item.unitPrice).toFixed(2)}`,
    `Rs.${Number(item.total).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 75,
    head: [['Sl.No.', 'Description', 'Quantity', 'Unit Price', 'Line Total']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: [0, 51, 102],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      1: { halign: 'left', cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 35 },
      4: { halign: 'right', cellWidth: 35 },
    },
    margin: { top: 75 },
  });

  const finalY = doc.lastAutoTable.finalY + 10;

  // Totals Section
  doc.setFillColor(255, 255, 255);
  doc.rect(120, finalY, 76, 25, 'F');

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Subtotal", 130, finalY + 8);
  doc.text(`Rs.${Number(invoice.totalAmount).toFixed(2)}`, 180, finalY + 8, { align: 'right' });

  doc.setFont("helvetica", "bold");
  doc.text("Total", 130, finalY + 18);
  doc.text(`Rs.${Number(invoice.totalAmount).toFixed(2)}`, 180, finalY + 18, { align: 'right' });

  // Footer
  doc.setFontSize(9);
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(0, 51, 102);
  doc.text("Freshness Delivered to Your Doorstep", 105, 260, { align: "center" });
  doc.text("Thank you for your business!", 105, 265, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Near MacDonald's | Thumpoly P.O, Alappuzha", 105, 275, { align: "center" });
  doc.text("Mob: +91-9061504910, +91-7902958593", 105, 280, { align: "center" });

  doc.save(`${invoice.invoiceNumber}.pdf`);
};

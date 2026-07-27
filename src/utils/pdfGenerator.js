import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from './currencyFormatter';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

let robotoRegularB64 = null;
let robotoBoldB64 = null;

async function loadFonts(doc) {
  if (!robotoRegularB64) {
    const resReg = await fetch('/fonts/Roboto-Regular.ttf');
    const bufReg = await resReg.arrayBuffer();
    robotoRegularB64 = arrayBufferToBase64(bufReg);
  }
  if (!robotoBoldB64) {
    const resBold = await fetch('/fonts/Roboto-Bold.ttf');
    const bufBold = await resBold.arrayBuffer();
    robotoBoldB64 = arrayBufferToBase64(bufBold);
  }
  
  doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularB64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  
  doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldB64);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  
  doc.setFont('Roboto', 'normal');
}

// Helper to asynchronously load image element to get its width/height aspect ratio
const loadImage = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

// ─── Shared constants ────────────────────────────────────────────────────────
const BRAND_BLUE = [0, 61, 130];      // Deep Royal Blue
const ACCENT_BLUE = [37, 99, 235];    // Bright Indigo/Blue
const TEXT_DARK = [31, 41, 55];       // Charcoal `#1f2937`
const TEXT_LIGHT = [107, 114, 128];   // Muted gray `#6b7280`
const BORDER_LIGHT = [229, 231, 235]; // Light gray `#e5e7eb`
const WHITE = [255, 255, 255];
const BG_ALT = [249, 250, 251];      // Off-white `#f9fafb`
const LOGO_URL = '/logo.png';

async function drawHeader(doc, title, settings = null) {
  // Elegant top brand line
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, 210, 6, 'F');

  // Load logo image with correct aspect ratio
  const img = await loadImage(LOGO_URL);
  let logoWidth = 22;
  let logoHeight = 22;
  
  if (img) {
    const w = img.naturalWidth || img.width || 1;
    const h = img.naturalHeight || img.height || 1;
    const ratio = w / h;
    logoHeight = 22;
    logoWidth = logoHeight * ratio;
    // Set bounds check to prevent extreme values
    if (logoWidth > 50) logoWidth = 50;
    doc.addImage(img, 'PNG', 14, 11, logoWidth, logoHeight);
  }

  // Calculate text starting X coordinate based on logo width
  const textX = 14 + logoWidth + 4; // 14 (margin) + logo width + 4mm gap

  // Brand Name and Details
  doc.setTextColor(...BRAND_BLUE);
  doc.setFontSize(16);
  doc.setFont('Roboto', 'bold');
  doc.text(settings?.name || 'Dhobiq Laundry', textX, 20);
  
  doc.setFontSize(8.5);
  doc.setFont('Roboto', 'normal');
  doc.setTextColor(...TEXT_LIGHT);
  doc.text(settings?.tagline || 'Your Clothes Our Care!', textX, 25);
  doc.text(settings?.phone ? `Mob: ${settings.phone}` : 'Mob: +91 90615 04910, +91 79029 58593', textX, 30);

  // Document Title (Right Aligned)
  doc.setTextColor(...BRAND_BLUE);
  doc.setFontSize(24);
  doc.setFont('Roboto', 'bold');
  doc.text(title.toUpperCase(), 196, 22, { align: 'right' });
}

function drawFooter(doc, settings = null) {
  // Thin footer separator line
  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(14, 268, 196, 268);

  doc.setFontSize(8.5);
  doc.setFont('Roboto', 'bold');
  doc.setTextColor(...BRAND_BLUE);
  doc.text(settings?.footerText || 'Freshness Delivered to Your Doorstep', 105, 274, { align: 'center' });
  doc.text('Thank you for choosing Dhobiq!', 105, 279, { align: 'center' });
  
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_LIGHT);
  doc.text(settings?.address || "Near MacDonald's | Thumpoly P.O, Alappuzha", 105, 284, { align: 'center' });
}

function drawItemsTable(doc, items, startY) {
  const tableData = items.map((item, index) => [
    index + 1,
    item.name,
    item.quantity,
    formatCurrency(item.unitPrice),
    formatCurrency(item.total)
  ]);

  autoTable(doc, {
    startY,
    head: [['#', 'Service Description', 'Qty', 'Rate', 'Amount']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: BRAND_BLUE,
      textColor: WHITE,
      font: 'Roboto',
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 4,
    },
    bodyStyles: {
      textColor: TEXT_DARK,
      font: 'Roboto',
      fontSize: 8.5,
      cellPadding: 4,
    },
    alternateRowStyles: { 
      fillColor: BG_ALT 
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 26 },
    },
    styles: {
      lineColor: BORDER_LIGHT,
      lineWidth: 0.1,
    },
    margin: { left: 14, right: 14 },
  });
}

function drawTotals(doc, totalAmount, finalY, amountPaid = null, balanceAmount = null, paymentStatus = null) {
  const boxX = 126;
  const boxW = 70;
  const boxH = (amountPaid !== null && balanceAmount !== null) ? 38 : 18;

  // Modern subtle grey shaded block with thin clean border
  doc.setFillColor(...BG_ALT);
  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX, finalY, boxW, boxH, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('Roboto', 'normal');
  doc.setTextColor(...TEXT_DARK);

  if (amountPaid !== null && balanceAmount !== null) {
    doc.text('Total Amount:', boxX + 6, finalY + 8);
    doc.text(formatCurrency(totalAmount), boxX + boxW - 6, finalY + 8, { align: 'right' });

    doc.text('Amount Paid:', boxX + 6, finalY + 16);
    doc.text(`- ${formatCurrency(amountPaid)}`, boxX + boxW - 6, finalY + 16, { align: 'right' });

    // Clean divider
    doc.setDrawColor(...BORDER_LIGHT);
    doc.line(boxX + 4, finalY + 20, boxX + boxW - 4, finalY + 20);

    // Balance Due
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(9.5);
    if (balanceAmount <= 0) {
      doc.setTextColor(16, 185, 129); // Success Green
    } else {
      doc.setTextColor(220, 38, 38);  // Warning Red
    }
    doc.text('Balance Due:', boxX + 6, finalY + 28);
    doc.text(formatCurrency(balanceAmount), boxX + boxW - 6, finalY + 28, { align: 'right' });
  } else {
    // Normal bill totals
    doc.text('Subtotal:', boxX + 6, finalY + 8);
    doc.text(formatCurrency(totalAmount), boxX + boxW - 6, finalY + 8, { align: 'right' });

    doc.setDrawColor(...BORDER_LIGHT);
    doc.line(boxX + 4, finalY + 11, boxX + boxW - 4, finalY + 11);

    doc.setFont('Roboto', 'bold');
    doc.setTextColor(...BRAND_BLUE);
    doc.text('Total:', boxX + 6, finalY + 15);
    doc.text(formatCurrency(totalAmount), boxX + boxW - 6, finalY + 15, { align: 'right' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.  BILL PDF
// ─────────────────────────────────────────────────────────────────────────────
export const generateBillPDF = async (bill, customer, shouldDownload = true) => {
  let settings = null;
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) settings = snap.data();
  } catch (e) {
    console.error("PDF generation settings load failed", e);
  }

  const docObj = new jsPDF();
  await loadFonts(docObj);
  await drawHeader(docObj, 'Bill', settings);

  // Customer & Bill details
  const formattedDate = bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : '';
  docObj.setFontSize(9.5);
  docObj.setTextColor(...TEXT_DARK);

  // Left Column — Customer info card
  docObj.setDrawColor(...BORDER_LIGHT);
  docObj.setFillColor(...BG_ALT);
  docObj.roundedRect(14, 44, 88, 28, 2, 2, 'FD');
  
  docObj.setFont('Roboto', 'bold');
  docObj.text('BILL TO:', 20, 51);
  docObj.setFont('Roboto', 'normal');
  docObj.text(`Name    : ${customer?.name || ''}`, 20, 57);
  docObj.text(`Address : ${customer?.address || ''}`, 20, 63);
  docObj.text(`Mobile  : ${customer?.phone || ''}`, 20, 69);

  // Right Column — Document Metadata card
  docObj.setDrawColor(...BORDER_LIGHT);
  docObj.setFillColor(...BG_ALT);
  docObj.roundedRect(108, 44, 88, 28, 2, 2, 'FD');
  docObj.setFont('Roboto', 'bold');
  docObj.text('BILL DETAILS:', 114, 51);
  docObj.setFont('Roboto', 'normal');
  docObj.text(`Bill #   : ${bill.billNumber || bill.id}`, 114, 57);
  docObj.text(`Date     : ${formattedDate}`, 114, 63);
  if (customer?.id) {
    docObj.text(`Cust. ID : ${customer.id}`, 114, 69);
  }

  drawItemsTable(docObj, bill.items || [], 78);

  const finalY = docObj.lastAutoTable.finalY + 8;
  drawTotals(docObj, bill.totalAmount, finalY);

  // Notes
  if (bill.notes) {
    docObj.setFontSize(8.5);
    docObj.setFont('Roboto', 'normal');
    docObj.setTextColor(...TEXT_LIGHT);
    docObj.text(`Notes: ${bill.notes}`, 14, finalY + 12);
  }

  drawFooter(docObj, settings);
  if (shouldDownload) {
    docObj.save(`Bill-${bill.billNumber || bill.id}-${customer?.name || 'customer'}.pdf`);
  }
  return docObj;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.  CONSOLIDATED INVOICE PDF
// ─────────────────────────────────────────────────────────────────────────────
export const generateInvoicePDF = async (invoice, customer, bills = [], shouldDownload = true) => {
  let settings = null;
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) settings = snap.data();
  } catch (e) {
    console.error("PDF generation settings load failed", e);
  }

  const docObj = new jsPDF();
  await loadFonts(docObj);
  await drawHeader(docObj, 'Invoice', settings);

  const invoiceDate = invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'dd MMM yyyy') : '';
  const periodFrom = invoice.periodFrom ? format(new Date(invoice.periodFrom), 'dd MMM yyyy') : '';
  const periodTo = invoice.periodTo ? format(new Date(invoice.periodTo), 'dd MMM yyyy') : '';

  docObj.setFontSize(9.5);
  docObj.setTextColor(...TEXT_DARK);

  // Left Column — Customer info card
  docObj.setDrawColor(...BORDER_LIGHT);
  docObj.setFillColor(...BG_ALT);
  docObj.roundedRect(14, 44, 88, 28, 2, 2, 'FD');
  
  docObj.setFont('Roboto', 'bold');
  docObj.text('INVOICE TO:', 20, 51);
  docObj.setFont('Roboto', 'normal');
  docObj.text(`Name    : ${customer?.name || ''}`, 20, 57);
  docObj.text(`Address : ${customer?.address || ''}`, 20, 63);
  docObj.text(`Mobile  : ${customer?.phone || ''}`, 20, 69);

  // Right Column — Document Metadata card
  docObj.setDrawColor(...BORDER_LIGHT);
  docObj.setFillColor(...BG_ALT);
  docObj.roundedRect(108, 44, 88, 28, 2, 2, 'FD');
  docObj.setFont('Roboto', 'bold');
  docObj.text('INVOICE DETAILS:', 114, 51);
  docObj.setFont('Roboto', 'normal');
  docObj.text(`Invoice # : ${invoice.invoiceNumber || invoice.id}`, 114, 57);
  docObj.text(`Date      : ${invoiceDate}`, 114, 63);
  if (periodFrom && periodTo) {
    docObj.text(`Period    : ${periodFrom} – ${periodTo}`, 114, 69);
  }

  drawItemsTable(docObj, invoice.items || [], 78);

  const finalY = docObj.lastAutoTable.finalY + 8;
  drawTotals(
    docObj,
    invoice.totalAmount,
    finalY,
    invoice.amountPaid ?? 0,
    invoice.balanceAmount ?? invoice.totalAmount,
    invoice.paymentStatus || invoice.status || 'unpaid'
  );

  // Included bills reference
  if (bills.length > 0) {
    const billNums = bills.map(b => b.billNumber || b.id).join(', ');
    docObj.setFontSize(8);
    docObj.setFont('Roboto', 'normal');
    docObj.setTextColor(...TEXT_LIGHT);
    const refY = finalY + 12;
    docObj.text('Included Bills:', 14, refY);
    const wrapped = docObj.splitTextToSize(billNums, 100);
    docObj.text(wrapped, 14, refY + 4);
  }

  drawFooter(docObj, settings);
  if (shouldDownload) {
    docObj.save(`Invoice-${invoice.invoiceNumber || invoice.id}-${customer?.name || 'customer'}.pdf`);
  }
  return docObj;
};

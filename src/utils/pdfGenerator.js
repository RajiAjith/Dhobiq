import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

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
// ─── Shared constants ────────────────────────────────────────────────────────
const BRAND_BLUE = [0, 51, 102];
const BG_GRAY = [240, 244, 248];
const WHITE = [255, 255, 255];
const ALT_ROW = [248, 249, 250];
const LOGO_URL = '/logo.png';

function drawHeader(doc, title) {
  // Page background
  doc.setFillColor(...BG_GRAY);
  doc.rect(0, 0, 210, 297, 'F');

  // Logo
  try {
    const img = new Image();
    img.src = LOGO_URL;
    doc.addImage(img, 'PNG', 14, 12, 28, 28);
  } catch (e) {
    // logo optional
  }

  // Brand name
  doc.setTextColor(...BRAND_BLUE);
  doc.setFontSize(22);
  doc.setFont('Roboto', 'bold');
  doc.text('Dhobiq Laundry', 48, 22);
  doc.setFontSize(10);
  doc.setFont('Roboto', 'normal');
  doc.text('Your Clothes Our Care!', 48, 29);

  // Document title (right side)
  doc.setFontSize(30);
  doc.setFont('Roboto', 'bold');
  doc.text(title, 196, 28, { align: 'right' });
}

function drawFooter(doc) {
  doc.setFontSize(9);
  doc.setFont('Roboto', 'bold');
  doc.setTextColor(...BRAND_BLUE);
  doc.text('Freshness Delivered to Your Doorstep', 105, 260, { align: 'center' });
  doc.text('Thank you for your business!', 105, 266, { align: 'center' });
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("Near MacDonald's | Thumpoly P.O, Alappuzha", 105, 274, { align: 'center' });
  doc.text('Mob: +91-9061504910, +91-7902958593', 105, 279, { align: 'center' });
}

function drawItemsTable(doc, items, startY) {
  const tableData = items.map((item, index) => [
    index + 1,
    item.name,
    item.quantity,
    `₹ ${Number(item.unitPrice).toFixed(2)}`,
    `₹ ${Number(item.total).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY,
    head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: BRAND_BLUE,
      textColor: WHITE,
      font: 'Roboto',
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 10,
    },
    bodyStyles: {
      fillColor: WHITE,
      textColor: [0, 0, 0],
      font: 'Roboto',
      fontSize: 10,
    },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { halign: 'left', cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 32 },
      4: { halign: 'right', cellWidth: 32 },
    },
    margin: { left: 14, right: 14 },
  });
}

function drawTotals(doc, totalAmount, finalY, amountPaid = null, balanceAmount = null, paymentStatus = null) {
  const boxX = 120;
  const boxW = 76;
  let boxH = 28;

  if (amountPaid !== null && balanceAmount !== null) {
    boxH = 48; // taller box if we have paid/balance fields
  }

  doc.setFillColor(...WHITE);
  doc.roundedRect(boxX, finalY, boxW, boxH, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setFont('Roboto', 'normal');
  doc.setTextColor(0, 0, 0);

  if (amountPaid !== null && balanceAmount !== null) {
    doc.text('Total Amount', boxX + 8, finalY + 9);
    doc.text(`₹ ${Number(totalAmount).toFixed(2)}`, boxX + boxW - 4, finalY + 9, { align: 'right' });

    doc.text('Amount Paid', boxX + 8, finalY + 18);
    doc.text(`- ₹ ${Number(amountPaid).toFixed(2)}`, boxX + boxW - 4, finalY + 18, { align: 'right' });

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(boxX + 4, finalY + 23, boxX + boxW - 4, finalY + 23);

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_BLUE);
    doc.text('Balance Due', boxX + 8, finalY + 32);
    doc.text(`₹ ${Number(balanceAmount).toFixed(2)}`, boxX + boxW - 4, finalY + 32, { align: 'right' });
  } else {
    // Normal bill totals
    doc.text('Subtotal', boxX + 8, finalY + 9);
    doc.text(`₹ ${Number(totalAmount).toFixed(2)}`, boxX + boxW - 4, finalY + 9, { align: 'right' });

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(boxX + 4, finalY + 14, boxX + boxW - 4, finalY + 14);

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_BLUE);
    doc.text('Total', boxX + 8, finalY + 23);
    doc.text(`₹ ${Number(totalAmount).toFixed(2)}`, boxX + boxW - 4, finalY + 23, { align: 'right' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.  BILL PDF
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Generate and download a professional Bill PDF.
 * @param {object} bill      - bill document from Firestore
 * @param {object} customer  - customer document from Firestore
 */
export const generateBillPDF = async (bill, customer) => {
  const doc = new jsPDF();
  await loadFonts(doc);
  drawHeader(doc, 'Bill');

  // Customer & Bill details
  const formattedDate = bill.date ? format(new Date(bill.date), 'MMMM dd, yyyy') : '';
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Left — customer
  doc.setFont('Roboto', 'bold');
  doc.text('To:', 14, 50);
  doc.setFont('Roboto', 'normal');
  doc.text(`Name    : ${customer?.name || ''}`, 28, 50);
  doc.text(`Address : ${customer?.address || ''}`, 28, 56);
  doc.text(`Mob     : ${customer?.phone || ''}`, 28, 62);

  // Right — bill info
  doc.text('Date     :', 128, 50);
  doc.text(formattedDate, 196, 50, { align: 'right' });
  doc.text('Bill #   :', 128, 56);
  doc.text(bill.billNumber || bill.id, 196, 56, { align: 'right' });
  if (customer?.id) {
    doc.text('Cust. ID :', 128, 62);
    doc.text(customer.id, 196, 62, { align: 'right' });
  }

  // Divider
  doc.setDrawColor(...BRAND_BLUE);
  doc.setLineWidth(0.5);
  doc.line(14, 68, 196, 68);

  drawItemsTable(doc, bill.items || [], 72);

  const finalY = doc.lastAutoTable.finalY + 8;
  drawTotals(doc, bill.totalAmount, finalY);

  // Notes
  if (bill.notes) {
    doc.setFontSize(9);
    doc.setFont('Roboto', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Notes: ${bill.notes}`, 14, finalY + 38);
  }

  drawFooter(doc);
  doc.save(`Bill-${bill.billNumber || bill.id}-${customer?.name || 'customer'}.pdf`);
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.  CONSOLIDATED INVOICE PDF
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Generate and download a professional consolidated Invoice PDF.
 * @param {object} invoice   - invoice document from Firestore
 * @param {object} customer  - customer document from Firestore
 * @param {Array}  bills     - array of bill documents included in this invoice
 */
export const generateInvoicePDF = async (invoice, customer, bills = []) => {
  const doc = new jsPDF();
  await loadFonts(doc);
  drawHeader(doc, 'Invoice');

  const invoiceDate = invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'MMMM dd, yyyy') : '';
  const periodFrom = invoice.periodFrom ? format(new Date(invoice.periodFrom), 'dd MMM yyyy') : '';
  const periodTo = invoice.periodTo ? format(new Date(invoice.periodTo), 'dd MMM yyyy') : '';

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Left — customer
  doc.setFont('Roboto', 'bold');
  doc.text('To:', 14, 50);
  doc.setFont('Roboto', 'normal');
  doc.text(`Name    : ${customer?.name || ''}`, 28, 50);
  doc.text(`Address : ${customer?.address || ''}`, 28, 56);
  doc.text(`Mob     : ${customer?.phone || ''}`, 28, 62);

  // Right — invoice info
  doc.text('Invoice # :', 122, 50);
  doc.text(invoice.invoiceNumber || invoice.id, 196, 50, { align: 'right' });
  doc.text('Date      :', 122, 56);
  doc.text(invoiceDate, 196, 56, { align: 'right' });
  if (periodFrom && periodTo) {
    doc.text('Period    :', 122, 62);
    doc.text(`${periodFrom} – ${periodTo}`, 196, 62, { align: 'right' });
  }
  if (customer?.id) {
    doc.text('Cust. ID  :', 122, 68);
    doc.text(customer.id, 196, 68, { align: 'right' });
  }

  // Divider
  doc.setDrawColor(...BRAND_BLUE);
  doc.setLineWidth(0.5);
  doc.line(14, 74, 196, 74);

  drawItemsTable(doc, invoice.items || [], 78);

  const finalY = doc.lastAutoTable.finalY + 8;
  drawTotals(
    doc,
    invoice.totalAmount,
    finalY,
    invoice.amountPaid ?? 0,
    invoice.balanceAmount ?? invoice.totalAmount,
    invoice.paymentStatus || invoice.status || 'unpaid'
  );

  // Included bills reference
  if (bills.length > 0) {
    const billNums = bills.map(b => b.billNumber || b.id).join(', ');
    doc.setFontSize(8.5);
    doc.setFont('Roboto', 'normal');
    doc.setTextColor(100, 100, 100);
    const refY = finalY + 36;
    doc.text('Included Bills:', 14, refY);
    const wrapped = doc.splitTextToSize(billNums, 170);
    doc.text(wrapped, 14, refY + 5);
  }

  drawFooter(doc);
  doc.save(`Invoice-${invoice.invoiceNumber || invoice.id}-${customer?.name || 'customer'}.pdf`);
};

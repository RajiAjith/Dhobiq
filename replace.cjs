const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const files = [
  'src/pages/ExpenseForm.jsx',
  'src/pages/EmployeeList.jsx',
  'src/pages/ExpenseList.jsx',
  'src/pages/EmployeeForm.jsx',
  'src/pages/InvoiceCreate.jsx',
  'src/pages/Dashboard.jsx',
  'src/pages/InvoiceDetail.jsx',
  'src/pages/CustomerForm.jsx',
  'src/pages/InvoiceList.jsx',
  'src/pages/BillList.jsx',
  'src/pages/BillCreate.jsx',
  'src/pages/SalaryPaymentForm.jsx',
  'src/pages/Reports.jsx',
  'src/pages/ServiceList.jsx',
  'src/components/InvoicePaymentModal.jsx'
];

files.forEach(f => {
  const filePath = path.join(__dirname, f);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add import if not exists
    if (content.includes('₹') && !content.includes('formatCurrency')) {
        // Need to figure out the path to currencyFormatter
        const depth = f.split('/').length - 2;
        const importPath = depth === 0 ? './utils/currencyFormatter' : 
                           depth === 1 ? '../utils/currencyFormatter' : 
                           '../../utils/currencyFormatter';
        
        // Find last import
        const lines = content.split('\n');
        let lastImportIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('import ')) {
                lastImportIdx = i;
            }
        }
        
        if (lastImportIdx !== -1) {
            lines.splice(lastImportIdx + 1, 0, `import { formatCurrency } from '${importPath}';`);
            content = lines.join('\n');
        } else {
            content = `import { formatCurrency } from '${importPath}';\n` + content;
        }
    }
    
    // Simple regex replacements for the most common patterns in React files:
    // e.g. `₹ ${amount.toFixed(2)}`
    // or `₹${amount}`
    // or `₹ {amount}`
    
    content = content.replace(/`₹ \$\{([^}]+)\}`/g, 'formatCurrency($1)');
    content = content.replace(/`₹\$\{([^}]+)\}`/g, 'formatCurrency($1)');
    content = content.replace(/₹\s*\{([^}]+)\}/g, '{formatCurrency($1)}');
    content = content.replace(/>₹\s*</g, '>{formatCurrency(0)}<'); // Edge cases
    content = content.replace(/>₹\s*(\d+(\.\d+)?)?</g, (match, num) => `>{formatCurrency(${num})}<`);
    // '₹ ' + value
    content = content.replace(/'₹ '\s*\+\s*([a-zA-Z0-9_.]+)/g, 'formatCurrency($1)');
    content = content.replace(/"₹ "\s*\+\s*([a-zA-Z0-9_.]+)/g, 'formatCurrency($1)');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${f}`);
  }
});

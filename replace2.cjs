const fs = require('fs');
const path = require('path');

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
    
    const initialContent = content;

    // 1. ₹{something.toLocaleString(...)} -> {formatCurrency(something)}
    // regex: ₹\{([a-zA-Z0-9_.]+)\.toLocaleString\([^)]+\)\s*\}
    // Handle optional nested objects/spaces carefully
    content = content.replace(/₹\s*\{([a-zA-Z0-9_.]+)\.toLocaleString\([^)]+\)\s*\}/g, '{formatCurrency($1)}');
    // Also handle if the `}` was on a new line or had extra closing braces for the config object
    // A more robust regex for toLocaleString:
    content = content.replace(/₹\s*\{([^}]+)\.toLocaleString\([^}]+\}\)\s*\}/g, '{formatCurrency($1)}');
    content = content.replace(/₹\s*\{([^}]+)\.toLocaleString\([^)]+\)\s*\}/g, '{formatCurrency($1)}');

    // 2. `₹${something.toFixed(2)}` or `₹ ${something.toFixed(2)}` -> formatCurrency(something)
    content = content.replace(/`₹\s*\$\{([^}]+)\.toFixed\(\d+\)\}`/g, 'formatCurrency($1)');
    
    // 3. `₹${something}` -> formatCurrency(something)
    content = content.replace(/`₹\s*\$\{([^}]+)\}`/g, 'formatCurrency($1)');

    // 4. ₹{something.toFixed(2)} -> {formatCurrency(something)}
    content = content.replace(/₹\s*\{([^}]+)\.toFixed\(\d+\)\}/g, '{formatCurrency($1)}');

    // 5. ₹{something} -> {formatCurrency(something)}
    content = content.replace(/₹\s*\{([^}]+)\}/g, '{formatCurrency($1)}');

    // 6. >₹something< -> >{formatCurrency(something)}<
    content = content.replace(/>₹\s*(\d+(\.\d+)?)?</g, (match, num) => `>{formatCurrency(${num})}<`);

    // 7. '₹ ' + something -> formatCurrency(something)
    content = content.replace(/'₹ '\s*\+\s*([a-zA-Z0-9_.]+)/g, 'formatCurrency($1)');
    content = content.replace(/"₹ "\s*\+\s*([a-zA-Z0-9_.]+)/g, 'formatCurrency($1)');

    if (content !== initialContent && !content.includes('import { formatCurrency }')) {
        const depth = f.split('/').length - 2;
        const importPath = depth === 0 ? './utils/currencyFormatter' : 
                           depth === 1 ? '../utils/currencyFormatter' : 
                           '../../utils/currencyFormatter';
        
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
    
    if (content !== initialContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${f}`);
    }
  }
});

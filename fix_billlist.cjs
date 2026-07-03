const fs = require('fs');
let c = fs.readFileSync('src/pages/BillList.jsx', 'utf8');
c = c.replace("month: '',", "month: new Date().getMonth().toString(),");
fs.writeFileSync('src/pages/BillList.jsx', c);
console.log('Done');

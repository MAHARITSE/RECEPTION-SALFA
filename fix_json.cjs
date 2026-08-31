const fs = require('fs');
let data = fs.readFileSync('src/data/localData.json', 'utf-8');
const badPos = 523706;
data = data.substring(0, badPos - 100);
// truncate to last complete object in the array
const lastBrace = data.lastIndexOf('}');
data = data.substring(0, lastBrace + 1);
data += ']}';
try {
  JSON.parse(data);
  fs.writeFileSync('src/data/localData_fixed.json', data);
  console.log('Fixed JSON successfully written');
} catch (e) {
  console.error('Failed to fix JSON:', e);
}

const fs = require('fs');
const path = require('path');

// Target path where the package will resolve @mui/utils/chainPropTypes
const target = path.join(__dirname, '..', 'node_modules', '@mui', 'utils', 'chainPropTypes.js');

try {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const content = `// Compatibility shim created by patch script
// Ensures a CommonJS default export is available at '@mui/utils/chainPropTypes'
try {
  const m = require('./chainPropTypes');
  module.exports = (m && m.default) ? m.default : m;
} catch (e) {
  // if the inner path resolves differently, try the esm path
  try {
    const m = require('./chainPropTypes/index.js');
    module.exports = (m && m.default) ? m.default : m;
  } catch (err) {
    // no-op: if we cannot patch, build may still fail and error will be visible
  }
}
`;
    fs.writeFileSync(target, content, { encoding: 'utf8' });
    console.log('Wrote shim to', target);
  } else {
    console.log('Shim already exists:', target);
  }
} catch (err) {
  console.error('Failed to write shim for @mui/utils/chainPropTypes:', err);
  process.exit(0); // don't fail install
}

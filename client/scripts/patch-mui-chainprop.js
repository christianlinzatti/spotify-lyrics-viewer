const fs = require('fs');
const path = require('path');

// List of @mui/utils modules to shim (create a small CJS wrapper that ensures a default export)
const modules = [
  'chainPropTypes',
  'integerPropType',
  'deprecatedPropType',
  'elementTypeAcceptingRef',
  'elementType',
  'exactProp',
  'isMuiElement',
  'unsupportedProp',
  'requirePropFactory',
    'refType'
  ];

modules.forEach((modName) => {
  const target = path.join(__dirname, '..', 'node_modules', '@mui', 'utils', `${modName}.js`);
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const content = `// Compatibility shim created by patch script for @mui/utils/${modName}
// Ensures a CommonJS default export is available when importing the module as a default export.
try {
  // Try to require the module as provided by the package (named exports or default)
  const m = require('./${modName}');
  module.exports = (m && m.default) ? m.default : m;
} catch (e) {
  try {
    // Fallback to requiring an index file if that's how the package is structured
    const m = require('./${modName}/index.js');
    module.exports = (m && m.default) ? m.default : m;
  } catch (err) {
    // No-op: if we cannot patch, the build will surface the error.
  }
}
`;
      fs.writeFileSync(target, content, { encoding: 'utf8' });
      console.log('Wrote shim to', target);
    } else {
      console.log('Shim already exists:', target);
    }
  } catch (err) {
    console.error('Failed to write shim for @mui/utils/' + modName + ':', err);
    // do not fail the install step
  }
});

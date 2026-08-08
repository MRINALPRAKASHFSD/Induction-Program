const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'routes', 'attendance.lazy.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Lucide imports
const lucideImportsToAdd = ['Navigation2', 'Check', 'ShieldAlert', 'Smartphone', 'Signal', 'Navigation', 'X'];
lucideImportsToAdd.forEach(imp => {
  if (!content.includes(imp + ',')) {
    content = content.replace('XCircle, AlertTriangle,', `XCircle, AlertTriangle, ${imp},`);
  }
});

// 2. Add GeofenceError import
if (!content.includes('GeofenceError')) {
  content = content.replace('type GeolocationResult } from "@/lib/geofence";', 'type GeolocationResult, GeofenceError } from "@/lib/geofence";');
}

// 3. Add errorObj state
if (!content.includes('const [errorObj, setErrorObj]')) {
  content = content.replace(
    'const [errorMsg, setErrorMsg] = useState("");',
    'const [errorMsg, setErrorMsg] = useState("");\n  const [errorObj, setErrorObj] = useState<Error | null>(null);'
  );
}

// 4. Update setErrorMsg blocks to also set errorObj
content = content.replace(
  /stopScanner\(\);\n\s*setErrorMsg\(e\.message \|\| "Failed to get your location"\);\n\s*setPhase\("error"\);/,
  `stopScanner();\n          setErrorObj(e as Error);\n          setErrorMsg(e.message || "Failed to get your location");\n          setPhase("error");`
);

content = content.replace(
  /setErrorMsg\(e\.message \|\| "Failed to verify campus location\."\);\n\s*setPhase\("error"\);/,
  `setErrorObj(e as Error);\n        setErrorMsg(e.message || "Failed to verify campus location.");\n        setPhase("error");`
);

// Reset errorObj on phase change to scanner/dashboard
content = content.replace(
  /setErrorMsg\(""\);\n\s*setResult\(null\);/g,
  `setErrorMsg("");\n    setErrorObj(null);\n    setResult(null);`
);

content = content.replace(
  /setErrorMsg\(""\);\n\s*setLocation\(null\);/g,
  `setErrorMsg("");\n    setErrorObj(null);\n    setLocation(null);`
);

// Add default fallbacks for other errors
content = content.replace(
  /setErrorMsg\(errMsg\);\n\s*setPhase\("error"\);/,
  `setErrorObj(new Error(errMsg));\n      setErrorMsg(errMsg);\n      setPhase("error");`
);

content = content.replace(
  /setErrorMsg\("Please register first to mark attendance\."\);\n\s*setPhase\("error"\);/,
  `setErrorObj(new Error("Please register first to mark attendance."));\n      setErrorMsg("Please register first to mark attendance.");\n      setPhase("error");`
);

content = content.replace(
  /setErrorMsg\(data\.error \|\| "Failed to mark attendance\."\);\n\s*setPhase\("error"\);/,
  `setErrorObj(new Error(data.error || "Failed to mark attendance."));\n        setErrorMsg(data.error || "Failed to mark attendance.");\n        setPhase("error");`
);

content = content.replace(
  /setErrorMsg\(\n\s*isOffline/g,
  `setErrorObj(new Error(isOffline ? 'Network unavailable. Please reconnect and scan again.' : 'Failed to reach server. Please check your connection.'));\n      setErrorMsg(\n        isOffline`
);

// 5. Replace ERROR PHASE block
const errorPhaseStart = '{phase === "error" && (';
const errorPhaseEnd = '{/* ══════════════════════════════════════════════════════════════════════════';

const startIdx = content.indexOf(errorPhaseStart);
if (startIdx !== -1) {
  const endIdx = content.indexOf('</>', startIdx);
  if (endIdx !== -1) {
    const blockToReplace = content.substring(startIdx, endIdx);
    const newBlock = `{phase === "error" && (
      <ErrorPhase 
        errorObj={errorObj} 
        errorMsg={errorMsg} 
        goBack={goBack} 
        retryOrResume={retryOrResume} 
      />
    )}\n    `;
    content = content.replace(blockToReplace, newBlock);
  }
}

// 6. Append ErrorPhase component
const errorPhaseComponent = fs.readFileSync(path.join(__dirname, 'error-phase.tsx'), 'utf8');
if (!content.includes('function ErrorPhase')) {
  const componentCode = errorPhaseComponent.replace('import { GeofenceError } from "@/lib/geofence";\n', '');
  content += '\n' + componentCode;
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated attendance.lazy.tsx');

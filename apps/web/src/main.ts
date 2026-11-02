import './css/app.css';
import './legacy/app.js';
import './css/table-live.css';
import './css/ui.css';
import './css/devices.css';
// for the layout checks (e2e/tests/table-layout.spec.ts): draw any table without a game running
import { renderTable, sprite } from './table/render';
import { loadDesignCss, setTheme } from './table/screen';
// for the motion checks (e2e/tests/motion.spec.ts): a table played by a local engine, and the settings
import { labTable } from './table/lab';
import { settings } from './legacy/fx.js';
// ... and play any win scene over it (e2e/tests/tiers.spec.ts)
import { playTier, winValues, bustValues, sampleValues, loadTiers, peakOf } from './table/tiers';
(window as unknown as { __tpLab: unknown }).__tpLab = { renderTable, sprite, loadDesignCss, setTheme, labTable, settings, playTier, winValues, bustValues, sampleValues, loadTiers, peakOf };

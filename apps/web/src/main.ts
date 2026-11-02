import './css/app.css';
import './legacy/app.js';
import './css/table-live.css';
// for the layout checks (e2e/tests/table-layout.spec.ts): draw any table without a game running
import { renderTable, sprite } from './table/render';
import { loadDesignCss, setTheme } from './table/screen';
// ... and play any win scene over it (e2e/tests/tiers.spec.ts)
import { playTier, winValues, bustValues, sampleValues, loadTiers, peakOf } from './table/tiers';
(window as unknown as { __tpLab: unknown }).__tpLab = { renderTable, sprite, loadDesignCss, setTheme, playTier, winValues, bustValues, sampleValues, loadTiers, peakOf };

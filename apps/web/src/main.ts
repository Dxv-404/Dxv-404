import './css/app.css';
import './legacy/app.js';
import './css/table-live.css';
import './css/ui.css';
// for the layout checks (e2e/tests/table-layout.spec.ts): draw any table without a game running
import { renderTable, sprite } from './table/render';
import { loadDesignCss, setTheme } from './table/screen';
(window as unknown as { __tpLab: unknown }).__tpLab = { renderTable, sprite, loadDesignCss, setTheme };

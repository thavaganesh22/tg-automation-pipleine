'use strict';
/**
 * scripts/setup-kibana.js
 *
 * Creates data views, Lens visualizations, and a QA Pipeline dashboard in Kibana.
 * Safe to re-run — all objects use stable IDs and are created with overwrite=true.
 *
 * Usage:
 *   # Local (no auth, security disabled):
 *   node scripts/setup-kibana.js
 *
 *   # Azure VM (basic auth):
 *   KIBANA_URL=http://cbts-elastic-vm.eastus.cloudapp.azure.com:5601 \
 *   KIBANA_PASS=cbtsreport2$ \
 *   node scripts/setup-kibana.js
 *
 * Environment variables:
 *   KIBANA_URL    Kibana base URL       (default: http://localhost:5601)
 *   KIBANA_USER   Basic-auth username   (default: elastic)
 *   KIBANA_PASS   Basic-auth password   (default: '' = no auth)
 */

const http  = require('http');
const https = require('https');
const { URL } = require('url');

// ── Config ────────────────────────────────────────────────────────────────────

const KIBANA_URL  = (process.env.KIBANA_URL  || 'http://localhost:5601').replace(/\/$/, '');
const KIBANA_USER = process.env.KIBANA_USER  || 'elastic';
const KIBANA_PASS = process.env.KIBANA_PASS  || '';

// Stable IDs — re-running overwrites existing objects.
const ID = {
  dvRuns:    'dv-qa-test-runs-0001',
  dvFailed:  'dv-qa-failed-tests-001',
  vPassRate: 'vis-pass-rate-0001',
  vCovOver:  'vis-cov-overall-001',
  vCovP0:    'vis-cov-p0-00001',
  vCovUI:    'vis-cov-ui-00001',
  vCovAPI:   'vis-cov-api-0001',
  vTests:    'vis-tests-run-001',
  vType:     'vis-test-type-001',
  vDuration: 'vis-duration-0001',
  vFailFile: 'vis-fail-file-001',
  vFlaky:    'vis-flaky-tests-001',
  vSLA:      'vis-sla-history-001',
  dash:      'dash-qa-pipeline-001',
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function authHeaders() {
  if (!KIBANA_PASS) return {};
  const b64 = Buffer.from(`${KIBANA_USER}:${KIBANA_PASS}`).toString('base64');
  return { Authorization: `Basic ${b64}` };
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(KIBANA_URL + path);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
        'kbn-xsrf':     'true',
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${json.message || data}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForKibana(maxAttempts = 30) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const status = await request('GET', '/api/status');
      if (status.status && status.status.overall.level !== 'critical') {
        console.log(`  Kibana is ready (${status.status.overall.level})`);
        return;
      }
    } catch { /* not yet */ }
    console.log(`  Waiting for Kibana... (attempt ${i}/${maxAttempts})`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Kibana did not become ready within the timeout.');
}

// ── Data views ────────────────────────────────────────────────────────────────

async function createDataView(id, title, name, timeField) {
  try {
    await request('POST', '/api/data_views/data_view', {
      override: true,
      data_view: { id, title, name, timeFieldName: timeField },
    });
    console.log(`  ✓ Data view: ${name}`);
  } catch (err) {
    // Already exists — try overwrite via PUT
    try {
      await request('POST', `/api/data_views/data_view/${id}`, {
        data_view: { title, name, timeFieldName: timeField },
      });
      console.log(`  ✓ Data view (updated): ${name}`);
    } catch (err2) {
      console.warn(`  ! Data view ${name}: ${err2.message}`);
    }
  }
}

// ── Saved object helper ───────────────────────────────────────────────────────

async function upsertObject(type, id, attributes, references = []) {
  try {
    await request('POST', `/api/saved_objects/${type}/${id}?overwrite=true`, {
      attributes,
      references,
    });
    console.log(`  ✓ ${type}: ${attributes.title}`);
  } catch (err) {
    console.warn(`  ! ${type} "${attributes.title}": ${err.message}`);
  }
}

// ── Lens visualization builders ───────────────────────────────────────────────

/** Build a Lens state object for formBased layers. */
function lensState(visualizationType, visualization, layers, dvId, queryStr = '', filters = []) {
  const datasourceLayers = {};
  const references = [];

  for (const [layerId, columns] of Object.entries(layers)) {
    datasourceLayers[layerId] = {
      columnOrder: Object.keys(columns),
      columns,
      indexPatternId: dvId,
      incompleteColumns: {},
    };
    references.push({
      type: 'index-pattern',
      id:   dvId,
      name: `indexpattern-datasource-layer-${layerId}`,
    });
  }

  return {
    attributes: {
      title: visualization._title,
      description: '',
      visualizationType,
      state: {
        visualization,
        datasourceStates: {
          formBased: { layers: datasourceLayers },
          textBased: { layers: {} },
        },
        query:              { query: queryStr, language: 'kuery' },
        filters,
        internalReferences: [],
        adHocDataViews:     {},
      },
    },
    references,
  };
}

/** Date histogram column. */
function colDate(label, field = '@timestamp') {
  return {
    label,
    dataType: 'date',
    operationType: 'date_histogram',
    sourceField: field,
    isBucketed: true,
    scale: 'interval',
    params: { interval: 'auto', includeEmptyRows: true, dropPartials: false },
  };
}

/** Numeric metric column (average). */
function colAvg(label, field, format) {
  return {
    label,
    dataType: 'number',
    operationType: 'average',
    sourceField: field,
    isBucketed: false,
    scale: 'ratio',
    params: { format: format || { id: 'number', params: { decimals: 1 } }, emptyAsNull: false },
  };
}

/** Count column. */
function colCount(label = 'Count') {
  return {
    label,
    dataType: 'number',
    operationType: 'count',
    sourceField: '___records___',
    isBucketed: false,
    scale: 'ratio',
    params: {},
  };
}

/** Terms bucket column. */
function colTerms(label, field, metricColId, size = 20) {
  return {
    label,
    dataType: 'string',
    operationType: 'terms',
    sourceField: field,
    isBucketed: true,
    scale: 'ordinal',
    params: {
      size,
      orderBy:         { type: 'column', columnId: metricColId },
      orderDirection:  'desc',
      missingBucket:   false,
      otherBucket:     false,
    },
  };
}

// passRate is stored as a decimal (0–1) → percent format multiplies by 100. Correct.
const PCT    = { id: 'percent', params: { decimals: 1 } };
// Coverage fields are stored as 0–100 already → plain number format. Never use PCT here.
const NUMFMT = { id: 'number',  params: { decimals: 1 } };

/** Range filter: only include docs where field > 0.
 *  Used on coverage tiles so local npm-test runs (which index 0) don't skew the average. */
function gtZeroFilter(field) {
  return [{ meta: { disabled: false, negate: false, alias: null }, query: { range: { [field]: { gt: 0 } } } }];
}

// ── Visualization definitions ─────────────────────────────────────────────────

function vizPassRateTrend(dvId) {
  const viz = {
    _title: 'Pass Rate — Trend over Time',
    legend:      { isVisible: true, position: 'bottom' },
    valueLabels: 'hide',
    layers: [{
      layerId: 'l1', xAccessor: 'x1', accessors: ['y1'],
      layerType: 'data', seriesType: 'line',
    }],
  };
  return lensState('lnsXY', viz, {
    l1: { x1: colDate('Date'), y1: colAvg('Pass Rate', 'passRate', PCT) },
  }, dvId);
}

function vizMetric(title, dvId, field, label, format, filters = []) {
  const viz = { _title: title, layerId: 'l1', layerType: 'data', metricAccessor: 'col1' };
  return lensState('lnsMetric', viz, {
    l1: { col1: colAvg(label, field, format || NUMFMT) },
  }, dvId, '', filters);
}

function vizTestsPerRun(dvId) {
  const viz = {
    _title: 'Passed vs Failed — per Run',
    legend:      { isVisible: true, position: 'bottom' },
    valueLabels: 'hide',
    layers: [{
      layerId: 'l1', xAccessor: 'x1', accessors: ['y1', 'y2'],
      layerType: 'data', seriesType: 'bar_stacked',
    }],
  };
  return lensState('lnsXY', viz, {
    l1: {
      x1: colDate('Date'),
      y1: { ...colAvg('Passed', 'passed', { id: 'number', params: { decimals: 0 } }), operationType: 'sum' },
      y2: { ...colAvg('Failed', 'failed', { id: 'number', params: { decimals: 0 } }), operationType: 'sum' },
    },
  }, dvId);
}

function vizTestTypeDistribution(dvId) {
  const viz = {
    _title: 'Test Type Distribution',
    shape:  'pie',
    layers: [{ layerId: 'l1', primaryGroups: ['g1'], metrics: ['m1'], layerType: 'data' }],
  };
  return lensState('lnsPie', viz, {
    l1: { g1: colTerms('Test Type', 'testType.keyword', 'm1', 5), m1: colCount('Runs') },
  }, dvId);
}

function vizDurationTrend(dvId) {
  const viz = {
    _title: 'Run Duration — Trend over Time',
    legend:      { isVisible: true, position: 'bottom' },
    valueLabels: 'hide',
    layers: [{
      layerId: 'l1', xAccessor: 'x1', accessors: ['y1'],
      layerType: 'data', seriesType: 'line',
    }],
  };
  return lensState('lnsXY', viz, {
    l1: {
      x1: colDate('Date'),
      y1: colAvg('Duration (s)', 'durationMs', { id: 'number', params: { decimals: 0 } }),
    },
  }, dvId);
}

function vizFailuresByFile(dvId) {
  const viz = {
    _title: 'Failures — by Spec File',
    legend:      { isVisible: false, position: 'right' },
    valueLabels: 'inside',
    layers: [{
      layerId: 'l1', xAccessor: 'g1', accessors: ['m1'],
      layerType: 'data', seriesType: 'bar_horizontal',
    }],
  };
  return lensState('lnsXY', viz, {
    l1: { g1: colTerms('Spec File', 'file.keyword', 'm1', 20), m1: colCount('Failures') },
  }, dvId);
}

function vizFlakyLeaderboard(dvId) {
  const viz = {
    _title: 'Flaky Tests — Leaderboard',
    layerId:    'l1',
    layerType:  'data',
    columns:    [{ columnId: 'g1' }, { columnId: 'm1' }],
    sorting:    { columnId: 'm1', direction: 'desc' },
  };
  return lensState('lnsDatatable', viz, {
    l1: { g1: colTerms('Test Name', 'testName.keyword', 'm1', 30), m1: colCount('Retried Runs') },
  }, dvId, 'retried: true');
}

function vizSLAHistory(dvId) {
  const viz = {
    _title: 'SLA Breach History',
    layerId:   'l1',
    layerType: 'data',
    columns:   [{ columnId: 'g1' }, { columnId: 'm1' }, { columnId: 'm2' }],
    sorting:   { columnId: 'g1', direction: 'desc' },
  };
  return lensState('lnsDatatable', viz, {
    l1: {
      g1: colTerms('Run ID', 'runId.keyword', 'm1', 50),
      m1: colAvg('Pass Rate', 'passRate', PCT),
      m2: colAvg('Coverage %', 'coveragePercent', NUMFMT),
    },
  }, dvId, 'slaBreached: true');
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function buildDashboard() {
  // Grid: 48 units wide.  y positions are cumulative.
  const panels = [
    // Row 1 — metric tiles (y=0, h=8)
    { id: ID.vCovOver,  i: 'p01', x: 0,  y: 0,  w: 12, h: 8, title: 'Overall Coverage' },
    { id: ID.vCovP0,    i: 'p02', x: 12, y: 0,  w: 12, h: 8, title: 'P0 Coverage' },
    { id: ID.vCovUI,    i: 'p03', x: 24, y: 0,  w: 12, h: 8, title: 'UI Coverage' },
    { id: ID.vCovAPI,   i: 'p04', x: 36, y: 0,  w: 12, h: 8, title: 'API Coverage' },
    // Row 2 — pass rate + type breakdown (y=8, h=15)
    { id: ID.vPassRate, i: 'p05', x: 0,  y: 8,  w: 32, h: 15, title: 'Pass Rate Trend' },
    { id: ID.vType,     i: 'p06', x: 32, y: 8,  w: 16, h: 15, title: 'Test Type Distribution' },
    // Row 3 — tests per run + duration (y=23, h=15)
    { id: ID.vTests,    i: 'p07', x: 0,  y: 23, w: 24, h: 15, title: 'Passed vs Failed' },
    { id: ID.vDuration, i: 'p08', x: 24, y: 23, w: 24, h: 15, title: 'Run Duration' },
    // Row 4 — failure analysis (y=38, h=15)
    { id: ID.vFailFile, i: 'p09', x: 0,  y: 38, w: 24, h: 15, title: 'Failures by Spec File' },
    { id: ID.vFlaky,    i: 'p10', x: 24, y: 38, w: 24, h: 15, title: 'Flaky Tests' },
    // Row 5 — SLA history full-width (y=53, h=12)
    { id: ID.vSLA,      i: 'p11', x: 0,  y: 53, w: 48, h: 12, title: 'SLA Breach History' },
  ];

  const panelsJson = panels.map((p) => ({
    type:         'lens',
    panelIndex:   p.i,
    panelRefName: `panel_${p.i}`,
    gridData:     { x: p.x, y: p.y, w: p.w, h: p.h, i: p.i },
    embeddableConfig: { enhancements: {} },
    title:        p.title,
  }));

  const references = panels.map((p) => ({
    name: `panel_${p.i}`,
    type: 'lens',
    id:   p.id,
  }));

  const attributes = {
    title:           'QA Pipeline — Test Results',
    description:     'Pass rate, coverage, failures, and flakiness across all pipeline runs.',
    hits:            0,
    kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }) },
    optionsJSON:     JSON.stringify({ useMargins: true, syncColors: false, hidePanelTitles: false }),
    panelsJSON:      JSON.stringify(panelsJson),
    timeFrom:        'now-30d',
    timeTo:          'now',
    timeRestore:     true,
    refreshInterval: { pause: true, value: 0 },
    version:         1,
  };

  return { attributes, references };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nKibana URL : ${KIBANA_URL}`);
  console.log(`Auth       : ${KIBANA_PASS ? `Basic (user: ${KIBANA_USER})` : 'none'}\n`);

  // 1. Wait for Kibana
  console.log('Waiting for Kibana to be ready...');
  await waitForKibana();

  // 2. Data views
  console.log('\nCreating data views...');
  await createDataView(ID.dvRuns,   'qa-test-runs',   'QA Test Runs',   '@timestamp');
  await createDataView(ID.dvFailed, 'qa-failed-tests', 'QA Failed Tests', '@timestamp');

  // 3. Visualizations
  console.log('\nCreating visualizations...');
  const vizDefs = [
    [ID.vPassRate, vizPassRateTrend(ID.dvRuns)],
    [ID.vCovOver,  vizMetric('Overall Coverage %',  ID.dvRuns, 'coveragePercent',    'Overall Coverage',  NUMFMT, gtZeroFilter('coveragePercent'))],
    [ID.vCovP0,    vizMetric('P0 Coverage %',        ID.dvRuns, 'p0CoveragePercent',  'P0 Coverage',       NUMFMT, gtZeroFilter('p0CoveragePercent'))],
    [ID.vCovUI,    vizMetric('UI Coverage %',         ID.dvRuns, 'uiCoveragePercent',  'UI Coverage',       NUMFMT, gtZeroFilter('uiCoveragePercent'))],
    [ID.vCovAPI,   vizMetric('API Coverage %',        ID.dvRuns, 'apiCoveragePercent', 'API Coverage',      NUMFMT, gtZeroFilter('apiCoveragePercent'))],
    [ID.vTests,    vizTestsPerRun(ID.dvRuns)],
    [ID.vType,     vizTestTypeDistribution(ID.dvRuns)],
    [ID.vDuration, vizDurationTrend(ID.dvRuns)],
    [ID.vFailFile, vizFailuresByFile(ID.dvFailed)],
    [ID.vFlaky,    vizFlakyLeaderboard(ID.dvFailed)],
    [ID.vSLA,      vizSLAHistory(ID.dvRuns)],
  ];

  for (const [id, { attributes, references }] of vizDefs) {
    await upsertObject('lens', id, attributes, references);
  }

  // 4. Dashboard
  console.log('\nCreating dashboard...');
  const { attributes: dashAttrs, references: dashRefs } = buildDashboard();
  await upsertObject('dashboard', ID.dash, dashAttrs, dashRefs);

  // 5. Summary
  const dashUrl = `${KIBANA_URL}/app/dashboards#/view/${ID.dash}`;
  console.log(`\n✓ Setup complete.\n`);
  console.log(`  Dashboard : ${dashUrl}`);
  console.log(`  Time range: last 30 days (adjustable in Kibana)\n`);
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});

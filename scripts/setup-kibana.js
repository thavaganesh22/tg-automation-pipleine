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
// Derive ES URL from Kibana URL (5601 → 9200) or use explicit override
const ES_URL = (process.env.ELASTICSEARCH_URL || KIBANA_URL.replace(':5601', ':9200')).replace(/\/$/, '');

// Stable IDs — re-running overwrites existing objects.
const ID = {
  // Data views
  dvRuns:    'dv-qa-test-runs-0001',
  dvFailed:  'dv-qa-failed-tests-001',
  dvResults: 'dv-qa-test-results-001',
  // qa-test-runs visualizations
  vPassRate: 'vis-pass-rate-0001',
  vCovOver:  'vis-cov-overall-001',
  vCovP0:    'vis-cov-p0-00001',
  vCovUI:    'vis-cov-ui-00001',
  vCovAPI:   'vis-cov-api-0001',
  vTests:    'vis-tests-run-001',
  vDuration: 'vis-duration-0001',
  vSLA:      'vis-sla-history-001',
  // qa-failed-tests visualizations
  vFailFile: 'vis-fail-file-001',
  vFlaky:    'vis-flaky-tests-001',
  // qa-test-results visualizations (per-test breakdown)
  vTypePie:     'vis-test-type-pie-001',
  vStatusPie:   'vis-status-pie-0001',
  vStatusTrend: 'vis-status-trend-001',
  vTopSlow:     'vis-top-slow-001',
  // Dashboard
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

// ── Elasticsearch helpers ─────────────────────────────────────────────────────

function esRequest(method, esPath, body) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(ES_URL + esPath);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
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
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureEsIndex(indexName, mappings) {
  const check = await esRequest('HEAD', `/${indexName}`);
  if (check.status === 200) {
    console.log(`  ✓ ES index already exists: ${indexName}`);
    return;
  }
  const res = await esRequest('PUT', `/${indexName}`, { mappings });
  if (res.status >= 200 && res.status < 300) {
    console.log(`  ✓ ES index created: ${indexName}`);
  } else {
    console.warn(`  ! ES index ${indexName}: ${JSON.stringify(res.body).slice(0, 200)}`);
  }
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
 *  Kibana requires $state, meta.key, meta.type, and meta.index for filters to be applied correctly.
 *  @param {string} field - the field name to filter on
 *  @param {string} dvId  - the data view ID to bind the filter to
 */
function gtZeroFilter(field, dvId) {
  return [{
    $state: { store: 'appState' },
    meta: {
      alias: null,
      disabled: false,
      negate: false,
      key: field,
      params: { gt: 0 },
      type: 'range',
      index: dvId,
    },
    query: { range: { [field]: { gt: 0 } } },
  }];
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

// ── qa-test-results visualizations (per-test breakdown) ───────────────────────

/** Pie: UI tests vs API tests (count of individual test documents). */
function vizTestTypePie(dvId) {
  const viz = {
    _title: 'Test Type Split — UI vs API',
    shape:  'donut',
    layers: [{ layerId: 'l1', primaryGroups: ['g1'], metrics: ['m1'], layerType: 'data' }],
  };
  return lensState('lnsPie', viz, {
    l1: { g1: colTerms('Test Type', 'testType.keyword', 'm1', 5), m1: colCount('Tests') },
  }, dvId);
}

/** Pie: passed / failed / flaky / skipped breakdown across all tests. */
function vizStatusPie(dvId) {
  const viz = {
    _title: 'Test Status Distribution',
    shape:  'donut',
    layers: [{ layerId: 'l1', primaryGroups: ['g1'], metrics: ['m1'], layerType: 'data' }],
  };
  return lensState('lnsPie', viz, {
    l1: { g1: colTerms('Status', 'status.keyword', 'm1', 10), m1: colCount('Tests') },
  }, dvId);
}

/** Stacked bar: pass / fail / flaky count per run over time. */
function vizStatusOverTime(dvId) {
  const viz = {
    _title: 'Pass / Fail / Flaky — per Run over Time',
    legend:      { isVisible: true, position: 'bottom' },
    valueLabels: 'hide',
    layers: [{
      layerId:    'l1',
      xAccessor:  'x1',
      accessors:  ['y1'],
      splitAccessor: 'split1',
      layerType:  'data',
      seriesType: 'bar_stacked',
    }],
  };
  return lensState('lnsXY', viz, {
    l1: {
      x1:     colDate('Date'),
      split1: colTerms('Status', 'status.keyword', 'y1', 5),
      y1:     colCount('Tests'),
    },
  }, dvId);
}

/** Data table: top 20 slowest tests by average duration. */
function vizTopSlowTests(dvId) {
  const viz = {
    _title: 'Slowest Tests — Avg Duration',
    layerId:   'l1',
    layerType: 'data',
    columns:   [{ columnId: 'g1' }, { columnId: 'g2' }, { columnId: 'm1' }],
    sorting:   { columnId: 'm1', direction: 'desc' },
  };
  return lensState('lnsDatatable', viz, {
    l1: {
      g1: colTerms('Test Name', 'testName.keyword', 'm1', 20),
      g2: colTerms('Suite',     'suite.keyword',    'm1', 20),
      m1: colAvg('Avg Duration (ms)', 'durationMs', { id: 'number', params: { decimals: 0 } }),
    },
  }, dvId);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function buildDashboard() {
  // Grid: 48 units wide.  y positions are cumulative.
  const panels = [
    // Row 1 — coverage metric tiles (y=0, h=8)
    { id: ID.vCovOver,  i: 'p01', x: 0,  y: 0,  w: 12, h: 8, title: 'Overall Coverage' },
    { id: ID.vCovP0,    i: 'p02', x: 12, y: 0,  w: 12, h: 8, title: 'P0 Coverage' },
    { id: ID.vCovUI,    i: 'p03', x: 24, y: 0,  w: 12, h: 8, title: 'UI Coverage' },
    { id: ID.vCovAPI,   i: 'p04', x: 36, y: 0,  w: 12, h: 8, title: 'API Coverage' },
    // Row 2 — pass rate trend + per-test type/status pies (y=8, h=15)
    { id: ID.vPassRate,  i: 'p05', x: 0,  y: 8,  w: 24, h: 15, title: 'Pass Rate Trend' },
    { id: ID.vTypePie,   i: 'p06', x: 24, y: 8,  w: 12, h: 15, title: 'UI vs API Tests' },
    { id: ID.vStatusPie, i: 'p07', x: 36, y: 8,  w: 12, h: 15, title: 'Test Status Breakdown' },
    // Row 3 — pass/fail/flaky per run over time (y=23, h=15)
    { id: ID.vStatusTrend, i: 'p08', x: 0,  y: 23, w: 48, h: 15, title: 'Pass / Fail / Flaky per Run' },
    // Row 4 — tests per run (summary) + run duration (y=38, h=15)
    { id: ID.vTests,    i: 'p09', x: 0,  y: 38, w: 24, h: 15, title: 'Passed vs Failed (run summary)' },
    { id: ID.vDuration, i: 'p10', x: 24, y: 38, w: 24, h: 15, title: 'Run Duration' },
    // Row 5 — failure analysis + slowest tests (y=53, h=15)
    { id: ID.vFailFile, i: 'p11', x: 0,  y: 53, w: 24, h: 15, title: 'Failures by Spec File' },
    { id: ID.vTopSlow,  i: 'p12', x: 24, y: 53, w: 24, h: 15, title: 'Slowest Tests' },
    // Row 6 — flaky tests + SLA history (y=68)
    { id: ID.vFlaky,    i: 'p13', x: 0,  y: 68, w: 24, h: 15, title: 'Flaky Tests' },
    { id: ID.vSLA,      i: 'p14', x: 24, y: 68, w: 24, h: 12, title: 'SLA Breach History' },
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
  console.log(`ES URL     : ${ES_URL}`);
  console.log(`Auth       : ${KIBANA_PASS ? `Basic (user: ${KIBANA_USER})` : 'none'}\n`);

  // 1. Create Elasticsearch indices with explicit mappings
  console.log('Creating Elasticsearch indices...');
  await ensureEsIndex('qa-test-results', {
    properties: {
      '@timestamp': { type: 'date' },
      runId:        { type: 'keyword' },
      testName:     { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 512 } } },
      suite:        { type: 'keyword' },
      file:         { type: 'keyword' },
      testType:     { type: 'keyword' },
      status:       { type: 'keyword' },
      durationMs:   { type: 'long' },
      retried:      { type: 'boolean' },
    },
  });

  // 2. Wait for Kibana
  console.log('\nWaiting for Kibana to be ready...');
  await waitForKibana();

  // 3. Data views
  console.log('\nCreating data views...');
  await createDataView(ID.dvRuns,    'qa-test-runs',    'QA Test Runs',    '@timestamp');
  await createDataView(ID.dvFailed,  'qa-failed-tests', 'QA Failed Tests', '@timestamp');
  await createDataView(ID.dvResults, 'qa-test-results', 'QA Test Results', '@timestamp');

  // 4. Visualizations
  console.log('\nCreating visualizations...');
  const vizDefs = [
    // qa-test-runs (run-level aggregates)
    [ID.vPassRate, vizPassRateTrend(ID.dvRuns)],
    [ID.vCovOver,  vizMetric('Overall Coverage %',  ID.dvRuns, 'coveragePercent',    'Overall Coverage',  NUMFMT, gtZeroFilter('coveragePercent',    ID.dvRuns))],
    [ID.vCovP0,    vizMetric('P0 Coverage %',        ID.dvRuns, 'p0CoveragePercent',  'P0 Coverage',       NUMFMT, gtZeroFilter('p0CoveragePercent',  ID.dvRuns))],
    [ID.vCovUI,    vizMetric('UI Coverage %',         ID.dvRuns, 'uiCoveragePercent',  'UI Coverage',       NUMFMT, gtZeroFilter('uiCoveragePercent',  ID.dvRuns))],
    [ID.vCovAPI,   vizMetric('API Coverage %',        ID.dvRuns, 'apiCoveragePercent', 'API Coverage',      NUMFMT, gtZeroFilter('apiCoveragePercent', ID.dvRuns))],
    [ID.vTests,    vizTestsPerRun(ID.dvRuns)],
    [ID.vDuration, vizDurationTrend(ID.dvRuns)],
    [ID.vSLA,      vizSLAHistory(ID.dvRuns)],
    // qa-failed-tests (failure drill-down)
    [ID.vFailFile, vizFailuresByFile(ID.dvFailed)],
    [ID.vFlaky,    vizFlakyLeaderboard(ID.dvFailed)],
    // qa-test-results (per-test breakdowns — the new ones)
    [ID.vTypePie,     vizTestTypePie(ID.dvResults)],
    [ID.vStatusPie,   vizStatusPie(ID.dvResults)],
    [ID.vStatusTrend, vizStatusOverTime(ID.dvResults)],
    [ID.vTopSlow,     vizTopSlowTests(ID.dvResults)],
  ];

  for (const [id, { attributes, references }] of vizDefs) {
    await upsertObject('lens', id, attributes, references);
  }

  // 5. Dashboard
  console.log('\nCreating dashboard...');
  const { attributes: dashAttrs, references: dashRefs } = buildDashboard();
  await upsertObject('dashboard', ID.dash, dashAttrs, dashRefs);

  // 6. Summary
  const dashUrl = `${KIBANA_URL}/app/dashboards#/view/${ID.dash}`;
  console.log(`\n✓ Setup complete.\n`);
  console.log(`  Dashboard  : ${dashUrl}`);
  console.log(`  Time range : last 30 days (adjustable in Kibana)`);
  console.log(`  Re-run     : npm run kibana:setup (safe — all objects use stable IDs)\n`);
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});

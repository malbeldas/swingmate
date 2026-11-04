// Admin panel, "Metrics": the pilot funnel week by week (observability.md §3, #29). Counts only:
// no names, emails or messages ever reach this view (BR-ANL-002).
import { getClient } from '../db.js';
import { el } from '../ui/dom.js';
import { METRIC_TEXTS, METRICS, metricsRows } from '../../core/analytics.js';

const WEEKS = 8;

// rerender(focusSelector) redraws the page; the metrics keep their rows between views.
export function createMetrics(rerender) {
  const s = { rows: null, error: '', loading: false };

  async function load() {
    s.loading = true;
    s.error = '';
    rerender();
    const db = await getClient();
    const { data, error } = await db.rpc('admin_metrics_weekly', { p_weeks: WEEKS });
    s.loading = false;
    if (error) s.error = METRIC_TEXTS.loadFailed;
    else s.rows = metricsRows(data ?? []);
    rerender('#metrics-title');
  }

  function table() {
    // A metric per row and a week per column, newest first; the table scrolls inside its card on
    // a phone instead of the page.
    return el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-labelledby': 'metrics-title' },
      el('table', { class: 'metrics-table', id: 'metrics-table' },
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Metric')),
          s.rows.map((r) => el('th', { scope: 'col' }, r.label.replace('Week of ', ''))))),
        el('tbody', {}, METRICS.map(([key, label]) => el('tr', { 'data-metric': key },
          el('th', { scope: 'row' }, label),
          s.rows.map((r) => el('td', {}, r.cells.find((c) => c.key === key).value)))))));
  }

  function view() {
    return el('section', { class: 'card stack', id: 'metrics', 'aria-labelledby': 'metrics-title' },
      el('div', { class: 'stack-tight' },
        el('h1', { id: 'metrics-title', tabindex: '-1' }, METRIC_TEXTS.title),
        el('p', { class: 'small text-2' }, METRIC_TEXTS.intro)),
      s.error && el('div', { class: 'stack-tight' },
        el('p', { class: 'form-error', role: 'alert' }, s.error),
        el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: load }, 'Try again')),
      !s.error && (s.loading || !s.rows) && el('p', { class: 'muted' }, 'Loading metrics…'),
      !s.error && !s.loading && s.rows && table(),
      el('p', { class: 'small text-2' }, METRIC_TEXTS.targets));
  }

  return { load, view };
}

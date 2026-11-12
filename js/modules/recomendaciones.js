/* Modulo de recomendaciones financieras: generacion, evaluacion y detalle */

(function (root) {
  'use strict';

  root.FinApp = root.FinApp || {};

  var Fmt = (typeof window !== 'undefined' ? window.FinFormatters : null) || root.FinFormatters;
  var Rules = (typeof window !== 'undefined' ? window.FinRecommendations : null) || root.FinRecommendations;

  // Caso de uso: Obtener recomendaciones (se recalculan con cada cambio de datos)
  function obtenerRecomendaciones(data, monthKey) {
    data = data || (root.FinApp.state ? root.FinApp.state.data : {});
    monthKey = monthKey || (root.FinApp.state ? root.FinApp.state.selectedMonth : Fmt.getCurrentMonthKey());
    if (Rules && typeof Rules.evaluateRecommendations === 'function') {
      return Rules.evaluateRecommendations(data, monthKey);
    }
    return [];
  }

  // Etiqueta y colores según el tipo de recomendación
  function tagInfo(rec) {
    if (rec.kind === 'logro') return { label: 'Logro', bg: 'var(--color-income-light)', color: 'var(--color-income)' };
    if (rec.kind === 'consejo') return { label: 'Consejo', bg: 'var(--color-brand-light)', color: 'var(--color-brand)' };
    if (rec.severity === 'high') return { label: 'Alerta urgente', bg: 'var(--color-expense-light)', color: 'var(--color-expense)' };
    return { label: 'Alerta', bg: 'var(--color-warning-light)', color: 'var(--color-warning)' };
  }

  // Caso de uso: Ver detalles de la recomendación
  function verDetallesRecomendacion(recId) {
    var derived = root.FinApp.getDerivedState();
    var recs = derived.recommendations || [];
    var rec = null;
    for (var i = 0; i < recs.length; i++) {
      if (recs[i].id === recId) {
        rec = recs[i];
        break;
      }
    }
    if (!rec) return null;

    var modalOverlay = document.getElementById('app-modal-overlay');
    var modalContent = document.getElementById('app-modal-content');
    if (!modalOverlay || !modalContent) return rec;

    var moduleNames = {
      transactions: 'Movimientos',
      budget: 'Presupuesto',
      goals: 'Metas de Ahorro',
      emergency_fund: 'Fondo de Emergencia',
      invest: 'Inversión',
      debts: 'Deudas y Obligaciones',
      indicators: 'Diagnóstico',
    };

    var modLabel = moduleNames[rec.relatedModule] || 'Ir al módulo';

    var html = '';
    html += '<div class="modal-card" style="max-width:540px;">';
    html += '  <div class="modal-header">';
    html += '    <div>';
    var tag = tagInfo(rec);
    html += '      <span class="category-tag" style="background:' + tag.bg + ';color:' + tag.color + ';margin-bottom:0.4rem;">' + tag.label + '</span>';
    html += '      <h2 class="modal-title">' + rec.situation + '</h2>';
    html += '    </div>';
    html += '    <button class="text-link" id="btn-close-modal">Cerrar</button>';
    html += '  </div>';

    html += '  <div style="margin-bottom:1.25rem;">';
    html += '    <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.25rem;">Causa y Datos Observados:</div>';
    html += '    <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);font-size:0.85rem;line-height:1.4;">' + rec.justification + '</div>';
    html += '  </div>';

    html += '  <div style="margin-bottom:1.25rem;">';
    html += '    <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.25rem;">Impacto en tus Finanzas:</div>';
    html += '    <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.5;">' + rec.explanation + '</p>';
    html += '  </div>';

    if (rec.concept) {
      html += '  <div style="margin-bottom:1.25rem;font-size:0.8rem;color:var(--text-secondary);">Concepto de educación financiera: <strong>' + rec.concept + '</strong></div>';
    }

    html += '  <div style="margin-bottom:1.5rem;padding:0.85rem;background:var(--color-brand-light);border:1px solid var(--color-brand-subtle);border-radius:var(--radius-sm);">';
    html += '    <div style="font-size:0.75rem;font-weight:700;color:var(--color-brand);text-transform:uppercase;margin-bottom:0.25rem;">Acción Sugerida:</div>';
    html += '    <p style="font-size:0.85rem;color:var(--text-primary);line-height:1.4;">' + rec.suggestedAction + '</p>';
    html += '  </div>';

    html += '  <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">';
    html += '    <button type="button" class="btn-secondary" id="btn-modal-cancel">Cerrar</button>';
    html += '    <button type="button" class="btn-primary" data-action="goto-module" data-module="' + rec.relatedModule + '">Gestionar en ' + modLabel + '</button>';
    html += '  </div>';
    html += '</div>';

    modalContent.innerHTML = html;
    modalOverlay.classList.add('open');

    var cancelBtn = document.getElementById('btn-modal-cancel');
    var closeBtn = document.getElementById('btn-close-modal');
    if (cancelBtn) cancelBtn.onclick = root.FinApp.closeModal;
    if (closeBtn) closeBtn.onclick = root.FinApp.closeModal;

    return rec;
  }

  // Render de Recomendaciones
  function renderRecommendations(derived) {
    var recs = derived.recommendations || [];
    var alerts = recs.filter(function (r) { return r.kind === 'alerta'; });
    var tips = recs.filter(function (r) { return r.kind === 'consejo'; });
    var wins = recs.filter(function (r) { return r.kind === 'logro'; });
    var html = '';

    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <h1 class="surface-title" style="font-size:1.25rem;">Recomendaciones</h1>';
    html += '  <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Se actualizan solas cada vez que registras un movimiento, una meta, una deuda o un aporte.</p>';
    html += '  <div style="display:flex;gap:1.5rem;margin-top:0.9rem;font-size:0.85rem;">';
    html += '    <span><strong style="color:var(--color-warning);">' + alerts.length + '</strong> ' + (alerts.length === 1 ? 'alerta' : 'alertas') + '</span>';
    html += '    <span><strong style="color:var(--color-brand);">' + tips.length + '</strong> ' + (tips.length === 1 ? 'consejo' : 'consejos') + '</span>';
    html += '    <span><strong style="color:var(--color-income);">' + wins.length + '</strong> ' + (wins.length === 1 ? 'logro' : 'logros') + '</span>';
    html += '  </div>';
    html += '</div>';

    if (recs.length === 0) {
      html += '<div class="surface-card" style="text-align:center;padding:3rem 1rem;color:var(--text-tertiary);">';
      html += '  <div style="font-size:1rem;color:var(--color-income);margin-bottom:0.5rem;font-weight:600;">Todo se encuentra en orden</div>';
      html += '  <div style="font-size:0.8rem;">No hay alertas para los datos de este mes. Sigue registrando tus movimientos.</div>';
      html += '</div>';
      return html;
    }

    function group(title, list) {
      if (!list.length) return '';
      var out = '<h2 style="font-size:0.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin:1.5rem 0 0.6rem;">' + title + '</h2>';
      out += '<div style="display:grid;gap:1rem;">';
      list.forEach(function (rec) {
        var tag = tagInfo(rec);
        out += '<div class="surface-card" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1.5rem;cursor:pointer;" data-action="open-rec-detail" data-id="' + rec.id + '">';
        out += '  <div style="flex:1;">';
        out += '    <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.4rem;">';
        out += '      <span class="category-tag" style="background:' + tag.bg + ';color:' + tag.color + ';">' + tag.label + '</span>';
        out += '      <h3 style="font-size:0.95rem;font-weight:700;">' + rec.situation + '</h3>';
        out += '    </div>';
        out += '    <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.4;margin-bottom:0.4rem;">' + rec.justification + '</p>';
        out += '    <div style="font-size:0.8rem;color:var(--text-tertiary);"><strong style="color:var(--text-secondary);">Qué hacer:</strong> ' + rec.suggestedAction + '</div>';
        out += '  </div>';
        out += '  <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end;white-space:nowrap;">';
        out += '    <button class="btn-secondary" style="font-size:0.75rem;padding:0.35rem 0.6rem;">Ver detalle</button>';
        out += '    <button class="text-link" data-action="goto-module" data-module="' + rec.relatedModule + '" style="font-size:0.75rem;">Ir al módulo</button>';
        out += '  </div>';
        out += '</div>';
      });
      return out + '</div>';
    }

    html += group('Requieren atención', alerts);
    html += group('Para mejorar', tips);
    html += group('Vas bien', wins);
    return html;
  }

  root.FinApp.recomendaciones = {
    obtenerRecomendaciones: obtenerRecomendaciones,
    verDetallesRecomendacion: verDetallesRecomendacion,
    renderRecommendations: renderRecommendations,
  };
})(typeof window !== 'undefined' ? window : this);

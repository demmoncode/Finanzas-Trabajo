/* Modulo de gestion financiera: ingresos, gastos, categorias, movimientos, balance y reportes */

(function (root) {
  'use strict';

  // Texto con singular o plural: "1 registro", "2 registros"
  function contarRegistros(n) {
    return n + (n === 1 ? ' registro' : ' registros');
  }

  root.FinApp = root.FinApp || {};

  var Fmt = (typeof window !== 'undefined' ? window.FinFormatters : null) || root.FinFormatters;
  var Cat = (typeof window !== 'undefined' ? window.FinCategories : null) || root.FinCategories;

  function triggerPersist() {
    if (root.FinApp && typeof root.FinApp.persistData === 'function') {
      root.FinApp.persistData();
    }
  }

  // Caso de uso: Gestionar ingresos
  function crearIngreso(data) {
    if (!root.FinApp.state || !root.FinApp.state.data) return null;
    var newTx = {
      id: Fmt.generateId('tx-inc'),
      type: 'income',
      amount: Number(data.amount) || 0,
      description: (data.description || 'Ingreso').trim(),
      categoryId: data.categoryId,
      date: data.date || Fmt.getCurrentDateISO(),
      notes: (data.notes || '').trim(),
      originalAmount: data.originalAmount !== undefined ? data.originalAmount : data.amount,
      originalCurrency: data.originalCurrency || 'COP',
    };
    root.FinApp.state.data.transactions.unshift(newTx);
    triggerPersist();
    return newTx;
  }

  function editarIngreso(id, data) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var txs = root.FinApp.state.data.transactions;
    for (var i = 0; i < txs.length; i++) {
      if (txs[i].id === id && txs[i].type === 'income') {
        txs[i].amount = Number(data.amount) || 0;
        txs[i].description = (data.description || txs[i].description).trim();
        txs[i].categoryId = data.categoryId || txs[i].categoryId;
        txs[i].date = data.date || txs[i].date;
        txs[i].notes = data.notes !== undefined ? data.notes.trim() : txs[i].notes;
        if (data.originalAmount !== undefined) txs[i].originalAmount = data.originalAmount;
        if (data.originalCurrency) txs[i].originalCurrency = data.originalCurrency;
        triggerPersist();
        return true;
      }
    }
    return false;
  }

  function eliminarIngreso(id) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var initialLen = root.FinApp.state.data.transactions.length;
    root.FinApp.state.data.transactions = root.FinApp.state.data.transactions.filter(function (t) {
      return !(t.id === id && t.type === 'income');
    });
    var changed = root.FinApp.state.data.transactions.length < initialLen;
    if (changed) triggerPersist();
    return changed;
  }

  // Caso de uso: Gestionar gastos
  function crearGasto(data) {
    if (!root.FinApp.state || !root.FinApp.state.data) return null;
    var newTx = {
      id: Fmt.generateId('tx-exp'),
      type: 'expense',
      amount: Number(data.amount) || 0,
      description: (data.description || 'Gasto').trim(),
      categoryId: data.categoryId,
      date: data.date || Fmt.getCurrentDateISO(),
      notes: (data.notes || '').trim(),
      originalAmount: data.originalAmount !== undefined ? data.originalAmount : data.amount,
      originalCurrency: data.originalCurrency || 'COP',
    };
    root.FinApp.state.data.transactions.unshift(newTx);
    triggerPersist();
    return newTx;
  }

  function editarGasto(id, data) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var txs = root.FinApp.state.data.transactions;
    for (var i = 0; i < txs.length; i++) {
      if (txs[i].id === id && txs[i].type === 'expense') {
        txs[i].amount = Number(data.amount) || 0;
        txs[i].description = (data.description || txs[i].description).trim();
        txs[i].categoryId = data.categoryId || txs[i].categoryId;
        txs[i].date = data.date || txs[i].date;
        txs[i].notes = data.notes !== undefined ? data.notes.trim() : txs[i].notes;
        if (data.originalAmount !== undefined) txs[i].originalAmount = data.originalAmount;
        if (data.originalCurrency) txs[i].originalCurrency = data.originalCurrency;
        triggerPersist();
        return true;
      }
    }
    return false;
  }

  function eliminarGasto(id) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var initialLen = root.FinApp.state.data.transactions.length;
    root.FinApp.state.data.transactions = root.FinApp.state.data.transactions.filter(function (t) {
      return !(t.id === id && t.type === 'expense');
    });
    var changed = root.FinApp.state.data.transactions.length < initialLen;
    if (changed) triggerPersist();
    return changed;
  }

  // Caso de uso: Gestionar categorías
  function esCategoriaPredeterminada(catId) {
    var defs = Cat ? Cat.DEFAULT_CATEGORIES : [];
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].id === catId) return true;
    }
    return false;
  }

  function contarMovimientosPorCategoria(catId) {
    if (!root.FinApp.state || !root.FinApp.state.data) return 0;
    var txs = root.FinApp.state.data.transactions || [];
    var count = 0;
    for (var i = 0; i < txs.length; i++) {
      if (txs[i].categoryId === catId) count++;
    }
    return count;
  }

  function crearCategoria(catData) {
    if (!root.FinApp.state || !root.FinApp.state.data) return null;
    var cats = root.FinApp.state.data.categories || [];
    var newCat = {
      id: Fmt.generateId('cat-custom'),
      name: (catData.name || 'Nueva categoría').trim(),
      type: catData.type === 'income' ? 'income' : 'expense',
      group: catData.group || (catData.type === 'income' ? 'income' : 'non_essential'),
      color: catData.color || '#3b82f6',
      isEssential: catData.isEssential === true,
      isCustom: true,
    };
    cats.push(newCat);
    root.FinApp.state.data.categories = cats;
    triggerPersist();
    return newCat;
  }

  function editarCategoria(catId, catData) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var cats = root.FinApp.state.data.categories || [];
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].id === catId) {
        cats[i].name = (catData.name || cats[i].name).trim();
        if (cats[i].isCustom) {
          if (catData.color) cats[i].color = catData.color;
          if (catData.group) cats[i].group = catData.group;
          if (catData.isEssential !== undefined) cats[i].isEssential = catData.isEssential;
        }
        triggerPersist();
        return true;
      }
    }
    return false;
  }

  function eliminarCategoria(catId, reassignToCatId) {
    if (!root.FinApp.state || !root.FinApp.state.data) return { success: false, message: 'Estado no disponible' };
    if (esCategoriaPredeterminada(catId)) {
      return { success: false, message: 'Las categorías predeterminadas del sistema no se pueden eliminar.' };
    }

    var moveCount = contarMovimientosPorCategoria(catId);
    if (moveCount > 0) {
      if (!reassignToCatId || reassignToCatId === catId) {
        return {
          success: false,
          needsReassign: true,
          count: moveCount,
          message: 'La categoría tiene ' + moveCount + ' movimientos asociados. Debes reasignarlos a otra categoría antes de eliminarla.'
        };
      }
      // Reasignar movimientos
      var txs = root.FinApp.state.data.transactions || [];
      for (var j = 0; j < txs.length; j++) {
        if (txs[j].categoryId === catId) {
          txs[j].categoryId = reassignToCatId;
        }
      }
    }

    root.FinApp.state.data.categories = root.FinApp.state.data.categories.filter(function (c) {
      return c.id !== catId;
    });

    triggerPersist();
    return { success: true, message: 'Categoría eliminada con éxito.' };
  }

  // Generador de Graficos SVG
  function createMoneyFlowChartSVG(monthsData) {
    if (!monthsData || monthsData.length === 0) {
      return '<div style="padding:2rem;text-align:center;color:var(--text-tertiary);font-size:0.85rem;">Sin registros históricos en el periodo.</div>';
    }

    var width = 500;
    var height = 180;
    var padding = { top: 20, right: 15, bottom: 35, left: 20 };
    var chartW = width - padding.left - padding.right;
    var chartH = height - padding.top - padding.bottom;

    var maxVal = 10000;
    monthsData.forEach(function (m) {
      if (m.income > maxVal) maxVal = m.income;
      if (m.expenses > maxVal) maxVal = m.expenses;
    });

    var groupWidth = chartW / monthsData.length;
    var barWidth = Math.max(8, Math.min(22, groupWidth * 0.32));
    var gap = 4;

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" class="svg-chart" style="width:100%;height:180px;display:block;">';

    svg += '<line x1="' + padding.left + '" y1="' + (height - padding.bottom) + '" x2="' + (width - padding.right) + '" y2="' + (height - padding.bottom) + '" stroke="var(--border-subtle)" stroke-width="1"/>';

    monthsData.forEach(function (m, idx) {
      var groupCenter = padding.left + (idx * groupWidth) + (groupWidth / 2);
      var incH = maxVal > 0 ? (m.income / maxVal) * chartH : 0;
      var expH = maxVal > 0 ? (m.expenses / maxVal) * chartH : 0;

      var xInc = groupCenter - barWidth - (gap / 2);
      var yInc = height - padding.bottom - incH;
      var xExp = groupCenter + (gap / 2);
      var yExp = height - padding.bottom - expH;

      svg += '<rect x="' + xInc + '" y="' + yInc + '" width="' + barWidth + '" height="' + Math.max(2, incH) + '" fill="var(--color-income)" rx="2" class="chart-bar">';
      svg += '<title>' + m.label + ' - Ingresos: ' + Fmt.formatCOP(m.income) + '</title>';
      svg += '</rect>';

      svg += '<rect x="' + xExp + '" y="' + yExp + '" width="' + barWidth + '" height="' + Math.max(2, expH) + '" fill="var(--color-expense)" rx="2" class="chart-bar">';
      svg += '<title>' + m.label + ' - Gastos: ' + Fmt.formatCOP(m.expenses) + '</title>';
      svg += '</rect>';

      svg += '<text x="' + groupCenter + '" y="' + (height - 12) + '" text-anchor="middle" font-size="10" fill="var(--text-tertiary)" font-family="var(--font-sans)">' + m.label + '</text>';
    });

    svg += '</svg>';
    return svg;
  }

  function createDonutChartSVG(categoryData, totalAmount) {
    if (!categoryData || categoryData.length === 0 || totalAmount <= 0) {
      return '<div style="display:flex;align-items:center;justify-content:center;height:140px;color:var(--text-tertiary);font-size:0.85rem;">Sin gastos en este mes.</div>';
    }

    var size = 140;
    var strokeWidth = 20;
    var radius = (size - strokeWidth) / 2;
    var circumference = 2 * Math.PI * radius;
    var accumulatedOffset = 0;

    var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="transform: rotate(-90deg);">';

    svg += '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + radius + '" fill="none" stroke="var(--bg-surface-secondary)" stroke-width="' + strokeWidth + '" />';

    categoryData.forEach(function (item) {
      var ratio = totalAmount > 0 ? (item.amount / totalAmount) : 0;
      var strokeDasharray = (ratio * circumference) + ' ' + circumference;
      var strokeDashoffset = -accumulatedOffset;

      svg += '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + radius + '" fill="none" stroke="' + item.color + '" stroke-width="' + strokeWidth + '" stroke-dasharray="' + strokeDasharray + '" stroke-dashoffset="' + strokeDashoffset + '" stroke-linecap="round">';
      svg += '<title>' + item.name + ': ' + Fmt.formatCOP(item.amount) + ' (' + (ratio * 100).toFixed(1) + '%)</title>';
      svg += '</circle>';

      accumulatedOffset += (ratio * circumference);
    });

    svg += '</svg>';
    return svg;
  }
  // Caso de uso: Visualizar balance
  function renderDashboard(derived) {
    var summary = derived.summary;
    var currentMonthTxs = derived.currentMonthTxs;
    var goals = root.FinApp.state.data.goals || [];
    var emergencyFund = root.FinApp.state.data.emergencyFund || { currentSaved: 0, targetMonthsCoverage: 3 };

    // Progreso del fondo
    var fundProgress = root.FinApp.planificacion
      ? root.FinApp.planificacion.consultarProgresoFondo(emergencyFund, summary.essentialExpenses)
      : { coverageMonthsActual: 0, targetMonths: 3, progressPercent: 0, currentSaved: emergencyFund.currentSaved, targetAmount: 0 };

    // Gastos por categoria para el grafico
    var expensesByCat = {};
    currentMonthTxs.forEach(function (tx) {
      if (tx.type === 'expense') {
        expensesByCat[tx.categoryId] = (expensesByCat[tx.categoryId] || 0) + Number(tx.amount);
      }
    });

    var catDonutData = Object.keys(expensesByCat).map(function (catId) {
      var cat = Cat.getCategoryById(root.FinApp.state.data.categories, catId);
      return {
        id: catId,
        name: cat ? cat.name : 'Otra',
        color: cat ? cat.color : '#94a3b8',
        amount: expensesByCat[catId],
      };
    }).sort(function (a, b) {
      return b.amount - a.amount;
    });

    var html = '';

    // 4 Tarjetas KPI superiores
    html += '<div class="card-grid-4">';

    // KPI 1: Ingresos Totales
    html += '  <div class="kpi-card">';
    html += '    <div class="kpi-header">';
    html += '      <span class="kpi-title">Ingresos del Mes</span>';
    html += '      <button class="text-link" data-goto="transactions">Ver</button>';
    html += '    </div>';
    html += '    <div class="kpi-value-row">';
    html += '      <span class="kpi-amount" style="color:var(--color-income);">' + Fmt.formatCOP(summary.totalIncome) + '</span>';
    html += '    </div>';
    html += '    <div class="kpi-trend-context">' + contarRegistros(currentMonthTxs.filter(function (t) { return t.type === 'income'; }).length) + '</div>';
    html += '  </div>';

    // KPI 2: Gastos Totales
    html += '  <div class="kpi-card">';
    html += '    <div class="kpi-header">';
    html += '      <span class="kpi-title">Gastos del Mes</span>';
    html += '      <button class="text-link" data-goto="transactions">Ver</button>';
    html += '    </div>';
    html += '    <div class="kpi-value-row">';
    html += '      <span class="kpi-amount" style="color:var(--color-expense);">' + Fmt.formatCOP(summary.totalExpenses) + '</span>';
    html += '    </div>';
    html += '    <div class="kpi-trend-context">' + contarRegistros(currentMonthTxs.filter(function (t) { return t.type === 'expense'; }).length) + '</div>';
    html += '  </div>';

    // KPI 3: Balance Neto
    var balanceColor = summary.netSavings >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    html += '  <div class="kpi-card">';
    html += '    <div class="kpi-header">';
    html += '      <span class="kpi-title">Balance Neto</span>';
    html += '      <button class="text-link" data-goto="indicators">Ver</button>';
    html += '    </div>';
    html += '    <div class="kpi-value-row">';
    html += '      <span class="kpi-amount" style="color:' + balanceColor + ';">' + Fmt.formatCOP(summary.netSavings) + '</span>';
    html += '    </div>';
    html += '    <div class="kpi-trend-context">' + (summary.netSavings >= 0 ? 'Superavit disponible' : 'Deficit en el periodo') + '</div>';
    html += '  </div>';

    // KPI 4: Tasa de Ahorro
    var savPct = (summary.savingsRate * 100).toFixed(1);
    var savColor = summary.savingsRate >= 0.1 ? 'var(--color-income)' : (summary.savingsRate > 0 ? 'var(--color-warning)' : 'var(--color-expense)');
    html += '  <div class="kpi-card">';
    html += '    <div class="kpi-header">';
    html += '      <span class="kpi-title">Tasa de Ahorro</span>';
    html += '      <button class="text-link" data-goto="indicators">Ver</button>';
    html += '    </div>';
    html += '    <div class="kpi-value-row">';
    html += '      <span class="kpi-amount" style="color:' + savColor + ';">' + savPct + '%</span>';
    html += '    </div>';
    html += '    <div class="kpi-trend-context">' + (summary.totalIncome > 0 ? 'De los ingresos recibidos' : 'Sin ingresos en el mes') + '</div>';
    html += '  </div>';

    html += '</div>';

    // Fila Principal: Flujo Financiero y Distribucion de Gastos
    html += '<div class="dashboard-main-grid" style="display:grid;grid-template-columns:2fr 1fr;gap:1.25rem;margin-top:1.25rem;">';

    // Grafico Historico
    html += '  <div class="surface-card">';
    html += '    <div class="surface-header">';
    html += '      <h2 class="surface-title">Flujo Financiero (Últimos 6 Meses)</h2>';
    html += '      <div class="legend-group">';
    html += '        <span class="legend-item"><span class="legend-dot" style="background:var(--color-income);"></span> Ingresos</span>';
    html += '        <span class="legend-item"><span class="legend-dot" style="background:var(--color-expense);"></span> Gastos</span>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div class="chart-container-svg">';
    html += createMoneyFlowChartSVG(derived.sixMonthsData);
    html += '    </div>';
    html += '  </div>';

    // Grafico Dona de Distribucion
    html += '  <div class="surface-card">';
    html += '    <div class="surface-header">';
    html += '      <h2 class="surface-title">Distribución de Gastos</h2>';
    html += '      <button class="text-link" data-goto="budget">Presupuesto</button>';
    html += '    </div>';
    html += '    <div class="donut-layout" style="display:flex;flex-direction:column;align-items:center;padding:0.5rem 0;">';
    html += createDonutChartSVG(catDonutData, summary.totalExpenses);
    html += '      <div class="donut-legend-list" style="width:100%;margin-top:1rem;">';
    if (catDonutData.length === 0) {
      html += '        <div style="font-size:0.8rem;color:var(--text-tertiary);text-align:center;">No hay gastos registrados en este mes.</div>';
    } else {
      catDonutData.slice(0, 4).forEach(function (cat) {
        var pct = summary.totalExpenses > 0 ? ((cat.amount / summary.totalExpenses) * 100).toFixed(0) : 0;
        html += '        <div class="donut-legend-row" style="display:flex;justify-content:space-between;font-size:0.8rem;padding:0.25rem 0;">';
        html += '          <span style="display:flex;align-items:center;gap:0.4rem;"><span class="legend-dot" style="background:' + cat.color + ';"></span>' + cat.name + '</span>';
        html += '          <span class="font-mono" style="font-weight:600;">' + pct + '%</span>';
        html += '        </div>';
      });
    }
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    html += '</div>';

    // Fila Inferior: Fondo de Emergencia, Metas y Movimientos Recientes
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-top:1.25rem;">';

    // Fondo de Emergencia + Metas
    html += '  <div class="surface-card">';
    html += '    <div class="surface-header">';
    html += '      <h2 class="surface-title">Planificación y Metas</h2>';
    html += '      <button class="text-link" data-goto="goals">Ver todas</button>';
    html += '    </div>';

    // Widget Fondo
    html += '    <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);margin-bottom:1rem;">';
    html += '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">';
    html += '        <span style="font-size:0.85rem;font-weight:600;">Fondo de Emergencia</span>';
    html += '        <span class="font-mono" style="font-size:0.8rem;color:var(--color-brand);font-weight:700;">' + fundProgress.coverageMonthsActual.toFixed(1) + ' / ' + fundProgress.targetMonths + ' meses</span>';
    html += '      </div>';
    html += '      <div class="goal-track" style="height:6px;background:var(--border-subtle);border-radius:var(--radius-full);overflow:hidden;">';
    html += '        <div class="goal-fill" style="width:' + Math.min(100, fundProgress.progressPercent) + '%;height:100%;background:var(--color-income);"></div>';
    html += '      </div>';
    html += '      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);margin-top:0.35rem;">';
    html += '        <span>Ahorrado: ' + Fmt.formatCOP(fundProgress.currentSaved) + '</span>';
    html += '        <span>Meta: ' + Fmt.formatCOP(fundProgress.targetAmount) + '</span>';
    html += '      </div>';
    html += '    </div>';

    // Lista de Metas de Ahorro
    var goalsProg = root.FinApp.planificacion
      ? root.FinApp.planificacion.consultarProgresoMetas(goals)
      : { list: [] };

    if (goalsProg.list.length === 0) {
      html += '    <div style="font-size:0.8rem;color:var(--text-tertiary);text-align:center;padding:1rem;">Sin metas activas actualmente.</div>';
    } else {
      goalsProg.list.slice(0, 3).forEach(function (g) {
        html += '    <div class="saving-goal-item" style="margin-bottom:0.75rem;">';
        html += '      <div class="saving-goal-top" style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.25rem;">';
        html += '        <span style="font-weight:600;">' + g.name + '</span>';
        html += '        <span class="font-mono" style="font-weight:700;">' + g.progressPercent.toFixed(0) + '%</span>';
        html += '      </div>';
        html += '      <div class="goal-track" style="height:5px;background:var(--border-subtle);border-radius:var(--radius-full);overflow:hidden;">';
        html += '        <div class="goal-fill" style="width:' + Math.min(100, g.progressPercent) + '%;height:100%;background:var(--color-brand);"></div>';
        html += '      </div>';
        html += '    </div>';
      });
    }

    html += '  </div>';

    // Ultimos Movimientos
    html += '  <div class="surface-card">';
    html += '    <div class="surface-header">';
    html += '      <h2 class="surface-title">Movimientos Recientes</h2>';
    html += '      <button class="text-link" data-goto="transactions">Ver todos</button>';
    html += '    </div>';

    var recentTxs = currentMonthTxs.slice(0, 5);
    if (recentTxs.length === 0) {
      html += '    <div style="font-size:0.8rem;color:var(--text-tertiary);text-align:center;padding:2rem;">Sin movimientos registrados en este mes.</div>';
    } else {
      html += '    <div class="fin-table-wrapper">';
      html += '      <table class="fin-table">';
      html += '        <tbody>';
      recentTxs.forEach(function (t) {
        var cat = Cat.getCategoryById(root.FinApp.state.data.categories, t.categoryId);
        var isInc = t.type === 'income';
        var sign = isInc ? '+' : '-';
        var col = isInc ? 'var(--color-income)' : 'var(--color-expense)';
        html += '          <tr>';
        html += '            <td style="font-size:0.8rem;color:var(--text-secondary);">' + Fmt.formatDateES(t.date) + '</td>';
        html += '            <td style="font-weight:600;font-size:0.85rem;">' + t.description + '</td>';
        html += '            <td><span class="category-tag" style="background:' + (cat ? cat.color + '1a' : 'var(--bg-surface-secondary)') + ';color:' + (cat ? cat.color : 'inherit') + ';">' + (cat ? cat.name : 'General') + '</span></td>';
        html += '            <td class="font-mono" style="text-align:right;font-weight:700;color:' + col + ';">' + sign + ' ' + Fmt.formatCOP(t.amount) + '</td>';
        html += '          </tr>';
      });
      html += '        </tbody>';
      html += '      </table>';
      html += '    </div>';
    }

    html += '  </div>';

    html += '</div>';

    return html;
  }

  // Caso de uso: Consultar movimientos
  function renderTransactions(derived) {
    var allTxs = derived.currentMonthTxs;
    var search = (root.FinApp.state.txSearch || '').toLowerCase().trim();
    var typeFilter = root.FinApp.state.txTypeFilter || 'all';
    var catFilter = root.FinApp.state.txCategoryFilter || 'all';

    var filtered = allTxs.filter(function (tx) {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (catFilter !== 'all' && tx.categoryId !== catFilter) return false;
      if (search) {
        var descMatch = (tx.description || '').toLowerCase().indexOf(search) > -1;
        var notesMatch = (tx.notes || '').toLowerCase().indexOf(search) > -1;
        if (!descMatch && !notesMatch) return false;
      }
      return true;
    });

    var totalIncomes = allTxs.filter(function (t) { return t.type === 'income'; }).reduce(function (sum, t) { return sum + Number(t.amount); }, 0);
    var totalExpenses = allTxs.filter(function (t) { return t.type === 'expense'; }).reduce(function (sum, t) { return sum + Number(t.amount); }, 0);

    var html = '';

    // Barra superior con resumen y acciones
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">';
    html += '    <div>';
    html += '      <h1 class="surface-title" style="font-size:1.25rem;">Gestión de Movimientos</h1>';
    html += '      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Registra y administra los ingresos y gastos del periodo actual.</p>';
    html += '    </div>';
    html += '    <div style="display:flex;gap:0.5rem;">';
    html += '      <button class="btn-secondary" id="btn-new-income" style="color:var(--color-income);">+ Ingreso</button>';
    html += '      <button class="btn-primary" id="btn-new-expense" style="background:var(--color-expense);border-color:var(--color-expense);">- Gasto</button>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Barra de filtros y busqueda
    html += '<div class="surface-card" style="margin-bottom:1.25rem;padding:1rem;">';
    html += '  <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:0.75rem;">';
    html += '    <div>';
    html += '      <input type="text" id="tx-search-input" class="form-control" placeholder="Buscar por descripción u observaciones..." value="' + (root.FinApp.state.txSearch || '') + '">';
    html += '    </div>';
    html += '    <div>';
    html += '      <select id="tx-type-filter" class="form-control">';
    html += '        <option value="all" ' + (typeFilter === 'all' ? 'selected' : '') + '>Todos los tipos</option>';
    html += '        <option value="income" ' + (typeFilter === 'income' ? 'selected' : '') + '>Solo Ingresos</option>';
    html += '        <option value="expense" ' + (typeFilter === 'expense' ? 'selected' : '') + '>Solo Gastos</option>';
    html += '      </select>';
    html += '    </div>';
    html += '    <div>';
    html += '      <select id="tx-category-select" class="form-control">';
    html += '        <option value="all">Todas las categorías</option>';
    root.FinApp.state.data.categories.forEach(function (c) {
      var sel = catFilter === c.id ? 'selected' : '';
      html += '        <option value="' + c.id + '" ' + sel + '>' + c.name + '</option>';
    });
    html += '      </select>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Tabla de Movimientos
    html += '<div class="surface-card">';
    html += '  <div class="surface-header">';
    html += '    <h2 class="surface-title">Listado de Movimientos (' + filtered.length + ')</h2>';
    html += '    <div style="font-size:0.8rem;color:var(--text-secondary);">';
    html += '      Ingresos: <strong style="color:var(--color-income);">' + Fmt.formatCOP(totalIncomes) + '</strong> | Gastos: <strong style="color:var(--color-expense);">' + Fmt.formatCOP(totalExpenses) + '</strong>';
    html += '    </div>';
    html += '  </div>';

    if (filtered.length === 0) {
      html += '  <div style="text-align:center;padding:3rem 1rem;color:var(--text-tertiary);">';
      html += '    <div style="font-size:1rem;margin-bottom:0.5rem;">No se encontraron movimientos registrados.</div>';
      html += '    <div style="font-size:0.8rem;">Utiliza los botones de "+ Ingreso" o "- Gasto" para comenzar el registro.</div>';
      html += '  </div>';
    } else {
      html += '  <div class="fin-table-wrapper">';
      html += '    <table class="fin-table">';
      html += '      <thead>';
      html += '        <tr>';
      html += '          <th>Fecha</th>';
      html += '          <th>Descripción</th>';
      html += '          <th>Categoría</th>';
      html += '          <th>Divisa Origen</th>';
      html += '          <th style="text-align:right;">Monto (COP)</th>';
      html += '          <th style="text-align:right;">Acciones</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';
      filtered.forEach(function (tx) {
        var cat = Cat.getCategoryById(root.FinApp.state.data.categories, tx.categoryId);
        var isInc = tx.type === 'income';
        var sign = isInc ? '+' : '-';
        var col = isInc ? 'var(--color-income)' : 'var(--color-expense)';
        var origLabel = tx.originalCurrency && tx.originalCurrency !== 'COP'
          ? (tx.originalCurrency + ' ' + (tx.originalAmount || tx.amount))
          : 'COP';

        html += '        <tr>';
        html += '          <td style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;">' + Fmt.formatDateES(tx.date) + '</td>';
        html += '          <td>';
        html += '            <div style="font-weight:600;font-size:0.85rem;">' + tx.description + '</div>';
        if (tx.notes) {
          html += '            <div style="font-size:0.75rem;color:var(--text-tertiary);">' + tx.notes + '</div>';
        }
        html += '          </td>';
        html += '          <td><span class="category-tag" style="background:' + (cat ? cat.color + '1a' : 'var(--bg-surface-secondary)') + ';color:' + (cat ? cat.color : 'inherit') + ';">' + (cat ? cat.name : 'General') + '</span></td>';
        html += '          <td style="font-size:0.75rem;color:var(--text-secondary);">' + origLabel + '</td>';
        html += '          <td class="font-mono" style="text-align:right;font-weight:700;color:' + col + ';white-space:nowrap;">' + sign + ' ' + Fmt.formatCOP(tx.amount) + '</td>';
        html += '          <td style="text-align:right;white-space:nowrap;">';
        html += '            <button class="text-link" data-action="edit-tx" data-id="' + tx.id + '" style="margin-right:0.6rem;">Editar</button>';
        html += '            <button class="text-link danger" data-action="delete-tx" data-id="' + tx.id + '">Eliminar</button>';
        html += '          </td>';
        html += '        </tr>';
      });
      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';
    }

    html += '</div>';
    return html;
  }

  // Caso de uso: Ver historial y reportes
  function renderHistory(derived) {
    var sixMonths = derived.sixMonthsData || [];
    var currentTxs = derived.currentMonthTxs || [];
    var summary = derived.summary;
    var budget = derived.currentBudget;

    var html = '';

    // Encabezado
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">';
    html += '    <div>';
    html += '      <h1 class="surface-title" style="font-size:1.25rem;">Historial y Reporte del Periodo</h1>';
    html += '      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Consulta la evolución financiera mensual y genera reportes imprimibles o en CSV.</p>';
    html += '    </div>';
    html += '    <div style="display:flex;gap:0.5rem;">';
    html += '      <button class="btn-secondary" id="btn-export-period-csv">Exportar CSV</button>';
    html += '      <button class="btn-primary" id="btn-print-period-report">Imprimir Reporte</button>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // SECCION DE REPORTE FORMAL DEL PERIODO SELECCIONADO
    html += '<div class="surface-card" id="printable-period-report" style="margin-bottom:1.25rem;">';
    html += '  <div class="surface-header">';
    html += '    <div>';
    html += '      <h2 class="surface-title">Reporte Financiero: ' + root.FinApp.state.selectedMonth + '</h2>';
    html += '      <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;">Usuario: ' + (root.FinApp.state.data.profile.name || 'Mi Cuenta') + ' | Generado: ' + Fmt.getCurrentDateISO() + '</div>';
    html += '    </div>';
    html += '  </div>';

    // Resumen Ejecutivo del Periodo
    html += '  <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:1rem;margin-bottom:1.25rem;">';
    html += '    <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
    html += '      <div style="font-size:0.75rem;color:var(--text-secondary);">Ingresos Totales</div>';
    html += '      <div class="font-mono" style="font-size:1.1rem;font-weight:700;color:var(--color-income);margin-top:0.25rem;">' + Fmt.formatCOP(summary.totalIncome) + '</div>';
    html += '    </div>';
    html += '    <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
    html += '      <div style="font-size:0.75rem;color:var(--text-secondary);">Gastos Totales</div>';
    html += '      <div class="font-mono" style="font-size:1.1rem;font-weight:700;color:var(--color-expense);margin-top:0.25rem;">' + Fmt.formatCOP(summary.totalExpenses) + '</div>';
    html += '    </div>';
    html += '    <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
    html += '      <div style="font-size:0.75rem;color:var(--text-secondary);">Balance Neto</div>';
    html += '      <div class="font-mono" style="font-size:1.1rem;font-weight:700;margin-top:0.25rem;color:' + (summary.netSavings >= 0 ? 'var(--color-income)' : 'var(--color-expense)') + ';">' + Fmt.formatCOP(summary.netSavings) + '</div>';
    html += '    </div>';
    html += '    <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
    html += '      <div style="font-size:0.75rem;color:var(--text-secondary);">Tasa de Ahorro</div>';
    html += '      <div class="font-mono" style="font-size:1.1rem;font-weight:700;margin-top:0.25rem;">' + (summary.savingsRate * 100).toFixed(1) + '%</div>';
    html += '    </div>';
    html += '  </div>';

    // Cumplimiento del Presupuesto en el Reporte
    var totalBudgetAllocated = 0;
    if (budget && budget.categoryLimits) {
      totalBudgetAllocated = budget.categoryLimits.reduce(function (sum, l) { return sum + (Number(l.allocatedAmount) || 0); }, 0);
    }
    var budgetExecutionPct = totalBudgetAllocated > 0 ? ((summary.totalExpenses / totalBudgetAllocated) * 100).toFixed(1) : 0;

    html += '  <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);margin-bottom:1.25rem;">';
    html += '    <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.85rem;margin-bottom:0.4rem;">';
    html += '      <span style="font-weight:600;">Cumplimiento del Presupuesto</span>';
    html += '      <span class="font-mono">' + (totalBudgetAllocated > 0 ? (budgetExecutionPct + '% ejecutado') : 'Sin presupuesto definido') + '</span>';
    html += '    </div>';
    if (totalBudgetAllocated > 0) {
      html += '    <div class="goal-track" style="height:6px;background:var(--border-subtle);border-radius:var(--radius-full);overflow:hidden;">';
      html += '      <div class="goal-fill" style="width:' + Math.min(100, budgetExecutionPct) + '%;height:100%;background:' + (budgetExecutionPct > 100 ? 'var(--color-expense)' : 'var(--color-brand)') + ';"></div>';
    }
    html += '    </div>';
    html += '    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);margin-top:0.35rem;">';
    html += '      <span>Presupuestado: ' + Fmt.formatCOP(totalBudgetAllocated) + '</span>';
    html += '      <span>Gastado: ' + Fmt.formatCOP(summary.totalExpenses) + '</span>';
    html += '      <span>Margen: ' + Fmt.formatCOP(totalBudgetAllocated - summary.totalExpenses) + '</span>';
    html += '    </div>';
    html += '  </div>';

    // Desglose de Categorias Principales
    var catTotals = {};
    currentTxs.forEach(function (tx) {
      if (tx.type === 'expense') {
        catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + Number(tx.amount);
      }
    });

    html += '  <h3 style="font-size:0.9rem;font-weight:600;margin-bottom:0.6rem;">Gastos por Categoría del Periodo</h3>';
    var catKeys = Object.keys(catTotals);
    if (catKeys.length === 0) {
      html += '  <div style="font-size:0.8rem;color:var(--text-tertiary);margin-bottom:1rem;">Sin gastos en este mes.</div>';
    } else {
      html += '  <div class="fin-table-wrapper" style="margin-bottom:1.25rem;">';
      html += '    <table class="fin-table">';
      html += '      <thead>';
      html += '        <tr>';
      html += '          <th>Categoría</th>';
      html += '          <th>Tipo</th>';
      html += '          <th style="text-align:right;">Total Gastado</th>';
      html += '          <th style="text-align:right;">% del Gasto</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';
      catKeys.sort(function (a, b) { return catTotals[b] - catTotals[a]; }).forEach(function (cId) {
        var cat = Cat.getCategoryById(root.FinApp.state.data.categories, cId);
        var amt = catTotals[cId];
        var pct = summary.totalExpenses > 0 ? ((amt / summary.totalExpenses) * 100).toFixed(1) : '0.0';
        html += '        <tr>';
        html += '          <td><span class="category-tag" style="background:' + (cat ? cat.color + '1a' : 'var(--bg-surface-secondary)') + ';color:' + (cat ? cat.color : 'inherit') + ';">' + (cat ? cat.name : 'Otra') + '</span></td>';
        html += '          <td style="font-size:0.8rem;color:var(--text-secondary);">' + (cat && cat.isEssential ? 'Esencial (Necesidad)' : 'No esencial') + '</td>';
        html += '          <td class="font-mono" style="text-align:right;font-weight:700;">' + Fmt.formatCOP(amt) + '</td>';
        html += '          <td class="font-mono" style="text-align:right;">' + pct + '%</td>';
        html += '        </tr>';
      });
      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';
    }

    html += '</div>';

    // Evolucion Historica Mensual
    html += '<div class="surface-card">';
    html += '  <div class="surface-header">';
    html += '    <h2 class="surface-title">Evolución Histórica Mensual</h2>';
    html += '  </div>';
    html += '  <div class="chart-container-svg" style="margin-bottom:1.5rem;">';
    html += createMoneyFlowChartSVG(sixMonths);
    html += '  </div>';

    html += '  <div class="fin-table-wrapper">';
    html += '    <table class="fin-table">';
    html += '      <thead>';
    html += '        <tr>';
    html += '          <th>Mes</th>';
    html += '          <th style="text-align:right;">Ingresos</th>';
    html += '          <th style="text-align:right;">Gastos</th>';
    html += '          <th style="text-align:right;">Ahorro Neto</th>';
    html += '          <th style="text-align:right;">Tasa Ahorro</th>';
    html += '        </tr>';
    html += '      </thead>';
    html += '      <tbody>';
    sixMonths.forEach(function (m) {
      var net = m.income - m.expenses;
      var rate = m.income > 0 ? ((net / m.income) * 100).toFixed(1) + '%' : '0.0%';
      html += '        <tr>';
      html += '          <td style="font-weight:600;">' + m.label + ' (' + m.monthKey + ')</td>';
      html += '          <td class="font-mono" style="text-align:right;color:var(--color-income);">' + Fmt.formatCOP(m.income) + '</td>';
      html += '          <td class="font-mono" style="text-align:right;color:var(--color-expense);">' + Fmt.formatCOP(m.expenses) + '</td>';
      html += '          <td class="font-mono" style="text-align:right;font-weight:700;color:' + (net >= 0 ? 'var(--color-income)' : 'var(--color-expense)') + ';">' + Fmt.formatCOP(net) + '</td>';
      html += '          <td class="font-mono" style="text-align:right;">' + rate + '</td>';
      html += '        </tr>';
    });
    html += '      </tbody>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    return html;
  }

  /**
   * Exporta el reporte del periodo actual en formato CSV estandar
   */
  function exportarReporteCSV() {
    var derived = root.FinApp.getDerivedState();
    var period = root.FinApp.state.selectedMonth;
    var txs = derived.currentMonthTxs || [];

    var csvContent = 'sep=,\n';
    csvContent += 'FINANZAS APP - REPORTE MENSUAL DE MOVIMIENTOS\n';
    csvContent += 'Periodo,' + period + '\n';
    csvContent += 'Usuario,' + (root.FinApp.state.data.profile.name || 'Mi Cuenta') + '\n';
    csvContent += 'Fecha de exportación,' + Fmt.getCurrentDateISO() + '\n\n';

    csvContent += 'RESUMEN FINANCIERO\n';
    csvContent += 'Ingresos Totales (COP),' + derived.summary.totalIncome + '\n';
    csvContent += 'Gastos Totales (COP),' + derived.summary.totalExpenses + '\n';
    csvContent += 'Balance Neto (COP),' + derived.summary.netSavings + '\n';
    csvContent += 'Tasa de Ahorro,' + (derived.summary.savingsRate * 100).toFixed(2) + '%\n\n';

    csvContent += 'DETALLE DE MOVIMIENTOS\n';
    csvContent += 'ID,Fecha,Tipo,Descripción,Categoría,Monto COP,Divisa Original,Monto Original,Observaciones\n';

    txs.forEach(function (tx) {
      var cat = Cat.getCategoryById(root.FinApp.state.data.categories, tx.categoryId);
      var row = [
        '"' + tx.id + '"',
        '"' + tx.date + '"',
        '"' + (tx.type === 'income' ? 'Ingreso' : 'Gasto') + '"',
        '"' + (tx.description || '').replace(/"/g, '""') + '"',
        '"' + (cat ? cat.name : 'General').replace(/"/g, '""') + '"',
        tx.amount,
        '"' + (tx.originalCurrency || 'COP') + '"',
        tx.originalAmount || tx.amount,
        '"' + (tx.notes || '').replace(/"/g, '""') + '"'
      ];
      csvContent += row.join(',') + '\n';
    });

    var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Reporte_Financiero_' + period + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Render del Gestor de Categorias para Ajustes y Datos
  function renderCategoriasManager() {
    var cats = root.FinApp.state.data.categories || [];
    var html = '';

    html += '<div class="surface-card" style="margin-top:1.5rem;">';
    html += '  <div class="surface-header">';
    html += '    <div>';
    html += '      <h2 class="surface-title">Gestión de Categorías</h2>';
    html += '      <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Personaliza tus categorías de ingresos y gastos. Las categorías del sistema no pueden eliminarse.</div>';
    html += '    </div>';
    html += '    <button class="btn-primary" id="btn-new-custom-category">+ Nueva Categoría</button>';
    html += '  </div>';

    html += '  <div class="fin-table-wrapper">';
    html += '    <table class="fin-table">';
    html += '      <thead>';
    html += '        <tr>';
    html += '          <th>Color</th>';
    html += '          <th>Nombre</th>';
    html += '          <th>Tipo</th>';
    html += '          <th>Clasificación</th>';
    html += '          <th>Movimientos</th>';
    html += '          <th>Origen</th>';
    html += '          <th style="text-align:right;">Acciones</th>';
    html += '        </tr>';
    html += '      </thead>';
    html += '      <tbody>';

    cats.forEach(function (cat) {
      var isDefault = esCategoriaPredeterminada(cat.id);
      var moveCount = contarMovimientosPorCategoria(cat.id);
      var tipoLabel = cat.type === 'income' ? 'Ingreso' : 'Gasto';
      var grupoLabel = 'General';
      if (cat.group === 'income') grupoLabel = 'Ingreso';
      else if (cat.group === 'essential') grupoLabel = 'Necesidad (Esencial)';
      else if (cat.group === 'non_essential') grupoLabel = 'Deseo (No esencial)';
      else if (cat.group === 'savings_debt') grupoLabel = 'Ahorro / Deuda';

      html += '        <tr>';
      html += '          <td><span class="legend-dot" style="background:' + cat.color + ';display:inline-block;width:14px;height:14px;"></span></td>';
      html += '          <td style="font-weight:600;">' + cat.name + '</td>';
      html += '          <td><span class="category-tag" style="background:' + (cat.type === 'income' ? 'var(--color-income-light)' : 'var(--color-expense-light)') + ';color:' + (cat.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)') + ';">' + tipoLabel + '</span></td>';
      html += '          <td style="font-size:0.8rem;color:var(--text-secondary);">' + grupoLabel + '</td>';
      html += '          <td class="font-mono" style="font-size:0.85rem;">' + moveCount + '</td>';
      html += '          <td style="font-size:0.8rem;color:var(--text-secondary);">' + (isDefault ? 'Predeterminada' : 'Personalizada') + '</td>';
      html += '          <td style="text-align:right;">';
      if (!isDefault) {
        html += '            <button class="text-link" data-action="edit-category" data-id="' + cat.id + '" style="margin-right:0.6rem;">Editar</button>';
        html += '            <button class="text-link danger" data-action="delete-category" data-id="' + cat.id + '">Eliminar</button>';
      } else {
        html += '            <span style="font-size:0.75rem;color:var(--text-tertiary);">Fija</span>';
      }
      html += '          </td>';
      html += '        </tr>';
    });

    html += '      </tbody>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    return html;
  }

  root.FinApp.gestionFinanciera = {
    crearIngreso: crearIngreso,
    editarIngreso: editarIngreso,
    eliminarIngreso: eliminarIngreso,
    crearGasto: crearGasto,
    editarGasto: editarGasto,
    eliminarGasto: eliminarGasto,
    crearCategoria: crearCategoria,
    editarCategoria: editarCategoria,
    eliminarCategoria: eliminarCategoria,
    esCategoriaPredeterminada: esCategoriaPredeterminada,
    contarMovimientosPorCategoria: contarMovimientosPorCategoria,
    renderDashboard: renderDashboard,
    renderTransactions: renderTransactions,
    renderHistory: renderHistory,
    renderCategoriasManager: renderCategoriasManager,
    exportarReporteCSV: exportarReporteCSV,
    createMoneyFlowChartSVG: createMoneyFlowChartSVG,
    createDonutChartSVG: createDonutChartSVG,
  };
})(typeof window !== 'undefined' ? window : this);

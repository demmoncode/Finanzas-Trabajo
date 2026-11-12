/* Modulo de analisis y diagnostico financiero */

(function (root) {
  'use strict';

  root.FinApp = root.FinApp || {};

  var Fmt = (typeof window !== 'undefined' ? window.FinFormatters : null) || root.FinFormatters;
  var Cat = (typeof window !== 'undefined' ? window.FinCategories : null) || root.FinCategories;
  var Engine = (typeof window !== 'undefined' ? window.FinEngine : null) || root.FinEngine;

  /**
   * Obtiene la clave del mes anterior en formato YYYY-MM
   */
  function getPreviousMonthKey(monthKey) {
    if (!monthKey || monthKey.indexOf('-') === -1) return '';
    var parts = monthKey.split('-').map(Number);
    var year = parts[0];
    var month = parts[1];
    var prevMonth = month - 1;
    var prevYear = year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    return prevYear + '-' + String(prevMonth).padStart(2, '0');
  }

  // Caso de uso: Calcular indicadores
  function calcularIndicadores(currentMonthTxs, categories, emergencyFund, debts, goals, budget, essentialBaseline) {
    if (Engine && typeof Engine.calculateIndicators === 'function') {
      return Engine.calculateIndicators(currentMonthTxs, categories, emergencyFund, debts, goals, budget, essentialBaseline);
    }
    return [];
  }

  // Caso de uso: Analizar tendencias
  function analizarTendencias(allTransactions, currentMonthKey) {
    allTransactions = allTransactions || [];
    currentMonthKey = currentMonthKey || Fmt.getCurrentMonthKey();
    var prevMonthKey = getPreviousMonthKey(currentMonthKey);

    var currTxs = Engine.filterTransactionsByMonth(allTransactions, currentMonthKey);
    var prevTxs = Engine.filterTransactionsByMonth(allTransactions, prevMonthKey);

    var currInc = 0, currExp = 0;
    currTxs.forEach(function (t) {
      if (t.type === 'income') currInc += Number(t.amount) || 0;
      if (t.type === 'expense') currExp += Number(t.amount) || 0;
    });

    var prevInc = 0, prevExp = 0;
    prevTxs.forEach(function (t) {
      if (t.type === 'income') prevInc += Number(t.amount) || 0;
      if (t.type === 'expense') prevExp += Number(t.amount) || 0;
    });

    var currSavings = currInc - currExp;
    var prevSavings = prevInc - prevExp;

    function calcPct(curr, prev) {
      if (prev === 0) return curr > 0 ? 100 : (curr < 0 ? -100 : 0);
      return ((curr - prev) / Math.abs(prev)) * 100;
    }

    var incDelta = calcPct(currInc, prevInc);
    var expDelta = calcPct(currExp, prevExp);
    var savDelta = calcPct(currSavings, prevSavings);

    // Frases de interpretacion
    var interpretations = [];

    if (prevTxs.length === 0) {
      interpretations.push('Este es el primer periodo con registros comparables en el sistema.');
    } else {
      // Interpretacion de ingresos
      if (Math.abs(incDelta) < 1) {
        interpretations.push('Tus ingresos se mantuvieron estables respecto al mes anterior.');
      } else if (incDelta > 0) {
        interpretations.push('Tus ingresos crecieron un ' + incDelta.toFixed(1) + '% en comparación con el mes previo.');
      } else {
        interpretations.push('Tus ingresos disminuyeron un ' + Math.abs(incDelta).toFixed(1) + '% respecto al mes previo.');
      }

      // Interpretacion de gastos
      if (Math.abs(expDelta) < 1) {
        interpretations.push('Tus gastos se mantuvieron en el mismo nivel del periodo anterior.');
      } else if (expDelta > 0) {
        interpretations.push('Tus gastos aumentaron un ' + expDelta.toFixed(1) + '%, lo que requiere atención preventiva.');
      } else {
        interpretations.push('Lograste reducir tus gastos en un ' + Math.abs(expDelta).toFixed(1) + '%, optimizando tu flujo.');
      }

      // Interpretacion de balance
      if (currSavings > prevSavings) {
        interpretations.push('Tu balance de ahorro neto mejoro favorablemente frente al periodo anterior.');
      } else if (currSavings < prevSavings) {
        interpretations.push('El excedente neto de ahorro cerro por debajo del resultado del periodo anterior.');
      }
    }

    if (currentMonthKey === Fmt.getCurrentMonthKey() && prevTxs.length > 0) {
      interpretations.push('El mes sigue en curso: la comparación puede cambiar a medida que registres más movimientos.');
    }

    return {
      currentMonth: currentMonthKey,
      previousMonth: prevMonthKey,
      currentIncome: currInc,
      previousIncome: prevInc,
      incomeDeltaPct: incDelta,
      currentExpenses: currExp,
      previousExpenses: prevExp,
      expensesDeltaPct: expDelta,
      currentSavings: currSavings,
      previousSavings: prevSavings,
      savingsDeltaPct: savDelta,
      hasPreviousData: prevTxs.length > 0,
      interpretations: interpretations,
    };
  }

  // Caso de uso: Identificar desviaciones
  function identificarDesviaciones(budget, currentMonthTxs, categories) {
    categories = categories || [];
    currentMonthTxs = currentMonthTxs || [];

    if (!budget || !budget.categoryLimits || budget.categoryLimits.length === 0) {
      return {
        hasBudget: false,
        deviations: [],
        totalExcess: 0,
        message: 'No hay presupuesto configurado para este periodo.',
      };
    }

    var spentMap = {};
    currentMonthTxs.forEach(function (tx) {
      if (tx.type === 'expense') {
        spentMap[tx.categoryId] = (spentMap[tx.categoryId] || 0) + Number(tx.amount);
      }
    });

    var deviations = [];
    var totalExcess = 0;

    budget.categoryLimits.forEach(function (limit) {
      var allocated = Number(limit.allocatedAmount) || 0;
      var spent = spentMap[limit.categoryId] || 0;

      if (allocated > 0 && spent > allocated) {
        var excess = spent - allocated;
        var excessPct = (excess / allocated) * 100;
        totalExcess += excess;

        var cat = Cat.getCategoryById(categories, limit.categoryId);
        deviations.push({
          categoryId: limit.categoryId,
          categoryName: cat ? cat.name : 'Categoría',
          categoryColor: cat ? cat.color : '#ef4444',
          allocatedAmount: allocated,
          realSpent: spent,
          excessAmount: excess,
          excessPercent: excessPct,
          isEssential: cat ? cat.isEssential : false,
        });
      }
    });

    // Ordenar de mayor a menor sobrecosto
    deviations.sort(function (a, b) {
      return b.excessAmount - a.excessAmount;
    });

    return {
      hasBudget: true,
      deviations: deviations,
      totalExcess: totalExcess,
      count: deviations.length,
      message: deviations.length > 0
        ? 'Se identificaron ' + deviations.length + ' categorías que exceden el limite asignado.'
        : 'Todas las categorías se encuentran dentro de los limites presupuestados.',
    };
  }

  // Caso de uso: Realizar diagnóstico financiero
  function realizarDiagnosticoFinanciero(data, monthKey) {
    data = data || (root.FinApp.state ? root.FinApp.state.data : {});
    monthKey = monthKey || (root.FinApp.state ? root.FinApp.state.selectedMonth : Fmt.getCurrentMonthKey());

    var txs = data.transactions || [];
    var currentTxs = Engine.filterTransactionsByMonth(txs, monthKey);
    var categories = data.categories || [];
    var emergencyFund = data.emergencyFund || { currentSaved: 0, targetMonthsCoverage: 3 };
    var debts = data.debts || [];
    var goals = data.goals || [];

    var currentBudget = null;
    if (data.budgets && data.budgets.length) {
      for (var i = 0; i < data.budgets.length; i++) {
        if (data.budgets[i].month === monthKey) {
          currentBudget = data.budgets[i];
          break;
        }
      }
    }

    // 1. Calcular indicadores
    var Invest = typeof window !== 'undefined' ? window.FinInvest : null;
    var baseline = Invest ? Invest.essentialBaseline(data, Fmt.getCurrentDateISO()) : 0;
    var indicadores = calcularIndicadores(currentTxs, categories, emergencyFund, debts, goals, currentBudget, baseline);

    // 2. Analizar tendencias
    var tendencias = analizarTendencias(txs, monthKey);

    // 3. Identificar desviaciones
    var desviaciones = identificarDesviaciones(currentBudget, currentTxs, categories);

    return {
      indicadores: indicadores,
      tendencias: tendencias,
      desviaciones: desviaciones,
      summary: Engine.calculateFinancialSummary(currentTxs, categories),
    };
  }

  // Render de Diagnostico y Ratios
  function renderIndicators(derived) {
    var diag = realizarDiagnosticoFinanciero(root.FinApp.state.data, root.FinApp.state.selectedMonth);
    var indicators = diag.indicadores;
    var tendencias = diag.tendencias;
    var desviaciones = diag.desviaciones;

    var html = '';

    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <h1 class="surface-title" style="font-size:1.25rem;">Diagnóstico y Ratios Financieros</h1>';
    html += '  <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Evaluación cuantitativa estructurada: indicadores clave, variación de tendencias y desviaciones presupuestarias.</p>';
    html += '</div>';

    // Grilla de Indicadores Formales
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:1.25rem;margin-bottom:1.5rem;">';
    indicators.forEach(function (ind) {
      var badgeClass = 'var(--text-secondary)';
      var badgeBg = 'var(--bg-surface-secondary)';
      if (ind.status === 'optimal') {
        badgeClass = 'var(--color-income)';
        badgeBg = 'var(--color-income-light)';
      } else if (ind.status === 'warning') {
        badgeClass = 'var(--color-warning)';
        badgeBg = 'var(--color-warning-light)';
      } else if (ind.status === 'alert') {
        badgeClass = 'var(--color-expense)';
        badgeBg = 'var(--color-expense-light)';
      }

      html += '<div class="surface-card" style="display:flex;flex-direction:column;justify-content:space-between;">';
      html += '  <div>';
      html += '    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">';
      html += '      <h3 style="font-size:0.95rem;font-weight:700;">' + ind.name + '</h3>';
      html += '      <span class="category-tag" style="background:' + badgeBg + ';color:' + badgeClass + ';">' + (ind.status === 'optimal' ? 'Óptimo' : (ind.status === 'warning' ? 'Precaución' : (ind.status === 'alert' ? 'Alerta' : 'Neutral'))) + '</span>';
      html += '    </div>';
      html += '    <div class="font-mono" style="font-size:1.5rem;font-weight:800;color:' + badgeClass + ';margin-bottom:0.5rem;">' + ind.formattedValue + '</div>';
      html += '    <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.4;margin-bottom:0.75rem;">' + ind.description + '</p>';
      html += '  </div>';
      html += '  <div style="padding-top:0.6rem;border-top:1px solid var(--border-subtle);font-size:0.7rem;color:var(--text-tertiary);">';
      html += '    Formula: <code style="font-family:var(--font-mono);">' + ind.formula + '</code>';
      html += '  </div>';
      html += '</div>';
    });
    html += '</div>';

    // Seccion de Analisis de Tendencias Mes a Mes
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">';

    html += '  <div class="surface-card">';
    html += '    <div class="surface-header">';
    html += '      <h2 class="surface-title">Análisis de Tendencias (Mes a Mes)</h2>';
    html += '      <span style="font-size:0.75rem;color:var(--text-secondary);">' + tendencias.previousMonth + ' vs ' + tendencias.currentMonth + '</span>';
    html += '    </div>';

    html += '    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:0.75rem;margin-bottom:1rem;">';
    html += '      <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);text-align:center;">';
    html += '        <div style="font-size:0.75rem;color:var(--text-secondary);">Var. Ingresos</div>';
    var incCol = tendencias.incomeDeltaPct >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    html += '        <div class="font-mono" style="font-size:1rem;font-weight:700;color:' + incCol + ';margin-top:0.25rem;">' + (tendencias.incomeDeltaPct >= 0 ? '+' : '') + tendencias.incomeDeltaPct.toFixed(1) + '%</div>';
    html += '      </div>';

    html += '      <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);text-align:center;">';
    html += '        <div style="font-size:0.75rem;color:var(--text-secondary);">Var. Gastos</div>';
    var expCol = tendencias.expensesDeltaPct <= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    html += '        <div class="font-mono" style="font-size:1rem;font-weight:700;color:' + expCol + ';margin-top:0.25rem;">' + (tendencias.expensesDeltaPct >= 0 ? '+' : '') + tendencias.expensesDeltaPct.toFixed(1) + '%</div>';
    html += '      </div>';

    html += '      <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);text-align:center;">';
    html += '        <div style="font-size:0.75rem;color:var(--text-secondary);">Var. Ahorro</div>';
    var savCol = tendencias.savingsDeltaPct >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    html += '        <div class="font-mono" style="font-size:1rem;font-weight:700;color:' + savCol + ';margin-top:0.25rem;">' + (tendencias.savingsDeltaPct >= 0 ? '+' : '') + tendencias.savingsDeltaPct.toFixed(1) + '%</div>';
    html += '      </div>';
    html += '    </div>';

    html += '    <div style="font-size:0.8rem;line-height:1.5;color:var(--text-secondary);">';
    tendencias.interpretations.forEach(function (phrase) {
      html += '    <div style="margin-bottom:0.4rem;">• ' + phrase + '</div>';
    });
    html += '    </div>';
    html += '  </div>';

    // Seccion de Desviaciones Presupuestarias Identificadas
    html += '  <div class="surface-card">';
    html += '    <div class="surface-header">';
    html += '      <h2 class="surface-title">Desviaciones Presupuestarias</h2>';
    html += '      <span class="category-tag" style="background:' + (desviaciones.count > 0 ? 'var(--color-expense-light)' : 'var(--color-income-light)') + ';color:' + (desviaciones.count > 0 ? 'var(--color-expense)' : 'var(--color-income)') + ';">' + (desviaciones.count > 0 ? (desviaciones.count + ' alertas') : 'Sin excesos') + '</span>';
    html += '    </div>';

    if (!desviaciones.hasBudget) {
      html += '    <div style="text-align:center;padding:2rem 1rem;color:var(--text-tertiary);font-size:0.85rem;">';
      html += '      Configura un presupuesto en este mes para identificar desviaciones y sobrecostos por categoría.';
      html += '    </div>';
    } else if (desviaciones.deviations.length === 0) {
      html += '    <div style="text-align:center;padding:2rem 1rem;color:var(--color-income);font-size:0.85rem;">';
      html += '      Excelente disciplina: todas las categorías ejecutadas se mantienen dentro del limite asignado.';
      html += '    </div>';
    } else {
      html += '    <div class="fin-table-wrapper">';
      html += '      <table class="fin-table">';
      html += '        <thead>';
      html += '          <tr>';
      html += '            <th>Categoría</th>';
      html += '            <th style="text-align:right;">Limite</th>';
      html += '            <th style="text-align:right;">Gasto Real</th>';
      html += '            <th style="text-align:right;">Sobrecosto</th>';
      html += '          </tr>';
      html += '        </thead>';
      html += '        <tbody>';
      desviaciones.deviations.forEach(function (d) {
        html += '          <tr>';
        html += '            <td><span class="category-tag" style="background:' + d.categoryColor + '1a;color:' + d.categoryColor + ';">' + d.categoryName + '</span></td>';
        html += '            <td class="font-mono" style="text-align:right;font-size:0.8rem;">' + Fmt.formatCOP(d.allocatedAmount) + '</td>';
        html += '            <td class="font-mono" style="text-align:right;font-size:0.8rem;font-weight:600;">' + Fmt.formatCOP(d.realSpent) + '</td>';
        html += '            <td class="font-mono" style="text-align:right;font-size:0.8rem;font-weight:700;color:var(--color-expense);">+' + Fmt.formatCOP(d.excessAmount) + ' (+' + d.excessPercent.toFixed(0) + '%)</td>';
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

  root.FinApp.analisis = {
    calcularIndicadores: calcularIndicadores,
    analizarTendencias: analizarTendencias,
    identificarDesviaciones: identificarDesviaciones,
    realizarDiagnosticoFinanciero: realizarDiagnosticoFinanciero,
    renderIndicators: renderIndicators,
  };
})(typeof window !== 'undefined' ? window : this);

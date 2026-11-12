/* Modulo de planificacion financiera: presupuestos, metas de ahorro y fondo de emergencia */

(function (root) {
  'use strict';

  root.FinApp = root.FinApp || {};

  var Fmt = (typeof window !== 'undefined' ? window.FinFormatters : null) || root.FinFormatters;
  var Cat = (typeof window !== 'undefined' ? window.FinCategories : null) || root.FinCategories;

  function triggerPersist() {
    if (root.FinApp && typeof root.FinApp.persistData === 'function') {
      root.FinApp.persistData();
    }
  }

  // Caso de uso: Configurar presupuesto
  function guardarPresupuesto(budgetData) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var budgets = root.FinApp.state.data.budgets || [];
    var monthKey = budgetData.month || root.FinApp.state.selectedMonth;

    var payload = {
      id: 'bgt-' + monthKey,
      userId: (root.FinApp.state.currentUser && root.FinApp.state.currentUser.id) || 'usuario-principal',
      month: monthKey,
      expectedIncome: Number(budgetData.expectedIncome) || 0,
      targetSavings: Number(budgetData.targetSavings) || 0,
      use503020Rule: budgetData.use503020Rule === true,
      categoryLimits: budgetData.categoryLimits || [],
    };

    var foundIndex = -1;
    for (var i = 0; i < budgets.length; i++) {
      if (budgets[i].month === monthKey) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex > -1) {
      budgets[foundIndex] = payload;
    } else {
      budgets.push(payload);
    }

    root.FinApp.state.data.budgets = budgets;
    triggerPersist();
    return true;
  }

  // Caso de uso: Definir metas financieras
  function crearMeta(goalData) {
    if (!root.FinApp.state || !root.FinApp.state.data) return null;
    var goals = root.FinApp.state.data.goals || [];
    var newGoal = {
      id: Fmt.generateId('goal'),
      name: (goalData.name || 'Meta de ahorro').trim(),
      targetAmount: Number(goalData.targetAmount) || 0,
      currentAmount: Number(goalData.currentAmount) || 0,
      deadline: goalData.deadline || '',
      category: goalData.category || 'general',
      status: 'active',
      createdAt: Fmt.getCurrentDateISO(),
    };
    goals.push(newGoal);
    root.FinApp.state.data.goals = goals;
    triggerPersist();
    return newGoal;
  }
  function eliminarMeta(goalId) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var initLen = root.FinApp.state.data.goals.length;
    root.FinApp.state.data.goals = root.FinApp.state.data.goals.filter(function (g) {
      return g.id !== goalId;
    });
    var changed = root.FinApp.state.data.goals.length < initLen;
    if (changed) triggerPersist();
    return changed;
  }

  function abonarMeta(goalId, amount) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var amt = Number(amount) || 0;
    if (amt <= 0) return false;
    var goals = root.FinApp.state.data.goals || [];
    for (var i = 0; i < goals.length; i++) {
      if (goals[i].id === goalId) {
        goals[i].currentAmount = (Number(goals[i].currentAmount) || 0) + amt;
        if (goals[i].currentAmount >= goals[i].targetAmount) {
          goals[i].status = 'completed';
          goals[i].completedAt = Fmt.getCurrentDateISO();
        }
        triggerPersist();
        return true;
      }
    }
    return false;
  }

  // Caso de uso: Gestionar fondo de emergencia
  function defaultFundMonths() {
    var params = (typeof window !== 'undefined' && window.FinStorage && typeof window.FinStorage.getSystemParams === 'function')
      ? window.FinStorage.getSystemParams()
      : { emergencyFundMonths: 3 };
    return params.emergencyFundMonths || 3;
  }

  // Un valor vacio o invalido conserva lo que ya estaba guardado
  function configurarFondo(targetMonths, monthlyContributionTarget) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var ef = root.FinApp.state.data.emergencyFund || { currentSaved: 0 };
    var months = parseInt(targetMonths, 10);
    if (months > 0) ef.targetMonthsCoverage = months;
    if (monthlyContributionTarget !== null && monthlyContributionTarget !== undefined && monthlyContributionTarget !== '') {
      ef.monthlyContributionTarget = Math.max(0, Number(monthlyContributionTarget) || 0);
    }
    root.FinApp.state.data.emergencyFund = ef;
    triggerPersist();
    return true;
  }

  // Guarda cada operacion del fondo para mostrarla en su historial
  function registrarOperacionFondo(ef, type, amount) {
    ef.history = ef.history || [];
    ef.history.unshift({ date: Fmt.getCurrentDateISO(), type: type, amount: Number(amount) || 0 });
    ef.history = ef.history.slice(0, 30);
  }

  function abonarFondo(amount) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var amt = Number(amount) || 0;
    if (amt <= 0) return false;
    var ef = root.FinApp.state.data.emergencyFund || { currentSaved: 0, targetMonthsCoverage: defaultFundMonths() };
    ef.currentSaved = (Number(ef.currentSaved) || 0) + amt;
    registrarOperacionFondo(ef, 'add', amt);
    root.FinApp.state.data.emergencyFund = ef;
    triggerPersist();
    return true;
  }

  // Retira dinero del fondo (uso en una emergencia); vuelve al capital libre
  function retirarFondo(amount) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var amt = Number(amount) || 0;
    var ef = root.FinApp.state.data.emergencyFund || { currentSaved: 0 };
    var saved = Number(ef.currentSaved) || 0;
    if (amt <= 0 || amt > saved) return false;
    ef.currentSaved = saved - amt;
    registrarOperacionFondo(ef, 'withdraw', amt);
    root.FinApp.state.data.emergencyFund = ef;
    triggerPersist();
    return true;
  }

  // Deja el fondo como nuevo: sin dinero guardado y con la meta por defecto
  function reiniciarFondo() {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var previous = Number((root.FinApp.state.data.emergencyFund || {}).currentSaved) || 0;
    var fresh = {
      currentSaved: 0,
      targetMonthsCoverage: defaultFundMonths(),
      monthlyContributionTarget: 0,
      history: [],
    };
    registrarOperacionFondo(fresh, 'reset', previous);
    root.FinApp.state.data.emergencyFund = fresh;
    triggerPersist();
    return true;
  }

  // Caso de uso: Consultar progreso de metas
  function consultarProgresoMetas(goals) {
    goals = goals || [];
    var totalTarget = 0;
    var totalSaved = 0;
    var completedCount = 0;
    var list = [];

    for (var i = 0; i < goals.length; i++) {
      var g = goals[i];
      var target = Number(g.targetAmount) || 0;
      var saved = Number(g.currentAmount) || 0;
      var missing = Math.max(0, target - saved);
      var pct = target > 0 ? (saved / target) * 100 : 0;
      var status = g.status || 'active';

      if (saved >= target && target > 0) {
        status = 'completed';
        completedCount++;
      } else {
        totalTarget += target;
        totalSaved += saved;
      }

      list.push({
        id: g.id,
        name: g.name,
        targetAmount: target,
        currentAmount: saved,
        missingAmount: missing,
        progressPercent: Math.min(100, pct),
        deadline: g.deadline,
        status: status,
      });
    }

    var globalPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

    return {
      totalTarget: totalTarget,
      totalSaved: totalSaved,
      globalProgressPercent: Math.min(100, globalPct),
      completedCount: completedCount,
      activeCount: goals.length - completedCount,
      list: list,
    };
  }

  // Caso de uso: Consultar progreso de fondo de emergencia
  // La base son los gastos esenciales mensuales de referencia (no depende del mes que se este viendo)
  function consultarProgresoFondo(emergencyFund) {
    emergencyFund = emergencyFund || { currentSaved: 0 };
    var targetMonths = emergencyFund.targetMonthsCoverage || defaultFundMonths();
    var currentSaved = Number(emergencyFund.currentSaved) || 0;
    var monthlyTarget = Number(emergencyFund.monthlyContributionTarget) || 0;
    var data = root.FinApp && root.FinApp.state ? root.FinApp.state.data : null;
    var Invest = typeof window !== 'undefined' ? window.FinInvest : null;

    var monthly = 0;
    var baseSource = '';
    if (data && Invest) {
      monthly = Invest.essentialBaseline(data, Fmt.getCurrentDateISO());
      if (monthly > 0) baseSource = 'Gastos esenciales registrados';
    }

    // Sin gastos registrados se usan los limites esenciales del presupuesto del mes
    if (monthly <= 0 && data && Cat) {
      var curMonth = Fmt.getCurrentMonthKey();
      var budget = (data.budgets || []).filter(function (b) { return b.month === curMonth; })[0];
      if (budget && budget.categoryLimits) {
        budget.categoryLimits.forEach(function (lim) {
          var c = Cat.getCategoryById(data.categories || [], lim.categoryId);
          if (c && c.isEssential) monthly += Number(lim.allocatedAmount) || 0;
        });
        if (monthly > 0) baseSource = 'Presupuesto de gastos esenciales';
      }
    }

    var known = monthly > 0;
    var targetAmount = known ? monthly * targetMonths : 0;
    var missingAmount = known ? Math.max(0, targetAmount - currentSaved) : 0;
    var coverage = known ? currentSaved / monthly : 0;
    var progressPercent = known && targetAmount > 0 ? Math.min(100, (currentSaved / targetAmount) * 100) : 0;

    var status = 'en_construccion';
    var statusLabel = 'En construcción';
    if (!known) {
      status = 'sin_base';
      statusLabel = 'Falta calcular la meta';
    } else if (coverage >= targetMonths) {
      status = 'optimo';
      statusLabel = 'Fondo completo';
    } else if (coverage < 1) {
      status = 'critico';
      statusLabel = 'Aún muy bajo';
    }

    return {
      known: known,
      currentSaved: currentSaved,
      effectiveMonthlyEssential: monthly,
      baseSource: baseSource,
      targetMonths: targetMonths,
      targetAmount: targetAmount,
      missingAmount: missingAmount,
      coverageMonthsActual: coverage,
      monthlyContributionTarget: monthlyTarget,
      monthsToGo: monthlyTarget > 0 && missingAmount > 0 ? Math.ceil(missingAmount / monthlyTarget) : null,
      progressPercent: progressPercent,
      status: status,
      statusLabel: statusLabel,
    };
  }

  // Render de Presupuesto
  function renderBudget(derived) {
    var budget = derived.currentBudget;
    var expenseCategories = root.FinApp.state.data.categories.filter(function (c) {
      return c.type === 'expense';
    });

    var limitsMap = {};
    if (budget && budget.categoryLimits) {
      budget.categoryLimits.forEach(function (l) {
        limitsMap[l.categoryId] = Number(l.allocatedAmount) || 0;
      });
    }

    var spentMap = {};
    derived.currentMonthTxs.forEach(function (tx) {
      if (tx.type === 'expense') {
        spentMap[tx.categoryId] = (spentMap[tx.categoryId] || 0) + Number(tx.amount);
      }
    });

    var totalAllocated = expenseCategories.reduce(function (sum, c) {
      return sum + (limitsMap[c.id] || 0);
    }, 0);

    var expectedIncome = budget ? (Number(budget.expectedIncome) || 0) : derived.summary.totalIncome;
    var targetSavings = budget ? (Number(budget.targetSavings) || 0) : 0;
    var margin = expectedIncome - targetSavings - totalAllocated;

    var use503020 = budget ? budget.use503020Rule : true;
    var params = window.FinStorage ? window.FinStorage.getSystemParams() : { rule50: 50, rule30: 30, rule20: 20 };

    var recEssentials = expectedIncome * (params.rule50 / 100);
    var recNonEssentials = expectedIncome * (params.rule30 / 100);
    var recSavings = expectedIncome * (params.rule20 / 100);

    var html = '';

    // Encabezado
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">';
    html += '    <div>';
    html += '      <h1 class="surface-title" style="font-size:1.25rem;">Presupuesto Mensual: ' + root.FinApp.state.selectedMonth + '</h1>';
    html += '      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Planifica tus techos de gasto por categoría y monitorea su cumplimiento real.</p>';
    html += '    </div>';
    html += '    <div>';
    html += '      <button class="btn-primary" id="btn-save-budget">Guardar Presupuesto</button>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Panel Superior: Parametros de Planificacion
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem;">';

    // Tarjeta Ingresos y Ahorro
    html += '  <div class="surface-card">';
    html += '    <h2 class="surface-title" style="font-size:0.95rem;margin-bottom:1rem;">Marco Financiero Base</h2>';
    html += '    <div class="form-grid-2">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Ingreso Esperado (COP) *</label>';
    html += '        <input type="text" id="budget-expected-income" class="form-control font-mono" placeholder="Monto" value="' + (expectedIncome ? Fmt.formatThousands(expectedIncome) : '') + '">';
    html += '      </div>';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Meta de Ahorro del Mes (COP)</label>';
    html += '        <input type="text" id="budget-target-savings" class="form-control font-mono" placeholder="Monto" value="' + (targetSavings ? Fmt.formatThousands(targetSavings) : '') + '">';
    html += '      </div>';
    html += '    </div>';

    html += '    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);margin-top:0.5rem;">';
    html += '      <div>';
    html += '        <div style="font-size:0.8rem;color:var(--text-secondary);">Total Asignado a Gastos: <strong id="budget-total-allocated" class="font-mono">' + Fmt.formatCOP(totalAllocated) + '</strong></div>';
    html += '        <div style="font-size:0.8rem;margin-top:0.2rem;">Margen Disponible: <strong id="budget-margin-display" class="font-mono" style="color:' + (margin >= 0 ? 'var(--color-income)' : 'var(--color-expense)') + ';">' + Fmt.formatCOP(margin) + '</strong></div>';
    html += '      </div>';
    html += '      <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;cursor:pointer;">';
    html += '        <input type="checkbox" id="budget-toggle-503020" ' + (use503020 ? 'checked' : '') + '>';
    html += '        <span>Guia 50/30/20</span>';
    html += '      </label>';
    html += '    </div>';
    html += '  </div>';

    // Tarjeta Guia 50/30/20
    html += '  <div class="surface-card">';
    html += '    <h2 class="surface-title" style="font-size:0.95rem;margin-bottom:0.75rem;">Distribución Recomendada (Regla ' + params.rule50 + '/' + params.rule30 + '/' + params.rule20 + ')</h2>';
    html += '    <p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;">Modelo proporcional teórico calculado sobre el ingreso proyectado.</p>';
    html += '    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:0.75rem;">';
    html += '      <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
    html += '        <div style="font-size:0.75rem;color:var(--text-secondary);">Necesidades (' + params.rule50 + '%)</div>';
    html += '        <div class="font-mono" style="font-size:0.95rem;font-weight:700;color:var(--color-brand);margin-top:0.25rem;">' + Fmt.formatCOP(recEssentials) + '</div>';
    html += '      </div>';
    html += '      <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
    html += '        <div style="font-size:0.75rem;color:var(--text-secondary);">Deseos (' + params.rule30 + '%)</div>';
    html += '        <div class="font-mono" style="font-size:0.95rem;font-weight:700;color:var(--color-warning);margin-top:0.25rem;">' + Fmt.formatCOP(recNonEssentials) + '</div>';
    html += '      </div>';
    html += '      <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
    html += '        <div style="font-size:0.75rem;color:var(--text-secondary);">Ahorro (' + params.rule20 + '%)</div>';
    html += '        <div class="font-mono" style="font-size:0.95rem;font-weight:700;color:var(--color-income);margin-top:0.25rem;">' + Fmt.formatCOP(recSavings) + '</div>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    html += '</div>';

    // Tabla de Asignacion por Categoria
    html += '<div class="surface-card">';
    html += '  <div class="surface-header">';
    html += '    <h2 class="surface-title">Limites de Gasto por Categoría</h2>';
    html += '  </div>';

    html += '  <div class="fin-table-wrapper">';
    html += '    <table class="fin-table">';
    html += '      <thead>';
    html += '        <tr>';
    html += '          <th>Categoría</th>';
    html += '          <th>Clase</th>';
    html += '          <th style="width:200px;">Limite Presupuestado (COP)</th>';
    html += '          <th style="text-align:right;">Gasto Real del Mes</th>';
    html += '          <th style="width:160px;">Ejecución</th>';
    html += '          <th style="text-align:right;">Margen</th>';
    html += '        </tr>';
    html += '      </thead>';
    html += '      <tbody>';

    expenseCategories.forEach(function (cat) {
      var allocated = limitsMap[cat.id] || 0;
      var spent = spentMap[cat.id] || 0;
      var pct = allocated > 0 ? (spent / allocated) * 100 : 0;
      var catMargin = allocated - spent;
      var isOver = allocated > 0 && spent > allocated;

      html += '        <tr>';
      html += '          <td>';
      html += '            <span class="category-tag" style="background:' + cat.color + '1a;color:' + cat.color + ';">' + cat.name + '</span>';
      html += '          </td>';
      html += '          <td style="font-size:0.75rem;color:var(--text-secondary);">' + (cat.isEssential ? 'Esencial' : 'No esencial') + '</td>';
      html += '          <td>';
      html += '            <input type="text" class="form-control font-mono budget-limit-input" data-cat-id="' + cat.id + '" placeholder="Monto" value="' + (allocated ? Fmt.formatThousands(allocated) : '') + '" style="padding:0.35rem 0.6rem;font-size:0.85rem;">';
      html += '          </td>';
      html += '          <td class="font-mono" style="text-align:right;font-weight:600;">' + Fmt.formatCOP(spent) + '</td>';
      html += '          <td>';
      html += '            <div style="display:flex;align-items:center;gap:0.4rem;">';
      html += '              <div class="goal-track" style="flex:1;height:5px;background:var(--border-subtle);border-radius:var(--radius-full);overflow:hidden;">';
      html += '                <div class="goal-fill" style="width:' + Math.min(100, pct) + '%;height:100%;background:' + (isOver ? 'var(--color-expense)' : 'var(--color-brand)') + ';"></div>';
      html += '              </div>';
      html += '              <span class="font-mono" style="font-size:0.75rem;width:40px;text-align:right;' + (isOver ? 'color:var(--color-expense);font-weight:700;' : '') + '">' + pct.toFixed(0) + '%</span>';
      html += '            </div>';
      html += '          </td>';
      html += '          <td class="font-mono" style="text-align:right;font-weight:700;color:' + (catMargin >= 0 ? 'var(--color-income)' : 'var(--color-expense)') + ';">' + Fmt.formatCOP(catMargin) + '</td>';
      html += '        </tr>';
    });

    html += '      </tbody>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    return html;
  }

  // Render de Metas de Ahorro
  function renderGoals() {
    var goals = root.FinApp.state.data.goals || [];
    var prog = consultarProgresoMetas(goals);

    var html = '';

    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">';
    html += '    <div>';
    html += '      <h1 class="surface-title" style="font-size:1.25rem;">Metas Financieras</h1>';
    html += '      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Fija objetivos de ahorro con fechas limite y haz seguimiento a cada aporte.</p>';
    html += '    </div>';
    html += '    <button class="btn-primary" id="btn-new-goal">+ Nueva Meta</button>';
    html += '  </div>';
    html += '</div>';

    // Resumen consolidado de metas
    html += '<div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:1rem;margin-bottom:1.25rem;">';
    html += '  <div class="surface-card" style="padding:1rem;">';
    html += '    <div style="font-size:0.75rem;color:var(--text-secondary);">Total Objetivo Activo</div>';
    html += '    <div class="font-mono" style="font-size:1.15rem;font-weight:700;color:var(--color-brand);margin-top:0.25rem;">' + Fmt.formatCOP(prog.totalTarget) + '</div>';
    html += '  </div>';
    html += '  <div class="surface-card" style="padding:1rem;">';
    html += '    <div style="font-size:0.75rem;color:var(--text-secondary);">Ahorrado Acumulado</div>';
    html += '    <div class="font-mono" style="font-size:1.15rem;font-weight:700;color:var(--color-income);margin-top:0.25rem;">' + Fmt.formatCOP(prog.totalSaved) + '</div>';
    html += '  </div>';
    html += '  <div class="surface-card" style="padding:1rem;">';
    html += '    <div style="font-size:0.75rem;color:var(--text-secondary);">Avance Consolidado</div>';
    html += '    <div class="font-mono" style="font-size:1.15rem;font-weight:700;margin-top:0.25rem;">' + prog.globalProgressPercent.toFixed(1) + '%</div>';
    html += '  </div>';
    html += '  <div class="surface-card" style="padding:1rem;">';
    html += '    <div style="font-size:0.75rem;color:var(--text-secondary);">Metas Cumplidas</div>';
    html += '    <div class="font-mono" style="font-size:1.15rem;font-weight:700;color:var(--color-income);margin-top:0.25rem;">' + prog.completedCount + ' de ' + goals.length + '</div>';
    html += '  </div>';
    html += '</div>';

    // Lista de Tarjetas de Metas
    if (prog.list.length === 0) {
      html += '<div class="surface-card" style="text-align:center;padding:3rem 1rem;color:var(--text-tertiary);">';
      html += '  <div style="font-size:1rem;margin-bottom:0.5rem;">No tienes metas de ahorro configuradas.</div>';
      html += '  <div style="font-size:0.8rem;margin-bottom:1rem;">Define tu primera meta (ejemplo: matricula, computador, fondo de viaje).</div>';
      html += '  <button class="btn-primary" id="btn-empty-new-goal">+ Crear Primera Meta</button>';
      html += '</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:1.25rem;">';
      prog.list.forEach(function (g) {
        var isDone = g.status === 'completed';
        html += '<div class="surface-card" style="display:flex;flex-direction:column;justify-content:space-between;">';
        html += '  <div>';
        html += '    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">';
        html += '      <h3 style="font-size:1rem;font-weight:700;">' + g.name + '</h3>';
        html += '      <span class="category-tag" style="background:' + (isDone ? 'var(--color-income-light)' : 'var(--color-brand-light)') + ';color:' + (isDone ? 'var(--color-income)' : 'var(--color-brand)') + ';">' + (isDone ? 'Completada' : 'En progreso') + '</span>';
        html += '    </div>';
        if (g.deadline) {
          html += '    <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.75rem;">Fecha objetivo: ' + Fmt.formatDateES(g.deadline) + '</div>';
        }
        html += '    <div class="goal-track" style="height:7px;background:var(--border-subtle);border-radius:var(--radius-full);overflow:hidden;margin-bottom:0.5rem;">';
        html += '      <div class="goal-fill" style="width:' + g.progressPercent + '%;height:100%;background:' + (isDone ? 'var(--color-income)' : 'var(--color-brand)') + ';"></div>';
        html += '    </div>';
        html += '    <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.5rem;">';
        html += '      <span>Ahorrado: <strong class="font-mono">' + Fmt.formatCOP(g.currentAmount) + '</strong></span>';
        html += '      <span>Meta: <strong class="font-mono">' + Fmt.formatCOP(g.targetAmount) + '</strong></span>';
        html += '    </div>';
        if (!isDone) {
          html += '    <div style="font-size:0.75rem;color:var(--text-secondary);">Faltante: ' + Fmt.formatCOP(g.missingAmount) + ' (' + (100 - g.progressPercent).toFixed(0) + '%)</div>';
        }
        html += '  </div>';

        html += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.25rem;padding-top:0.75rem;border-top:1px solid var(--border-subtle);">';
        html += '    <button class="btn-secondary" data-action="contribute-goal" data-id="' + g.id + '" style="padding:0.4rem 0.75rem;font-size:0.8rem;">+ Registrar Aporte</button>';
        html += '    <button class="text-link danger" data-action="delete-goal" data-id="' + g.id + '" style="font-size:0.8rem;">Eliminar</button>';
        html += '  </div>';
        html += '</div>';
      });
      html += '</div>';
    }

    return html;
  }

  // Render del Fondo de Emergencia
  function renderEmergencyFund() {
    var ef = root.FinApp.state.data.emergencyFund || { currentSaved: 0 };
    var prog = consultarProgresoFondo(ef);
    var Invest = window.FinInvest;
    var free = Invest ? Invest.computeCapital(root.FinApp.state.data).free : 0;

    var tone = {
      optimo: ['var(--color-income)', 'var(--color-income-light)'],
      critico: ['var(--color-expense)', 'var(--color-expense-light)'],
      en_construccion: ['var(--color-warning)', 'var(--color-warning-light)'],
      sin_base: ['var(--text-secondary)', 'var(--bg-surface-secondary)'],
    }[prog.status];

    var html = '';

    // Encabezado
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">';
    html += '    <div>';
    html += '      <h1 class="surface-title" style="font-size:1.25rem;">Fondo de emergencia</h1>';
    html += '      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;max-width:560px;line-height:1.45;">Dinero guardado para imprevistos: salud, reparaciones o quedarte sin ingresos. La meta es cubrir ' + prog.targetMonths + ' meses de tus gastos esenciales.</p>';
    html += '    </div>';
    html += '    <button type="button" class="btn-secondary" data-action="fund-reset" style="padding:0.4rem 0.9rem;font-size:0.8rem;">Reestablecer fondo</button>';
    html += '  </div>';
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.25rem;margin-bottom:1.25rem;">';

    // Tu fondo
    html += '  <div class="surface-card">';
    html += '    <div class="surface-header">';
    html += '      <h2 class="surface-title">Tu fondo</h2>';
    html += '      <span class="category-tag" style="background:' + tone[1] + ';color:' + tone[0] + ';">' + prog.statusLabel + '</span>';
    html += '    </div>';
    html += '    <div class="font-mono" style="font-size:1.9rem;font-weight:800;margin:0.25rem 0 0.15rem;">' + Fmt.formatCOP(prog.currentSaved) + '</div>';
    if (prog.known) {
      html += '    <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;">de ' + Fmt.formatCOP(prog.targetAmount) + ' que necesitas</div>';
      html += '    <div class="goal-track" style="height:8px;background:var(--border-subtle);border-radius:var(--radius-full);overflow:hidden;">';
      html += '      <div class="goal-fill" style="width:' + prog.progressPercent.toFixed(1) + '%;height:100%;background:' + tone[0] + ';transition:width 0.4s ease;"></div>';
      html += '    </div>';
      html += '    <p style="font-size:0.85rem;line-height:1.5;margin-top:0.75rem;">Hoy cubre <strong>' + prog.coverageMonthsActual.toFixed(1) + '</strong> de <strong>' + prog.targetMonths + '</strong> meses de tus gastos esenciales.</p>';
      html += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-top:0.75rem;">';
      html += '      <div style="padding:0.65rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);"><div style="font-size:0.72rem;color:var(--text-secondary);">Gastos esenciales al mes</div><div class="font-mono" style="font-weight:700;margin-top:0.15rem;">' + Fmt.formatCOP(prog.effectiveMonthlyEssential) + '</div></div>';
      html += '      <div style="padding:0.65rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);"><div style="font-size:0.72rem;color:var(--text-secondary);">Te faltan</div><div class="font-mono" style="font-weight:700;margin-top:0.15rem;">' + Fmt.formatCOP(prog.missingAmount) + '</div></div>';
      html += '    </div>';
      if (prog.monthsToGo) {
        html += '    <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.75rem;">Con ' + Fmt.formatCOP(prog.monthlyContributionTarget) + ' al mes lo completas en ' + prog.monthsToGo + (prog.monthsToGo === 1 ? ' mes.' : ' meses.') + '</p>';
      }
      if (prog.status === 'critico') {
        html += '    <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.75rem;line-height:1.45;">Primer objetivo: llegar a 1 mes de gastos esenciales (' + Fmt.formatCOP(prog.effectiveMonthlyEssential) + ').</p>';
      }
    } else {
      html += '    <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.5;margin-top:0.75rem;">Para calcular cuánto necesitas, registra tus gastos esenciales (arriendo, mercado, transporte, servicios) en Movimientos. Mientras tanto ya puedes ir guardando dinero.</p>';
    }
    html += '  </div>';

    // Agregar o retirar
    html += '  <div class="surface-card">';
    html += '    <h2 class="surface-title" style="margin-bottom:0.75rem;">Agregar o retirar dinero</h2>';
    html += '    <form id="form-fund-contribution">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Monto (COP)</label>';
    html += '        <input type="text" id="fund-contrib-input" class="form-control font-mono" placeholder="Monto" style="font-size:1.1rem;font-weight:700;">';
    html += '      </div>';
    html += '      <div style="display:flex;gap:0.6rem;">';
    html += '        <button type="submit" class="btn-primary" style="flex:1;justify-content:center;">Agregar al fondo</button>';
    html += '        <button type="button" class="btn-secondary" data-action="fund-withdraw" style="flex:1;justify-content:center;">Retirar del fondo</button>';
    html += '      </div>';
    html += '    </form>';
    html += '    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.5;margin-top:0.85rem;">Agregar pasa dinero de tu capital libre al fondo. Retirar lo devuelve a tu capital libre. Úsalo solo para emergencias reales.</p>';
    html += '    <p style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.4rem;">Capital libre ahora: <strong class="font-mono">' + Fmt.formatCOP(free) + '</strong></p>';
    html += '  </div>';
    html += '</div>';

    // Historial
    var hist = ef.history || [];
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <h2 class="surface-title" style="margin-bottom:0.75rem;">Últimas operaciones del fondo</h2>';
    if (!hist.length) {
      html += '  <p style="font-size:0.85rem;color:var(--text-secondary);">Aún no has agregado ni retirado dinero.</p>';
    } else {
      var names = { add: 'Agregaste al fondo', withdraw: 'Retiraste del fondo', reset: 'Reestablecimiento del fondo' };
      html += '  <div class="fin-table-wrapper"><table class="fin-table"><tbody>';
      hist.slice(0, 8).forEach(function (h) {
        var sign = h.type === 'add' ? '+' : (h.type === 'withdraw' ? '-' : '');
        var color = h.type === 'add' ? 'var(--color-income)' : (h.type === 'withdraw' ? 'var(--color-expense)' : 'var(--text-secondary)');
        html += '<tr><td style="font-size:0.8rem;color:var(--text-secondary);">' + Fmt.formatDateES(h.date) + '</td><td>' + (names[h.type] || '') + (h.type === 'reset' ? ' (había ' + Fmt.formatCOP(h.amount) + ')' : '') + '</td><td class="font-mono" style="text-align:right;font-weight:700;color:' + color + ';">' + (h.type === 'reset' ? '' : sign + ' ' + Fmt.formatCOP(h.amount)) + '</td></tr>';
      });
      html += '  </tbody></table></div>';
    }
    html += '</div>';

    // Meta
    html += '<div class="surface-card">';
    html += '  <h2 class="surface-title" style="margin-bottom:0.3rem;">Ajustar mi meta</h2>';
    html += '  <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;">Meta actual: ' + prog.targetMonths + (prog.targetMonths === 1 ? ' mes' : ' meses') + ' de gastos esenciales' + (prog.monthlyContributionTarget ? ' · aporte planeado de ' + Fmt.formatCOP(prog.monthlyContributionTarget) + ' al mes.' : '.') + ' Deja un campo vacío para no cambiarlo.</p>';
    html += '  <form id="form-fund-config" style="display:grid;grid-template-columns:1fr 1fr auto;gap:1rem;align-items:flex-end;">';
    html += '    <div class="form-group" style="margin:0;">';
    html += '      <label class="form-label">Meses de gastos que quieres cubrir</label>';
    html += '      <input type="number" id="fund-target-months" class="form-control" min="1" max="24" placeholder="Meses">';
    html += '    </div>';
    html += '    <div class="form-group" style="margin:0;">';
    html += '      <label class="form-label">Cuánto piensas aportar al mes (opcional)</label>';
    html += '      <input type="text" id="fund-target-contrib" class="form-control font-mono" placeholder="Monto">';
    html += '    </div>';
    html += '    <button type="submit" class="btn-secondary" style="height:38px;">Guardar meta</button>';
    html += '  </form>';
    html += '</div>';

    return html;
  }

  root.FinApp.planificacion = {
    guardarPresupuesto: guardarPresupuesto,
    crearMeta: crearMeta,
    eliminarMeta: eliminarMeta,
    abonarMeta: abonarMeta,
    configurarFondo: configurarFondo,
    abonarFondo: abonarFondo,
    retirarFondo: retirarFondo,
    reiniciarFondo: reiniciarFondo,
    consultarProgresoMetas: consultarProgresoMetas,
    consultarProgresoFondo: consultarProgresoFondo,
    renderBudget: renderBudget,
    renderGoals: renderGoals,
    renderEmergencyFund: renderEmergencyFund,
  };
})(typeof window !== 'undefined' ? window : this);

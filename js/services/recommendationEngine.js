/* Motor de recomendaciones: reglas de educación financiera y reacciones a cada acción del usuario. */

(function (root, factory) {
  var instance = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = instance;
  }
  if (typeof root !== 'undefined') {
    root.FinRecommendations = instance;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var DEFAULT_PARAMS = {
    rule50: 50,
    rule30: 30,
    rule20: 20,
    emergencyFundMonths: 3,
    dtiWarningThreshold: 0.2,
    dtiAlertThreshold: 0.35,
    savingsWarningThreshold: 0.1,
  };
  var Invest =
    (typeof window !== 'undefined' && window.FinInvest) ||
    (typeof require === 'function' ? (function () { try { return require('./investmentEngine.js'); } catch (e) { return null; } })() : null);
  var SMALL_PURCHASE = 20000; // compra pequeña (gasto hormiga)
  var RECENT_DAYS = 14; // cuántos días se muestra un logro

  // ---------- Utilidades ----------

  function getParams() {
    if (typeof window !== 'undefined' && window.FinStorage && window.FinStorage.getSystemParams) {
      return window.FinStorage.getSystemParams();
    }
    return DEFAULT_PARAMS;
  }

  function money(value) {
    var F = typeof window !== 'undefined' ? window.FinFormatters : null;
    return F && F.formatCOP ? F.formatCOP(value) : '$ ' + Math.round(value);
  }

  function pct(value) {
    return Math.round(value * 100) + '%';
  }

  function safeDiv(n, d) {
    return d ? n / d : 0;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function parseISO(text) {
    var p = String(text || '').split('-');
    if (p.length < 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function todayISO() {
    var n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }

  function previousMonthKey(key) {
    var p = key.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 2, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  function isRecent(dateText, today) {
    var d = parseISO(dateText);
    var t = parseISO(today);
    if (!d || !t) return false;
    var days = (t - d) / 86400000;
    return days >= 0 && days <= RECENT_DAYS;
  }

  // ---------- Análisis del periodo ----------

  // Suma ingresos y gastos separados según la regla 50/30/20
  function sumTxs(txs, catMap) {
    var s = { income: 0, expenses: 0, essential: 0, wants: 0, saveDebt: 0, byCat: {}, small: [] };
    txs.forEach(function (tx) {
      var amount = Number(tx.amount) || 0;
      if (tx.type === 'income') {
        s.income += amount;
        return;
      }
      if (tx.type !== 'expense') return;
      s.expenses += amount;
      s.byCat[tx.categoryId] = (s.byCat[tx.categoryId] || 0) + amount;
      var cat = catMap[tx.categoryId];
      if (cat && cat.group === 'savings_debt') {
        s.saveDebt += amount;
      } else if (cat && cat.isEssential) {
        s.essential += amount;
      } else {
        s.wants += amount;
        if (amount <= SMALL_PURCHASE) s.small.push(amount);
      }
    });
    return s;
  }

  // Cuánto debe ahorrar al mes una meta para llegar a tiempo
  function goalPlan(goal, m) {
    var target = Number(goal.targetAmount) || 0;
    var current = Number(goal.currentAmount) || 0;
    var remaining = Math.max(0, target - current);
    var plan = {
      goal: goal,
      name: goal.name || 'Meta',
      remaining: remaining,
      progress: target > 0 ? current / target : 0,
      hasDeadline: false,
      overdue: false,
      months: null,
      required: null,
      share: null,
    };
    var deadline = parseISO(goal.deadline);
    if (deadline && m.todayDate) {
      plan.hasDeadline = true;
      plan.overdue = remaining > 0 && deadline < m.todayDate;
      plan.months = Math.max(1, Math.ceil((deadline - m.todayDate) / (86400000 * 30.4375)));
      plan.required = remaining > 0 ? remaining / plan.months : 0;
      plan.share = m.income > 0 ? plan.required / m.income : null;
    }
    return plan;
  }

  // Reúne los datos que necesitan las reglas
  function analyze(data, monthKey, today) {
    data = data || {};
    today = today || todayISO();
    var params = getParams();
    var catMap = {};
    (data.categories || []).forEach(function (c) {
      catMap[c.id] = c;
    });

    var all = data.transactions || [];
    function monthTxs(key) {
      return all.filter(function (t) {
        return String(t.date || '').slice(0, 7) === key;
      });
    }

    var s = sumTxs(monthTxs(monthKey), catMap);
    var prevKey = previousMonthKey(monthKey);
    var prev = sumTxs(monthTxs(prevKey), catMap);

    // Gasto esencial de referencia: promedio de los 3 meses anteriores
    var essSum = 0;
    var essCount = 0;
    var key = prevKey;
    for (var i = 0; i < 3; i++) {
      var ps = i === 0 ? prev : sumTxs(monthTxs(key), catMap);
      if (ps.essential > 0) {
        essSum += ps.essential;
        essCount++;
      }
      key = previousMonthKey(key);
    }

    var m = {
      params: params,
      today: today,
      todayDate: parseISO(today),
      monthKey: monthKey,
      catMap: catMap,
      allTxs: all,
      income: s.income,
      expenses: s.expenses,
      essential: s.essential,
      wants: s.wants,
      byCat: s.byCat,
      prevByCat: prev.byCat,
      small: s.small,
    };
    m.net = m.income - m.expenses;
    m.savingsRate = m.income > 0 ? m.net / m.income : 0;
    m.needsPct = safeDiv(m.essential, m.income);
    m.wantsPct = safeDiv(m.wants, m.income);

    var mp = monthKey.split('-');
    m.isCurrentMonth = String(today).slice(0, 7) === monthKey;
    m.daysInMonth = new Date(Number(mp[0]), Number(mp[1]), 0).getDate();
    m.day = m.isCurrentMonth && m.todayDate ? m.todayDate.getDate() : m.daysInMonth;
    m.daysLeft = m.daysInMonth - m.day;

    m.budget =
      (data.budgets || []).filter(function (b) {
        return b.month === monthKey;
      })[0] || null;

    m.baselineEssential = Math.max(m.essential, essCount ? essSum / essCount : 0);
    m.fund = data.emergencyFund || {};
    m.fundSaved = Number(m.fund.currentSaved) || 0;
    m.fundTarget = m.fund.targetMonthsCoverage || params.emergencyFundMonths;
    m.fundCoverage = m.baselineEssential > 0 ? m.fundSaved / m.baselineEssential : null;

    m.debts = data.debts || [];
    m.activeDebts = m.debts.filter(function (d) {
      return d.status === 'active';
    });
    m.totalMin = m.activeDebts.reduce(function (sum, d) {
      return sum + (Number(d.minimumMonthlyPayment) || 0);
    }, 0);
    m.dti = m.income > 0 ? m.totalMin / m.income : null;

    m.goals = data.goals || [];
    m.activeGoals = m.goals.filter(function (g) {
      return g.status === 'active';
    });
    m.goalPlans = m.activeGoals.map(function (g) {
      return goalPlan(g, m);
    });
    return m;
  }

  // El pago de una cuota crea un gasto "Cuota de deuda: nombre"
  function paidThisMonth(debt, m) {
    return m.allTxs.some(function (t) {
      return (
        t.type === 'expense' &&
        String(t.date || '').slice(0, 7) === m.monthKey &&
        String(t.description || '').indexOf('Cuota de deuda: ' + debt.name) === 0
      );
    });
  }

  // Elige qué deuda atacar primero y explica por qué
  function debtFocus(m) {
    var list = m.activeDebts.slice();
    var withRate = list.filter(function (d) {
      return Number(d.annualInterestRate) > 0;
    });
    if (withRate.length) {
      withRate.sort(function (a, b) {
        return b.annualInterestRate - a.annualInterestRate;
      });
      return { debt: withRate[0], why: 'tiene la tasa de interés más alta (método avalancha)' };
    }
    var cards = list.filter(function (d) {
      return d.type === 'tarjeta';
    });
    if (cards.length) {
      return { debt: cards[0], why: 'las tarjetas de crédito suelen cobrar la tasa más alta' };
    }
    list.sort(function (a, b) {
      return (Number(a.remainingAmount) || 0) - (Number(b.remainingAmount) || 0);
    });
    return { debt: list[0], why: 'es la de menor saldo y se termina más rápido (método bola de nieve)' };
  }

  // ---------- Recomendaciones ----------

  function evaluateRecommendations(data, monthKey, today) {
    var m = analyze(data, monthKey, today);
    var p = m.params;
    var recs = [];
    var order = 0;

    function add(id, kind, severity, situation, justification, explanation, action, module, concept) {
      recs.push({
        id: id,
        kind: kind, // alerta | consejo | logro
        severity: severity, // high | medium | low
        situation: situation,
        justification: justification,
        explanation: explanation,
        suggestedAction: action,
        relatedModule: module,
        concept: concept,
        order: order++,
      });
    }

    function catName(id) {
      return m.catMap[id] ? m.catMap[id].name : 'esta categoría';
    }

    // Primer uso: orientación básica
    if (!m.allTxs.length && !m.goals.length && !m.debts.length) {
      add('rec-edu-income', 'consejo', 'high', 'Registra tu primer ingreso',
        'Aún no hay movimientos. Para empezar, anota lo que entra: mesada, sueldo, beca o ventas.',
        'Todo plan financiero parte de saber cuánto dinero entra cada mes; sin eso no se puede presupuestar ni ahorrar.',
        'Ve a Movimientos y haz clic en "+ Ingreso" para registrar tu primer ingreso.',
        'transactions', 'Flujo de caja');
      add('rec-edu-budget', 'consejo', 'medium', 'Aprende la regla 50/30/20',
        'Una guía sencilla: ' + p.rule50 + '% para necesidades, ' + p.rule30 + '% para gustos y ' + p.rule20 + '% para ahorro o deudas.',
        'Tener topes de gasto antes de gastar evita las compras impulsivas y asegura que siempre ahorres algo.',
        'Entra a Presupuesto y define tus límites por categoría con estos porcentajes.',
        'budget', 'Regla 50/30/20');
      add('rec-edu-fund', 'consejo', 'medium', 'Empieza tu fondo de emergencia',
        'Se recomienda reunir entre 3 y 6 meses de gastos esenciales, empezando por 1 mes.',
        'El fondo evita que un imprevisto (salud, reparaciones, perder un ingreso) termine en una deuda cara.',
        'Visita Fondo de emergencia y programa un aporte mensual pequeño para empezar.',
        'emergency_fund', 'Fondo de emergencia');
      add('rec-edu-goals', 'consejo', 'low', 'Ponle nombre, monto y fecha a tu ahorro',
        'Un ahorro sin objetivo claro se gasta fácil.',
        'Las metas específicas, medibles y con fecha límite (método SMART) se cumplen con más frecuencia.',
        'Crea tu primera meta en Metas de ahorro (por ejemplo: matrícula, computador o viaje).',
        'goals', 'Metas SMART');
      return finish(recs);
    }

    // Flujo del mes
    if (m.income === 0 && m.expenses > 0) {
      add('rec-no-income', 'alerta', 'high', 'Tienes gastos pero ningún ingreso registrado este mes',
        'Llevas ' + money(m.expenses) + ' en gastos y $0 en ingresos en este periodo.',
        'Sin registrar lo que entra, el balance y los indicadores no reflejan tu realidad.',
        'Registra tus ingresos del mes (mesada, sueldo, beca o ventas) en Movimientos.',
        'transactions', 'Flujo de caja');
    }

    if (m.income > 0 && m.expenses > m.income) {
      add('rec-deficit', 'alerta', 'high', 'Estás gastando más de lo que ingresa',
        'Tus gastos (' + money(m.expenses) + ') superan tus ingresos (' + money(m.income) + ') por ' + money(m.expenses - m.income) + '.',
        'Un flujo negativo obliga a usar ahorros o a endeudarte para cerrar el mes.',
        'Revisa los gastos de gustos y recorta al menos ' + money(m.expenses - m.income) + ' antes de que termine el mes.',
        'transactions', 'Flujo de caja positivo');
    } else if (m.isCurrentMonth && m.day >= 5 && m.daysLeft > 0 && m.income > 0) {
      var projected = (m.expenses / m.day) * m.daysInMonth;
      if (projected > m.income) {
        var left = m.income - m.expenses;
        add('rec-pace', 'alerta', 'medium', 'A este ritmo cerrarías el mes en déficit',
          'Llevas ' + money(m.expenses) + ' gastados en ' + m.day + ' días. Si sigues igual, terminarías en ' + money(projected) + ', por encima de tus ingresos (' + money(m.income) + ').',
          'Mirar el gasto en proyección permite corregir mientras aún queda mes, no después.',
          'Procura gastar máximo ' + money(left / m.daysLeft) + ' por día: te quedan ' + money(left) + ' para ' + m.daysLeft + ' días.',
          'transactions', 'Presupuesto diario');
      }
    }

    // Regla 50/30/20 aplicada a lo que realmente gasta
    if (m.income > 0 && m.needsPct > p.rule50 / 100) {
      var needsHigh = m.needsPct > 0.65;
      add('rec-needs-high', needsHigh ? 'alerta' : 'consejo', needsHigh ? 'medium' : 'low',
        'Tus necesidades superan el ' + p.rule50 + '% de tus ingresos',
        'Tus gastos esenciales (transporte, comida, vivienda, salud, estudio) suman ' + money(m.essential) + ': ' + pct(m.needsPct) + ' de tus ingresos (guía: ' + p.rule50 + '%).',
        'Cuando lo básico consume más de la mitad, queda poco para ahorrar o pagar deudas. A veces es temporal, pero conviene saberlo.',
        'Mira si algún gasto esencial puede bajar (transporte, alimentación) o si puedes aumentar tus ingresos.',
        'budget', 'Regla 50/30/20');
    }
    if (m.income > 0 && m.wantsPct > p.rule30 / 100) {
      add('rec-wants-high', 'alerta', 'medium', 'Tus gustos superan el ' + p.rule30 + '% de tus ingresos',
        'Gastas ' + money(m.wants) + ' en ocio, ropa, suscripciones y hobbies: ' + pct(m.wantsPct) + ' de tus ingresos (guía: ' + p.rule30 + '%).',
        'Los gastos de gustos son los más fáciles de ajustar y liberan dinero para ahorrar sin tocar lo básico.',
        'Identifica las 2 categorías de gustos con más gasto y ponles un tope en Presupuesto.',
        'budget', 'Regla 50/30/20');
    }

    // Gastos hormiga
    var smallTotal = m.small.reduce(function (a, b) { return a + b; }, 0);
    if (m.income > 0 && m.small.length >= 5 && smallTotal >= m.income * 0.04) {
      add('rec-ants', 'consejo', smallTotal >= m.income * 0.08 ? 'medium' : 'low', 'Tus compras pequeñas se están acumulando',
        'Tienes ' + m.small.length + ' compras de gustos de ' + money(SMALL_PURCHASE) + ' o menos que suman ' + money(smallTotal) + ' (' + pct(smallTotal / m.income) + ' de tus ingresos).',
        'Los llamados gastos hormiga pasan desapercibidos uno a uno, pero sumados pesan como un gasto grande.',
        'Elige una o dos de esas compras para reducir y envía lo ahorrado a tu fondo o a una meta.',
        'transactions', 'Gastos hormiga');
    }

    // Categoría que más creció frente al mes anterior
    var growth = null;
    Object.keys(m.byCat).forEach(function (id) {
      var cat = m.catMap[id];
      if (cat && cat.group === 'savings_debt') return;
      var cur = m.byCat[id];
      var before = m.prevByCat[id] || 0;
      if (m.income > 0 && before > 0 && cur >= before * 1.3 && cur - before >= m.income * 0.03) {
        if (!growth || cur - before > growth.cur - growth.before) growth = { id: id, cur: cur, before: before };
      }
    });
    if (growth) {
      add('rec-cat-growth', 'consejo', 'low', 'Subió tu gasto en ' + catName(growth.id),
        'Este mes llevas ' + money(growth.cur) + ' frente a ' + money(growth.before) + ' del mes pasado (+' + pct((growth.cur - growth.before) / growth.before) + ').',
        'Detectar a tiempo qué categoría crece evita que un gasto ocasional se vuelva costumbre.',
        'Revisa los movimientos de ' + catName(growth.id) + ' y decide cuáles repetirías y cuáles no.',
        'transactions', 'Seguimiento de gastos');
    }

    // Presupuesto
    if (m.budget && m.budget.categoryLimits) {
      m.budget.categoryLimits.forEach(function (limit) {
        var allocated = Number(limit.allocatedAmount) || 0;
        var spent = m.byCat[limit.categoryId] || 0;
        if (allocated <= 0) return;
        var ratio = spent / allocated;
        var name = catName(limit.categoryId);
        if (ratio > 1) {
          add('rec-budget-over-' + limit.categoryId, 'alerta', ratio > 1.2 ? 'high' : 'medium', 'Superaste el límite de ' + name,
            'Gastaste ' + money(spent) + ' de ' + money(allocated) + ' (+' + pct(ratio - 1) + ').',
            'Pasarte del tope en una categoría se compensa recortando en otra o gastando parte de tu ahorro.',
            'Modera este gasto lo que resta del mes o mueve saldo desde una categoría con margen.',
            'budget', 'Presupuesto');
        } else if (ratio >= 0.8) {
          add('rec-budget-near-' + limit.categoryId, 'alerta', 'low', 'Estás cerca del límite en ' + name,
            'Llevas ' + money(spent) + ' de ' + money(allocated) + ' (' + pct(ratio) + ' del límite)' + (m.isCurrentMonth && m.daysLeft > 0 ? ' y aún faltan ' + m.daysLeft + ' días del mes.' : '.'),
            'Avisar antes de pasarte es más útil que lamentarlo después.',
            'Te quedan ' + money(allocated - spent) + ' para esta categoría: úsalos con cuidado.',
            'budget', 'Presupuesto');
        }
      });
    } else if (m.income > 0 && !m.budget) {
      add('rec-edu-need-budget', 'consejo', 'medium', 'Crea el presupuesto de este mes',
        'Ya registraste ingresos (' + money(m.income) + ') pero no has puesto topes de gasto por categoría.',
        'Sin presupuesto es fácil gastar de más sin darte cuenta y quedarte sin margen para ahorrar.',
        'Entra a Presupuesto y define límites por categoría usando la guía ' + p.rule50 + '/' + p.rule30 + '/' + p.rule20 + '.',
        'budget', 'Presupuesto');
    }

    // Metas de ahorro
    var requiredTotal = 0;
    m.goalPlans.forEach(function (plan) {
      var id = plan.goal.id;
      if (plan.overdue) {
        add('rec-goal-overdue-' + id, 'alerta', 'high', 'Venció la fecha de "' + plan.name + '"',
          'Faltan ' + money(plan.remaining) + ' y la fecha límite era ' + plan.goal.deadline + '.',
          'Una meta vencida desmotiva; es mejor replantearla con una fecha realista que abandonarla.',
          'Abona lo que puedas ahora o crea una meta nueva con un plazo más largo.',
          'goals', 'Metas SMART');
        return;
      }
      if (plan.required !== null && plan.required > 0) {
        requiredTotal += plan.required;
        var capacity = Math.max(0, m.net);
        var planned = (m.income * p.rule20) / 100;
        if (m.income > 0 && plan.required > capacity) {
          var feasible = plan.required <= planned;
          add('rec-goal-risk-' + id, feasible ? 'consejo' : 'alerta', feasible ? 'low' : 'medium',
            'Tu meta "' + plan.name + '" exige ahorrar más de lo que hoy te sobra',
            'Para llegar a tiempo necesitas ' + money(plan.required) + ' al mes durante ' + plan.months + ' meses (' + pct(plan.share) + ' de tus ingresos) y este mes te sobran ' + money(capacity) + '.',
            'Una meta es realista cuando su cuota mensual cabe en tu capacidad de ahorro.',
            feasible
              ? 'Si apartas el ' + p.rule20 + '% de tus ingresos (' + money(planned) + ') apenas los recibas, la cumples a tiempo.'
              : 'Crea la meta con una fecha más lejana o un monto menor para que la cuota mensual sea alcanzable.',
            'goals', 'Metas SMART');
        }
      }
      if (plan.progress >= 0.9 && plan.progress < 1) {
        add('rec-goal-near-' + id, 'consejo', 'low', 'Estás a punto de lograr "' + plan.name + '"',
          'Llevas ' + pct(plan.progress) + ' y solo faltan ' + money(plan.remaining) + '.',
          'Cerrar una meta refuerza el hábito de ahorrar y libera dinero para la siguiente.',
          'Haz un último abono para completarla este mes.',
          'goals', 'Refuerzo del hábito de ahorro');
      }
    });
    if (m.goalPlans.length >= 2 && m.income > 0 && requiredTotal > m.income * 0.3) {
      add('rec-goals-load', 'alerta', 'medium', 'Tus metas juntas exigen demasiado ahorro mensual',
        'Sumadas requieren ' + money(requiredTotal) + ' al mes (' + pct(requiredTotal / m.income) + ' de tus ingresos).',
        'Querer lograr todo a la vez suele terminar en abandonar todo.',
        'Prioriza una o dos metas y deja las demás para cuando completes la primera.',
        'goals', 'Priorización de metas');
    }
    m.goals.forEach(function (g) {
      if (g.status === 'completed' && isRecent(g.completedAt, m.today)) {
        add('rec-goal-done-' + g.id, 'logro', 'low', 'Meta cumplida: "' + (g.name || 'Meta') + '"',
          'Alcanzaste ' + money(Number(g.targetAmount) || 0) + '.',
          'Lograr una meta demuestra que tu plan de ahorro funciona.',
          'Define tu siguiente meta o lleva ese mismo aporte mensual a tu fondo de emergencia.',
          'goals', 'Refuerzo del hábito de ahorro');
      }
    });
    if (!m.activeGoals.length && m.income > 0) {
      add('rec-edu-need-goals', 'consejo', 'low', 'Dale un destino a tu ahorro',
        'No tienes metas activas.',
        'Ahorrar con un objetivo claro (monto y fecha) motiva más y se cumple con más frecuencia.',
        'Crea tu primera meta en Metas de ahorro.',
        'goals', 'Metas SMART');
    }

    // Capacidad de ahorro
    var monthIsClosed = !m.isCurrentMonth || m.day >= 10;
    if (m.income > 0 && monthIsClosed && m.savingsRate < p.savingsWarningThreshold) {
      add(m.activeGoals.length ? 'rec-goals-risk' : 'rec-save-low', 'alerta', 'medium', 'Tu margen de ahorro es bajo',
        'Hoy ahorras ' + pct(Math.max(0, m.savingsRate)) + ' de tus ingresos' + (m.activeGoals.length ? ', lo que frena el avance de ' + (m.activeGoals.length === 1 ? 'tu meta activa.' : 'tus ' + m.activeGoals.length + ' metas activas.') : '.'),
        'Esperar a ver qué sobra casi nunca funciona: lo que no se aparta primero, se gasta.',
        'Apenas recibas ingresos, aparta ' + money((m.income * p.rule20) / 100) + ' (' + p.rule20 + '%) antes de gastar. "Págate primero".',
        'goals', 'Págate primero');
    }
    if (m.income > 0 && monthIsClosed && m.savingsRate >= p.rule20 / 100 && m.expenses > 0) {
      add('rec-save-great', 'logro', 'low', 'Estás ahorrando el ' + pct(m.savingsRate) + ' de tus ingresos',
        'Cumples la parte del ' + p.rule20 + '% de la regla 50/30/20.',
        'Ahorrar de forma constante es el hábito que más pesa en tus finanzas a largo plazo.',
        'Mantén el ritmo y dirige ese ahorro a tu fondo de emergencia o a tus metas.',
        'goals', 'Págate primero');
    }

    // Fondo de emergencia
    if (m.baselineEssential > 0) {
      var target = m.fundTarget;
      var coverage = m.fundCoverage || 0;
      var missing = Math.max(0, m.baselineEssential * target - m.fundSaved);
      var monthly = Number(m.fund.monthlyContributionTarget) || (m.income > 0 ? m.income * 0.1 : 0);
      var monthsToGo = monthly > 0 ? Math.ceil(missing / monthly) : null;
      var planText = monthsToGo ? ' Con ' + money(monthly) + ' al mes lo completas en ' + monthsToGo + ' meses.' : '';

      if (m.fundSaved === 0 && m.income > 0) {
        add('rec-fund-start', 'alerta', 'medium', 'Aún no has empezado tu fondo de emergencia',
          'Tus gastos esenciales rondan ' + money(m.baselineEssential) + ' al mes y no tienes nada apartado para un imprevisto.',
          'Sin colchón, un imprevisto suele terminar en una deuda cara. El primer hito realista es cubrir 1 mes.',
          'Primer objetivo: ' + money(m.baselineEssential) + ' (1 mes de gastos esenciales).' + (monthly > 0 ? ' Con ' + money(monthly) + ' al mes lo logras en ' + Math.ceil(m.baselineEssential / monthly) + ' meses.' : ''),
          'emergency_fund', 'Fondo de emergencia');
      } else if (m.fundSaved > 0 && coverage < target) {
        add('rec-fund-coverage', 'alerta', coverage < 1 ? 'high' : 'medium', 'Tu fondo de emergencia aún no llega a la meta',
          'Tu fondo (' + money(m.fundSaved) + ') cubre ' + coverage.toFixed(1) + ' meses de gastos esenciales y tu meta es de ' + target + ' (faltan ' + money(missing) + ').',
          'La reserva protege tu liquidez ante imprevistos médicos, de estudio o de trabajo.',
          'Sigue aportando de forma regular hasta reunir ' + money(missing) + '.' + planText,
          'emergency_fund', 'Fondo de emergencia');
      } else if (coverage >= target && m.fundSaved > 0) {
        add('rec-fund-done', 'logro', 'low', 'Tu fondo de emergencia está completo',
          'Cubre ' + coverage.toFixed(1) + ' meses de gastos esenciales (meta: ' + target + ').',
          'Ya tienes un colchón para imprevistos; eso te da tranquilidad y evita endeudarte.',
          'Revisa tu fondo cuando suban tus gastos esenciales y dirige tus ahorros a tus metas.',
          'emergency_fund', 'Fondo de emergencia');
      }

      if (m.activeDebts.length && coverage < 1) {
        add('rec-fund-before-debt', 'consejo', 'medium', 'Primero un colchón mínimo y luego el ataque a las deudas',
          (m.activeDebts.length === 1 ? 'Tienes 1 deuda activa' : 'Tienes ' + m.activeDebts.length + ' deudas activas') + ' y tu fondo cubre ' + coverage.toFixed(1) + ' meses.',
          'Sin colchón, cualquier imprevisto te obliga a endeudarte otra vez. La pauta habitual es reunir 1 mes de gastos esenciales y luego acelerar el pago de deudas.',
          'Paga el mínimo de tus deudas, arma ese primer mes de fondo y después envía el excedente a la deuda prioritaria.',
          'emergency_fund', 'Orden de prioridades financieras');
      }
    }

    // Deudas
    if (m.dti !== null && m.totalMin > 0 && m.dti > p.dtiWarningThreshold) {
      var focus = debtFocus(m);
      add('rec-debt-burden', 'alerta', m.dti > p.dtiAlertThreshold ? 'high' : 'medium', 'Pagas mucho de tus ingresos en deudas',
        'El ' + pct(m.dti) + ' de tus ingresos se va en cuotas (' + money(m.totalMin) + ' de ' + money(m.income) + ').',
        'Por encima del ' + Math.round(p.dtiWarningThreshold * 100) + '% queda poca flexibilidad ante cualquier imprevisto; arriba de ' + Math.round(p.dtiAlertThreshold * 100) + '% es zona de riesgo.',
        'Evita nuevos créditos y prioriza "' + focus.debt.name + '": ' + focus.why + '.',
        'debts', 'Nivel de endeudamiento (DTI)');
    } else if (m.dti !== null && m.totalMin > 0) {
      add('rec-dti-healthy', 'logro', 'low', 'Tu carga de deudas es manejable',
        'Tus cuotas son el ' + pct(m.dti) + ' de tus ingresos (por debajo del ' + Math.round(p.dtiWarningThreshold * 100) + '%).',
        'Mantener las cuotas en un porcentaje bajo te deja margen para ahorrar.',
        'Sigue pagando a tiempo y evita tomar nuevos créditos mientras terminas estos.',
        'debts', 'Nivel de endeudamiento (DTI)');
    }

    if (m.activeDebts.length >= 2) {
      var best = debtFocus(m);
      var totalOwed = m.activeDebts.reduce(function (s, d) { return s + (Number(d.remainingAmount) || 0); }, 0);
      add('rec-debt-strategy', 'consejo', 'medium', 'Define cuál deuda atacar primero',
        'Tienes ' + m.activeDebts.length + ' deudas activas por ' + money(totalOwed) + ' en total.',
        'Pagar el mínimo en todas y concentrar el excedente en una sola acelera la salida de deudas y ahorra intereses.',
        'Concentra el excedente en "' + best.debt.name + '": ' + best.why + '.',
        'debts', 'Estrategias de pago: avalancha y bola de nieve');
    }

    if (m.isCurrentMonth) {
      m.activeDebts.forEach(function (d) {
        var due = Number(d.dueDayOfMonth) || 15;
        if (paidThisMonth(d, m)) return;
        var cuota = money(Number(d.minimumMonthlyPayment) || 0);
        if (m.day > due) {
          add('rec-debt-late-' + d.id, 'alerta', 'high', 'La cuota de "' + d.name + '" no tiene pago registrado',
            'Vencía el día ' + due + ' y este mes no aparece un pago (cuota: ' + cuota + ').',
            'Pagar tarde genera intereses de mora y afecta tu historial crediticio.',
            'Paga cuanto antes y regístralo en Deudas para mantener tu seguimiento al día.',
            'debts', 'Historial crediticio');
        } else if (due - m.day <= 3) {
          add('rec-debt-due-' + d.id, 'alerta', due - m.day <= 1 ? 'high' : 'medium', 'La cuota de "' + d.name + '" vence pronto',
            'Vence el día ' + due + ' por ' + cuota + (due === m.day ? ' (es hoy).' : ' (faltan ' + (due - m.day) + ' días).'),
            'Pagar a tiempo evita intereses de mora y cuida tu historial crediticio.',
            'Aparta ese dinero desde ya para que no se mezcle con tus gastos del día a día.',
            'debts', 'Historial crediticio');
        }
      });
    }

    m.debts.forEach(function (d) {
      if (d.status === 'paid' && isRecent(d.paidAt, m.today)) {
        add('rec-debt-free-' + d.id, 'logro', 'low', 'Saldaste la deuda "' + d.name + '"',
          'Ya no debes nada por esta obligación.',
          'Al terminar una deuda se libera su cuota mensual. Si no la rediriges, se diluye en gastos.',
          'Lleva esa cuota (' + money(Number(d.minimumMonthlyPayment) || 0) + ' al mes) a tu fondo, a una meta o a la siguiente deuda: es el efecto bola de nieve.',
          'debts', 'Estrategias de pago: avalancha y bola de nieve');
      }
    });

    // Capital en tiempo real: lo que el usuario tiene hoy, sin importar el mes que esté viendo
    var inv = Invest && m.allTxs.length ? Invest.evaluateInvestment(data, m.today, 'conservador') : null;
    if (inv) {
      var cap = inv.capital;
      var firstPlan = inv.debtPlan.filter(function (x) { return x.amount > 0; })[0];

      if (cap.balance < 0) {
        add('rec-cap-negative', 'alerta', 'high', 'Tu saldo acumulado es negativo',
          'Has registrado ' + money(cap.expenses) + ' en gastos y ' + money(cap.income) + ' en ingresos: el saldo es de ' + money(cap.balance) + '.',
          'Gastar más de lo que entra obliga a vivir de deuda o de ahorros. También puede significar que falta registrar algún ingreso.',
          'Revisa que todos tus ingresos estén anotados y frena los gastos de gustos hasta recuperar el equilibrio.',
          'transactions', 'Flujo de caja');
      } else if (inv.committed > 0 && cap.balance < inv.committed) {
        add('rec-cap-dues', 'alerta', 'high', 'Tu saldo no alcanza para las cuotas pendientes',
          'Tienes ' + money(cap.balance) + ' y este mes aún debes pagar ' + money(inv.committed) + ' en cuotas.',
          'Una cuota atrasada genera intereses de mora y daña tu historial crediticio; es la prioridad antes que cualquier gasto de gustos.',
          'Aparta ese dinero apenas lo recibas y recorta gastos no esenciales hasta cubrir las cuotas.',
          'debts', 'Historial crediticio');
      } else if (inv.committed > 0 && cap.free < inv.committed) {
        add('rec-cap-dues-reserve', 'alerta', 'medium', 'Para pagar tus cuotas tendrías que usar tu fondo o tus metas',
          'Tu capital libre es ' + money(cap.free) + ' y las cuotas pendientes del mes suman ' + money(inv.committed) + '.',
          'El fondo de emergencia es para imprevistos, no para cuotas que ya conoces. Si lo usas, queda sin protección.',
          'Cubre las cuotas con tus próximos ingresos y reduce gastos de gustos este mes.',
          'debts', 'Fondo de emergencia');
      }

      if (cap.reservedExceedsBalance) {
        add('rec-cap-reserved', 'alerta', 'low', 'Lo apartado supera tu saldo registrado',
          'Entre fondo y metas tienes ' + money(cap.reserved) + ' y tu saldo es de ' + money(cap.balance) + '.',
          'O falta registrar algún ingreso, o parte del dinero apartado ya se gastó. En ambos casos tu capital libre queda en cero.',
          'Revisa tus ingresos. Si usaste tu fondo, repónlo antes que cualquier otra cosa.',
          'transactions', 'Flujo de caja');
      }

      if (firstPlan && cap.free > 0) {
        var costWord = Invest.costLabel(firstPlan.cost.level);
        var rateText = firstPlan.cost.rate !== null ? ' (' + firstPlan.cost.rate + '% E.A.)' : '';
        add('rec-cap-debt', 'consejo', firstPlan.cost.level === 'alto' ? 'high' : 'medium',
          firstPlan.clears ? 'Con tu capital puedes saldar "' + firstPlan.debt.name + '"' : 'Usa tu capital libre para abonar a "' + firstPlan.debt.name + '"',
          'Tienes ' + money(cap.free) + ' libres y debes ' + money(firstPlan.owed) + ' en una deuda de ' + costWord + rateText + '.',
          'Abonar a una deuda con interés es una ganancia segura: te ahorras esa tasa. Una inversión de bajo riesgo rara vez rinde más que lo que cobra una deuda de consumo o una tarjeta.',
          (firstPlan.clears ? 'Salda la deuda con ' + money(firstPlan.owed) : 'Abona ' + money(firstPlan.amount)) + ' y registra el pago en Deudas. Luego lleva la cuota liberada a tu fondo o a una meta.',
          'debts', 'Deuda frente a inversión');
      }

      if (inv.stage === 'fondo') {
        var fundStep = inv.steps.filter(function (x) { return x.id === 'fondo'; })[0];
        add('rec-cap-fund', 'consejo', 'medium', 'Lleva tu capital libre al fondo de emergencia',
          'Tienes ' + money(cap.free) + ' libres y a tu fondo le faltan ' + money(fundStep.need) + '.',
          'Antes de invertir necesitas una reserva líquida; si no, un imprevisto te obliga a vender inversiones o a endeudarte.',
          'Aporta ' + money(fundStep.allocated) + ' en Fondo de emergencia.',
          'emergency_fund', 'Fondo de emergencia');
      }

      if (inv.stage === 'sin_gastos' && cap.free > 0) {
        add('rec-cap-no-expenses', 'consejo', 'medium', 'Registra tus gastos esenciales para saber cuánto fondo necesitas',
          'Tienes ' + money(cap.free) + ' libres, pero no hay gastos esenciales registrados.',
          'El fondo de emergencia se calcula en meses de gastos esenciales; sin ese dato no se puede decidir cuánto guardar y cuánto invertir.',
          'Anota tus gastos de arriendo, mercado, transporte y servicios.',
          'transactions', 'Fondo de emergencia');
      }

      if (inv.stage === 'invertir') {
        add('rec-cap-invest', 'consejo', 'medium', inv.pending.length ? 'Después de cubrir lo básico te sobran ' + money(inv.investable) + ' para invertir' : 'Tienes ' + money(inv.investable) + ' listos para invertir',
          inv.pending.length ? 'Tu capital libre es ' + money(cap.free) + '. Antes de invertir: ' + inv.next.replace(/; después.*$/, '') + '.' : 'Tus cuotas, tus deudas costosas y tu fondo de emergencia están cubiertos con tu capital actual.',
          'El dinero quieto pierde valor con la inflación. Con lo básico resuelto, puedes ponerlo a rendir sin poner en riesgo tu estabilidad.',
          'Entra a Inversión y revisa cómo repartir ese monto según tu perfil.',
          'invest', 'Escalera de prioridades financieras');
      }

      if (inv.stage === 'sin_capital' && cap.income > 0 && cap.balance >= 0) {
        add('rec-cap-none', 'consejo', m.activeDebts.length ? 'medium' : 'low', 'Aún no tienes capital libre para invertir',
          'Tu saldo menos lo apartado en fondo y metas es cero' + (m.activeDebts.length ? ' y tienes deudas activas.' : '.'),
          'Invertir requiere dinero que no necesites para vivir ni para pagar. Primero se genera margen y después se invierte.',
          m.activeDebts.length ? 'Evita nuevas deudas y aparta una parte de cada ingreso para abonar a la deuda más costosa.' : 'Aparta el ' + p.rule20 + '% de cada ingreso apenas lo recibas.',
          'budget', 'Págate primero');
      }
    }

    // Tasa de interés: sin ella no se puede priorizar con precisión
    var noRate = m.activeDebts.filter(function (d) { return !(Number(d.annualInterestRate) > 0); });
    if (noRate.length) {
      add('rec-debt-rate-missing', 'consejo', 'low', 'Registra la tasa de interés de tus deudas',
        noRate.length === 1 ? 'La deuda "' + noRate[0].name + '" no tiene tasa registrada.' : noRate.length + ' deudas no tienen tasa registrada.',
        'La tasa define cuál deuda cuesta más. Sin ella la app solo puede estimar el costo según el tipo de deuda.',
        'Consulta la tasa E.A. en tu extracto o contrato y agrégala al crear la deuda.',
        'debts', 'Costo del crédito');
    }

    return finish(recs);
  }

  // Ordena por prioridad y limita consejos y logros para no saturar
  function finish(recs) {
    var severityRank = { high: 0, medium: 1, low: 2 };
    var kindRank = { alerta: 0, consejo: 1, logro: 2 };
    recs.sort(function (a, b) {
      return (
        severityRank[a.severity] - severityRank[b.severity] ||
        kindRank[a.kind] - kindRank[b.kind] ||
        a.order - b.order
      );
    });
    var tips = 0;
    var wins = 0;
    return recs.filter(function (r) {
      if (r.kind === 'consejo') return ++tips <= 5;
      if (r.kind === 'logro') return ++wins <= 3;
      return true;
    });
  }

  // ---------- Reacción inmediata a una acción ----------

  // Devuelve un mensaje corto { tone, text } según lo que acaba de hacer el usuario
  function evaluateEventBase(event, data, monthKey, today) {
    if (!event) return null;
    var m = analyze(data, monthKey, today);
    var p = m.params;

    function inThisMonth() {
      return !event.date || String(event.date).slice(0, 7) === monthKey;
    }

    if (event.type === 'income') {
      if (!inThisMonth()) return null;
      var a = Number(event.amount) || 0;
      var savingsPart = (a * p.rule20) / 100;
      var first = m.income === a ? 'Págate primero. ' : '';
      return {
        tone: 'info',
        text: first + 'Con ' + money(a) + ' de ingreso, la regla 50/30/20 sugiere: ' + money((a * p.rule50) / 100) + ' para necesidades, ' + money((a * p.rule30) / 100) + ' para gustos y ' + money(savingsPart) + ' para ahorro o deudas.',
      };
    }

    if (event.type === 'expense') {
      if (!inThisMonth()) return null;
      var amount = Number(event.amount) || 0;
      var cat = m.catMap[event.categoryId];
      var name = cat ? cat.name : 'esta categoría';
      var isWant = !cat || (cat.group !== 'savings_debt' && !cat.isEssential);

      if (cat && cat.id === 'exp-ahorro') {
        return { tone: 'success', text: 'Buen hábito: pagarte primero. Si ese ahorro es para una meta o para el fondo, regístralo también allí para ver tu avance.' };
      }
      if (m.income > 0 && m.expenses > m.income && m.expenses - amount <= m.income) {
        return { tone: 'alert', text: 'Con este gasto, tus gastos del mes (' + money(m.expenses) + ') superan tus ingresos (' + money(m.income) + '). Evita nuevas compras de gustos hasta tu próximo ingreso.' };
      }
      if (m.budget && m.budget.categoryLimits) {
        var limit = m.budget.categoryLimits.filter(function (l) { return l.categoryId === event.categoryId; })[0];
        var allocated = limit ? Number(limit.allocatedAmount) || 0 : 0;
        if (allocated > 0) {
          var spent = m.byCat[event.categoryId] || 0;
          if (spent > allocated && spent - amount <= allocated) {
            return { tone: 'alert', text: 'Superaste el límite de ' + name + ': ' + money(spent) + ' de ' + money(allocated) + '. Modera esta categoría el resto del mes.' };
          }
          if (spent >= allocated * 0.8 && spent - amount < allocated * 0.8) {
            return { tone: 'alert', text: 'Ya usaste el ' + pct(spent / allocated) + ' del límite de ' + name + '. Te quedan ' + money(allocated - spent) + '.' };
          }
        }
      }
      if (isWant && m.income > 0 && amount >= m.income * 0.2) {
        return { tone: 'alert', text: 'Es una compra grande (' + pct(amount / m.income) + ' de tus ingresos). Una buena práctica es esperar 24 horas antes de comprar y comparar opciones.' };
      }
      if (isWant && m.income > 0 && m.wantsPct > p.rule30 / 100 && (m.wants - amount) / m.income <= p.rule30 / 100) {
        return { tone: 'alert', text: 'Tus gustos ya suman el ' + pct(m.wantsPct) + ' de tus ingresos (guía: ' + p.rule30 + '%). Mejor frena este tipo de gastos por ahora.' };
      }
      if (m.income === 0) {
        return { tone: 'info', text: 'Registra también tus ingresos del mes para saber cuánto te queda disponible.' };
      }
      if (m.isCurrentMonth && m.net > 0 && m.daysLeft > 0) {
        return { tone: 'info', text: 'Te quedan ' + money(m.net) + ' de tus ingresos del mes: unos ' + money(m.net / m.daysLeft) + ' por día hasta fin de mes.' };
      }
      return null;
    }

    if (event.type === 'goal_created') {
      var plan = m.goalPlans.filter(function (x) { return x.goal.id === event.goalId; })[0];
      if (!plan) return null;
      if (plan.remaining === 0) return { tone: 'success', text: 'Tu meta "' + plan.name + '" ya está completa. ¡Define la siguiente!' };
      if (!plan.hasDeadline) {
        return { tone: 'info', text: 'Meta creada. Ponle una fecha límite: sin plazo es solo un deseo; con fecha puedes calcular cuánto ahorrar al mes (método SMART).' };
      }
      if (m.income === 0) {
        return { tone: 'info', text: 'Necesitas ' + money(plan.required) + ' al mes durante ' + plan.months + ' meses para "' + plan.name + '". Registra tus ingresos para saber si es alcanzable.' };
      }
      var capacity = Math.max(0, m.net);
      var planned = (m.income * p.rule20) / 100;
      var base = 'Para "' + plan.name + '" necesitas ' + money(plan.required) + ' al mes durante ' + plan.months + ' meses (' + pct(plan.share) + ' de tus ingresos). ';
      if (plan.required <= capacity && plan.share <= 0.4) return { tone: 'success', text: base + 'Es alcanzable con lo que hoy te sobra.' };
      if (plan.required <= planned) return { tone: 'info', text: base + 'Es alcanzable si apartas el ' + p.rule20 + '% de tus ingresos apenas los recibas.' };
      var longer = Math.ceil(plan.remaining / Math.max(planned, 1));
      return { tone: 'alert', text: base + 'Es exigente: con el ' + p.rule20 + '% de tus ingresos tardarías unos ' + longer + ' meses.' };
    }

    if (event.type === 'goal_contribution') {
      var goal = m.goals.filter(function (g) { return g.id === event.goalId; })[0];
      if (!goal) return null;
      var tgt = Number(goal.targetAmount) || 0;
      var current = Number(goal.currentAmount) || 0;
      var added = Number(event.amount) || 0;
      var now = safeDiv(current, tgt);
      var before = safeDiv(current - added, tgt);
      if (goal.status === 'completed') {
        return { tone: 'success', text: '¡Meta cumplida: "' + goal.name + '"! Define la siguiente o lleva ese aporte mensual a tu fondo de emergencia.' };
      }
      var step = [0.75, 0.5, 0.25].filter(function (x) { return now >= x && before < x; })[0];
      var rest = Math.max(0, tgt - current);
      var text = step
        ? 'Llegaste al ' + pct(step) + ' de "' + goal.name + '". Te faltan ' + money(rest) + '.'
        : 'Abono registrado: llevas el ' + pct(now) + ' de "' + goal.name + '". Te faltan ' + money(rest) + '.';
      var gp = goalPlan(goal, m);
      if (gp.required && !gp.overdue) text += ' Mantén ' + money(gp.required) + ' al mes para llegar a tiempo.';
      return { tone: 'success', text: text };
    }

    if (event.type === 'debt_created') {
      var debt = m.debts.filter(function (d) { return d.id === event.debtId; })[0];
      if (!debt) return null;
      var dueText = 'Recuerda pagarla antes del día ' + (Number(debt.dueDayOfMonth) || 15) + ' de cada mes.';
      if (m.income === 0 || m.dti === null) {
        return { tone: 'info', text: 'Deuda registrada. Registra tus ingresos para medir cuánto pesa en tu presupuesto. ' + dueText };
      }
      if (m.dti > p.dtiAlertThreshold) {
        return { tone: 'alert', text: 'Con esta deuda, el ' + pct(m.dti) + ' de tus ingresos se va en cuotas (zona de riesgo desde ' + Math.round(p.dtiAlertThreshold * 100) + '%). Evita nuevos créditos y prioriza pagarla.' };
      }
      if (m.dti > p.dtiWarningThreshold) {
        return { tone: 'alert', text: 'Tus cuotas ya son el ' + pct(m.dti) + ' de tus ingresos (precaución desde ' + Math.round(p.dtiWarningThreshold * 100) + '%). ' + dueText };
      }
      return { tone: 'success', text: 'Tus cuotas son el ' + pct(m.dti) + ' de tus ingresos: un nivel manejable. ' + dueText };
    }

    if (event.type === 'debt_payment') {
      var paid = m.debts.filter(function (d) { return d.id === event.debtId; })[0];
      if (!paid) return null;
      var min = Number(paid.minimumMonthlyPayment) || 0;
      if (paid.status === 'paid') {
        return { tone: 'success', text: '¡Deuda saldada: "' + paid.name + '"! Lleva su cuota de ' + money(min) + ' al mes a tu fondo, a una meta o a la siguiente deuda (efecto bola de nieve).' };
      }
      var remaining = Number(paid.remainingAmount) || 0;
      var installments = min > 0 ? Math.ceil(remaining / min) : null;
      var msg = 'Pago registrado en "' + paid.name + '". Te faltan ' + money(remaining) + (installments ? ' (unas ' + installments + ' cuotas)' : '') + '.';
      if (min > 0 && Number(event.amount) > min) msg += ' Pagar más del mínimo acelera la salida de la deuda.';
      return { tone: 'success', text: msg };
    }

    if (event.type === 'fund_withdrawal') {
      if (m.fundCoverage === null) {
        return { tone: 'info', text: 'Retiro registrado. El fondo es para imprevistos reales; cuando pase, vuelve a reponerlo.' };
      }
      if (m.fundCoverage < 1) {
        return { tone: 'alert', text: 'Tu fondo quedó cubriendo ' + m.fundCoverage.toFixed(1) + ' meses de gastos esenciales, menos de 1. Repónlo cuanto antes y evita nuevas compras de gustos.' };
      }
      return { tone: 'info', text: 'Tu fondo cubre ' + m.fundCoverage.toFixed(1) + ' de ' + m.fundTarget + ' meses. Repónlo apenas puedas para volver a tu meta.' };
    }

    if (event.type === 'fund_contribution') {
      var amt = Number(event.amount) || 0;
      if (m.fundCoverage === null) {
        return { tone: 'success', text: 'Aporte al fondo registrado. Registra tus gastos esenciales para medir cuántos meses cubre.' };
      }
      var coverage = m.fundCoverage;
      var coverageBefore = (m.fundSaved - amt) / m.baselineEssential;
      if (coverage >= m.fundTarget && coverageBefore < m.fundTarget) {
        return { tone: 'success', text: '¡Completaste tu fondo de emergencia! Cubre ' + coverage.toFixed(1) + ' meses de gastos esenciales.' };
      }
      if (coverage >= 1 && coverageBefore < 1) {
        return { tone: 'success', text: 'Primer hito logrado: tu fondo ya cubre 1 mes de gastos esenciales. Sigue hasta ' + m.fundTarget + ' meses.' };
      }
      return { tone: 'success', text: 'Tu fondo cubre ' + coverage.toFixed(1) + ' de ' + m.fundTarget + ' meses de gastos esenciales. Te faltan ' + money(Math.max(0, m.baselineEssential * m.fundTarget - m.fundSaved)) + '.' };
    }

    return null;
  }

  // Línea con el capital libre actual y el siguiente paso recomendado
  function capitalLine(data, today) {
    if (!Invest) return '';
    var inv = Invest.evaluateInvestment(data, today, 'conservador');
    if (inv.stage === 'sin_ingresos') return '';
    var text = 'Capital libre ahora: ' + money(inv.capital.free) + '.';
    if (inv.next) text += ' Siguiente paso: ' + inv.next;
    return text;
  }

  var CAPITAL_EVENTS = { income: 1, expense: 1, goal_contribution: 1, fund_contribution: 1, fund_withdrawal: 1, debt_payment: 1, debt_created: 1 };

  // Reacción a una acción: el mensaje de cada caso más el estado actual del capital
  function evaluateEvent(event, data, monthKey, today) {
    var base = evaluateEventBase(event, data, monthKey, today);
    if (!event || !CAPITAL_EVENTS[event.type]) return base;
    var line = capitalLine(data, today || todayISO());
    if (!line) return base;
    if (!base) return { tone: 'info', text: line };
    return { tone: base.tone, text: base.text + ' ' + line };
  }

  return {
    evaluateRecommendations: evaluateRecommendations,
    evaluateEvent: evaluateEvent,
  };
});

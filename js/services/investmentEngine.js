/* Motor de capital e inversión: calcula cuánto dinero libre tiene el usuario y en qué orden usarlo. */

(function (root, factory) {
  var instance = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = instance;
  }
  if (typeof root !== 'undefined') {
    root.FinInvest = instance;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var ESSENTIAL_FALLBACK_MONTHS = 3;
  var HIGH_RATE = 20; // % E.A. desde el cual una deuda se considera de costo alto
  var MID_RATE = 12; // % E.A. desde el cual una deuda se considera de costo medio

  // Instrumentos de referencia (Colombia). Los montos mínimos son orientativos.
  var INSTRUMENTS = [
    {
      id: 'ahorro',
      name: 'Cuenta de ahorros con rendimiento',
      min: 0,
      risk: 'Bajo',
      liquidity: 'Inmediata',
      what: 'Cuenta de ahorros de un banco o cooperativa vigilada que paga intereses por tu saldo.',
      why: 'Sirve para dinero que puedes necesitar pronto: tienes acceso inmediato y casi sin riesgo.',
    },
    {
      id: 'fic',
      name: 'Fondo de inversión colectiva de bajo riesgo',
      min: 200000,
      risk: 'Bajo',
      liquidity: 'De 1 a 3 días hábiles',
      what: 'Tu dinero se junta con el de otros inversionistas y lo administra una sociedad comisionista o fiduciaria.',
      why: 'Suele rendir algo más que una cuenta de ahorros y permite empezar con montos pequeños.',
    },
    {
      id: 'cdt',
      name: 'CDT (certificado de depósito a término)',
      min: 1000000,
      risk: 'Bajo',
      liquidity: 'Al vencimiento del plazo',
      what: 'Prestas tu dinero a un banco por un plazo fijo y recibes una tasa acordada de antemano.',
      why: 'Conoces desde el inicio cuánto ganarás. Úsalo solo con dinero que no necesitarás durante el plazo.',
    },
    {
      id: 'fvp',
      name: 'Fondo voluntario de pensión',
      min: 300000,
      risk: 'Medio',
      liquidity: 'Baja (pensado para el largo plazo)',
      what: 'Ahorro a largo plazo administrado por una sociedad fiduciaria o fondo de pensiones.',
      why: 'Es útil si piensas a muchos años y, según tu situación, puede tener beneficios tributarios.',
    },
    {
      id: 'rv',
      name: 'Renta variable (acciones o ETF)',
      min: 5000000,
      risk: 'Alto',
      liquidity: 'Alta, pero puedes perder parte del valor',
      what: 'Compras partes de empresas o fondos que las agrupan, a través de una comisionista de bolsa.',
      why: 'Puede crecer más a muchos años, pero su precio sube y baja. Solo con dinero que no necesites en 5 años o más.',
    },
  ];

  // Peso de cada instrumento según el perfil de riesgo
  var PROFILES = {
    conservador: { label: 'Conservador', weights: { ahorro: 40, fic: 30, cdt: 30, fvp: 0, rv: 0 } },
    moderado: { label: 'Moderado', weights: { ahorro: 25, fic: 25, cdt: 25, fvp: 15, rv: 10 } },
    arriesgado: { label: 'Arriesgado', weights: { ahorro: 15, fic: 20, cdt: 20, fvp: 20, rv: 25 } },
  };

  // ---------- Utilidades ----------

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
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

  function getParams() {
    if (typeof window !== 'undefined' && window.FinStorage && window.FinStorage.getSystemParams) {
      return window.FinStorage.getSystemParams();
    }
    return { emergencyFundMonths: 3 };
  }

  function money(value) {
    var n = Math.round(Number(value) || 0);
    var sign = n < 0 ? '-' : '';
    return sign + '$ ' + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function num(value) {
    return Number(value) || 0;
  }

  // ---------- Capital ----------

  // Capital real: lo que ha entrado menos lo que ha salido, sin contar lo ya apartado en fondo y metas
  function computeCapital(data) {
    data = data || {};
    var income = 0;
    var expenses = 0;
    (data.transactions || []).forEach(function (tx) {
      if (tx.type === 'income') income += num(tx.amount);
      else if (tx.type === 'expense') expenses += num(tx.amount);
    });
    var fundSaved = num((data.emergencyFund || {}).currentSaved);
    var goalsSaved = (data.goals || []).reduce(function (sum, g) {
      return sum + num(g.currentAmount);
    }, 0);
    var balance = income - expenses;
    var reserved = fundSaved + goalsSaved;
    return {
      income: income,
      expenses: expenses,
      balance: balance,
      fundSaved: fundSaved,
      goalsSaved: goalsSaved,
      reserved: reserved,
      free: Math.max(0, balance - reserved),
      reservedExceedsBalance: reserved > balance && balance >= 0,
    };
  }

  // Gasto esencial mensual de referencia (mes actual o promedio de los 3 anteriores)
  function essentialBaseline(data, today) {
    var catMap = {};
    (data.categories || []).forEach(function (c) {
      catMap[c.id] = c;
    });
    var byMonth = {};
    (data.transactions || []).forEach(function (tx) {
      if (tx.type !== 'expense') return;
      var cat = catMap[tx.categoryId];
      if (!cat || !cat.isEssential || cat.group === 'savings_debt') return;
      var key = String(tx.date || '').slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + num(tx.amount);
    });
    var current = String(today).slice(0, 7);
    var sum = 0;
    var count = 0;
    var key = previousMonthKey(current);
    for (var i = 0; i < ESSENTIAL_FALLBACK_MONTHS; i++) {
      if (byMonth[key] > 0) {
        sum += byMonth[key];
        count++;
      }
      key = previousMonthKey(key);
    }
    return Math.max(byMonth[current] || 0, count ? sum / count : 0);
  }

  // ---------- Deudas ----------

  // Costo de la deuda: tasa registrada o, si falta, una estimación por tipo
  function debtCost(debt) {
    var rate = num(debt.annualInterestRate);
    if (rate > 0) {
      return {
        level: rate >= HIGH_RATE ? 'alto' : rate >= MID_RATE ? 'medio' : 'bajo',
        rate: rate,
        estimated: false,
      };
    }
    var byType = { tarjeta: 'alto', prestamo: 'medio', educativo: 'bajo', otro: 'medio' };
    return { level: byType[debt.type] || 'medio', rate: null, estimated: true };
  }

  function costLabel(level) {
    return level === 'alto' ? 'costo alto' : level === 'medio' ? 'costo medio' : 'costo bajo';
  }

  function paidThisMonth(debt, data, monthKey) {
    return (data.transactions || []).some(function (t) {
      return (
        t.type === 'expense' &&
        String(t.date || '').slice(0, 7) === monthKey &&
        String(t.description || '').indexOf('Cuota de deuda: ' + debt.name) === 0
      );
    });
  }

  // Deudas ordenadas por prioridad de pago: mayor tasa primero, luego menor saldo
  function priorityDebts(activeDebts) {
    var rank = { alto: 0, medio: 1, bajo: 2 };
    return activeDebts
      .map(function (d) {
        return { debt: d, cost: debtCost(d) };
      })
      .filter(function (x) {
        return x.cost.level !== 'bajo';
      })
      .sort(function (a, b) {
        if (a.cost.rate !== null && b.cost.rate !== null && a.cost.rate !== b.cost.rate) {
          return b.cost.rate - a.cost.rate;
        }
        return rank[a.cost.level] - rank[b.cost.level] || num(a.debt.remainingAmount) - num(b.debt.remainingAmount);
      });
  }

  // ---------- Reparto del capital en instrumentos ----------

  function allocateInstruments(amount, profileKey, options) {
    var profile = PROFILES[profileKey] || PROFILES.conservador;
    var available = INSTRUMENTS.filter(function (ins) {
      return profile.weights[ins.id] > 0 && ins.min <= amount;
    });
    var result = [];
    // Se descartan los instrumentos cuyo monto quedaría por debajo de su mínimo y se reparte de nuevo
    for (var guard = 0; guard < INSTRUMENTS.length; guard++) {
      var total = available.reduce(function (s, ins) {
        return s + profile.weights[ins.id];
      }, 0);
      if (!total) break;
      result = available.map(function (ins) {
        return { instrument: ins, share: profile.weights[ins.id] / total, amount: Math.round((amount * profile.weights[ins.id]) / total) };
      });
      var tooSmall = result.filter(function (r) {
        return r.amount < r.instrument.min;
      });
      if (!tooSmall.length) break;
      var drop = tooSmall[tooSmall.length - 1].instrument.id;
      available = available.filter(function (ins) {
        return ins.id !== drop;
      });
      result = [];
    }
    if (!result.length && amount > 0) {
      result = [{ instrument: INSTRUMENTS[0], share: 1, amount: Math.round(amount) }];
    }
    // El último instrumento absorbe el redondeo para que la suma coincida
    if (result.length) {
      var assigned = result.reduce(function (s, r) {
        return s + r.amount;
      }, 0);
      result[0].amount += Math.round(amount) - assigned;
    }
    return result;
  }

  // ---------- Evaluación completa ----------

  function evaluateInvestment(data, today, profileKey) {
    data = data || {};
    today = today || todayISO();
    profileKey = PROFILES[profileKey] ? profileKey : 'conservador';
    var params = getParams();
    var monthKey = String(today).slice(0, 7);

    var cap = computeCapital(data);
    var essential = essentialBaseline(data, today);
    var fundMonths = params.emergencyFundMonths || 3;
    var activeDebts = (data.debts || []).filter(function (d) {
      return d.status === 'active';
    });

    // Cuotas de este mes que todavía no se han pagado: dinero ya comprometido
    var pendingDues = activeDebts.filter(function (d) {
      return num(d.minimumMonthlyPayment) > 0 && !paidThisMonth(d, data, monthKey);
    });
    var committed = pendingDues.reduce(function (s, d) {
      return s + num(d.minimumMonthlyPayment);
    }, 0);

    var priority = priorityDebts(activeDebts);
    var priorityTotal = priority.reduce(function (s, x) {
      return s + num(x.debt.remainingAmount);
    }, 0);
    var cheapDebts = activeDebts.length - priority.length;

    var fundSaved = cap.fundSaved;
    var essentialKnown = essential > 0;
    var miniNeed = activeDebts.length && essentialKnown ? Math.max(0, essential - fundSaved) : 0;
    var fundFullTarget = essentialKnown ? essential * fundMonths : 0;
    var fundNeed = essentialKnown ? Math.max(0, fundFullTarget - fundSaved - miniNeed) : 0;

    // Orden de uso del dinero: cuotas del mes, colchón mínimo (si hay deudas), deudas costosas, fondo y por último inversión
    var left = cap.free;
    function take(need) {
      var used = Math.min(left, Math.max(0, need));
      left -= used;
      return used;
    }

    var steps = [];
    var allocCommitted = take(committed);
    steps.push({
      id: 'cuotas',
      title: 'Cubrir las cuotas pendientes del mes',
      need: committed,
      allocated: allocCommitted,
      doneText: 'No tienes cuotas pendientes este mes.',
      detail: committed > 0 ? 'Cuotas sin pagar este mes: ' + money(committed) + '.' : '',
    });

    var allocMini = take(miniNeed);
    steps.push({
      id: 'colchon',
      title: 'Colchón mínimo de 1 mes de gastos esenciales',
      need: miniNeed,
      allocated: allocMini,
      doneText: activeDebts.length ? 'Ya tienes el primer mes de colchón.' : 'Sin deudas: este paso se cubre dentro del fondo de emergencia.',
      detail: miniNeed > 0 ? 'Antes de acelerar deudas conviene reunir ' + money(essential) + ' (1 mes de gastos esenciales).' : '',
    });

    var debtPlan = [];
    priority.forEach(function (x) {
      var owed = num(x.debt.remainingAmount);
      var used = take(owed);
      debtPlan.push({ debt: x.debt, cost: x.cost, owed: owed, amount: used, clears: used >= owed && owed > 0 });
    });
    var allocDebt = debtPlan.reduce(function (s, x) {
      return s + x.amount;
    }, 0);
    steps.push({
      id: 'deudas',
      title: 'Pagar las deudas de costo alto o medio',
      need: priorityTotal,
      allocated: allocDebt,
      doneText: cheapDebts ? 'Solo tienes deudas de costo bajo: sigue pagando tus cuotas.' : 'No tienes deudas de costo alto o medio.',
      detail: priorityTotal > 0 ? 'Saldo de estas deudas: ' + money(priorityTotal) + '.' : '',
    });

    var allocFund = take(fundNeed);
    steps.push({
      id: 'fondo',
      title: 'Completar el fondo de emergencia (' + fundMonths + ' meses)',
      need: fundNeed,
      allocated: allocFund,
      unknown: !essentialKnown,
      doneText: 'Tu fondo de emergencia está completo.',
      detail: essentialKnown
        ? (fundNeed > 0 ? 'Faltan ' + money(fundNeed) + ' para cubrir ' + fundMonths + ' meses de gastos esenciales (' + money(essential) + ' al mes).' : '')
        : 'Registra tus gastos esenciales para calcular cuánto fondo necesitas.',
    });

    // Si no se conocen los gastos esenciales no se recomienda invertir: no se sabe cuánto fondo falta
    var investable = essentialKnown ? left : 0;
    steps.push({
      id: 'invertir',
      title: 'Invertir el excedente',
      need: 0,
      allocated: investable,
      doneText: '',
      detail: '',
    });

    // Estado de cada paso
    steps.forEach(function (s) {
      if (s.id === 'invertir') return;
      if (s.unknown) {
        s.state = 'unknown';
        return;
      }
      if (s.need <= 0) {
        s.state = 'done';
      } else if (s.allocated >= s.need) {
        s.state = 'funded'; // con el capital actual se puede completar
      } else if (s.allocated > 0) {
        s.state = 'partial';
      } else {
        s.state = 'pending';
      }
    });
    // El paso de inversión solo es el actual cuando todo lo anterior está resuelto con el capital actual
    var blockers = steps.filter(function (s) {
      return s.id !== 'invertir' && (s.state === 'partial' || s.state === 'pending' || s.state === 'unknown');
    });
    var investStep = steps[steps.length - 1];
    investStep.state = !blockers.length && investable > 0 ? 'current' : 'locked';

    // Etapa general
    var stage;
    if (!cap.income) stage = 'sin_ingresos';
    else if (cap.free <= 0) stage = 'sin_capital';
    else if (allocCommitted < committed) stage = 'cuotas';
    else if (allocMini < miniNeed) stage = 'colchon';
    else if (allocDebt < priorityTotal) stage = 'deudas';
    else if (!essentialKnown) stage = 'sin_gastos';
    else if (allocFund < fundNeed) stage = 'fondo';
    else if (investable > 0) stage = 'invertir';
    else if (allocFund > 0) stage = 'fondo';
    else if (allocDebt > 0) stage = 'deudas';
    else if (allocMini > 0) stage = 'colchon';
    else if (allocCommitted > 0) stage = 'cuotas';
    else stage = 'sin_capital';

    // Siguiente paso concreto, redactado para mensajes breves
    var next = '';
    if (stage === 'sin_ingresos') next = 'registra tus ingresos para calcular tu capital.';
    else if (stage === 'sin_capital') next = 'por ahora no tienes capital libre; prioriza pagar tus cuotas y ahorrar una parte de cada ingreso.';
    else if (stage === 'cuotas') next = 'reserva ' + money(committed) + ' para las cuotas pendientes de este mes.';
    else if (stage === 'colchon') next = 'arma tu colchón mínimo de ' + money(essential) + ' (1 mes de gastos esenciales) antes de acelerar deudas.';
    else if (stage === 'deudas') {
      var firstDebt = debtPlan.filter(function (x) {
        return x.amount > 0;
      })[0] || debtPlan[0];
      if (firstDebt && firstDebt.clears) {
        next = 'con tu capital puedes saldar "' + firstDebt.debt.name + '" (' + costLabel(firstDebt.cost.level) + ') por completo: ' + money(firstDebt.owed) + '.';
      } else if (firstDebt) {
        next = 'abona ' + (firstDebt.amount > 0 ? money(firstDebt.amount) : 'lo que puedas') + ' a "' + firstDebt.debt.name + '" (' + costLabel(firstDebt.cost.level) + '), saldo de ' + money(firstDebt.owed) + '.';
      } else {
        next = 'abona a tus deudas de costo alto.';
      }
    } else if (stage === 'sin_gastos') next = 'registra tus gastos esenciales para saber cuánto fondo necesitas antes de invertir.';
    else if (stage === 'fondo') next = 'lleva ' + money(allocFund > 0 ? allocFund : fundNeed) + ' a tu fondo de emergencia' + (allocFund > 0 && allocFund < fundNeed ? ' (faltan ' + money(fundNeed) + ' en total).' : '.');
    else if (stage === 'invertir') {
      var labels = { cuotas: 'reserva ', colchon: 'completa tu colchón con ', deudas: 'abona a tus deudas costosas ', fondo: 'lleva a tu fondo ' };
      var todo = steps.filter(function (x) {
        return x.id !== 'invertir' && x.need > 0 && x.state === 'funded';
      }).map(function (x) {
        return labels[x.id] + money(x.need);
      });
      next = todo.length
        ? 'primero ' + todo.join(', ') + '; después te quedarán ' + money(investable) + ' para invertir.'
        : 'tienes ' + money(investable) + ' listos para invertir; revisa la pestaña Inversión.';
    }

    // Reparto del excedente en instrumentos
    var allocations = investable > 0 ? allocateInstruments(investable, profileKey) : [];

    // Metas cercanas: ese dinero no debe estar en instrumentos de riesgo
    var shortGoals = (data.goals || []).filter(function (g) {
      if (g.status !== 'active' || !g.deadline) return false;
      var end = new Date(g.deadline + 'T23:59:59');
      var now = new Date(today + 'T00:00:00');
      return !isNaN(end.getTime()) && end - now <= 365 * 86400000 && end >= now;
    });

    return {
      stage: stage,
      next: next,
      profileKey: profileKey,
      profile: PROFILES[profileKey],
      capital: cap,
      committed: committed,
      essential: essential,
      essentialKnown: essentialKnown,
      fundMonths: fundMonths,
      fundCoverage: essentialKnown ? fundSaved / essential : null,
      steps: steps,
      pending: steps.filter(function (x) { return x.id !== 'invertir' && x.need > 0 && x.state === 'funded'; }),
      debtPlan: debtPlan,
      priorityTotal: priorityTotal,
      cheapDebts: cheapDebts,
      investable: investable,
      allocations: allocations,
      shortGoals: shortGoals,
      leftover: left,
    };
  }

  return {
    INSTRUMENTS: INSTRUMENTS,
    PROFILES: PROFILES,
    computeCapital: computeCapital,
    essentialBaseline: essentialBaseline,
    debtCost: debtCost,
    costLabel: costLabel,
    priorityDebts: priorityDebts,
    allocateInstruments: allocateInstruments,
    evaluateInvestment: evaluateInvestment,
  };
});

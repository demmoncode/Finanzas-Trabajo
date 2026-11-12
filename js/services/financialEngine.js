/* Cálculo de indicadores financieros (ahorro, liquidez, endeudamiento...). */

(function (root, factory) {
  var instance = factory(typeof window !== 'undefined' ? window.FinFormatters : (root ? root.FinFormatters : null));
  if (typeof module === 'object' && module && module.exports) {
    module.exports = instance;
  }
  if (typeof root !== 'undefined') {
    root.FinEngine = instance;
  }
  if (typeof window !== 'undefined') {
    window.FinEngine = instance;
  }
})(typeof self !== 'undefined' ? self : this, function (FinFormatters) {
  'use strict';

  FinFormatters = FinFormatters || (typeof window !== 'undefined' ? window.FinFormatters : null) || {};
  var safeDivide = FinFormatters.safeDivide;
  var formatPercentage = FinFormatters.formatPercentage;

  /**
   * Calcula el resumen de ingresos, gastos esenciales, no esenciales, deudas y tasa de ahorro
   */
  function calculateFinancialSummary(transactions, categories) {
    var categoryMap = {};
    if (categories && categories.length) {
      for (var i = 0; i < categories.length; i++) {
        categoryMap[categories[i].id] = categories[i];
      }
    }

    var totalIncome = 0;
    var totalExpenses = 0;
    var essentialExpenses = 0;
    var nonEssentialExpenses = 0;
    var debtPayments = 0;

    for (var j = 0; j < transactions.length; j++) {
      var tx = transactions[j];
      var amount = Number(tx.amount) || 0;

      if (tx.type === 'income') {
        totalIncome += amount;
      } else if (tx.type === 'expense') {
        totalExpenses += amount;
        var cat = categoryMap[tx.categoryId];
        if (cat) {
          if (cat.group === 'savings_debt') {
            debtPayments += amount;
          } else if (cat.isEssential) {
            essentialExpenses += amount;
          } else {
            nonEssentialExpenses += amount;
          }
        } else {
          nonEssentialExpenses += amount;
        }
      }
    }

    var netSavings = totalIncome - totalExpenses;
    var savingsRate = totalIncome > 0 ? safeDivide(netSavings, totalIncome, 0) : 0;
    var essentialExpensesRatio = totalExpenses > 0 ? safeDivide(essentialExpenses, totalExpenses, 0) : 0;
    var expenseIncomeRatio = totalIncome > 0 ? safeDivide(totalExpenses, totalIncome, 0) : 0;

    return {
      totalIncome: totalIncome,
      totalExpenses: totalExpenses,
      netSavings: netSavings,
      savingsRate: savingsRate,
      essentialExpenses: essentialExpenses,
      nonEssentialExpenses: nonEssentialExpenses,
      debtPayments: debtPayments,
      essentialExpensesRatio: essentialExpensesRatio,
      expenseIncomeRatio: expenseIncomeRatio,
    };
  }

  /**
   * Filtra transacciones correspondientes a un mes específico (YYYY-MM)
   */
  function filterTransactionsByMonth(transactions, monthKey) {
    if (!transactions) return [];
    return transactions.filter(function (t) {
      return t.date && t.date.indexOf(monthKey) === 0;
    });
  }

  /**
   * Calcula los 6 indicadores de salud financiera formales y documentados
   */
  function calculateIndicators(currentMonthTxs, categories, emergencyFund, debts, goals, budget, essentialBaseline) {
    emergencyFund = emergencyFund || { currentSaved: 0, targetMonthsCoverage: 3 };
    debts = debts || [];
    goals = goals || [];

    var summary = calculateFinancialSummary(currentMonthTxs, categories);
    var hasIncome = summary.totalIncome > 0;

    var params = (typeof window !== 'undefined' && window.FinStorage && typeof window.FinStorage.getSystemParams === 'function')
      ? window.FinStorage.getSystemParams()
      : {
          emergencyFundMonths: 3,
          dtiWarningThreshold: 0.20,
          dtiAlertThreshold: 0.35,
          savingsWarningThreshold: 0.10,
        };

    // 1. Relación Ingresos vs Gastos
    var expenseIncomeFormatted = 'Sin registros';
    var expenseIncomeStatus = 'neutral';
    if (hasIncome) {
      var expenseIncomeRatioPct = summary.expenseIncomeRatio * 100;
      expenseIncomeFormatted = formatPercentage(summary.expenseIncomeRatio);
      var expenseWarningPct = (1 - params.savingsWarningThreshold) * 100;
      if (expenseIncomeRatioPct > 100) expenseIncomeStatus = 'alert';
      else if (expenseIncomeRatioPct > expenseWarningPct) expenseIncomeStatus = 'warning';
      else expenseIncomeStatus = 'optimal';
    } else if (summary.totalExpenses > 0) {
      expenseIncomeFormatted = '100%+ (Sin ingresos)';
      expenseIncomeStatus = 'alert';
    }

    var indExpenseIncome = {
      id: 'ind-expense-income',
      name: 'Relación Gastos vs Ingresos',
      value: summary.expenseIncomeRatio,
      formattedValue: expenseIncomeFormatted,
      period: 'Mes actual',
      description: 'Proporción de los ingresos mensuales destinada a cubrir los gastos del periodo.',
      formula: '(Gastos Totales / Ingresos Totales) * 100',
      status: expenseIncomeStatus,
    };

    // 2. Tasa de Capacidad de Ahorro
    var savingsFormatted = 'Sin registros';
    var savingsStatus = 'neutral';
    if (hasIncome) {
      savingsFormatted = formatPercentage(summary.savingsRate);
      if (summary.savingsRate < 0) savingsStatus = 'alert';
      else if (summary.savingsRate < params.savingsWarningThreshold) savingsStatus = 'warning';
      else savingsStatus = 'optimal';
    } else if (summary.totalExpenses > 0) {
      savingsFormatted = 'Negativo (sin ingresos)';
      savingsStatus = 'alert';
    }

    var indSavingsRate = {
      id: 'ind-savings-rate',
      name: 'Tasa de Capacidad de Ahorro',
      value: summary.savingsRate,
      formattedValue: savingsFormatted,
      period: 'Mes actual',
      description: 'Porcentaje efectivo de los ingresos que permanece disponible después de todos los gastos.',
      formula: '((Ingresos - Gastos) / Ingresos) * 100',
      status: savingsStatus,
    };

    // 3. Cobertura del Fondo de Emergencia en Meses
    var fundFormatted = 'Sin configurar';
    var fundStatus = 'neutral';
    var currentCoverageMonths = 0;
    var targetMonths = emergencyFund.targetMonthsCoverage || params.emergencyFundMonths;

    // Base mensual de referencia (no depende del mes visto); si no se entrega, se usa el mes
    var effectiveEssential = Number(essentialBaseline) > 0 ? Number(essentialBaseline) : summary.essentialExpenses;

    if (effectiveEssential > 0) {
      currentCoverageMonths = safeDivide(emergencyFund.currentSaved || 0, effectiveEssential, 0);
      fundFormatted = currentCoverageMonths.toFixed(1) + ' meses';
      if (currentCoverageMonths < 1) fundStatus = 'alert';
      else if (currentCoverageMonths < targetMonths) fundStatus = 'warning';
      else fundStatus = 'optimal';
    } else if (emergencyFund.currentSaved > 0) {
      fundFormatted = 'Sin gastos esenciales para comparar';
      fundStatus = 'neutral';
    }

    var indFundCoverage = {
      id: 'ind-fund-coverage',
      name: 'Cobertura del Fondo de Emergencia',
      value: currentCoverageMonths,
      formattedValue: fundFormatted,
      period: 'Acumulado actual',
      description: 'Meses de gastos esenciales que puede cubrir el fondo actual ante imprevistos.',
      formula: 'Monto Ahorrado en Fondo / Gastos Esenciales Mensuales',
      status: fundStatus,
    };

    // 4. Carga Financiera por Endeudamiento (DTI)
    var activeDebts = debts.filter(function (d) {
      return d.status === 'active';
    });
    var totalMonthlyDebtPayments = activeDebts.reduce(function (acc, d) {
      return acc + (Number(d.minimumMonthlyPayment) || 0);
    }, 0);

    var debtFormatted = activeDebts.length > 0 ? 'Cuotas sin ingresos registrados' : 'Sin deudas';
    var debtStatus = activeDebts.length > 0 ? 'alert' : 'neutral';
    var debtServiceRatio = 0;

    if (hasIncome && activeDebts.length > 0) {
      debtServiceRatio = safeDivide(totalMonthlyDebtPayments, summary.totalIncome, 0);
      debtFormatted = formatPercentage(debtServiceRatio);
      if (debtServiceRatio > params.dtiAlertThreshold) debtStatus = 'alert';
      else if (debtServiceRatio > params.dtiWarningThreshold) debtStatus = 'warning';
      else debtStatus = 'optimal';
    } else if (activeDebts.length === 0) {
      debtFormatted = 'Sin deudas activas';
      debtStatus = hasIncome ? 'optimal' : 'neutral';
    }

    var indDebtRatio = {
      id: 'ind-debt-burden',
      name: 'Carga Financiera por Obligaciones (DTI)',
      value: debtServiceRatio,
      formattedValue: debtFormatted,
      period: 'Mes actual',
      description: 'Porcentaje de los ingresos comprometido en cuotas mensuales de deudas y préstamos.',
      formula: '(Total Cuotas Mensuales de Deuda / Ingresos Totales) * 100',
      status: debtStatus,
    };

    // 5. Cumplimiento Global del Presupuesto
    var budgetExecutionRatio = 0;
    var budgetFormatted = 'Sin presupuesto creado';
    var budgetStatus = 'neutral';

    if (budget && budget.categoryLimits) {
      var totalAllocatedBudget = budget.categoryLimits.reduce(function (acc, c) {
        return acc + (Number(c.allocatedAmount) || 0);
      }, 0);

      if (totalAllocatedBudget > 0) {
        budgetExecutionRatio = safeDivide(summary.totalExpenses, totalAllocatedBudget, 0);
        budgetFormatted = formatPercentage(budgetExecutionRatio);
        if (budgetExecutionRatio > 1.0) budgetStatus = 'alert';
        else if (budgetExecutionRatio > 0.9) budgetStatus = 'warning';
        else budgetStatus = 'optimal';
      } else {
        budgetFormatted = 'Presupuesto en 0';
      }
    }

    var indBudgetExecution = {
      id: 'ind-budget-execution',
      name: 'Ejecución del Presupuesto Mensual',
      value: budgetExecutionRatio,
      formattedValue: budgetFormatted,
      period: 'Mes actual',
      description: 'Proporción del presupuesto planificado consumida en el periodo.',
      formula: '(Gasto Real del Mes / Presupuesto Total Planificado) * 100',
      status: budgetStatus,
    };

    // 6. Avance General de Metas Financieras
    var activeGoals = goals.filter(function (g) {
      return g.status === 'active';
    });
    var totalGoalsTarget = activeGoals.reduce(function (acc, g) {
      return acc + (Number(g.targetAmount) || 0);
    }, 0);
    var totalGoalsSaved = activeGoals.reduce(function (acc, g) {
      return acc + (Number(g.currentAmount) || 0);
    }, 0);

    var goalsProgressRatio = totalGoalsTarget > 0 ? safeDivide(totalGoalsSaved, totalGoalsTarget, 0) : 0;
    var goalsFormatted = activeGoals.length > 0 ? formatPercentage(goalsProgressRatio) : 'Sin metas activas';

    // Evaluacion por ritmo: avance real frente al avance esperado segun la fecha objetivo
    var now = new Date();
    var overdueGoals = 0;
    var behindGoals = 0;
    var datedGoals = 0;
    activeGoals.forEach(function (g) {
      var target = Number(g.targetAmount) || 0;
      var saved = Number(g.currentAmount) || 0;
      if (!g.deadline || target <= 0) return;
      var end = new Date(g.deadline + 'T23:59:59');
      if (isNaN(end.getTime())) return;
      datedGoals++;
      if (end < now && saved < target) {
        overdueGoals++;
        return;
      }
      var start = g.createdAt ? new Date(g.createdAt + 'T00:00:00') : null;
      if (!start || isNaN(start.getTime()) || end <= start) return;
      var expected = Math.min(1, Math.max(0, (now - start) / (end - start)));
      if (saved / target < expected - 0.15) behindGoals++;
    });

    var goalsStatus = 'neutral';
    if (activeGoals.length > 0) {
      if (overdueGoals > 0) goalsStatus = 'alert';
      else if (behindGoals > 0) goalsStatus = 'warning';
      else if (datedGoals > 0 || goalsProgressRatio > 0) goalsStatus = 'optimal';
    }

    var indGoalsProgress = {
      id: 'ind-goals-progress',
      name: 'Progreso Consolidado de Metas',
      value: goalsProgressRatio,
      formattedValue: goalsFormatted,
      period: 'Consolidado',
      description: 'Avance acumulado de tus metas activas. Es óptimo si van al ritmo de su fecha objetivo, precaución si alguna va retrasada y alerta si alguna venció sin completarse.',
      formula: '(Ahorro Acumulado en Metas / Valor Objetivo Total) * 100',
      status: goalsStatus,
    };

    return [
      indExpenseIncome,
      indSavingsRate,
      indFundCoverage,
      indDebtRatio,
      indBudgetExecution,
      indGoalsProgress,
    ];
  }

  return {
    calculateFinancialSummary: calculateFinancialSummary,
    filterTransactionsByMonth: filterTransactionsByMonth,
    calculateIndicators: calculateIndicators,
  };
});

/* Modulo de deudas y obligaciones financieras: gestion, DTI y simulacion de pagos */

(function (root) {
  'use strict';

  root.FinApp = root.FinApp || {};

  var Fmt = (typeof window !== 'undefined' ? window.FinFormatters : null) || root.FinFormatters;
  var safeDivide = Fmt.safeDivide;

  function triggerPersist() {
    if (root.FinApp && typeof root.FinApp.persistData === 'function') {
      root.FinApp.persistData();
    }
  }

  // Caso de uso: Gestionar deudas
  function crearDeuda(debtData) {
    if (!root.FinApp.state || !root.FinApp.state.data) return null;
    var debts = root.FinApp.state.data.debts || [];
    var initial = Number(debtData.initialAmount) || 0;
    var remaining = debtData.remainingAmount !== undefined ? Number(debtData.remainingAmount) : initial;

    var newDebt = {
      id: Fmt.generateId('debt'),
      name: (debtData.name || 'Obligación').trim(),
      creditor: (debtData.creditor || '').trim(),
      initialAmount: initial,
      remainingAmount: remaining,
      minimumMonthlyPayment: Number(debtData.minimumMonthlyPayment) || 0,
      annualInterestRate: Number(debtData.annualInterestRate) || 0,
      dueDayOfMonth: parseInt(debtData.dueDayOfMonth, 10) || 15,
      type: debtData.type || 'prestamo',
      status: 'active',
      createdAt: Fmt.getCurrentDateISO(),
    };

    debts.push(newDebt);
    root.FinApp.state.data.debts = debts;
    triggerPersist();
    return newDebt;
  }
  function eliminarDeuda(debtId) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var initLen = root.FinApp.state.data.debts.length;
    root.FinApp.state.data.debts = root.FinApp.state.data.debts.filter(function (d) {
      return d.id !== debtId;
    });
    var changed = root.FinApp.state.data.debts.length < initLen;
    if (changed) triggerPersist();
    return changed;
  }

  function registrarPagoCuota(debtId, amountPaid) {
    if (!root.FinApp.state || !root.FinApp.state.data) return false;
    var amt = Number(amountPaid) || 0;
    if (amt <= 0) return false;
    var debts = root.FinApp.state.data.debts || [];

    for (var i = 0; i < debts.length; i++) {
      if (debts[i].id === debtId) {
        var currentRemaining = Number(debts[i].remainingAmount) || 0;
        var newRemaining = Math.max(0, currentRemaining - amt);
        debts[i].remainingAmount = newRemaining;
        if (newRemaining <= 0) {
          debts[i].status = 'paid';
          debts[i].paidAt = Fmt.getCurrentDateISO();
        }

        // Registrar movimiento automatico de gasto de deuda si no existe
        var catDeuda = null;
        var cats = root.FinApp.state.data.categories || [];
        for (var c = 0; c < cats.length; c++) {
          if (cats[c].id === 'exp-deudas' || cats[c].group === 'savings_debt') {
            catDeuda = cats[c].id;
            break;
          }
        }

        if (catDeuda && root.FinApp.gestionFinanciera) {
          root.FinApp.gestionFinanciera.crearGasto({
            amount: amt,
            description: 'Cuota de deuda: ' + debts[i].name,
            categoryId: catDeuda,
            date: Fmt.getCurrentDateISO(),
            notes: 'Abono registrado desde módulo de deudas.',
          });
        }

        triggerPersist();
        return true;
      }
    }
    return false;
  }

  // Caso de uso: Calcular carga financiera (DTI)
  function calcularCargaFinancieraDTI(debts, totalMonthlyIncome) {
    debts = debts || [];
    var income = Number(totalMonthlyIncome) || 0;

    var activeDebts = debts.filter(function (d) {
      return d.status === 'active';
    });

    var totalMonthlyPayments = activeDebts.reduce(function (sum, d) {
      return sum + (Number(d.minimumMonthlyPayment) || 0);
    }, 0);

    var totalRemaining = activeDebts.reduce(function (sum, d) {
      return sum + (Number(d.remainingAmount) || 0);
    }, 0);

    var ratio = income > 0 ? safeDivide(totalMonthlyPayments, income, 0) : 0;
    var params = window.FinStorage ? window.FinStorage.getSystemParams() : { dtiWarningThreshold: 0.20, dtiAlertThreshold: 0.35 };

    var status = 'optimal';
    var statusLabel = 'Saludable';
    if (ratio > params.dtiAlertThreshold) {
      status = 'alert';
      statusLabel = 'Critico';
    } else if (ratio > params.dtiWarningThreshold) {
      status = 'warning';
      statusLabel = 'Alerta moderada';
    }

    return {
      activeDebtsCount: activeDebts.length,
      totalMonthlyPayments: totalMonthlyPayments,
      totalRemaining: totalRemaining,
      totalIncome: income,
      dtiRatio: ratio,
      dtiPercent: ratio * 100,
      formattedDTI: (ratio * 100).toFixed(1) + '%',
      status: status,
      statusLabel: statusLabel,
    };
  }

  // Caso de uso: Simular pago
  function simularPago(debtId, extraPaymentAmount, totalMonthlyIncome, allDebts) {
    allDebts = allDebts || (root.FinApp.state ? root.FinApp.state.data.debts : []);
    extraPaymentAmount = Number(extraPaymentAmount) || 0;

    var debt = null;
    for (var i = 0; i < allDebts.length; i++) {
      if (allDebts[i].id === debtId) {
        debt = allDebts[i];
        break;
      }
    }

    if (!debt) return null;

    var currentRemaining = Number(debt.remainingAmount) || 0;
    var monthlyPayment = Number(debt.minimumMonthlyPayment) || 0;
    var initialMonths = monthlyPayment > 0 ? Math.ceil(currentRemaining / monthlyPayment) : 0;

    var newRemaining = Math.max(0, currentRemaining - extraPaymentAmount);
    var newMonths = monthlyPayment > 0 ? Math.ceil(newRemaining / monthlyPayment) : 0;
    var monthsSaved = Math.max(0, initialMonths - newMonths);

    // Calculo de DTI actual y simulado
    var currentDTI = calcularCargaFinancieraDTI(allDebts, totalMonthlyIncome);

    // Si el abono liquida totalmente la deuda, su cuota mensual desaparece de las obligaciones activas
    var simulatedDebts = allDebts.map(function (d) {
      if (d.id === debtId) {
        return {
          id: d.id,
          status: newRemaining <= 0 ? 'paid' : 'active',
          minimumMonthlyPayment: newRemaining <= 0 ? 0 : d.minimumMonthlyPayment,
          remainingAmount: newRemaining,
        };
      }
      return d;
    });

    var simulatedDTI = calcularCargaFinancieraDTI(simulatedDebts, totalMonthlyIncome);

    return {
      debtId: debtId,
      debtName: debt.name,
      currentRemaining: currentRemaining,
      extraPayment: extraPaymentAmount,
      newRemaining: newRemaining,
      isFullyPaid: newRemaining <= 0,
      currentMonthsRemaining: initialMonths,
      newMonthsRemaining: newMonths,
      monthsSaved: monthsSaved,
      currentDTI: currentDTI.dtiPercent,
      newDTI: simulatedDTI.dtiPercent,
      dtiReduction: Math.max(0, currentDTI.dtiPercent - simulatedDTI.dtiPercent),
    };
  }

  // Render de la vista de Deudas
  function renderDebts(derived) {
    var debts = root.FinApp.state.data.debts || [];
    var dtiData = calcularCargaFinancieraDTI(debts, derived.summary.totalIncome);
    var activeDebts = debts.filter(function (d) { return d.status === 'active'; });

    var html = '';

    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">';
    html += '    <div>';
    html += '      <h1 class="surface-title" style="font-size:1.25rem;">Gestión de Deudas y Obligaciones</h1>';
    html += '      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Administra tus créditos, calcula tu carga de endeudamiento (DTI) y simula abonos extraordinarios.</p>';
    html += '    </div>';
    html += '    <button class="btn-primary" id="btn-new-debt">+ Nueva Obligación</button>';
    html += '  </div>';
    html += '</div>';

    // Fila Superior: Resumen DTI y Metricas
    html += '<div style="display:grid;grid-template-columns:1.8fr 1fr 1fr;gap:1.25rem;margin-bottom:1.25rem;">';

    // Tarjeta DTI
    html += '  <div class="surface-card">';
    html += '    <div class="surface-header">';
    html += '      <h2 class="surface-title">Carga Financiera por Endeudamiento (DTI)</h2>';
    html += '      <span class="category-tag" style="background:' + (dtiData.status === 'optimal' ? 'var(--color-income-light)' : (dtiData.status === 'alert' ? 'var(--color-expense-light)' : 'var(--color-warning-light)')) + ';color:' + (dtiData.status === 'optimal' ? 'var(--color-income)' : (dtiData.status === 'alert' ? 'var(--color-expense)' : 'var(--color-warning)')) + ';">' + dtiData.statusLabel + '</span>';
    html += '    </div>';
    html += '    <div style="display:flex;align-items:center;gap:1.5rem;padding:0.5rem 0;">';
    html += '      <div class="font-mono" style="font-size:2.4rem;font-weight:800;color:' + (dtiData.status === 'optimal' ? 'var(--color-income)' : (dtiData.status === 'alert' ? 'var(--color-expense)' : 'var(--color-warning)')) + ';line-height:1;">' + dtiData.formattedDTI + '</div>';
    html += '      <div style="flex:1;font-size:0.8rem;color:var(--text-secondary);line-height:1.4;">';
    html += '        De tus ingresos mensuales (' + Fmt.formatCOP(derived.summary.totalIncome) + '), destinas <strong>' + Fmt.formatCOP(dtiData.totalMonthlyPayments) + '</strong> al pago de cuotas de deuda.';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    // Saldo Total Pendiente
    html += '  <div class="surface-card" style="display:flex;flex-direction:column;justify-content:center;">';
    html += '    <div style="font-size:0.75rem;color:var(--text-secondary);">Saldo Total Pendiente</div>';
    html += '    <div class="font-mono" style="font-size:1.4rem;font-weight:800;color:var(--color-expense);margin-top:0.25rem;">' + Fmt.formatCOP(dtiData.totalRemaining) + '</div>';
    html += '    <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:0.2rem;">En ' + activeDebts.length + ' deudas activas</div>';
    html += '  </div>';

    // Cuota Total Mensual
    html += '  <div class="surface-card" style="display:flex;flex-direction:column;justify-content:center;">';
    html += '    <div style="font-size:0.75rem;color:var(--text-secondary);">Cuotas Mensuales Fijas</div>';
    html += '    <div class="font-mono" style="font-size:1.4rem;font-weight:800;margin-top:0.25rem;">' + Fmt.formatCOP(dtiData.totalMonthlyPayments) + '</div>';
    html += '    <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:0.2rem;">Compromiso mensual</div>';
    html += '  </div>';

    html += '</div>';

    // Listado de Obligaciones
    html += '<div class="surface-card">';
    html += '  <div class="surface-header">';
    html += '    <h2 class="surface-title">Obligaciones Registradas (' + debts.length + ')</h2>';
    html += '  </div>';

    if (debts.length === 0) {
      html += '  <div style="text-align:center;padding:3rem 1rem;color:var(--text-tertiary);">';
      html += '    <div style="font-size:1rem;margin-bottom:0.5rem;">No tienes deudas u obligaciones registradas.</div>';
      html += '    <div style="font-size:0.8rem;margin-bottom:1rem;">Si tienes préstamos, tarjetas o créditos universitarios, regístralos para monitorear tu DTI.</div>';
      html += '    <button class="btn-primary" id="btn-empty-new-debt">+ Registrar Deuda</button>';
      html += '  </div>';
    } else {
      html += '  <div class="fin-table-wrapper">';
      html += '    <table class="fin-table">';
      html += '      <thead>';
      html += '        <tr>';
      html += '          <th>Obligación / Acreedor</th>';
      html += '          <th>Tipo</th>';
      html += '          <th style="text-align:right;">Saldo Pendiente</th>';
      html += '          <th style="text-align:right;">Cuota Mensual</th>';
      html += '          <th>Día Pago</th>';
      html += '          <th>Estado</th>';
      html += '          <th style="text-align:right;">Acciones</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';

      debts.forEach(function (d) {
        var isPaid = d.status === 'paid';
        html += '        <tr>';
        html += '          <td>';
        html += '            <div style="font-weight:600;font-size:0.85rem;">' + d.name + '</div>';
        if (d.creditor) {
          html += '            <div style="font-size:0.75rem;color:var(--text-tertiary);">' + d.creditor + '</div>';
        }
        html += '          </td>';
        html += '          <td style="font-size:0.8rem;color:var(--text-secondary);">' + ({ prestamo: 'Préstamo personal', tarjeta: 'Tarjeta de crédito', educativo: 'Crédito educativo', otro: 'Otro' }[d.type] || 'Préstamo personal') + '</td>';
        html += '          <td class="font-mono" style="text-align:right;font-weight:700;color:' + (isPaid ? 'var(--text-tertiary)' : 'var(--color-expense)') + ';">' + Fmt.formatCOP(d.remainingAmount) + '</td>';
        html += '          <td class="font-mono" style="text-align:right;">' + Fmt.formatCOP(d.minimumMonthlyPayment) + '</td>';
        html += '          <td style="font-size:0.8rem;color:var(--text-secondary);">Día ' + (d.dueDayOfMonth || 15) + '</td>';
        html += '          <td><span class="category-tag" style="background:' + (isPaid ? 'var(--color-income-light)' : 'var(--color-warning-light)') + ';color:' + (isPaid ? 'var(--color-income)' : 'var(--color-warning)') + ';">' + (isPaid ? 'Liquidada' : 'Activa') + '</span></td>';
        html += '          <td style="text-align:right;white-space:nowrap;">';
        if (!isPaid) {
          html += '            <button class="btn-secondary" data-action="simulate-debt-payment" data-id="' + d.id + '" style="font-size:0.75rem;padding:0.3rem 0.55rem;margin-right:0.4rem;">Simular pago</button>';
          html += '            <button class="btn-primary" data-action="pay-debt" data-id="' + d.id + '" data-min="' + d.minimumMonthlyPayment + '" style="font-size:0.75rem;padding:0.3rem 0.55rem;margin-right:0.4rem;">Pagar cuota</button>';
        }
        html += '            <button class="text-link danger" data-action="delete-debt" data-id="' + d.id + '" style="font-size:0.8rem;">Eliminar</button>';
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

  // Modal para Simular Pago de Deuda
  function abrirModalSimularPago(debtId) {
    var debts = root.FinApp.state.data.debts || [];
    var debt = null;
    for (var i = 0; i < debts.length; i++) {
      if (debts[i].id === debtId) {
        debt = debts[i];
        break;
      }
    }
    if (!debt) return;

    var derived = root.FinApp.getDerivedState();
    var modalOverlay = document.getElementById('app-modal-overlay');
    var modalContent = document.getElementById('app-modal-content');
    if (!modalOverlay || !modalContent) return;

    var defaultAbono = 0;
    var sim = simularPago(debtId, defaultAbono, derived.summary.totalIncome, debts);

    var html = '';
    html += '<div class="modal-card" style="max-width:520px;">';
    html += '  <div class="modal-header">';
    html += '    <div>';
    html += '      <h2 class="modal-title">Simulador de Pago de Deuda</h2>';
    html += '      <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">' + debt.name + ' - Saldo actual: <strong class="font-mono">' + Fmt.formatCOP(debt.remainingAmount) + '</strong></div>';
    html += '    </div>';
    html += '    <button class="text-link" id="btn-close-modal">Cerrar</button>';
    html += '  </div>';

    html += '  <div style="margin-bottom:1.25rem;">';
    html += '    <div class="form-group">';
    html += '      <label class="form-label">Monto de Abono Extraordinario Propuesto (COP) *</label>';
    html += '      <input type="text" id="sim-debt-payment-input" class="form-control font-mono" placeholder="Monto" style="font-size:1.1rem;font-weight:700;">';
    html += '    </div>';
    html += '  </div>';

    html += '  <div id="sim-debt-results-box" style="padding:1rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);margin-bottom:1.5rem;">';
    html += '    <div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:0.75rem;">Proyección tras el abono:</div>';
    html += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.75rem;">';
    html += '      <div>';
    html += '        <div style="font-size:0.75rem;color:var(--text-secondary);">Nuevo Saldo Pendiente:</div>';
    html += '        <div id="sim-res-new-rem" class="font-mono" style="font-size:1rem;font-weight:700;color:var(--color-expense);">' + Fmt.formatCOP(sim.newRemaining) + '</div>';
    html += '      </div>';
    html += '      <div>';
    html += '        <div style="font-size:0.75rem;color:var(--text-secondary);">Meses Restantes Estimados:</div>';
    html += '        <div id="sim-res-months" class="font-mono" style="font-size:1rem;font-weight:700;">' + sim.newMonthsRemaining + ' meses <span style="font-size:0.75rem;color:var(--color-income);">(-' + sim.monthsSaved + ')</span></div>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div style="border-top:1px solid var(--border-subtle);padding-top:0.6rem;display:flex;justify-content:space-between;align-items:center;">';
    html += '      <div style="font-size:0.75rem;color:var(--text-secondary);">Nuevo DTI General:</div>';
    html += '      <div id="sim-res-dti" class="font-mono" style="font-size:0.95rem;font-weight:700;color:' + (sim.newDTI <= 20 ? 'var(--color-income)' : 'var(--color-warning)') + ';">' + sim.newDTI.toFixed(1) + '% <span style="font-size:0.75rem;color:var(--color-income);">(-' + sim.dtiReduction.toFixed(1) + '%)</span></div>';
    html += '    </div>';
    html += '  </div>';

    html += '  <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:0.75rem;">';
    html += '    <button type="button" class="btn-secondary" id="btn-modal-cancel">Cerrar</button>';
    html += '  </div>';
    html += '</div>';

    modalContent.innerHTML = html;
    modalOverlay.classList.add('open');

    var cancelBtn = document.getElementById('btn-modal-cancel');
    var closeBtn = document.getElementById('btn-close-modal');
    if (cancelBtn) cancelBtn.onclick = root.FinApp.closeModal;
    if (closeBtn) closeBtn.onclick = root.FinApp.closeModal;

    var inputEl = document.getElementById('sim-debt-payment-input');
    if (inputEl) {
      inputEl.addEventListener('input', function () {
        var rawVal = Fmt.parseThousands(inputEl.value);
        inputEl.value = rawVal ? Fmt.formatThousands(rawVal) : '';
        var updateSim = simularPago(debtId, rawVal, derived.summary.totalIncome, debts);
        var remEl = document.getElementById('sim-res-new-rem');
        var moEl = document.getElementById('sim-res-months');
        var dtiEl = document.getElementById('sim-res-dti');
        if (remEl) remEl.textContent = Fmt.formatCOP(updateSim.newRemaining);
        if (moEl) moEl.innerHTML = updateSim.newMonthsRemaining + ' meses <span style="font-size:0.75rem;color:var(--color-income);">(-' + updateSim.monthsSaved + ')</span>';
        if (dtiEl) dtiEl.innerHTML = updateSim.newDTI.toFixed(1) + '% <span style="font-size:0.75rem;color:var(--color-income);">(-' + updateSim.dtiReduction.toFixed(1) + '%)</span>';
      });
    }
  }

  root.FinApp.deudas = {
    crearDeuda: crearDeuda,
    eliminarDeuda: eliminarDeuda,
    registrarPagoCuota: registrarPagoCuota,
    calcularCargaFinancieraDTI: calcularCargaFinancieraDTI,
    simularPago: simularPago,
    renderDebts: renderDebts,
    abrirModalSimularPago: abrirModalSimularPago,
  };
})(typeof window !== 'undefined' ? window : this);

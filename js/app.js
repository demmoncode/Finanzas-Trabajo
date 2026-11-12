/* FINANZAS APP - orquestador principal, estado reactivo, navegacion y eventos */

(function () {
  'use strict';

  var Fmt = window.FinFormatters;
  var Cat = window.FinCategories;
  var Storage = window.FinStorage;
  var Engine = window.FinEngine;

  window.FinApp = window.FinApp || {};

  // Estado global reactivo en memoria
  var state = {
    activeTab: 'dashboard',
    selectedMonth: Fmt.getCurrentMonthKey(),
    currentUser: null,
    data: null,

    // Filtros de movimientos
    txSearch: '',
    txTypeFilter: 'all',
    txCategoryFilter: 'all',

    // Control de modales y estados de edicion
    activeModal: null,
    editingTxId: null,
    contributeGoalId: null,
    paymentDebtId: null,
    editingCatId: null,
    reassignCatId: null,
    adminEditingUserId: null,

    // Inversión: perfil de riesgo elegido
    investProfile: 'conservador',

    // Modo en pantalla de autenticacion
    isRegisterMode: false,
  };

  window.FinApp.state = state;

  // Inicializar sesion activa o usuario por defecto
  function initUserSession() {
    var session = window.FinApp.autenticacion ? window.FinApp.autenticacion.getActiveSession() : null;
    if (session) {
      state.currentUser = session;
      state.data = Storage.loadUserFinancialData(session.userId);
    } else {
      state.currentUser = null;
      state.data = Storage.loadUserFinancialData('usuario-principal');
    }
  }

  function persistData() {
    if (!state.currentUser) return;
    Storage.saveUserFinancialData(state.currentUser.id, state.data);
  }

  function showToast(message, type, detail) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'fin-toast fin-toast-' + type;

    var accent = { alert: 'var(--color-warning)', success: 'var(--color-income)', warning: 'var(--color-warning)' }[type] || 'var(--color-brand)';
    var title = document.createElement('div');
    title.textContent = message;
    toast.appendChild(title);
    if (detail) {
      var body = document.createElement('div');
      body.textContent = detail;
      body.style.cssText = 'font-weight:400;font-size:0.8rem;color:var(--text-secondary);margin-top:0.3rem;line-height:1.4;';
      toast.appendChild(body);
    }

    toast.style.cssText =
      'position:fixed;bottom:1.5rem;right:1.5rem;max-width:380px;background:var(--bg-surface);color:var(--text-primary);' +
      'border:1px solid var(--border-card);border-left:4px solid ' + accent + ';padding:0.65rem 1.1rem;border-radius:var(--radius-md);' +
      'box-shadow:var(--shadow-modal);font-size:0.82rem;font-weight:600;z-index:9999;';

    // Los toasts anteriores suben para no taparse
    var old = document.querySelectorAll('.fin-toast');
    old.forEach(function (el) {
      if (el !== toast) el.style.bottom = (parseFloat(el.style.bottom) + 5.5) + 'rem';
    });

    document.body.appendChild(toast);
    var duration = detail ? Math.min(12000, 4000 + detail.length * 45) : 2800;
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, duration);
  }

  // Confirma la acción y agrega la recomendación inmediata según los datos actualizados
  function confirmarConRecomendacion(message, event, monthKey) {
    var Rules = window.FinRecommendations;
    var reaction = null;
    if (Rules && Rules.evaluateEvent && state.data) {
      try {
        reaction = Rules.evaluateEvent(event, state.data, monthKey || state.selectedMonth);
      } catch (err) {
        reaction = null;
      }
    }
    if (reaction) showToast(message, reaction.tone, reaction.text);
    else showToast(message);
  }

  function navigateTo(tabId) {
    if (state.currentUser && state.currentUser.role === 'superadmin') {
      state.activeTab = 'admin';
      renderApp();
      return;
    }
    state.activeTab = tabId;
    renderApp();
  }

  function formatMoneyInputInRealTime(input) {
    if (!input) return;
    var oldVal = input.value;
    var cursor = input.selectionStart || 0;
    var digitsBeforeCursor = (oldVal.slice(0, cursor).match(/\d/g) || []).length;

    var digitsOnly = oldVal.replace(/\D/g, '');
    if (!digitsOnly) {
      input.value = '';
      return;
    }

    var formatted = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = formatted;

    var newCursor = 0;
    var digitsFound = 0;
    while (newCursor < formatted.length && digitsFound < digitsBeforeCursor) {
      if (/\d/.test(formatted.charAt(newCursor))) {
        digitsFound++;
      }
      newCursor++;
    }
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(newCursor, newCursor);
    }
  }

  function isMoneyInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.getAttribute('data-money') === 'true') return true;
    if (el.classList && el.classList.contains('budget-limit-input')) return true;
    var id = el.id || '';
    var moneyIds = [
      'modal-tx-amount',
      'budget-expected-income',
      'budget-target-savings',
      'goal-target',
      'goal-current',
      'goal-contrib-amount',
      'fund-contrib-input',
      'fund-target-contrib',
      'debt-remaining',
      'debt-monthly',
      'debt-pay-amount',
      'sim-debt-payment-input',
      'param-min-emergency-fund',
    ];
    return moneyIds.indexOf(id) > -1;
  }

  function updateLiveBudgetCalculations() {
    var incEl = document.getElementById('budget-expected-income');
    var savEl = document.getElementById('budget-target-savings');
    if (!incEl) return;

    var expInc = Fmt.parseThousands(incEl.value);
    var tarSav = savEl ? Fmt.parseThousands(savEl.value) : 0;
    var totalAllocated = 0;
    document.querySelectorAll('.budget-limit-input').forEach(function (inp) {
      totalAllocated += Fmt.parseThousands(inp.value);
    });

    var margin = expInc - tarSav - totalAllocated;
    var totalAllocEl = document.getElementById('budget-total-allocated');
    var marginEl = document.getElementById('budget-margin-display');
    if (totalAllocEl) totalAllocEl.textContent = Fmt.formatCOP(totalAllocated);
    if (marginEl) {
      marginEl.textContent = Fmt.formatCOP(margin);
      marginEl.style.color = margin >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    }
  }

  function attachCurrencyMask(inputElement, onValueChange) {
    if (!inputElement) return;

    inputElement.addEventListener('input', function () {
      formatMoneyInputInRealTime(inputElement);
      var parsed = Fmt.parseThousands(inputElement.value);
      if (typeof onValueChange === 'function') {
        onValueChange(parsed);
      }
    });

    inputElement.addEventListener('blur', function () {
      formatMoneyInputInRealTime(inputElement);
      var parsed = Fmt.parseThousands(inputElement.value);
      if (typeof onValueChange === 'function') {
        onValueChange(parsed);
      }
    });
  }

  // Calculo del estado financiero derivado
  function getDerivedState() {
    var txs = state.data ? (state.data.transactions || []) : [];
    var categories = state.data ? (state.data.categories || Cat.DEFAULT_CATEGORIES) : Cat.DEFAULT_CATEGORIES;
    var currentMonthTxs = Engine.filterTransactionsByMonth(txs, state.selectedMonth);

    var currentBudget = null;
    if (state.data && state.data.budgets) {
      for (var b = 0; b < state.data.budgets.length; b++) {
        if (state.data.budgets[b].month === state.selectedMonth) {
          currentBudget = state.data.budgets[b];
          break;
        }
      }
    }

    var summary = Engine.calculateFinancialSummary(currentMonthTxs, categories);

    var indicators = [];
    if (window.FinApp.analisis) {
      indicators = window.FinApp.analisis.calcularIndicadores(
        currentMonthTxs,
        categories,
        state.data ? state.data.emergencyFund : null,
        state.data ? state.data.debts : null,
        state.data ? state.data.goals : null,
        currentBudget,
        window.FinInvest && state.data ? window.FinInvest.essentialBaseline(state.data, Fmt.getCurrentDateISO()) : 0
      );
    }

    var recommendations = [];
    if (window.FinApp.recomendaciones) {
      recommendations = window.FinApp.recomendaciones.obtenerRecomendaciones(state.data, state.selectedMonth);
    }

    // Historial de los ultimos 6 meses
    var sixMonthsData = [];
    var parts = state.selectedMonth.split('-').map(Number);
    var targetYear = parts[0];
    var targetMonth = parts[1];

    for (var i = 5; i >= 0; i--) {
      var d = new Date(targetYear, targetMonth - 1 - i, 1);
      var mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var mTxs = Engine.filterTransactionsByMonth(txs, mKey);
      var mSum = Engine.calculateFinancialSummary(mTxs, categories);
      var mLabel = new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(d);
      sixMonthsData.push({
        monthKey: mKey,
        label: mLabel.charAt(0).toUpperCase() + mLabel.slice(1).replace('.', ''),
        income: mSum.totalIncome,
        expenses: mSum.totalExpenses,
      });
    }

    return {
      currentMonthTxs: currentMonthTxs,
      summary: summary,
      currentBudget: currentBudget,
      indicators: indicators,
      recommendations: recommendations,
      sixMonthsData: sixMonthsData,
    };
  }

  // Render de Ajustes y Perfil
  function renderProfile() {
    var p = state.data.profile || {};
    var session = state.currentUser || {};
    var html = '';

    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <h1 class="surface-title" style="font-size:1.25rem;">Ajustes de Perfil y Sistema</h1>';
    html += '  <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Administra tus datos personales, credenciales de acceso y configuración local.</p>';
    html += '</div>';

    // Formulario de Perfil
    html += '<div class="surface-card" style="margin-bottom:1.5rem;">';
    html += '  <h2 class="surface-title" style="font-size:0.95rem;margin-bottom:1rem;">Información del Usuario</h2>';
    html += '  <form id="form-profile">';
    html += '    <div class="form-grid-2">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Nombre Completo *</label>';
    html += '        <input type="text" id="prof-name" class="form-control" value="' + (session.name || p.name || 'Mi Cuenta') + '" required>';
    html += '      </div>';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Correo Electrónico *</label>';
    html += '        <input type="email" id="prof-email" class="form-control" value="' + (session.email || p.email || '') + '" required>';
    html += '      </div>';
    html += '    </div>';

    html += '    <div class="form-grid-2">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Universidad / Institución</label>';
    html += '        <input type="text" id="prof-univ" class="form-control" placeholder="Ej. Universidad Nacional" value="' + (p.university || '') + '">';
    html += '      </div>';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Carrera / Programa</label>';
    html += '        <input type="text" id="prof-career" class="form-control" placeholder="Ej. Ingenieria de Sistemas" value="' + (p.career || '') + '">';
    html += '      </div>';
    html += '    </div>';

    html += '    <div style="border-top:1px solid var(--border-subtle);padding-top:1rem;margin-top:0.5rem;">';
    html += '      <div style="font-size:0.8rem;font-weight:600;margin-bottom:0.75rem;">Cambiar Contraseña (Opcional)</div>';
    html += '      <div class="form-grid-2">';
    html += '        <div class="form-group">';
    html += '          <label class="form-label">Contraseña Actual</label>';
    html += '          <input type="password" id="prof-current-pw" class="form-control" placeholder="Solo si deseas cambiarla">';
    html += '        </div>';
    html += '        <div class="form-group">';
    html += '          <label class="form-label">Nueva Contraseña</label>';
    html += '          <input type="password" id="prof-new-pw" class="form-control" placeholder="Nueva contraseña">';
    html += '        </div>';
    html += '      </div>';
    html += '    </div>';

    html += '    <div style="display:flex;justify-content:flex-end;margin-top:1rem;">';
    html += '      <button type="submit" class="btn-primary">Guardar Cambios</button>';
    html += '    </div>';
    html += '  </form>';
    html += '</div>';

    // Gestor de Categorias Integrado
    if (window.FinApp.gestionFinanciera) {
      html += window.FinApp.gestionFinanciera.renderCategoriasManager();
    }

    // Copia de Seguridad y Mantenimiento
    html += '<div class="surface-card" style="margin-top:1.5rem;">';
    html += '  <h2 class="surface-title" style="font-size:0.95rem;margin-bottom:0.5rem;">Respaldo y Reinicio de Datos</h2>';
    html += '  <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;">Descarga una copia de seguridad en JSON o reinicia el almacenamiento de tu cuenta.</p>';
    html += '  <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">';
    html += '    <button class="btn-secondary" id="btn-export-json">Descargar Copia de Seguridad JSON</button>';
    html += '    <button class="btn-secondary" id="btn-wipe-data" style="color:var(--color-expense);">Reiniciar Datos a Cero</button>';
    html += '  </div>';
    html += '</div>';

    return html;
  }

  // RENDERIZADO GENERAL Y CONTROLADOR DOM
  function renderApp() {
    var mainEl = document.getElementById('main-module-content');
    var sidebarEl = document.querySelector('.sidebar');
    var topHeaderEl = document.querySelector('.top-header');
    if (!mainEl) return;

    // 1. Validar sesion
    if (!state.currentUser) {
      if (sidebarEl) sidebarEl.style.display = 'none';
      if (topHeaderEl) topHeaderEl.style.display = 'none';
      mainEl.innerHTML = window.FinApp.autenticacion.renderAuthView(state.isRegisterMode);
      return;
    }

    // Mostrar sidebar y header
    if (sidebarEl) sidebarEl.style.display = 'flex';
    if (topHeaderEl) topHeaderEl.style.display = 'flex';

    // 2. Si es SuperAdmin, renderizar exclusivamente su panel
    if (state.currentUser.role === 'superadmin') {
      var navButtons = document.querySelectorAll('.nav-button');
      navButtons.forEach(function (btn) {
        var tab = btn.getAttribute('data-tab');
        if (tab === 'admin') btn.classList.add('active');
        else btn.classList.remove('active');
      });

      // Ocultar botones de usuario en header y mostrar datos de admin
      var currSelWrap = document.getElementById('header-currency-selector-wrap');
      var fxBtn = document.getElementById('btn-fx-details');
      var periodWrap = document.querySelector('.period-selector-pill');
      var notifBtn = document.getElementById('header-btn-notifs');
      var newTxBtn = document.getElementById('btn-header-new-tx');

      if (currSelWrap) currSelWrap.style.display = 'none';
      if (fxBtn) fxBtn.style.display = 'none';
      if (periodWrap) periodWrap.style.display = 'none';
      if (notifBtn) notifBtn.style.display = 'none';
      if (newTxBtn) newTxBtn.style.display = 'none';

      var userNameEl = document.getElementById('header-user-name');
      var userEmailEl = document.getElementById('header-user-email');
      if (userNameEl) userNameEl.textContent = state.currentUser.name || 'SuperAdmin';
      if (userEmailEl) userEmailEl.textContent = state.currentUser.email || 'admin@finanzas.local';

      // Ajustar visibilidad de grupos en sidebar para SuperAdmin
      var navGroups = document.querySelectorAll('.nav-group');
      navGroups.forEach(function (g) { g.style.display = 'none'; });

      var profileBtn = document.querySelector('.nav-button[data-tab="profile"]');
      if (profileBtn) profileBtn.style.display = 'none';

      // Asegurar boton Cerrar Sesion en sidebar
      ensureSidebarLogoutBtn();

      mainEl.innerHTML = window.FinApp.administracion.renderAdminView();
      return;
    }

    // 3. Usuario Normal: Restaurar elementos financieros
    var navGroupsUser = document.querySelectorAll('.nav-group');
    navGroupsUser.forEach(function (g) { g.style.display = 'block'; });

    var profileBtnUser = document.querySelector('.nav-button[data-tab="profile"]');
    if (profileBtnUser) profileBtnUser.style.display = 'flex';

    // Encabezado: moneda, fecha y notificaciones siempre; tasa, cuenta y boton solo en el Resumen
    var enResumen = state.activeTab === 'dashboard';
    var headerItems = [
      { el: document.getElementById('header-currency-selector-wrap'), show: true, display: 'flex' },
      { el: document.querySelector('.period-selector-pill'), show: true, display: 'flex' },
      { el: document.getElementById('header-btn-notifs'), show: true, display: 'inline-flex' },
      { el: document.getElementById('btn-fx-details'), show: enResumen, display: 'flex' },
      { el: document.getElementById('header-profile-widget'), show: enResumen, display: 'flex' },
      { el: document.getElementById('btn-header-new-tx'), show: enResumen, display: 'inline-flex' }
    ];
    headerItems.forEach(function (item) {
      if (item.el) item.el.style.display = item.show ? item.display : 'none';
    });

    ensureSidebarLogoutBtn();

    var derived = getDerivedState();
    var pName = (state.data && state.data.profile && state.data.profile.name) ? state.data.profile.name.trim() : (state.currentUser.name || 'Mi Cuenta');
    var userNameElUser = document.getElementById('header-user-name');
    var userEmailElUser = document.getElementById('header-user-email');
    if (userNameElUser) userNameElUser.textContent = pName;
    if (userEmailElUser) userEmailElUser.textContent = state.currentUser.email || 'Configuración y perfil';

    // Periodo
    var periodInput = document.getElementById('header-period-input');
    if (periodInput && periodInput.value !== state.selectedMonth) {
      periodInput.value = state.selectedMonth;
    }

    // Moneda activa
    var activeCurr = window.FinCurrency ? window.FinCurrency.getActiveCurrency() : 'COP';
    var currSelect = document.getElementById('header-currency-select');
    if (currSelect && currSelect.value !== activeCurr) {
      currSelect.value = activeCurr;
    }

    // Indicador FX en tiempo real
    var fxDot = document.getElementById('fx-status-dot');
    var fxLabel = document.getElementById('fx-indicator-label');
    var fxBtn = document.getElementById('btn-fx-details');
    if (fxDot && fxLabel && window.FinCurrency) {
      var info = window.FinCurrency.getRatesInfo();
      var usdRate = info.ratesInverse && info.ratesInverse.USD ? Math.round(info.ratesInverse.USD) : 3245;
      var eurRate = info.ratesInverse && info.ratesInverse.EUR ? Math.round(info.ratesInverse.EUR) : 3647;
      if (info.isOffline) {
        fxDot.className = 'fx-status-dot offline';
      } else if (info.isCached) {
        fxDot.className = 'fx-status-dot cached';
      } else {
        fxDot.className = 'fx-status-dot online';
      }
      fxLabel.textContent = 'USD: $' + Fmt.formatThousands(usdRate) + ' | EUR: $' + Fmt.formatThousands(eurRate);
      if (fxBtn) {
        fxBtn.title = 'Tasas en tiempo real: 1 USD = $' + Fmt.formatThousands(usdRate) + ' COP | 1 EUR = $' + Fmt.formatThousands(eurRate) + ' COP. Clic para ver detalle.';
      }
    }

    // Badge Notificaciones
    var alerts = derived.recommendations.filter(function (r) { return r.kind === 'alerta'; });
    var highSeverityCount = alerts.filter(function (r) { return r.severity === 'high'; }).length;
    var notifDot = document.getElementById('header-notif-dot');
    if (notifDot) notifDot.style.display = highSeverityCount > 0 ? 'block' : 'none';

    var recBadge = document.getElementById('sidebar-rec-badge');
    if (recBadge) {
      recBadge.textContent = alerts.length;
      recBadge.style.display = alerts.length > 0 ? 'inline-block' : 'none';
    }

    // Pestañas Sidebar
    var navButtonsUser = document.querySelectorAll('.nav-button');
    navButtonsUser.forEach(function (btn) {
      var tab = btn.getAttribute('data-tab');
      if (tab === state.activeTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Render de Vistas
    switch (state.activeTab) {
      case 'dashboard':
        mainEl.innerHTML = window.FinApp.gestionFinanciera.renderDashboard(derived);
        break;
      case 'transactions':
        mainEl.innerHTML = window.FinApp.gestionFinanciera.renderTransactions(derived);
        break;
      case 'budget':
        mainEl.innerHTML = window.FinApp.planificacion.renderBudget(derived);
        break;
      case 'goals':
        mainEl.innerHTML = window.FinApp.planificacion.renderGoals();
        break;
      case 'emergency_fund':
        mainEl.innerHTML = window.FinApp.planificacion.renderEmergencyFund(derived);
        break;
      case 'indicators':
        mainEl.innerHTML = window.FinApp.analisis.renderIndicators(derived);
        break;
      case 'recommendations':
        mainEl.innerHTML = window.FinApp.recomendaciones.renderRecommendations(derived);
        break;
      case 'invest':
        mainEl.innerHTML = window.FinApp.inversion.renderInvestment(derived);
        break;
      case 'debts':
        mainEl.innerHTML = window.FinApp.deudas.renderDebts(derived);
        break;
      case 'history':
        mainEl.innerHTML = window.FinApp.gestionFinanciera.renderHistory(derived);
        break;
      case 'profile':
        mainEl.innerHTML = renderProfile();
        break;
      default:
        mainEl.innerHTML = window.FinApp.gestionFinanciera.renderDashboard(derived);
        break;
    }
  }

  function ensureSidebarLogoutBtn() {
    var footer = document.querySelector('.sidebar-footer');
    if (!footer) return;
    var existing = document.getElementById('btn-sidebar-logout');
    if (!existing) {
      var btn = document.createElement('button');
      btn.className = 'nav-button';
      btn.id = 'btn-sidebar-logout';
      btn.style.padding = '0.5rem 0.75rem';
      btn.style.color = 'var(--color-expense)';
      btn.innerHTML = '<div class="nav-button-left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>Cerrar sesión</span></div>';
      btn.onclick = function () {
        window.FinApp.autenticacion.logout();
      };
      footer.appendChild(btn);
    }
  }

  // MODALES INTERACTIVOS
  function openModal(modalId) {
    var modalOverlay = document.getElementById('app-modal-overlay');
    var modalContent = document.getElementById('app-modal-content');
    if (!modalOverlay || !modalContent) return;

    var html = '';

    if (modalId === 'transaction') {
      var isEditing = !!state.editingTxId;
      var tx = isEditing ? state.data.transactions.find(function (t) { return t.id === state.editingTxId; }) : null;
      var initialType = tx ? tx.type : (state._nextTxType || 'expense');
      var catsForType = state.data.categories.filter(function (c) { return c.type === initialType; });
      var activeGlobalCurr = window.FinCurrency ? window.FinCurrency.getActiveCurrency() : 'COP';
      var initialCurr = tx && tx.originalCurrency ? tx.originalCurrency : activeGlobalCurr;
      var initialAmountVal = tx ? (tx.originalAmount !== undefined ? tx.originalAmount : tx.amount) : '';

      html += '<div class="modal-card">';
      html += '  <div class="modal-header">';
      html += '    <h2 class="modal-title">' + (isEditing ? 'Editar Movimiento' : 'Nuevo Movimiento') + '</h2>';
      html += '    <button class="text-link" id="btn-close-modal">Cerrar</button>';
      html += '  </div>';
      html += '  <form id="form-modal-tx">';
      html += '    <div style="display:flex;gap:0.5rem;background:var(--bg-surface-secondary);padding:0.25rem;border-radius:var(--radius-full);border:1px solid var(--border-subtle);margin-bottom:1rem;">';
      html += '      <button type="button" class="btn-secondary ' + (initialType === 'income' ? 'active' : '') + '" style="flex:1;border:none;border-radius:var(--radius-full);color:var(--color-income);" id="modal-tx-type-inc">+ Ingreso</button>';
      html += '      <button type="button" class="btn-secondary ' + (initialType === 'expense' ? 'active' : '') + '" style="flex:1;border:none;border-radius:var(--radius-full);color:var(--color-expense);" id="modal-tx-type-exp">- Gasto</button>';
      html += '    </div>';
      html += '    <div class="form-grid-2">';
      html += '      <div class="form-group">';
      html += '        <label class="form-label" id="modal-tx-amount-label">Monto (' + initialCurr + ') *</label>';
      html += '        <input type="text" id="modal-tx-amount" class="form-control font-mono" placeholder="Monto" required value="' + (initialAmountVal !== '' ? (initialCurr === 'COP' ? Fmt.formatThousands(initialAmountVal) : initialAmountVal) : '') + '" style="font-size:1.1rem;font-weight:700;">';
      html += '      </div>';
      html += '      <div class="form-group">';
      html += '        <label class="form-label">Divisa de Registro *</label>';
      html += '        <select id="modal-tx-currency" class="form-control" style="font-weight:700;">';
      html += '          <option value="COP" ' + (initialCurr === 'COP' ? 'selected' : '') + '>COP - Peso Colombiano</option>';
      html += '          <option value="USD" ' + (initialCurr === 'USD' ? 'selected' : '') + '>USD - Dolar (US$)</option>';
      html += '          <option value="EUR" ' + (initialCurr === 'EUR' ? 'selected' : '') + '>EUR - Euro (€)</option>';
      html += '        </select>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div id="modal-tx-fx-preview" style="display:none;font-size:0.75rem;padding:0.45rem 0.65rem;border-radius:var(--radius-sm);background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);margin-bottom:0.85rem;color:var(--text-secondary);"></div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label">Descripción *</label>';
      html += '      <input type="text" id="modal-tx-desc" class="form-control" placeholder="Ej. Almuerzo, Transporte, Beca..." required value="' + (tx ? tx.description : '') + '">';
      html += '    </div>';
      html += '    <div class="form-grid-2">';
      html += '      <div class="form-group">';
      html += '        <label class="form-label">Categoría *</label>';
      html += '        <select id="modal-tx-cat" class="form-control">';
      catsForType.forEach(function (c) {
        var sel = tx && tx.categoryId === c.id ? 'selected' : '';
        html += '          <option value="' + c.id + '" ' + sel + '>' + c.name + '</option>';
      });
      html += '        </select>';
      html += '      </div>';
      html += '      <div class="form-group">';
      html += '        <label class="form-label">Fecha *</label>';
      html += '        <input type="date" id="modal-tx-date" class="form-control" required value="' + (tx ? tx.date : Fmt.getCurrentDateISO()) + '">';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label class="form-label">Observaciones (Opcional)</label>';
      html += '      <input type="text" id="modal-tx-notes" class="form-control" placeholder="Notas adicionales..." value="' + (tx && tx.notes ? tx.notes : '') + '">';
      html += '    </div>';
      html += '    <div class="modal-footer">';
      html += '      <button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button>';
      html += '      <button type="submit" class="btn-primary">' + (isEditing ? 'Guardar Cambios' : 'Registrar Movimiento') + '</button>';
      html += '    </div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'goal') {
      html += '<div class="modal-card">';
      html += '  <div class="modal-header"><h2 class="modal-title">Nueva Meta de Ahorro</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <form id="form-modal-goal">';
      html += '    <div class="form-group"><label class="form-label">Nombre de la Meta *</label><input type="text" id="goal-name" class="form-control" placeholder="Ej. Matricula, Portatil..." required></div>';
      html += '    <div class="form-grid-2">';
      html += '      <div class="form-group"><label class="form-label">Monto Objetivo (COP) *</label><input type="text" id="goal-target" class="form-control font-mono" placeholder="Monto" required></div>';
      html += '      <div class="form-group"><label class="form-label">Ahorro Inicial (COP)</label><input type="text" id="goal-current" class="form-control font-mono" placeholder="Monto"></div>';
      html += '    </div>';
      html += '    <div class="form-group"><label class="form-label">Fecha Limite Deseada</label><input type="date" id="goal-date" class="form-control"></div>';
      html += '    <div class="modal-footer"><button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button><button type="submit" class="btn-primary">Crear Meta</button></div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'goal-contribute') {
      html += '<div class="modal-card">';
      html += '  <div class="modal-header"><h2 class="modal-title">Abonar a Meta</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <form id="form-modal-goal-contrib">';
      html += '    <div class="form-group"><label class="form-label">Monto del Aporte (COP) *</label><input type="text" id="goal-contrib-amount" class="form-control font-mono" placeholder="Monto" required style="font-size:1.1rem;font-weight:700;"></div>';
      html += '    <div class="modal-footer"><button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button><button type="submit" class="btn-primary">Registrar Aporte</button></div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'debt') {
      html += '<div class="modal-card">';
      html += '  <div class="modal-header"><h2 class="modal-title">Nueva Obligación Financiera</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <form id="form-modal-debt">';
      html += '    <div class="form-group"><label class="form-label">Nombre de la Deuda *</label><input type="text" id="debt-name" class="form-control" placeholder="Ej. Préstamo Universitario, Tarjeta..." required></div>';
      html += '    <div class="form-group"><label class="form-label">Entidad Acreedora</label><input type="text" id="debt-creditor" class="form-control" placeholder="Ej. Banco, Familiar, Icetex..."></div>';
      html += '    <div class="form-grid-2">';
      html += '      <div class="form-group"><label class="form-label">Saldo Pendiente (COP) *</label><input type="text" id="debt-remaining" class="form-control font-mono" placeholder="Monto" required></div>';
      html += '      <div class="form-group"><label class="form-label">Cuota Mensual (COP) *</label><input type="text" id="debt-monthly" class="form-control font-mono" placeholder="Monto" required></div>';
      html += '    </div>';
      html += '    <div class="form-grid-2">';
      html += '      <div class="form-group"><label class="form-label">Día de Pago en el Mes</label><input type="number" id="debt-day" class="form-control" min="1" max="31" placeholder="Día"></div>';
      html += '      <div class="form-group"><label class="form-label">Tasa de interés anual E.A. (%) (opcional)</label><input type="number" id="debt-rate" class="form-control" min="0" max="200" step="0.01" placeholder="Tasa anual"></div>';
      html += '      <div class="form-group"><label class="form-label">Tipo de Obligación</label><select id="debt-type" class="form-control"><option value="prestamo">Préstamo personal</option><option value="tarjeta">Tarjeta de crédito</option><option value="educativo">Crédito educativo</option><option value="otro">Otro</option></select></div>';
      html += '    </div>';
      html += '    <div class="modal-footer"><button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button><button type="submit" class="btn-primary">Guardar Obligación</button></div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'debt-payment') {
      html += '<div class="modal-card">';
      html += '  <div class="modal-header"><h2 class="modal-title">Registrar Pago de Cuota</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <form id="form-modal-debt-pay">';
      html += '    <div class="form-group"><label class="form-label">Monto Pagado (COP) *</label><input type="text" id="debt-pay-amount" class="form-control font-mono" placeholder="Monto" required style="font-size:1.1rem;font-weight:700;"></div>';
      html += '    <div class="modal-footer"><button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button><button type="submit" class="btn-primary">Registrar Pago</button></div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'category') {
      var catEditing = state.editingCatId ? Cat.getCategoryById(state.data.categories, state.editingCatId) : null;
      html += '<div class="modal-card">';
      html += '  <div class="modal-header"><h2 class="modal-title">' + (catEditing ? 'Editar Categoría' : 'Nueva Categoría') + '</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <form id="form-modal-category">';
      html += '    <div class="form-group"><label class="form-label">Nombre de la Categoría *</label><input type="text" id="cat-name-input" class="form-control" placeholder="Ej. Transporte Privado, Libros..." required value="' + (catEditing ? catEditing.name : '') + '"></div>';
      html += '    <div class="form-grid-2">';
      html += '      <div class="form-group"><label class="form-label">Tipo *</label><select id="cat-type-input" class="form-control" ' + (catEditing ? 'disabled' : '') + '><option value="expense" ' + (catEditing && catEditing.type === 'expense' ? 'selected' : '') + '>Gasto</option><option value="income" ' + (catEditing && catEditing.type === 'income' ? 'selected' : '') + '>Ingreso</option></select></div>';
      html += '      <div class="form-group"><label class="form-label">Color Distintivo *</label><input type="color" id="cat-color-input" class="form-control" value="' + (catEditing ? catEditing.color : '#3b82f6') + '" style="height:38px;padding:2px;"></div>';
      html += '    </div>';
      html += '    <div class="form-group"><label class="form-label">Clasificación</label><select id="cat-group-input" class="form-control"><option value="essential" ' + (catEditing && catEditing.group === 'essential' ? 'selected' : '') + '>Gasto Esencial (Necesidad)</option><option value="non_essential" ' + (catEditing && catEditing.group === 'non_essential' ? 'selected' : '') + '>Gasto No Esencial (Deseo)</option><option value="income" ' + (catEditing && catEditing.group === 'income' ? 'selected' : '') + '>Ingreso</option></select></div>';
      html += '    <div class="modal-footer"><button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button><button type="submit" class="btn-primary">' + (catEditing ? 'Actualizar' : 'Crear Categoría') + '</button></div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'category-reassign') {
      var catToDel = Cat.getCategoryById(state.data.categories, state.reassignCatId);
      var sameTypeCats = state.data.categories.filter(function (c) {
        return c.id !== state.reassignCatId && c.type === (catToDel ? catToDel.type : 'expense');
      });
      html += '<div class="modal-card">';
      html += '  <div class="modal-header"><h2 class="modal-title">Reasignar Movimientos</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <form id="form-modal-cat-reassign">';
      html += '    <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;">La categoría <strong>' + (catToDel ? catToDel.name : '') + '</strong> tiene movimientos asociados. Selecciona la nueva categoría de destino para transferirlos:</p>';
      html += '    <div class="form-group"><label class="form-label">Categoría de Destino *</label><select id="cat-reassign-target" class="form-control">';
      sameTypeCats.forEach(function (c) {
        html += '<option value="' + c.id + '">' + c.name + '</option>';
      });
      html += '    </select></div>';
      html += '    <div class="modal-footer"><button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button><button type="submit" class="btn-primary" style="background:var(--color-expense);border-color:var(--color-expense);">Reasignar y Eliminar</button></div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'admin-user') {
      html += '<div class="modal-card">';
      html += '  <div class="modal-header"><h2 class="modal-title">Nuevo Usuario Local</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <form id="form-admin-user">';
      html += '    <div class="form-group"><label class="form-label">Nombre Completo *</label><input type="text" id="admin-user-name" class="form-control" required placeholder="Nombre del usuario"></div>';
      html += '    <div class="form-group"><label class="form-label">Correo Electrónico *</label><input type="email" id="admin-user-email" class="form-control" required placeholder="correo@institucion.edu.co"></div>';
      html += '    <div class="form-group"><label class="form-label">Contraseña Inicial *</label><input type="password" id="admin-user-password" class="form-control" required placeholder="Nueva contraseña"></div>';
      html += '    <div class="form-group"><label class="form-label">Rol del Usuario</label><select id="admin-user-role" class="form-control"><option value="usuario">Usuario Estandar</option><option value="superadmin">SuperAdmin</option></select></div>';
      html += '    <div class="modal-footer"><button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button><button type="submit" class="btn-primary">Crear Cuenta</button></div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'admin-reset-pw') {
      html += '<div class="modal-card">';
      html += '  <div class="modal-header"><h2 class="modal-title">Restablecer Contraseña</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <form id="form-admin-reset-pw">';
      html += '    <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;">Asigna una nueva clave de acceso para <strong>' + state._resetPwEmail + '</strong>:</p>';
      html += '    <div class="form-group"><label class="form-label">Nueva Contraseña *</label><input type="password" id="admin-new-pw-input" class="form-control" required placeholder="Nueva contraseña"></div>';
      html += '    <div class="modal-footer"><button type="button" class="btn-secondary" id="btn-modal-cancel">Cancelar</button><button type="submit" class="btn-primary">Guardar Nueva Clave</button></div>';
      html += '  </form>';
      html += '</div>';

    } else if (modalId === 'fx-info') {
      var info = window.FinCurrency ? window.FinCurrency.getRatesInfo() : {};
      var usdVal = info.ratesInverse && info.ratesInverse.USD ? Math.round(info.ratesInverse.USD) : 3245;
      var eurVal = info.ratesInverse && info.ratesInverse.EUR ? Math.round(info.ratesInverse.EUR) : 3647;
      var statusText = info.isOffline ? 'Tasas de referencia local' : 'Tasas en tiempo real al día';

      html += '<div class="modal-card" style="max-width:420px;">';
      html += '  <div class="modal-header"><h2 class="modal-title">Tasas de Cambio en Tiempo Real</h2><button class="text-link" id="btn-close-modal">Cerrar</button></div>';
      html += '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin:1rem 0;">';
      html += '    <div style="padding:1rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);text-align:center;">';
      html += '      <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.35rem;">1 Dolar (USD)</div>';
      html += '      <div class="font-mono" style="font-size:1.3rem;font-weight:700;color:var(--color-brand);">$ ' + Fmt.formatThousands(usdVal) + ' COP</div>';
      html += '    </div>';
      html += '    <div style="padding:1rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);text-align:center;">';
      html += '      <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.35rem;">1 Euro (EUR)</div>';
      html += '      <div class="font-mono" style="font-size:1.3rem;font-weight:700;color:var(--color-brand);">$ ' + Fmt.formatThousands(eurVal) + ' COP</div>';
      html += '    </div>';
      html += '  </div>';
      html += '  <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);font-size:0.75rem;color:var(--text-secondary);margin-bottom:1.25rem;">';
      html += '    <span>' + statusText + '</span>';
      html += '    <button type="button" class="btn-secondary" id="btn-refresh-fx-rates" style="padding:0.3rem 0.6rem;font-size:0.75rem;">Actualizar tasas</button>';
      html += '  </div>';
      html += '  <div class="modal-footer"><button type="button" class="btn-primary" id="btn-modal-cancel" style="width:100%;justify-content:center;">Entendido</button></div>';
      html += '</div>';
    }

    modalContent.innerHTML = html;
    modalOverlay.classList.add('open');

    // Botones Cancelar y Cerrar
    var cancelBtn = document.getElementById('btn-modal-cancel');
    var closeBtn = document.getElementById('btn-close-modal');
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (closeBtn) closeBtn.onclick = closeModal;

    if (modalId === 'fx-info') {
      var refBtn = document.getElementById('btn-refresh-fx-rates');
      if (refBtn && window.FinCurrency) {
        refBtn.onclick = function () {
          refBtn.textContent = 'Actualizando...';
          refBtn.disabled = true;
          window.FinCurrency.fetchRates(true).then(function () {
            openModal('fx-info');
            renderApp();
            showToast('Tasas de cambio actualizadas.');
          }).catch(function () {
            refBtn.textContent = 'Actualizar tasas';
            refBtn.disabled = false;
            showToast('No fue posible consultar tasas en línea.', 'warning');
          });
        };
      }
    }

    // Mascaras y bindings por modal
    if (modalId === 'transaction') {
      bindTxModalEvents();
    } else if (modalId === 'goal') {
      attachCurrencyMask(document.getElementById('goal-target'));
      attachCurrencyMask(document.getElementById('goal-current'));
    } else if (modalId === 'goal-contribute') {
      attachCurrencyMask(document.getElementById('goal-contrib-amount'));
    } else if (modalId === 'debt') {
      attachCurrencyMask(document.getElementById('debt-remaining'));
      attachCurrencyMask(document.getElementById('debt-monthly'));
    } else if (modalId === 'debt-payment') {
      attachCurrencyMask(document.getElementById('debt-pay-amount'));
    }
  }

  function closeModal() {
    var modalOverlay = document.getElementById('app-modal-overlay');
    if (modalOverlay) modalOverlay.classList.remove('open');
    state.editingTxId = null;
    state.contributeGoalId = null;
    state.paymentDebtId = null;
    state.editingCatId = null;
    state.reassignCatId = null;
    state.adminEditingUserId = null;
  }

  function bindTxModalEvents() {
    var typeIncBtn = document.getElementById('modal-tx-type-inc');
    var typeExpBtn = document.getElementById('modal-tx-type-exp');
    var catSelect = document.getElementById('modal-tx-cat');
    var currSelect = document.getElementById('modal-tx-currency');
    var amountInput = document.getElementById('modal-tx-amount');
    var amountLabel = document.getElementById('modal-tx-amount-label');
    var previewEl = document.getElementById('modal-tx-fx-preview');

    var currentType = typeIncBtn && typeIncBtn.classList.contains('active') ? 'income' : 'expense';

    function refreshCats(t) {
      currentType = t;
      if (!catSelect) return;
      catSelect.innerHTML = '';
      state.data.categories.filter(function (c) { return c.type === t; }).forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        catSelect.appendChild(opt);
      });
    }

    if (typeIncBtn && typeExpBtn) {
      typeIncBtn.onclick = function () {
        typeIncBtn.classList.add('active');
        typeExpBtn.classList.remove('active');
        refreshCats('income');
      };
      typeExpBtn.onclick = function () {
        typeExpBtn.classList.add('active');
        typeIncBtn.classList.remove('active');
        refreshCats('expense');
      };
    }

    function updateFxPreview() {
      if (!currSelect || !amountInput || !previewEl || !amountLabel) return;
      var cur = currSelect.value;
      amountLabel.textContent = 'Monto (' + cur + ') *';
      var val = Fmt.parseThousands(amountInput.value);

      if (cur !== 'COP' && val > 0 && window.FinCurrency) {
        var copVal = window.FinCurrency.convertToCOP(val, cur);
        previewEl.style.display = 'block';
        previewEl.textContent = 'Equivalente en moneda base: ' + Fmt.formatCOPStandard(copVal);
      } else {
        previewEl.style.display = 'none';
      }
    }

    if (amountInput) {
      attachCurrencyMask(amountInput, function () {
        updateFxPreview();
      });
    }

    if (currSelect) {
      currSelect.addEventListener('change', updateFxPreview);
    }
  }

  // DELEGACION GLOBAL DE EVENTOS
  function initEventDelegation() {
    // Separacion de miles en tiempo real para todos los campos de dinero de la aplicacion
    document.addEventListener('input', function (e) {
      if (isMoneyInput(e.target)) {
        formatMoneyInputInRealTime(e.target);
        if (e.target.classList && e.target.classList.contains('budget-limit-input')) {
          updateLiveBudgetCalculations();
        } else if (e.target.id === 'budget-expected-income' || e.target.id === 'budget-target-savings') {
          updateLiveBudgetCalculations();
        }
      }
    });

    // Divisa Global
    var currSelect = document.getElementById('header-currency-select');
    if (currSelect) {
      currSelect.addEventListener('change', function (e) {
        if (window.FinCurrency) {
          window.FinCurrency.setActiveCurrency(e.target.value);
          renderApp();
        }
      });
    }

    // Modal Tasas de Cambio
    var fxDetailsBtn = document.getElementById('btn-fx-details');
    if (fxDetailsBtn) {
      fxDetailsBtn.onclick = function () { openModal('fx-info'); };
    }

    // Selector de Periodo
    var periodInput = document.getElementById('header-period-input');
    if (periodInput) {
      periodInput.addEventListener('change', function (e) {
        state.selectedMonth = e.target.value;
        renderApp();
      });
    }

    // Botones Header
    var headerAddBtn = document.getElementById('btn-header-new-tx');
    if (headerAddBtn) {
      headerAddBtn.onclick = function () {
        state.editingTxId = null;
        state._nextTxType = 'expense';
        openModal('transaction');
      };
    }

    var headerNotifBtn = document.getElementById('header-btn-notifs');
    if (headerNotifBtn) {
      headerNotifBtn.onclick = function () { navigateTo('recommendations'); };
    }

    var profileWidget = document.getElementById('header-profile-widget');
    if (profileWidget) {
      profileWidget.onclick = function () { navigateTo('profile'); };
    }

    var sidebarBrand = document.getElementById('sidebar-brand-btn');
    if (sidebarBrand) {
      sidebarBrand.onclick = function () { navigateTo('dashboard'); };
    }

    // Navegacion Sidebar
    document.querySelectorAll('.nav-button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-tab');
        if (tab) navigateTo(tab);
      });
    });

    // Cerrar modal al tocar overlay
    var modalOverlay = document.getElementById('app-modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeModal();
      });
    }

    // DELEGACION PRINCIPAL DE CLICS
    var mainEl = document.getElementById('main-module-content');
    if (!mainEl) return;

    mainEl.addEventListener('click', function (e) {
      var target = e.target;

      // Navegacion data-goto
      var gotoBtn = target.closest('[data-goto]');
      if (gotoBtn) {
        var dest = gotoBtn.getAttribute('data-goto');
        if (dest) navigateTo(dest);
        return;
      }

      // Switch login / register
      if (target.closest('#btn-switch-to-register')) {
        state.isRegisterMode = true;
        renderApp();
        return;
      }
      if (target.closest('#btn-switch-to-login')) {
        state.isRegisterMode = false;
        renderApp();
        return;
      }

      // Acciones de movimientos
      if (target.closest('#btn-quick-new-tx') || target.closest('#btn-new-expense')) {
        state.editingTxId = null;
        state._nextTxType = 'expense';
        openModal('transaction');
        return;
      }
      if (target.closest('#btn-new-income')) {
        state.editingTxId = null;
        state._nextTxType = 'income';
        openModal('transaction');
        return;
      }

      var editTxBtn = target.closest('[data-action="edit-tx"]');
      if (editTxBtn) {
        state.editingTxId = editTxBtn.getAttribute('data-id');
        openModal('transaction');
        return;
      }

      var delTxBtn = target.closest('[data-action="delete-tx"]');
      if (delTxBtn) {
        var txId = delTxBtn.getAttribute('data-id');
        var txObj = state.data.transactions.find(function (t) { return t.id === txId; });
        if (confirm('¿Eliminar este movimiento financiero?')) {
          if (txObj && txObj.type === 'income') {
            window.FinApp.gestionFinanciera.eliminarIngreso(txId);
          } else {
            window.FinApp.gestionFinanciera.eliminarGasto(txId);
          }
          renderApp();
          showToast('Movimiento eliminado.');
        }
        return;
      }

      // Filtros de movimientos
      var filterBtn = target.closest('[data-filter-type]');
      if (filterBtn) {
        state.txTypeFilter = filterBtn.getAttribute('data-filter-type');
        renderApp();
        return;
      }

      // Guardar Presupuesto
      if (target.closest('#btn-save-budget')) {
        var expIncome = Fmt.parseThousands(document.getElementById('budget-expected-income').value);
        var tarSav = Fmt.parseThousands(document.getElementById('budget-target-savings').value);
        var useRule = document.getElementById('budget-toggle-503020').checked;
        var limits = [];
        document.querySelectorAll('.budget-limit-input').forEach(function (inp) {
          limits.push({
            categoryId: inp.getAttribute('data-cat-id'),
            allocatedAmount: Fmt.parseThousands(inp.value),
          });
        });

        window.FinApp.planificacion.guardarPresupuesto({
          month: state.selectedMonth,
          expectedIncome: expIncome,
          targetSavings: tarSav,
          use503020Rule: useRule,
          categoryLimits: limits,
        });

        renderApp();
        showToast('Presupuesto guardado exitosamente.');
        return;
      }

      // Metas
      if (target.closest('#btn-new-goal') || target.closest('#btn-empty-new-goal')) {
        openModal('goal');
        return;
      }
      var delGoalBtn = target.closest('[data-action="delete-goal"]');
      if (delGoalBtn) {
        var gId = delGoalBtn.getAttribute('data-id');
        if (confirm('¿Eliminar esta meta de ahorro?')) {
          window.FinApp.planificacion.eliminarMeta(gId);
          renderApp();
          showToast('Meta eliminada.');
        }
        return;
      }
      var contGoalBtn = target.closest('[data-action="contribute-goal"]');
      if (contGoalBtn) {
        state.contributeGoalId = contGoalBtn.getAttribute('data-id');
        openModal('goal-contribute');
        return;
      }

      // Deudas
      if (target.closest('#btn-new-debt') || target.closest('#btn-empty-new-debt')) {
        openModal('debt');
        return;
      }
      var delDebtBtn = target.closest('[data-action="delete-debt"]');
      if (delDebtBtn) {
        var dId = delDebtBtn.getAttribute('data-id');
        if (confirm('¿Eliminar esta obligación?')) {
          window.FinApp.deudas.eliminarDeuda(dId);
          renderApp();
          showToast('Obligación eliminada.');
        }
        return;
      }
      var payDebtBtn = target.closest('[data-action="pay-debt"]');
      if (payDebtBtn) {
        state.paymentDebtId = payDebtBtn.getAttribute('data-id');
        state._defaultPaymentAmount = Number(payDebtBtn.getAttribute('data-min')) || 0;
        openModal('debt-payment');
        return;
      }
      var fundWithdrawBtn = target.closest('[data-action="fund-withdraw"]');
      if (fundWithdrawBtn) {
        var wInput = document.getElementById('fund-contrib-input');
        var wAmount = Fmt.parseThousands(wInput ? wInput.value : '');
        var wSaved = Number((state.data.emergencyFund || {}).currentSaved) || 0;
        if (wAmount <= 0) {
          showToast('Escribe el monto que quieres retirar.', 'warning');
        } else if (wAmount > wSaved) {
          showToast('Solo tienes ' + Fmt.formatCOP(wSaved) + ' en el fondo.', 'warning');
        } else if (window.FinApp.planificacion.retirarFondo(wAmount)) {
          renderApp();
          confirmarConRecomendacion('Retiro registrado.', { type: 'fund_withdrawal', amount: wAmount });
        }
        return;
      }

      var fundResetBtn = target.closest('[data-action="fund-reset"]');
      if (fundResetBtn) {
        var rSaved = Number((state.data.emergencyFund || {}).currentSaved) || 0;
        if (confirm('¿Reestablecer el fondo de emergencia?\n\nLos ' + Fmt.formatCOP(rSaved) + ' guardados volverán a tu capital libre y la meta volverá a su valor por defecto. Tus movimientos no se borran.')) {
          window.FinApp.planificacion.reiniciarFondo();
          renderApp();
          showToast('Fondo de emergencia reestablecido.', 'success');
        }
        return;
      }

      var profileBtn = target.closest('[data-action="invest-profile"]');
      if (profileBtn) {
        state.investProfile = profileBtn.getAttribute('data-profile');
        renderApp();
        return;
      }

      var simDebtBtn = target.closest('[data-action="simulate-debt-payment"]');
      if (simDebtBtn) {
        var debtIdToSim = simDebtBtn.getAttribute('data-id');
        window.FinApp.deudas.abrirModalSimularPago(debtIdToSim);
        return;
      }

      // Categorias en Perfil
      if (target.closest('#btn-new-custom-category')) {
        state.editingCatId = null;
        openModal('category');
        return;
      }
      var editCatBtn = target.closest('[data-action="edit-category"]');
      if (editCatBtn) {
        state.editingCatId = editCatBtn.getAttribute('data-id');
        openModal('category');
        return;
      }
      var delCatBtn = target.closest('[data-action="delete-category"]');
      if (delCatBtn) {
        var catIdToDel = delCatBtn.getAttribute('data-id');
        var resDel = window.FinApp.gestionFinanciera.eliminarCategoria(catIdToDel);
        if (resDel.needsReassign) {
          state.reassignCatId = catIdToDel;
          openModal('category-reassign');
        } else if (resDel.success) {
          renderApp();
          showToast(resDel.message);
        } else {
          showToast(resDel.message, 'warning');
        }
        return;
      }

      // Recomendaciones: Detalle y Salto a modulo
      var recDetailBtn = target.closest('[data-action="open-rec-detail"]');
      if (recDetailBtn && !target.closest('button')) {
        var rId = recDetailBtn.getAttribute('data-id');
        window.FinApp.recomendaciones.verDetallesRecomendacion(rId);
        return;
      }
      var gotoModBtn = target.closest('[data-action="goto-module"]');
      if (gotoModBtn) {
        closeModal();
        var mod = gotoModBtn.getAttribute('data-module');
        if (mod) navigateTo(mod);
        return;
      }

      // Exportar CSV de reporte de periodo
      if (target.closest('#btn-export-period-csv')) {
        window.FinApp.gestionFinanciera.exportarReporteCSV();
        showToast('Reporte CSV descargado.');
        return;
      }

      // Imprimir reporte formal
      if (target.closest('#btn-print-period-report')) {
        window.print();
        return;
      }

      // Exportar Copia de Seguridad JSON
      if (target.closest('#btn-export-json')) {
        var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.data, null, 2));
        var dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", "finplan_backup_" + Fmt.getCurrentDateISO() + ".json");
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
        showToast('Copia de seguridad descargada.');
        return;
      }

      // Recuperar contraseña y reenviar verificación (Firebase)
      if (target.closest('#btn-forgot-toggle')) {
        var resetForm = document.getElementById('form-auth-reset');
        if (resetForm) {
          resetForm.style.display = resetForm.style.display === 'none' ? 'block' : 'none';
          var loginMail = document.getElementById('auth-login-email');
          var resetMail = document.getElementById('auth-reset-email');
          if (resetMail && loginMail && !resetMail.value) resetMail.value = loginMail.value;
        }
        return;
      }
      if (target.closest('#btn-resend-verification')) {
        window.FinCloud.resendVerification(
          document.getElementById('auth-login-email').value,
          document.getElementById('auth-login-password').value,
          function (res) { showToast(res.message, res.success ? 'success' : 'warning'); }
        );
        return;
      }
      if (target.closest('#btn-admin-refresh')) {
        window.FinApp.administracion.refrescarUsuarios(function (res) {
          renderApp();
          showToast(res.success ? 'Lista de usuarios actualizada.' : res.message, res.success ? 'success' : 'warning');
        });
        return;
      }

      // Limpiar todos los datos
      if (target.closest('#btn-wipe-data')) {
        if (confirm('¿Estas seguro de reiniciar todos tus datos financieros a cero?')) {
          Storage.clearAllUserData(state.currentUser.id);
          state.data = Storage.loadUserFinancialData(state.currentUser.id);
          renderApp();
          showToast('Todos los datos fueron reiniciados.');
        }
        return;
      }

      // ACCIONES DE ADMINISTRACION (SUPERADMIN)
      if (target.closest('#btn-admin-logout')) {
        window.FinApp.autenticacion.logout();
        return;
      }
      if (target.closest('#btn-admin-new-user')) {
        openModal('admin-user');
        return;
      }
      var editUserBtn = target.closest('[data-action="admin-edit-user"]');
      if (editUserBtn) {
        var uId = editUserBtn.getAttribute('data-id');
        var uName = editUserBtn.getAttribute('data-name');
        var uEmail = editUserBtn.getAttribute('data-email');
        var newName = prompt('Nombre completo:', uName);
        if (newName !== null) {
          var newEmail = prompt('Correo electrónico:', uEmail);
          if (newEmail !== null) {
            var resUpd = window.FinApp.administracion.editarUsuario(uId, newName, newEmail);
            showToast(resUpd.message);
            renderApp();
          }
        }
        return;
      }
      var toggleUserBtn = target.closest('[data-action="admin-toggle-active"]');
      if (toggleUserBtn) {
        var uIdToggle = toggleUserBtn.getAttribute('data-id');
        var resToggle = window.FinApp.administracion.alternarEstadoUsuario(uIdToggle);
        showToast(resToggle.message);
        renderApp();
        return;
      }
      var resetPwBtn = target.closest('[data-action="admin-reset-pw"]');
      if (resetPwBtn) {
        if (window.FinApp.administracion.isCloud()) {
          window.FinApp.administracion.enviarRecuperacion(resetPwBtn.getAttribute('data-id'), function (res) {
            showToast(res.message, res.success ? 'success' : 'warning');
          });
          return;
        }
        state.adminEditingUserId = resetPwBtn.getAttribute('data-id');
        state._resetPwEmail = resetPwBtn.getAttribute('data-email');
        openModal('admin-reset-pw');
        return;
      }
      var delUserBtn = target.closest('[data-action="admin-delete-user"]');
      if (delUserBtn) {
        var uIdDel = delUserBtn.getAttribute('data-id');
        if (confirm('¿Eliminar permanentemente este usuario y todos sus datos?')) {
          var resDelU = window.FinApp.administracion.eliminarUsuario(uIdDel);
          showToast(resDelU.message);
          renderApp();
        }
        return;
      }
      if (target.closest('#btn-admin-reset-params')) {
        if (confirm('¿Restaurar parámetros globales por defecto?')) {
          window.FinApp.administracion.restaurarParametrosPorDefecto();
          showToast('Parámetros restaurados a valores por defecto.');
          renderApp();
        }
        return;
      }
    });

    // Delegacion de Sliders y Busquedas
    mainEl.addEventListener('input', function (e) {
      if (e.target.id === 'tx-search-input') {
        state.txSearch = e.target.value;
        renderApp();
      }
    });

    mainEl.addEventListener('change', function (e) {
      if (e.target.id === 'tx-category-select') {
        state.txCategoryFilter = e.target.value;
        renderApp();
      } else if (e.target.id === 'tx-type-filter') {
        state.txTypeFilter = e.target.value;
        renderApp();
      } else if (e.target.id === 'budget-toggle-503020') {
        renderApp();
      }
    });

    // DELEGACION DE FORMULARIOS PRINCIPALES
    mainEl.addEventListener('submit', function (e) {
      var formId = e.target.id;

      if (formId === 'form-auth-login') {
        e.preventDefault();
        var email = document.getElementById('auth-login-email').value;
        var pass = document.getElementById('auth-login-password').value;
        window.FinApp.autenticacion.login(email, pass, function (res) {
          if (res.success) {
            state.currentUser = res.session;
            state.data = Storage.loadUserFinancialData(res.user.id);
            state.activeTab = res.user.role === 'superadmin' ? 'admin' : 'dashboard';
            renderApp();
            showToast('Bienvenido, ' + res.user.name + '.');
          } else {
            showToast(res.message, 'warning');
          }
        });
      } else if (formId === 'form-auth-register') {
        e.preventDefault();
        var rName = document.getElementById('auth-reg-name').value;
        var rEmail = document.getElementById('auth-reg-email').value;
        var rPass = document.getElementById('auth-reg-password').value;
        window.FinApp.autenticacion.register(rName, rEmail, rPass, function (res) {
          if (res.success && res.pendingVerification) {
            state.isRegisterMode = false;
            renderApp();
            showToast('Revisa tu correo', 'success', res.message);
          } else if (res.success) {
            state.currentUser = res.session;
            state.data = Storage.loadUserFinancialData(res.user.id);
            state.activeTab = 'dashboard';
            state.isRegisterMode = false;
            renderApp();
            showToast('Cuenta creada con éxito.');
          } else {
            showToast(res.message, 'warning');
          }
        });
      } else if (formId === 'form-auth-reset') {
        e.preventDefault();
        window.FinCloud.resetPassword(document.getElementById('auth-reset-email').value, function (res) {
          showToast(res.message, res.success ? 'success' : 'warning');
        });
      } else if (formId === 'form-fund-contribution') {
        e.preventDefault();
        var contrib = Fmt.parseThousands(document.getElementById('fund-contrib-input').value);
        if (contrib > 0) {
          window.FinApp.planificacion.abonarFondo(contrib);
          renderApp();
          confirmarConRecomendacion('Aporte al fondo registrado.', { type: 'fund_contribution', amount: contrib });
        }
      } else if (formId === 'form-fund-config') {
        e.preventDefault();
        var targetMonths = document.getElementById('fund-target-months').value;
        var contribText = document.getElementById('fund-target-contrib').value.trim();
        var targetContrib = contribText === '' ? null : Fmt.parseThousands(contribText);
        window.FinApp.planificacion.configurarFondo(targetMonths, targetContrib);
        renderApp();
        showToast('Configuración del fondo guardada.');
      } else if (formId === 'form-profile') {
        e.preventDefault();
        var pName = document.getElementById('prof-name').value;
        var pEmail = document.getElementById('prof-email').value;
        var pCurPw = document.getElementById('prof-current-pw').value;
        var pNewPw = document.getElementById('prof-new-pw').value;

        state.data.profile.university = document.getElementById('prof-univ').value.trim();
        state.data.profile.career = document.getElementById('prof-career').value.trim();

        window.FinApp.autenticacion.updateProfile(pName, pEmail, pCurPw, pNewPw, function (res) {
          if (res.success) {
            persistData();
            renderApp();
            showToast(res.message);
          } else {
            showToast(res.message, 'warning');
          }
        });
      } else if (formId === 'form-admin-params') {
        e.preventDefault();
        var r50 = Number(document.getElementById('param-rule-50').value);
        var r30 = Number(document.getElementById('param-rule-30').value);
        var r20 = Number(document.getElementById('param-rule-20').value);
        var fMonths = parseInt(document.getElementById('param-fund-months').value, 10);
        var dtiWarn = Number(document.getElementById('param-dti-warning').value) / 100;
        var dtiAlert = Number(document.getElementById('param-dti-alert').value) / 100;
        var savWarn = Number(document.getElementById('param-savings-warning').value) / 100;
        var defCurr = document.getElementById('param-default-currency').value;

        window.FinApp.administracion.guardarParametros({
          rule50: r50,
          rule30: r30,
          rule20: r20,
          emergencyFundMonths: fMonths,
          dtiWarningThreshold: dtiWarn,
          dtiAlertThreshold: dtiAlert,
          savingsWarningThreshold: savWarn,
          defaultCurrency: defCurr,
        });

        renderApp();
        showToast('Parámetros del sistema guardados con éxito.');
      }
    });

    // SUBMIT DE MODALES
    var modalOverlayEl = document.getElementById('app-modal-overlay');
    if (modalOverlayEl) {
      modalOverlayEl.addEventListener('submit', function (e) {
        e.preventDefault();
        var formId = e.target.id;

        if (formId === 'form-modal-tx') {
          var typeInc = document.getElementById('modal-tx-type-inc');
          var isIncome = typeInc && typeInc.classList.contains('active');
          var cur = document.getElementById('modal-tx-currency').value;
          var rawAmt = Fmt.parseThousands(document.getElementById('modal-tx-amount').value);
          var amtCOP = cur === 'COP' ? rawAmt : (window.FinCurrency ? window.FinCurrency.convertToCOP(rawAmt, cur) : rawAmt);
          var desc = document.getElementById('modal-tx-desc').value;
          var catId = document.getElementById('modal-tx-cat').value;
          var date = document.getElementById('modal-tx-date').value;
          var notes = document.getElementById('modal-tx-notes').value;

          var txPayload = {
            amount: amtCOP,
            description: desc,
            categoryId: catId,
            date: date,
            notes: notes,
            originalAmount: rawAmt,
            originalCurrency: cur,
          };

          var createdTx = null;
          if (state.editingTxId) {
            if (isIncome) window.FinApp.gestionFinanciera.editarIngreso(state.editingTxId, txPayload);
            else window.FinApp.gestionFinanciera.editarGasto(state.editingTxId, txPayload);
            showToast('Movimiento actualizado.');
          } else {
            if (isIncome) window.FinApp.gestionFinanciera.crearIngreso(txPayload);
            else window.FinApp.gestionFinanciera.crearGasto(txPayload);
            createdTx = { type: isIncome ? 'income' : 'expense', amount: amtCOP, categoryId: catId, date: date };
          }
          closeModal();
          renderApp();
          if (createdTx) {
            confirmarConRecomendacion('Movimiento registrado.', createdTx, String(date || '').slice(0, 7) || state.selectedMonth);
          }

        } else if (formId === 'form-modal-goal') {
          var gName = document.getElementById('goal-name').value;
          var gTarget = Fmt.parseThousands(document.getElementById('goal-target').value);
          var gCurrent = Fmt.parseThousands(document.getElementById('goal-current').value);
          var gDate = document.getElementById('goal-date').value;

          var newGoal = window.FinApp.planificacion.crearMeta({
            name: gName,
            targetAmount: gTarget,
            currentAmount: gCurrent,
            deadline: gDate,
          });
          closeModal();
          renderApp();
          confirmarConRecomendacion('Meta creada.', { type: 'goal_created', goalId: newGoal && newGoal.id });

        } else if (formId === 'form-modal-goal-contrib') {
          var cAmt = Fmt.parseThousands(document.getElementById('goal-contrib-amount').value);
          if (cAmt > 0 && state.contributeGoalId) {
            var contributedGoalId = state.contributeGoalId;
            window.FinApp.planificacion.abonarMeta(contributedGoalId, cAmt);
            closeModal();
            renderApp();
            confirmarConRecomendacion('Aporte a la meta registrado.', { type: 'goal_contribution', goalId: contributedGoalId, amount: cAmt });
          }

        } else if (formId === 'form-modal-debt') {
          var dName = document.getElementById('debt-name').value;
          var dCred = document.getElementById('debt-creditor').value;
          var dRem = Fmt.parseThousands(document.getElementById('debt-remaining').value);
          var dMonth = Fmt.parseThousands(document.getElementById('debt-monthly').value);
          var dDay = document.getElementById('debt-day').value;
          var dType = document.getElementById('debt-type').value;
          var dRate = document.getElementById('debt-rate').value;

          var newDebt = window.FinApp.deudas.crearDeuda({
            name: dName,
            creditor: dCred,
            remainingAmount: dRem,
            minimumMonthlyPayment: dMonth,
            dueDayOfMonth: dDay,
            type: dType,
            annualInterestRate: parseFloat(String(dRate).replace(',', '.')) || 0,
          });
          closeModal();
          renderApp();
          confirmarConRecomendacion('Obligación registrada.', { type: 'debt_created', debtId: newDebt && newDebt.id });

        } else if (formId === 'form-modal-debt-pay') {
          var payAmt = Fmt.parseThousands(document.getElementById('debt-pay-amount').value);
          if (payAmt > 0 && state.paymentDebtId) {
            var paidDebtId = state.paymentDebtId;
            window.FinApp.deudas.registrarPagoCuota(paidDebtId, payAmt);
            closeModal();
            renderApp();
            confirmarConRecomendacion('Pago de cuota registrado.', { type: 'debt_payment', debtId: paidDebtId, amount: payAmt });
          }

        } else if (formId === 'form-modal-category') {
          var catName = document.getElementById('cat-name-input').value;
          var catType = document.getElementById('cat-type-input').value;
          var catColor = document.getElementById('cat-color-input').value;
          var catGroup = document.getElementById('cat-group-input').value;

          if (state.editingCatId) {
            window.FinApp.gestionFinanciera.editarCategoria(state.editingCatId, {
              name: catName,
              color: catColor,
              group: catGroup,
              isEssential: catGroup === 'essential',
            });
            showToast('Categoría actualizada.');
          } else {
            window.FinApp.gestionFinanciera.crearCategoria({
              name: catName,
              type: catType,
              color: catColor,
              group: catGroup,
              isEssential: catGroup === 'essential',
            });
            showToast('Categoría creada exitosamente.');
          }
          closeModal();
          renderApp();

        } else if (formId === 'form-modal-cat-reassign') {
          var targetCatId = document.getElementById('cat-reassign-target').value;
          if (state.reassignCatId && targetCatId) {
            var resReassign = window.FinApp.gestionFinanciera.eliminarCategoria(state.reassignCatId, targetCatId);
            closeModal();
            renderApp();
            showToast(resReassign.message);
          }

        } else if (formId === 'form-admin-user') {
          var uName = document.getElementById('admin-user-name').value;
          var uEmail = document.getElementById('admin-user-email').value;
          var uPw = document.getElementById('admin-user-password').value;
          var uRole = document.getElementById('admin-user-role').value;

          window.FinApp.administracion.crearUsuario({
            name: uName,
            email: uEmail,
            password: uPw,
            role: uRole,
          }, function (res) {
            if (res.success) {
              closeModal();
              renderApp();
              showToast('Usuario creado correctamente.');
            } else {
              showToast(res.message, 'warning');
            }
          });

        } else if (formId === 'form-admin-reset-pw') {
          var newClave = document.getElementById('admin-new-pw-input').value;
          if (state.adminEditingUserId && newClave) {
            window.FinApp.administracion.restablecerContrasena(state.adminEditingUserId, newClave, function (res) {
              if (res.success) {
                closeModal();
                showToast(res.message);
              } else {
                showToast(res.message, 'warning');
              }
            });
          }
        }
      });
    }
  }

  // Exportar al objeto global FinApp
  window.FinApp.persistData = persistData;
  window.FinApp.showToast = showToast;
  window.FinApp.navigateTo = navigateTo;
  window.FinApp.openModal = openModal;
  window.FinApp.closeModal = closeModal;
  window.FinApp.getDerivedState = getDerivedState;
  window.FinApp.renderApp = renderApp;

  // Arranque al cargar el documento
  document.addEventListener('DOMContentLoaded', function () {
    initUserSession();
    initEventDelegation();
    renderApp();
  });
})();

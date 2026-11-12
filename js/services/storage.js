/* Guardar y leer los datos del usuario en localStorage. */

(function (root, factory) {
  var instance = factory(typeof window !== 'undefined' ? window.FinCategories : (root ? root.FinCategories : null));
  if (typeof module === 'object' && module && module.exports) {
    module.exports = instance;
  }
  if (typeof root !== 'undefined') {
    root.FinStorage = instance;
  }
  if (typeof window !== 'undefined') {
    window.FinStorage = instance;
  }
})(typeof self !== 'undefined' ? self : this, function (FinCategories) {
  'use strict';

  var STORAGE_PREFIX = 'finanzas_app_user_';

  // Fallback en memoria si localStorage no estuviera disponible en ciertos entornos restringidos
  var memoryStore = {};

  FinCategories = FinCategories || (typeof window !== 'undefined' ? window.FinCategories : null) || {};
  var defaultCategories = FinCategories ? FinCategories.DEFAULT_CATEGORIES : [];

  var INITIAL_EMPTY_PROFILE = {
    id: 'usuario-principal',
    name: 'Mi Cuenta',
    email: '',
    university: '',
    career: '',
    semester: undefined,
    currency: 'COP',
    locale: 'es-CO',
  };

  var INITIAL_EMPTY_DATA = {
    profile: INITIAL_EMPTY_PROFILE,
    categories: defaultCategories,
    transactions: [],
    budgets: [],
    goals: [],
    emergencyFund: {
      userId: 'usuario-principal',
      currentSaved: 0,
      targetMonthsCoverage: 3,
      monthlyContributionTarget: 0,
    },
    debts: [],
  };

  function hasLocalStorage() {
    try {
      var testKey = '__fin_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  var isLocalStorageSupported = hasLocalStorage();

  /**
   * Carga los datos financieros asociados al ID de usuario
   */
  function loadUserFinancialData(userId) {
    userId = userId || 'usuario-principal';
    var key = STORAGE_PREFIX + userId;

    try {
      var raw = null;
      if (isLocalStorageSupported) {
        raw = window.localStorage.getItem(key);
      } else {
        raw = memoryStore[key];
      }

      if (raw) {
        var parsed = JSON.parse(raw);
        if (!parsed.categories || !parsed.categories.length) {
          parsed.categories = defaultCategories;
        }
        if (!parsed.emergencyFund) {
          parsed.emergencyFund = {
            userId: userId,
            currentSaved: 0,
            targetMonthsCoverage: 3,
            monthlyContributionTarget: 0,
          };
        }
        if (!parsed.debts) parsed.debts = [];
        if (!parsed.goals) parsed.goals = [];
        if (!parsed.budgets) parsed.budgets = [];
        if (!parsed.transactions) parsed.transactions = [];
        return parsed;
      }
    } catch (err) {
      // Manejo silencioso de errores
    }

    var freshCopy = JSON.parse(JSON.stringify(INITIAL_EMPTY_DATA));
    freshCopy.categories = defaultCategories;
    saveUserFinancialData(userId, freshCopy);
    return freshCopy;
  }

  /**
   * Guarda los datos financieros aislados por usuario en localStorage
   */
  function saveUserFinancialData(userId, data, skipCloud) {
    userId = userId || 'usuario-principal';
    var key = STORAGE_PREFIX + userId;
    var serialized = JSON.stringify(data);

    try {
      if (isLocalStorageSupported) {
        window.localStorage.setItem(key, serialized);
      } else {
        memoryStore[key] = serialized;
      }
    } catch (err) {
      // Manejo silencioso de errores
    }

    // Con Firebase activo, cada guardado también se envía a la nube
    if (!skipCloud && typeof window !== 'undefined' && window.FinCloud && window.FinCloud.enabled) {
      window.FinCloud.queueSave(userId, data);
    }
  }

  /**
   * Limpia totalmente los datos del usuario para reiniciar en blanco
   */
  function clearAllUserData(userId) {
    userId = userId || 'usuario-principal';
    var key = STORAGE_PREFIX + userId;

    try {
      if (isLocalStorageSupported) {
        window.localStorage.removeItem(key);
      } else {
        delete memoryStore[key];
      }
    } catch (err) {
      // Manejo silencioso de errores
    }
  }

  var PARAMS_STORAGE_KEY = 'finanzas_app_params';

  var DEFAULT_SYSTEM_PARAMS = {
    rule50: 50,
    rule30: 30,
    rule20: 20,
    emergencyFundMonths: 3,
    dtiWarningThreshold: 0.20,
    dtiAlertThreshold: 0.35,
    savingsWarningThreshold: 0.10,
    defaultCurrency: 'COP',
  };

  /**
   * Obtiene los parametros del sistema desde localStorage con valores por defecto
   */
  function getSystemParams() {
    try {
      var raw = null;
      if (isLocalStorageSupported) {
        raw = window.localStorage.getItem(PARAMS_STORAGE_KEY);
      } else {
        raw = memoryStore[PARAMS_STORAGE_KEY];
      }
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          rule50: typeof parsed.rule50 === 'number' ? parsed.rule50 : DEFAULT_SYSTEM_PARAMS.rule50,
          rule30: typeof parsed.rule30 === 'number' ? parsed.rule30 : DEFAULT_SYSTEM_PARAMS.rule30,
          rule20: typeof parsed.rule20 === 'number' ? parsed.rule20 : DEFAULT_SYSTEM_PARAMS.rule20,
          emergencyFundMonths: typeof parsed.emergencyFundMonths === 'number' ? parsed.emergencyFundMonths : DEFAULT_SYSTEM_PARAMS.emergencyFundMonths,
          dtiWarningThreshold: typeof parsed.dtiWarningThreshold === 'number' ? parsed.dtiWarningThreshold : DEFAULT_SYSTEM_PARAMS.dtiWarningThreshold,
          dtiAlertThreshold: typeof parsed.dtiAlertThreshold === 'number' ? parsed.dtiAlertThreshold : DEFAULT_SYSTEM_PARAMS.dtiAlertThreshold,
          savingsWarningThreshold: typeof parsed.savingsWarningThreshold === 'number' ? parsed.savingsWarningThreshold : DEFAULT_SYSTEM_PARAMS.savingsWarningThreshold,
          defaultCurrency: parsed.defaultCurrency || DEFAULT_SYSTEM_PARAMS.defaultCurrency,
        };
      }
    } catch (e) {
      // Usar valores por defecto en caso de fallo
    }
    return JSON.parse(JSON.stringify(DEFAULT_SYSTEM_PARAMS));
  }

  /**
   * Guarda los parametros del sistema validados
   */
  function saveSystemParams(params, fromCloud) {
    if (!params) return false;
    var sanitized = {
      rule50: Math.max(0, Math.min(100, Number(params.rule50) || DEFAULT_SYSTEM_PARAMS.rule50)),
      rule30: Math.max(0, Math.min(100, Number(params.rule30) || DEFAULT_SYSTEM_PARAMS.rule30)),
      rule20: Math.max(0, Math.min(100, Number(params.rule20) || DEFAULT_SYSTEM_PARAMS.rule20)),
      emergencyFundMonths: Math.max(1, Math.min(24, parseInt(params.emergencyFundMonths, 10) || DEFAULT_SYSTEM_PARAMS.emergencyFundMonths)),
      dtiWarningThreshold: Math.max(0.05, Math.min(0.5, Number(params.dtiWarningThreshold) || DEFAULT_SYSTEM_PARAMS.dtiWarningThreshold)),
      dtiAlertThreshold: Math.max(0.1, Math.min(0.8, Number(params.dtiAlertThreshold) || DEFAULT_SYSTEM_PARAMS.dtiAlertThreshold)),
      savingsWarningThreshold: Math.max(0.01, Math.min(0.5, Number(params.savingsWarningThreshold) || DEFAULT_SYSTEM_PARAMS.savingsWarningThreshold)),
      defaultCurrency: (params.defaultCurrency === 'USD' || params.defaultCurrency === 'EUR') ? params.defaultCurrency : 'COP',
    };
    var serialized = JSON.stringify(sanitized);
    try {
      if (isLocalStorageSupported) {
        window.localStorage.setItem(PARAMS_STORAGE_KEY, serialized);
      } else {
        memoryStore[PARAMS_STORAGE_KEY] = serialized;
      }
      if (!fromCloud && typeof window !== 'undefined' && window.FinCloud && window.FinCloud.enabled) {
        window.FinCloud.pushParams(sanitized);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Restaura los parametros del sistema a sus valores por defecto
   */
  function resetSystemParams() {
    saveSystemParams(DEFAULT_SYSTEM_PARAMS);
    return JSON.parse(JSON.stringify(DEFAULT_SYSTEM_PARAMS));
  }

  return {
    INITIAL_EMPTY_PROFILE: INITIAL_EMPTY_PROFILE,
    INITIAL_EMPTY_DATA: INITIAL_EMPTY_DATA,
    DEFAULT_SYSTEM_PARAMS: DEFAULT_SYSTEM_PARAMS,
    loadUserFinancialData: loadUserFinancialData,
    saveUserFinancialData: saveUserFinancialData,
    clearAllUserData: clearAllUserData,
    getSystemParams: getSystemParams,
    saveSystemParams: saveSystemParams,
    resetSystemParams: resetSystemParams,
  };
});

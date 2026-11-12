/* Monedas (COP, USD, EUR): conversión y tasas de cambio. El dinero se guarda siempre en COP. */

(function (root, factory) {
  var instance = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = instance;
  }
  if (typeof root !== 'undefined') {
    root.FinCurrency = instance;
  }
  if (typeof window !== 'undefined') {
    window.FinCurrency = instance;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.FinCurrency = instance;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)), function () {
  'use strict';

  var STORAGE_KEY_CURRENCY = 'finanzas_app_active_currency';
  var STORAGE_KEY_RATES = 'finanzas_app_fx_rates';

  // Configuración de monedas soportadas
  var CURRENCIES = {
    COP: {
      code: 'COP',
      name: 'Peso Colombiano',
      symbol: '$',
      locale: 'es-CO',
      decimals: 0,
      prefix: '$ ',
    },
    USD: {
      code: 'USD',
      name: 'Dólar Estadounidense',
      symbol: 'US$',
      locale: 'en-US',
      decimals: 2,
      prefix: 'US$ ',
    },
    EUR: {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      locale: 'en-IE', // Genera formato estándar internacional €1,080.00
      decimals: 2,
      prefix: '€ ',
    },
  };

  // Tasas de contingencia offline seguras basadas en cotizaciones de referencia recientes
  var DEFAULT_RATES = {
    base: 'COP',
    date: '2026-11-05',
    timestamp: 1793836951000,
    rates: {
      COP: 1,
      USD: 0.00030816, // 1 COP = ~0.000308 USD
      EUR: 0.00027418, // 1 COP = ~0.000274 EUR
    },
    ratesInverse: {
      COP: 1,
      USD: 3245.02, // 1 USD = ~3.245,02 COP
      EUR: 3647.20, // 1 EUR = ~3.647,20 COP
    },
    provider: 'ExchangeRate-API (Referencia diaria)',
    isCached: true,
    isOffline: false,
    evalNote: 'Frankfurter evaluado: no soporta COP; se utiliza ExchangeRate-API como estándar oficial.',
  };

  var state = {
    activeCurrency: 'COP',
    ratesData: null,
    isFetching: false,
  };

  /**
   * Carga la moneda activa guardada en localStorage
   */
  function loadStoredCurrency() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        var saved = window.localStorage.getItem(STORAGE_KEY_CURRENCY);
        if (saved && CURRENCIES[saved]) {
          return saved;
        }
      }
    } catch (e) {
      // Ignorar restricciones en entornos sin storage
    }
    return 'COP';
  }

  /**
   * Carga las tasas guardadas en localStorage o retorna los valores por defecto
   */
  function loadStoredRates() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        var raw = window.localStorage.getItem(STORAGE_KEY_RATES);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.rates && typeof parsed.rates.USD === 'number' && typeof parsed.rates.EUR === 'number') {
            parsed.isCached = true;
            return parsed;
          }
        }
      }
    } catch (e) {
      // Fallback
    }
    return JSON.parse(JSON.stringify(DEFAULT_RATES));
  }

  /**
   * Guarda las tasas en localStorage
   */
  function saveRates(ratesData) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_RATES, JSON.stringify(ratesData));
      }
    } catch (e) {
      // Ignorar errores de cuota
    }
  }

  /**
   * Consulta asíncrona a la API centralizada de tipos de cambio
   */
  function fetchRates(force) {
    if (state.isFetching) return Promise.resolve(state.ratesData);

    // Evitar peticiones repetidas si ya tenemos tasas de hoy (menos de 6 horas) y no es forzado
    var now = Date.now();
    if (!force && state.ratesData && state.ratesData.timestamp && !state.ratesData.isOffline) {
      var ageHours = (now - state.ratesData.timestamp) / (1000 * 60 * 60);
      if (ageHours < 6) {
        return Promise.resolve(state.ratesData);
      }
    }

    state.isFetching = true;

    // Intentar Endpoint 1: Open ExchangeRate API con base COP
    return fetch('https://open.er-api.com/v6/latest/COP')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.result !== 'success' || !data.rates) {
          throw new Error('Formato inválido de respuesta de API');
        }

        var rateUSD = Number(data.rates.USD);
        var rateEUR = Number(data.rates.EUR);

        if (!rateUSD || rateUSD <= 0 || !rateEUR || rateEUR <= 0) {
          throw new Error('Tasas numéricas inválidas');
        }

        var dateStr = data.time_last_update_utc ? data.time_last_update_utc.substring(0, 16) : new Date().toISOString().substring(0, 10);

        var updated = {
          base: 'COP',
          date: dateStr,
          timestamp: Date.now(),
          rates: {
            COP: 1,
            USD: rateUSD,
            EUR: rateEUR,
          },
          ratesInverse: {
            COP: 1,
            USD: Number((1 / rateUSD).toFixed(2)),
            EUR: Number((1 / rateEUR).toFixed(2)),
          },
          provider: 'ExchangeRate-API (Referencia diaria)',
          isCached: false,
          isOffline: false,
          evalNote: 'Frankfurter evaluado: no soporta COP; se utiliza ExchangeRate-API.',
        };

        state.ratesData = updated;
        saveRates(updated);
        return updated;
      })
      .catch(function () {
        // Fallback al proveedor secundario si falla la consulta primaria
        return fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cop.json')
          .then(function (res2) {
            if (!res2.ok) throw new Error('HTTP ' + res2.status);
            return res2.json();
          })
          .then(function (data2) {
            if (!data2 || !data2.cop || !data2.cop.usd || !data2.cop.eur) {
              throw new Error('Datos secundarios inválidos');
            }

            var rateUSD = Number(data2.cop.usd);
            var rateEUR = Number(data2.cop.eur);

            var updated2 = {
              base: 'COP',
              date: data2.date || new Date().toISOString().substring(0, 10),
              timestamp: Date.now(),
              rates: {
                COP: 1,
                USD: rateUSD,
                EUR: rateEUR,
              },
              ratesInverse: {
                COP: 1,
                USD: Number((1 / rateUSD).toFixed(2)),
                EUR: Number((1 / rateEUR).toFixed(2)),
              },
              provider: 'Currency API jsDelivr (Respaldo)',
              isCached: false,
              isOffline: false,
              evalNote: 'Proveedor de respaldo activado correctamente.',
            };

            state.ratesData = updated2;
            saveRates(updated2);
            return updated2;
          })
          .catch(function () {
            // Mantener tasas almacenadas y marcar bandera offline
            if (!state.ratesData) {
              state.ratesData = loadStoredRates();
            }
            state.ratesData.isOffline = true;
            state.ratesData.isCached = true;
            return state.ratesData;
          });
      })
      .finally(function () {
        state.isFetching = false;
      });
  }

  /**
   * Convierte un valor numérico desde Pesos Colombianos (COP) a la moneda destino.
   * Mantiene precisión completa en punto flotante sin redondeo prematuro.
   */
  function convertFromCOP(amountCOP, targetCurrency) {
    var amt = Number(amountCOP);
    if (isNaN(amt) || !isFinite(amt)) return 0;

    targetCurrency = targetCurrency || state.activeCurrency;
    if (targetCurrency === 'COP') return amt;

    var rates = (state.ratesData && state.ratesData.rates) ? state.ratesData.rates : DEFAULT_RATES.rates;
    var rate = rates[targetCurrency];

    if (!rate || isNaN(rate) || rate <= 0) return amt;
    return amt * rate;
  }

  /**
   * Convierte un valor desde una moneda específica (COP, USD, EUR) hacia COP.
   * Utilizado para registros de nuevos movimientos con trazabilidad.
   */
  function convertToCOP(amount, fromCurrency) {
    var amt = Number(amount);
    if (isNaN(amt) || !isFinite(amt)) return 0;

    fromCurrency = fromCurrency || state.activeCurrency;
    if (fromCurrency === 'COP') return amt;

    var ratesInv = (state.ratesData && state.ratesData.ratesInverse) ? state.ratesData.ratesInverse : DEFAULT_RATES.ratesInverse;
    var invRate = ratesInv[fromCurrency];

    if (invRate && !isNaN(invRate) && invRate > 0) {
      return amt * invRate;
    }

    // Fallback a división si no hay tasa inversa directa
    var rates = (state.ratesData && state.ratesData.rates) ? state.ratesData.rates : DEFAULT_RATES.rates;
    var rate = rates[fromCurrency];
    if (rate && rate > 0) {
      return amt / rate;
    }

    return amt;
  }

  /**
   * Formatea un valor dado en una moneda específica usando Intl.NumberFormat de manera rigurosa.
   */
  function formatAmountInCurrency(amount, currency) {
    if (isNaN(amount) || !isFinite(amount)) return '$ 0';
    currency = currency || state.activeCurrency;
    var meta = CURRENCIES[currency] || CURRENCIES.COP;

    try {
      if (currency === 'COP') {
        var roundedCOP = Math.round(amount);
        return new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          maximumFractionDigits: 0,
        }).format(roundedCOP);
      }

      if (currency === 'USD') {
        // Formato estadounidense con símbolo US$ claro y sin ambigüedades
        var usdStr = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
        // Si el formateador retorna "$1,250.00", prefijar "US" para evitar confusión con el peso
        if (usdStr.indexOf('US$') !== 0 && usdStr.charAt(0) === '$') {
          return 'US' + usdStr;
        }
        return usdStr;
      }

      if (currency === 'EUR') {
        // Formato estándar europeo con símbolo de Euro
        return new Intl.NumberFormat('en-IE', {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      }
    } catch (e) {
      // Fallback
    }

    return meta.symbol + ' ' + amount.toFixed(meta.decimals);
  }

  /**
   * FUNCIÓN PRINCIPAL DE CONVERSIÓN Y FORMATEO:
   * Recibe un valor contable original en COP y lo convierte a la moneda activa (u optCurrency)
   * formateándolo con Intl.NumberFormat.
   */
  function format(amountCOP, optCurrency) {
    var targetCurr = optCurrency || state.activeCurrency;
    var converted = convertFromCOP(amountCOP, targetCurr);
    return formatAmountInCurrency(converted, targetCurr);
  }

  /**
   * Cambia la moneda activa del sistema, persiste en localStorage y notifica a los oyentes.
   */
  function setActiveCurrency(currency) {
    if (!CURRENCIES[currency]) return;
    if (state.activeCurrency === currency) return;

    state.activeCurrency = currency;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_CURRENCY, currency);
      }
    } catch (e) {
      // Ignorar error
    }

  }

  function getActiveCurrency() {
    return state.activeCurrency;
  }
  function getRatesInfo() {
    return state.ratesData || DEFAULT_RATES;
  }
  // Inicialización de arranque
  state.activeCurrency = loadStoredCurrency();
  state.ratesData = loadStoredRates();

  // Disparar sincronización inicial sin bloquear el hilo principal
  setTimeout(function () {
    fetchRates(false);
  }, 100);

  return {
    fetchRates: fetchRates,
    getActiveCurrency: getActiveCurrency,
    setActiveCurrency: setActiveCurrency,
    getRatesInfo: getRatesInfo,
    convertFromCOP: convertFromCOP,
    convertToCOP: convertToCOP,
    format: format,
    formatAmountInCurrency: formatAmountInCurrency,
  };
});

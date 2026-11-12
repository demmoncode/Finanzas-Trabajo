/* Funciones para dar formato a dinero, fechas y números. */

(function (root, factory) {
  var instance = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = instance;
  }
  if (typeof root !== 'undefined') {
    root.FinFormatters = instance;
  }
  if (typeof window !== 'undefined') {
    window.FinFormatters = instance;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.FinFormatters = instance;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)), function () {
  'use strict';

  /**
   * Formatea un valor numérico expresado en la moneda base del sistema (COP)
   * convirtiéndolo y adaptándolo a la moneda activa (COP, USD, EUR) mediante Intl.NumberFormat.
   */
  function formatCOP(amount, optCurrency) {
    if (typeof window !== 'undefined' && window.FinCurrency && typeof window.FinCurrency.format === 'function') {
      return window.FinCurrency.format(amount, optCurrency);
    }
    return formatCOPStandard(amount);
  }

  /**
   * Formateo estándar exclusivo en COP sin conversión
   */
  function formatCOPStandard(amount) {
    if (isNaN(amount) || !isFinite(amount)) return '$ 0';
    var rounded = Math.round(amount);
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(rounded);
    } catch (e) {
      return '$ ' + formatThousands(rounded);
    }
  }

  /**
   * Formatea un número entero o string numérico agregando puntos (.) como separador de miles.
   * Ej: "1000" -> "1.000"
   * Ej: "1250000" -> "1.250.000"
   */
  function formatThousands(value) {
    if (value === '' || value === null || value === undefined) return '';
    var digitsOnly = String(value).replace(/\D/g, '');
    if (!digitsOnly) return '';
    return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /**
   * Limpia un string numérico para obtener el valor numérico puro.
   * Maneja tanto enteros como decimales si se ingresan en USD/EUR.
   */
  function parseThousands(formattedValue) {
    if (!formattedValue) return 0;
    var s = String(formattedValue).trim();

    if (s.indexOf(',') > -1) {
      // Formato colombiano: los puntos son miles y la coma es el decimal (1.500,50)
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      // Solo puntos de miles (3.000.000)
      s = s.replace(/\./g, '');
    }
    // Si no, es un numero normal ("320000" o "12.5")

    var num = parseFloat(s);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Formatea un porcentaje numérico con 1 decimal.
   * Ej: 0.254 -> "25.4%"
   */
  function formatPercentage(ratio) {
    if (isNaN(ratio) || !isFinite(ratio)) return '0.0%';
    var percentage = ratio * 100;
    return percentage.toFixed(1) + '%';
  }

  /**
   * Obtiene el mes actual en formato YYYY-MM
   */
  function getCurrentMonthKey() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    return year + '-' + month;
  }

  /**
   * Obtiene la fecha actual en formato ISO YYYY-MM-DD
   */
  function getCurrentDateISO() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  /**
   * Formatea una fecha YYYY-MM-DD a formato legible en español.
   * Ej: "2026-11-05" -> "5 nov 2026"
   */
  function formatDateES(dateString) {
    if (!dateString) return '';
    try {
      var parts = dateString.split('-').map(Number);
      var date = new Date(parts[0], parts[1] - 1, parts[2]);
      return new Intl.DateTimeFormat('es-CO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
    } catch (e) {
      return dateString;
    }
  }

  /**
   * División matemática segura para evitar Infinity o NaN
   */
  function safeDivide(numerator, denominator, fallback) {
    if (fallback === undefined) fallback = 0;
    if (denominator === 0 || isNaN(denominator) || !isFinite(denominator)) {
      return fallback;
    }
    var res = numerator / denominator;
    return isFinite(res) ? res : fallback;
  }

  /**
   * Genera un identificador único seguro
   */
  function generateId(prefix) {
    prefix = prefix || 'id';
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
  }

  return {
    formatCOP: formatCOP,
    formatCOPStandard: formatCOPStandard,
    formatThousands: formatThousands,
    parseThousands: parseThousands,
    formatPercentage: formatPercentage,
    getCurrentMonthKey: getCurrentMonthKey,
    getCurrentDateISO: getCurrentDateISO,
    formatDateES: formatDateES,
    safeDivide: safeDivide,
    generateId: generateId,
  };
});

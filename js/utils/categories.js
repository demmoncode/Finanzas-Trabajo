/* Categorías de ingresos y gastos con su color e ícono. */

(function (root, factory) {
  var instance = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = instance;
  }
  if (typeof root !== 'undefined') {
    root.FinCategories = instance;
  }
  if (typeof window !== 'undefined') {
    window.FinCategories = instance;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.FinCategories = instance;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)), function () {
  'use strict';

  var DEFAULT_CATEGORIES = [
    // Ingresos
    {
      id: 'inc-mesada',
      name: 'Mesada / Apoyo Familiar',
      type: 'income',
      group: 'income',
      color: '#10b981',
      isEssential: false,
    },
    {
      id: 'inc-empleo',
      name: 'Sueldo / Trabajo Parcial',
      type: 'income',
      group: 'income',
      color: '#059669',
      isEssential: false,
    },
    {
      id: 'inc-beca',
      name: 'Beca / Subsidio Académico',
      type: 'income',
      group: 'income',
      color: '#047857',
      isEssential: false,
    },
    {
      id: 'inc-freelance',
      name: 'Tutorías / Freelance',
      type: 'income',
      group: 'income',
      color: '#34d399',
      isEssential: false,
    },
    {
      id: 'inc-otros',
      name: 'Otros Ingresos',
      type: 'income',
      group: 'income',
      color: '#6ee7b7',
      isEssential: false,
    },

    // Gastos Esenciales (Necesidades - Base del Fondo de Emergencia)
    {
      id: 'exp-transporte',
      name: 'Transporte / Bus / Metro',
      type: 'expense',
      group: 'essential',
      color: '#3b82f6',
      isEssential: true,
    },
    {
      id: 'exp-alimentacion-u',
      name: 'Alimentación Diaria / Almuerzos',
      type: 'expense',
      group: 'essential',
      color: '#2563eb',
      isEssential: true,
    },
    {
      id: 'exp-academico',
      name: 'Materiales, Fotocopias y Libros',
      type: 'expense',
      group: 'essential',
      color: '#1d4ed8',
      isEssential: true,
    },
    {
      id: 'exp-vivienda',
      name: 'Residencia / Habitación / Servicios',
      type: 'expense',
      group: 'essential',
      color: '#1e40af',
      isEssential: true,
    },
    {
      id: 'exp-salud',
      name: 'Salud / Medicamentos',
      type: 'expense',
      group: 'essential',
      color: '#0284c7',
      isEssential: true,
    },

    // Gastos No Esenciales (Deseos / Estilo de vida)
    {
      id: 'exp-ocio',
      name: 'Salidas, Cafés y Amigos',
      type: 'expense',
      group: 'non_essential',
      color: '#f59e0b',
      isEssential: false,
    },
    {
      id: 'exp-streaming',
      name: 'Suscripciones / Streaming',
      type: 'expense',
      group: 'non_essential',
      color: '#d97706',
      isEssential: false,
    },
    {
      id: 'exp-ropa',
      name: 'Ropa y Cuidado Personal',
      type: 'expense',
      group: 'non_essential',
      color: '#b45309',
      isEssential: false,
    },
    {
      id: 'exp-hobbies',
      name: 'Hobbies y Entretenimiento',
      type: 'expense',
      group: 'non_essential',
      color: '#eab308',
      isEssential: false,
    },

    // Ahorro y Deudas
    {
      id: 'exp-deudas',
      name: 'Cuota Crédito / Préstamo',
      type: 'expense',
      group: 'savings_debt',
      color: '#ef4444',
      isEssential: true,
    },
    {
      id: 'exp-ahorro',
      name: 'Ahorro / Fondo Personal',
      type: 'expense',
      group: 'savings_debt',
      color: '#8b5cf6',
      isEssential: false,
    },
  ];

  function getCategoryById(categories, id) {
    if (!categories || !categories.length) categories = DEFAULT_CATEGORIES;
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === id) return categories[i];
    }
    return null;
  }

  return {
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    getCategoryById: getCategoryById,
  };
});

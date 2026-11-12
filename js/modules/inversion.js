/* Modulo de inversion: muestra el capital libre en tiempo real y en que orden usarlo. */

(function (root) {
  'use strict';

  root.FinApp = root.FinApp || {};

  var Fmt = (typeof window !== 'undefined' ? window.FinFormatters : null) || root.FinFormatters;
  var Invest = (typeof window !== 'undefined' ? window.FinInvest : null) || root.FinInvest;

  var STAGE_TEXT = {
    sin_ingresos: {
      tone: 'neutral',
      title: 'Todavía no hay dinero registrado',
      body: 'Cuando registres tus ingresos, aquí verás cuánto capital libre tienes y en qué orden conviene usarlo.',
    },
    sin_capital: {
      tone: 'warning',
      title: 'Hoy no tienes capital libre para invertir',
      body: 'Tu saldo, descontando lo que ya apartaste en fondo y metas, es cero. Invertir sin dinero libre suele terminar en deudas o en vender a destiempo. Primero genera margen: ahorra una parte de cada ingreso apenas lo recibas.',
    },
    cuotas: {
      tone: 'warning',
      title: 'Primero cubre las cuotas del mes',
      body: 'Parte de tu dinero ya está comprometido con cuotas que no has pagado. Una cuota atrasada cuesta más que lo que rinde cualquier inversión.',
    },
    colchon: {
      tone: 'warning',
      title: 'Primero arma un colchón mínimo',
      body: 'Tienes deudas y casi nada de reserva. Con un mes de gastos esenciales guardado, un imprevisto no te obliga a endeudarte otra vez.',
    },
    deudas: {
      tone: 'alert',
      title: 'Pagar tus deudas rinde más que invertir',
      body: 'Abonar a una deuda con interés es una ganancia segura: te ahorras esa tasa. Ninguna inversión de bajo riesgo suele rendir más que lo que cobra una tarjeta o un préstamo de consumo.',
    },
    sin_gastos: {
      tone: 'neutral',
      title: 'Falta un dato para recomendarte',
      body: 'Para saber cuánto fondo de emergencia necesitas antes de invertir, registra tus gastos esenciales (arriendo, mercado, transporte, servicios).',
    },
    fondo: {
      tone: 'warning',
      title: 'Tu dinero debe ir primero al fondo de emergencia',
      body: 'Antes de invertir necesitas una reserva líquida. Así, si surge un imprevisto, no tendrás que sacar tus inversiones en mal momento.',
    },
    invertir: {
      tone: 'success',
      title: 'Ya puedes invertir parte de tu dinero',
      body: 'Tus cuotas, tus deudas costosas y tu fondo de emergencia están cubiertos con tu capital actual. El excedente puede empezar a trabajar para ti.',
    },
  };

  var STEP_STATE = {
    done: { label: 'Listo', color: 'var(--color-income)', bg: 'var(--color-income-light)' },
    funded: { label: 'Alcanzas a cubrirlo', color: 'var(--color-income)', bg: 'var(--color-income-light)' },
    partial: { label: 'Cubierto en parte', color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
    pending: { label: 'Pendiente', color: 'var(--color-expense)', bg: 'var(--color-expense-light)' },
    unknown: { label: 'Falta información', color: 'var(--text-secondary)', bg: 'var(--bg-surface-secondary)' },
    current: { label: 'Tu siguiente paso', color: 'var(--color-brand)', bg: 'var(--bg-surface-secondary)' },
    locked: { label: 'Más adelante', color: 'var(--text-tertiary)', bg: 'var(--bg-surface-secondary)' },
  };

  var TONE_COLOR = {
    success: 'var(--color-income)',
    warning: 'var(--color-warning)',
    alert: 'var(--color-expense)',
    neutral: 'var(--text-secondary)',
  };

  var RISK_STYLE = {
    Bajo: { color: 'var(--color-income)', bg: 'var(--color-income-light)' },
    Medio: { color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
    Alto: { color: 'var(--color-expense)', bg: 'var(--color-expense-light)' },
  };

  function esc(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stat(label, value, color, hint) {
    var h = '';
    h += '<div style="padding:0.85rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
    h += '  <div style="font-size:0.75rem;color:var(--text-secondary);">' + label + '</div>';
    h += '  <div class="font-mono" style="font-size:1.15rem;font-weight:700;color:' + (color || 'var(--text-primary)') + ';margin-top:0.2rem;">' + value + '</div>';
    if (hint) h += '  <div style="font-size:0.7rem;color:var(--text-tertiary);margin-top:0.25rem;line-height:1.35;">' + hint + '</div>';
    h += '</div>';
    return h;
  }

  function tag(label, color, bg) {
    return '<span class="category-tag" style="background:' + bg + ';color:' + color + ';">' + label + '</span>';
  }

  function renderCapital(inv) {
    var cap = inv.capital;
    var html = '';
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div class="surface-header">';
    html += '    <h2 class="surface-title">Tu capital hoy</h2>';
    html += '    <span style="font-size:0.75rem;color:var(--text-secondary);">Se actualiza con cada movimiento que registras</span>';
    html += '  </div>';
    html += '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(190px, 1fr));gap:0.75rem;">';
    html += stat('Saldo registrado', Fmt.formatCOP(cap.balance), cap.balance < 0 ? 'var(--color-expense)' : null, 'Todos tus ingresos menos todos tus gastos.');
    html += stat('Apartado en fondo y metas', Fmt.formatCOP(cap.reserved), null, 'Fondo: ' + Fmt.formatCOP(cap.fundSaved) + ' · Metas: ' + Fmt.formatCOP(cap.goalsSaved));
    html += stat('Cuotas pendientes del mes', Fmt.formatCOP(inv.committed), inv.committed > 0 ? 'var(--color-warning)' : null, 'Dinero ya comprometido con tus deudas.');
    html += stat('Capital libre', Fmt.formatCOP(cap.free), cap.free > 0 ? 'var(--color-income)' : 'var(--text-secondary)', 'Saldo menos lo apartado.');
    html += '  </div>';
    html += '</div>';
    return html;
  }

  function renderStatus(inv) {
    var t = STAGE_TEXT[inv.stage] || STAGE_TEXT.sin_capital;
    var color = TONE_COLOR[t.tone];
    var cap = inv.capital;
    var extra = '';
    if (inv.stage === 'sin_capital') {
      if (cap.balance < 0) {
        extra = ' Además, tus gastos registrados superan tus ingresos: revisa si falta registrar algún ingreso.';
      } else if (cap.reservedExceedsBalance) {
        extra = ' Lo apartado en fondo y metas supera tu saldo registrado: o falta anotar algún ingreso, o parte de ese dinero ya se gastó. Si usaste tu fondo, lo prioritario es reponerlo.';
      }
    }
    var headline = t.title;
    var body = t.body + extra;
    if (inv.stage === 'invertir') {
      if (inv.pending.length) {
        headline = 'Después de cubrir lo básico te sobran ' + Fmt.formatCOP(inv.investable) + ' para invertir';
        body = 'Con tu capital actual alcanzas a cubrir primero los pasos pendientes de la lista. Lo que quede puede empezar a trabajar para ti.';
      } else {
        headline = 'Tienes ' + Fmt.formatCOP(inv.investable) + ' listos para invertir';
      }
    }

    var html = '';
    html += '<div class="surface-card" style="margin-bottom:1.25rem;border-left:3px solid ' + color + ';">';
    html += '  <h2 style="font-size:1rem;font-weight:700;color:' + color + ';margin-bottom:0.35rem;">' + esc(headline) + '</h2>';
    html += '  <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.5;">' + esc(body) + '</p>';
    if (inv.next && inv.stage !== 'sin_ingresos' && !(inv.stage === 'invertir' && !inv.pending.length)) {
      html += '  <p style="font-size:0.85rem;color:var(--text-primary);line-height:1.5;margin-top:0.6rem;"><strong>Qué hacer ahora:</strong> ' + esc(inv.next.charAt(0).toUpperCase() + inv.next.slice(1)) + '</p>';
    }
    html += '</div>';
    return html;
  }

  function renderSteps(inv) {
    var html = '';
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div class="surface-header">';
    html += '    <h2 class="surface-title">Orden recomendado para tu dinero</h2>';
    html += '    <span style="font-size:0.75rem;color:var(--text-secondary);">Cada paso se calcula con tu capital libre</span>';
    html += '  </div>';
    html += '  <div style="display:flex;flex-direction:column;gap:0.6rem;">';
    inv.steps.forEach(function (step, index) {
      var st = STEP_STATE[step.state] || STEP_STATE.locked;
      var text = '';
      if (step.id === 'invertir') {
        text = step.state === 'current'
          ? 'Excedente disponible: ' + Fmt.formatCOP(step.allocated) + '.'
          : 'Se habilita cuando los pasos anteriores estén cubiertos.';
      } else if (step.state === 'done') {
        text = step.doneText;
      } else {
        text = step.detail;
        if (step.allocated > 0) {
          text += ' Con tu capital actual puedes destinar ' + Fmt.formatCOP(step.allocated) + '.';
        }
      }
      html += '    <div style="display:flex;gap:0.75rem;align-items:flex-start;padding:0.75rem;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
      html += '      <div class="font-mono" style="min-width:1.5rem;font-weight:700;color:var(--text-tertiary);">' + (index + 1) + '</div>';
      html += '      <div style="flex:1;">';
      html += '        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">';
      html += '          <strong style="font-size:0.875rem;">' + esc(step.title) + '</strong>';
      html += '          ' + tag(st.label, st.color, st.bg);
      html += '        </div>';
      if (text) html += '        <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.45;margin-top:0.25rem;">' + esc(text) + '</div>';
      html += '      </div>';
      html += '    </div>';
    });
    html += '  </div>';
    html += '</div>';
    return html;
  }

  function renderDebtPlan(inv) {
    if (!inv.debtPlan.length) return '';
    var html = '';
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div class="surface-header">';
    html += '    <h2 class="surface-title">Tus deudas y el orden para pagarlas</h2>';
    html += '    <span style="font-size:0.75rem;color:var(--text-secondary);">Primero las más caras</span>';
    html += '  </div>';
    html += '  <div class="fin-table-wrapper"><table class="fin-table">';
    html += '    <thead><tr><th>Deuda</th><th>Costo</th><th style="text-align:right;">Saldo</th><th style="text-align:right;">Podrías abonar hoy</th></tr></thead><tbody>';
    inv.debtPlan.forEach(function (x) {
      var level = x.cost.level;
      var st = level === 'alto' ? STEP_STATE.pending : STEP_STATE.partial;
      var costText = x.cost.rate !== null ? x.cost.rate + '% E.A.' : Invest.costLabel(level) + ' (estimado)';
      html += '<tr>';
      html += '  <td>' + esc(x.debt.name) + '</td>';
      html += '  <td>' + tag(esc(costText), st.color, st.bg) + '</td>';
      html += '  <td class="font-mono" style="text-align:right;font-size:0.8rem;">' + Fmt.formatCOP(x.owed) + '</td>';
      html += '  <td class="font-mono" style="text-align:right;font-size:0.8rem;font-weight:700;">' + (x.amount > 0 ? Fmt.formatCOP(x.amount) + (x.clears ? ' (la saldas)' : '') : 'Sin capital aún') + '</td>';
      html += '</tr>';
    });
    html += '  </tbody></table></div>';
    var estimated = inv.debtPlan.some(function (x) { return x.cost.estimated; });
    if (estimated) {
      html += '  <p style="font-size:0.75rem;color:var(--text-tertiary);margin-top:0.6rem;line-height:1.4;">El costo de algunas deudas es estimado según su tipo. Si registras la tasa de interés al crear la deuda, la prioridad será más precisa.</p>';
    }
    if (inv.cheapDebts > 0) {
      html += '  <p style="font-size:0.75rem;color:var(--text-tertiary);margin-top:0.4rem;line-height:1.4;">Las deudas de costo bajo (como un crédito educativo con tasa baja) puedes seguir pagándolas con su cuota normal mientras inviertes.</p>';
    }
    html += '</div>';
    return html;
  }

  function renderProfiles(inv) {
    var html = '';
    html += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">';
    Object.keys(Invest.PROFILES).forEach(function (key) {
      var active = key === inv.profileKey;
      html += '<button type="button" data-action="invest-profile" data-profile="' + key + '" class="' + (active ? 'btn-primary' : 'btn-secondary') + '" style="padding:0.4rem 0.9rem;font-size:0.8rem;">' + Invest.PROFILES[key].label + '</button>';
    });
    html += '</div>';
    return html;
  }

  var PROFILE_HINT = {
    conservador: 'Prefieres no perder dinero y necesitas poder retirarlo con facilidad.',
    moderado: 'Aceptas pequeñas variaciones a cambio de rendir un poco más a mediano plazo.',
    arriesgado: 'Puedes esperar 5 años o más y soportar que tu inversión baje temporalmente.',
  };

  function renderAllocation(inv) {
    var html = '';
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div class="surface-header">';
    html += '    <h2 class="surface-title">Cómo repartir ' + Fmt.formatCOP(inv.investable) + '</h2>';
    html += '    <span style="font-size:0.75rem;color:var(--text-secondary);">Perfil ' + inv.profile.label.toLowerCase() + '</span>';
    html += '  </div>';
    html += renderProfiles(inv);
    html += '  <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.45;">' + PROFILE_HINT[inv.profileKey] + ' Solo ves los instrumentos que se ajustan al monto que tienes hoy; al crecer tu capital aparecerán más opciones.</p>';
    html += '  <div style="display:flex;flex-direction:column;gap:0.75rem;">';
    inv.allocations.forEach(function (a) {
      var ins = a.instrument;
      var rs = RISK_STYLE[ins.risk] || RISK_STYLE.Bajo;
      html += '    <div style="padding:0.85rem;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
      html += '      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.75rem;flex-wrap:wrap;">';
      html += '        <strong style="font-size:0.9rem;">' + esc(ins.name) + '</strong>';
      html += '        <span class="font-mono" style="font-weight:700;">' + Fmt.formatCOP(a.amount) + ' <span style="font-weight:400;font-size:0.75rem;color:var(--text-secondary);">(' + Math.round(a.share * 100) + '%)</span></span>';
      html += '      </div>';
      html += '      <div class="goal-track" style="height:6px;background:var(--border-subtle);border-radius:var(--radius-full);overflow:hidden;margin:0.5rem 0;">';
      html += '        <div class="goal-fill" style="width:' + Math.round(a.share * 100) + '%;height:100%;background:var(--color-brand);"></div>';
      html += '      </div>';
      html += '      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.4rem;">';
      html += '        ' + tag('Riesgo ' + ins.risk.toLowerCase(), rs.color, rs.bg);
      html += '        ' + tag('Disponibilidad: ' + esc(ins.liquidity), 'var(--text-secondary)', 'var(--bg-surface-secondary)');
      html += '      </div>';
      html += '      <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.45;">' + esc(ins.what) + ' ' + esc(ins.why) + '</div>';
      html += '    </div>';
    });
    html += '  </div>';
    if (inv.shortGoals.length) {
      var names = inv.shortGoals.map(function (g) { return '"' + g.name + '"'; }).join(', ');
      html += '  <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:1rem;line-height:1.45;padding:0.6rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">Tienes metas con fecha en menos de un año (' + esc(names) + '). El dinero de esas metas debe quedarse en la cuenta de ahorros o en un fondo de bajo riesgo, no en inversiones que puedan perder valor.</p>';
    }
    html += '</div>';
    return html;
  }

  function renderWaiting(inv) {
    var items = [];
    if (inv.stage === 'sin_ingresos') {
      items.push('Registra tus ingresos en Movimientos para que la app calcule tu capital.');
    } else if (inv.stage === 'deudas' || inv.stage === 'cuotas' || inv.stage === 'colchon') {
      items.push('Mantén al día tus cuotas y evita tomar nuevas deudas mientras avanzas.');
      items.push('Cada peso que abones a una deuda costosa es una ganancia segura.');
    } else {
      items.push('Aparta una parte de cada ingreso apenas lo recibas (la regla 50/30/20 sugiere el 20%).');
      items.push('Define una meta con fecha para darle destino concreto a tu ahorro.');
    }
    items.push('Cuando completes los pasos de arriba, aquí aparecerán las opciones de inversión según tu capital.');

    var html = '';
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <h2 class="surface-title" style="margin-bottom:0.75rem;">Mientras tanto</h2>';
    html += '  <ul style="padding-left:1.1rem;font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">';
    items.forEach(function (i) { html += '<li>' + esc(i) + '</li>'; });
    html += '  </ul>';
    html += '</div>';
    return html;
  }

  function renderEducation() {
    var ideas = [
      ['Compara con el costo de tu deuda', 'Si una deuda cobra más de lo que rinde una inversión segura, pagarla es la mejor inversión.'],
      ['Mira la rentabilidad real', 'Una inversión solo te enriquece si rinde más que la inflación. Compara siempre la tasa frente a ella.'],
      ['No pongas todo en un solo lugar', 'Repartir el dinero entre varios instrumentos reduce el riesgo de perder mucho de una sola vez.'],
      ['El plazo manda', 'El dinero que necesitarás pronto va en instrumentos líquidos; solo el que no usarás en años puede asumir más riesgo.'],
      ['Verifica a quién le entregas tu dinero', 'Invierte únicamente en entidades vigiladas por la Superintendencia Financiera de Colombia y desconfía de rendimientos "garantizados" muy altos.'],
    ];
    var html = '';
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <h2 class="surface-title" style="margin-bottom:0.75rem;">Ideas clave de educación financiera</h2>';
    html += '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:0.75rem;">';
    ideas.forEach(function (i) {
      html += '    <div style="padding:0.75rem;background:var(--bg-surface-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
      html += '      <div style="font-size:0.85rem;font-weight:700;margin-bottom:0.25rem;">' + i[0] + '</div>';
      html += '      <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.45;">' + i[1] + '</div>';
      html += '    </div>';
    });
    html += '  </div>';
    html += '  <p style="font-size:0.75rem;color:var(--text-tertiary);margin-top:1rem;line-height:1.45;">Esta información es educativa y no reemplaza la asesoría de un profesional. Las tasas y los montos mínimos cambian según la entidad: confírmalos antes de invertir.</p>';
    html += '</div>';
    return html;
  }

  function evaluate() {
    var state = root.FinApp.state;
    return Invest.evaluateInvestment(state.data, undefined, state.investProfile);
  }

  // Render de la pestaña Inversión
  function renderInvestment() {
    var inv = evaluate();
    var html = '';
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <h1 class="surface-title" style="font-size:1.25rem;">Inversión</h1>';
    html += '  <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Opciones sugeridas según el dinero que tienes hoy, tus deudas y tu fondo de emergencia.</p>';
    html += '</div>';
    html += renderCapital(inv);
    html += renderStatus(inv);
    html += renderSteps(inv);
    html += renderDebtPlan(inv);
    html += inv.stage === 'invertir' ? renderAllocation(inv) : renderWaiting(inv);
    html += renderEducation();
    return html;
  }

  root.FinApp.inversion = {
    evaluate: evaluate,
    renderInvestment: renderInvestment,
  };
})(typeof window !== 'undefined' ? window : this);

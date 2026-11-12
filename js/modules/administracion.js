/* Modulo de administracion del sistema (Actor SuperAdmin) */

(function (root) {
  'use strict';

  root.FinApp = root.FinApp || {};

  var Storage = (typeof window !== 'undefined' ? window.FinStorage : null) || root.FinStorage;

  // Caso de uso: Gestionar usuarios
  function listarUsuarios() {
    if (root.FinApp.autenticacion && typeof root.FinApp.autenticacion.getUsers === 'function') {
      return root.FinApp.autenticacion.getUsers();
    }
    return [];
  }

  function crearUsuario(userData, callback) {
    if (root.FinApp.autenticacion && typeof root.FinApp.autenticacion.register === 'function') {
      root.FinApp.autenticacion.register(userData.name, userData.email, userData.password, function (res) {
        if (res.success && userData.role && userData.role !== 'usuario') {
          var users = listarUsuarios();
          for (var i = 0; i < users.length; i++) {
            if (users[i].id === res.user.id) {
              users[i].role = userData.role;
              break;
            }
          }
          root.FinApp.autenticacion.saveUsers(users);
        }
        callback(res);
      });
      return;
    }
    callback({ success: false, message: 'Servicio de autenticación no disponible.' });
  }

  function editarUsuario(userId, name, email) {
    var users = listarUsuarios();
    var cleanEmail = (email || '').trim().toLowerCase();
    var cleanName = (name || '').trim();

    if (!cleanEmail || !cleanName) return { success: false, message: 'Nombre y correo son requeridos.' };

    for (var i = 0; i < users.length; i++) {
      if (users[i].id !== userId && users[i].email.toLowerCase() === cleanEmail) {
        return { success: false, message: 'El correo electrónico ya pertenece a otro usuario.' };
      }
    }

    for (var j = 0; j < users.length; j++) {
      if (users[j].id === userId) {
        users[j].name = cleanName;
        users[j].email = cleanEmail;
        root.FinApp.autenticacion.saveUsers(users);
        return { success: true, message: 'Usuario actualizado correctamente.' };
      }
    }

    return { success: false, message: 'Usuario no encontrado.' };
  }

  function alternarEstadoUsuario(userId) {
    var session = root.FinApp.autenticacion.getActiveSession();
    if (session && session.userId === userId) {
      return { success: false, message: 'No puedes desactivar tu propia cuenta de SuperAdmin.' };
    }

    var users = listarUsuarios();
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) {
        if (users[i].role === 'superadmin') {
          return { success: false, message: 'No se puede desactivar a un SuperAdmin.' };
        }
        users[i].active = users[i].active === false ? true : false;
        root.FinApp.autenticacion.saveUsers(users);
        return { success: true, active: users[i].active, message: 'Estado del usuario actualizado.' };
      }
    }
    return { success: false, message: 'Usuario no encontrado.' };
  }

  function restablecerContrasena(userId, newPassword, callback) {
    if (!newPassword || newPassword.trim().length < 4) {
      callback({ success: false, message: 'La contraseña debe tener al menos 4 caracteres.' });
      return;
    }

    var users = listarUsuarios();
    var userIndex = -1;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) {
        userIndex = i;
        break;
      }
    }

    if (userIndex === -1) {
      callback({ success: false, message: 'Usuario no encontrado.' });
      return;
    }

    var newSalt = root.FinApp.autenticacion.generateSalt();
    root.FinApp.autenticacion.hashPassword(newPassword.trim(), newSalt, function (hash) {
      users[userIndex].passwordSalt = newSalt;
      users[userIndex].passwordHash = hash;
      root.FinApp.autenticacion.saveUsers(users);
      callback({ success: true, message: 'Contraseña restablecida exitosamente.' });
    });
  }

  function eliminarUsuario(userId) {
    var session = root.FinApp.autenticacion.getActiveSession();
    if (session && session.userId === userId) {
      return { success: false, message: 'No puedes eliminar tu propia cuenta de SuperAdmin.' };
    }

    var users = listarUsuarios();
    var userToDelete = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) {
        userToDelete = users[i];
        break;
      }
    }

    if (!userToDelete) return { success: false, message: 'Usuario no encontrado.' };
    if (userToDelete.role === 'superadmin') {
      return { success: false, message: 'No se puede eliminar una cuenta de SuperAdmin.' };
    }

    // Borrado de la lista de usuarios
    var filtered = users.filter(function (u) { return u.id !== userId; });
    root.FinApp.autenticacion.saveUsers(filtered);

    // Borrado total de los datos financieros asociados
    if (Storage && typeof Storage.clearAllUserData === 'function') {
      Storage.clearAllUserData(userId);
    }

    return { success: true, message: 'Usuario y todos sus datos financieros fueron eliminados.' };
  }

  // Caso de uso: Configurar parámetros del sistema
  function obtenerParametros() {
    if (Storage && typeof Storage.getSystemParams === 'function') {
      return Storage.getSystemParams();
    }
    return {
      rule50: 50,
      rule30: 30,
      rule20: 20,
      emergencyFundMonths: 3,
      dtiWarningThreshold: 0.20,
      dtiAlertThreshold: 0.35,
      savingsWarningThreshold: 0.10,
      defaultCurrency: 'COP',
    };
  }

  function guardarParametros(params) {
    if (Storage && typeof Storage.saveSystemParams === 'function') {
      return Storage.saveSystemParams(params);
    }
    return false;
  }

  function restaurarParametrosPorDefecto() {
    if (Storage && typeof Storage.resetSystemParams === 'function') {
      return Storage.resetSystemParams();
    }
    return obtenerParametros();
  }

  // Render de la vista exclusiva de Administracion
  function renderAdminView() {
    var users = listarUsuarios();
    var params = obtenerParametros();

    var html = '';

    // Encabezado
    html += '<div class="surface-card" style="margin-bottom:1.25rem;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">';
    html += '    <div>';
    html += '      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">';
    html += '        <span class="category-tag" style="background:var(--color-brand-light);color:var(--color-brand);font-weight:700;">ROL: SUPERADMIN</span>';
    html += '      </div>';
    html += '      <h1 class="surface-title" style="font-size:1.35rem;">Panel de Administración General</h1>';
    html += '      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">Gestión centralizada de usuarios, accesos y parámetros globales del sistema.</p>';
    html += '    </div>';
    html += '    <div style="display:flex;gap:0.5rem;">';
    html += '      <button class="btn-primary" id="btn-admin-new-user">+ Crear Usuario</button>';
    html += '      <button class="btn-secondary" id="btn-admin-logout" style="color:var(--color-expense);">Cerrar Sesión</button>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Seccion 1: Gestion de Usuarios
    html += '<div class="surface-card" style="margin-bottom:1.5rem;">';
    html += '  <div class="surface-header">';
    html += '    <div>';
    html += '      <h2 class="surface-title">Gestión de Usuarios Registrados (' + users.length + ')</h2>';
    html += '      <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;">Control de cuentas locales, activación, cambio de credenciales y eliminación.</div>';
    html += '    </div>';
    html += '  </div>';

    html += '  <div class="fin-table-wrapper">';
    html += '    <table class="fin-table">';
    html += '      <thead>';
    html += '        <tr>';
    html += '          <th>Nombre</th>';
    html += '          <th>Correo Electrónico</th>';
    html += '          <th>Rol</th>';
    html += '          <th>Estado</th>';
    html += '          <th style="text-align:right;">Acciones</th>';
    html += '        </tr>';
    html += '      </thead>';
    html += '      <tbody>';

    users.forEach(function (u) {
      var isAdmin = u.role === 'superadmin';
      var isActive = u.active !== false;

      html += '        <tr>';
      html += '          <td style="font-weight:600;font-size:0.85rem;">' + u.name + '</td>';
      html += '          <td style="font-size:0.8rem;color:var(--text-secondary);">' + u.email + '</td>';
      html += '          <td><span class="category-tag" style="background:' + (isAdmin ? 'var(--color-brand-light)' : 'var(--bg-surface-secondary)') + ';color:' + (isAdmin ? 'var(--color-brand)' : 'inherit') + ';font-weight:600;">' + (isAdmin ? 'SuperAdmin' : 'Usuario') + '</span></td>';
      html += '          <td><span class="category-tag" style="background:' + (isActive ? 'var(--color-income-light)' : 'var(--color-expense-light)') + ';color:' + (isActive ? 'var(--color-income)' : 'var(--color-expense)') + ';">' + (isActive ? 'Activo' : 'Inactivo') + '</span></td>';
      html += '          <td style="text-align:right;white-space:nowrap;">';
      html += '            <button class="text-link" data-action="admin-edit-user" data-id="' + u.id + '" data-name="' + u.name + '" data-email="' + u.email + '" style="margin-right:0.6rem;">Editar</button>';
      html += '            <button class="text-link" data-action="admin-reset-pw" data-id="' + u.id + '" data-email="' + u.email + '" style="margin-right:0.6rem;">Restablecer Clave</button>';

      if (!isAdmin) {
        html += '            <button class="text-link" data-action="admin-toggle-active" data-id="' + u.id + '" style="margin-right:0.6rem;">' + (isActive ? 'Desactivar' : 'Activar') + '</button>';
        html += '            <button class="text-link danger" data-action="admin-delete-user" data-id="' + u.id + '">Eliminar</button>';
      } else {
        html += '            <span style="font-size:0.75rem;color:var(--text-tertiary);">Protegido</span>';
      }

      html += '          </td>';
      html += '        </tr>';
    });

    html += '      </tbody>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    // Seccion 2: Parametros del Sistema
    html += '<div class="surface-card">';
    html += '  <div class="surface-header">';
    html += '    <div>';
    html += '      <h2 class="surface-title">Parámetros Globales del Sistema</h2>';
    html += '      <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;">Umbrales paramétricos consumidos por el motor de cálculo e indicadores.</div>';
    html += '    </div>';
    html += '    <button class="btn-secondary" id="btn-admin-reset-params">Restaurar Valores por Defecto</button>';
    html += '  </div>';

    html += '  <form id="form-admin-params">';
    html += '    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:1rem;margin-bottom:1.25rem;">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Regla Necesidades (%) *</label>';
    html += '        <input type="number" id="param-rule-50" class="form-control" min="0" max="100" value="' + params.rule50 + '" required>';
    html += '      </div>';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Regla Deseos (%) *</label>';
    html += '        <input type="number" id="param-rule-30" class="form-control" min="0" max="100" value="' + params.rule30 + '" required>';
    html += '      </div>';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Regla Ahorro (%) *</label>';
    html += '        <input type="number" id="param-rule-20" class="form-control" min="0" max="100" value="' + params.rule20 + '" required>';
    html += '      </div>';
    html += '    </div>';

    html += '    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:1rem;margin-bottom:1.25rem;">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Meta Meses Fondo Emergencia *</label>';
    html += '        <input type="number" id="param-fund-months" class="form-control" min="1" max="24" value="' + params.emergencyFundMonths + '" required>';
    html += '      </div>';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Umbral DTI Advertencia (%) *</label>';
    html += '        <input type="number" id="param-dti-warning" class="form-control" min="5" max="50" step="1" value="' + Math.round(params.dtiWarningThreshold * 100) + '" required>';
    html += '      </div>';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Umbral DTI Alerta Critica (%) *</label>';
    html += '        <input type="number" id="param-dti-alert" class="form-control" min="10" max="80" step="1" value="' + Math.round(params.dtiAlertThreshold * 100) + '" required>';
    html += '      </div>';
    html += '      <div class="form-group">';
    html += '        <label class="form-label">Umbral Mínimo Ahorro (%) *</label>';
    html += '        <input type="number" id="param-savings-warning" class="form-control" min="1" max="50" step="1" value="' + Math.round(params.savingsWarningThreshold * 100) + '" required>';
    html += '      </div>';
    html += '    </div>';

    html += '    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:1rem;border-top:1px solid var(--border-subtle);">';
    html += '      <div class="form-group" style="margin:0;display:flex;align-items:center;gap:0.75rem;">';
    html += '        <label class="form-label" style="margin:0;">Divisa Base del Sistema:</label>';
    html += '        <select id="param-default-currency" class="form-control" style="width:130px;">';
    html += '          <option value="COP" ' + (params.defaultCurrency === 'COP' ? 'selected' : '') + '>COP ($)</option>';
    html += '          <option value="USD" ' + (params.defaultCurrency === 'USD' ? 'selected' : '') + '>USD (US$)</option>';
    html += '          <option value="EUR" ' + (params.defaultCurrency === 'EUR' ? 'selected' : '') + '>EUR (€)</option>';
    html += '        </select>';
    html += '      </div>';
    html += '      <button type="submit" class="btn-primary">Guardar Parámetros</button>';
    html += '    </div>';
    html += '  </form>';

    html += '</div>';

    return html;
  }

  root.FinApp.administracion = {
    listarUsuarios: listarUsuarios,
    crearUsuario: crearUsuario,
    editarUsuario: editarUsuario,
    alternarEstadoUsuario: alternarEstadoUsuario,
    restablecerContrasena: restablecerContrasena,
    eliminarUsuario: eliminarUsuario,
    obtenerParametros: obtenerParametros,
    guardarParametros: guardarParametros,
    restaurarParametrosPorDefecto: restaurarParametrosPorDefecto,
    renderAdminView: renderAdminView,
  };
})(typeof window !== 'undefined' ? window : this);

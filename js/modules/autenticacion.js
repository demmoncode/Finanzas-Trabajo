/* Modulo de autenticacion y perfil de usuarios */

(function (root) {
  'use strict';

  root.FinApp = root.FinApp || {};

  var USERS_STORAGE_KEY = 'finanzas_app_users';
  var SESSION_STORAGE_KEY = 'finanzas_app_session';

  var DEFAULT_ADMIN = {
    id: 'superadmin-root',
    name: 'Super Administrador',
    email: 'admin@finanzas.local',
    role: 'superadmin',
    active: true,
  };

  var DEFAULT_USER = {
    id: 'usuario-principal',
    name: 'Usuario Principal',
    email: 'usuario@finanzas.local',
    role: 'usuario',
    active: true,
  };

  /**
   * Generador de sal aleatoria
   */
  function generateSalt() {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var salt = '';
    for (var i = 0; i < 16; i++) {
      salt += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return salt;
  }

  /**
   * Implementacion pura de SHA-256 de respaldo para entornos sin crypto.subtle
   */
  function sha256Fallback(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }

    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';

    var words = [];
    var asciiBitLength = ascii[lengthProperty] * 8;

    var hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    var k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    var isCandidate = [];
    var composite = {};
    for (var candidate = 2; isCandidate[lengthProperty] < 64; candidate++) {
      if (!composite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          composite[i] = candidate;
        }
        isCandidate.push(candidate);
      }
    }

    ascii += '\x80';
    while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - (i % 4)) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;

    for (j = 0; j < words[lengthProperty];) {
      var w = words.slice(j, j += 16);
      var oldHash = hash;
      hash = hash.slice(0, 8);

      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];

        var s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        var s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
        var maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
        var temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0)) | 0;
        var temp2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj) | 0;

        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }

      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }

    for (i = 0; i < 8; i++) {
      for (var b = 3; b >= 0; b--) {
        var byteVal = (hash[i] >> (8 * b)) & 255;
        result += (byteVal < 16 ? '0' : '') + byteVal.toString(16);
      }
    }
    return result;
  }

  /**
   * Hash asincrono con fallback sincrono
   */
  function hashPassword(password, salt, callback) {
    var text = password + ':' + salt;
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      try {
        var encoder = new TextEncoder();
        var data = encoder.encode(text);
        crypto.subtle.digest('SHA-256', data).then(function (buffer) {
          var hashArray = Array.from(new Uint8Array(buffer));
          var hashHex = hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
          callback(hashHex);
        }).catch(function () {
          callback(sha256Fallback(text));
        });
        return;
      } catch (e) {
        callback(sha256Fallback(text));
        return;
      }
    }
    callback(sha256Fallback(text));
  }

  function hashPasswordSync(password, salt) {
    return sha256Fallback(password + ':' + salt);
  }

  /**
   * Obtiene la lista de usuarios de localStorage
   */
  function getUsers() {
    try {
      var raw = window.localStorage.getItem(USERS_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // Fallback
    }
    return initDefaultUsers();
  }

  /**
   * Guarda la lista de usuarios en localStorage
   */
  function saveUsers(users) {
    try {
      window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (e) {
      // Manejo silencioso
    }
  }

  /**
   * Migracion e inicializacion de cuentas por defecto
   */
  function initDefaultUsers() {
    var adminSalt = generateSalt();
    var adminHash = hashPasswordSync('admin123', adminSalt);

    var userSalt = generateSalt();
    var userHash = hashPasswordSync('usuario123', userSalt);

    var existingData = null;
    try {
      var rawOld = window.localStorage.getItem('finanzas_app_user_usuario-principal');
      if (rawOld) {
        existingData = JSON.parse(rawOld);
      }
    } catch (e) {
      // Fallback
    }

    var userName = (existingData && existingData.profile && existingData.profile.name) ? existingData.profile.name : DEFAULT_USER.name;
    var userEmail = (existingData && existingData.profile && existingData.profile.email) ? existingData.profile.email : DEFAULT_USER.email;

    var initialUsers = [
      {
        id: DEFAULT_ADMIN.id,
        name: DEFAULT_ADMIN.name,
        email: DEFAULT_ADMIN.email,
        role: DEFAULT_ADMIN.role,
        active: true,
        passwordSalt: adminSalt,
        passwordHash: adminHash,
        createdAt: new Date().toISOString(),
      },
      {
        id: DEFAULT_USER.id,
        name: userName,
        email: userEmail,
        role: DEFAULT_USER.role,
        active: true,
        passwordSalt: userSalt,
        passwordHash: userHash,
        createdAt: new Date().toISOString(),
      }
    ];

    saveUsers(initialUsers);
    return initialUsers;
  }

  /**
   * Obtiene la sesion activa desde sessionStorage
   */
  function getActiveSession() {
    try {
      var raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.userId) return parsed;
      }
    } catch (e) {
      // Fallback
    }
    return null;
  }

  function setSession(user) {
    var session = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      loginAt: Date.now(),
    };
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      // Fallback
    }
    return session;
  }

  function clearSession() {
    try {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      // Fallback
    }
  }

  // Caso de uso: Iniciar sesión
  function login(email, password, callback) {
    var users = getUsers();
    var cleanEmail = (email || '').trim().toLowerCase();
    var found = null;

    for (var i = 0; i < users.length; i++) {
      if (users[i].email.toLowerCase() === cleanEmail) {
        found = users[i];
        break;
      }
    }

    if (!found) {
      callback({ success: false, message: 'Usuario o correo no encontrado.' });
      return;
    }

    if (found.active === false) {
      callback({ success: false, message: 'La cuenta ha sido desactivada por el administrador.' });
      return;
    }

    hashPassword(password, found.passwordSalt, function (computedHash) {
      if (computedHash === found.passwordHash) {
        var session = setSession(found);
        callback({ success: true, session: session, user: found });
      } else {
        callback({ success: false, message: 'Contraseña incorrecta.' });
      }
    });
  }

  // Caso de uso: Cerrar sesión
  function logout() {
    clearSession();
    if (root.FinApp) {
      root.FinApp.state.currentUser = null;
      root.FinApp.navigateTo('dashboard');
    }
  }

  // Caso de uso: Gestionar perfil
  function updateProfile(name, email, currentPassword, newPassword, callback) {
    var session = getActiveSession();
    if (!session) {
      callback({ success: false, message: 'No hay sesión activa.' });
      return;
    }

    var users = getUsers();
    var userIndex = -1;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === session.userId) {
        userIndex = i;
        break;
      }
    }

    if (userIndex === -1) {
      callback({ success: false, message: 'Usuario no encontrado.' });
      return;
    }

    var user = users[userIndex];
    var cleanEmail = (email || '').trim().toLowerCase();

    // Validar duplicado de correo
    for (var j = 0; j < users.length; j++) {
      if (j !== userIndex && users[j].email.toLowerCase() === cleanEmail) {
        callback({ success: false, message: 'El correo electrónico ya está en uso por otra cuenta.' });
        return;
      }
    }

    function applyProfileUpdates() {
      user.name = name.trim() || user.name;
      user.email = cleanEmail;
      users[userIndex] = user;
      saveUsers(users);

      // Actualizar sesion activa
      setSession(user);

      // Actualizar perfil de datos financieros
      if (root.FinApp && root.FinApp.state && root.FinApp.state.data && root.FinApp.state.data.profile) {
        root.FinApp.state.data.profile.name = user.name;
        root.FinApp.state.data.profile.email = user.email;
        if (typeof root.FinApp.persistData === 'function') root.FinApp.persistData();
      }

      callback({ success: true, message: 'Perfil actualizado con éxito.', user: user });
    }

    if (newPassword && newPassword.trim().length > 0) {
      if (!currentPassword) {
        callback({ success: false, message: 'Debes ingresar tu contraseña actual para cambiarla.' });
        return;
      }
      hashPassword(currentPassword, user.passwordSalt, function (chkHash) {
        if (chkHash !== user.passwordHash) {
          callback({ success: false, message: 'La contraseña actual no es correcta.' });
          return;
        }
        var newSalt = generateSalt();
        hashPassword(newPassword, newSalt, function (newHash) {
          user.passwordSalt = newSalt;
          user.passwordHash = newHash;
          applyProfileUpdates();
        });
      });
    } else {
      applyProfileUpdates();
    }
  }

  /**
   * Registro local de nuevo usuario
   */
  function register(name, email, password, callback) {
    var users = getUsers();
    var cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !password || !name) {
      callback({ success: false, message: 'Todos los campos son obligatorios.' });
      return;
    }

    for (var i = 0; i < users.length; i++) {
      if (users[i].email.toLowerCase() === cleanEmail) {
        callback({ success: false, message: 'El correo ya se encuentra registrado.' });
        return;
      }
    }

    var newId = 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    var salt = generateSalt();
    hashPassword(password, salt, function (hash) {
      var newUser = {
        id: newId,
        name: name.trim(),
        email: cleanEmail,
        role: 'usuario',
        active: true,
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      };
      users.push(newUser);
      saveUsers(users);

      // Inicializar estructura limpia de datos
      if (window.FinStorage) {
        var initial = JSON.parse(JSON.stringify(window.FinStorage.INITIAL_EMPTY_DATA));
        initial.profile.id = newId;
        initial.profile.name = newUser.name;
        initial.profile.email = newUser.email;
        window.FinStorage.saveUserFinancialData(newId, initial);
      }

      var session = setSession(newUser);
      callback({ success: true, session: session, user: newUser });
    });
  }

  /**
   * Render de la vista de inicio de sesion y registro
   */
  function renderAuthView(isRegisterMode) {
    var html = '';
    html += '<div style="display:flex;align-items:center;justify-content:center;min-height:80vh;padding:2rem 1rem;">';
    html += '  <div class="surface-card" style="max-width:440px;width:100%;padding:2rem;">';
    html += '    <div style="text-align:center;margin-bottom:1.75rem;">';
    html += '      <div class="brand-icon" style="margin:0 auto 0.75rem;width:42px;height:42px;">';
    html += '        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">';
    html += '          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>';
    html += '        </svg>';
    html += '      </div>';
    html += '      <h1 class="surface-title" style="font-size:1.4rem;font-weight:700;">FINANZAS APP</h1>';
    html += '      <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.25rem;">' + (isRegisterMode ? 'Crear nueva cuenta' : 'Ingreso seguro al sistema') + '</p>';
    html += '    </div>';

    if (isRegisterMode) {
      html += '    <form id="form-auth-register">';
      html += '      <div class="form-group">';
      html += '        <label class="form-label">Nombre completo *</label>';
      html += '        <input type="text" id="auth-reg-name" class="form-control" placeholder="Tu nombre" required>';
      html += '      </div>';
      html += '      <div class="form-group">';
      html += '        <label class="form-label">Correo electrónico *</label>';
      html += '        <input type="email" id="auth-reg-email" class="form-control" placeholder="tu@correo.com" required>';
      html += '      </div>';
      html += '      <div class="form-group">';
      html += '        <label class="form-label">Contraseña *</label>';
      html += '        <input type="password" id="auth-reg-password" class="form-control" placeholder="Crea una contraseña" required>';
      html += '      </div>';
      html += '      <div style="margin-top:1.5rem;">';
      html += '        <button type="submit" class="btn-primary" style="width:100%;justify-content:center;padding:0.75rem;">Crear cuenta</button>';
      html += '      </div>';
      html += '      <div style="text-align:center;margin-top:1.25rem;">';
      html += '        <button type="button" class="text-link" id="btn-switch-to-login">¿Ya tienes cuenta? Iniciar sesión</button>';
      html += '      </div>';
      html += '    </form>';
    } else {
      html += '    <form id="form-auth-login">';
      html += '      <div class="form-group">';
      html += '        <label class="form-label">Correo electrónico *</label>';
      html += '        <input type="email" id="auth-login-email" class="form-control" placeholder="usuario@finanzas.local" required value="usuario@finanzas.local">';
      html += '      </div>';
      html += '      <div class="form-group">';
      html += '        <label class="form-label">Contraseña *</label>';
      html += '        <input type="password" id="auth-login-password" class="form-control" placeholder="Tu contraseña" required>';
      html += '      </div>';
      html += '      <div style="margin-top:1.5rem;">';
      html += '        <button type="submit" class="btn-primary" style="width:100%;justify-content:center;padding:0.75rem;">Iniciar sesión</button>';
      html += '      </div>';
      html += '      <div style="text-align:center;margin-top:1.25rem;">';
      html += '        <button type="button" class="text-link" id="btn-switch-to-register">¿No tienes cuenta? Regístrate aquí</button>';
      html += '      </div>';
      html += '    </form>';

    }

    html += '  </div>';
    html += '</div>';
    return html;
  }

  // Inicializacion de usuarios
  getUsers();

  root.FinApp.autenticacion = {
    DEFAULT_ADMIN: DEFAULT_ADMIN,
    DEFAULT_USER: DEFAULT_USER,
    getUsers: getUsers,
    saveUsers: saveUsers,
    getActiveSession: getActiveSession,
    setSession: setSession,
    clearSession: clearSession,
    hashPassword: hashPassword,
    hashPasswordSync: hashPasswordSync,
    generateSalt: generateSalt,
    login: login,
    logout: logout,
    updateProfile: updateProfile,
    register: register,
    renderAuthView: renderAuthView,
  };
})(typeof window !== 'undefined' ? window : this);

/* Conexión con Firebase (Authentication + Firestore).
 *
 * Si la configuración no está pegada en js/firebase-config.js, o el SDK no cargó,
 * FinCloud.enabled es false y la aplicación funciona en modo local como antes.
 */

(function (root) {
  'use strict';

  var cfg = root.FIREBASE_CONFIG || null;
  var hasConfig = !!(cfg && cfg.apiKey && cfg.projectId &&
    String(cfg.apiKey).indexOf('PEGAR_AQUI') === -1 && String(cfg.projectId).indexOf('PEGAR_AQUI') === -1);
  var sdkReady = !!(root.firebase && root.firebase.initializeApp && root.firebase.auth && root.firebase.firestore);

  var CLOUD_USERS_KEY = 'finanzas_app_cloud_users';
  var SAVE_DELAY = 800;

  var FinCloud = { enabled: false };
  root.FinCloud = FinCloud;

  if (!hasConfig || !sdkReady) {
    FinCloud.enabled = false;
    FinCloud.reason = !hasConfig ? 'sin-configuracion' : 'sin-sdk';
    return;
  }

  var app = root.firebase.initializeApp(cfg);
  var auth = root.firebase.auth();
  var db = root.firebase.firestore();
  FinCloud.enabled = true;

  try { auth.setPersistence(root.firebase.auth.Auth.Persistence.SESSION); } catch (e) { /* ignorar */ }

  function nowISO() { return new Date().toISOString(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function storage() { return root.FinStorage; }

  function errorMessage(err) {
    var code = err && err.code ? err.code : '';
    var map = {
      'auth/invalid-email': 'El correo no tiene un formato válido.',
      'auth/user-not-found': 'No existe una cuenta con ese correo.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/invalid-credential': 'Correo o contraseña incorrectos.',
      'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
      'auth/email-already-in-use': 'El correo ya se encuentra registrado.',
      'auth/weak-password': 'La contraseña es muy débil: usa al menos 6 caracteres.',
      'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
      'auth/network-request-failed': 'No hay conexión con el servidor. Revisa tu internet.',
      'auth/requires-recent-login': 'Vuelve a iniciar sesión para hacer este cambio.',
      'permission-denied': 'No tienes permiso para realizar esta acción.',
      'unavailable': 'No hay conexión con la base de datos. Inténtalo de nuevo.'
    };
    return map[code] || ('No se pudo completar la acción' + (code ? ' (' + code + ')' : '') + '.');
  }

  function fail(cb, err, message) {
    cb({ success: false, message: message || errorMessage(err) });
  }

  // ---------------------------------------------------------------- Usuarios (cache para el admin)
  function readUsersCache() {
    try {
      var raw = root.localStorage.getItem(CLOUD_USERS_KEY);
      if (raw) { var p = JSON.parse(raw); if (Array.isArray(p)) return p; }
    } catch (e) { /* ignorar */ }
    return [];
  }
  function writeUsersCache(list) {
    try { root.localStorage.setItem(CLOUD_USERS_KEY, JSON.stringify(list)); } catch (e) { /* ignorar */ }
  }

  function refreshUsers(cb) {
    db.collection('users').get().then(function (snap) {
      var list = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        list.push({ id: doc.id, name: d.name || '', email: d.email || '', role: d.role || 'usuario', active: d.active !== false, createdAt: d.createdAt || '' });
      });
      list.sort(function (a, b) { return (a.email || '').localeCompare(b.email || ''); });
      writeUsersCache(list);
      if (cb) cb({ success: true, users: list });
    }).catch(function (err) { if (cb) fail(cb, err); });
  }

  function pushUser(user) {
    return db.collection('users').doc(user.id).set({
      name: user.name, email: user.email, role: user.role, active: user.active !== false, createdAt: user.createdAt || nowISO()
    }, { merge: true });
  }

  function deleteUser(uid, cb) {
    db.collection('userData').doc(uid).delete().then(function () {
      return db.collection('users').doc(uid).delete();
    }).then(function () { if (cb) cb({ success: true }); })
      .catch(function (err) { if (cb) fail(cb, err); });
  }

  // El administrador crea cuentas sin perder su propia sesión usando una segunda app.
  function createUserAsAdmin(data, cb) {
    var secondary = root.firebase.initializeApp(cfg, 'secundaria-' + Date.now());
    var secAuth = secondary.auth();
    var uid = null;
    secAuth.createUserWithEmailAndPassword(data.email, data.password).then(function (cred) {
      uid = cred.user.uid;
      return cred.user.sendEmailVerification();
    }).then(function () {
      return secAuth.signOut();
    }).then(function () {
      var user = { id: uid, name: data.name, email: data.email, role: data.role || 'usuario', active: true, createdAt: nowISO() };
      return pushUser(user).then(function () { return user; });
    }).then(function (user) {
      secondary.delete();
      cb({ success: true, user: user, message: 'Usuario creado. Se envió un correo de verificación a ' + user.email + '.' });
    }).catch(function (err) {
      try { secondary.delete(); } catch (e) { /* ignorar */ }
      fail(cb, err);
    });
  }

  // ---------------------------------------------------------------- Parámetros globales
  function pullParams(cb) {
    db.collection('config').doc('params').get().then(function (doc) {
      if (doc.exists && storage()) storage().saveSystemParams(doc.data(), true);
      if (cb) cb();
    }).catch(function () { if (cb) cb(); });
  }

  function pushParams(params) {
    db.collection('config').doc('params').set(clone(params)).catch(function () { /* sin permiso: no es admin */ });
  }

  // ---------------------------------------------------------------- Datos financieros
  var pending = null;      // { uid, data }
  var timer = null;
  var inFlight = Promise.resolve();

  function writeNow() {
    if (!pending) return inFlight;
    var job = pending; pending = null;
    inFlight = inFlight.then(function () {
      return db.collection('userData').doc(job.uid).set({ json: JSON.stringify(job.data), updatedAt: nowISO() });
    }).catch(function () { /* se reintenta en el próximo guardado */ });
    return inFlight;
  }

  function queueSave(uid, data) {
    if (!auth.currentUser || auth.currentUser.uid !== uid) return;
    pending = { uid: uid, data: data };
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; writeNow(); }, SAVE_DELAY);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    return writeNow();
  }

  function loadUserData(uid) {
    return db.collection('userData').doc(uid).get().then(function (doc) {
      if (doc.exists) {
        try { return JSON.parse(doc.data().json); } catch (e) { return null; }
      }
      return null;
    });
  }

  root.addEventListener('pagehide', function () { flush(); });

  // ---------------------------------------------------------------- Cuentas
  function register(name, email, password, cb) {
    var cleanEmail = (email || '').trim().toLowerCase();
    var cleanName = (name || '').trim();
    if (!cleanName || !cleanEmail || !password) {
      cb({ success: false, message: 'Todos los campos son obligatorios.' });
      return;
    }
    if (password.length < 6) {
      cb({ success: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    var created = null;
    auth.createUserWithEmailAndPassword(cleanEmail, password).then(function (cred) {
      created = cred.user;
      return pushUser({ id: created.uid, name: cleanName, email: cleanEmail, role: 'usuario', active: true, createdAt: nowISO() });
    }).then(function () {
      return created.sendEmailVerification();
    }).then(function () {
      return auth.signOut();
    }).then(function () {
      cb({ success: true, pendingVerification: true, message: 'Cuenta creada. Te enviamos un correo a ' + cleanEmail + ': ábrelo y confirma tu dirección para poder iniciar sesión.' });
    }).catch(function (err) {
      if (created) { auth.signOut(); }
      fail(cb, err);
    });
  }

  function login(email, password, cb) {
    var cleanEmail = (email || '').trim().toLowerCase();
    var user = null, profile = null;
    auth.signInWithEmailAndPassword(cleanEmail, password).then(function (cred) {
      user = cred.user;
      return user.reload();
    }).then(function () {
      user = auth.currentUser;
      if (!user.emailVerified) {
        return auth.signOut().then(function () {
          cb({ success: false, unverified: true, message: 'Primero confirma tu correo. Revisa tu bandeja (y spam) o pide que te reenviemos el enlace.' });
          return 'stop';
        });
      }
      return user.getIdToken(true).then(function () {
        return db.collection('users').doc(user.uid).get();
      }).then(function (doc) {
        if (!doc.exists) {
          return auth.signOut().then(function () {
            cb({ success: false, message: 'Esta cuenta no está registrada en el sistema o fue eliminada.' });
            return 'stop';
          });
        }
        profile = doc.data();
        if (profile.active === false) {
          return auth.signOut().then(function () {
            cb({ success: false, message: 'La cuenta ha sido desactivada por el administrador.' });
            return 'stop';
          });
        }
        return loadUserData(user.uid).then(function (data) {
          var St = storage();
          if (!data) {
            data = clone(St.INITIAL_EMPTY_DATA);
            data.profile.id = user.uid;
          }
          data.profile = data.profile || {};
          data.profile.id = user.uid;
          data.profile.name = profile.name;
          data.profile.email = profile.email;
          St.saveUserFinancialData(user.uid, data, true);
          return new Promise(function (res) { pullParams(res); });
        }).then(function () {
          var me = { id: user.uid, name: profile.name, email: profile.email, role: profile.role || 'usuario', active: true };
          if (me.role === 'superadmin') {
            refreshUsers(function () { cb({ success: true, user: me }); });
          } else {
            cb({ success: true, user: me });
          }
          return 'ok';
        });
      });
    }).catch(function (err) {
      try { auth.signOut(); } catch (e) { /* ignorar */ }
      fail(cb, err);
    });
  }

  function logout(uid) {
    flush().then(function () {
      return auth.signOut();
    }).then(function () {
      try {
        if (uid) root.localStorage.removeItem('finanzas_app_user_' + uid);
        root.localStorage.removeItem(CLOUD_USERS_KEY);
      } catch (e) { /* ignorar */ }
    });
  }

  function resetPassword(email, cb) {
    var cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) { cb({ success: false, message: 'Escribe tu correo electrónico.' }); return; }
    auth.sendPasswordResetEmail(cleanEmail).then(function () {
      cb({ success: true, message: 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.' });
    }).catch(function (err) {
      // No se revela si la cuenta existe
      if (err && (err.code === 'auth/user-not-found')) {
        cb({ success: true, message: 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.' });
      } else {
        fail(cb, err);
      }
    });
  }

  function resendVerification(email, password, cb) {
    var cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) { cb({ success: false, message: 'Escribe tu correo y tu contraseña para reenviar el enlace.' }); return; }
    auth.signInWithEmailAndPassword(cleanEmail, password).then(function (cred) {
      if (cred.user.emailVerified) {
        return auth.signOut().then(function () { cb({ success: true, message: 'Tu correo ya está verificado. Ya puedes iniciar sesión.' }); });
      }
      return cred.user.sendEmailVerification().then(function () {
        return auth.signOut();
      }).then(function () {
        cb({ success: true, message: 'Te reenviamos el correo de verificación a ' + cleanEmail + '.' });
      });
    }).catch(function (err) { fail(cb, err); });
  }

  function updateOwnProfile(uid, name, currentPassword, newPassword, cb) {
    var user = auth.currentUser;
    if (!user || user.uid !== uid) { cb({ success: false, message: 'No hay sesión activa.' }); return; }

    function saveName() {
      return db.collection('users').doc(uid).update({ name: name });
    }

    if (newPassword) {
      if (!currentPassword) { cb({ success: false, message: 'Debes ingresar tu contraseña actual para cambiarla.' }); return; }
      if (newPassword.length < 6) { cb({ success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' }); return; }
      var cred = root.firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
      user.reauthenticateWithCredential(cred).then(function () {
        return user.updatePassword(newPassword);
      }).then(saveName).then(function () {
        cb({ success: true });
      }).catch(function (err) {
        if (err && (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials')) {
          cb({ success: false, message: 'La contraseña actual no es correcta.' });
        } else { fail(cb, err); }
      });
    } else {
      saveName().then(function () { cb({ success: true }); }).catch(function (err) { fail(cb, err); });
    }
  }

  FinCloud.register = register;
  FinCloud.login = login;
  FinCloud.logout = logout;
  FinCloud.resetPassword = resetPassword;
  FinCloud.resendVerification = resendVerification;
  FinCloud.updateOwnProfile = updateOwnProfile;
  FinCloud.queueSave = queueSave;
  FinCloud.flush = flush;
  FinCloud.refreshUsers = refreshUsers;
  FinCloud.getCachedUsers = readUsersCache;
  FinCloud.setCachedUsers = writeUsersCache;
  FinCloud.pushUser = function (u) { return pushUser(u).catch(function () { }); };
  FinCloud.deleteUser = deleteUser;
  FinCloud.createUserAsAdmin = createUserAsAdmin;
  FinCloud.sendPasswordReset = resetPassword;
  FinCloud.pushParams = pushParams;
  FinCloud.pullParams = pullParams;
})(typeof window !== 'undefined' ? window : this);

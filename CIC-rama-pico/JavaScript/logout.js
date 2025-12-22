// JavaScript/logout.js
// ✅ Logout real: corta Firebase Auth + limpia sessionStorage
// ✅ Anti auto-login: bloquea el auto-redirect del login por X segundos

import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

export const LOCK_KEY = "cicLogoutLockUntil";

export function setLogoutLock(ms = 8000) {
  try {
    localStorage.setItem(LOCK_KEY, String(Date.now() + ms));
  } catch (_) {}
}

export function isLogoutLocked() {
  try {
    const until = Number(localStorage.getItem(LOCK_KEY) || "0");
    if (!until) return false;
    if (Date.now() < until) return true;
    // expiró
    localStorage.removeItem(LOCK_KEY);
    return false;
  } catch (_) {
    return false;
  }
}

export async function handleLogoutRedirect(to = "admin-login.html?loggedOut=1") {
  // 1) Lock anti auto login (importante que sea ANTES del signOut)
  setLogoutLock(8000);

  // 2) Sign out real de Firebase Auth
  try {
    const auth = getAuth();
    await signOut(auth);
  } catch (e) {
    console.warn("signOut error:", e);
  }

  // 3) Limpiar tu sesión
  try {
    sessionStorage.clear();
  } catch (_) {}

  // 4) Redirigir
  window.location.href = to;
}

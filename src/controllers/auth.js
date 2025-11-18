import {
  authenticateEmailUser,
  getCurrentUser,
  logout,
  registerEmailUser,
  subscribeAuthChanges,
} from '../state/auth.js';

const setFormBusy = (form, busy) => {
  if (!form) {
    return;
  }
  form.classList.toggle('is-loading', busy);
  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = busy;
    submit.classList.toggle('is-loading', busy);
  }
};

const setFormError = (form, message) => {
  if (!form) {
    return;
  }
  const errorElement = form.querySelector('.form-error');
  if (!errorElement) {
    return;
  }
  if (message) {
    errorElement.textContent = message;
    errorElement.hidden = false;
  } else {
    errorElement.textContent = '';
    errorElement.hidden = true;
  }
};

const setActiveAuthView = (view) => {
  document.querySelectorAll('.auth-card').forEach((card) => {
    const isActive = card.dataset.view === view;
    card.toggleAttribute('hidden', !isActive);
  });
  document.querySelectorAll('[data-auth-view-target]').forEach((button) => {
    const isActive = button.dataset.authViewTarget === view;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
};

const initialsFromName = (name) => {
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return initials.join('') || name.charAt(0).toUpperCase();
};

const initializeAuth = ({ onAuthenticated, onLogout } = {}) => {
  const authGate = document.getElementById('authGate');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const userMenu = document.getElementById('userMenu');
  const userDisplayName = document.getElementById('userDisplayName');
  const userEmail = document.getElementById('userEmail');
  const userAvatar = document.getElementById('userAvatar');
  const logoutButton = document.getElementById('logoutButton');
  const appShell = document.querySelector('.app-shell');

  setActiveAuthView('login');

  document.querySelectorAll('[data-auth-view-target]').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveAuthView(button.dataset.authViewTarget);
    });
  });

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFormBusy(loginForm, true);
      setFormError(loginForm, '');
      const formData = new FormData(loginForm);
      const email = formData.get('email');
      const password = formData.get('password');
      try {
        await authenticateEmailUser({ email, password });
        loginForm.reset();
      } catch (error) {
        setFormError(loginForm, error.message || 'Anmeldung fehlgeschlagen.');
      } finally {
        setFormBusy(loginForm, false);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFormBusy(registerForm, true);
      setFormError(registerForm, '');
      const formData = new FormData(registerForm);
      const displayName = formData.get('displayName');
      const email = formData.get('email');
      const password = formData.get('password');
      const confirmPassword = formData.get('confirmPassword');

      if (password !== confirmPassword) {
        setFormError(registerForm, 'Die Passwörter stimmen nicht überein.');
        setFormBusy(registerForm, false);
        return;
      }

      try {
        const session = await registerEmailUser({ email, password, displayName });
        registerForm.reset();
        if (!session) {
          window.alert(
            'Bitte bestätige deine E-Mail-Adresse. Wir haben dir einen Link zur Aktivierung gesendet.'
          );
        }
        setActiveAuthView('login');
      } catch (error) {
        setFormError(registerForm, error.message || 'Registrierung fehlgeschlagen.');
      } finally {
        setFormBusy(registerForm, false);
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      try {
        await logout();
      } catch (error) {
        console.warn('Abmeldung fehlgeschlagen', error);
      }
    });
  }

  let lastHandledIdentity = null;

  const getSessionIdentity = (session) => {
    if (!session) {
      return null;
    }
    if (session.token) {
      return session.token;
    }
    if (session.userId) {
      return `user:${session.userId}`;
    }
    if (session.email) {
      return `email:${session.email}`;
    }
    return null;
  };

  const applySession = (session) => {
    const isAuthenticated = Boolean(session);
    if (authGate) {
      authGate.hidden = isAuthenticated;
    }
    if (appShell) {
      appShell.classList.toggle('is-authenticated', isAuthenticated);
    }
    if (userMenu) {
      userMenu.hidden = !isAuthenticated;
    }

    if (session && isAuthenticated) {
      if (userDisplayName) {
        userDisplayName.textContent = session.displayName;
      }
      if (userEmail) {
        userEmail.textContent = session.email;
      }
      if (userAvatar) {
        if (session.avatarUrl) {
          userAvatar.style.backgroundImage = `url(${session.avatarUrl})`;
          userAvatar.classList.add('is-image');
          userAvatar.textContent = '';
        } else {
          userAvatar.style.backgroundImage = '';
          userAvatar.classList.remove('is-image');
          userAvatar.textContent = initialsFromName(session.displayName || session.email);
        }
      }
      const identity = getSessionIdentity(session);
      if (identity && identity !== lastHandledIdentity) {
        lastHandledIdentity = identity;
        onAuthenticated?.(session);
      }
    } else {
      if (userAvatar) {
        userAvatar.style.backgroundImage = '';
        userAvatar.classList.remove('is-image');
        userAvatar.textContent = '👤';
      }
      if (lastHandledIdentity) {
        lastHandledIdentity = null;
        onLogout?.();
      }
      setActiveAuthView('login');
    }
  };

  const unsubscribe = subscribeAuthChanges((session) => {
    applySession(session);
  });

  // Apply initial state
  applySession(getCurrentUser());

  return () => {
    unsubscribe();
  };
};

export { initializeAuth };

import {
  authenticateEmailUser,
  authenticateWithGoogle,
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

const initializeGoogleSignIn = (container, onCredential, onError) => {
  if (!container) {
    return;
  }
  const clientId = container.dataset.clientId || document.body.dataset.googleClientId;
  if (!clientId) {
    container.setAttribute('hidden', '');
    if (typeof onError === 'function') {
      onError('Für die Google-Anmeldung muss eine Client-ID hinterlegt werden.');
    }
    return;
  }

  const renderButton = () => {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      return false;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        if (!response?.credential) {
          onError?.('Ungültige Antwort von Google erhalten.');
          return;
        }
        try {
          await onCredential(response.credential);
        } catch (error) {
          onError?.(error.message || 'Die Google-Anmeldung ist fehlgeschlagen.');
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
    });

    window.google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      width: '100%',
      locale: 'de',
      shape: 'rectangular',
    });
    window.google.accounts.id.prompt();
    return true;
  };

  if (renderButton()) {
    return;
  }

  let attempts = 0;
  const interval = window.setInterval(() => {
    attempts += 1;
    if (renderButton()) {
      window.clearInterval(interval);
    } else if (attempts > 40) {
      window.clearInterval(interval);
      onError?.('Die Google-Anmeldung konnte nicht initialisiert werden.');
    }
  }, 200);
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
  const googleContainer = document.getElementById('googleSignInButton');
  const googleError = document.getElementById('googleError');
  const appShell = document.querySelector('.app-shell');

  setActiveAuthView('login');

  document.querySelectorAll('[data-auth-view-target]').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveAuthView(button.dataset.authViewTarget);
    });
  });

  const showGoogleError = (message) => {
    if (!googleError) {
      return;
    }
    if (message) {
      googleError.textContent = message;
      googleError.hidden = false;
    } else {
      googleError.textContent = '';
      googleError.hidden = true;
    }
  };

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFormBusy(loginForm, true);
      setFormError(loginForm, '');
      showGoogleError('');
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
        await registerEmailUser({ email, password, displayName });
        registerForm.reset();
        setActiveAuthView('login');
      } catch (error) {
        setFormError(registerForm, error.message || 'Registrierung fehlgeschlagen.');
      } finally {
        setFormBusy(registerForm, false);
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      logout();
    });
  }

  initializeGoogleSignIn(
    googleContainer,
    async (credential) => {
      showGoogleError('');
      try {
        await authenticateWithGoogle(credential);
      } catch (error) {
        showGoogleError(error.message || 'Die Google-Anmeldung ist fehlgeschlagen.');
      }
    },
    (message) => {
      showGoogleError(message);
    }
  );

  let lastHandledToken = null;

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
      if (session.token && session.token !== lastHandledToken) {
        lastHandledToken = session.token;
        onAuthenticated?.(session);
      }
    } else {
      if (userAvatar) {
        userAvatar.style.backgroundImage = '';
        userAvatar.classList.remove('is-image');
        userAvatar.textContent = '👤';
      }
      if (lastHandledToken) {
        lastHandledToken = null;
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

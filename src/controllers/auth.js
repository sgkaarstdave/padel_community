import {
  login,
  logout,
  register,
  subscribe,
  getCurrentUser,
  loginWithGoogleProfile,
} from '../state/auth.js';
import { initializeGoogleSignIn, extractProfileFromCredential } from '../utils/google.js';

const getDisplayName = (user) => {
  if (!user) {
    return '';
  }
  if (user.name) {
    return user.name;
  }
  if (user.email) {
    return user.email.split('@')[0];
  }
  return 'Padel Fan';
};

const setMessage = (element, type, message) => {
  if (!element) {
    return;
  }
  if (!message) {
    element.textContent = '';
    element.dataset.type = '';
    element.hidden = true;
    return;
  }
  element.hidden = false;
  element.textContent = message;
  element.dataset.type = type;
};

const toggleForms = (container, mode) => {
  if (!container) {
    return;
  }
  container.dataset.mode = mode;
  container
    .querySelectorAll('[data-auth-toggle]')
    .forEach((button) => button.classList.toggle('auth-tab--active', button.dataset.authToggle === mode));
  container
    .querySelectorAll('.auth-form')
    .forEach((form) => {
      form.hidden = form.dataset.form !== mode;
    });
};

const setupAuth = ({ onAuthenticated, onLogout } = {}) => {
  const authView = document.getElementById('auth-view');
  const appShell = document.getElementById('appShell');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const messageElement = document.getElementById('authMessage');
  const logoutButton = document.getElementById('logoutButton');
  const userNameDisplay = document.getElementById('userNameDisplay');
  const userEmailDisplay = document.getElementById('userEmailDisplay');
  const userWelcome = document.getElementById('userWelcome');
  const googleContainer = document.getElementById('googleSignInButton');

  const updateVisibility = (user) => {
    const isAuthenticated = Boolean(user);
    if (authView) {
      authView.hidden = isAuthenticated;
    }
    if (appShell) {
      appShell.hidden = !isAuthenticated;
    }
    document.body.classList.toggle('is-authenticated', isAuthenticated);
    if (logoutButton) {
      logoutButton.hidden = !isAuthenticated;
      logoutButton.disabled = !isAuthenticated;
    }
  };

  const updateUserSummary = (user) => {
    const hasUser = Boolean(user);
    const displayName = getDisplayName(user);
    if (userNameDisplay) {
      userNameDisplay.textContent = hasUser ? displayName : '';
      userNameDisplay.hidden = !hasUser;
    }
    if (userEmailDisplay) {
      userEmailDisplay.textContent = hasUser ? user?.email ?? '' : '';
      userEmailDisplay.hidden = !hasUser;
    }
    if (userWelcome) {
      userWelcome.textContent = hasUser ? `Hallo, ${displayName}!` : '';
      userWelcome.hidden = !hasUser;
    }
  };

  const applyState = (user) => {
    updateVisibility(user);
    updateUserSummary(user);
  };

  toggleForms(authView, 'login');

  if (authView) {
    authView.querySelectorAll('[data-auth-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        setMessage(messageElement, '', '');
        toggleForms(authView, button.dataset.authToggle);
      });
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const submitButton = loginForm.querySelector('button[type="submit"]');
      submitButton?.setAttribute('disabled', 'disabled');
      setMessage(messageElement, '', '');
      const formData = new FormData(loginForm);
      const email = formData.get('email');
      const password = formData.get('password');
      try {
        const user = login({ email, password });
        loginForm.reset();
        setMessage(messageElement, 'success', `Willkommen zurück, ${getDisplayName(user)}!`);
      } catch (error) {
        console.error(error);
        setMessage(messageElement, 'error', error.message || 'Die Anmeldung ist fehlgeschlagen.');
      } finally {
        submitButton?.removeAttribute('disabled');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const submitButton = registerForm.querySelector('button[type="submit"]');
      submitButton?.setAttribute('disabled', 'disabled');
      setMessage(messageElement, '', '');
      const formData = new FormData(registerForm);
      const name = formData.get('name');
      const email = formData.get('email');
      const password = formData.get('password');
      const confirmPassword = formData.get('confirmPassword');
      if (password !== confirmPassword) {
        setMessage(messageElement, 'error', 'Die Passwörter stimmen nicht überein.');
        submitButton?.removeAttribute('disabled');
        return;
      }
      try {
        const user = register({ name, email, password });
        registerForm.reset();
        setMessage(messageElement, 'success', `Schön, dass du da bist, ${getDisplayName(user)}!`);
      } catch (error) {
        console.error(error);
        setMessage(messageElement, 'error', error.message || 'Die Registrierung ist fehlgeschlagen.');
      } finally {
        submitButton?.removeAttribute('disabled');
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      logout();
      setMessage(messageElement, 'info', 'Du wurdest abgemeldet.');
      toggleForms(authView, 'login');
    });
  }

  const handleGoogleError = (error) => {
    if (error) {
      console.warn('Google Sign-In konnte nicht initialisiert werden.', error);
    }
    if (!googleContainer) {
      return;
    }
    const fallbackButton = document.createElement('button');
    fallbackButton.type = 'button';
    fallbackButton.className = 'button button--ghost button--full';
    fallbackButton.textContent = 'Google Sign-In konfigurieren';
    fallbackButton.addEventListener('click', () => {
      setMessage(
        messageElement,
        'info',
        'Hinterlege eine gültige Client-ID im data-client-id Attribut, um Google Sign-In zu aktivieren.',
      );
    });
    googleContainer.innerHTML = '';
    googleContainer.appendChild(fallbackButton);
  };

  if (googleContainer) {
    const clientId = googleContainer.dataset.clientId;
    initializeGoogleSignIn({
      container: googleContainer,
      clientId,
      onCredential: (credential) => {
        try {
          const profile = extractProfileFromCredential(credential);
          const user = loginWithGoogleProfile(profile);
          setMessage(messageElement, 'success', `Erfolgreich mit Google angemeldet, ${getDisplayName(user)}!`);
        } catch (error) {
          console.error(error);
          setMessage(
            messageElement,
            'error',
            error.message || 'Die Google-Anmeldung konnte nicht abgeschlossen werden.',
          );
        }
      },
      onError: handleGoogleError,
    }).then((result) => {
      if (!result.available) {
        handleGoogleError(result.error);
      }
    });
  }

  let lastUserId = null;
  const emitLifecycleEvents = (user) => {
    const currentId = user?.id ?? null;
    if (currentId && currentId !== lastUserId) {
      onAuthenticated?.(user);
    }
    if (!currentId && lastUserId) {
      onLogout?.();
    }
    lastUserId = currentId;
  };

  const unsubscribe = subscribe((user) => {
    applyState(user);
    emitLifecycleEvents(user);
    if (!user) {
      toggleForms(authView, 'login');
    }
  });

  const initialUser = getCurrentUser();
  applyState(initialUser);
  if (initialUser) {
    lastUserId = initialUser.id;
    onAuthenticated?.(initialUser);
  } else {
    toggleForms(authView, 'login');
  }

  return () => {
    unsubscribe();
  };
};

export { setupAuth };

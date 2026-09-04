import { supabase } from './SupabaseClient';

const STORAGE_KEY = 'comms-vault-notification-settings';
const PUSH_REGISTERED_KEY = 'comms-vault-push-registered';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

const DEFAULT_SETTINGS = {
  enabled: false,
  recipeUpdates: true,
  chatAlerts: true,
  sound: false,
  push: false
};

const RECIPE_NOTIFICATIONS = [
  {
    title: 'New recipe released',
    body: 'A fresh recipe is available to explore.'
  },
  {
    title: 'Fresh recipe available',
    body: 'Discover something new for your next meal.'
  },
  {
    title: "Today's featured recipe",
    body: 'A new recipe has been selected for you.'
  },
  {
    title: 'Recipe update',
    body: 'There is something new in the recipe collection.'
  }
];

class NotificationService {
  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        return { ...DEFAULT_SETTINGS };
      }

      const parsed = JSON.parse(stored);

      return {
        ...DEFAULT_SETTINGS,
        ...parsed
      };
    } catch (error) {
      console.warn('[Notifications] Failed to load settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn('[Notifications] Failed to save settings:', error);
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(updates = {}) {
    this.settings = {
      ...this.settings,
      ...updates
    };

    this.saveSettings();

    return this.getSettings();
  }

  isSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  isPushSupported() {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      Boolean(VAPID_PUBLIC_KEY) &&
      Boolean(BACKEND_URL)
    );
  }

  getPermission() {
    if (!this.isSupported()) {
      return 'unsupported';
    }

    return Notification.permission;
  }

  async requestPermission() {
    if (!this.isSupported()) {
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      return 'denied';
    }

    try {
      return await Notification.requestPermission();
    } catch (error) {
      console.warn('[Notifications] Permission request failed:', error);
      return 'denied';
    }
  }

  async enable() {
    const permission = await this.requestPermission();

    if (permission !== 'granted') {
      this.settings.enabled = false;
      this.saveSettings();
      return false;
    }

    this.settings.enabled = true;
    this.saveSettings();

    return true;
  }

  disable() {
    this.settings.enabled = false;
    this.settings.push = false;
    this.saveSettings();
    return true;
  }

  isPushRegistered() {
    try {
      return localStorage.getItem(PUSH_REGISTERED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  async enablePush() {
    if (!this.isPushSupported()) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: VAPID_PUBLIC_KEY
        });
      }

      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;

      if (!token) {
        return false;
      }

      const response = await fetch(`${BACKEND_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys
        })
      });

      if (!response.ok) {
        return false;
      }

      try {
        localStorage.setItem(PUSH_REGISTERED_KEY, 'true');
      } catch {
        // Ignore storage errors.
      }

      return true;
    } catch (error) {
      console.warn('[Notifications] Web Push registration failed:', error);
      return false;
    }
  }

  async disablePush() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();

        if (registration) {
          const subscription = await registration.pushManager.getSubscription();

          if (subscription && BACKEND_URL) {
            const session = await supabase.auth.getSession();
            const token = session?.data?.session?.access_token;

            if (token) {
              fetch(`${BACKEND_URL}/api/push/unsubscribe`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ endpoint: subscription.endpoint })
              }).catch(() => {});
            }
          }

          if (subscription) {
            await subscription.unsubscribe();
          }
        }
      }
    } catch (error) {
      console.warn('[Notifications] Web Push disable failed:', error);
    }

    try {
      localStorage.removeItem(PUSH_REGISTERED_KEY);
    } catch {
      // Ignore storage errors.
    }

    return true;
  }

  notify({ title, body, tag = 'comms-vault' }) {
    if (!this.settings.enabled) {
      return false;
    }

    if (!this.isSupported()) {
      return false;
    }

    if (Notification.permission !== 'granted') {
      return false;
    }

    try {
      const notification = new Notification(title, {
        body,
        tag,
        renotify: false,
        silent: !this.settings.sound
      });

      notification.onclick = () => {
        try {
          window.focus();
        } catch {
          // Ignore focus errors.
        }
        notification.close();
      };

      return true;
    } catch (error) {
      console.warn('[Notifications] Failed to display notification:', error);
      return false;
    }
  }

  notifyRecipeUpdate() {
    if (!this.settings.recipeUpdates) {
      return false;
    }

    const index = Math.floor(Math.random() * RECIPE_NOTIFICATIONS.length);
    const notification = RECIPE_NOTIFICATIONS[index];

    return this.notify({
      title: notification.title,
      body: notification.body,
      tag: 'recipe-update'
    });
  }

  notifyChatActivity() {
    if (!this.settings.chatAlerts) {
      return false;
    }

    return this.notify({
      title: 'New recipe released',
      body: 'A fresh recipe is available to explore.',
      tag: 'recipe-update'
    });
  }

  async notifyTestPush() {
    if (!this.isPushSupported() || !this.isPushRegistered()) {
      return false;
    }

    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token;

    if (!token) {
      return false;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/push/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });

      return response.ok;
    } catch (error) {
      console.warn('[Notifications] Test push failed:', error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
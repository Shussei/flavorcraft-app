const STORAGE_KEY =
    'comms-vault-notification-settings';

const DEFAULT_SETTINGS = {
    enabled: false,
    recipeUpdates: true,
    chatAlerts: true,
    sound: false
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

    /*
     * ----------------------------------------------------------
     * SETTINGS
     * ----------------------------------------------------------
     */

    loadSettings() {
        try {
            const stored =
                localStorage.getItem(
                    STORAGE_KEY
                );

            if (!stored) {
                return {
                    ...DEFAULT_SETTINGS
                };
            }

            const parsed =
                JSON.parse(stored);

            return {
                ...DEFAULT_SETTINGS,
                ...parsed
            };
        } catch (error) {
            console.warn(
                '[Notifications] Failed to load settings:',
                error
            );

            return {
                ...DEFAULT_SETTINGS
            };
        }
    }

    saveSettings() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(
                    this.settings
                )
            );
        } catch (error) {
            console.warn(
                '[Notifications] Failed to save settings:',
                error
            );
        }
    }

    getSettings() {
        return {
            ...this.settings
        };
    }

    updateSettings(
        updates = {}
    ) {
        this.settings = {
            ...this.settings,
            ...updates
        };

        this.saveSettings();

        return this.getSettings();
    }

    /*
     * ----------------------------------------------------------
     * BROWSER SUPPORT
     * ----------------------------------------------------------
     */

    isSupported() {
        return (
            typeof window !==
            'undefined' &&
            'Notification' in window
        );
    }

    getPermission() {
        if (!this.isSupported()) {
            return 'unsupported';
        }

        return Notification.permission;
    }

    /*
     * ----------------------------------------------------------
     * PERMISSION
     * ----------------------------------------------------------
     */

    async requestPermission() {
        if (!this.isSupported()) {
            return 'unsupported';
        }

        if (
            Notification.permission ===
            'granted'
        ) {
            return 'granted';
        }

        if (
            Notification.permission ===
            'denied'
        ) {
            return 'denied';
        }

        try {
            return await Notification.requestPermission();
        } catch (error) {
            console.warn(
                '[Notifications] Permission request failed:',
                error
            );

            return 'denied';
        }
    }

    /*
     * ----------------------------------------------------------
     * ENABLE / DISABLE
     * ----------------------------------------------------------
     */

    async enable() {
        const permission =
            await this.requestPermission();

        if (
            permission !== 'granted'
        ) {
            this.settings.enabled =
                false;

            this.saveSettings();

            return false;
        }

        this.settings.enabled =
            true;

        this.saveSettings();

        return true;
    }

    disable() {
        this.settings.enabled =
            false;

        this.saveSettings();

        return true;
    }

    /*
     * ----------------------------------------------------------
     * GENERIC NOTIFICATION
     * ----------------------------------------------------------
     *
     * IMPORTANT:
     *
     * Notification content is intentionally generic.
     *
     * Do not pass chat plaintext into this method.
     */

    notify({
        title,
        body,
        tag = 'comms-vault'
    }) {
        if (
            !this.settings.enabled
        ) {
            return false;
        }

        if (
            !this.isSupported()
        ) {
            return false;
        }

        if (
            Notification.permission !==
            'granted'
        ) {
            return false;
        }

        try {
            const notification =
                new Notification(
                    title,
                    {
                        body,
                        tag,
                        renotify: false,
                        silent:
                            !this.settings.sound
                    }
                );

            notification.onclick =
                () => {
                    try {
                        window.focus();
                    } catch {
                        // Ignore focus errors.
                    }

                    notification.close();
                };

            return true;
        } catch (error) {
            console.warn(
                '[Notifications] Failed to display notification:',
                error
            );

            return false;
        }
    }

    /*
     * ----------------------------------------------------------
     * RECIPE-STYLE NOTIFICATION
     * ----------------------------------------------------------
     */

    notifyRecipeUpdate() {
        if (
            !this.settings.recipeUpdates
        ) {
            return false;
        }

        const index =
            Math.floor(
                Math.random() *
                RECIPE_NOTIFICATIONS.length
            );

        const notification =
            RECIPE_NOTIFICATIONS[index];

        return this.notify({
            title:
                notification.title,

            body:
                notification.body,

            tag:
                'recipe-update'
        });
    }

    /*
     * ----------------------------------------------------------
     * GENERIC CHAT ALERT
     * ----------------------------------------------------------
     *
     * This deliberately does NOT reveal:
     *
     *     - message contents
     *     - sender
     *     - partner name
     *     - pair code
     *
     * The OS notification therefore contains no
     * sensitive message data.
     */

    notifyChatActivity() {
        if (
            !this.settings.chatAlerts
        ) {
            return false;
        }

        return this.notify({
            title:
                'New recipe released',

            body:
                'A fresh recipe is available to explore.',

            tag:
                'recipe-update'
        });
    }
}

export const notificationService =
    new NotificationService();